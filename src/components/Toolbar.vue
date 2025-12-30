<script setup>
import { ref, watch } from 'vue'
import { Picture, Edit, Monitor, Close, EditPen } from '@element-plus/icons-vue'

const emit = defineEmits(['tool-selected', 'doodle-update'])

const activeDrawer = ref(null)
const doodleColor = ref('#000000')
const doodleWidth = ref(5)

const tools = [
  { id: 'text', name: '添加文字', icon: Edit, hasDrawer: true },
  { id: 'image', name: '上传图片', icon: Picture, hasDrawer: false },
  { id: 'shape', name: '添加形状', icon: Monitor, hasDrawer: true },
  { id: 'doodle', name: '涂鸦', icon: EditPen, hasDrawer: true }
]

const basicShapes = [
  { type: 'rect', label: '矩形' },
  { type: 'circle', label: '圆形' },
  { type: 'triangle', label: '三角形' }
]

const lineShapes = [
  { type: 'line', label: '直线' },
  { type: 'dashed', label: '虚线' },
  { type: 'arrow', label: '箭头' }
]

const textOptions = [
  { type: 'title', tag: 'h1', text: '添加标题' },
  { type: 'subtitle', tag: 'h2', text: '添加副标题' },
  { type: 'body', tag: 'p', text: '添加正文内容' }
]

const handleToolClick = (tool) => {
  const isDoodle = tool.id === 'doodle'
  const currentIsDoodle = activeDrawer.value === 'doodle'

  // 处理涂鸦模式切换
  if (currentIsDoodle && activeDrawer.value !== tool.id) {
    emit('tool-selected', 'doodle-stop')
  }

  if (tool.hasDrawer) {
    if (activeDrawer.value === tool.id) {
      activeDrawer.value = null
      if (isDoodle) emit('tool-selected', 'doodle-stop')
    } else {
      activeDrawer.value = tool.id
      if (isDoodle) {
        emit('tool-selected', 'doodle-start')
        emit('doodle-update', { color: doodleColor.value, width: doodleWidth.value })
      }
    }
  } else {
    activeDrawer.value = null
    emit('tool-selected', tool.id)
  }
}

const handleCloseDrawer = () => {
  if (activeDrawer.value === 'doodle') emit('tool-selected', 'doodle-stop')
  activeDrawer.value = null
}

const handleShapeClick = (shapeType) => {
  emit('tool-selected', `shape-${shapeType}`)
  activeDrawer.value = null
}

const handleTextClick = (textType) => {
  emit('tool-selected', `text-${textType}`)
  activeDrawer.value = null
}

// 监听涂鸦配置变化
watch([doodleColor, doodleWidth], ([color, width]) => {
  if (activeDrawer.value === 'doodle') {
    emit('doodle-update', { color, width })
  }
})
</script>

<template>
  <div class="toolbar">
    <!-- 左侧工具条 -->
    <div class="tool-strip">
      <el-tooltip v-for="tool in tools" :key="tool.id" :content="tool.name" placement="right" effect="dark">
        <div class="tool-item" :class="{ active: activeDrawer === tool.id }" @click="handleToolClick(tool)">
          <div class="icon-wrapper">
            <el-icon :size="24"><component :is="tool.icon" /></el-icon>
          </div>
          <span class="tool-name">{{ tool.name }}</span>
        </div>
      </el-tooltip>
    </div>

    <!-- 抽屉面板 -->
    <div class="drawer-panel" v-if="activeDrawer">
      <div class="drawer-header">
        <span class="drawer-title">
          {{ tools.find((t) => t.id === activeDrawer)?.name }}
        </span>
        <el-icon class="close-icon" @click="handleCloseDrawer"><Close /></el-icon>
      </div>

      <!-- 形状面板 -->
      <div class="drawer-content shape-grid" v-if="activeDrawer === 'shape'">
        <div class="section-title">基础形状</div>
        <div v-for="shape in basicShapes" :key="shape.type" class="shape-option" @click="handleShapeClick(shape.type)">
          <div class="shape-preview" :class="shape.type"></div>
          <span class="shape-label">{{ shape.label }}</span>
        </div>

        <div class="section-title" style="grid-column: span 2; margin-top: 16px">线条</div>
        <div v-for="shape in lineShapes" :key="shape.type" class="shape-option" @click="handleShapeClick(shape.type)">
          <div class="shape-preview" :class="shape.type"></div>
          <span class="shape-label">{{ shape.label }}</span>
        </div>
      </div>

      <!-- 文字面板 -->
      <div class="drawer-content text-list" v-if="activeDrawer === 'text'">
        <div v-for="item in textOptions" :key="item.type" class="text-option" :class="item.type" @click="handleTextClick(item.type)">
          <component :is="item.tag">{{ item.text }}</component>
        </div>
      </div>

      <!-- 涂鸦面板 -->
      <div class="drawer-content doodle-settings" v-if="activeDrawer === 'doodle'">
        <div class="setting-item">
          <span class="label">画笔颜色</span>
          <el-color-picker v-model="doodleColor" />
        </div>
        <div class="setting-item">
          <span class="label">画笔粗细 ({{ doodleWidth }}px)</span>
          <el-slider v-model="doodleWidth" :min="1" :max="50" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use 'sass:color';
