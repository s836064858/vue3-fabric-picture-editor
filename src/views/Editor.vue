<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick, shallowRef, markRaw } from 'vue'
import { useStore } from 'vuex'
import { RefreshLeft, RefreshRight, Download, Upload, Picture, ZoomIn, ZoomOut, Aim } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import Toolbar from '@/components/Toolbar.vue'
import PropertyPanel from '@/components/PropertyPanel.vue'
import LayerPanel from '@/components/LayerPanel.vue'
import NewCanvasDialog from '@/components/NewCanvasDialog.vue'
import { CanvasManager } from '@/utils/canvas-manager'
import { callAIElimination, callAIMatting } from '@/api/ai-service'
import settings from '@/config/settings'

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
const isDragging = ref(false)
let dragCounter = 0

// 水印状态
const isWatermarkEnabled = ref(false)

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
  window.addEventListener('paste', handlePaste)
})

// 清理资源
onUnmounted(() => {
  if (canvasManager.value) {
    canvasManager.value.dispose()
    canvasManager.value = null
  }
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('paste', handlePaste)
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
  const layerObjects = objects.filter((obj) => !obj.isGuide && obj.id !== 'selection-group' && obj.name !== 'AI选区')

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

// 处理图片文件加载
const processImageFile = (file) => {
  if (!file || !file.type.startsWith('image/')) return

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
}

// 处理首页图片上传
const handleStartScreenImageUpload = (e) => {
  const file = e.target.files[0]
  processImageFile(file)
  e.target.value = ''
}

// 处理粘贴事件
const handlePaste = (e) => {
  // 仅在未初始化（首页）时处理粘贴
  if (isInitialized.value) return

  const items = e.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile()
      processImageFile(file)
      break
    }
  }
}

// 处理拖拽事件
const handleDragEnter = () => {
  if (isInitialized.value) return
  dragCounter++
  if (dragCounter === 1) {
    isDragging.value = true
  }
}

const handleDragLeave = () => {
  if (isInitialized.value) return
  dragCounter--
  if (dragCounter === 0) {
    isDragging.value = false
  }
}

const handleDrop = (e) => {
  if (isInitialized.value) return
  isDragging.value = false
  dragCounter = 0

  const file = e.dataTransfer?.files[0]
  processImageFile(file)
}

// 监听 Vuex activeObjectId 变化，同步选中状态到 Canvas
watch(activeObjectId, (newId) => {
  if (canvasManager.value) {
    canvasManager.value.setActiveObject(newId)
  }
})

// 处理 AI 选区模式
const handleAISelectionMode = (type) => {
  if (canvasManager.value) {
    canvasManager.value.startSelection(type)
  }
}

// 处理 AI 消除
const handleAIEliminate = async ({ apiKey, onDone }) => {
  if (!canvasManager.value) return

  // 1. 检查条件
  const check = canvasManager.value.canPerformElimination()
  if (!check.valid) {
    ElMessage.warning(check.message)
    onDone()
    return
  }
  if (check.warning) {
    ElMessage.warning(check.warning)
  }

  try {
    // 2. 获取输入图片 (含选区)
    const inputImage = canvasManager.value.getAIInputImage()
    if (!inputImage) {
      ElMessage.error('获取图片数据失败')
      onDone()
      return
    }

    // 3. 调用 API
    const size = `${canvasManager.value.originalWidth}x${canvasManager.value.originalHeight}`
    const resultBase64 = await callAIElimination({ apiKey, image: inputImage, size })

    // 4. 更新画布
    canvasManager.value.clearSelection()
    canvasManager.value.hideEliminationBaseLayer()
    canvasManager.value.addEliminationResultImage(resultBase64)

    ElMessage.success('消除完成')
  } catch (error) {
    ElMessage.error(error.message || '消除失败')
  } finally {
    onDone()
  }
}

const handleAIMatting = async ({ apiKey, onDone }) => {
  if (!canvasManager.value) return

  const check = canvasManager.value.canPerformMatting()
  if (!check.valid) {
    ElMessage.warning(check.message)
    onDone()
    return
  }
  if (check.warning) {
    ElMessage.warning(check.warning)
  }

  try {
    const inputImage = canvasManager.value.getAIMattingInputImage()
    if (!inputImage) {
      ElMessage.error('获取图片数据失败')
      onDone()
      return
    }

    const size = `${canvasManager.value.originalWidth}x${canvasManager.value.originalHeight}`
    const resultBase64 = await callAIMatting({ apiKey, image: inputImage, size })

    canvasManager.value.clearSelection()
    canvasManager.value.hideEliminationBaseLayer()
    canvasManager.value.addEliminationResultImage(resultBase64)

    ElMessage.success('抠图完成')
  } catch (error) {
    ElMessage.error(error.message || '抠图失败')
  } finally {
    onDone()
  }
}

