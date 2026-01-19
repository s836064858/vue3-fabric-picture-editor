import * as fabric from 'fabric'
import settings from '@/config/settings'
import { TEXT_SELECTION_STYLE_KEY_SET } from './constants'

// objects 负责“对象与图层”的增删改查，以及与属性面板联动的核心逻辑：
// - setObjectProperty：统一入口，根据对象类型/属性名做分流（含文本局部选中样式）
// - 图层锁定/可见性/排序：与图层面板一致
// - 导出/缩放/水印/参考线：与画布整体行为相关
export function applyObjectMethods(CanvasManager) {
  CanvasManager.prototype._getObjectName = function (obj) {
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

  CanvasManager.prototype.addText = function (options = {}) {
    this.setDrawingMode(false)
    this.endSelection()

    const zoom = this.canvas.getZoom()
    const { defaultText, fontFamily, fill, fontSize: defaultFontSize } = settings.objectDefaults.text

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

  CanvasManager.prototype.addShape = function (type) {
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
      shape = new fabric.Circle({
        ...options,
        name: '圆形',
        radius: 50,
        width: 100,
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

  CanvasManager.prototype.addImage = function (dataUrl) {
    this.setDrawingMode(false)
    this.endSelection()

    const imgObj = new Image()
    imgObj.crossOrigin = 'anonymous'
    imgObj.src = dataUrl
    imgObj.onload = () => {
      const imgInstance = new fabric.FabricImage(imgObj)

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

  CanvasManager.prototype.replaceActiveImage = function (dataUrl) {
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

  CanvasManager.prototype.setObjectProperty = function (property, value) {
    const activeObject = this.canvas.getActiveObject()
    if (!activeObject) return

    if (this._canApplyITextSelectionStyle(activeObject, property)) {
      // 文本局部选中样式：只改选中的字符，不污染整段文本
      this._applyITextSelectionStyle(activeObject, property, value)
      return
    }

    if (property === 'fontFamily' && document.fonts) {
      this._handleFontFamilyChange(activeObject, value)
    } else if (property === 'locked') {
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

  CanvasManager.prototype._getITextSelectionRangeForStyle = function (activeObject) {
    if (!activeObject || activeObject.type !== 'i-text') return null

    const selectionStart = activeObject.selectionStart
    const selectionEnd = activeObject.selectionEnd

    if (typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionStart < selectionEnd) {
      return { start: selectionStart, end: selectionEnd }
    }

    // 仍处于编辑态但没有选区（只有光标），禁止回退缓存，避免误改到上一次选区
    if (activeObject.isEditing) return null

    const cached = this._lastTextSelection
    if (!cached || !cached.id || cached.id !== activeObject.id) return null

    const textLength = typeof activeObject.text === 'string' ? activeObject.text.length : 0
    if (cached.start < 0 || cached.end > textLength) return null

    return { start: cached.start, end: cached.end }
  }

  CanvasManager.prototype._canApplyITextSelectionStyle = function (activeObject, property) {
    if (!activeObject || activeObject.type !== 'i-text') return false
    if (property === 'text') return false

    const range = this._getITextSelectionRangeForStyle(activeObject)
    if (!range) return false

    return TEXT_SELECTION_STYLE_KEY_SET.has(property)
  }

  CanvasManager.prototype._applyITextSelectionStyle = function (activeObject, property, value) {
    const range = this._getITextSelectionRangeForStyle(activeObject)
    if (!range) return

    const apply = () => {
      activeObject.setSelectionStyles({ [property]: value }, range.start, range.end)
      activeObject.dirty = true
      activeObject.setCoords()
      this.canvas.requestRenderAll()
      this._triggerChange()
      this.saveHistory()
      this._lastTextSelection = { id: activeObject.id || null, start: range.start, end: range.end }
      this._emitTextSelectionChange(activeObject)
    }

    if (property === 'fontFamily' && document.fonts) {
      // 字体需要先 load，否则切换后可能出现渲染闪烁/宽度计算不准
      const fontString = `${activeObject.fontStyle || 'normal'} ${activeObject.fontWeight || 'normal'} ${activeObject.fontSize || 24}px "${value}"`
      document.fonts
        .load(fontString)
        .then(() => apply())
        .catch((err) => {
          console.error('字体加载失败:', err)
        })
      return
    }

    apply()
  }

  CanvasManager.prototype._handleFontFamilyChange = function (activeObject, fontFamily) {
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

  CanvasManager.prototype.setActiveObject = function (id) {
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

  CanvasManager.prototype.getActiveObject = function () {
    return this.canvas ? this.canvas.getActiveObject() : null
  }

  CanvasManager.prototype.deleteActiveObject = function () {
    if (!this.canvas) return
    const activeObject = this.canvas.getActiveObject()
    if (activeObject) {
      if (activeObject.isEditing) return

      this.canvas.remove(activeObject)
      this.canvas.discardActiveObject()
      this._triggerChange()
      this.saveHistory()
    }
  }

  CanvasManager.prototype.deleteLayer = function (id) {
    if (!this.canvas) return
    const object = this.canvas.getObjects().find((obj) => obj.id === id)
    if (object) {
      this.canvas.remove(object)
      this.canvas.discardActiveObject()
      this._triggerChange()
      this.saveHistory()
    }
  }

  CanvasManager.prototype.setLayerLocked = function (id, locked) {
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

      if (locked) {
        this.canvas.discardActiveObject()
      }

      this.canvas.requestRenderAll()
      this._triggerChange()
      this.saveHistory()
    }
  }

  CanvasManager.prototype.setLayerVisible = function (id, visible) {
    if (!this.canvas) return
    const object = this.canvas.getObjects().find((obj) => obj.id === id)
    if (object) {
      object.set('visible', visible)
      this.canvas.requestRenderAll()
      this._triggerChange()
      this.saveHistory()
    }
  }

  CanvasManager.prototype.reorderLayers = function (newLayerIds) {
    if (!this.canvas) return

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

  CanvasManager.prototype.toDataURL = function (options = settings.export) {
    if (!this.canvas) return ''

    // 取消选中，避免导出出现控制点与选中框
    this.canvas.discardActiveObject()

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

  CanvasManager.prototype.setZoom = function (zoom) {
    if (!this.canvas) return

    // 这里同时修改画布物理尺寸 + viewportTransform，确保导出 multiplier 可控
    if (zoom < 0.1) zoom = 0.1
    if (zoom > 5) zoom = 5

    this.canvas.setDimensions({
      width: this.originalWidth * zoom,
      height: this.originalHeight * zoom
    })

    this.canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0])
    this.canvas.requestRenderAll()
  }

  CanvasManager.prototype.addGuide = function (orientation) {
    if (!this.canvas) return

    // 参考线按“原始设计尺寸的中心点”计算，避免缩放后中心漂移
    const centerX = this.originalWidth / 2
    const centerY = this.originalHeight / 2
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

    this.saveHistory()
  }

  CanvasManager.prototype.toggleWatermark = async function (show, text = settings.watermark.defaultText) {
    if (!this.canvas) return

    if (!show) {
      this.canvas.overlayImage = null
      this.canvas.requestRenderAll()
      return
    }

    // 水印用离屏 canvas 生成 pattern，再作为 overlayImage 叠加
    const { fontSize, fontFamily, color, rotate, gridSize, excludeFromExport } = settings.watermark

    const patternCanvas = document.createElement('canvas')
    const ctx = patternCanvas.getContext('2d')
    const size = gridSize
    patternCanvas.width = size
    patternCanvas.height = size

    ctx.translate(size / 2, size / 2)
    ctx.rotate((rotate * Math.PI) / 180)
    ctx.font = `${fontSize}px ${fontFamily}`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 0, 0)

    const pattern = new fabric.Pattern({
      source: patternCanvas,
      repeat: 'repeat'
    })

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

  CanvasManager.prototype.clearGuides = function () {
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
