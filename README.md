# Vue 3 图片编辑器 (Vue 3 Image Editor)

一个基于 Vue 3 + Vite + Fabric.js 开发的轻量级 Web 图片编辑器。

## ✨ 功能特性

### 🎨 核心编辑
- **画布操作**：支持添加文本、图片，自由拖拽、缩放、旋转。
- **辅助对齐**：移动元素时自动显示对齐辅助线，支持吸附到画布中心和其他元素边缘。
- **自动居中**：添加新元素时自动居中显示。

### 📝 图层管理
- **可视化列表**：直观的图层列表，支持图片缩略图和文本内容预览。
- **拖拽排序**：支持拖拽调整图层层级（使用 `vuedraggable`）。
- **状态控制**：一键锁定/解锁、显示/隐藏图层。
- **双向同步**：图层面板与属性面板状态实时同步。

### ⚙️ 属性编辑
- **文本样式**：修改字体（支持阿里妈妈系列字体）、字号、颜色、加粗、斜体、下划线、对齐方式等。
- **图片属性**：替换图片源、调整透明度等。
- **通用属性**：精确调整位置（X/Y）、尺寸（W/H）、旋转角度。

### 🛠 其他功能
- **历史记录**：支持撤销（Undo）和重做（Redo），快捷键支持（Ctrl+Z / Ctrl+Shift+Z）。
- **图片导出**：支持导出为 2 倍高清 PNG 图片，自动裁剪掉非画布区域。

## 📦 技术栈

- **核心框架**: [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
- **构建工具**: [Vite](https://vitejs.dev/)
- **Canvas 引擎**: [Fabric.js v7](http://fabricjs.com/)
- **UI 组件库**: [Element Plus](https://element-plus.org/)
- **状态管理**: [Vuex 4](https://vuex.vuejs.org/)
- **路由管理**: [Vue Router 4](https://router.vuejs.org/)
- **CSS 预处理**: Sass
- **拖拽库**: [vuedraggable](https://github.com/SortableJS/vue.draggable.next)

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 构建生产版本

```bash
npm run build
```

## 📂 项目结构

```
src/
├── assets/          # 静态资源（字体、图标等）
├── components/      # 业务组件
│   ├── Editor.vue        # 核心编辑器组件（画布逻辑）
│   ├── LayerPanel.vue    # 左侧图层面板
│   ├── PropertyPanel.vue # 右侧属性面板
│   └── Toolbar.vue       # 顶部工具栏
├── router/          # 路由配置
├── store/           # Vuex 状态管理
├── styles/          # 全局样式
├── App.vue          # 根组件
└── main.js          # 入口文件
```

## ⌨️ 快捷键支持

- `Delete` / `Backspace`: 删除选中元素
- `Ctrl + Z`: 撤销
- `Ctrl + Shift + Z` / `Ctrl + Y`: 重做

## 📄 字体说明

项目内置了以下字体支持：
- 阿里妈妈刀隶体
- 阿里妈妈东方大楷
- 阿里妈妈数黑体
