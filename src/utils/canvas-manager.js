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

    // 监听路径创建事件（涂鸦）
    this.canvas.on('path:created', (opt) => {
      const path = opt.path
      path.set({
        id: Date.now().toString(),
        name: '涂鸦',
        selectable: true
      })
      this._triggerChange()
      this.saveHistory()
    })

    // 对象修改事件（用于历史记录）
    this.canvas.on('object:modified', () => this.saveHistory())

    // 对象添加事件
    this.canvas.on('object:added', () => {
      if (!this.isHistoryProcessing) {
        // 绘图模式下，由 path:created 事件负责保存历史记录，避免重复保存
        if (this.canvas.isDrawingMode) return

        this.saveHistory()
        this._triggerChange()
      }
    })

    // 对象移除事件
    this.canvas.on('object:removed', () => {
      if (!this.isHistoryProcessing) {
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

    // 鼠标事件（用于线条绘制）
    this.canvas.on('mouse:down', this._handleMouseDown.bind(this))
    this.canvas.on('mouse:move', this._handleMouseMove.bind(this))
    this.canvas.on('mouse:up', this._handleMouseUp.bind(this))
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
   * @param {Object} options - 文本配置选项
   * @param {string} options.text - 文本内容
   * @param {number} options.fontSize - 字体大小
   * @param {string} options.fontWeight - 字体粗细
   */
  addText(options = {}) {
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

      this.canvas.freeDrawingBrush.width = options.width || 5
      this.canvas.freeDrawingBrush.color = options.color || '#000000'
    }
  }

  /**
   * 设置笔刷属性
   * @param {Object} options - 笔刷配置
   */
  setBrush(options = {}) {
    if (!this.canvas || !this.canvas.freeDrawingBrush) return

    if (options.width) this.canvas.freeDrawingBrush.width = options.width
    if (options.color) this.canvas.freeDrawingBrush.color = options.color
  }

  /**
   * 开启线条绘制模式
   * @param {string} type - 线条类型 'line' | 'dashed' | 'arrow'
   */
  startLineDrawing(type) {
    if (!this.canvas) return
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
   * 处理鼠标按下（线条绘制）
   * @private
   */
  _handleMouseDown(o) {
    if (!this.isLineDrawingMode || !this.canvas) return

    // Fabric 6.x 使用 scenePoint 获取坐标
    const pointer = o.scenePoint || this.canvas.getPointer(o.e)
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

  /**
   * 处理鼠标移动（线条绘制）
   * @private
   */
  _handleMouseMove(o) {
    if (!this.isLineDrawingMode || !this.drawingLineObject || !this.drawingStartPoint) return

    // Fabric 6.x 使用 scenePoint 获取坐标
    const pointer = o.scenePoint || this.canvas.getPointer(o.e)

    if (this.currentLineType === 'arrow' || this.currentLineType === 'line' || this.currentLineType === 'dashed') {
      this.drawingLineObject.set({ x2: pointer.x, y2: pointer.y })
    }

    this.canvas.requestRenderAll()
  }

  /**
   * 处理鼠标松开（线条绘制）
   * @private
   */
  _handleMouseUp() {
    if (!this.isLineDrawingMode || !this.drawingLineObject) return

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
    const imgObj = new Image()
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

  /**
   * 替换选中图片的源
   * @param {string} dataUrl - 新图片 DataURL
   */
  replaceActiveImage(dataUrl) {
    const activeObject = this.canvas.getActiveObject()
    if (!activeObject || activeObject.type !== 'image') return

    const imgObj = new Image()
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

    // 临时隐藏参考线
    const objects = this.canvas.getObjects()
    const guides = objects.filter((obj) => obj.isGuide)
    const originalVisibilities = new Map()

    guides.forEach((guide) => {
      originalVisibilities.set(guide, guide.visible)
      guide.visible = false
    })

    this.canvas.requestRenderAll()

    const dataUrl = this.canvas.toDataURL(options)

    // 恢复参考线显示状态
    guides.forEach((guide) => {
      guide.visible = originalVisibilities.get(guide)
    })
    this.canvas.requestRenderAll()

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
}
