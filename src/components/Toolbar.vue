<script setup>
import { ref } from 'vue'
import { Picture, Edit, Monitor, Upload } from '@element-plus/icons-vue'

const emit = defineEmits(['tool-selected'])

const tools = [
  { id: 'text', name: '添加文字', icon: Edit },
  { id: 'image', name: '上传图片', icon: Picture }
]

const handleToolClick = (toolId) => {
  emit('tool-selected', toolId)
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
    </div>
  </div>
</template>

<style scoped lang="scss">
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
    background-color: darken($bg-color, 5%);
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
</style>
