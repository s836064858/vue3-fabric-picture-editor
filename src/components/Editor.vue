<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick, shallowRef, markRaw } from 'vue'
import { useStore } from 'vuex'
import { Edit, RefreshLeft, RefreshRight, Download, Upload, Picture, ZoomIn, ZoomOut, Aim } from '@element-plus/icons-vue'
import Toolbar from './Toolbar.vue'
import PropertyPanel from './PropertyPanel.vue'
import LayerPanel from './LayerPanel.vue'
import NewCanvasDialog from './NewCanvasDialog.vue'
import { CanvasManager } from '../utils/canvas-manager'

const store = useStore()

// 画布引用
const canvasRef = ref(null)
// CanvasManager 实例
const canvasManager = shallowRef(null)

// 状态管理
const isInitialized = ref(false)
const showNewCanvasDialog = ref(false)
const zoom = ref(1)
const isZoomInputFocused = ref(false)
const zoomInputVal = ref(100)
const isMouseOverCanvas = ref(false)

watch(zoom, (newVal) => {
  zoomInputVal.value = Math.round(newVal * 100)
})

// 历史记录状态（仅用于 UI 显示）
const historyLength = ref(0)
const historyStep = ref(-1)

// 从 Store 获取状态
const layers = computed(() => store.state.layers)
const activeObjectId = computed(() => store.state.activeObjectId)
const activeLayer = computed(() => store.getters.activeLayer)

// 初始化
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

// 清理资源
onUnmounted(() => {
  if (canvasManager.value) {
    canvasManager.value.dispose()
    canvasManager.value = null
  }
  window.removeEventListener('keydown', handleKeydown)
})

// 初始化画布
const initCanvas = (options = {}) => {
  canvasManager.value = markRaw(
    new CanvasManager(canvasRef.value, {
      onChange: handleCanvasChange,
      onSelection: handleSelectionChange,
      onHistoryChange: handleHistoryChange
    })
  )

  canvasManager.value.init(options)
  isInitialized.value = true

  // 自适应屏幕
  fitCanvasToScreen()
}

// 自适应画布到屏幕
const fitCanvasToScreen = () => {
  if (!canvasManager.value) return

  // 使用 nextTick 确保 DOM 布局已完成
  nextTick(() => {
    const viewport = document.querySelector('.canvas-viewport')
    if (!viewport) return

    // 获取容器尺寸，减去内边距 (padding: 40px)
    const padding = 80
    const containerWidth = viewport.clientWidth - padding
    const containerHeight = viewport.clientHeight - padding

    if (containerWidth <= 0 || containerHeight <= 0) return

    const canvasWidth = canvasManager.value.originalWidth
    const canvasHeight = canvasManager.value.originalHeight

    if (!canvasWidth || !canvasHeight) return

    // 计算适配比例
    const scaleX = containerWidth / canvasWidth
    const scaleY = containerHeight / canvasHeight
    let newZoom = Math.min(scaleX, scaleY)

    // 如果计算出的缩放比例大于1（说明画布比容器小），则限制为1（保持原样），避免模糊
    // 如果小于1（说明画布比容器大），则使用计算出的比例（缩小适配）
    if (newZoom > 1) newZoom = 1

    // 保留两位小数
    newZoom = Math.floor(newZoom * 100) / 100

    // 限制最小缩放
    if (newZoom < 0.1) newZoom = 0.1

    zoom.value = newZoom
    canvasManager.value.setZoom(newZoom)
  })
}

