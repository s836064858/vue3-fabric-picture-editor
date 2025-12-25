// vite.config.js (Vite 构建)
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 如果你的仓库名是 `my-vue-project`，则 base 为 '/my-vue-project/'
// 如果是用户名.github.io 仓库，base 直接用 '/'
const base = process.env.NODE_ENV === 'production' ? '/vue3-fabric-picture-editor/' : '/'

export default defineConfig({
  plugins: [vue()],
  base: base, // 关键配置：设置打包后的基础路径
  build: {
    outDir: 'dist', // 打包输出目录，默认就是 dist
    assetsDir: 'assets' // 静态资源目录
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})
