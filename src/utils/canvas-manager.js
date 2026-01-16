import * as fabric from 'fabric'
import { initAligningGuidelines } from './aligning-guidelines'
import settings from '@/config/settings'

/**
 * 画布管理器
 * 封装 Fabric.js 的核心操作，包括初始化、事件监听、历史记录管理等
 */
export class CanvasManager {
  /**
   * 构造函数
   * @param {HTMLCanvasElement} canvasElement - Canvas DOM 元素
   * @param {Object} options - 配置项
   * @param {Function} options.onChange - 画布内容变化时的回调（用于同步状态）
   * @param {Function} options.onSelection - 选中对象变化时的回调
   * @param {Function} options.onHistoryChange - 历史记录变化时的回调
   */
  constructor(canvasElement, options = {}) {
    this.canvasElement = canvasElement
    this.options = options
    this.canvas = null

    // 历史记录相关
    this.history = []
    this.historyStep = -1
    this.isHistoryProcessing = false
    this.MAX_HISTORY = settings.canvas.maxHistory

    // 剪贴板
    this._clipboard = null
    this._pasteCount = 0

    // 线条绘制状态
    this.isLineDrawingMode = false
    this.currentLineType = null
    this.drawingLineObject = null
    this.drawingStartPoint = null

    // 涂鸦组
    this.doodleGroup = null
    this.isEraserMode = false
    this.isErasing = false
    this.eraserPoints = []
    this.currentEraserPath = null

    // AI 选区相关
    this.isSelectionMode = false
    this.selectionType = null // 'smear' | 'rect' | 'lasso'
    this.selectionGroup = null
    this.isSelecting = false // 是否正在绘制选区(box/lasso)
    this.selectionPoints = [] // 圈选点集
    this.currentSelectionShape = null // 当前正在绘制的选区形状

    // 自定义光标元素
    this.cursorEl = null
  }

  /**
   * 初始化画布
   * @param {Object} config - 初始化配置
   * @param {number} config.width - 画布宽度
   * @param {number} config.height - 画布高度
   * @param {string} config.backgroundColor - 背景颜色
   * @param {HTMLImageElement} [config.image] - 初始背景图片
   */
  init({ width = settings.canvas.width, height = settings.canvas.height, backgroundColor = settings.canvas.backgroundColor, image = null }) {
    this.originalWidth = width
    this.originalHeight = height

    this.canvas = new fabric.Canvas(this.canvasElement, {
      width: width,
      height: height,
      backgroundColor: backgroundColor === 'transparent' ? null : backgroundColor,
      preserveObjectStacking: true
    })

    this._initEvents()

    // 初始化辅助对齐线
    initAligningGuidelines(this.canvas)

    // 初始化自定义光标
    this._initCursor()

    // 如果有初始图片
    if (image) {
      const imgInstance = new fabric.FabricImage(image)
      imgInstance.set({
        id: Date.now().toString(),
        name: '图片'
      })
      // 确保图片不被拉伸，保持原始大小
      imgInstance.scaleX = 1
      imgInstance.scaleY = 1

      this.canvas.add(imgInstance)
      this.canvas.setActiveObject(imgInstance)
      this.canvas.centerObject(imgInstance)
    }

    // 保存初始状态
    this.saveHistory()
    this._triggerChange()
  }

  /**
   * 销毁画布实例
   */
  dispose() {
    if (this.cursorEl && this.cursorEl.parentNode) {
      this.cursorEl.parentNode.removeChild(this.cursorEl)
      this.cursorEl = null
    }
    if (this.canvas) {
      this.canvas.dispose()
      this.canvas = null
    }
  }

