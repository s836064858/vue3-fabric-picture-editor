// events 负责 Fabric 事件绑定与“把事件转换成对外回调”
// - 选中变化：onSelection
// - 画布对象变化：onChange（移动/缩放/旋转做了 rAF 节流）
// - 文本局部选中变化：onTextSelectionChange（用于属性面板回显 + 选区缓存）
export function applyEventMethods(CanvasManager) {
  CanvasManager.prototype._initEvents = function () {
    if (!this.canvas) return

    this.canvas.on('selection:created', this._handleSelection.bind(this))
    this.canvas.on('selection:updated', this._handleSelection.bind(this))
    this.canvas.on('selection:cleared', this._handleSelectionCleared.bind(this))

    this.canvas.on('path:created', (opt) => {
      const path = opt.path

      if (this.isSelectionMode && this.selectionType === 'smear') {
        path.set({
          id: Date.now().toString(),
          name: 'AI选区',
          selectable: false,
          evented: false,
          stroke: 'rgba(0, 191, 255, 0.3)',
          opacity: 1
        })
        this._addToSelectionGroup(path)
        return
      }

      path.set({
        id: Date.now().toString(),
        name: this.isEraserMode ? '橡皮擦' : '涂鸦',
        selectable: false,
        evented: false
      })

      if (this.isEraserMode) {
        path.globalCompositeOperation = 'destination-out'
        path.strokeWidth = this.canvas.freeDrawingBrush.width
      }

      this._addToDoodleGroup(path)

      this._triggerChange()
      this.saveHistory()
    })

    this.canvas.on('object:modified', () => {
      this.saveHistory()
      this._triggerChange()
    })

    this.canvas.on('object:added', () => {
      if (!this.isHistoryProcessing) {
        if (this.canvas.isDrawingMode || this.isSelectionMode) return

        this.saveHistory()
        this._triggerChange()
      }
    })

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

    // 频繁拖动会导致 onChange 触发过密，这里用 requestAnimationFrame 合并到每帧一次
    let rafId = null
    let lastTriggerAt = 0
    const minInterval = 60
    const throttleTriggerChange = (e) => {
      const now = performance.now()
      if (now - lastTriggerAt < minInterval) return
      if (rafId) return
      lastTriggerAt = now
      rafId = requestAnimationFrame(() => {
        this._triggerChange({ reason: 'transform', target: e?.target || null })
        rafId = null
      })
    }

    this.canvas.on('object:moving', throttleTriggerChange)
    this.canvas.on('object:scaling', throttleTriggerChange)
    this.canvas.on('object:rotating', throttleTriggerChange)

    this.canvas.on('text:editing:entered', (e) => {
      this._emitTextSelectionChange(e?.target)
    })
    this.canvas.on('text:editing:exited', (e) => {
      this._triggerChange()
      this._emitTextSelectionChange(e?.target)
    })
    this.canvas.on('text:selection:changed', (e) => {
      this._emitTextSelectionChange(e?.target)
    })
    this.canvas.on('text:changed', (e) => {
      this._triggerChange()
      this._emitTextSelectionChange(e?.target)
    })

    this.canvas.on('mouse:down', this._handleMouseDown.bind(this))
    this.canvas.on('mouse:move', this._handleMouseMove.bind(this))
    this.canvas.on('mouse:up', this._handleMouseUp.bind(this))

    this.canvas.on('mouse:out', () => {
      if (this.cursorEl) this.cursorEl.style.display = 'none'
    })
    this.canvas.on('mouse:over', () => {
      if (this._shouldShowCursor()) {
        this.cursorEl.style.display = 'block'
      }
    })

    this.canvas.on('mouse:wheel', () => {
      this._updateCursorSize()
    })
  }

  CanvasManager.prototype._emitTextSelectionChange = function (target) {
    if (!this.options?.onTextSelectionChange) return

    const activeObject = target || this.canvas?.getActiveObject?.()
    if (!activeObject || activeObject.type !== 'i-text') {
      // 离开文本或清空选中时，缓存也一并清理，避免误应用到其他对象
      this._lastTextSelection = null
      this.options.onTextSelectionChange(null)
      return
    }

    const selectionStart = typeof activeObject.selectionStart === 'number' ? activeObject.selectionStart : null
    const selectionEnd = typeof activeObject.selectionEnd === 'number' ? activeObject.selectionEnd : null
    const hasSelectionRange = selectionStart !== null && selectionEnd !== null && selectionStart < selectionEnd

    if (hasSelectionRange) {
      // 仅在确实有“起止范围”时才更新缓存（光标态不更新）
      this._lastTextSelection = { id: activeObject.id || null, start: selectionStart, end: selectionEnd }
    }

    this.options.onTextSelectionChange({
      id: activeObject.id || null,
      isEditing: !!activeObject.isEditing,
      selectionStart,
      selectionEnd,
      hasSelectionRange
    })
  }

  CanvasManager.prototype._handleSelection = function (e) {
    const selected = e.selected[0]
    if (selected) {
      if (!selected.id) {
        selected.id = Date.now().toString()
      }
      if (this.options.onSelection) {
        this.options.onSelection(selected.id)
      }

      this._emitTextSelectionChange(selected)
    }
  }

  CanvasManager.prototype._handleSelectionCleared = function () {
    if (this.options.onSelection) {
      this.options.onSelection(null)
    }
    this._emitTextSelectionChange(null)
  }

  CanvasManager.prototype._triggerChange = function (meta = {}) {
    if (this.options.onChange && this.canvas) {
      this.options.onChange(this.canvas.getObjects(), meta)
    }
  }

  CanvasManager.prototype._triggerHistoryChange = function () {
    if (this.options.onHistoryChange) {
      this.options.onHistoryChange({
        length: this.history.length,
        step: this.historyStep
      })
    }
  }
}
