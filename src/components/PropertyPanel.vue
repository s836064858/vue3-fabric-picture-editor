<script setup>
import { computed } from 'vue'
import { Edit, Picture, Menu, Lock, Unlock, View, Hide, Pointer, Refresh } from '@element-plus/icons-vue'
import settings from '@/config/settings'

const props = defineProps({
  activeObject: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['property-change', 'image-replace'])

// 是否有选中的对象
const hasActiveObject = computed(() => !!props.activeObject)

// 是否为形状
const isShape = computed(() => {
  return props.activeObject && ['rect', 'circle', 'triangle'].includes(props.activeObject.type)
})

// 类型名称映射
const TYPE_NAME_MAP = {
  image: '图片',
  'i-text': '文字',
  text: '文字',
  rect: '形状',
  circle: '形状',
  triangle: '形状'
}

// 获取类型名称
const typeName = computed(() => {
  if (!props.activeObject) return ''
  return TYPE_NAME_MAP[props.activeObject.type] || '图层'
})

// 通用处理函数
const handleChange = (property, value) => {
  emit('property-change', { property, value })
}

// 图片替换
const handleImageReplace = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (file) {
      emit('image-replace', file)
    }
  }
  input.click()
}
</script>

<template>
  <div class="property-panel">
    <div v-if="hasActiveObject" class="panel-content">
      <!-- 头部：类型标识 -->
      <div class="header-card">
        <div class="type-icon">
          <el-icon v-if="activeObject.type === 'image'" :size="24"><Picture /></el-icon>
          <el-icon v-else-if="activeObject.type === 'i-text' || activeObject.type === 'text'" :size="24"><Edit /></el-icon>
          <el-icon v-else-if="isShape" :size="24"><Monitor /></el-icon>
          <el-icon v-else :size="24"><Menu /></el-icon>
        </div>
        <div class="type-info">
          <div class="type-name">
            {{ typeName }}
          </div>
          <div class="type-actions">
            <el-icon
              class="action-icon"
              :class="{ active: activeObject.locked }"
              @click="handleChange('locked', !activeObject.locked)"
              :title="activeObject.locked ? '解锁' : '锁定'"
            >
              <Lock v-if="activeObject.locked" />
              <Unlock v-else />
            </el-icon>
            <el-icon
              class="action-icon"
              :class="{ active: !activeObject.visible }"
              @click="handleChange('visible', !activeObject.visible)"
              :title="activeObject.visible ? '隐藏' : '显示'"
            >
              <View v-if="activeObject.visible" />
              <Hide v-else />
            </el-icon>
          </div>
        </div>
      </div>

      <div class="property-form">
        <!-- 文本属性区域 (仅文本显示) -->
        <div v-if="activeObject.type === 'i-text' || activeObject.type === 'text'" class="section-group">
          <!-- 字体 -->
          <div class="prop-row">
            <div class="prop-label">字体</div>
            <div class="prop-content">
              <el-select :model-value="activeObject.fontFamily" @change="(val) => handleChange('fontFamily', val)" size="default" class="full-width-select">
                <el-option v-for="font in settings.fontFamilies" :key="font.value" :label="font.label" :value="font.value" />
              </el-select>
            </div>
          </div>

          <!-- 字号 & 颜色 -->
          <div class="prop-row">
            <div class="prop-label">字号</div>
            <div class="prop-content split-2">
              <el-input-number
                :model-value="activeObject.fontSize"
                :min="12"
                :max="400"
                controls-position="right"
                @change="(val) => handleChange('fontSize', val)"
                class="gray-input"
                :controls="true"
              />
              <div class="color-trigger-wrapper">
                <!-- <div class="color-preview-large" :style="{ backgroundColor: activeObject.fill }"></div> -->
                <el-color-picker :model-value="activeObject.fill" show-alpha @change="(val) => handleChange('fill', val)" class="hidden-picker" />
              </div>
            </div>
          </div>

          <!-- 样式 (B/I/U/S) -->
          <div class="prop-row">
            <div class="prop-label">样式</div>
            <div class="prop-content">
              <div class="segmented-control">
                <div
                  class="segment-item"
                  :class="{ active: activeObject.fontWeight === 'bold' }"
                  @click="handleChange('fontWeight', activeObject.fontWeight === 'bold' ? 'normal' : 'bold')"
                >
                  <span style="font-weight: bold">B</span>
                </div>
                <div
                  class="segment-item"
                  :class="{ active: activeObject.fontStyle === 'italic' }"
                  @click="handleChange('fontStyle', activeObject.fontStyle === 'italic' ? 'normal' : 'italic')"
                >
                  <span style="font-style: italic; font-family: serif">I</span>
                </div>
                <div class="segment-item" :class="{ active: activeObject.underline }" @click="handleChange('underline', !activeObject.underline)">
                  <span style="text-decoration: underline">U</span>
                </div>
                <div class="segment-item" :class="{ active: activeObject.linethrough }" @click="handleChange('linethrough', !activeObject.linethrough)">
                  <span style="text-decoration: line-through">S</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 内容编辑 -->
          <div class="prop-row mt-4">
            <div class="prop-content">
              <el-input
                :model-value="activeObject.text"
                type="textarea"
                :rows="3"
                resize="none"
                placeholder="文本内容"
                @input="(val) => handleChange('text', val)"
                class="content-textarea"
              />
            </div>
          </div>

          <div class="divider"></div>
        </div>

        <!-- 形状属性 (仅形状显示) -->
        <div v-if="isShape" class="section-group">
          <div class="prop-row">
            <div class="prop-label">填充</div>
            <div class="prop-content align-center">
              <el-color-picker :model-value="activeObject.fill" show-alpha @change="(val) => handleChange('fill', val)" />
            </div>
          </div>
          <div class="divider"></div>
        </div>

        <!-- 图片属性 (仅图片显示) -->
        <div v-if="activeObject.type === 'image'" class="section-group">
          <div class="prop-row">
            <div class="prop-content">
              <el-button class="action-btn" @click="handleImageReplace">
                <el-icon class="mr-1"><Refresh /></el-icon> 替换图片
              </el-button>
            </div>
          </div>
          <div class="divider"></div>
        </div>

        <!-- 通用属性：透明度 -->
        <div class="section-group">
          <div class="prop-row">
            <div class="prop-label">透明度</div>
            <div class="prop-content align-center">
              <el-slider
                :model-value="activeObject.opacity * 100"
                :min="0"
                :max="100"
                :show-tooltip="false"
                @input="(val) => handleChange('opacity', val / 100)"
                class="opacity-slider"
              />
              <el-input-number
                :model-value="Math.round(activeObject.opacity * 100)"
                :min="0"
                :max="100"
                controls-position="right"
                @change="(val) => handleChange('opacity', val / 100)"
                class="gray-input small-number"
                :controls="false"
              />
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 尺寸 W/H -->
        <div class="section-group">
          <div class="prop-row">
            <div class="prop-label">尺寸</div>
            <div class="prop-content split-2">
              <div class="input-with-inner-label">
                <el-input-number
                  :model-value="parseInt(activeObject.width)"
                  controls-position="right"
                  @change="(val) => handleChange('width', val)"
                  class="gray-input"
                  :controls="false"
                  :disabled="activeObject.type !== 'image' && !isShape"
                />
                <span class="inner-label">宽</span>
              </div>
              <div class="input-with-inner-label">
                <el-input-number
                  :model-value="parseInt(activeObject.height)"
                  controls-position="right"
                  @change="(val) => handleChange('height', val)"
                  class="gray-input"
                  :controls="false"
                  :disabled="activeObject.type !== 'image' && !isShape"
                />
                <span class="inner-label">高</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 位置 X/Y -->
        <div class="section-group">
          <div class="prop-row">
            <div class="prop-label">位置</div>
            <div class="prop-content split-2">
              <div class="input-with-inner-label">
                <el-input-number
                  :model-value="parseInt(activeObject.left)"
                  controls-position="right"
                  @change="(val) => handleChange('left', val)"
                  class="gray-input"
                  :controls="false"
                />
                <span class="inner-label">X</span>
              </div>
              <div class="input-with-inner-label">
                <el-input-number
                  :model-value="parseInt(activeObject.top)"
                  controls-position="right"
                  @change="(val) => handleChange('top', val)"
                  class="gray-input"
                  :controls="false"
                />
                <span class="inner-label">Y</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 角度与翻转 -->
        <div class="section-group">
          <div class="prop-row">
            <div class="prop-label">角度</div>
            <div class="prop-content split-2-1">
              <div class="input-with-inner-label">
                <el-input-number
                  :model-value="parseInt(activeObject.angle)"
                  :min="0"
                  :max="360"
                  controls-position="right"
                  @change="(val) => handleChange('angle', val)"
                  class="gray-input"
                  :controls="false"
                />
                <span class="inner-label">°</span>
              </div>
              <div class="icon-actions">
                <div class="icon-btn text-btn" @click="handleChange('flipX', !activeObject.flipX)" title="水平翻转">水平翻转</div>
                <div class="icon-btn text-btn" @click="handleChange('flipY', !activeObject.flipY)" title="垂直翻转">垂直翻转</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <div class="empty-content">
        <el-icon :size="64" color="#E5E6EB"><Pointer /></el-icon>
        <p>选择画布上的元素进行编辑</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.property-panel {
  height: 100%;
  background-color: #fff;
  display: flex;
  flex-direction: column;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  user-select: none;
}

