import * as fabric from 'fabric'

// AI 选区模块的核心约定：
// - 选区对象标记为 isAiSelection，并设为不可选/不可交互
// - getRealLayers 会过滤掉参考线、选区、涂鸦等“非真实图层”，用于 AI 输入与底层图层判定
function getRealLayers({ objects, selectionGroup, doodleGroup }) {
  return objects.filter((obj) => {
    if (obj.isGuide) return false
    if (obj === selectionGroup || obj.id === 'selection-group') return false
    if (obj.isAiSelection) return false
    if (obj === doodleGroup || obj.id === 'doodle-group') return false
    if (obj.type === 'selection') return false
    if (obj.name === 'AI选区' || obj.name === '涂鸦图层') return false
    return true
  })
}

export function applyAiMethods(CanvasManager) {
  CanvasManager.prototype._ensureSelectionGroup = function () {
    if (!this.canvas) return

    if (!this.selectionGroup) {
      const existingGroup = this.canvas.getObjects().find((obj) => obj.id === 'selection-group')
      if (existingGroup) {
        this.selectionGroup = existingGroup
      }
    }
  }

  CanvasManager.prototype._addToSelectionGroup = function (object) {
    this._markAiSelectionObject(object)
  }

  CanvasManager.prototype._markAiSelectionObject = function (object) {
    if (!this.canvas || !object) return

    object.set({
      selectable: false,
      evented: false,
      name: 'AI选区'
    })
    object.isAiSelection = true
    // 选区始终置顶（但不影响真实图层的相对顺序）
    this.canvas.moveObjectTo(object, this.canvas.getObjects().length - 1)
    this.canvas.requestRenderAll()
  }

  CanvasManager.prototype._getScenePointer = function (o) {
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

  CanvasManager.prototype._handleSelectionMouseDown = function (o) {
    if (this.selectionType === 'smear') return

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

  CanvasManager.prototype._handleSelectionMouseMove = function (o) {
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

  CanvasManager.prototype._handleSelectionMouseUp = function () {
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

  CanvasManager.prototype.startSelection = function (type = 'smear') {
    if (!this.canvas) return

    this.setDrawingMode(false)
    this.endLineDrawing()

    this.isSelectionMode = true
    this.selectionType = type

    this.canvas.selection = false
    this.canvas.defaultCursor = 'crosshair'
    this.canvas.getObjects().forEach((obj) => (obj.selectable = false))
    this.canvas.discardActiveObject()

    if (type === 'smear') {
      this.canvas.isDrawingMode = true
      if (!this.canvas.freeDrawingBrush) {
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas)
      }
      this.canvas.freeDrawingBrush.color = 'rgba(0, 191, 255, 0.3)'
      this.canvas.freeDrawingBrush.width = 30
    } else {
      this.canvas.isDrawingMode = false
    }

    this.canvas.requestRenderAll()
  }

  CanvasManager.prototype.endSelection = function () {
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

  CanvasManager.prototype.clearSelection = function () {
    if (!this.canvas) return

    const group = this.canvas.getObjects().find((obj) => obj.id === 'selection-group')
    if (group) {
      this.canvas.remove(group)
      this.selectionGroup = null
    }

    const selectionObjects = this.canvas.getObjects().filter((obj) => obj.isAiSelection)
    selectionObjects.forEach((obj) => this.canvas.remove(obj))

    this.canvas.requestRenderAll()
  }

  CanvasManager.prototype.getOriginalImage = function () {
    if (!this.canvas) return null

    const objects = this.canvas.getObjects()
    const images = objects.filter((obj) => obj.type === 'image' && obj.id !== 'selection-group' && !obj.isGuide)

    if (images.length === 0) return null

    return images[0].toDataURL({ format: 'png' })
  }

  CanvasManager.prototype.getAIInputImage = function () {
    if (!this.canvas) return null

    const objects = this.canvas.getObjects()
    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')
    const selectionObjects = objects.filter((obj) => obj.isAiSelection)

    const realLayers = getRealLayers({ objects, selectionGroup, doodleGroup: this.doodleGroup })
    const bottomLayer = realLayers.find((obj) => obj.visible !== false)
    if (!bottomLayer) return null

    // 为生成 AI 输入：临时隐藏所有对象，只保留“底层图 + 选区”，导出后再恢复可见性
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
    // multiplier = 1/zoom：确保导出的是“逻辑坐标尺寸”，不受当前视图缩放影响
    const dataUrl = this.canvas.toDataURL({ format: 'png', multiplier: 1 / zoom, enableRetinaScaling: false })

    objects.forEach((obj) => {
      obj.visible = originalVisibilities.get(obj)
    })
    this.canvas.requestRenderAll()

    return dataUrl
  }

  CanvasManager.prototype.getAIMattingInputImage = function () {
    if (!this.canvas) return null

    const objects = this.canvas.getObjects()
    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')

    const realLayers = getRealLayers({ objects, selectionGroup, doodleGroup: this.doodleGroup })
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

  CanvasManager.prototype.canPerformElimination = function () {
    if (!this.canvas) return { valid: false, message: '画布未初始化' }

    const objects = this.canvas.getObjects()

    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')
    const selectionObjects = objects.filter((obj) => obj.isAiSelection)
    const hasLegacyGroupSelection = selectionGroup && selectionGroup.getObjects && selectionGroup.getObjects().length > 0
    if (!hasLegacyGroupSelection && selectionObjects.length === 0) {
      return { valid: false, message: '请先创建选区' }
    }

    const realLayers = getRealLayers({ objects, selectionGroup, doodleGroup: this.doodleGroup })
    const visibleRealLayers = realLayers.filter((obj) => obj.visible !== false)

    if (visibleRealLayers.length === 0) {
      return { valid: false, message: '未检测到可处理的底层图层' }
    }

    if (visibleRealLayers.length > 1) {
      return { valid: true, warning: '检测到多个图层，仅对最底层画布进行 AI 消除。' }
    }

    return { valid: true }
  }

  CanvasManager.prototype.canPerformMatting = function () {
    if (!this.canvas) return { valid: false, message: '画布未初始化' }

    const objects = this.canvas.getObjects()

    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')
    const realLayers = getRealLayers({ objects, selectionGroup, doodleGroup: this.doodleGroup })
    const visibleRealLayers = realLayers.filter((obj) => obj.visible !== false)
    if (visibleRealLayers.length === 0) return { valid: false, message: '未检测到可处理的底层图层' }
    if (visibleRealLayers.length > 1) return { valid: true, warning: '检测到多个图层，仅对最底层可见图层进行抠图。' }

    return { valid: true }
  }

  CanvasManager.prototype.addEliminationResultImage = function (dataUrl) {
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

  CanvasManager.prototype.hideEliminationBaseLayer = function () {
    if (!this.canvas) return

    const objects = this.canvas.getObjects()
    const selectionGroup = this.selectionGroup || objects.find((obj) => obj.id === 'selection-group')

    const realLayers = getRealLayers({ objects, selectionGroup, doodleGroup: this.doodleGroup })
    const baseLayer = realLayers.find((obj) => obj.visible !== false)
    if (!baseLayer) return

    this.setLayerVisible(baseLayer.id, false)
  }
}