// 画布内容变化回调
const handleCanvasChange = (objects) => {
  // 过滤掉参考线
  const layerObjects = objects.filter((obj) => !obj.isGuide)

  // 转换对象为简单数据结构存储在 Vuex
  const layerData = layerObjects.map((obj) => {
    let name = obj.name
    if (!name) {
      if (obj.type === 'i-text' || obj.type === 'text') {
        name = obj.text || '文本'
        if (name.length > 20) {
          name = name.substring(0, 20) + '...'
        }
      } else {
        name = '图层'
      }
    }

    return {
      id: obj.id,
      type: obj.type,
      name: name,
      visible: obj.visible,
      locked: obj.lockMovementX, // 假设锁定是统一的
      text: obj.text || '',
      src: obj.getSrc ? obj.getSrc() : '',
      // 基础变换属性
      left: obj.left,
      top: obj.top,
      width: obj.width * obj.scaleX, // 计算实际宽度
      height: obj.height * obj.scaleY, // 计算实际高度
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle,
      flipX: obj.flipX,
      flipY: obj.flipY,
      opacity: obj.opacity,
      // 样式属性
      fill: obj.fill,
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      textAlign: obj.textAlign,
      fontWeight: obj.fontWeight,
      fontStyle: obj.fontStyle,
      underline: obj.underline,
      linethrough: obj.linethrough
    }
  })

  store.dispatch('updateLayers', layerData)
}

// 选中对象变化回调
const handleSelectionChange = (id) => {
  store.dispatch('setActiveObject', id)
}

// 历史记录变化回调
const handleHistoryChange = ({ length, step }) => {
  historyLength.value = length
  historyStep.value = step
}

// 处理新建画布
const handleCreateCanvas = ({ width, height, backgroundColor }) => {
  isInitialized.value = true
  nextTick(() => {
    initCanvas({ width, height, backgroundColor })
  })
}

// 打开图片（首页）
const handleOpenImage = () => {
  document.getElementById('start-file-input').click()
}

// 处理首页图片上传
const handleStartScreenImageUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (f) => {
    const imgObj = new Image()
    imgObj.src = f.target.result
    imgObj.onload = () => {
      isInitialized.value = true
      nextTick(() => {
        // 需求：默认新建一个与图片大小保持一致的透明背景图层和图片图层
        // 这里我们将画布设为图片大小，背景设为透明
        initCanvas({
          width: imgObj.width,
          height: imgObj.height,
          backgroundColor: 'transparent',
          image: imgObj
        })
      })
    }
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

// 监听 Vuex activeObjectId 变化，同步选中状态到 Canvas
watch(activeObjectId, (newId) => {
  if (canvasManager.value) {
    canvasManager.value.setActiveObject(newId)
  }
})

// 处理工具栏事件
const handleToolSelected = (tool) => {
  if (!canvasManager.value) return
  if (tool === 'text') {
    canvasManager.value.addText()
  } else if (tool === 'image') {
    // 触发文件选择
    document.getElementById('file-input').click()
  } else if (tool.startsWith('shape-')) {
    const type = tool.split('-')[1]
    canvasManager.value.addShape(type)
  }
}

// 图片替换
const handleImageReplace = (file) => {
  if (!canvasManager.value) return
  const reader = new FileReader()
  reader.onload = (f) => {
    canvasManager.value.replaceActiveImage(f.target.result)
  }
  reader.readAsDataURL(file)
}

// 处理图片上传
const handleImageUpload = (e) => {
  if (!canvasManager.value) return
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (f) => {
    canvasManager.value.addImage(f.target.result)
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

// 处理属性变更
const handlePropertyChange = ({ property, value }) => {
  if (canvasManager.value) {
    canvasManager.value.setObjectProperty(property, value)
  }
}

// 处理图层操作
const handleLayerSelect = (layerId) => {
  store.dispatch('setActiveObject', layerId)
}

const handleLayerReorder = (newLayers) => {
  if (canvasManager.value) {
    const newLayerIds = newLayers.map((l) => l.id)
    canvasManager.value.reorderLayers(newLayerIds)
  }
}

const handleLayerLock = (layer) => {
  if (canvasManager.value) {
    canvasManager.value.setLayerLocked(layer.id, !layer.locked)
  }
}

const handleLayerVisible = (layer) => {
  if (canvasManager.value) {
    canvasManager.value.setLayerVisible(layer.id, !layer.visible)
  }
}

const handleLayerDelete = (layerId) => {
  if (canvasManager.value) {
    canvasManager.value.deleteLayer(layerId)
  }
}

// 导出图片
const handleExport = () => {
  if (!canvasManager.value) return

  const dataURL = canvasManager.value.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: 2 // 导出2倍图，清晰度更高
  })

  if (dataURL) {
    const link = document.createElement('a')
    link.download = `editor-image-${Date.now()}.png`
    link.href = dataURL
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

const undo = () => {
  if (canvasManager.value) {
    canvasManager.value.undo()
  }
}

const redo = () => {
  if (canvasManager.value) {
    canvasManager.value.redo()
  }
}

const handleKeydown = (e) => {
  if (!canvasManager.value) return

  // 如果正在输入缩放比例，不处理删除键
  if (isZoomInputFocused.value) return

  if (e.key === 'Backspace' || e.key === 'Delete') {
    // 只有当鼠标悬浮在画布区域时才允许删除（避免误删）
    if (isMouseOverCanvas.value) {
      canvasManager.value.deleteActiveObject()
    }
  }

  // Undo: Ctrl+Z / Cmd+Z
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  }

  // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
  if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
    e.preventDefault()
    redo()
  }

  // Copy: Ctrl+C / Cmd+C
  if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
    e.preventDefault()
    if (canvasManager.value) {
      canvasManager.value.copy()
    }
  }

  // Paste: Ctrl+V / Cmd+V
  if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
    e.preventDefault()
    if (canvasManager.value) {
      canvasManager.value.paste()
    }
  }
}

