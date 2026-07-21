/**
 * AI 工具栏提示词库 — 独立存储与读写
 *
 * 故意不进入插件 settings schema，避免挤占原生设置页。
 * 持久化使用 orca.plugins.setData/getData（与卡组备注同路径），
 * **禁止**用 setSettings 只写库键：宿主可能整袋替换设置，冲掉 apiKey/apiUrl 等。
 *
 * 兼容：
 * - 优先读 plugin data 键 `ai.promptLibrary`
 * - 否则兼容 settings 中的 `ai.promptLibrary` / 旧键 `ai.toolbarPrompts`（只读迁移）
 */

export type ToolbarAIPromptItem = {
  label: string
  prompt: string
  /**
   * 调用 AI 时是否把整块正文作为 context 与选中文本一起发送。
   * 缺省（旧数据无此字段）按 true 兼容：此前实现在选区≠块文时总会附带块上下文。
   */
  includeBlockContext: boolean
  /**
   * 为 true 时：选中菜单项后立即后台请求，不弹窗；
   * 完成后把结果作为兄弟块插入到查询块下方，用户可再选「插入为子块」或关闭。
   * 缺省（旧数据无此字段）按 false：保持弹窗确认流程。
   */
  insertBelowOnComplete: boolean
}

export type ToolbarAIPrompt = {
  id: string
  label: string
  prompt: string
  includeBlockContext: boolean
  insertBelowOnComplete: boolean
}

/** plugin data 键（与历史 settings 键名相同，存储介质不同） */
export const PROMPT_LIBRARY_DATA_KEY = "ai.promptLibrary" as const

/** 历史 settings 键（只读兼容 / 迁移源） */
export const PROMPT_LIBRARY_STORAGE_KEY = "ai.promptLibrary" as const

/** 更旧的 settings 键，只读兼容 */
export const PROMPT_LIBRARY_LEGACY_KEY = "ai.toolbarPrompts" as const

export const DEFAULT_TOOLBAR_AI_PROMPTS: ToolbarAIPromptItem[] = [
  {
    label: "举例说明",
    prompt: "请针对选中文本给出 1～3 个具体、易懂的例子。",
    includeBlockContext: true,
    insertBelowOnComplete: true
  },
  {
    label: "翻译",
    prompt: "若选中文本主要是中文则译为英文；否则译为简体中文。保持原意与语气。",
    includeBlockContext: false,
    insertBelowOnComplete: true
  },
  {
    label: "进一步解释",
    prompt: "请进一步解释选中文本：讲清含义、难点与必要背景，简洁分点。",
    includeBlockContext: true,
    insertBelowOnComplete: true
  }
]

/**
 * 内存缓存：hydrate/save 后命中。
 * - raw === null → 从未写入，读默认三项
 * - raw 为数组 → 用户库（可为空）
 */
type PromptLibraryCacheEntry = { raw: unknown | null }

const promptLibraryCache = new Map<string, PromptLibraryCacheEntry>()

/** 测试或卸载时清空缓存 */
export function clearToolbarAIPromptCache(pluginName?: string): void {
  if (pluginName) {
    promptLibraryCache.delete(pluginName)
    return
  }
  promptLibraryCache.clear()
}

function isPromptItemShape(value: unknown): value is {
  label: string
  prompt: string
  includeBlockContext?: unknown
  insertBelowOnComplete?: unknown
} {
  if (!value || typeof value !== "object") return false
  const rec = value as Record<string, unknown>
  return typeof rec.label === "string" && typeof rec.prompt === "string"
}

function parseBooleanField(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value
  return fallback
}

/**
 * 清洗任意输入为合法提示词项（trim + 过滤空 label/prompt）。
 * 非数组 → 空数组；允许结果为空。
 * 旧项无 includeBlockContext 时默认 true；无 insertBelowOnComplete 时默认 false。
 */
export function normalizeToolbarAIPromptItems(raw: unknown): ToolbarAIPromptItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isPromptItemShape)
    .map((item) => ({
      label: item.label.trim(),
      prompt: item.prompt.trim(),
      includeBlockContext: parseBooleanField(item.includeBlockContext, true),
      insertBelowOnComplete: parseBooleanField(item.insertBelowOnComplete, false)
    }))
    .filter((item) => item.label.length > 0 && item.prompt.length > 0)
}

function toToolbarAIPrompts(items: ToolbarAIPromptItem[]): ToolbarAIPrompt[] {
  return items.map((item, index) => ({
    id: String(index),
    label: item.label,
    prompt: item.prompt,
    includeBlockContext: item.includeBlockContext,
    insertBelowOnComplete: item.insertBelowOnComplete
  }))
}

function defaultPrompts(): ToolbarAIPrompt[] {
  return toToolbarAIPrompts(
    DEFAULT_TOOLBAR_AI_PROMPTS.map((item) => ({
      label: item.label.trim(),
      prompt: item.prompt.trim(),
      includeBlockContext: item.includeBlockContext,
      insertBelowOnComplete: item.insertBelowOnComplete
    }))
  )
}

function resolvePromptsFromRaw(raw: unknown | null): ToolbarAIPrompt[] {
  if (raw == null) return defaultPrompts()
  return toToolbarAIPrompts(normalizeToolbarAIPromptItems(raw))
}

