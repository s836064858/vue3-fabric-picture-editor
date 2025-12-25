<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useStore } from 'vuex'
import * as fabric from 'fabric'
import { Edit, RefreshLeft, RefreshRight, Download, Upload, Picture } from '@element-plus/icons-vue'
import Toolbar from './Toolbar.vue'
import PropertyPanel from './PropertyPanel.vue'
import LayerPanel from './LayerPanel.vue'
import NewCanvasDialog from './NewCanvasDialog.vue'

const store = useStore()

// 画布引用
const canvasRef = ref(null)
// Fabric.js 画布实例
let canvas = null

// 状态管理
const isInitialized = ref(false)
const showNewCanvasDialog = ref(false)

// 历史记录相关
const history = ref([])
const historyStep = ref(-1)
const isHistoryProcessing = ref(false)
const MAX_HISTORY = 50

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
  if (canvas) {
    canvas.dispose()
    canvas = null
  }
  window.removeEventListener('keydown', handleKeydown)
})

// 初始化画布
const initCanvas = (options = {}) => {
  const { width = 800, height = 600, backgroundColor = '#ffffff', image = null } = options

  canvas = new fabric.Canvas(canvasRef.value, {
    width: width,
    height: height,
    backgroundColor: backgroundColor === 'transparent' ? null : backgroundColor,
    preserveObjectStacking: true
  })

  // 监听画布事件
  canvas.on('selection:created', handleSelection)
  canvas.on('selection:updated', handleSelection)
  canvas.on('selection:cleared', handleSelectionCleared)

  // 历史记录和状态同步
  canvas.on('object:modified', saveHistory)
  canvas.on('object:added', (e) => {
    // 避免在加载 JSON 时触发历史记录
    if (!isHistoryProcessing.value) {
      saveHistory()
      updateStoreLayers()
    }
  })
  canvas.on('object:removed', (e) => {
    if (!isHistoryProcessing.value) {
      saveHistory()
      updateStoreLayers()
    }
  })

  // 实时同步
  canvas.on('object:moving', updateStoreLayers)
  canvas.on('object:scaling', updateStoreLayers)
  canvas.on('object:rotating', updateStoreLayers)
  // 监听文本修改完成，更新图层名称
  canvas.on('text:editing:exited', updateStoreLayers)
  canvas.on('text:changed', updateStoreLayers)

  // 如果有初始图片
  if (image) {
    const imgInstance = new fabric.Image(image)
    imgInstance.set({
      id: Date.now().toString()
    })
    // 确保图片不被拉伸，保持原始大小
    imgInstance.scaleX = 1
    imgInstance.scaleY = 1

    canvas.add(imgInstance)
    canvas.setActiveObject(imgInstance)
    canvas.centerObject(imgInstance)
  }

  // 初始同步
  updateStoreLayers()
  // 保存初始状态
  saveHistory()
  // 初始化辅助对齐线
  initAligningGuidelines(canvas)
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

// 辅助对齐线功能
const initAligningGuidelines = (canvas) => {
  const ctx = canvas.getSelectionContext()
  const aligningLineOffset = 5
  const aligningLineWidth = 1
  const aligningLineColor = '#1890FF'
  let viewportTransform
  let zoom = 1

  function drawVerticalLine(coords) {
    drawLine(coords.x + 0.5, coords.y1 > coords.y2 ? coords.y2 : coords.y1, coords.x + 0.5, coords.y1 > coords.y2 ? coords.y1 : coords.y2)
  }

  function drawHorizontalLine(coords) {
    drawLine(coords.x1 > coords.x2 ? coords.x2 : coords.x1, coords.y + 0.5, coords.x1 > coords.x2 ? coords.x1 : coords.x2, coords.y + 0.5)
  }

  function drawLine(x1, y1, x2, y2) {
    ctx.save()
    ctx.lineWidth = aligningLineWidth
    ctx.strokeStyle = aligningLineColor
    ctx.beginPath()
    ctx.moveTo(x1 * zoom + viewportTransform[4], y1 * zoom + viewportTransform[5])
    ctx.lineTo(x2 * zoom + viewportTransform[4], y2 * zoom + viewportTransform[5])
    ctx.stroke()
    ctx.restore()
  }

  function isInRange(value1, value2) {
    value1 = Math.round(value1)
    value2 = Math.round(value2)
    for (let i = value1 - aligningLineOffset; i <= value1 + aligningLineOffset; i++) {
      if (i === value2) {
        return true
      }
    }
    return false
  }

  const verticalLines = []
  const horizontalLines = []

  canvas.on('mouse:down', () => {
    viewportTransform = canvas.viewportTransform
    zoom = canvas.getZoom()
  })

  canvas.on('object:moving', (e) => {
    const activeObject = e.target
    const canvasObjects = canvas.getObjects()
    const activeObjectCenter = activeObject.getCenterPoint()
    const activeObjectLeft = activeObjectCenter.x
    const activeObjectTop = activeObjectCenter.y
    const activeObjectBoundingRect = activeObject.getBoundingRect()
    const activeObjectHeight = activeObjectBoundingRect.height / zoom
    const activeObjectWidth = activeObjectBoundingRect.width / zoom
    let horizontalInTheRange = false
    let verticalInTheRange = false

    if (!activeObject) return

    // 每次移动前清空
    verticalLines.length = 0
    horizontalLines.length = 0

    // 画布中心对齐检测
    const canvasWidth = canvas.width / zoom
    const canvasHeight = canvas.height / zoom

    // 垂直中心（X轴居中）
    if (isInRange(canvasWidth / 2, activeObjectLeft)) {
      verticalInTheRange = true
      verticalLines.push({
        x: canvasWidth / 2,
        y1: 0,
        y2: canvasHeight
      })
      activeObject.setPositionByOrigin(new fabric.Point(canvasWidth / 2, activeObjectTop), 'center', 'center')
    }

    // 水平中心（Y轴居中）
    if (isInRange(canvasHeight / 2, activeObjectTop)) {
      horizontalInTheRange = true
      horizontalLines.push({
        y: canvasHeight / 2,
        x1: 0,
        x2: canvasWidth
      })
      activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, canvasHeight / 2), 'center', 'center')
    }

    // 对象间对齐检测
    for (let i = canvasObjects.length; i--; ) {
      if (canvasObjects[i] === activeObject) continue
      if (!canvasObjects[i].visible) continue // 忽略不可见对象
      if (canvasObjects[i].type === 'line' && canvasObjects[i].excludeFromAlignment) continue

      const objectCenter = canvasObjects[i].getCenterPoint()
      const objectLeft = objectCenter.x
      const objectTop = objectCenter.y
      const objectBoundingRect = canvasObjects[i].getBoundingRect()
      const objectHeight = objectBoundingRect.height / zoom
      const objectWidth = objectBoundingRect.width / zoom

      // snap by the horizontal center line
      if (isInRange(objectLeft, activeObjectLeft)) {
        verticalInTheRange = true
        verticalLines.push({
          x: objectLeft,
          y1: Math.min(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2),
          y2: Math.max(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(objectLeft, activeObjectTop), 'center', 'center')
      }

      // snap by the left edge
      if (isInRange(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2)) {
        verticalInTheRange = true
        verticalLines.push({
          x: objectLeft - objectWidth / 2,
          y1: Math.min(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2),
          y2: Math.max(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(objectLeft - objectWidth / 2 + activeObjectWidth / 2, activeObjectTop), 'center', 'center')
      }

      // snap by the right edge
      if (isInRange(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)) {
        verticalInTheRange = true
        verticalLines.push({
          x: objectLeft + objectWidth / 2,
          y1: Math.min(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2),
          y2: Math.max(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(objectLeft + objectWidth / 2 - activeObjectWidth / 2, activeObjectTop), 'center', 'center')
      }

      // snap by the vertical center line
      if (isInRange(objectTop, activeObjectTop)) {
        horizontalInTheRange = true
        horizontalLines.push({
          y: objectTop,
          x1: Math.min(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2),
          x2: Math.max(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, objectTop), 'center', 'center')
      }

      // snap by the top edge
      if (isInRange(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2)) {
        horizontalInTheRange = true
        horizontalLines.push({
          y: objectTop - objectHeight / 2,
          x1: Math.min(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2),
          x2: Math.max(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, objectTop - objectHeight / 2 + activeObjectHeight / 2), 'center', 'center')
      }

      // snap by the bottom edge
      if (isInRange(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)) {
        horizontalInTheRange = true
        horizontalLines.push({
          y: objectTop + objectHeight / 2,
          x1: Math.min(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2),
          x2: Math.max(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, objectTop + objectHeight / 2 - activeObjectHeight / 2), 'center', 'center')
      }
    }

    if (!horizontalInTheRange) {
      horizontalLines.length = 0
    }

    if (!verticalInTheRange) {
      verticalLines.length = 0
    }
  })

  canvas.on('before:render', () => {
    try {
      canvas.clearContext(canvas.getSelectionContext())
    } catch (e) {
      // ignore
    }
  })

  canvas.on('after:render', () => {
    for (let i = verticalLines.length; i--; ) {
      drawVerticalLine(verticalLines[i])
    }
    for (let i = horizontalLines.length; i--; ) {
      drawHorizontalLine(horizontalLines[i])
    }
  })

  canvas.on('mouse:up', () => {
    verticalLines.length = 0
    horizontalLines.length = 0
    canvas.requestRenderAll()
  })
}

// 历史记录管理
const saveHistory = () => {
  if (isHistoryProcessing.value) return
  if (!canvas) return

  // 如果当前处于历史记录中间，删除后面的记录
  if (historyStep.value < history.value.length - 1) {
    history.value = history.value.slice(0, historyStep.value + 1)
  }

  // 保存当前状态
  const json = JSON.stringify(canvas.toJSON())
  history.value.push(json)
  historyStep.value++

  // 限制历史记录长度
  if (history.value.length > MAX_HISTORY) {
    history.value.shift()
    historyStep.value--
  }

  updateStoreLayers()
}

const undo = async () => {
  if (historyStep.value <= 0) return

  isHistoryProcessing.value = true
  historyStep.value--
  const json = history.value[historyStep.value]

  await loadCanvasState(json)
  isHistoryProcessing.value = false
  updateStoreLayers()
}

const redo = async () => {
  if (historyStep.value >= history.value.length - 1) return

  isHistoryProcessing.value = true
  historyStep.value++
  const json = history.value[historyStep.value]

  await loadCanvasState(json)
  isHistoryProcessing.value = false
  updateStoreLayers()
}

const loadCanvasState = async (json) => {
  if (!canvas) return

  // 记住当前选中的对象 ID，尝试在恢复后重新选中
  const currentActiveId = store.state.activeObjectId

  await canvas.loadFromJSON(JSON.parse(json))

  // 恢复后需要重新绑定对象的自定义属性（如果有的话），这里主要是为了确保对象能正常交互
  canvas.getObjects().forEach((obj) => {
    if (!obj.id) obj.id = Math.random().toString(36).substr(2, 9)
  })

  canvas.requestRenderAll()

  // 尝试恢复选中状态
  if (currentActiveId) {
    const objectToSelect = canvas.getObjects().find((obj) => obj.id === currentActiveId)
    if (objectToSelect) {
      canvas.setActiveObject(objectToSelect)
    } else {
      canvas.discardActiveObject()
      store.dispatch('setActiveObject', null)
    }
  }
}

// 处理选择事件
const handleSelection = (e) => {
  const selected = e.selected[0]
  if (selected) {
    // 确保存储唯一的 ID
    if (!selected.id) {
      selected.id = Date.now().toString()
    }
    store.dispatch('setActiveObject', selected.id)
  }
}

const handleSelectionCleared = () => {
  store.dispatch('setActiveObject', null)
}

// 同步 Fabric 对象到 Vuex
const updateStoreLayers = () => {
  if (!canvas) return
  const objects = canvas.getObjects()
  // 给所有对象确保有 ID
  objects.forEach((obj) => {
    if (!obj.id) obj.id = Math.random().toString(36).substr(2, 9)
  })

  // 转换对象为简单数据结构存储在 Vuex
  const layerData = objects.map((obj) => {
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
      locked: obj.lockMovementX,
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

// 监听 Vuex activeObjectId 变化，同步选中状态到 Canvas
watch(activeObjectId, (newId) => {
  if (!canvas) return
  const activeObject = canvas.getActiveObject()

  // 如果当前选中的对象 ID 与 Vuex 中的一致，则不需要操作
  if (activeObject && activeObject.id === newId) return

  if (newId) {
    const objectToSelect = canvas.getObjects().find((obj) => obj.id === newId)
    if (objectToSelect) {
      canvas.setActiveObject(objectToSelect)
      canvas.requestRenderAll()
    }
  } else {
    canvas.discardActiveObject()
    canvas.requestRenderAll()
  }
})

// 处理工具栏事件
const handleToolSelected = (tool) => {
  if (tool === 'text') {
    addText()
  } else if (tool === 'image') {
    // 触发文件选择
    document.getElementById('file-input').click()
  }
}

// 图片替换
const handleImageReplace = (file) => {
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.type !== 'image') return

  const reader = new FileReader()
  reader.onload = (f) => {
    const imgObj = new Image()
    imgObj.src = f.target.result
    imgObj.onload = () => {
      activeObject.setSrc(f.target.result, () => {
        // 保持原有的位置和尺寸逻辑，或者选择重置
        // 这里我们选择让新图片适应原有宽度，或者保持比例
        // 简单起见，这里直接刷新
        canvas.requestRenderAll()
        updateStoreLayers()
        saveHistory()
      })
    }
  }
  reader.readAsDataURL(file)
}

// 添加文本
const addText = () => {
  const text = new fabric.IText('双击编辑文本', {
    fontFamily: 'PingFang SC',
    fill: '#333333',
    fontSize: 24,
    id: Date.now().toString()
  })
  canvas.add(text)
  canvas.centerObject(text)
  canvas.setActiveObject(text)
  updateStoreLayers()
}

// 处理图片上传
const handleImageUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (f) => {
    const imgObj = new Image()
    imgObj.src = f.target.result
    imgObj.onload = () => {
      const imgInstance = new fabric.Image(imgObj)

      // 调整图片大小以适应画布
      if (imgInstance.width > 400) {
        imgInstance.scaleToWidth(400)
      }

      imgInstance.set({
        id: Date.now().toString()
      })

      canvas.add(imgInstance)
      canvas.centerObject(imgInstance)
      canvas.setActiveObject(imgInstance)
      updateStoreLayers()
    }
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

// 处理属性变更
const handlePropertyChange = ({ property, value }) => {
  const activeObject = canvas.getActiveObject()
  if (activeObject) {
    if (['fontSize', 'fill', 'fontFamily', 'textAlign', 'fontWeight', 'fontStyle', 'underline', 'linethrough'].includes(property)) {
      // 样式属性
      // 注意：PropertyPanel 已经传来了正确的值（如 'bold'/'normal', 'italic'/'normal'）
      // 所以这里不需要再做布尔值转换，直接赋值即可
      activeObject.set(property, value)

      // 特殊处理字体加载：确保字体加载完成后重新渲染
      if (property === 'fontFamily' && document.fonts) {
        // 构建字体字符串用于加载检测
        const fontString = `${activeObject.fontStyle || 'normal'} ${activeObject.fontWeight || 'normal'} ${activeObject.fontSize || 24}px "${value}"`

        // 显式加载字体
        document.fonts
          .load(fontString)
          .then((fontFaces) => {
            // 再次设置字体以确保应用
            activeObject.set('fontFamily', value)
            // 强制刷新缓存
            activeObject.dirty = true
            activeObject.setCoords()
            canvas.requestRenderAll()
            updateStoreLayers()
            console.log('字体加载成功:', value)
          })
          .catch((err) => {
            console.error('字体加载失败:', err)
          })
      }
    } else if (property === 'text') {
      activeObject.set('text', value)
    } else if (property === 'src' && activeObject.type === 'image') {
      // 图片源替换，实际上应该通过 handleImageReplace 处理，这里留个接口以防万一
    } else if (property === 'locked') {
      // 处理锁定状态
      const isLocked = value
      activeObject.set({
        lockMovementX: isLocked,
        lockMovementY: isLocked,
        lockRotation: isLocked,
        lockScalingX: isLocked,
        lockScalingY: isLocked,
        selectable: !isLocked
      })
    } else if (property === 'visible') {
      // 处理可见性
      activeObject.set('visible', value)
    } else {
      // 布局属性
      activeObject.set(property, value)
    }
    // 特殊处理：如果改变了宽/高，可能需要重新计算 scale
    if (property === 'width' && activeObject.type === 'image') {
      activeObject.scaleToWidth(value)
    } else if (property === 'height' && activeObject.type === 'image') {
      activeObject.scaleToHeight(value)
    }

    activeObject.setCoords()
    canvas.requestRenderAll()
    updateStoreLayers()
  }
}

// 处理图层操作
const handleLayerSelect = (layerId) => {
  store.dispatch('setActiveObject', layerId)
}

const handleLayerReorder = (newLayers) => {
  if (!canvas) return

  // newLayers 是 UI 上的顺序 (Top -> Bottom)
  // 我们需要将其反转为 Fabric.js 的顺序 (Bottom -> Top)
  const desiredOrderIds = [...newLayers].reverse().map((l) => l.id)

  // 按照 ID 列表重新排序 Fabric 对象
  // Fabric 没有直接的 sort 方法，我们需要遍历并移动对象
  desiredOrderIds.forEach((id, index) => {
    const object = canvas.getObjects().find((obj) => obj.id === id)
    if (object) {
      // 移动对象到指定索引
      canvas.moveObjectTo(object, index)
    }
  })

  canvas.requestRenderAll()
  updateStoreLayers()
}

const handleLayerLock = (layer) => {
  if (!canvas) return
  const object = canvas.getObjects().find((obj) => obj.id === layer.id)
  if (object) {
    // 切换锁定状态
    const isLocked = !layer.locked
    object.set({
      lockMovementX: isLocked,
      lockMovementY: isLocked,
      lockRotation: isLocked,
      lockScalingX: isLocked,
      lockScalingY: isLocked,
      selectable: !isLocked // 锁定后不可选
    })

    // 如果被锁定且当前是选中状态，取消选中
    if (isLocked && canvas.getActiveObject() === object) {
      canvas.discardActiveObject()
    }

    canvas.requestRenderAll()
    updateStoreLayers()
  }
}

const handleLayerVisible = (layer) => {
  if (!canvas) return
  const object = canvas.getObjects().find((obj) => obj.id === layer.id)
  if (object) {
    // 切换可见性
    const isVisible = !layer.visible
    object.set('visible', isVisible)

    canvas.requestRenderAll()
    updateStoreLayers()
  }
}

const handleLayerDelete = (layerId) => {
  const object = canvas.getObjects().find((obj) => obj.id === layerId)
  if (object) {
    canvas.remove(object)
    canvas.discardActiveObject()
    updateStoreLayers()
  }
}

// 导出图片
const handleExport = () => {
  if (!canvas) return

  // 取消选中状态，避免导出选中框
  canvas.discardActiveObject()
  canvas.requestRenderAll()

  const dataURL = canvas.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: 2 // 导出2倍图，清晰度更高
  })

  const link = document.createElement('a')
  link.download = `editor-image-${Date.now()}.png`
  link.href = dataURL
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const handleKeyboardDelete = () => {
  const activeObject = canvas.getActiveObject()
  if (activeObject) {
    // 文本编辑状态下不删除
    if (activeObject.isEditing) return
    canvas.remove(activeObject)
    canvas.discardActiveObject()
    updateStoreLayers()
  }
}

const handleKeydown = (e) => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    handleKeyboardDelete()
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
}
</script>

<template>
  <div class="editor-layout">
    <!-- 欢迎/开始页面 -->

    <!-- 编辑器界面 -->
    <el-header class="app-header">
      <div class="logo">
        <img src="/icon.png" alt="logo" width="32" height="32" />
        <span class="title">Vue3 图片编辑器</span>
      </div>

      <div class="history-actions">
        <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
          <el-button circle :icon="RefreshLeft" :disabled="historyStep <= 0" @click="undo" />
        </el-tooltip>
        <el-tooltip content="重做 (Ctrl+Shift+Z)" placement="bottom">
          <el-button circle :icon="RefreshRight" :disabled="historyStep >= history.length - 1" @click="redo" />
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
          <el-icon :size="64" color="#E5E6EB"><Pointer /></el-icon>
          <p>先创建画布</p>
        </div>
      </el-aside>

      <el-main class="canvas-area">
        <div v-if="!isInitialized" class="start-screen">
          <div class="start-card">
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
        <div v-else class="canvas-wrapper">
          <canvas ref="canvasRef"></canvas>
        </div>
      </el-main>

      <el-aside width="300px" class="right-panel">
        <div class="right-panel-content">
          <PropertyPanel :active-object="activeLayer" @property-change="handlePropertyChange" @image-replace="handleImageReplace" />
        </div>
      </el-aside>
    </el-container>
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
  justify-content: center;
  align-items: center;
  padding: 40px;
  overflow: auto;
  position: relative;
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
</style>
