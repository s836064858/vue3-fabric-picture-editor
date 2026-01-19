import * as fabric from 'fabric'
import { initAligningGuidelines } from '../aligning-guidelines'
import settings from '@/config/settings'

// core 负责 CanvasManager 的“生命周期与状态初始化”：
// - initCanvasManagerState：构造期初始化所有状态字段，避免散落在各模块里
// - init/dispose：创建/销毁 Fabric.Canvas，并串起事件、对齐线、光标等子能力
export function initCanvasManagerState({ manager, canvasElement, options = {} }) {
  manager.canvasElement = canvasElement
  manager.options = options
  manager.canvas = null

  manager.history = []
  manager.historyStep = -1
  manager.isHistoryProcessing = false
  manager.MAX_HISTORY = settings.canvas.maxHistory

  manager._clipboard = null
  manager._pasteCount = 0

  manager.isLineDrawingMode = false
  manager.currentLineType = null
  manager.drawingLineObject = null
  manager.drawingStartPoint = null

  manager.doodleGroup = null
  manager.isEraserMode = false
  manager.isErasing = false
  manager.eraserPoints = []
  manager.currentEraserPath = null

  manager.isSelectionMode = false
  manager.selectionType = null
  manager.selectionGroup = null
  manager.isSelecting = false
  manager.selectionPoints = []
  manager.currentSelectionShape = null

  manager.cursorEl = null

  // 文本局部选中缓存：用户点右侧面板会触发退出编辑，Fabric 会清空 selectionStart/End
  // 该缓存用于“刚退出编辑后仍允许对刚才的选区应用样式”，避免局部样式大概率失效
  manager._lastTextSelection = null
}

export function applyCoreMethods(CanvasManager) {
  // init 只负责“创建画布与初始化能力”，业务对象的添加由 objects 模块提供
  CanvasManager.prototype.init = function ({
    width = settings.canvas.width,
    height = settings.canvas.height,
    backgroundColor = settings.canvas.backgroundColor,
    image = null
  }) {
    this.originalWidth = width
    this.originalHeight = height

    this.canvas = new fabric.Canvas(this.canvasElement, {
      width: width,
      height: height,
      backgroundColor: backgroundColor === 'transparent' ? null : backgroundColor,
      preserveObjectStacking: true
    })

    this._initEvents()

    initAligningGuidelines(this.canvas)

    this._initCursor()

    if (image) {
      const imgInstance = new fabric.FabricImage(image)
      imgInstance.set({
        id: Date.now().toString(),
        name: '图片'
      })
      imgInstance.scaleX = 1
      imgInstance.scaleY = 1

      this.canvas.add(imgInstance)
      this.canvas.setActiveObject(imgInstance)
      this.canvas.centerObject(imgInstance)
    }

    this.saveHistory()
    this._triggerChange()
  }

  // dispose 需要同时清理自定义光标 DOM 与 Fabric.Canvas，避免内存泄漏
  CanvasManager.prototype.dispose = function () {
    if (this.cursorEl && this.cursorEl.parentNode) {
      this.cursorEl.parentNode.removeChild(this.cursorEl)
      this.cursorEl = null
    }
    if (this.canvas) {
      this.canvas.dispose()
      this.canvas = null
    }
  }
}