function getPluginSettingsBag(pluginName: string): Record<string, unknown> {
  return (orca.state.plugins[pluginName]?.settings ?? {}) as Record<string, unknown>
}

/**
 * 从 settings 袋读取历史库数据（只读兼容）。
 * 两者皆非数组 → null（从未初始化）。
 */
export function readRawPromptLibraryFromSettings(
  pluginName: string
): unknown | null {
  const settings = getPluginSettingsBag(pluginName)
  const primary = settings[PROMPT_LIBRARY_STORAGE_KEY]
  if (Array.isArray(primary)) return primary
  const legacy = settings[PROMPT_LIBRARY_LEGACY_KEY]
  if (Array.isArray(legacy)) return legacy
  return null
}

/** @deprecated 使用 readRawPromptLibraryFromSettings；保留别名避免外部引用断裂 */
export function readRawPromptLibrary(pluginName: string): unknown | null {
  const cached = promptLibraryCache.get(pluginName)
  if (cached) return cached.raw
  return readRawPromptLibraryFromSettings(pluginName)
}

function parseStoredDataPayload(data: unknown): {
  found: boolean
  raw: unknown | null
} {
  if (data == null) return { found: false, raw: null }
  if (typeof data === "string") {
    if (data.trim() === "") return { found: false, raw: null }
    try {
      return { found: true, raw: JSON.parse(data) as unknown }
    } catch (error) {
      console.warn(
        "[AI PromptLibrary] plugin data JSON 解析失败，将尝试 settings 迁移:",
        error
      )
      return { found: false, raw: null }
    }
  }
  // 非预期类型：不当作有效库
  return { found: false, raw: null }
}

/**
 * 从 data 层 / settings 层装载并写入内存缓存。
 * settings 有数据而 data 无时，迁移到 setData（不调用 setSettings，避免冲掉 API 配置）。
 */
export async function hydrateToolbarAIPromptLibrary(
  pluginName: string
): Promise<ToolbarAIPrompt[]> {
  let raw: unknown | null = null
  let foundInData = false

  try {
    const data = await orca.plugins.getData(pluginName, PROMPT_LIBRARY_DATA_KEY)
    const parsed = parseStoredDataPayload(data)
    foundInData = parsed.found
    raw = parsed.raw
  } catch (error) {
    console.warn(
      `[AI PromptLibrary] getData(${PROMPT_LIBRARY_DATA_KEY}) 失败:`,
      error
    )
  }

  if (!foundInData) {
    const fromSettings = readRawPromptLibraryFromSettings(pluginName)
    if (fromSettings != null) {
      const cleaned = normalizeToolbarAIPromptItems(fromSettings)
      try {
        await orca.plugins.setData(
          pluginName,
          PROMPT_LIBRARY_DATA_KEY,
          JSON.stringify(cleaned)
        )
      } catch (error) {
        console.error(
          "[AI PromptLibrary] 从 settings 迁移到 setData 失败:",
          error
        )
        // 仍用内存缓存提供一致读取；下次 hydrate/save 再试
      }
      promptLibraryCache.set(pluginName, { raw: cleaned })
      return toToolbarAIPrompts(cleaned)
    }
    promptLibraryCache.set(pluginName, { raw: null })
    return defaultPrompts()
  }

  // data 层存在（含显式空数组）
  const cleaned = Array.isArray(raw)
    ? normalizeToolbarAIPromptItems(raw)
    : []
  promptLibraryCache.set(pluginName, {
    raw: Array.isArray(raw) ? cleaned : cleaned
  })
  // 非法 JSON 结构已在 parse 失败时走 settings；此处非数组 → 当空库
  if (!Array.isArray(raw)) {
    promptLibraryCache.set(pluginName, { raw: [] })
    return []
  }
  return toToolbarAIPrompts(cleaned)
}

/**
 * 同步读取工具栏提示词列表。
 * - 已 hydrate/save：走内存缓存
 * - 未 hydrate：回退 settings（兼容旧数据），否则默认三项
 */
export function getToolbarAIPrompts(pluginName: string): ToolbarAIPrompt[] {
  const cached = promptLibraryCache.get(pluginName)
  if (cached) {
    return resolvePromptsFromRaw(cached.raw)
  }
  return resolvePromptsFromRaw(readRawPromptLibraryFromSettings(pluginName))
}

export function findToolbarAIPrompt(
  pluginName: string,
  promptId: string
): ToolbarAIPrompt | null {
  const prompts = getToolbarAIPrompts(pluginName)
  return prompts.find((p) => p.id === promptId) ?? null
}

/**
 * 写入提示词库到 plugin data（允许空数组）。
 * 不触碰 setSettings / 原生 AI 连接配置。
 */
export async function saveToolbarAIPrompts(
  pluginName: string,
  items: ToolbarAIPromptItem[]
): Promise<ToolbarAIPrompt[]> {
  const cleaned = normalizeToolbarAIPromptItems(items)

  await orca.plugins.setData(
    pluginName,
    PROMPT_LIBRARY_DATA_KEY,
    JSON.stringify(cleaned)
  )
  promptLibraryCache.set(pluginName, { raw: cleaned })

  return toToolbarAIPrompts(cleaned)
}

export async function resetToolbarAIPromptsToDefault(
  pluginName: string
): Promise<ToolbarAIPrompt[]> {
  return saveToolbarAIPrompts(pluginName, DEFAULT_TOOLBAR_AI_PROMPTS)
}
