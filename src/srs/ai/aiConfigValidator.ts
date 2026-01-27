/**
 * AI 配置验证和调试工具
 */

import { getAISettings } from "./aiSettingsSchema"

export interface AIConfigValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

export function validateAIConfig(pluginName: string): AIConfigValidation {
  const settings = getAISettings(pluginName)
  const errors: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []
  
  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push("API Key 未配置")
    suggestions.push("请在插件设置中配置 API Key")
  }
  
  if (!settings.apiUrl || settings.apiUrl.trim() === "") {
    errors.push("API URL 未配置")
  } else {
    try {
      const url = new URL(settings.apiUrl)
      
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.push(`无效的协议: ${url.protocol}，应该是 http: 或 https:`)
      }
      
      if (settings.apiUrl.includes("api.openai.com")) {
        if (!settings.apiUrl.includes("/v1/chat/completions")) {
          warnings.push("OpenAI API URL 可能不正确")
          suggestions.push("标准格式: https://api.openai.com/v1/chat/completions")
        }
      } else if (settings.apiUrl.includes("api.deepseek.com")) {
        if (!settings.apiUrl.includes("/chat/completions")) {
          warnings.push("DeepSeek API URL 可能不正确")
          suggestions.push("标准格式: https://api.deepseek.com/chat/completions")
        }
      } else if (settings.apiUrl.includes("localhost") || settings.apiUrl.includes("127.0.0.1")) {
        if (!settings.apiUrl.includes("/v1/chat/completions") && !settings.apiUrl.includes("/api/chat")) {
          warnings.push("本地 API URL 格式可能不正确")
          suggestions.push("Ollama 格式: http://localhost:11434/v1/chat/completions")
        }
      }
    } catch (error) {
      errors.push(`API URL 格式错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  if (!settings.model || settings.model.trim() === "") {
    warnings.push("模型名称未配置，将使用默认值")
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  }
}

export function getAIServiceExamples(): Record<string, { url: string; model: string; description: string }> {
  return {
    "OpenAI": {
      url: "https://api.openai.com/v1/chat/completions",
      model: "gpt-3.5-turbo",
      description: "OpenAI 官方 API"
    },
    "OpenAI (GPT-4)": {
      url: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4",
      description: "OpenAI GPT-4 模型（需要更高权限）"
    },
    "DeepSeek": {
      url: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      description: "DeepSeek AI 服务"
    },
    "Ollama (本地)": {
      url: "http://localhost:11434/v1/chat/completions",
      model: "llama2",
      description: "本地 Ollama 服务（需要先启动 Ollama）"
    },
    "Azure OpenAI": {
      url: "https://YOUR-RESOURCE-NAME.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT-NAME/chat/completions?api-version=2023-05-15",
      model: "gpt-35-turbo",
      description: "Azure OpenAI 服务（需要替换 YOUR-RESOURCE-NAME 和 YOUR-DEPLOYMENT-NAME）"
    }
  }
}

export function formatAIConfigError(error: any, settings: ReturnType<typeof getAISettings>): string {
  const errorCode = error?.code || "UNKNOWN"
  const errorMessage = error?.message || String(error)
  
  let detailedMessage = `AI API 错误 (${errorCode}): ${errorMessage}\n\n`
  
  detailedMessage += "当前配置:\n"
  detailedMessage += `- API URL: ${settings.apiUrl}\n`
  detailedMessage += `- 模型: ${settings.model}\n`
  detailedMessage += `- API Key: ${settings.apiKey ? "已配置 (长度: " + settings.apiKey.length + ")" : "未配置"}\n\n`
  
  if (errorCode === "HTTP_404") {
    detailedMessage += "可能的原因:\n"
    detailedMessage += "1. API URL 配置错误\n"
    detailedMessage += "2. 使用了错误的端点路径\n"
    detailedMessage += "3. API 服务不支持该端点\n\n"
    
    detailedMessage += "建议:\n"
    const examples = getAIServiceExamples()
    detailedMessage += "请检查 API URL 是否正确，常见配置:\n"
    for (const [name, config] of Object.entries(examples)) {
      detailedMessage += `- ${name}: ${config.url}\n`
    }
  } else if (errorCode === "HTTP_401" || errorCode === "HTTP_403") {
    detailedMessage += "可能的原因:\n"
    detailedMessage += "1. API Key 无效或已过期\n"
    detailedMessage += "2. API Key 权限不足\n"
    detailedMessage += "3. API Key 格式错误\n\n"
    
    detailedMessage += "建议:\n"
    detailedMessage += "1. 检查 API Key 是否正确\n"
    detailedMessage += "2. 确认 API Key 有访问该模型的权限\n"
    detailedMessage += "3. 尝试重新生成 API Key\n"
  } else if (errorCode === "NETWORK_ERROR") {
    detailedMessage += "可能的原因:\n"
    detailedMessage += "1. 网络连接问题\n"
    detailedMessage += "2. API 服务不可达\n"
    detailedMessage += "3. 防火墙或代理阻止\n\n"
    
    detailedMessage += "建议:\n"
    detailedMessage += "1. 检查网络连接\n"
    detailedMessage += "2. 如果使用本地服务（如 Ollama），确认服务已启动\n"
    detailedMessage += "3. 检查防火墙设置\n"
  }
  
  return detailedMessage
}

export async function testAIConfigWithDetails(pluginName: string): Promise<{
  success: boolean
  message: string
  details?: any
}> {
  const validation = validateAIConfig(pluginName)
  
  if (!validation.isValid) {
    return {
      success: false,
      message: "配置验证失败:\n" + validation.errors.join("\n"),
      details: validation
    }
  }
  
  if (validation.warnings.length > 0) {
    console.warn("[AI Config] 配置警告:", validation.warnings)
  }
  
  const settings = getAISettings(pluginName)
  
  console.log("[AI Config] 测试配置:")
  console.log(`- API URL: ${settings.apiUrl}`)
  console.log(`- 模型: ${settings.model}`)
  console.log(`- API Key: ${settings.apiKey ? "已配置" : "未配置"}`)
  
  try {
    const response = await fetch(settings.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5
      })
    })
    
    console.log(`[AI Config] 响应状态: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      const modelUsed = data.model || settings.model
      return {
        success: true,
        message: `连接成功！\n使用模型: ${modelUsed}`,
        details: { status: response.status, model: modelUsed }
      }
    } else {
      const errorText = await response.text()
      let errorData: any
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText }
      }
      
      const detailedError = formatAIConfigError(
        { code: `HTTP_${response.status}`, message: errorData.error?.message || errorData.message || `HTTP ${response.status}` },
        settings
      )
      
      return {
        success: false,
        message: detailedError,
        details: { status: response.status, error: errorData }
      }
    }
  } catch (error) {
    const detailedError = formatAIConfigError(
      { code: "NETWORK_ERROR", message: error instanceof Error ? error.message : String(error) },
      settings
    )
    
    return {
      success: false,
      message: detailedError,
      details: { error }
    }
  }
}
