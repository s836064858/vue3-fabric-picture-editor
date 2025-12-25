<script setup>
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { Delete, Lock, Unlock, View, Hide, Rank, MoreFilled } from '@element-plus/icons-vue'

const props = defineProps({
  layers: {
    type: Array,
    default: () => []
  },
  activeId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select', 'delete', 'reorder', 'lock', 'visible'])

// 计算属性用于 vuedraggable 的 v-model
// 我们需要将 props.layers (Bottom -> Top) 转换为 UI 显示顺序 (Top -> Bottom)
// 并在拖拽结束时将新的 UI 顺序转换回 ID 列表发送给父组件
const localLayers = computed({
  get() {
    return [...props.layers].reverse()
  },
  set(val) {
    // val 是新的 UI 顺序 (Top -> Bottom)
    // 我们只需要发送这个列表，父组件负责处理
    emit('reorder', val)
  }
})

const handleSelect = (layer) => {
  emit('select', layer.id)
}

const handleDelete = (layer, e) => {
  e.stopPropagation()
  emit('delete', layer.id)
}

const toggleLock = (layer, e) => {
  e.stopPropagation()
  emit('lock', layer)
}

const toggleVisible = (layer, e) => {
  e.stopPropagation()
  emit('visible', layer)
}

const getPreviewContent = (layer) => {
  if (layer.type === 'image') {
    return layer.src
  }
  return null
}
</script>

<template>
  <div class="layer-panel">
    <div v-if="localLayers.length > 0" class="layer-list-container">
      <draggable v-model="localLayers" item-key="id" handle=".drag-handle" ghost-class="ghost-item" drag-class="drag-item" :animation="200">
        <template #item="{ element: layer }">
          <div class="layer-item" :class="{ active: layer.id === activeId }" @click="handleSelect(layer)">
            <!-- 拖拽句柄 -->
            <div class="drag-handle">
              <el-icon><Rank /></el-icon>
            </div>

            <!-- 预览区域 -->
            <div class="layer-preview">
              <div v-if="layer.type === 'image'" class="preview-image" :style="{ backgroundImage: `url(${layer.src})` }"></div>
              <div v-else-if="layer.type === 'i-text' || layer.type === 'text'" class="preview-text">
                {{ layer.text && layer.text.length > 0 ? layer.text.charAt(0) : 'T' }}
              </div>
              <div v-else class="preview-icon">
                <div class="shape-icon"></div>
              </div>
            </div>

            <!-- 图层名称 -->
            <div class="layer-info">
              <div class="layer-name">{{ layer.name }}</div>
            </div>

            <!-- 操作按钮 -->
            <div class="layer-actions">
              <div class="action-btn" @click="(e) => toggleVisible(layer, e)" :title="layer.visible ? '隐藏' : '显示'">
                <el-icon :size="14" :color="layer.visible ? '#595959' : '#bfbfbf'">
                  <View v-if="layer.visible" />
                  <Hide v-else />
                </el-icon>
              </div>
              <div class="action-btn" @click="(e) => toggleLock(layer, e)" :title="layer.locked ? '解锁' : '锁定'">
                <el-icon :size="14" :color="layer.locked ? '#faad14' : '#bfbfbf'">
                  <Lock v-if="layer.locked" />
                  <Unlock v-else />
                </el-icon>
              </div>

              <el-dropdown
                trigger="click"
                @command="
                  (cmd) => {
                    if (cmd === 'delete') handleDelete(layer, { stopPropagation: () => {} })
                  }
                "
              >
                <div class="action-btn more-btn" @click.stop>
                  <el-icon :size="14"><MoreFilled /></el-icon>
                </div>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="delete" class="delete-item">
                      <el-icon><Delete /></el-icon> 删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </template>
      </draggable>
    </div>
    <div v-else class="empty-state">
      <span class="empty-text">暂无图层</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.layer-panel {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.layer-list-container {
  display: flex;
  flex-direction: column;
}

.layer-item {
  display: flex;
  align-items: center;
  padding: 8px;
  margin-bottom: 8px;
  background-color: #fff;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

    .drag-handle {
      opacity: 1;
      color: #8c8c8c;
    }
  }

  &.active {
    border-color: $primary-color;
    background-color: lighten($primary-color, 45%);

    .layer-name {
      color: $primary-color;
      font-weight: 500;
    }
  }
}

.drag-handle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: #d9d9d9;
  opacity: 0;
  transition: all 0.2s;
  margin-right: 4px;

  &:hover {
    color: #595959;
  }

  &:active {
    cursor: grabbing;
  }
}

.layer-preview {
  width: 36px;
  height: 36px;
  background-color: #f5f5f5;
  border-radius: 4px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #f0f0f0;

  .preview-image {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
  }

  .preview-text {
    font-size: 16px;
    font-weight: bold;
    color: #595959;
  }

  .preview-icon {
    .shape-icon {
      width: 16px;
      height: 16px;
      border: 2px solid #8c8c8c;
      border-radius: 2px;
    }
  }
}

.layer-info {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
}

.layer-name {
  font-size: 14px;
  color: #262626;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: #8c8c8c;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #595959;
  }
}

.more-btn {
  transform: rotate(90deg);
}

.ghost-item {
  opacity: 0.5;
  background: #f0f0f0;
  border: 1px dashed #d9d9d9;
}

.drag-item {
  opacity: 1;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 0;

  .empty-text {
    color: #bfbfbf;
    font-size: 14px;
  }
}

.delete-item {
  color: $error-color;
}
</style>
