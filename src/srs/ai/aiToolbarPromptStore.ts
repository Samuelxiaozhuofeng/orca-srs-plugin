/**
 * AI 工具栏提示词库 — 独立存储与读写
 *
 * 故意不进入插件 settings schema，避免挤占原生设置页。
 * 数据仍落在插件 app 级持久化袋中（setSettings），仅通过「提示词库」面板管理。
 *
 * 兼容：历史上 schema 键 `ai.toolbarPrompts` 若已有数据，继续读取；
 * 新写入统一使用 `ai.promptLibrary`。
 */

export type ToolbarAIPromptItem = {
  label: string
  prompt: string
  /**
   * 调用 AI 时是否把整块正文作为 context 与选中文本一起发送。
   * 缺省（旧数据无此字段）按 true 兼容：此前实现在选区≠块文时总会附带块上下文。
   */
  includeBlockContext: boolean
}

export type ToolbarAIPrompt = {
  id: string
  label: string
  prompt: string
  includeBlockContext: boolean
}

/** 当前库存储键（不进 settings schema） */
export const PROMPT_LIBRARY_STORAGE_KEY = "ai.promptLibrary" as const

/** 旧版 schema / 存储键，只读兼容 */
export const PROMPT_LIBRARY_LEGACY_KEY = "ai.toolbarPrompts" as const

export const DEFAULT_TOOLBAR_AI_PROMPTS: ToolbarAIPromptItem[] = [
  {
    label: "举例说明",
    prompt: "请针对选中文本给出 1～3 个具体、易懂的例子。",
    includeBlockContext: true
  },
  {
    label: "翻译",
    prompt: "若选中文本主要是中文则译为英文；否则译为简体中文。保持原意与语气。",
    includeBlockContext: false
  },
  {
    label: "进一步解释",
    prompt: "请进一步解释选中文本：讲清含义、难点与必要背景，简洁分点。",
    includeBlockContext: true
  }
]

function isPromptItemShape(value: unknown): value is {
  label: string
  prompt: string
  includeBlockContext?: unknown
} {
  if (!value || typeof value !== "object") return false
  const rec = value as Record<string, unknown>
  return typeof rec.label === "string" && typeof rec.prompt === "string"
}

function parseIncludeBlockContext(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value
  return fallback
}

/**
 * 清洗任意输入为合法提示词项（trim + 过滤空 label/prompt）。
 * 非数组 → 空数组；允许结果为空。
 * 旧项无 includeBlockContext 时默认 true（兼容旧行为）。
 */
export function normalizeToolbarAIPromptItems(raw: unknown): ToolbarAIPromptItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isPromptItemShape)
    .map((item) => ({
      label: item.label.trim(),
      prompt: item.prompt.trim(),
      includeBlockContext: parseIncludeBlockContext(item.includeBlockContext, true)
    }))
    .filter((item) => item.label.length > 0 && item.prompt.length > 0)
}

function toToolbarAIPrompts(items: ToolbarAIPromptItem[]): ToolbarAIPrompt[] {
  return items.map((item, index) => ({
    id: String(index),
    label: item.label,
    prompt: item.prompt,
    includeBlockContext: item.includeBlockContext
  }))
}

function getPluginSettingsBag(pluginName: string): Record<string, unknown> {
  return (orca.state.plugins[pluginName]?.settings ?? {}) as Record<string, unknown>
}

/**
 * 读取原始库数据：
 * - 优先 `ai.promptLibrary`
 * - 否则兼容 `ai.toolbarPrompts`
 * - 两者皆非数组 → null（表示从未初始化，调用方用默认）
 */
export function readRawPromptLibrary(pluginName: string): unknown | null {
  const settings = getPluginSettingsBag(pluginName)
  const primary = settings[PROMPT_LIBRARY_STORAGE_KEY]
  if (Array.isArray(primary)) return primary
  const legacy = settings[PROMPT_LIBRARY_LEGACY_KEY]
  if (Array.isArray(legacy)) return legacy
  return null
}

/**
 * 读取工具栏提示词列表。
 * - 从未写入（raw null）→ 默认三项
 * - 已写入数组（含空）→ 按用户数据，可为空
 */
export function getToolbarAIPrompts(pluginName: string): ToolbarAIPrompt[] {
  const raw = readRawPromptLibrary(pluginName)
  if (raw == null) {
    return toToolbarAIPrompts(
      DEFAULT_TOOLBAR_AI_PROMPTS.map((item) => ({
        label: item.label.trim(),
        prompt: item.prompt.trim(),
        includeBlockContext: item.includeBlockContext
      }))
    )
  }
  return toToolbarAIPrompts(normalizeToolbarAIPromptItems(raw))
}

export function findToolbarAIPrompt(
  pluginName: string,
  promptId: string
): ToolbarAIPrompt | null {
  const prompts = getToolbarAIPrompts(pluginName)
  return prompts.find((p) => p.id === promptId) ?? null
}

/**
 * 写入提示词库（仅 patch 库键；允许空数组）。
 */
export async function saveToolbarAIPrompts(
  pluginName: string,
  items: ToolbarAIPromptItem[]
): Promise<ToolbarAIPrompt[]> {
  const cleaned = normalizeToolbarAIPromptItems(items)

  await orca.plugins.setSettings("app", pluginName, {
    [PROMPT_LIBRARY_STORAGE_KEY]: cleaned,
    [PROMPT_LIBRARY_LEGACY_KEY]: null
  })

  const plugin = orca.state.plugins[pluginName]
  if (plugin) {
    const next = {
      ...(plugin.settings ?? {}),
      [PROMPT_LIBRARY_STORAGE_KEY]: cleaned
    } as Record<string, unknown>
    delete next[PROMPT_LIBRARY_LEGACY_KEY]
    plugin.settings = next
  }

  return getToolbarAIPrompts(pluginName)
}

export async function resetToolbarAIPromptsToDefault(
  pluginName: string
): Promise<ToolbarAIPrompt[]> {
  return saveToolbarAIPrompts(pluginName, DEFAULT_TOOLBAR_AI_PROMPTS)
}