// 缩放控制
const handleZoomIn = () => {
  zoom.value = parseFloat(Math.min(zoom.value + 0.1, 5).toFixed(1))
  if (canvasManager.value) {
    canvasManager.value.setZoom(zoom.value)
  }
}

const handleZoomOut = () => {
  zoom.value = parseFloat(Math.max(zoom.value - 0.1, 0.1).toFixed(1))
  if (canvasManager.value) {
    canvasManager.value.setZoom(zoom.value)
  }
}

// 参考线控制
const handleGuideCommand = (command) => {
  if (!canvasManager.value) return
  if (command === 'h') {
    canvasManager.value.addGuide('horizontal')
  } else if (command === 'v') {
    canvasManager.value.addGuide('vertical')
  } else if (command === 'clear') {
    canvasManager.value.clearGuides()
  }
}

// 缩放输入处理
const handleZoomInputChange = (val) => {
  const numVal = parseInt(val)

  // 如果是非法输入，重置为当前缩放比例
  if (isNaN(numVal)) {
    zoomInputVal.value = Math.round(zoom.value * 100)
    return
  }

  let newZoom = numVal / 100

  // 限制范围 10% - 500%
  if (newZoom < 0.1) newZoom = 0.1
  if (newZoom > 5) newZoom = 5

  // 更新缩放比例
  if (zoom.value !== newZoom) {
    zoom.value = newZoom
    if (canvasManager.value) {
      canvasManager.value.setZoom(newZoom)
    }
  } else {
    // 如果值没变（例如输入了相同的值，或者被限制了），手动重置输入框显示（去除前导零等）
    zoomInputVal.value = Math.round(newZoom * 100)
  }
}
</script>

