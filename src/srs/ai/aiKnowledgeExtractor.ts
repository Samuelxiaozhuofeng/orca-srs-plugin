/**
 * AI 知识点提取服务
 * 
 * 分析用户输入的内容，提取适合制作记忆卡片的知识点
 */

import { getAISettings, AISettings } from "./aiSettingsSchema"
import { formatAIConfigError } from "./aiConfigValidator"

/**
 * 知识点提取结果
 */
export interface KnowledgePoint {
  id: string              // 唯一标识
  text: string            // 知识点文本
  description?: string    // 简短说明
  difficulty?: number     // 难度评估 (1-5)
  recommended: boolean    // AI 推荐是否制卡
}

/**
 * 知识点提取结果类型
 */
export type ExtractKnowledgeResult = 
  | { success: true; knowledgePoints: KnowledgePoint[] }
  | { success: false; error: { code: string; message: string } }

/**
 * 知识点提取提示词模板
 */
const KNOWLEDGE_EXTRACTION_PROMPT = `你是一个知识点分析专家。请分析以下内容，提取出适合制作记忆卡片的知识点。

内容：{{content}}

要求：
1. 识别 2-5 个独立的知识点
2. 每个知识点应该是原子化的（符合最小知识点原则）
3. 评估每个知识点的难度（1-5，1最简单，5最难）
4. 标记哪些知识点最适合制作卡片（recommended: true）
5. 如果内容包含语法、概念、定义等，优先提取这些

返回 JSON 格式（不要包含其他内容）：
{
  "knowledgePoints": [
    {
      "id": "kp_1",
      "text": "知识点文本",
      "description": "简短说明（可选）",
      "difficulty": 3,
      "recommended": true
    }
  ]
}

示例：
输入："使役形（～させる）+ ない：不让/不准（某人）做某事"
输出：
{
  "knowledgePoints": [
    {
      "id": "kp_1",
      "text": "使役形（～させる）",
      "description": "表示让某人做某事的语法形式",
      "difficulty": 3,
      "recommended": true
    },
    {
      "id": "kp_2",
      "text": "ない的否定用法",
      "description": "动词否定形式",
      "difficulty": 2,
      "recommended": true
    },
    {
      "id": "kp_3",
      "text": "使役形 + ない 的组合规则",
      "description": "表示不让某人做某事",
      "difficulty": 4,
      "recommended": false
    }
  ]
}`

/**
 * 构建知识点提取提示词
 */
function buildExtractionPrompt(content: string): string {
  return KNOWLEDGE_EXTRACTION_PROMPT.replace(/\{\{content\}\}/g, content)
}

/**
 * 解析 AI 响应，提取知识点列表
 */
function parseKnowledgePointsResponse(content: string): ExtractKnowledgeResult {
  try {
    // 尝试直接解析 JSON
    const parsed = JSON.parse(content)
    if (parsed.knowledgePoints && Array.isArray(parsed.knowledgePoints)) {
      // 验证每个知识点的格式
      const validPoints = parsed.knowledgePoints.filter((kp: any) => 
        kp.id && kp.text && typeof kp.recommended === "boolean"
      )
      
      if (validPoints.length === 0) {
        return {
          success: false,
          error: {
            code: "INVALID_FORMAT",
            message: "AI 返回的知识点格式不正确"
          }
        }
      }
      
      return {
        success: true,
        knowledgePoints: validPoints.map((kp: any) => ({
          id: kp.id,
          text: kp.text,
          description: kp.description,
          difficulty: kp.difficulty || 3,
          recommended: kp.recommended
        }))
      }
    }
  } catch {
    // 尝试从文本中提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*"knowledgePoints"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.knowledgePoints && Array.isArray(parsed.knowledgePoints)) {
          const validPoints = parsed.knowledgePoints.filter((kp: any) => 
            kp.id && kp.text && typeof kp.recommended === "boolean"
          )
          
          if (validPoints.length > 0) {
            return {
              success: true,
              knowledgePoints: validPoints.map((kp: any) => ({
                id: kp.id,
                text: kp.text,
                description: kp.description,
                difficulty: kp.difficulty || 3,
                recommended: kp.recommended
              }))
            }
          }
        }
      } catch {
        // 继续到错误处理
      }
    }
  }
  
  return {
    success: false,
    error: {
      code: "PARSE_ERROR",
      message: "无法解析 AI 响应格式，请检查 AI 服务配置"
    }
  }
}

/**
 * 从内容中提取知识点
 * 
 * @param pluginName - 插件名称
 * @param content - 用户选中的内容
 * @returns 知识点列表
 */
export async function extractKnowledgePoints(
  pluginName: string,
  content: string
): Promise<ExtractKnowledgeResult> {
  const settings = getAISettings(pluginName)
  
  if (!settings.apiKey) {
    return { 
      success: false, 
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" } 
    }
  }
  
  // 构建提示词
  const prompt = buildExtractionPrompt(content)
  
  console.log(`[AI Knowledge Extractor] 开始提取知识点`)
  console.log(`[AI Knowledge Extractor] 内容长度: ${content.length}`)
  
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
            content: "你是一个知识点分析专家。你的任务是从用户输入中提取适合制作记忆卡片的知识点。请严格以 JSON 格式返回结果。" 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    })
    
    if (!response.ok) {
      let errorMessage = `请求失败: ${response.status}`
      let errorData: any
      try {
        errorData = await response.json()
        errorMessage = errorData.error?.message || errorData.message || errorMessage
      } catch {
        // 使用默认错误信息
      }
      
      const detailedError = formatAIConfigError(
        { code: `HTTP_${response.status}`, message: errorMessage },
        settings
      )
      
      console.error(`[AI Knowledge Extractor] API 错误:`)
      console.error(detailedError)
      
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: detailedError
        }
      }
    }
    
    const data = await response.json()
    const aiContent = data.choices?.[0]?.message?.content
    
    if (!aiContent) {
      console.error(`[AI Knowledge Extractor] AI 返回内容为空`)
      return {
        success: false,
        error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
      }
    }
    
    console.log(`[AI Knowledge Extractor] AI 响应: ${aiContent}`)
    
    // 解析响应
    const result = parseKnowledgePointsResponse(aiContent)
    
    if (result.success) {
      console.log(`[AI Knowledge Extractor] 成功提取 ${result.knowledgePoints.length} 个知识点`)
    }
    
    return result
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "网络错误"
    
    const detailedError = formatAIConfigError(
      { code: "NETWORK_ERROR", message: errorMessage },
      settings
    )
    
    console.error(`[AI Knowledge Extractor] 网络错误:`)
    console.error(detailedError)
    
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: detailedError
      }
    }
  }
}