.header-card {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #f2f3f5;

  .type-icon {
    width: 40px;
    height: 40px;
    background-color: #f7f8fa;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4e5969;
  }

  .type-info {
    flex: 1;

    .type-name {
      font-size: 16px;
      font-weight: 600;
      color: #1d2129;
      margin-bottom: 4px;
    }

    .type-actions {
      display: flex;
      gap: 8px;
    }

    .action-icon {
      cursor: pointer;
      padding: 1px;
      border-radius: 4px;
      color: #8c8c8c;
      transition: all 0.2s;

      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
        color: #595959;
      }

      &.active {
        color: #1890ff;
        background-color: #e6f7ff;
      }
    }
  }
}

.property-form {
  padding: 20px 16px;
  flex: 1;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #e5e6eb;
    border-radius: 3px;
  }
}

.section-group {
  margin-bottom: 20px;
}

.prop-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }

  .prop-label {
    width: 48px;
    font-size: 14px;
    color: #86909c;
    flex-shrink: 0;
  }

  .prop-content {
    flex: 1;
    min-width: 0;
  }
}

.split-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.split-2-1 {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 12px;
}

.align-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 控件样式重写 */
.gray-input {
  width: 100% !important;

  :deep(.el-input__wrapper) {
    background-color: #f2f3f5 !important;
    box-shadow: none !important;
    border-radius: 4px;
    padding: 0 8px !important;
    height: 32px;

    &:hover,
    &.is-focus {
      background-color: #e5e6eb !important;
    }
  }

  :deep(.el-input__inner) {
    height: 32px;
    line-height: 32px;
    background-color: transparent !important;
    text-align: left;
    color: #1d2129;
  }
}