<template>
  <div class="editor-layout">
    <!-- 欢迎/开始页面 -->

    <!-- 编辑器界面 -->
    <el-header class="app-header">
      <div class="logo">
        <img src="/icon.png" alt="logo" width="32" height="32" />
        <span class="title">Fabix 绘坊</span>
      </div>

      <div class="history-actions">
        <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
          <el-button circle :icon="RefreshLeft" :disabled="historyStep <= 0" @click="undo" />
        </el-tooltip>
        <el-tooltip content="重做 (Ctrl+Shift+Z)" placement="bottom">
          <el-button circle :icon="RefreshRight" :disabled="historyStep >= historyLength - 1" @click="redo" />
        </el-tooltip>
      </div>

      <div class="actions">
        <el-button type="primary" v-if="isInitialized" size="small" :icon="Download" @click="handleExport">导出图片</el-button>
      </div>
    </el-header>

    <el-container class="main-container">
      <el-aside width="200px" class="left-panel">
        <div class="left-panel-content" v-if="isInitialized">
          <div class="toolbar-container">
            <Toolbar @tool-selected="handleToolSelected" />
            <input type="file" id="file-input" accept="image/*" style="display: none" @change="handleImageUpload" />
          </div>
          <div class="panel-divider"></div>
          <div class="layer-panel-container">
            <h3 class="panel-title">图层管理</h3>
            <LayerPanel
              :layers="layers"
              :active-id="activeObjectId"
              @select="handleLayerSelect"
              @delete="handleLayerDelete"
              @reorder="handleLayerReorder"
              @lock="handleLayerLock"
              @visible="handleLayerVisible"
            />
          </div>
        </div>
        <div v-else class="empty-content">
          <el-icon :size="64" color="#E5E6EB"><Picture /></el-icon>
          <p>请先【创建画布】</p>
        </div>
      </el-aside>

      <el-main class="canvas-area" @mouseenter="isMouseOverCanvas = true" @mouseleave="isMouseOverCanvas = false">
        <div v-if="!isInitialized" class="start-screen">
          <div class="start-card">
            <div class="brand-info">
              <img src="/icon.png" alt="logo" width="64" height="64" class="brand-logo" />
              <h1 class="brand-title">Fabix 绘坊</h1>
              <p class="brand-slogan">Vue 画布，随心绘编</p>
            </div>

            <el-button type="primary" size="large" class="start-btn primary" @click="handleOpenImage">
              <el-icon class="icon"><Upload /></el-icon>
              打开图片
            </el-button>

            <el-button size="large" class="start-btn" style="margin-left: 0" @click="showNewCanvasDialog = true">
              <el-icon class="icon"><Picture /></el-icon>
              新建画布
            </el-button>

            <div class="start-footer">
              您也可以粘贴与拖拽图片至此页面打开或
              <el-link type="primary" @click="showNewCanvasDialog = true">新建画布</el-link>
            </div>

            <input type="file" id="start-file-input" accept="image/*" style="display: none" @change="handleStartScreenImageUpload" />
          </div>

          <!-- 新建画布弹窗 -->
          <NewCanvasDialog v-model:visible="showNewCanvasDialog" @create="handleCreateCanvas" />
        </div>
        <template v-else>
          <div class="canvas-viewport">
            <div class="canvas-wrapper">
              <canvas ref="canvasRef"></canvas>
            </div>
          </div>

          <!-- 画布控制栏 -->
          <div class="canvas-controls">
            <div class="zoom-controls">
              <el-button circle size="small" :icon="ZoomOut" @click="handleZoomOut" />
              <el-input
                v-model="zoomInputVal"
                size="small"
                class="zoom-input"
                @change="handleZoomInputChange"
                @focus="isZoomInputFocused = true"
                @blur="isZoomInputFocused = false"
              >
                <template #suffix>%</template>
              </el-input>
              <el-button circle size="small" :icon="ZoomIn" @click="handleZoomIn" />
            </div>
            <div class="divider"></div>
            <div class="guide-controls">
              <el-dropdown trigger="click" @command="handleGuideCommand">
                <el-button circle size="small" :icon="Aim" title="参考线" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="h">添加横向参考线</el-dropdown-item>
                    <el-dropdown-item command="v">添加纵向参考线</el-dropdown-item>
                    <el-dropdown-item command="clear" divided>清除参考线</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </template>
      </el-main>

      <el-aside width="300px" class="right-panel">
        <div class="right-panel-content" v-if="isInitialized">
          <PropertyPanel :active-object="activeLayer" @property-change="handlePropertyChange" @image-replace="handleImageReplace" />
        </div>
        <div v-else class="empty-content">
          <el-icon :size="64" color="#E5E6EB"><Picture /></el-icon>
          <p>请先【创建画布】</p>
        </div>
      </el-aside>
    </el-container>

    <!-- 底部版权信息 -->
    <div class="app-footer">© 2025 Fabix 绘坊. All Rights Reserved.</div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.editor-layout {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background-color: $bg-color;
}

