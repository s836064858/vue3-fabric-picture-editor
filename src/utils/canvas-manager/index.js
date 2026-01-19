import { initCanvasManagerState, applyCoreMethods } from './core'
import { applyCursorMethods } from './cursor'
import { applyEventMethods } from './events'
import { applyHistoryMethods } from './history'
import { applyClipboardMethods } from './clipboard'
import { applyDrawingMethods } from './drawing'
import { applyObjectMethods } from './objects'
import { applyAiMethods } from './ai'

// CanvasManager 采用“按能力注入原型方法”的拆分方式：
// - index.js 只负责聚合与导出，避免出现再次膨胀的单文件
// - 各子模块通过 applyXxxMethods(CanvasManager) 往原型挂方法，确保实例 API 保持稳定
export class CanvasManager {
  constructor(canvasElement, options = {}) {
    initCanvasManagerState({ manager: this, canvasElement, options })
  }
}

applyCoreMethods(CanvasManager)
applyCursorMethods(CanvasManager)
applyEventMethods(CanvasManager)
applyHistoryMethods(CanvasManager)
applyClipboardMethods(CanvasManager)
applyDrawingMethods(CanvasManager)
applyObjectMethods(CanvasManager)
applyAiMethods(CanvasManager)
