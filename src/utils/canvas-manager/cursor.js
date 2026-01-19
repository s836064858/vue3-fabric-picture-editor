// cursor 负责“画笔/橡皮擦/选区涂抹”时的自定义光标
// 说明：Fabric 默认光标不支持“随笔刷宽度缩放”的圆形预览，因此用 DOM 叠一层
export function applyCursorMethods(CanvasManager) {
  CanvasManager.prototype._initCursor = function () {
    if (this.cursorEl) return

    this.cursorEl = document.createElement('div')
    this.cursorEl.style.position = 'absolute'
    this.cursorEl.style.pointerEvents = 'none'
    this.cursorEl.style.border = '1px solid #000'
    this.cursorEl.style.borderRadius = '50%'
    this.cursorEl.style.transform = 'translate(-50%, -50%)'
    this.cursorEl.style.display = 'none'
    this.cursorEl.style.zIndex = '9999'
    this.cursorEl.style.boxShadow = '0 0 2px rgba(255, 255, 255, 0.8)'

    const canvasContainer = this.canvasElement.parentNode
    if (canvasContainer) {
      // 光标采用 absolute 定位，父容器需要有定位上下文
      const computedStyle = window.getComputedStyle(canvasContainer)
      if (computedStyle.position === 'static') {
        canvasContainer.style.position = 'relative'
      }
      canvasContainer.appendChild(this.cursorEl)
    }
  }

  CanvasManager.prototype._shouldShowCursor = function () {
    // AI 选区的 smear 模式也走“画笔”，需要显示光标
    if (this.isSelectionMode && this.selectionType === 'smear') return true
    return this.isEraserMode || (this.canvas && this.canvas.isDrawingMode)
  }

  CanvasManager.prototype._updateCursorSize = function () {
    if (!this.cursorEl || !this.canvas || !this.canvas.freeDrawingBrush) return

    const zoom = this.canvas.getZoom()
    const brushWidth = this.canvas.freeDrawingBrush.width || 1
    // 使用“笔刷宽度 * 当前缩放”保持视觉一致
    const size = brushWidth * zoom

    this.cursorEl.style.width = `${size}px`
    this.cursorEl.style.height = `${size}px`
  }

  CanvasManager.prototype._updateCursorPosition = function (x, y) {
    if (!this.cursorEl || !this.canvasElement) return

    const rect = this.canvasElement.getBoundingClientRect()
    const left = x - rect.left
    const top = y - rect.top

    this.cursorEl.style.left = `${left}px`
    this.cursorEl.style.top = `${top}px`
  }
}