// 开始页面样式
.start-screen {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f2f5;

  .start-card {
    background: #fff;
    padding: 60px 80px;
    border-radius: 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    /* 避免被底部遮挡 */
    margin-bottom: 40px;

    .brand-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;

      .brand-logo {
        margin-bottom: 16px;
      }

      .brand-title {
        font-size: 32px;
        font-weight: 600;
        color: #1d2129;
        margin: 0 0 8px;
        letter-spacing: 1px;
      }

      .brand-slogan {
        font-size: 16px;
        color: #86909c;
        margin: 0;
        letter-spacing: 2px;
      }
    }

    .start-btn {
      width: 280px;
      height: 48px;
      font-size: 16px;
      border-radius: 8px;

      .icon {
        margin-right: 8px;
        font-size: 18px;
      }

      &.primary {
        background-color: #1890ff;
        border-color: #1890ff;

        &:hover {
          background-color: #40a9ff;
          border-color: #40a9ff;
        }
      }
    }

    .start-footer {
      margin-top: 16px;
      color: #8c8c8c;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }
}

.app-header {
  height: $header-height !important;
  background-color: $bg-color-white;
  border-bottom: 1px solid $border-color-light;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: $shadow-sm;
  z-index: 20;

  .logo {
    display: flex;
    align-items: center;
    gap: 12px;

    .title {
      font-size: 18px;
      font-weight: 600;
      color: $text-primary;
    }
  }
}

.app-footer {
  height: 32px;
  background-color: #fff;
  border-top: 1px solid #f2f3f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #86909c;
  flex-shrink: 0;
  z-index: 20;
}

.main-container {
  flex: 1;
  overflow: hidden;
}

.left-panel {
  width: 200px;
  background-color: $bg-color-white;
  border-right: 1px solid $border-color-light;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.left-panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  color: #86909c;
}

.toolbar-container {
  padding: 16px 0;
  display: flex;
  justify-content: center;
}

.canvas-area {
  background-color: $bg-color;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 0;
  overflow: hidden;
}

.canvas-viewport {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
}

.canvas-wrapper {
  box-shadow: $shadow-lg;
  background-color: white;
  transition: transform 0.2s ease-out;

  // 画布背景网格
  background-image: linear-gradient(45deg, #e6e6e6 25%, transparent 25%), linear-gradient(-45deg, #e6e6e6 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e6e6e6 75%), linear-gradient(-45deg, transparent 75%, #e6e6e6 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

.right-panel {
  width: 300px !important;
  background-color: $bg-color-white;
  border-left: 1px solid $border-color-light;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.right-panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.panel-divider {
  height: 1px;
  background-color: $border-color-light;
  margin: 0;
}

.layer-panel-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-bottom: 16px;

  .panel-title {
    padding: 16px 20px 8px;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }
}

.canvas-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: white;
  padding: 8px 16px;
  border-radius: 8px;
  box-shadow: $shadow-md;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 100;

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 8px;

    .zoom-input {
      width: 64px;

      :deep(.el-input__wrapper) {
        padding: 0 4px;
        box-shadow: none;
        background: transparent;

        &:hover {
          box-shadow: none;
          background: #f5f5f5;
        }

        &.is-focus {
          box-shadow: 0 0 0 1px $primary-color;
          background: white;
        }
      }

      :deep(.el-input__inner) {
        text-align: center;
        padding-right: 0;
      }

      :deep(.el-input__suffix) {
        margin-left: 2px;
      }
    }
  }

  .divider {
    width: 1px;
    height: 16px;
    background-color: $border-color-light;
  }
}
</style>
