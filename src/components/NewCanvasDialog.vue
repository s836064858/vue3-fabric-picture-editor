<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { Close, Check, Link } from '@element-plus/icons-vue'
import settings from '@/config/settings'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'create'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 预设尺寸
const presets = settings.canvasPresets

const form = reactive({
  width: settings.canvas.width,
  height: settings.canvas.height,
  backgroundColor: settings.canvas.backgroundColor
})

// 计算初始选中的预设
const initialPresetIndex = presets.findIndex((p) => p.width === settings.canvas.width && p.height === settings.canvas.height)

const selectedPresetIndex = ref(initialPresetIndex)
const isCustomSize = ref(initialPresetIndex === -1)

const backgroundColors = settings.canvasBackgroundColors

const handlePresetSelect = (index) => {
  selectedPresetIndex.value = index
  isCustomSize.value = false
  const preset = presets[index]
  form.width = preset.width
  form.height = preset.height
}

const handleCustomSize = () => {
  selectedPresetIndex.value = -1
  isCustomSize.value = true
}

// 监听尺寸变化，如果是自定义输入，取消预设选中
watch(
  () => [form.width, form.height],
  () => {
    if (!isCustomSize.value) {
      const matched = presets.findIndex((p) => p.width === form.width && p.height === form.height)
      if (matched !== -1) {
        selectedPresetIndex.value = matched
      } else {
        selectedPresetIndex.value = -1
        isCustomSize.value = true
      }
    }
  }
)

const handleCreate = () => {
  emit('create', { ...form })
  dialogVisible.value = false
}

const handleColorSelect = (color) => {
  form.backgroundColor = color
}

// 预览样式
const previewStyle = computed(() => {
  const maxWidth = 300
  const maxHeight = 200
  const ratio = form.width / form.height

  let w, h
  if (ratio > maxWidth / maxHeight) {
    w = Math.min(maxWidth, form.width)
    h = w / ratio
  } else {
    h = Math.min(maxHeight, form.height)
    w = h * ratio
  }

  return {
    width: `${w}px`,
    height: `${h}px`,
    backgroundColor: form.backgroundColor === 'transparent' ? 'transparent' : form.backgroundColor,
    backgroundImage:
      form.backgroundColor === 'transparent'
        ? 'linear-gradient(45deg, #e6e6e6 25%, transparent 25%), linear-gradient(-45deg, #e6e6e6 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e6e6e6 75%), linear-gradient(-45deg, transparent 75%, #e6e6e6 75%)'
        : 'none',
    backgroundSize: '10px 10px',
    backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
  }
})
</script>

<template>
  <el-dialog v-model="dialogVisible" title="新建画布" width="800px" :close-on-click-modal="false" destroy-on-close class="new-canvas-dialog">
    <div class="dialog-content">
      <!-- 左侧预览 -->
      <div class="preview-area">
        <div class="canvas-preview" :style="previewStyle"></div>
      </div>

      <!-- 右侧设置 -->
      <div class="settings-area">
        <div class="setting-group">
          <div class="label">画布尺寸</div>
          <div class="preset-list">
            <div class="preset-item" :class="{ active: isCustomSize }" @click="handleCustomSize">
              <div class="preset-name">自定义尺寸</div>
            </div>
            <div
              v-for="(preset, index) in presets"
              :key="index"
              class="preset-item"
              :class="{ active: selectedPresetIndex === index }"
              @click="handlePresetSelect(index)"
            >
              <div class="preset-name">{{ preset.label }} {{ preset.width }} x {{ preset.height }} px</div>
              <el-icon v-if="selectedPresetIndex === index" class="check-icon"><Check /></el-icon>
            </div>
          </div>
        </div>

        <div class="setting-group size-inputs">
          <el-input-number v-model="form.width" :min="1" :max="5000" controls-position="right" placeholder="宽" />
          <span class="separator">宽</span>
          <el-icon><Link /></el-icon>
          <el-input-number v-model="form.height" :min="1" :max="5000" controls-position="right" placeholder="高" />
          <span class="separator">高</span>
          <span class="unit">px 像素</span>
        </div>

        <div class="setting-group">
          <div class="label">画布背景</div>
          <div class="color-picker-area">
            <div class="color-item transparent-bg" :class="{ active: form.backgroundColor === 'transparent' }" @click="handleColorSelect('transparent')"></div>
            <div
              v-for="color in backgroundColors.slice(1)"
              :key="color.value"
              class="color-item"
              :style="{ backgroundColor: color.value }"
              :class="{ active: form.backgroundColor === color.value }"
              @click="handleColorSelect(color.value)"
            ></div>
            <el-color-picker v-model="form.backgroundColor" show-alpha />
          </div>
        </div>

        <div class="actions">
          <el-button type="primary" class="create-btn" @click="handleCreate">创建</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.dialog-content {
  display: flex;
  height: 500px;
  border-top: 1px solid #f0f0f0;
}

.preview-area {
  flex: 1;
  background-color: #f5f5f5;
  display: flex;
  justify-content: center;
  align-items: center;
  border-right: 1px solid #f0f0f0;

  // 预览区域背景网格
  background-image: linear-gradient(45deg, #e6e6e6 25%, transparent 25%), linear-gradient(-45deg, #e6e6e6 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e6e6e6 75%), linear-gradient(-45deg, transparent 75%, #e6e6e6 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

.canvas-preview {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.3s;
}

.settings-area {
  width: 320px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.setting-group {
  margin-bottom: 24px;

  .label {
    font-size: 14px;
    font-weight: 500;
    color: #333;
    margin-bottom: 12px;
  }
}

.preset-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}

.preset-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #666;

  &:hover {
    background-color: #f5f5f5;
  }

  &.active {
    background-color: #e6f7ff;
    color: #1890ff;
  }
}

.size-inputs {
  display: flex;
  align-items: center;
  gap: 8px;

  .separator {
    font-size: 12px;
    color: #999;
  }

  .unit {
    font-size: 12px;
    color: #666;
    margin-left: auto;
  }
}

.color-picker-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.color-item {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #d9d9d9;
  position: relative;

  &.transparent-bg {
    background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
  }

  &.active {
    border-color: #1890ff;
    box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 8px;
      height: 8px;
      background-color: #fff;
      border-radius: 50%;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
    }

    &.transparent-bg::after {
      background-color: #1890ff;
    }
  }
}

.actions {
  margin-top: auto;

  .create-btn {
    width: 100%;
    height: 40px;
    font-size: 16px;
  }
}
</style>
