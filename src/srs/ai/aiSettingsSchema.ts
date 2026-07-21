/**
 * AI 设置 Schema（仅连接相关，供原生设置页）
 *
 * 工具栏提示词库不在此注册，见 aiToolbarPromptStore.ts + 提示词库面板。
 */

export const aiSettingsSchema = {
  "ai.apiKey": {
    label: "API Key",
    type: "string" as const,
    defaultValue: "",
    description: "OpenAI 兼容的 API Key（请妥善保管，不要泄露）"
  },
  "ai.apiUrl": {
    label: "API URL",
    type: "string" as const,
    defaultValue: "https://api.openai.com/v1/chat/completions",
    description: "API 端点地址，支持 OpenAI 兼容的第三方服务（如 DeepSeek、Ollama 等）"
  },
  "ai.model": {
    label: "AI Model",
    type: "string" as const,
    defaultValue: "gpt-3.5-turbo",
    description: "使用的模型名称（如 gpt-4、deepseek-chat、llama2 等）"
  }
}

export interface AISettings {
  apiKey: string
  apiUrl: string
  model: string
}

/**
 * 获取 AI 连接设置
 */
export function getAISettings(pluginName: string): AISettings {
  const settings = orca.state.plugins[pluginName]?.settings
  return {
    apiKey: settings?.["ai.apiKey"] || "",
    apiUrl: settings?.["ai.apiUrl"] || "https://api.openai.com/v1/chat/completions",
    model: settings?.["ai.model"] || "gpt-3.5-turbo"
  }
}

/**
 * 是否已配置 API Key
 */
export function isAIConfigured(pluginName: string): boolean {
  return !!getAISettings(pluginName).apiKey
}