.full-width-select {
  width: 100%;

  :deep(.el-input__wrapper) {
    background-color: #f2f3f5 !important;
    box-shadow: none !important;
    border-radius: 4px;
    height: 32px;
  }
}

.segmented-control {
  display: flex;
  background-color: #f2f3f5;
  border-radius: 4px;
  padding: 2px;
  gap: 2px;

  .segment-item {
    flex: 1;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    cursor: pointer;
    color: #4e5969;
    font-size: 14px;
    transition: all 0.2s;

    &:hover {
      background-color: rgba(255, 255, 255, 0.5);
    }

    &.active {
      background-color: #fff;
      color: #1890ff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      font-weight: 600;
    }
  }
}

.color-trigger-wrapper {
  position: relative;
  width: 100%;
  height: 32px;

  .color-preview-large {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    border: 1px solid #e5e6eb;
    cursor: pointer;
    background-image: linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%);
    background-size: 10px 10px;
    background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
  }

  .hidden-picker {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    z-index: 1;

    :deep(.el-color-picker__trigger) {
      width: 100%;
      height: 100%;
    }
  }
}

.input-with-inner-label {
  position: relative;

  .inner-label {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: #86909c;
    font-size: 12px;
    pointer-events: none;
  }

  :deep(.el-input__inner) {
    padding-right: 20px !important;
  }
}

.icon-actions {
  display: flex;
  background-color: #f2f3f5;
  border-radius: 4px;
  padding: 2px;

  .icon-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 3px;
    color: #4e5969;
    font-size: 16px;

    &:hover {
      background-color: #e5e6eb;
      color: #1d2129;
    }

    &.text-btn {
      font-size: 12px;
      padding: 0 4px;
    }
  }
}

.opacity-slider {
  flex: 1;
  margin-right: 12px;

  :deep(.el-slider__runway) {
    height: 4px;
    background-color: #f2f3f5;
  }

  :deep(.el-slider__bar) {
    height: 4px;
    background-color: #1890ff;
  }

  :deep(.el-slider__button) {
    width: 12px;
    height: 12px;
    border: 2px solid #1890ff;
  }
}

.small-number {
  width: 60px !important;
}

.content-textarea {
  :deep(.el-textarea__inner) {
    background-color: #f7f8fa;
    border: none;
    border-radius: 8px;
    padding: 12px;
    color: #1d2129;
    font-size: 14px;

    &:focus {
      background-color: #fff;
      box-shadow: 0 0 0 1px #1890ff;
    }
  }
}

.action-btn {
  width: 100%;
  background-color: #f2f3f5;
  border: none;
  color: #1d2129;

  &:hover {
    background-color: #e5e6eb;
  }
}

.divider {
  height: 1px;
  background-color: #f2f3f5;
  margin: 20px 0;
}

.mt-4 {
  margin-top: 16px;
}

.mr-1 {
  margin-right: 4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;

  .empty-content {
    text-align: center;
    color: #86909c;

    p {
      margin-top: 16px;
      font-size: 14px;
    }
  }
}
</style>
