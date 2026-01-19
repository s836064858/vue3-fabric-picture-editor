// Fabric IText 的局部选中样式（selectionStyles）仅支持部分属性
// 这里收敛到“右侧属性面板需要且 Fabric 能安全应用”的集合，避免误把对象级属性写到字符级样式里
export const TEXT_SELECTION_STYLE_KEYS = ['fill', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'underline', 'linethrough']
export const TEXT_SELECTION_STYLE_KEY_SET = new Set(TEXT_SELECTION_STYLE_KEYS)
