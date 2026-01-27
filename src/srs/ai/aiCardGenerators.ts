import { getAISettings } from "./aiSettingsSchema"

export interface BasicCardData {
  question: string
  answer: string
}

export interface ClozeCardData {
  text: string
  clozeText: string
  hint?: string
}

type BasicCardsResult = 
  | { success: true; cards: BasicCardData[] }
  | { success: false; error: { code: string; message: string } }

type ClozeCardsResult = 
  | { success: true; cards: ClozeCardData[] }
  | { success: false; error: { code: string; message: string } }

const BASIC_CARD_GENERATION_PROMPT = `你是闪卡制作专家。请为以下知识点生成问答卡片。

原始内容：{{originalContent}}
知识点：{{knowledgePoints}}

要求：
1. 为每个知识点生成 1-2 张卡片
2. 遵循最小知识点原则（每张卡片只测试一个概念）
3. 问题要清晰、具体、可测试
4. 答案要简洁、准确
5. 如果是语法知识点，问题应该问"如何使用"或"什么意思"
6. 如果是概念定义，问题应该问"什么是"或"如何定义"

返回 JSON 格式（不要包含其他内容）：
{
  "cards": [
    {
      "question": "问题内容",
      "answer": "答案内容"
    }
  ]
}

示例：
输入知识点：["使役形（～させる）", "ない的否定用法"]
输出：
{
  "cards": [
    {
      "question": "使役形（～させる）的基本用法是什么？",
      "answer": "表示让某人做某事，动词变形规则：五段动词词尾变あ段+せる，一段动词去る+させる"
    },
    {
      "question": "ない在动词后面表示什么意思？",
      "answer": "表示否定，即不做某事"
    }
  ]
}`

const CLOZE_CARD_GENERATION_PROMPT = `你是闪卡制作专家。请为以下知识点生成填空卡片。

原始内容：{{originalContent}}
知识点：{{knowledgePoints}}

要求：
1. 为每个知识点生成 1-2 张填空卡
2. 选择关键词进行挖空
3. 确保挖空后的句子仍然有意义
4. 可以提供提示（hint）帮助记忆
5. 挖空的词应该是核心概念或关键术语

返回 JSON 格式（不要包含其他内容）：
{
  "cards": [
    {
      "text": "完整句子",
      "clozeText": "要挖空的词",
      "hint": "提示（可选）"
    }
  ]
}

示例：
输入知识点：["使役形（～させる）", "ない的否定用法"]
输出：
{
  "cards": [
    {
      "text": "使役形（～させる）表示让某人做某事",
      "clozeText": "～させる",
      "hint": "表示使役的语法形式"
    },
    {
      "text": "动词后面加ない表示否定",
      "clozeText": "ない",
      "hint": "否定助动词"
    }
  ]
}`

function buildBasicCardPrompt(knowledgePoints: string[], originalContent: string): string {
  return BASIC_CARD_GENERATION_PROMPT
    .replace(/\{\{originalContent\}\}/g, originalContent)
    .replace(/\{\{knowledgePoints\}\}/g, JSON.stringify(knowledgePoints))
}

function buildClozeCardPrompt(knowledgePoints: string[], originalContent: string): string {
  return CLOZE_CARD_GENERATION_PROMPT
    .replace(/\{\{originalContent\}\}/g, originalContent)
    .replace(/\{\{knowledgePoints\}\}/g, JSON.stringify(knowledgePoints))
}

function parseBasicCardsResponse(content: string): BasicCardsResult {
  try {
    const parsed = JSON.parse(content)
    if (parsed.cards && Array.isArray(parsed.cards)) {
      const validCards = parsed.cards.filter((card: any) => 
        card.question && card.answer
      )
      
      if (validCards.length === 0) {
        return {
          success: false,
          error: {
            code: "INVALID_FORMAT",
            message: "AI 返回的卡片格式不正确"
          }
        }
      }
      
      return {
        success: true,
        cards: validCards.map((card: any) => ({
          question: String(card.question).trim(),
          answer: String(card.answer).trim()
        }))
      }
    }
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*"cards"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.cards && Array.isArray(parsed.cards)) {
          const validCards = parsed.cards.filter((card: any) => 
            card.question && card.answer
          )
          
          if (validCards.length > 0) {
            return {
              success: true,
              cards: validCards.map((card: any) => ({
                question: String(card.question).trim(),
                answer: String(card.answer).trim()
              }))
            }
          }
        }
      } catch {
        // Continue to error
      }
    }
  }
  
  return {
    success: false,
    error: {
      code: "PARSE_ERROR",
      message: "无法解析 AI 响应格式"
    }
  }
}