// 处理工具栏事件
const handleToolSelected = (tool) => {
  if (!canvasManager.value) return

  // 处理停止 AI 选区
  if (tool === 'ai-stop') {
    canvasManager.value.endSelection()
    return
  }

  const [category, type] = tool.split('-')

  // 除非是涂鸦模式开启，否则重置绘图状态
  if (category !== 'doodle') {
    canvasManager.value.setDrawingMode(false)
  }

  switch (category) {
    case 'text': {
      const textConfig = {
        title: { text: '添加标题', fontSize: 36, fontWeight: 'bold' },
        subtitle: { text: '添加副标题', fontSize: 24, fontWeight: 'bold' },
        body: { text: '添加正文内容', fontSize: 16, fontWeight: 'normal' }
      }
      if (textConfig[type]) {
        canvasManager.value.addText(textConfig[type])
      }
      break
    }

    case 'image':
      // 触发文件选择
      document.getElementById('file-input').click()
      break

    case 'shape':
      if (['line', 'dashed', 'arrow'].includes(type)) {
        canvasManager.value.startLineDrawing(type)
      } else {
        canvasManager.value.addShape(type)
      }
      break

    case 'doodle':
      canvasManager.value.setDrawingMode(type === 'start')
      break
  }
}

const handleDoodleUpdate = (settings) => {
  if (canvasManager.value) {
    canvasManager.value.setBrush(settings)
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
  const file = e.target.files[0]
  if (!file) return

  // 如果画布未初始化，使用 processImageFile 进行初始化
  if (!canvasManager.value) {
    processImageFile(file)
    e.target.value = ''
    return
  }

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
  const layer = layers.value.find((l) => l.id === layerId)
  if (layer && layer.locked) return
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

  let dataURL = ''
  try {
    dataURL = canvasManager.value.toDataURL(settings.export)
  } catch (error) {
    ElMessage.error(error?.message || '导出失败')
    return
  }

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
  const activeEl = document.activeElement
  const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)
  if (isTyping) return

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

// 水印控制
const handleWatermarkChange = (val) => {
  if (canvasManager.value) {
    canvasManager.value.toggleWatermark(val)
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
  <div class="editor-layout" @dragenter.prevent="handleDragEnter" @dragleave.prevent="handleDragLeave" @dragover.prevent @drop.prevent="handleDrop">
    <!-- 拖拽覆盖层 -->
    <div v-if="isDragging && !isInitialized" class="drag-overlay">
      <div class="drag-content">
        <el-icon :size="64" color="#fff"><Upload /></el-icon>
        <p>释放鼠标打开图片</p>
      </div>
    </div>

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
        <div class="action-item" v-if="isInitialized">
          <span class="label">水印</span>
          <el-switch v-model="isWatermarkEnabled" @change="handleWatermarkChange" size="small" />
        </div>
        <el-button type="primary" v-if="isInitialized" size="small" :icon="Download" @click="handleExport">导出图片</el-button>
      </div>
    </el-header>

    <el-container class="main-container">
      <el-aside width="73px" class="left-panel">
        <div class="left-panel-content">
          <div class="toolbar-container">
            <Toolbar
              :is-initialized="isInitialized"
              :has-layers="layers.length > 0"
              @tool-selected="handleToolSelected"
              @doodle-update="handleDoodleUpdate"
              @ai-selection-mode="handleAISelectionMode"
              @ai-eliminate="handleAIEliminate"
              @ai-matting="handleAIMatting"
            />
            <input type="file" id="file-input" accept="image/*" style="display: none" @change="handleImageUpload" />
          </div>
        </div>
      </el-aside>

      <el-main class="canvas-area" @mouseenter="isMouseOverCanvas = true" @mouseleave="isMouseOverCanvas = false">
        <div v-if="!isInitialized" class="start-screen" @dragover.prevent @drop.prevent="handleDrop">
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
          <div class="property-panel-wrapper">
            <PropertyPanel :active-object="activeLayer" @property-change="handlePropertyChange" @image-replace="handleImageReplace" />
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
    </el-container>

    <!-- 底部版权信息 -->
    <div class="app-footer">© 2026 Fabix 绘坊. All Rights Reserved.</div>
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

.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px);

  .drag-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px;
    border: 3px dashed #fff;
    border-radius: 16px;
    background-color: rgba(255, 255, 255, 0.1);

    p {
      font-size: 24px;
      color: #fff;
      font-weight: 500;
      margin: 0;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  }
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

  .actions {
    display: flex;
    align-items: center;
    gap: 16px;

    .action-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #606266;

      .label {
        font-weight: 500;
      }
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
  padding: 0;
  height: 100%;
  width: 100%;
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
  overflow: hidden;
}

.property-panel-wrapper {
  overflow-y: auto;
  flex-shrink: 0;
  height: 60%;
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
  min-height: 0; /* 关键：允许 flex 子项收缩 */

  .panel-title {
    padding: 16px 20px 8px;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
    flex-shrink: 0; /* 标题不收缩 */
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

.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.6); // 改为深色遮罩
  z-index: 9999; // 提高层级
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px); // 添加模糊效果

  .drag-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px;
    border: 3px dashed #fff; // 改为白色虚线
    border-radius: 16px;
    background-color: rgba(255, 255, 255, 0.1); // 轻微背景

    p {
      font-size: 24px;
      color: #fff; // 改为白色文字
      font-weight: 500;
      margin: 0;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  }
}
</style>
