<script setup>
import { ref } from 'vue'
import { Picture, Edit, Monitor, Upload, CaretBottom } from '@element-plus/icons-vue'

const emit = defineEmits(['tool-selected'])

const tools = [
  { id: 'text', name: '添加文字', icon: Edit },
  { id: 'image', name: '上传图片', icon: Picture }
]

const handleToolClick = (toolId) => {
  emit('tool-selected', toolId)
}

const handleShapeClick = (shapeType) => {
  emit('tool-selected', `shape-${shapeType}`)
}
</script>

<template>
  <div class="toolbar">
    <div class="tool-list">
      <el-tooltip v-for="tool in tools" :key="tool.id" :content="tool.name" placement="right" effect="dark">
        <div class="tool-item" @click="handleToolClick(tool.id)">
          <div class="icon-wrapper">
            <el-icon :size="20"><component :is="tool.icon" /></el-icon>
          </div>
          <span class="tool-name">{{ tool.name }}</span>
        </div>
      </el-tooltip>

      <!-- 形状工具 -->
      <el-popover placement="right" trigger="hover" :width="120" popper-class="shape-popover">
        <template #reference>
          <div class="tool-item">
            <div class="icon-wrapper">
              <el-icon :size="20"><Monitor /></el-icon>
            </div>
            <span class="tool-name">添加形状</span>
          </div>
        </template>
        <div class="shape-list">
          <div class="shape-item" @click="handleShapeClick('rect')">
            <div class="shape-icon rect"></div>
            <span>矩形</span>
          </div>
          <div class="shape-item" @click="handleShapeClick('circle')">
            <div class="shape-icon circle"></div>
            <span>圆形</span>
          </div>
          <div class="shape-item" @click="handleShapeClick('triangle')">
            <div class="shape-icon triangle"></div>
            <span>三角形</span>
          </div>
        </div>
      </el-popover>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use 'sass:color';
@use '../styles/variables.scss' as *;

.toolbar {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tool-list {
  display: flex;
  // flex-direction: column;
  gap: 12px;
  width: 100%;
  align-items: center;
  padding: 0 8px;
}

.tool-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: $radius-md;
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

  &:active {
    background-color: color.adjust($bg-color, $lightness: -5%);
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

// 形状列表样式
.shape-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shape-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
  color: #333;

  &:hover {
    background-color: #f5f7fa;
    color: $primary-color;
  }

  .shape-icon {
    width: 16px;
    height: 16px;
    border: 1.5px solid currentColor;

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
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 14px solid currentColor;
    }
  }
}
</style>
