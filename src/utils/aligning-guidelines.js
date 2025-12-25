import * as fabric from 'fabric'

/**
 * 初始化辅助对齐线功能
 * @param {fabric.Canvas} canvas - Fabric Canvas 实例
 */
export const initAligningGuidelines = (canvas) => {
  const ctx = canvas.getSelectionContext()
  const aligningLineOffset = 5
  const aligningLineWidth = 1
  const aligningLineColor = '#1890FF'
  let viewportTransform
  let zoom = 1

  // 缓存对齐候选对象
  let alignmentCandidates = []

  /**
   * 绘制垂直线
   * @param {Object} coords - 坐标对象 {x, y1, y2}
   */
  function drawVerticalLine(coords) {
    drawLine(coords.x + 0.5, coords.y1 > coords.y2 ? coords.y2 : coords.y1, coords.x + 0.5, coords.y1 > coords.y2 ? coords.y1 : coords.y2)
  }

  /**
   * 绘制水平线
   * @param {Object} coords - 坐标对象 {y, x1, x2}
   */
  function drawHorizontalLine(coords) {
    drawLine(coords.x1 > coords.x2 ? coords.x2 : coords.x1, coords.y + 0.5, coords.x1 > coords.x2 ? coords.x1 : coords.x2, coords.y + 0.5)
  }

  /**
   * 绘制线条通用函数
   * @param {number} x1 - 起点 x
   * @param {number} y1 - 起点 y
   * @param {number} x2 - 终点 x
   * @param {number} y2 - 终点 y
   */
  function drawLine(x1, y1, x2, y2) {
    ctx.save()
    ctx.lineWidth = aligningLineWidth
    ctx.strokeStyle = aligningLineColor
    ctx.beginPath()
    ctx.moveTo(x1 * zoom + viewportTransform[4], y1 * zoom + viewportTransform[5])
    ctx.lineTo(x2 * zoom + viewportTransform[4], y2 * zoom + viewportTransform[5])
    ctx.stroke()
    ctx.restore()
  }

  /**
   * 检查值是否在范围内
   * @param {number} value1 - 目标值
   * @param {number} value2 - 当前值
   * @returns {boolean}
   */
  function isInRange(value1, value2) {
    value1 = Math.round(value1)
    value2 = Math.round(value2)
    for (let i = value1 - aligningLineOffset; i <= value1 + aligningLineOffset; i++) {
      if (i === value2) {
        return true
      }
    }
    return false
  }

  const verticalLines = []
  const horizontalLines = []

  // 监听鼠标按下事件，更新视图变换和缩放，并缓存候选对象
  canvas.on('mouse:down', (e) => {
    viewportTransform = canvas.viewportTransform
    zoom = canvas.getZoom()
    const activeObject = e.target

    // 只有选中对象且可移动时才进行计算
    if (activeObject && activeObject.selectable) {
      alignmentCandidates = canvas
        .getObjects()
        .filter((obj) => {
          // 排除自身
          if (obj === activeObject) return false
          // 排除不可见对象
          if (!obj.visible) return false
          // 排除辅助线 (根据 CanvasManager 中的定义，辅助线有 isGuide: true)
          if (obj.isGuide || (obj.type === 'line' && obj.excludeFromAlignment)) return false
          // 排除被选中的组内的对象
          if (activeObject.type === 'activeSelection' && activeObject.contains(obj)) return false
          return true
        })
        .map((obj) => {
          const center = obj.getCenterPoint()
          const rect = obj.getBoundingRect()
          return {
            x: center.x,
            y: center.y,
            width: rect.width / zoom,
            height: rect.height / zoom
          }
        })
    } else {
      alignmentCandidates = []
    }
  })

  // 监听对象移动事件
  canvas.on('object:moving', (e) => {
    const activeObject = e.target
    if (!activeObject) return

    const activeObjectCenter = activeObject.getCenterPoint()
    const activeObjectLeft = activeObjectCenter.x
    const activeObjectTop = activeObjectCenter.y
    const activeObjectBoundingRect = activeObject.getBoundingRect()
    const activeObjectHeight = activeObjectBoundingRect.height / zoom
    const activeObjectWidth = activeObjectBoundingRect.width / zoom
    let horizontalInTheRange = false
    let verticalInTheRange = false

    // 每次移动前清空
    verticalLines.length = 0
    horizontalLines.length = 0

    // 画布中心对齐检测
    const canvasWidth = canvas.width / zoom
    const canvasHeight = canvas.height / zoom

    // 垂直中心（X轴居中）
    if (isInRange(canvasWidth / 2, activeObjectLeft)) {
      verticalInTheRange = true
      verticalLines.push({
        x: canvasWidth / 2,
        y1: 0,
        y2: canvasHeight
      })
      activeObject.setPositionByOrigin(new fabric.Point(canvasWidth / 2, activeObjectTop), 'center', 'center')
    }

    // 水平中心（Y轴居中）
    if (isInRange(canvasHeight / 2, activeObjectTop)) {
      horizontalInTheRange = true
      horizontalLines.push({
        y: canvasHeight / 2,
        x1: 0,
        x2: canvasWidth
      })
      activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, canvasHeight / 2), 'center', 'center')
    }

    // 对象间对齐检测 - 使用缓存的 alignmentCandidates
    for (let i = alignmentCandidates.length; i--; ) {
      const objectProps = alignmentCandidates[i]
      const objectLeft = objectProps.x
      const objectTop = objectProps.y
      const objectHeight = objectProps.height
      const objectWidth = objectProps.width

      // 水平中心线对齐
      if (isInRange(objectLeft, activeObjectLeft)) {
        verticalInTheRange = true
        verticalLines.push({
          x: objectLeft,
          y1: Math.min(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2),
          y2: Math.max(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(objectLeft, activeObjectTop), 'center', 'center')
      }

      // 左边缘对齐
      if (isInRange(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2)) {
        verticalInTheRange = true
        verticalLines.push({
          x: objectLeft - objectWidth / 2,
          y1: Math.min(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2),
          y2: Math.max(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(objectLeft - objectWidth / 2 + activeObjectWidth / 2, activeObjectTop), 'center', 'center')
      }

      // 右边缘对齐
      if (isInRange(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)) {
        verticalInTheRange = true
        verticalLines.push({
          x: objectLeft + objectWidth / 2,
          y1: Math.min(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2),
          y2: Math.max(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(objectLeft + objectWidth / 2 - activeObjectWidth / 2, activeObjectTop), 'center', 'center')
      }

      // 垂直中心线对齐
      if (isInRange(objectTop, activeObjectTop)) {
        horizontalInTheRange = true
        horizontalLines.push({
          y: objectTop,
          x1: Math.min(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2),
          x2: Math.max(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, objectTop), 'center', 'center')
      }

      // 上边缘对齐
      if (isInRange(objectTop - objectHeight / 2, activeObjectTop - activeObjectHeight / 2)) {
        horizontalInTheRange = true
        horizontalLines.push({
          y: objectTop - objectHeight / 2,
          x1: Math.min(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2),
          x2: Math.max(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, objectTop - objectHeight / 2 + activeObjectHeight / 2), 'center', 'center')
      }

      // 下边缘对齐
      if (isInRange(objectTop + objectHeight / 2, activeObjectTop + activeObjectHeight / 2)) {
        horizontalInTheRange = true
        horizontalLines.push({
          y: objectTop + objectHeight / 2,
          x1: Math.min(objectLeft - objectWidth / 2, activeObjectLeft - activeObjectWidth / 2),
          x2: Math.max(objectLeft + objectWidth / 2, activeObjectLeft + activeObjectWidth / 2)
        })
        activeObject.setPositionByOrigin(new fabric.Point(activeObjectLeft, objectTop + objectHeight / 2 - activeObjectHeight / 2), 'center', 'center')
      }
    }

    if (!horizontalInTheRange) {
      horizontalLines.length = 0
    }

    if (!verticalInTheRange) {
      verticalLines.length = 0
    }
  })

  // 渲染前清除上下文
  canvas.on('before:render', () => {
    try {
      canvas.clearContext(canvas.getSelectionContext())
    } catch (e) {
      // 忽略错误
    }
  })

  // 渲染后绘制辅助线
  canvas.on('after:render', () => {
    for (let i = verticalLines.length; i--; ) {
      drawVerticalLine(verticalLines[i])
    }
    for (let i = horizontalLines.length; i--; ) {
      drawHorizontalLine(horizontalLines[i])
    }
  })

  // 鼠标松开清除辅助线
  canvas.on('mouse:up', () => {
    verticalLines.length = 0
    horizontalLines.length = 0
    alignmentCandidates = [] // 清空缓存
    canvas.requestRenderAll()
  })
}