function parseClozeCardsResponse(content: string): ClozeCardsResult {
  try {
    const parsed = JSON.parse(content)
    if (parsed.cards && Array.isArray(parsed.cards)) {
      const validCards = parsed.cards.filter((card: any) => 
        card.text && card.clozeText
      )
      
      if (validCards.length === 0) {
        return {
          success: false,
          error: {
            code: "INVALID_FORMAT",
            message: "AI 返回的卡片格式不正确"
          }
        }
      }
      
      return {
        success: true,
        cards: validCards.map((card: any) => ({
          text: String(card.text).trim(),
          clozeText: String(card.clozeText).trim(),
          hint: card.hint ? String(card.hint).trim() : undefined
        }))
      }
    }
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*"cards"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.cards && Array.isArray(parsed.cards)) {
          const validCards = parsed.cards.filter((card: any) => 
            card.text && card.clozeText
          )
          
          if (validCards.length > 0) {
            return {
              success: true,
              cards: validCards.map((card: any) => ({
                text: String(card.text).trim(),
                clozeText: String(card.clozeText).trim(),
                hint: card.hint ? String(card.hint).trim() : undefined
              }))
            }
          }
        }
      } catch {
        // Continue to error
      }
    }
  }
  
  return {
    success: false,
    error: {
      code: "PARSE_ERROR",
      message: "无法解析 AI 响应格式"
    }
  }
}

export async function generateBasicCards(
  pluginName: string,
  knowledgePoints: string[],
  originalContent: string
): Promise<BasicCardsResult> {
  const settings = getAISettings(pluginName)
  
  if (!settings.apiKey) {
    return { 
      success: false, 
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" } 
    }
  }
  
  const prompt = buildBasicCardPrompt(knowledgePoints, originalContent)
  
  console.log(`[AI Card Generator] 生成 Basic Cards`)
  console.log(`[AI Card Generator] 知识点数量: ${knowledgePoints.length}`)
  
  try {
    const response = await fetch(settings.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { 
            role: "system", 
            content: "你是一个闪卡制作专家。你的任务是根据知识点生成高质量的问答卡片。请严格以 JSON 格式返回结果。" 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })
    
    if (!response.ok) {
      let errorMessage = `请求失败: ${response.status}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error?.message || errorMessage
      } catch {
        // Use default error message
      }
      
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: errorMessage
        }
      }
    }
    
    const data = await response.json()
    const aiContent = data.choices?.[0]?.message?.content
    
    if (!aiContent) {
      return {
        success: false,
        error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
      }
    }
    
    console.log(`[AI Card Generator] AI 响应: ${aiContent}`)
    
    const result = parseBasicCardsResponse(aiContent)
    
    if (result.success) {
      console.log(`[AI Card Generator] 成功生成 ${result.cards.length} 张 Basic Cards`)
    }
    
    return result
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "网络错误"
    console.error(`[AI Card Generator] 网络错误: ${errorMessage}`)
    
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: errorMessage
      }
    }
  }
}

export async function generateClozeCards(
  pluginName: string,
  knowledgePoints: string[],
  originalContent: string
): Promise<ClozeCardsResult> {
  const settings = getAISettings(pluginName)
  
  if (!settings.apiKey) {
    return { 
      success: false, 
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" } 
    }
  }
  
  const prompt = buildClozeCardPrompt(knowledgePoints, originalContent)
  
  console.log(`[AI Card Generator] 生成 Cloze Cards`)
  console.log(`[AI Card Generator] 知识点数量: ${knowledgePoints.length}`)
  
  try {
    const response = await fetch(settings.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { 
            role: "system", 
            content: "你是一个闪卡制作专家。你的任务是根据知识点生成高质量的填空卡片。请严格以 JSON 格式返回结果。" 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })
    
    if (!response.ok) {
      let errorMessage = `请求失败: ${response.status}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error?.message || errorMessage
      } catch {
        // Use default error message
      }
      
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: errorMessage
        }
      }
    }
    
    const data = await response.json()
    const aiContent = data.choices?.[0]?.message?.content
    
    if (!aiContent) {
      return {
        success: false,
        error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
      }
    }
    
    console.log(`[AI Card Generator] AI 响应: ${aiContent}`)
    
    const result = parseClozeCardsResponse(aiContent)
    
    if (result.success) {
      console.log(`[AI Card Generator] 成功生成 ${result.cards.length} 张 Cloze Cards`)
    }
    
    return result
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "网络错误"
    console.error(`[AI Card Generator] 网络错误: ${errorMessage}`)
    
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: errorMessage
      }
    }
  }
}