@use '../styles/variables.scss' as *;

.toolbar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  // overflow: hidden; // Allow drawer to overflow
}

.tool-strip {
  width: 72px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  gap: 16px;
  background-color: $bg-color-white;
  border-right: 1px solid $border-color-light;
  flex-shrink: 0;
  z-index: 2;
}

.tool-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: $text-regular;

  &:hover {
    background-color: $bg-color;
    color: $primary-color;

    .icon-wrapper {
      transform: translateY(-2px);
    }
  }

  &.active {
    background-color: color.adjust($primary-color, $lightness: 40%);
    color: $primary-color;
  }
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  transition: transform 0.2s;
}

.tool-name {
  font-size: 12px;
  transform: scale(0.9);
}

// 抽屉面板样式
.drawer-panel {
  position: absolute;
  left: 73px;
  top: 0;
  width: 200px;
  height: 100%;
  background-color: #fff;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.2s ease-out;
  border-right: 1px solid $border-color-light;
  z-index: 100;
  box-shadow: 4px 0 8px rgba(0, 0, 0, 0.05);
}

.drawer-header {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid $border-color-light;

  .drawer-title {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }

  .close-icon {
    cursor: pointer;
    color: $text-secondary;
    &:hover {
      color: $text-primary;
    }
  }
}

.drawer-content {
  padding: 16px;
  overflow-y: auto;
}

.section-title {
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
  grid-column: span 2;
}

// Shape Grid
.shape-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.shape-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 8px;
  border: 1px solid $border-color-light;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: $primary-color;
    background-color: $bg-color;

    .shape-label {
      color: $primary-color;
    }
  }
}

.shape-preview {
  width: 32px;
  height: 32px;
  border: 2px solid $text-primary;
  margin-bottom: 8px;

  &.rect {
    border-radius: 2px;
  }
  &.circle {
    border-radius: 50%;
  }
  &.triangle {
    width: 0;
    height: 0;
    border: none;
    border-left: 16px solid transparent;
    border-right: 16px solid transparent;
    border-bottom: 28px solid $text-primary;
  }
  &.line {
    height: 0;
    border: none;
    border-top: 2px solid $text-primary;
    margin-top: 15px;
    margin-bottom: 17px;
    width: 100%;
  }
  &.dashed {
    height: 0;
    border: none;
    border-top: 2px dashed $text-primary;
    margin-top: 15px;
    margin-bottom: 17px;
    width: 100%;
  }
  &.arrow {
    height: 0;
    border: none;
    border-top: 2px solid $text-primary;
    margin-top: 15px;
    margin-bottom: 17px;
    width: 80%;
    position: relative;
    &::after {
      content: '';
      position: absolute;
      right: -6px;
      top: -5px;
      border-left: 8px solid $text-primary;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
    }
  }
}

.shape-label {
  font-size: 12px;
  color: $text-regular;
}

// Text List
.text-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.text-option {
  padding: 16px;
  border: 1px solid $border-color-light;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;

  &:hover {
    border-color: $primary-color;
    background-color: $bg-color;
    color: $primary-color;
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: bold;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: bold;
  }
  p {
    margin: 0;
    font-size: 14px;
  }
}

// Doodle Settings
.doodle-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .label {
    font-size: 14px;
    color: $text-primary;
  }
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
