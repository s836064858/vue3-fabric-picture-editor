/**
 * AI 服务接口
 * 封装火山引擎 AI 绘图能力
 */

/**
 * 调用 AI 消除接口
 * @param {Object} params
 * @param {string} params.apiKey - API Key
 * @param {string} params.image - 原图 Base64 (包含蓝色遮罩)
 * @param {string} params.prompt - 提示词
 * @returns {Promise<string>} 生成图片的 Base64
 */
export async function callAIElimination({
  apiKey,
  image,
  size,
  prompt = 'remove the content covered by the light blue mask and fill it naturally matching the background'
}) {
  const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-seedream-4-5-251128',
        prompt: prompt,
        image,
        size,
        watermark: false
        // 根据用户指示，直接发送包含蓝色遮罩的单张图片，通过 prompt 指导消除
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`)
    }

    const data = await response.json()

    // 假设返回结构符合 OpenAI 标准
    if (data.data && data.data.length > 0) {
      const result = data.data[0]
      // 如果返回的是 url
      if (result.url) return result.url
      // 如果返回的是 b64_json
      if (result.b64_json) return `data:image/png;base64,${result.b64_json}`
      // 某些火山接口可能直接返回 binary_data_base64
      if (result.binary_data_base64) return `data:image/png;base64,${result.binary_data_base64}`
    }

    throw new Error('API 返回数据格式无法识别')
  } catch (error) {
    console.error('AI Elimination Error:', error)
    throw error
  }
}

export async function callAIMatting({
  apiKey,
  image,
  size,
  prompt = 'remove the background of the main subject and output a PNG with transparent background'
}) {
  return callAIElimination({ apiKey, image, size, prompt })
}
