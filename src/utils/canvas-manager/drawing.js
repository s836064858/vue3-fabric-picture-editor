import * as fabric from 'fabric'

// drawing 负责“绘制相关交互”：
// - 自由绘制（PencilBrush）、橡皮擦（destination-out）、直线/虚线/箭头
// - 鼠标事件分发优先级：橡皮擦 > AI 选区 > 线条绘制
// 说明：本模块只处理交互与绘制对象的生成；对象属性面板相关能力在 objects 模块
export function applyDrawingMethods(CanvasManager) {
  CanvasManager.prototype.setDrawingMode = function (enabled, options = {}) {
    if (!this.canvas) return
    this.canvas.isDrawingMode = enabled

    if (enabled) {
      if (!this.canvas.freeDrawingBrush) {
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas)
      }

      this.setBrush(options)
    } else {
      this._exitEraserMode()
    }
  }

  CanvasManager.prototype._exitEraserMode = function () {
    this.isEraserMode = false
    this.isErasing = false
    this.currentEraserPath = null
    this.eraserPoints = []

    if (this.cursorEl) {
      this.cursorEl.style.display = 'none'
    }

    if (this.canvas) {
      this.canvas.defaultCursor = 'default'
      this.canvas.getObjects().forEach((obj) => {
        if (!obj.lockMovementX) {
          obj.selectable = true
        }
      })
      this.canvas.selection = true
    }
  }

  CanvasManager.prototype.setBrush = function (options = {}) {
    if (!this.canvas || !this.canvas.freeDrawingBrush) return

    if (options.isEraser !== undefined) {
      this.isEraserMode = options.isEraser
    }

    if (options.width) {
      this.canvas.freeDrawingBrush.width = options.width
    }

    if (options.color) {
      this.canvas.freeDrawingBrush.color = options.color
    }

    if (this.isSelectionMode && this.selectionType === 'smear') {
      // smear 模式下，画笔被 AI 选区占用：禁止橡皮擦并锁定对象选择
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

    if (this.isEraserMode) {
      // 橡皮擦：禁用 Fabric 的 isDrawingMode，改用自定义 Path + destination-out
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

    this._updateCursorSize()
  }

  CanvasManager.prototype.startLineDrawing = function (type) {
    if (!this.canvas) return
    this.setDrawingMode(false)
    this.endSelection()

    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()

    this.isLineDrawingMode = true
    this.currentLineType = type
    this.canvas.defaultCursor = 'crosshair'
    this.canvas.selection = false

    this.canvas.getObjects().forEach((obj) => {
      obj.selectable = false
    })
  }

  CanvasManager.prototype.endLineDrawing = function () {
    this.isLineDrawingMode = false
    this.currentLineType = null
    this.drawingLineObject = null
    this.drawingStartPoint = null

    if (this.canvas) {
      this.canvas.defaultCursor = 'default'
      this.canvas.selection = true

      this.canvas.getObjects().forEach((obj) => {
        if (!obj.lockMovementX) {
          obj.selectable = true
        }
      })
    }
  }

  CanvasManager.prototype._ensureDoodleGroup = function () {
    if (!this.canvas) return

    if (!this.doodleGroup) {
      const existingGroup = this.canvas.getObjects().find((obj) => obj.id === 'doodle-group')
      if (existingGroup) {
        this.doodleGroup = existingGroup
      }
    }

    if (!this.doodleGroup) {
      // 涂鸦与橡皮擦都汇总在同一个 Group 里，便于图层面板与导出逻辑统一处理
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

  CanvasManager.prototype._addToDoodleGroup = function (path) {
    this._ensureDoodleGroup()

    if (!this.doodleGroup || !this.canvas) return

    this.canvas.remove(path)
    this.doodleGroup.add(path)
    this.doodleGroup.set('dirty', true)

    this.canvas.requestRenderAll()
  }

  CanvasManager.prototype._handleMouseDown = function (o) {
    if (!this.canvas) return

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

  CanvasManager.prototype._handleMouseMove = function (o) {
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
      const pointer = o.scenePoint || this.canvas.getPointer(o.e)
      if (this.currentLineType === 'arrow' || this.currentLineType === 'line' || this.currentLineType === 'dashed') {
        this.drawingLineObject.set({ x2: pointer.x, y2: pointer.y })
      }
      this.canvas.requestRenderAll()
    }
  }

  CanvasManager.prototype._handleMouseUp = function () {
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

  CanvasManager.prototype._handleLineMouseDown = function (o) {
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

  CanvasManager.prototype._handleLineMouseUp = function () {
    if (this.currentLineType === 'arrow') {
      // 箭头用 Group 组装“线段 + 三角形”，避免复杂的 path 计算
      const line = this.drawingLineObject
      this.canvas.remove(line)

      const dx = line.x2 - line.x1
      const dy = line.y2 - line.y1
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const length = Math.sqrt(dx * dx + dy * dy)

      if (length < 5) {
        // 过短的箭头判为误触，直接结束绘制
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

  CanvasManager.prototype._handleEraserMouseDown = function (o) {
    this.isErasing = true
    this._ensureDoodleGroup()
    const pointer = this._getScenePointer(o)
    this.eraserPoints = [pointer]
    this.currentEraserPath = null
  }

  CanvasManager.prototype._handleEraserMouseMove = function (o) {
    if (!this.isErasing) return
    const pointer = this._getScenePointer(o)
    this.eraserPoints.push(pointer)

    if (this.eraserPoints.length < 2) return

    const pathData = this._getSvgPathFromPoints(this.eraserPoints)

    if (this.currentEraserPath) {
      this.doodleGroup.remove(this.currentEraserPath)
    }

    // 橡皮擦本质是“画白色路径 + destination-out”，颜色无关紧要
    this.currentEraserPath = new fabric.Path(pathData, {
      fill: null,
      stroke: 'white',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeWidth: this.canvas.freeDrawingBrush.width || 10,
      globalCompositeOperation: 'destination-out',
      selectable: false,
      evented: false,
      name: '橡皮擦',
      id: Date.now().toString()
    })

    this.doodleGroup.add(this.currentEraserPath)
    this.doodleGroup.set('dirty', true)
    this.canvas.requestRenderAll()
  }

  CanvasManager.prototype._handleEraserMouseUp = function () {
    this.isErasing = false
    this.eraserPoints = []
    this.currentEraserPath = null
    this.saveHistory()
    this._triggerChange()
  }

  CanvasManager.prototype._getSvgPathFromPoints = function (points) {
    // 点转路径时做简单平滑（Q 二次贝塞尔），提升擦除轨迹观感
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

  CanvasManager.prototype.addLine = function (type) {
    this.startLineDrawing(type)
  }
}
