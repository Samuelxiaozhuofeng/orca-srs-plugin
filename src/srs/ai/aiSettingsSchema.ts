/**
 * AI 连接设置：独立面板 + plugin data 持久化
 *
 * 不再注册到原生 setSettingsSchema，避免挤占设置页，也避免 setSettings 副作用。
 * 兼容：hydrate 时从旧 settings 键 `ai.apiKey` / `ai.apiUrl` / `ai.model` 迁移到 setData。
 */

export const DEFAULT_AI_API_URL =
  "https://api.openai.com/v1/chat/completions"
export const DEFAULT_AI_MODEL = "gpt-3.5-turbo"

/** 思考强度：default = 请求体不传 reasoning_effort */
export const AI_REASONING_EFFORTS = [
  "default",
  "low",
  "medium",
  "high"
] as const
export type AIReasoningEffort = (typeof AI_REASONING_EFFORTS)[number]
export const DEFAULT_AI_REASONING_EFFORT: AIReasoningEffort = "default"
export const DEFAULT_AI_ENABLE_NATIVE_WEB_SEARCH = false

/** plugin data 键 */
export const AI_CONNECTION_DATA_KEY = "ai.connection" as const

/** 历史 settings 键（只读迁移） */
export const AI_SETTINGS_KEYS = {
  apiKey: "ai.apiKey",
  apiUrl: "ai.apiUrl",
  model: "ai.model"
} as const

/**
 * @deprecated 已移出原生设置页；保留空对象以免外部 spread 报错。
 * 请使用 AI 服务设置面板 + setData。
 */
export const aiSettingsSchema = {} as const

export interface AISettings {
  apiKey: string
  apiUrl: string
  model: string
  /**
   * 是否在 Chat Completions 中附带原生联网 tool（`web_search`）。
   * 仅当当前 model 为 grok-4.5 时生效；其它模型忽略该开关，不发 tools。
   * 默认 false。
   */
  enableNativeWebSearch: boolean
  /**
   * 思考强度。`default` 不传字段；`low`/`medium`/`high` 写入 `reasoning_effort`。
   * 仅部分推理模型/网关支持。
   */
  reasoningEffort: AIReasoningEffort
}

type CacheEntry = { value: AISettings }

const aiSettingsCache = new Map<string, CacheEntry>()

export function clearAISettingsCache(pluginName?: string): void {
  if (pluginName) {
    aiSettingsCache.delete(pluginName)
    return
  }
  aiSettingsCache.clear()
}

function normalizeReasoningEffort(value: unknown): AIReasoningEffort {
  if (
    typeof value === "string" &&
    (AI_REASONING_EFFORTS as readonly string[]).includes(value)
  ) {
    return value as AIReasoningEffort
  }
  return DEFAULT_AI_REASONING_EFFORT
}

export function normalizeAISettings(input: Partial<AISettings> | null | undefined): AISettings {
  const apiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : ""
  const apiUrlRaw = typeof input?.apiUrl === "string" ? input.apiUrl.trim() : ""
  const modelRaw = typeof input?.model === "string" ? input.model.trim() : ""
  const enableNativeWebSearch =
    typeof input?.enableNativeWebSearch === "boolean"
      ? input.enableNativeWebSearch
      : DEFAULT_AI_ENABLE_NATIVE_WEB_SEARCH
  return {
    apiKey,
    apiUrl: apiUrlRaw || DEFAULT_AI_API_URL,
    model: modelRaw || DEFAULT_AI_MODEL,
    enableNativeWebSearch,
    reasoningEffort: normalizeReasoningEffort(input?.reasoningEffort)
  }
}

function readAISettingsFromPluginSettings(pluginName: string): AISettings | null {
  const settings = orca.state.plugins[pluginName]?.settings as
    | Record<string, unknown>
    | undefined
  if (!settings) return null
  const hasAny =
    typeof settings[AI_SETTINGS_KEYS.apiKey] === "string" ||
    typeof settings[AI_SETTINGS_KEYS.apiUrl] === "string" ||
    typeof settings[AI_SETTINGS_KEYS.model] === "string"
  if (!hasAny) return null
  return normalizeAISettings({
    apiKey: (settings[AI_SETTINGS_KEYS.apiKey] as string) || "",
    apiUrl: (settings[AI_SETTINGS_KEYS.apiUrl] as string) || "",
    model: (settings[AI_SETTINGS_KEYS.model] as string) || ""
  })
}

/**
 * 同步读取 AI 连接设置。
 * 优先内存缓存（hydrate/save 后）；否则回退 settings 迁移源；再否则默认值。
 */
export function getAISettings(pluginName: string): AISettings {
  const cached = aiSettingsCache.get(pluginName)
  if (cached) return { ...cached.value }

  const fromSettings = readAISettingsFromPluginSettings(pluginName)
  if (fromSettings) return fromSettings

  return normalizeAISettings({})
}

/**
 * 仅更新内存缓存（不写 setData）。
 * 用于「测试连接」等读草稿场景；调用方须在 finally 中恢复。
 */
export function setAISettingsCache(
  pluginName: string,
  value: Partial<AISettings>
): void {
  aiSettingsCache.set(pluginName, { value: normalizeAISettings(value) })
}

export function isAIConfigured(pluginName: string): boolean {
  return !!getAISettings(pluginName).apiKey
}

function parseDataPayload(data: unknown): AISettings | null {
  if (data == null) return null
  if (typeof data !== "string" || data.trim() === "") return null
  try {
    const parsed = JSON.parse(data) as unknown
    if (!parsed || typeof parsed !== "object") return null
    return normalizeAISettings(parsed as Partial<AISettings>)
  } catch (error) {
    console.warn("[AI Settings] connection data JSON 解析失败:", error)
    return null
  }
}

/**
 * 从 setData / 旧 settings 装载并缓存。settings 有值而 data 无时迁移到 setData。
 */
export async function hydrateAISettings(pluginName: string): Promise<AISettings> {
  let fromData: AISettings | null = null
  try {
    const data = await orca.plugins.getData(pluginName, AI_CONNECTION_DATA_KEY)
    fromData = parseDataPayload(data)
  } catch (error) {
    console.warn(`[AI Settings] getData(${AI_CONNECTION_DATA_KEY}) 失败:`, error)
  }

  if (fromData) {
    aiSettingsCache.set(pluginName, { value: fromData })
    return { ...fromData }
  }

  const fromSettings = readAISettingsFromPluginSettings(pluginName)
  if (fromSettings) {
    try {
      await orca.plugins.setData(
        pluginName,
        AI_CONNECTION_DATA_KEY,
        JSON.stringify(fromSettings)
      )
    } catch (error) {
      console.error("[AI Settings] 从 settings 迁移到 setData 失败:", error)
    }
    aiSettingsCache.set(pluginName, { value: fromSettings })
    return { ...fromSettings }
  }

  const defaults = normalizeAISettings({})
  aiSettingsCache.set(pluginName, { value: defaults })
  return { ...defaults }
}

/**
 * 写入 AI 连接设置到 plugin data（不触碰 setSettings）。
 */
export async function saveAISettings(
  pluginName: string,
  next: Partial<AISettings>
): Promise<AISettings> {
  const cleaned = normalizeAISettings(next)
  await orca.plugins.setData(
    pluginName,
    AI_CONNECTION_DATA_KEY,
    JSON.stringify(cleaned)
  )
  aiSettingsCache.set(pluginName, { value: cleaned })
  return { ...cleaned }
}