  /**
   * 初始化事件监听
   * @private
   */
  _initEvents() {
    if (!this.canvas) return

    // 选区事件
    this.canvas.on('selection:created', this._handleSelection.bind(this))
    this.canvas.on('selection:updated', this._handleSelection.bind(this))
    this.canvas.on('selection:cleared', this._handleSelectionCleared.bind(this))

    // 监听路径创建事件（涂鸦或选区涂抹）
    this.canvas.on('path:created', (opt) => {
      const path = opt.path

      // 如果是选区模式下的涂抹
      if (this.isSelectionMode && this.selectionType === 'smear') {
        path.set({
          id: Date.now().toString(),
          name: 'AI选区',
          selectable: false,
          evented: false,
          stroke: 'rgba(0, 191, 255, 0.3)', // 浅蓝色
          opacity: 1
        })
        this._addToSelectionGroup(path)
        // 选区操作通常不记入常规撤销栈，或者可视需求决定。这里暂不触发 saveHistory 以免混淆图层操作
        return
      }

      path.set({
        id: Date.now().toString(),
        name: this.isEraserMode ? '橡皮擦' : '涂鸦',
        selectable: false,
        evented: false
      })

      if (this.isEraserMode) {
        // 关键：设置混合模式为 destination-out，实现擦除效果
        path.globalCompositeOperation = 'destination-out'
        // 橡皮擦路径稍微粗一点，体验更好
        path.strokeWidth = this.canvas.freeDrawingBrush.width
      }

      // 将路径添加到涂鸦组中
      this._addToDoodleGroup(path)

      this._triggerChange()
      this.saveHistory()
    })

    // 对象修改事件（用于历史记录）
    this.canvas.on('object:modified', () => this.saveHistory())

    // 对象添加事件
    this.canvas.on('object:added', () => {
      if (!this.isHistoryProcessing) {
        // 绘图模式下，由 path:created 事件负责保存历史记录，避免重复保存
        // 选区模式下的对象添加也不触发历史记录
        if (this.canvas.isDrawingMode || this.isSelectionMode) return

        this.saveHistory()
        this._triggerChange()
      }
    })

    // 对象移除事件
    this.canvas.on('object:removed', (e) => {
      if (e.target && e.target.id === 'doodle-group') {
        this.doodleGroup = null
      }
      if (e.target && e.target.id === 'selection-group') {
        this.selectionGroup = null
      }

      if (!this.isHistoryProcessing && !this.isSelectionMode) {
        this.saveHistory()
        this._triggerChange()
      }
    })

    // 实时同步事件（使用 requestAnimationFrame 节流）
    let rafId = null
    const throttleTriggerChange = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        this._triggerChange()
        rafId = null
      })
    }

    this.canvas.on('object:moving', throttleTriggerChange)
    this.canvas.on('object:scaling', throttleTriggerChange)
    this.canvas.on('object:rotating', throttleTriggerChange)

    // 文本编辑事件
    this.canvas.on('text:editing:exited', () => this._triggerChange())
    this.canvas.on('text:changed', () => this._triggerChange())

    // 鼠标事件（用于线条绘制、橡皮擦、AI选区）
    this.canvas.on('mouse:down', this._handleMouseDown.bind(this))
    this.canvas.on('mouse:move', this._handleMouseMove.bind(this))
    this.canvas.on('mouse:up', this._handleMouseUp.bind(this))

    // 监听鼠标移出/移入画布，控制光标显示
    this.canvas.on('mouse:out', () => {
      if (this.cursorEl) this.cursorEl.style.display = 'none'
    })
    this.canvas.on('mouse:over', () => {
      if (this._shouldShowCursor()) {
        this.cursorEl.style.display = 'block'
      }
    })

    // 监听缩放，更新光标大小
    this.canvas.on('mouse:wheel', () => {
      this._updateCursorSize()
    })
  }

  /**
   * 初始化自定义光标 DOM
   * @private
   */
  _initCursor() {
    if (this.cursorEl) return

    this.cursorEl = document.createElement('div')
    this.cursorEl.style.position = 'absolute'
    this.cursorEl.style.pointerEvents = 'none'
    this.cursorEl.style.border = '1px solid #000' // 黑色边框
    this.cursorEl.style.borderRadius = '50%'
    this.cursorEl.style.transform = 'translate(-50%, -50%)'
    this.cursorEl.style.display = 'none'
    this.cursorEl.style.zIndex = '9999'
    this.cursorEl.style.boxShadow = '0 0 2px rgba(255, 255, 255, 0.8)' // 白色发光，确保深色背景可见

    // 将光标元素添加到 canvas 的父容器中
    // 注意：这要求 canvasElement 有一个相对定位的父容器
    const canvasContainer = this.canvasElement.parentNode
    if (canvasContainer) {
      // 确保父容器有定位上下文，如果没有则加上
      const computedStyle = window.getComputedStyle(canvasContainer)
      if (computedStyle.position === 'static') {
        canvasContainer.style.position = 'relative'
      }
      canvasContainer.appendChild(this.cursorEl)
    }
  }

  /**
   * 判断是否应该显示自定义光标
   * @private
   */
  _shouldShowCursor() {
    // 只有在画笔模式、橡皮擦模式、或AI选区的涂抹模式下才显示
    if (this.isSelectionMode && this.selectionType === 'smear') return true
    return this.isEraserMode || (this.canvas && this.canvas.isDrawingMode)
  }

  /**
   * 更新光标大小
   * @private
   */
  _updateCursorSize() {
    if (!this.cursorEl || !this.canvas || !this.canvas.freeDrawingBrush) return

    const zoom = this.canvas.getZoom()
    const brushWidth = this.canvas.freeDrawingBrush.width || 1
    // 光标大小 = 笔刷宽度 * 缩放比例
    const size = brushWidth * zoom

    this.cursorEl.style.width = `${size}px`
    this.cursorEl.style.height = `${size}px`
  }

  /**
   * 更新光标位置
   * @private
   * @param {number} x - 客户端 X 坐标 (相对于视口)
   * @param {number} y - 客户端 Y 坐标 (相对于视口)
   */
  _updateCursorPosition(x, y) {
    if (!this.cursorEl || !this.canvasElement) return

    // 获取 canvas 容器的边界矩形
    const rect = this.canvasElement.getBoundingClientRect()

    // 计算相对于 canvas 容器的坐标
    const left = x - rect.left
    const top = y - rect.top

    this.cursorEl.style.left = `${left}px`
    this.cursorEl.style.top = `${top}px`
  }

  /**
   * 处理选区变化
   * @private
   */
  _handleSelection(e) {
    const selected = e.selected[0]
    if (selected) {
      if (!selected.id) {
        selected.id = Date.now().toString()
      }
      if (this.options.onSelection) {
        this.options.onSelection(selected.id)
      }
    }
  }

  /**
   * 处理选区清除
   * @private
   */
  _handleSelectionCleared() {
    if (this.options.onSelection) {
      this.options.onSelection(null)
    }
  }

  /**
   * 触发变更回调
   * @private
   */
  _triggerChange() {
    if (this.options.onChange && this.canvas) {
      this.options.onChange(this.canvas.getObjects())
    }
  }

  /**
   * 触发历史记录变更回调
   * @private
   */
  _triggerHistoryChange() {
    if (this.options.onHistoryChange) {
      this.options.onHistoryChange({
        length: this.history.length,
        step: this.historyStep
      })
    }
  }

  /**
   * 保存历史记录
   */
  saveHistory() {
    if (this.isHistoryProcessing || !this.canvas) return

    // 如果当前处于历史记录中间，删除后面的记录
    if (this.historyStep < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyStep + 1)
    }

    const json = JSON.stringify(this.canvas.toJSON(['id', 'name']))
    this.history.push(json)
    this.historyStep++

    // 限制历史记录长度
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift()
      this.historyStep--
    }

    this._triggerHistoryChange()
  }

  /**
   * 撤销
   */
  async undo() {
    if (this.historyStep <= 0) return

    this.isHistoryProcessing = true
    this.historyStep--
    const json = this.history[this.historyStep]

    await this._loadCanvasState(json)
    this.isHistoryProcessing = false
    this._triggerChange()
    this._triggerHistoryChange()
  }

  /**
   * 重做
   */
  async redo() {
    if (this.historyStep >= this.history.length - 1) return

    this.isHistoryProcessing = true
    this.historyStep++
    const json = this.history[this.historyStep]

    await this._loadCanvasState(json)
    this.isHistoryProcessing = false
    this._triggerChange()
    this._triggerHistoryChange()
  }

  /**
   * 复制当前选中对象
   */
  async copy() {
    if (!this.canvas) return
    const activeObject = this.canvas.getActiveObject()
    if (activeObject) {
      const cloned = await activeObject.clone()
      this._clipboard = cloned
      this._pasteCount = 0
    }
  }

  /**
   * 粘贴对象
   */
  async paste() {
    if (!this.canvas || !this._clipboard) return

    const clonedObj = await this._clipboard.clone()
    this.canvas.discardActiveObject()

    this._pasteCount++
    const offset = this._pasteCount * 20

    clonedObj.set({
      left: clonedObj.left + offset,
      top: clonedObj.top + offset,
      evented: true
    })

    if (clonedObj.type === 'activeSelection') {
      // 活跃选区需要特殊处理：将内部对象分别添加到画布
      clonedObj.canvas = this.canvas
      clonedObj.forEachObject((obj) => {
        obj.id = Date.now().toString() + Math.random().toString(36).substr(2, 5)
        this.canvas.add(obj)
      })
      // 需要重新设置坐标
      clonedObj.setCoords()
    } else {
      clonedObj.id = Date.now().toString()
      this.canvas.add(clonedObj)
    }

    this.canvas.setActiveObject(clonedObj)
    this.canvas.requestRenderAll()
    this._triggerChange()
    this.saveHistory()
  }

  /**
   * 加载画布状态
   * @private
   * @param {string} json - JSON 字符串
   */
  async _loadCanvasState(json) {
    if (!this.canvas) return

    // 重置引用
    this.doodleGroup = null
    this.selectionGroup = null

    // 记录当前选中的对象 ID
    const activeObject = this.canvas.getActiveObject()
    const currentActiveId = activeObject ? activeObject.id : null

    await this.canvas.loadFromJSON(JSON.parse(json))

    // 确保所有对象都有 ID 和名称
    this.canvas.getObjects().forEach((obj) => {
      if (!obj.id) obj.id = Math.random().toString(36).substr(2, 9)
      if (!obj.name) obj.name = this._getObjectName(obj)
    })

    this.canvas.requestRenderAll()

    // 尝试恢复选中状态
    if (currentActiveId) {
      const objectToSelect = this.canvas.getObjects().find((obj) => obj.id === currentActiveId)
      if (objectToSelect) {
        this.canvas.setActiveObject(objectToSelect)
      } else {
        this.canvas.discardActiveObject()
        if (this.options.onSelection) {
          this.options.onSelection(null)
        }
      }
    }
  }

  /**
   * 获取对象名称
   * @private
   * @param {fabric.Object} obj - Fabric 对象
   * @returns {string} 对象名称
   */
  _getObjectName(obj) {
    if (obj.name) return obj.name

    const typeNameMap = {
      rect: '矩形',
      circle: '圆形',
      triangle: '三角形',
      path: '涂鸦',
      'i-text': '文本',
      image: '图片'
    }

    const strategies = {
      line: (o) => (o.strokeDashArray && o.strokeDashArray.length > 0 ? '虚线' : '直线'),
      group: (o) => {
        const subObjects = o.getObjects ? o.getObjects() : []
        const hasTriangle = subObjects.some((sub) => sub.type === 'triangle')
        const hasLine = subObjects.some((sub) => sub.type === 'line')
        return hasTriangle && hasLine ? '箭头' : '组合'
      }
    }

    if (strategies[obj.type]) {
      return strategies[obj.type](obj)
    }

    return typeNameMap[obj.type] || '未知图层'
  }

  /**
   * 添加文本对象
   */
  addText(options = {}) {
    this.setDrawingMode(false)
    // 确保退出选区模式
    this.endSelection()

    const zoom = this.canvas.getZoom()
    const { defaultText, fontFamily, fill, fontSize: defaultFontSize } = settings.objectDefaults.text

    // 使用传入的选项或默认值
    const textContent = options.text || defaultText
    const fontSize = Math.round((options.fontSize || defaultFontSize) / zoom)
    const fontWeight = options.fontWeight || 'normal'

    const text = new fabric.IText(textContent, {
      fontFamily,
      fill,
      fontSize: fontSize,
      fontWeight: fontWeight,
      id: Date.now().toString(),
      name: '文本'
    })
    this.canvas.add(text)
    this.canvas.centerObject(text)
    this.canvas.setActiveObject(text)
    this._triggerChange()
    this.saveHistory()
  }

  /**
   * 开启/关闭绘图模式
   * @param {boolean} enabled - 是否开启
   * @param {Object} options - 笔刷配置
   */
  setDrawingMode(enabled, options = {}) {
    if (!this.canvas) return
    this.canvas.isDrawingMode = enabled

    if (enabled) {
      if (!this.canvas.freeDrawingBrush) {
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas)
      }

      this.setBrush(options)
    } else {
      // 关闭绘图模式时，清理橡皮擦状态
      this._exitEraserMode()
    }
  }

  /**
   * 退出橡皮擦模式的清理工作
   * @private
   */
  _exitEraserMode() {
    this.isEraserMode = false
    this.isErasing = false
    this.currentEraserPath = null
    this.eraserPoints = []

    if (this.cursorEl) {
      this.cursorEl.style.display = 'none'
    }

    if (this.canvas) {
      this.canvas.defaultCursor = 'default'
      // 恢复对象可选性
      this.canvas.getObjects().forEach((obj) => {
        if (!obj.lockMovementX) {
          obj.selectable = true
        }
      })
      this.canvas.selection = true
    }
  }

  /**
   * 设置笔刷属性
   * @param {Object} options - 笔刷配置
   */
  setBrush(options = {}) {
    if (!this.canvas || !this.canvas.freeDrawingBrush) return

    if (options.isEraser !== undefined) {
      this.isEraserMode = options.isEraser
    }

    // 设置笔刷宽度
    if (options.width) {
      this.canvas.freeDrawingBrush.width = options.width
    }

    // 设置颜色
    if (options.color) {
      this.canvas.freeDrawingBrush.color = options.color
    }

    if (this.isSelectionMode && this.selectionType === 'smear') {
      this.isEraserMode = false
      this.canvas.isDrawingMode = true
      this.canvas.defaultCursor = 'crosshair'
      this.canvas.selection = false
      this.canvas.getObjects().forEach((obj) => {
        obj.selectable = false
      })
      this._updateCursorSize()
      return
    }

    // 橡皮擦模式处理
    if (this.isEraserMode) {
      this.canvas.isDrawingMode = false
      this.canvas.defaultCursor = 'crosshair'
      this.canvas.selection = false
      this.canvas.getObjects().forEach((obj) => {
        obj.selectable = false
      })
    } else {
      this.canvas.isDrawingMode = true
      this.canvas.defaultCursor = 'default'
      this.canvas.selection = true
    }

    // 更新自定义光标大小
    this._updateCursorSize()
  }

  /**
   * 开启线条绘制模式
   */
  startLineDrawing(type) {
    if (!this.canvas) return
    this.setDrawingMode(false)
    this.endSelection()

    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()

    this.isLineDrawingMode = true
    this.currentLineType = type
    this.canvas.defaultCursor = 'crosshair'
    this.canvas.selection = false // 禁用框选

    // 确保对象不可选
    this.canvas.getObjects().forEach((obj) => {
      obj.selectable = false
    })
  }

  /**
   * 结束线条绘制模式
   */
  endLineDrawing() {
    this.isLineDrawingMode = false
    this.currentLineType = null
    this.drawingLineObject = null
    this.drawingStartPoint = null

    if (this.canvas) {
      this.canvas.defaultCursor = 'default'
      this.canvas.selection = true

      // 恢复对象可选性 (除了锁定的)
      this.canvas.getObjects().forEach((obj) => {
        if (!obj.lockMovementX) {
          obj.selectable = true
        }
      })
    }
  }

  /**
   * 确保涂鸦组存在
   * @private
   */
  _ensureDoodleGroup() {
    if (!this.canvas) return

    // 尝试在画布上查找已存在的涂鸦组
    if (!this.doodleGroup) {
      const existingGroup = this.canvas.getObjects().find((obj) => obj.id === 'doodle-group')
      if (existingGroup) {
        this.doodleGroup = existingGroup
      }
    }

    // 如果还是没有，创建新的
    if (!this.doodleGroup) {
      this.doodleGroup = new fabric.Group([], {
        id: 'doodle-group',
        name: '涂鸦图层',
        selectable: true,
        evented: true,
        objectCaching: true
      })
      this.canvas.add(this.doodleGroup)
    }
  }

  /**
   * 将路径添加到涂鸦组
   * @param {fabric.Path} path
   */
  _addToDoodleGroup(path) {
    this._ensureDoodleGroup()

    if (!this.doodleGroup || !this.canvas) return

    // 从画布移除路径
    this.canvas.remove(path)

    // Fabric.js v6/v7 中使用 add() 方法
    this.doodleGroup.add(path)

    // 确保组被标记为脏，以便重新渲染缓存
    this.doodleGroup.set('dirty', true)

    this.canvas.requestRenderAll()
  }

  /**
   * 确保选区组存在
   * @private
   */
  _ensureSelectionGroup() {
    if (!this.canvas) return

    if (!this.selectionGroup) {
      const existingGroup = this.canvas.getObjects().find((obj) => obj.id === 'selection-group')
      if (existingGroup) {
        this.selectionGroup = existingGroup
      }
    }
  }

  /**
   * 将对象添加到选区组
   * @private
   */
  _addToSelectionGroup(object) {
    this._markAiSelectionObject(object)
  }

  _markAiSelectionObject(object) {
    if (!this.canvas || !object) return

    object.set({
      selectable: false,
      evented: false,
      name: 'AI选区'
    })
    object.isAiSelection = true
    this.canvas.moveObjectTo(object, this.canvas.getObjects().length - 1)
    this.canvas.requestRenderAll()
  }

  _getScenePointer(o) {
    if (!this.canvas) return null
    if (o?.scenePoint) return o.scenePoint
    if (o?.pointer) return o.pointer
    if (o?.absolutePointer) {
      const vpt = this.canvas.viewportTransform
      if (!vpt) return o.absolutePointer
      return fabric.util.transformPoint(o.absolutePointer, fabric.util.invertTransform(vpt))
    }
    return this.canvas.getPointer(o.e)
  }

  /**
   * 处理鼠标按下
   * @private
   */
  _handleMouseDown(o) {
    if (!this.canvas) return

    // 优先级：橡皮擦 > AI选区 > 线条绘制
    if (this.isEraserMode) {
      this._handleEraserMouseDown(o)
      return
    }

    if (this.isSelectionMode) {
      this._handleSelectionMouseDown(o)
      return
    }

    if (this.isLineDrawingMode) {
      this._handleLineMouseDown(o)
      return
    }
  }

  _handleLineMouseDown(o) {
    // Fabric 6.x 使用 scenePoint 获取坐标
    const pointer = this._getScenePointer(o)
    this.drawingStartPoint = pointer
    const points = [pointer.x, pointer.y, pointer.x, pointer.y]
    const id = Date.now().toString()

    const commonOptions = {
      id,
      stroke: '#000000',
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false
    }

    if (this.currentLineType === 'line') {
      this.drawingLineObject = new fabric.Line(points, commonOptions)
    } else if (this.currentLineType === 'dashed') {
      this.drawingLineObject = new fabric.Line(points, {
        ...commonOptions,
        strokeDashArray: [10, 5]
      })
    } else if (this.currentLineType === 'arrow') {
      this.drawingLineObject = new fabric.Line(points, commonOptions)
    }

    if (this.drawingLineObject) {
      this.canvas.add(this.drawingLineObject)
    }
  }

  _handleSelectionMouseDown(o) {
    if (this.selectionType === 'smear') return // Smear handled by freeDrawingBrush

    this.isSelecting = true
    const pointer = this._getScenePointer(o)
    this.drawingStartPoint = pointer

    if (this.selectionType === 'rect') {
      this.currentSelectionShape = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        originX: 'left',
        originY: 'top',
        width: 0,
        height: 0,
        fill: 'rgba(0, 191, 255, 0.3)',
        stroke: null,
        selectable: false,
        evented: false,
        id: Date.now().toString()
      })
      this.canvas.add(this.currentSelectionShape)
    } else if (this.selectionType === 'lasso') {
      this.selectionPoints = [{ x: pointer.x, y: pointer.y }]
      if (this.currentSelectionShape) this.canvas.remove(this.currentSelectionShape)
      const outline = new fabric.Polyline(this.selectionPoints, {
        fill: null,
        stroke: '#000000',
        strokeWidth: 2,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: false,
        evented: false,
        objectCaching: false
      })
      const line = new fabric.Polyline(this.selectionPoints, {
        fill: null,
        stroke: '#ffffff',
        strokeWidth: 1,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: false,
        evented: false,
        objectCaching: false
      })
      this.currentSelectionShape = new fabric.Group([outline, line], {
        selectable: false,
        evented: false,
        objectCaching: false
      })
      this.canvas.add(this.currentSelectionShape)
      this.canvas.moveObjectTo(this.currentSelectionShape, this.canvas.getObjects().length - 1)
    }
  }

  /**
   * 处理鼠标移动
   * @private
   */
  _handleMouseMove(o) {
    // 更新自定义光标位置
    if (this._shouldShowCursor()) {
      this.canvas.defaultCursor = 'none'
      if (this.cursorEl) {
        this.cursorEl.style.display = 'block'
        this._updateCursorPosition(o.e.clientX, o.e.clientY)
      }
    } else {
      if (this.cursorEl) this.cursorEl.style.display = 'none'
    }

    if (this.isEraserMode) {
      this._handleEraserMouseMove(o)
      return
    }

    if (this.isSelectionMode) {
      this._handleSelectionMouseMove(o)
      return
    }

    if (this.isLineDrawingMode && this.drawingLineObject && this.drawingStartPoint) {
      // Fabric 6.x 使用 scenePoint 获取坐标
      const pointer = o.scenePoint || this.canvas.getPointer(o.e)
      if (this.currentLineType === 'arrow' || this.currentLineType === 'line' || this.currentLineType === 'dashed') {
        this.drawingLineObject.set({ x2: pointer.x, y2: pointer.y })
      }
      this.canvas.requestRenderAll()
    }
  }

  _handleSelectionMouseMove(o) {
    if (!this.isSelecting) return
    const pointer = this._getScenePointer(o)

    if (this.selectionType === 'rect') {
      if (!this.currentSelectionShape) return
      const startX = this.drawingStartPoint.x
      const startY = this.drawingStartPoint.y

      this.currentSelectionShape.set({
        left: startX,
        top: startY,
        width: Math.max(0, pointer.x - startX),
        height: Math.max(0, pointer.y - startY)
      })
    } else if (this.selectionType === 'lasso') {
      this.selectionPoints.push({ x: pointer.x, y: pointer.y })
      if (!this.currentSelectionShape || this.currentSelectionShape.type !== 'group') return
      const objects = this.currentSelectionShape._objects || []
      objects.forEach((obj) => {
        if (obj.type !== 'polyline') return
        obj.set('points', this.selectionPoints)
        obj.setCoords()
        obj.set('dirty', true)
      })
      this.currentSelectionShape.setCoords()
      this.currentSelectionShape.set('dirty', true)
    }
    this.canvas.requestRenderAll()
  }

  /**
   * 处理鼠标松开
   * @private
   */
  _handleMouseUp() {
    if (this.isEraserMode) {
      this._handleEraserMouseUp()
      return
    }

    if (this.isSelectionMode) {
      this._handleSelectionMouseUp()
      return
    }

    if (this.isLineDrawingMode && this.drawingLineObject) {
      this._handleLineMouseUp()
    }
  }

  _handleLineMouseUp() {
    if (this.currentLineType === 'arrow') {
      const line = this.drawingLineObject
      this.canvas.remove(line)

      const dx = line.x2 - line.x1
      const dy = line.y2 - line.y1
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const length = Math.sqrt(dx * dx + dy * dy)

      if (length < 5) {
        this.endLineDrawing()
        return
      }

      const id = Date.now().toString()
      const center = {
        left: (line.x1 + line.x2) / 2,
        top: (line.y1 + line.y2) / 2
      }

      const arrowLine = new fabric.Line([-(length / 2), 0, length / 2, 0], {
        stroke: '#000000',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center'
      })

      const head = new fabric.Triangle({
        width: 15,
        height: 15,
        fill: '#000000',
        left: length / 2,
        top: 0,
        angle: 90,
        originX: 'center',
        originY: 'center'
      })

      const group = new fabric.Group([arrowLine, head], {
        id,
        name: '箭头',
        left: center.left,
        top: center.top,
        angle: angle,
        originX: 'center',
        originY: 'center'
      })

      this.canvas.add(group)
      this.canvas.setActiveObject(group)
    } else {
      const nameMap = {
        line: '直线',
        dashed: '虚线'
      }
      this.drawingLineObject.set({
        name: nameMap[this.currentLineType] || '线条',
        selectable: true,
        evented: true
      })
      this.drawingLineObject.setCoords()
      this.canvas.setActiveObject(this.drawingLineObject)
    }

    this._triggerChange()
    this.saveHistory()
    this.endLineDrawing()
  }

  _handleSelectionMouseUp() {
    if (this.selectionType === 'smear') return

    this.isSelecting = false

    if (this.selectionType === 'rect') {
      if (this.currentSelectionShape) {
        if (this.currentSelectionShape.width > 2 && this.currentSelectionShape.height > 2) {
          this._addToSelectionGroup(this.currentSelectionShape)
        } else {
          this.canvas.remove(this.currentSelectionShape)
        }
        this.currentSelectionShape = null
      }
    } else if (this.selectionType === 'lasso') {
      if (this.currentSelectionShape) {
        this.canvas.remove(this.currentSelectionShape)
        this.currentSelectionShape = null
      }
      if (this.selectionPoints.length > 2) {
        // 创建闭合多边形
        const polygon = new fabric.Polygon(this.selectionPoints, {
          fill: 'rgba(0, 191, 255, 0.3)',
          stroke: null,
          selectable: false,
          evented: false,
          id: Date.now().toString()
        })
        this.canvas.add(polygon)
        this._addToSelectionGroup(polygon)
      }
      this.selectionPoints = []
    }
  }

  /**
   * 处理橡皮擦鼠标按下
   * @private
   */
  _handleEraserMouseDown(o) {
    this.isErasing = true
    this._ensureDoodleGroup()
    const pointer = this._getScenePointer(o)
    this.eraserPoints = [pointer]
    this.currentEraserPath = null
  }

  /**
   * 处理橡皮擦鼠标移动
   * @private
   */
  _handleEraserMouseMove(o) {
    if (!this.isErasing) return
    const pointer = this._getScenePointer(o)
    this.eraserPoints.push(pointer)

    // 如果点太少，不处理
    if (this.eraserPoints.length < 2) return

    const pathData = this._getSvgPathFromPoints(this.eraserPoints)

    // 如果已有 path，先移除
    if (this.currentEraserPath) {
      this.doodleGroup.remove(this.currentEraserPath)
    }

    // 创建新 Path
    this.currentEraserPath = new fabric.Path(pathData, {
      fill: null,
      stroke: 'white', // 颜色不重要，destination-out 会处理
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeWidth: this.canvas.freeDrawingBrush.width || 10,
      globalCompositeOperation: 'destination-out',
      selectable: false,
      evented: false,
      name: '橡皮擦',
      id: Date.now().toString()
    })

    // 添加到 Group
    this.doodleGroup.add(this.currentEraserPath)
    this.doodleGroup.set('dirty', true)
    this.canvas.requestRenderAll()
  }

  /**
   * 处理橡皮擦鼠标松开
   * @private
   */
  _handleEraserMouseUp() {
    this.isErasing = false
    this.eraserPoints = []
    this.currentEraserPath = null
    this.saveHistory()
    this._triggerChange()
  }

  /**
   * 将点数组转换为 SVG Path 字符串
   * 使用简单的二次贝塞尔曲线平滑
   * @private
   */
  _getSvgPathFromPoints(points) {
    if (points.length < 2) return ''

    let p1 = points[0]
    let p2 = points[1]
    let path = `M ${p1.x} ${p1.y}`

    for (let i = 1; i < points.length; i++) {
      let midPoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      }
      path += ` Q ${p1.x} ${p1.y} ${midPoint.x} ${midPoint.y}`
      p1 = points[i]
      if (i < points.length - 1) p2 = points[i + 1]
    }
    path += ` L ${p1.x} ${p1.y}`
    return path
  }

  /**
   * 添加线条
   * @param {string} type - 线条类型 'line' | 'dashed' | 'arrow'
   */
  addLine(type) {
    this.startLineDrawing(type)
  }

  /**
   * 添加形状
   * @param {string} type - 形状类型 'rect' | 'circle' | 'triangle'
   */
  addShape(type) {
    this.setDrawingMode(false)
    this.endSelection()

    let shape
    const id = Date.now().toString()
    const { fill, width, height } = settings.objectDefaults.shape
    const options = {
      id,
      fill,
      width,
      height,
      left: this.canvas.width / 2,
      top: this.canvas.height / 2,
      originX: 'center',
      originY: 'center',
      hasControls: true
    }

    if (type === 'rect') {
      shape = new fabric.Rect({ ...options, name: '矩形' })
    } else if (type === 'circle') {
      // Circle uses radius instead of width/height
      shape = new fabric.Circle({
        ...options,
        name: '圆形',
        radius: 50,
        width: 100, // Fabric calculates width as radius * 2
        height: 100
      })
    } else if (type === 'triangle') {
      shape = new fabric.Triangle({ ...options, name: '三角形' })
    }

    if (shape) {
      this.canvas.add(shape)
      this.canvas.setActiveObject(shape)
      this._triggerChange()
      this.saveHistory()
    }
  }

  /**
   * 添加图片对象
   * @param {string} dataUrl - 图片 DataURL
   */
  addImage(dataUrl) {
    this.setDrawingMode(false)
    this.endSelection()

    const imgObj = new Image()
    imgObj.crossOrigin = 'anonymous'
    imgObj.src = dataUrl
    imgObj.onload = () => {
      const imgInstance = new fabric.FabricImage(imgObj)

      // 调整图片大小以适应画布
      const { maxInitialWidth } = settings.objectDefaults.image
      if (imgInstance.width > maxInitialWidth) {
        imgInstance.scaleToWidth(maxInitialWidth)
      }

      imgInstance.set({
        id: Date.now().toString(),
        name: '图片'
      })

      this.canvas.add(imgInstance)
      this.canvas.centerObject(imgInstance)
      this.canvas.setActiveObject(imgInstance)
      this._triggerChange()
      this.saveHistory()
    }
  }

  addEliminationResultImage(dataUrl) {
    if (!this.canvas) return
    this.setDrawingMode(false)
    this.endSelection()

    const imgObj = new Image()
    imgObj.crossOrigin = 'anonymous'
    imgObj.src = dataUrl
    imgObj.onload = () => {
      const imgInstance = new fabric.FabricImage(imgObj)

      const scaleX = this.originalWidth && imgInstance.width ? this.originalWidth / imgInstance.width : 1
      const scaleY = this.originalHeight && imgInstance.height ? this.originalHeight / imgInstance.height : 1

      imgInstance.set({
        id: Date.now().toString(),
        name: '图片',
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        scaleX,
        scaleY
      })

      this.canvas.add(imgInstance)
      this.canvas.setActiveObject(imgInstance)
      this._triggerChange()
      this.saveHistory()
    }
  }

  hideEliminationBaseLayer() {
    if (!this.canvas) return

    const objects = this.canvas.getObjects()
    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')

    const realLayers = objects.filter((obj) => {
      if (obj.isGuide) return false
      if (obj === selectionGroup || obj.id === 'selection-group') return false
      if (obj.isAiSelection) return false
      if (obj === this.doodleGroup || obj.id === 'doodle-group') return false
      if (obj.type === 'selection') return false
      if (obj.name === 'AI选区' || obj.name === '涂鸦图层') return false
      return true
    })

    const baseLayer = realLayers.find((obj) => obj.visible !== false)
    if (!baseLayer) return

    this.setLayerVisible(baseLayer.id, false)
  }

  /**
   * 替换选中图片的源
   * @param {string} dataUrl - 新图片 DataURL
   */
  replaceActiveImage(dataUrl) {
    const activeObject = this.canvas.getActiveObject()
    if (!activeObject || activeObject.type !== 'image') return

    const imgObj = new Image()
    imgObj.crossOrigin = 'anonymous'
    imgObj.src = dataUrl
    imgObj.onload = () => {
      activeObject.setSrc(dataUrl, () => {
        this.canvas.requestRenderAll()
        this._triggerChange()
        this.saveHistory()
      })
    }
  }

  /**
   * 设置选中对象的属性
   * @param {string} property - 属性名
   * @param {any} value - 属性值
   */
  setObjectProperty(property, value) {
    const activeObject = this.canvas.getActiveObject()
    if (!activeObject) return

    if (property === 'fontFamily' && document.fonts) {
      // 字体特殊处理
      this._handleFontFamilyChange(activeObject, value)
    } else if (property === 'locked') {
      // 锁定状态特殊处理
      const isLocked = value
      activeObject.set({
        lockMovementX: isLocked,
        lockMovementY: isLocked,
        lockRotation: isLocked,
        lockScalingX: isLocked,
        lockScalingY: isLocked,
        selectable: !isLocked
      })
    } else if (property === 'width' && (activeObject.type === 'image' || ['rect', 'circle', 'triangle'].includes(activeObject.type))) {
      activeObject.scaleToWidth(value)
    } else if (property === 'height' && (activeObject.type === 'image' || ['rect', 'circle', 'triangle'].includes(activeObject.type))) {
      activeObject.scaleToHeight(value)
    } else {
      activeObject.set(property, value)
    }

    activeObject.setCoords()
    this.canvas.requestRenderAll()
    this._triggerChange()
    this.saveHistory()
  }

  /**
   * 处理字体变更
   * @private
   */
  _handleFontFamilyChange(activeObject, fontFamily) {
    const fontString = `${activeObject.fontStyle || 'normal'} ${activeObject.fontWeight || 'normal'} ${activeObject.fontSize || 24}px "${fontFamily}"`

    document.fonts
      .load(fontString)
      .then(() => {
        activeObject.set('fontFamily', fontFamily)
        activeObject.dirty = true
        activeObject.setCoords()
        this.canvas.requestRenderAll()
        this._triggerChange()
      })
      .catch((err) => {
        console.error('字体加载失败:', err)
      })
  }

  /**
   * 设置当前选中对象
   * @param {string} id - 对象 ID
   */
  setActiveObject(id) {
    if (!this.canvas) return

    if (!id) {
      this.canvas.discardActiveObject()
      this.canvas.requestRenderAll()
      return
    }

    const activeObject = this.canvas.getActiveObject()
    if (activeObject && activeObject.id === id) return

    const objectToSelect = this.canvas.getObjects().find((obj) => obj.id === id)
    if (objectToSelect) {
      this.canvas.setActiveObject(objectToSelect)
      this.canvas.requestRenderAll()
    }
  }

  /**
   * 获取当前选中对象
   */
  getActiveObject() {
    return this.canvas ? this.canvas.getActiveObject() : null
  }

  /**
   * 删除当前选中的对象
   */
  deleteActiveObject() {
    if (!this.canvas) return
    const activeObject = this.canvas.getActiveObject()
    if (activeObject) {
      // 如果正在编辑文本，不删除
      if (activeObject.isEditing) return

      this.canvas.remove(activeObject)
      this.canvas.discardActiveObject()
      this._triggerChange()
      this.saveHistory()
    }
  }

  /**
   * 删除指定 ID 的图层
   * @param {string} id - 图层 ID
   */
  deleteLayer(id) {
    if (!this.canvas) return
    const object = this.canvas.getObjects().find((obj) => obj.id === id)
    if (object) {
      this.canvas.remove(object)
      this.canvas.discardActiveObject()
      this._triggerChange()
      this.saveHistory()
    }
  }

  /**
   * 锁定/解锁图层
   * @param {string} id - 图层 ID
   * @param {boolean} locked - 是否锁定
   */
  setLayerLocked(id, locked) {
    if (!this.canvas) return
    const object = this.canvas.getObjects().find((obj) => obj.id === id)
    if (object) {
      object.set({
        lockMovementX: locked,
        lockMovementY: locked,
        lockRotation: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        selectable: !locked
      })

      // 如果锁定了图层，取消选中状态
      if (locked) {
        this.canvas.discardActiveObject()
      }

      this.canvas.requestRenderAll()
      this._triggerChange()
      this.saveHistory()
    }
  }

  /**
   * 设置图层可见性
   * @param {string} id - 图层 ID
   * @param {boolean} visible - 是否可见
   */
  setLayerVisible(id, visible) {
    if (!this.canvas) return
    const object = this.canvas.getObjects().find((obj) => obj.id === id)
    if (object) {
      object.set('visible', visible)
      this.canvas.requestRenderAll()
      this._triggerChange()
      this.saveHistory()
    }
  }

  /**
   * 重新排序图层
   * @param {Array} newLayerIds - 新的图层 ID 列表（从上到下）
   */
  reorderLayers(newLayerIds) {
    if (!this.canvas) return

    // newLayerIds 是 UI 上的顺序 (Top -> Bottom)
    // 我们需要将其反转为 Fabric.js 的顺序 (Bottom -> Top)
    const desiredOrderIds = [...newLayerIds].reverse()

    desiredOrderIds.forEach((id, index) => {
      const object = this.canvas.getObjects().find((obj) => obj.id === id)
      if (object) {
        this.canvas.moveObjectTo(object, index)
      }
    })

    this.canvas.requestRenderAll()
    this._triggerChange()
    this.saveHistory()
  }

  /**
   * 导出为 DataURL
   * @param {Object} options - 导出配置
   */
  toDataURL(options = settings.export) {
    if (!this.canvas) return ''

    // 取消选中状态，避免导出选中框
    this.canvas.discardActiveObject()

    // 临时隐藏参考线、选区组
    const objects = this.canvas.getObjects()
    const hiddenObjects = []

    objects.forEach((obj) => {
      if (obj.isGuide || obj.id === 'selection-group') {
        if (obj.visible) {
          hiddenObjects.push({ obj, visible: true })
          obj.visible = false
        }
      }
    })

    this.canvas.requestRenderAll()

    let dataUrl = ''
    try {
      dataUrl = this.canvas.toDataURL(options)
    } finally {
      hiddenObjects.forEach((item) => {
        item.obj.visible = item.visible
      })
      this.canvas.requestRenderAll()
    }

    return dataUrl
  }

  /**
   * 设置画布缩放
   * @param {number} zoom - 缩放比例 (0.1-5)
   */
  setZoom(zoom) {
    if (!this.canvas) return

    // 限制缩放范围
    if (zoom < 0.1) zoom = 0.1
    if (zoom > 5) zoom = 5

    // 调整画布物理大小
    this.canvas.setDimensions({
      width: this.originalWidth * zoom,
      height: this.originalHeight * zoom
    })

    // 设置缩放并重置平移
    this.canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0])
    this.canvas.requestRenderAll()
  }

  /**
   * 添加参考线
   * @param {string} orientation - 'horizontal' | 'vertical'
   */
  addGuide(orientation) {
    if (!this.canvas) return

    // 使用原始设计尺寸计算中心（逻辑坐标）
    const centerX = this.originalWidth / 2
    const centerY = this.originalHeight / 2

    // 长度设置为足够大
    const length = Math.max(this.originalWidth, this.originalHeight) * 5

    let points = []
    let options = {
      ...settings.guide,
      selectable: true,
      evented: true,
      lockRotation: true,
      hasControls: false,
      hasBorders: false,
      id: Date.now().toString(),
      isGuide: true,
      originX: 'center',
      originY: 'center'
    }

    if (orientation === 'horizontal') {
      points = [-length, 0, length, 0]
      options.left = centerX
      options.top = centerY
      options.lockMovementX = true
      options.hoverCursor = 'ns-resize'
    } else {
      points = [0, -length, 0, length]
      options.left = centerX
      options.top = centerY
      options.lockMovementY = true
      options.hoverCursor = 'ew-resize'
    }

    const line = new fabric.Line(points, options)

    this.canvas.add(line)
    this.canvas.setActiveObject(line)
    this.canvas.requestRenderAll()

    // 参考线不触发 onChange (不作为图层显示)，但保存历史记录
    this.saveHistory()
  }

  /**
   * 切换水印显示
   * @param {boolean} show - 是否显示
   * @param {string} text - 水印文字
   */
  async toggleWatermark(show, text = settings.watermark.defaultText) {
    if (!this.canvas) return

    if (!show) {
      this.canvas.overlayImage = null
      this.canvas.requestRenderAll()
      return
    }

    const { fontSize, fontFamily, color, rotate, gridSize, excludeFromExport } = settings.watermark

    // 创建离屏 Canvas 生成水印图案
    const patternCanvas = document.createElement('canvas')
    const ctx = patternCanvas.getContext('2d')
    const size = gridSize // 图案单元大小
    patternCanvas.width = size
    patternCanvas.height = size

    // 绘制文字
    ctx.translate(size / 2, size / 2)
    ctx.rotate((rotate * Math.PI) / 180)
    ctx.font = `${fontSize}px ${fontFamily}`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 0, 0)

    // 创建 Pattern
    const pattern = new fabric.Pattern({
      source: patternCanvas,
      repeat: 'repeat'
    })

    // 创建覆盖层矩形
    const overlayRect = new fabric.Rect({
      left: 0,
      top: 0,
      width: this.originalWidth,
      height: this.originalHeight,
      fill: pattern,
      selectable: false,
      evented: false,
      excludeFromExport: excludeFromExport
    })

    this.canvas.overlayImage = overlayRect
    this.canvas.requestRenderAll()
  }

  /**
   * 清除所有参考线
   */
  clearGuides() {
    if (!this.canvas) return
    const objects = this.canvas.getObjects()
    const guides = objects.filter((obj) => obj.isGuide)
    if (guides.length > 0) {
      guides.forEach((guide) => this.canvas.remove(guide))
      this.canvas.requestRenderAll()
      this.saveHistory()
    }
  }

  /**
   * 开启 AI 选区模式
   * @param {string} type - 'smear' | 'rect' | 'lasso'
   */
  startSelection(type = 'smear') {
    if (!this.canvas) return

    // 先清理可能存在的绘图/线条模式
    this.setDrawingMode(false)
    this.endLineDrawing()

    this.isSelectionMode = true
    this.selectionType = type

    // 禁用对象选择
    this.canvas.selection = false
    this.canvas.defaultCursor = 'crosshair'
    this.canvas.getObjects().forEach((obj) => (obj.selectable = false))
    this.canvas.discardActiveObject()

    if (type === 'smear') {
      // 使用画笔，但颜色设为浅蓝
      this.canvas.isDrawingMode = true
      if (!this.canvas.freeDrawingBrush) {
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas)
      }
      this.canvas.freeDrawingBrush.color = 'rgba(0, 191, 255, 0.3)'
      this.canvas.freeDrawingBrush.width = 30 // 默认粗细
    } else {
      // rect 和 lasso 由 mouse 事件接管
      this.canvas.isDrawingMode = false
    }

    this.canvas.requestRenderAll()
  }

  /**
   * 结束 AI 选区模式
   */
  endSelection() {
    this.isSelectionMode = false
    this.selectionType = null
    this.isSelecting = false
    this.selectionPoints = []

    if (this.canvas) {
      this.canvas.isDrawingMode = false
      this.canvas.selection = true
      this.canvas.defaultCursor = 'default'
      this.canvas.getObjects().forEach((obj) => {
        if (!obj.lockMovementX) obj.selectable = true
      })
    }
  }

  /**
   * 清除所有选区
   */
  clearSelection() {
    if (!this.canvas) return

    // 移除 selection group
    const group = this.canvas.getObjects().find((obj) => obj.id === 'selection-group')
    if (group) {
      this.canvas.remove(group)
      this.selectionGroup = null
    }

    const selectionObjects = this.canvas.getObjects().filter((obj) => obj.isAiSelection)
    selectionObjects.forEach((obj) => this.canvas.remove(obj))

    this.canvas.requestRenderAll()
  }

  /**
   * 获取最底层图片（原图）
   */
  getOriginalImage() {
    if (!this.canvas) return null

    // 查找最底层的图片对象 (index 0 且 type='image')
    const objects = this.canvas.getObjects()
    // 过滤掉非图片对象，比如参考线
    const images = objects.filter((obj) => obj.type === 'image' && obj.id !== 'selection-group' && !obj.isGuide)

    if (images.length === 0) return null

    // 返回最底层的一个
    return images[0].toDataURL({ format: 'png' })
  }

  /**
   * 获取用于 AI 消除的输入图片 (包含原图和选区)
   */
  getAIInputImage() {
    if (!this.canvas) return null

    const objects = this.canvas.getObjects()
    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')
    const selectionObjects = objects.filter((obj) => obj.isAiSelection)

    const realLayers = objects.filter((obj) => {
      if (obj.isGuide) return false
      if (obj === selectionGroup || obj.id === 'selection-group') return false
      if (obj.isAiSelection) return false
      if (obj === this.doodleGroup || obj.id === 'doodle-group') return false
      if (obj.type === 'selection') return false
      if (obj.name === 'AI选区' || obj.name === '涂鸦图层') return false
      return true
    })

    const bottomLayer = realLayers.find((obj) => obj.visible !== false)
    if (!bottomLayer) return null

    const originalVisibilities = new Map()
    objects.forEach((obj) => {
      originalVisibilities.set(obj, obj.visible)
      obj.visible = false
    })

    bottomLayer.visible = true
    if (selectionGroup) selectionGroup.visible = true
    selectionObjects.forEach((obj) => {
      obj.visible = true
    })

    this.canvas.requestRenderAll()

    const zoom = this.canvas.getZoom() || 1
    const dataUrl = this.canvas.toDataURL({ format: 'png', multiplier: 1 / zoom, enableRetinaScaling: false })

    objects.forEach((obj) => {
      obj.visible = originalVisibilities.get(obj)
    })
    this.canvas.requestRenderAll()

    return dataUrl
  }

  getAIMattingInputImage() {
    if (!this.canvas) return null

    const objects = this.canvas.getObjects()
    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')

    const realLayers = objects.filter((obj) => {
      if (obj.isGuide) return false
      if (obj === selectionGroup || obj.id === 'selection-group') return false
      if (obj.isAiSelection) return false
      if (obj === this.doodleGroup || obj.id === 'doodle-group') return false
      if (obj.type === 'selection') return false
      if (obj.name === 'AI选区' || obj.name === '涂鸦图层') return false
      return true
    })

    const bottomLayer = realLayers.find((obj) => obj.visible !== false)
    if (!bottomLayer) return null

    const originalVisibilities = new Map()
    objects.forEach((obj) => {
      originalVisibilities.set(obj, obj.visible)
      obj.visible = false
    })

    bottomLayer.visible = true

    this.canvas.requestRenderAll()

    const zoom = this.canvas.getZoom() || 1
    const dataUrl = this.canvas.toDataURL({ format: 'png', multiplier: 1 / zoom, enableRetinaScaling: false })

    objects.forEach((obj) => {
      obj.visible = originalVisibilities.get(obj)
    })
    this.canvas.requestRenderAll()

    return dataUrl
  }

  /**
   * 检查是否可以执行消除
   * @returns {Object} { valid: boolean, message: string }
   */
  canPerformElimination() {
    if (!this.canvas) return { valid: false, message: '画布未初始化' }

    const objects = this.canvas.getObjects()

    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')
    const selectionObjects = objects.filter((obj) => obj.isAiSelection)
    const hasLegacyGroupSelection = selectionGroup && selectionGroup.getObjects && selectionGroup.getObjects().length > 0
    if (!hasLegacyGroupSelection && selectionObjects.length === 0) {
      return { valid: false, message: '请先创建选区' }
    }

    const realLayers = objects.filter((obj) => {
      if (obj.isGuide) return false
      if (obj === selectionGroup || obj.id === 'selection-group') return false
      if (obj.isAiSelection) return false
      if (obj === this.doodleGroup || obj.id === 'doodle-group') return false
      if (obj.type === 'selection') return false
      if (obj.name === 'AI选区' || obj.name === '涂鸦图层') return false
      return true
    })

    const visibleRealLayers = realLayers.filter((obj) => obj.visible !== false)

    if (visibleRealLayers.length === 0) {
      return { valid: false, message: '未检测到可处理的底层图层' }
    }

    if (visibleRealLayers.length > 1) {
      return { valid: true, warning: '检测到多个图层，仅对最底层画布进行 AI 消除。' }
    }

    return { valid: true }
  }

  canPerformMatting() {
    if (!this.canvas) return { valid: false, message: '画布未初始化' }

    const objects = this.canvas.getObjects()

    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')
    const realLayers = objects.filter((obj) => {
      if (obj.isGuide) return false
      if (obj === selectionGroup || obj.id === 'selection-group') return false
      if (obj.isAiSelection) return false
      if (obj === this.doodleGroup || obj.id === 'doodle-group') return false
      if (obj.type === 'selection') return false
      if (obj.name === 'AI选区' || obj.name === '涂鸦图层') return false
      return true
    })

    const visibleRealLayers = realLayers.filter((obj) => obj.visible !== false)
    if (visibleRealLayers.length === 0) return { valid: false, message: '未检测到可处理的底层图层' }
    if (visibleRealLayers.length > 1) return { valid: true, warning: '检测到多个图层，仅对最底层可见图层进行抠图。' }

    return { valid: true }
  }
}
