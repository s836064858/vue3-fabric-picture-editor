/**
 * 全局配置文件
 */
export default {
  // 画布默认配置
  canvas: {
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
    maxHistory: 50 // 最大历史记录步数
  },

  // 画布预设尺寸
  canvasPresets: [
    { label: '公众号首图', width: 900, height: 383 },
    { label: '公众号次图', width: 200, height: 200 },
    { label: '朋友圈封面', width: 1080, height: 1080 },
    { label: '电脑壁纸', width: 1920, height: 1080 },
    { label: 'Logo设计', width: 500, height: 500 },
    { label: '方形主图', width: 800, height: 800 },
    { label: '竖版主图', width: 800, height: 1200 },
    { label: '拼多多店铺首页', width: 750, height: 1000 },
    { label: '标准1寸/1R', width: 295, height: 413 },
    { label: '标准2寸/2R', width: 413, height: 626 }
  ],

  // 画布背景颜色预设
  canvasBackgroundColors: [
    { value: 'transparent', label: '透明' },
    { value: '#ffffff', label: '白色' },
    { value: '#000000', label: '黑色' },
    { value: '#f5222d', label: '红色' },
    { value: '#fa8c16', label: '橙色' },
    { value: '#fa541c', label: '橘红' },
    { value: '#fadb14', label: '黄色' },
    { value: '#52c41a', label: '绿色' },
    { value: '#13c2c2', label: '青色' },
    { value: '#1890ff', label: '蓝色' }
  ],

  // 水印配置
  watermark: {
    defaultText: 'Fabix 绘坊',
    fontFamily: '"PingFang SC", sans-serif',
    fontSize: 20,
    color: 'rgba(200, 200, 200, 0.3)',
    rotate: -45, // 旋转角度
    gridSize: 300, // 网格单元大小
    excludeFromExport: true // 导出时是否排除水印
  },

  // 字体配置
  fontFamilies: [
    { label: '阿里妈妈刀隶体', value: 'AlimamaDaoLiTi' },
    { label: '阿里妈妈东方大楷', value: 'AlimamaDongFangDaKai' },
    { label: '阿里妈妈数黑体', value: 'AlimamaShuHeiTi' },
    { label: 'PingFang SC', value: 'PingFang SC' },
    { label: '微软雅黑', value: 'Microsoft YaHei' },
    { label: '宋体', value: 'SimSun' },
    { label: '黑体', value: 'SimHei' },
    { label: '楷体', value: 'KaiTi' },
    { label: 'Arial', value: 'Arial' }
  ],

  // 导出配置
  export: {
    format: 'png',
    quality: 1,
    multiplier: 2 // 导出倍率
  },

  // 参考线配置
  guide: {
    stroke: '#00FFFF',
    strokeWidth: 1,
    strokeDashArray: [5, 5],
    excludeFromExport: true // 导出时是否排除参考线
  },

  // 操作对象默认配置
  objectDefaults: {
    text: {
      defaultText: '双击编辑文本',
      fontSize: 24,
      fontFamily: 'PingFang SC',
      fill: '#333333'
    },
    shape: {
      fill: '#1890ff',
      width: 100,
      height: 100
    },
    image: {
      maxInitialWidth: 400 // 图片添加时的最大初始宽度
    }
  }
}
