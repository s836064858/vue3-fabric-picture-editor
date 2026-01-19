// clipboard 负责复制/粘贴（基于 Fabric clone）
// 说明：activeSelection 是“多选临时对象”，粘贴时需要拆分到画布，否则会出现不可操作/坐标异常
export function applyClipboardMethods(CanvasManager) {
  CanvasManager.prototype.copy = async function () {
    if (!this.canvas) return
    const activeObject = this.canvas.getActiveObject()
    if (activeObject) {
      const cloned = await activeObject.clone()
      this._clipboard = cloned
      this._pasteCount = 0
    }
  }

  CanvasManager.prototype.paste = async function () {
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
      // 将多选内的对象逐个加入画布，并补齐 id，避免图层面板无法区分
      clonedObj.canvas = this.canvas
      clonedObj.forEachObject((obj) => {
        obj.id = Date.now().toString() + Math.random().toString(36).substr(2, 5)
        this.canvas.add(obj)
      })
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
}
