# Fabix 绘坊 (Vue 3 Image Editor)

[![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?style=flat-square&logo=vue.js)](https://vuejs.org/) [![Fabric.js](https://img.shields.io/badge/Fabric.js-7.0-2c3e50?style=flat-square&logo=javascript)](http://fabricjs.com/) [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE) [![Online Demo](https://img.shields.io/badge/Demo-Online-orange?style=flat-square&logo=github)](https://s836064858.github.io/vue3-fabric-picture-editor/) ![GitHub stars](https://img.shields.io/github/stars/s836064858/vue3-fabric-picture-editor)

> **Vue 画布，随心绘编**

## 📖 项目定位

Fabix 绘坊是一款基于 **Vue 3** + **Fabric.js** 开发的轻量级 Web 图片编辑器，提供开箱即用的画布编辑能力，旨在为开发者提供一个简单、高效的图片编辑解决方案。

## ✨ 核心优势

- **轻量高效**：基于 Vue 3 + Vite 构建，秒级启动，零运行时负担。
- **功能完备**：内置文本、形状、图片编辑及图层管理，满足基础绘图需求。
- **智能交互**：支持智能辅助对齐、自动吸附、快捷键操作，提升编辑体验。
- **技术前沿**：采用 Fabric.js v7 最新版，配合 Element Plus UI，现代化开发体验。

## 🚀 快速上手

### 1. 安装依赖

```bash
# 克隆项目
git clone https://github.com/s836064858/vue3-fabric-picture-editor.git

# 进入目录
cd vue3-fabric-picture-editor

# 安装依赖
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

## 📚 完整文档

### 🛠 功能特性

#### 🎨 核心编辑

- **画布操作**：支持添加文本、图片，自由拖拽、缩放、旋转。
- **形状支持**：矩形、圆形、三角形等几何形状，自定义填充与尺寸。
- **辅助对齐**：智能显示对齐辅助线，吸附中心与边缘。
- **智能交互**：防误触删除、自动居中、字号自适应。

#### 📝 图层管理

- **可视化列表**：直观的图层列表，支持缩略图预览。
- **拖拽排序**：支持拖拽调整图层层级。
- **状态控制**：一键锁定/解锁、显示/隐藏。

#### ⚙️ 属性编辑

- **文本样式**：字体（阿里妈妈系列）、字号、颜色、样式、对齐。
- **通用属性**：精确调整 X/Y 坐标、尺寸、旋转、翻转。
- **图片属性**：透明度调整、图片替换。

#### ⌨️ 快捷键支持

| 快捷键                 | 功能     | 说明                       |
| ---------------------- | -------- | -------------------------- |
| `Delete` / `Backspace` | 删除元素 | 仅当鼠标悬浮在画布上时生效 |
| `Ctrl + Z`             | 撤销     | Undo                       |
| `Ctrl + Shift + Z`     | 重做     | Redo                       |

### 📂 项目结构

```
src/
├── components/      # 业务组件 (LayerPanel, PropertyPanel...)
├── views/           # 页面组件 (Editor.vue)
├── utils/           # 工具函数 (canvas-manager, aligning-guidelines...)
├── store/           # Vuex 状态管理
└── styles/          # 全局样式
```

## 🌐 在线 Demo

[![Online Demo](https://img.shields.io/badge/点击体验-Online_Demo-orange?style=for-the-badge&logo=github)](https://s836064858.github.io/vue3-fabric-picture-editor/)

> 本项目支持一键部署到 GitHub Pages：
>
> ```bash
> npm run deploy
> ```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. **Fork** 本仓库
2. 新建 Feat_xxx 分支
3. 提交代码
4. 新建 **Pull Request**

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。
