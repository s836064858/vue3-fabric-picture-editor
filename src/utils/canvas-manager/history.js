// history 负责撤销/重做与 JSON 快照
// 约定：快照只序列化必要字段（id/name），否则体积过大且容易引入不稳定字段
export function applyHistoryMethods(CanvasManager) {
  CanvasManager.prototype.saveHistory = function () {
    if (this.isHistoryProcessing || !this.canvas) return

    if (this.historyStep < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyStep + 1)
    }

    const json = JSON.stringify(this.canvas.toJSON(['id', 'name']))
    this.history.push(json)
    this.historyStep++

    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift()
      this.historyStep--
    }

    this._triggerHistoryChange()
  }

  CanvasManager.prototype.undo = async function () {
    if (this.historyStep <= 0) return

    this.isHistoryProcessing = true
    this.historyStep--
    const json = this.history[this.historyStep]

    await this._loadCanvasState(json)
    this.isHistoryProcessing = false
    this._triggerChange()
    this._triggerHistoryChange()
  }

  CanvasManager.prototype.redo = async function () {
    if (this.historyStep >= this.history.length - 1) return

    this.isHistoryProcessing = true
    this.historyStep++
    const json = this.history[this.historyStep]

    await this._loadCanvasState(json)
    this.isHistoryProcessing = false
    this._triggerChange()
    this._triggerHistoryChange()
  }

  CanvasManager.prototype._loadCanvasState = async function (json) {
    if (!this.canvas) return

    // loadFromJSON 会重建对象引用，组引用需要重置并在后续按需重建
    this.doodleGroup = null
    this.selectionGroup = null

    // 尽量恢复撤销/重做前的选中对象，保证图层面板联动体验
    const activeObject = this.canvas.getActiveObject()
    const currentActiveId = activeObject ? activeObject.id : null

    await this.canvas.loadFromJSON(JSON.parse(json))

    this.canvas.getObjects().forEach((obj) => {
      if (!obj.id) obj.id = Math.random().toString(36).substr(2, 9)
      if (!obj.name) obj.name = this._getObjectName(obj)
    })

    this.canvas.requestRenderAll()

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
}
