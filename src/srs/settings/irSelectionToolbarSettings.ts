/**
 * IR 原生选区工具栏（紧凑）偏好。
 *
 * 语义：对**已知**按钮做 allow-list；未知 Orca 按钮默认保持可见。
 * 运行时再按 Topic / Extract 上下文 +「是否在当前卡正文」二次过滤。
 * 仅当选区落在带合法 `data-ir-card-type` 的 `.ir-reading` 内时生效；域外不改宿主工具栏。
 *
 * 插件动作靠唯一 marker class（`orca-srs-stb-*`）识别，避免与其它插件共用 Tabler 图标冲突。
 * 原生格式仍按宿主 Tabler token 识别。
 *
 * 持久化 plugin data 键 `ir.selectionToolbar`，与 AI 连接 / 章末小测等独立。
 */

/** plugin data 键。 */
export const IR_SELECTION_TOOLBAR_PREFS_DATA_KEY = "ir.selectionToolbar" as const

/** 插件注册的 IR 相关工具栏动作（个别开关）。 */
export type IRToolbarActionId =
  | "extract"
  | "cloze"
  | "explain"
  | "aiMenu"
  | "tts"

/** 仅允许在「当前卡正文」出现的动作（近上下文 / 章节浏览必须隐藏）。 */
export const IR_TOOLBAR_CURRENT_BODY_ONLY_ACTIONS: readonly IRToolbarActionId[] =
  ["extract", "cloze", "explain"] as const

/** 仅 IR 内才应出现的按钮（域外用稳定 base CSS 隐藏；既有 Cloze/TTS/AI 域外保持可见）。 */
export const IR_ONLY_TOOLBAR_ACTIONS: readonly IRToolbarActionId[] = [
  "extract",
  "explain"
] as const

/** 原生格式按钮分组（整组开关）。 */
export type IRNativeFormatGroupId =
  | "basicFormat"
  | "underline"
  | "textColor"
  | "highlight"
  | "fontSize"
  | "linkQuote"
  | "mathScript"
  | "clearFormat"

export type IRCardToolbarContext = "topic" | "extract"

export interface IRSelectionToolbarSettings {
  actions: Record<IRToolbarActionId, boolean>
  formatGroups: Record<IRNativeFormatGroupId, boolean>
}

/** 工具栏按钮语义身份：插件动作靠 marker；原生格式靠 Tabler。 */
export type ToolbarIconClassification =
  | { kind: "action"; action: IRToolbarActionId }
  | { kind: "format"; group: IRNativeFormatGroupId }
  | { kind: "unknown" }

/** 推荐默认：摘录/挖空/一键解释开；AI 菜单与 TTS 关；全部原生格式组关。 */
export const DEFAULT_IR_SELECTION_TOOLBAR_SETTINGS: IRSelectionToolbarSettings = {
  actions: {
    extract: true,
    cloze: true,
    explain: true,
    aiMenu: false,
    tts: false
  },
  formatGroups: {
    basicFormat: false,
    underline: false,
    textColor: false,
    highlight: false,
    fontSize: false,
    linkQuote: false,
    mathScript: false,
    clearFormat: false
  }
}

export const IR_TOOLBAR_ACTION_IDS: readonly IRToolbarActionId[] = [
  "extract",
  "cloze",
  "explain",
  "aiMenu",
  "tts"
] as const

export const IR_NATIVE_FORMAT_GROUP_IDS: readonly IRNativeFormatGroupId[] = [
  "basicFormat",
  "underline",
  "textColor",
  "highlight",
  "fontSize",
  "linkQuote",
  "mathScript",
  "clearFormat"
] as const

/** UI 文案（设置面板 / 文档）。 */
export const IR_TOOLBAR_ACTION_LABELS: Record<IRToolbarActionId, string> = {
  extract: "摘录",
  cloze: "挖空",
  explain: "一键解释",
  aiMenu: "AI 快捷菜单",
  tts: "选区语音 (TTS)"
}

export const IR_NATIVE_FORMAT_GROUP_LABELS: Record<IRNativeFormatGroupId, string> = {
  basicFormat: "基础格式（粗体/斜体/删除线/行内代码）",
  underline: "下划线",
  textColor: "文字颜色",
  highlight: "高亮",
  fontSize: "字号",
  linkQuote: "链接与引用",
  mathScript: "数学与上下标",
  clearFormat: "格式清理"
}

/**
 * 插件动作唯一 marker（用于 CSS 过滤与分类；勿与其它插件共用）。
 * 注册 `icon` 时与 Tabler 类并存。
 */
export const IR_TOOLBAR_ACTION_MARKER_CLASS: Record<IRToolbarActionId, string> = {
  extract: "orca-srs-stb-extract",
  cloze: "orca-srs-stb-cloze",
  explain: "orca-srs-stb-explain",
  aiMenu: "orca-srs-stb-ai-menu",
  tts: "orca-srs-stb-tts"
}

/** 仅供渲染的 Tabler token（分类动作时不单独信任这些通用类）。 */
export const IR_TOOLBAR_ACTION_TABLER_ICON: Record<IRToolbarActionId, string> = {
  extract: "ti-scissors",
  cloze: "ti-braces",
  explain: "ti-bulb",
  aiMenu: "ti-sparkles",
  tts: "ti-volume"
}

/** `registerToolbarButton({ icon })` 用的完整 class 字符串。 */
export function buildToolbarActionIconClass(action: IRToolbarActionId): string {
  return `ti ${IR_TOOLBAR_ACTION_TABLER_ICON[action]} ${IR_TOOLBAR_ACTION_MARKER_CLASS[action]}`
}

/**
 * 稳定 base CSS：域外隐藏仅 IR 新钮（摘录/解释）。
 * 放在 `ir-workspace.css`；此处导出供测试断言，不依赖控制器启动。
 */
export function buildIROnlyToolbarBaseHideCss(): string {
  const items = IR_ONLY_TOOLBAR_ACTIONS.map(
    (action) =>
      `html:not(.ir-stb-scope) .orca-editor-toolbar-bar .orca-editor-toolbar-button-item:has(.${IR_TOOLBAR_ACTION_MARKER_CLASS[action]})`
  )
  return (
    "/* IR-only toolbar buttons: hidden outside IR selection scope */\n" +
    items.join(",\n") +
    "{display:none!important;}"
  )
}

/**
 * 原生格式：精确 token 或前缀匹配（下划线/颜色/高亮等变体）。
 * 证据：Orca 选区钮 title/aria/text 为空，仅后代 Tabler class 可区分。
 */
const FORMAT_EXACT: ReadonlyMap<string, IRNativeFormatGroupId> = new Map([
  ["ti-bold", "basicFormat"],
  ["ti-italic", "basicFormat"],
  ["ti-strikethrough", "basicFormat"],
  ["ti-code", "basicFormat"],
  ["ti-text-increase", "fontSize"],
  ["ti-text-decrease", "fontSize"],
  ["ti-letter-a", "linkQuote"],
  ["ti-at", "linkQuote"],
  ["ti-link", "linkQuote"],
  ["ti-math", "mathScript"],
  ["ti-math-function", "mathScript"],
  ["ti-superscript", "mathScript"],
  ["ti-subscript", "mathScript"],
  ["ti-clear-formatting", "clearFormat"],
  ["ti-paint", "clearFormat"]
])

const FORMAT_PREFIXES: ReadonlyArray<{
  prefix: string
  group: IRNativeFormatGroupId
}> = [
  { prefix: "ti-underline", group: "underline" },
  { prefix: "ti-ripple", group: "underline" },
  { prefix: "ti-letter-t", group: "textColor" },
  { prefix: "ti-highlight", group: "highlight" }
]

const ACTION_BY_MARKER = new Map<string, IRToolbarActionId>(
  (Object.entries(IR_TOOLBAR_ACTION_MARKER_CLASS) as Array<
    [IRToolbarActionId, string]
  >).map(([action, marker]) => [marker, action])
)

type CacheEntry = { value: IRSelectionToolbarSettings }

const prefsCache = new Map<string, CacheEntry>()

function isBool(v: unknown): v is boolean {
  return v === true || v === false
}

export function getDefaultIRSelectionToolbarSettings(): IRSelectionToolbarSettings {
  return {
    actions: { ...DEFAULT_IR_SELECTION_TOOLBAR_SETTINGS.actions },
    formatGroups: { ...DEFAULT_IR_SELECTION_TOOLBAR_SETTINGS.formatGroups }
  }
}

/**
 * 严格/防御性规范化：畸形字段回退默认布尔值；未知键忽略。
 * 不抛；调用方负责对读盘失败做 console 留痕。
 */
export function normalizeIRSelectionToolbarSettings(
  input: unknown
): IRSelectionToolbarSettings {
  const defaults = getDefaultIRSelectionToolbarSettings()
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return defaults
  }
  const raw = input as {
    actions?: unknown
    formatGroups?: unknown
  }

  const actions = { ...defaults.actions }
  if (raw.actions != null && typeof raw.actions === "object" && !Array.isArray(raw.actions)) {
    const src = raw.actions as Record<string, unknown>
    for (const id of IR_TOOLBAR_ACTION_IDS) {
      if (isBool(src[id])) actions[id] = src[id]
    }
  }

  const formatGroups = { ...defaults.formatGroups }
  if (
    raw.formatGroups != null &&
    typeof raw.formatGroups === "object" &&
    !Array.isArray(raw.formatGroups)
  ) {
    const src = raw.formatGroups as Record<string, unknown>
    for (const id of IR_NATIVE_FORMAT_GROUP_IDS) {
      if (isBool(src[id])) formatGroups[id] = src[id]
    }
  }

  return { actions, formatGroups }
}

export function clearIRSelectionToolbarPrefsCache(pluginName?: string): void {
  if (pluginName) {
    prefsCache.delete(pluginName)
    return
  }
  prefsCache.clear()
}

/** 同步读取；未 hydrate 时返回推荐默认。 */
export function getIRSelectionToolbarSettings(
  pluginName: string
): IRSelectionToolbarSettings {
  const cached = prefsCache.get(pluginName)
  return cached
    ? {
        actions: { ...cached.value.actions },
        formatGroups: { ...cached.value.formatGroups }
      }
    : getDefaultIRSelectionToolbarSettings()
}

export async function hydrateIRSelectionToolbarSettings(
  pluginName: string
): Promise<IRSelectionToolbarSettings> {
  try {
    const raw = await orca.plugins.getData(
      pluginName,
      IR_SELECTION_TOOLBAR_PREFS_DATA_KEY
    )
    if (typeof raw === "string" && raw.trim() !== "") {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (parseError) {
        console.warn(
          `[渐进阅读] 选区工具栏偏好 JSON 无效（${IR_SELECTION_TOOLBAR_PREFS_DATA_KEY}），改用推荐默认:`,
          parseError
        )
        const defaults = getDefaultIRSelectionToolbarSettings()
        prefsCache.set(pluginName, { value: defaults })
        return getDefaultIRSelectionToolbarSettings()
      }
      const value = normalizeIRSelectionToolbarSettings(parsed)
      prefsCache.set(pluginName, { value })
      return {
        actions: { ...value.actions },
        formatGroups: { ...value.formatGroups }
      }
    }
  } catch (error) {
    console.warn(
      `[渐进阅读] 读取选区工具栏偏好失败（${IR_SELECTION_TOOLBAR_PREFS_DATA_KEY}），改用推荐默认:`,
      error
    )
  }

  const defaults = getDefaultIRSelectionToolbarSettings()
  prefsCache.set(pluginName, { value: defaults })
  return getDefaultIRSelectionToolbarSettings()
}

export async function saveIRSelectionToolbarSettings(
  pluginName: string,
  next: Partial<IRSelectionToolbarSettings> | IRSelectionToolbarSettings
): Promise<IRSelectionToolbarSettings> {
  const cleaned = normalizeIRSelectionToolbarSettings(next)
  await orca.plugins.setData(
    pluginName,
    IR_SELECTION_TOOLBAR_PREFS_DATA_KEY,
    JSON.stringify(cleaned)
  )
  prefsCache.set(pluginName, { value: cleaned })
  return {
    actions: { ...cleaned.actions },
    formatGroups: { ...cleaned.formatGroups }
  }
}

/**
 * 从 class 字符串提取可识别 token：
 * - 插件 marker：`orca-srs-stb-*`
 * - Tabler：`ti-*`（不含裸 `ti`）
 */
export function extractIconClassTokens(
  className: string | DOMTokenList | null | undefined
): string[] {
  if (className == null) return []
  const list =
    typeof className === "string"
      ? className.split(/\s+/).filter(Boolean)
      : Array.from(className)
  return list.filter(
    (c) =>
      (c.startsWith("ti-") && c.length > 3) || c.startsWith("orca-srs-stb-")
  )
}

/** @deprecated 使用 extractIconClassTokens；保留别名以免旧测试/调用方断裂。 */
export const extractTablerIconTokens = extractIconClassTokens

/**
 * 将单个 class token 映射到已知动作/格式组；未知返回 unknown。
 * 插件动作**仅**认 marker；通用 Tabler（如 ti-bulb）本身不是本插件动作。
 */
export function classifyToolbarIconToken(token: string): ToolbarIconClassification {
  const action = ACTION_BY_MARKER.get(token)
  if (action) return { kind: "action", action }

  if (!token.startsWith("ti-")) return { kind: "unknown" }

  const exact = FORMAT_EXACT.get(token)
  if (exact) return { kind: "format", group: exact }

  for (const { prefix, group } of FORMAT_PREFIXES) {
    if (token === prefix || token.startsWith(`${prefix}-`)) {
      return { kind: "format", group }
    }
  }

  return { kind: "unknown" }
}

/**
 * 对按钮上多个 token 取「首个已知」分类；全未知 → unknown。
 * 不依赖按钮顺序；纯 token 集合。
 */
export function classifyToolbarButtonIcons(
  tokens: readonly string[]
): ToolbarIconClassification {
  for (const token of tokens) {
    const c = classifyToolbarIconToken(token)
    if (c.kind !== "unknown") return c
  }
  return { kind: "unknown" }
}

/**
 * 在给定设置与 IR 上下文下，已知按钮是否应显示。
 * - 非 IR 作用域：返回 true（生成 CSS 不处理；IR-only 钮由 base CSS 在域外隐藏）
 * - 未知：true
 * - 当前卡正文外：摘录/挖空/解释恒隐藏
 * - Topic：永不挖空；Extract：永不摘录
 */
export function resolveToolbarButtonVisibility(args: {
  classification: ToolbarIconClassification
  settings: IRSelectionToolbarSettings
  /** 合法 IR 作用域内必为 topic|extract */
  cardType: IRCardToolbarContext | null
  inIRScope: boolean
  /** 选区是否在当前卡 `.ir-reading__body[data-ir-body-block=cardId]` 内 */
  inCurrentCardBody: boolean
}): boolean {
  if (!args.inIRScope) return true
  const { classification, settings, cardType, inCurrentCardBody } = args
  if (classification.kind === "unknown") return true

  if (classification.kind === "format") {
    return settings.formatGroups[classification.group] === true
  }

  const { action } = classification
  if (
    (IR_TOOLBAR_CURRENT_BODY_ONLY_ACTIONS as readonly string[]).includes(action) &&
    !inCurrentCardBody
  ) {
    return false
  }
  if (cardType === "topic" && action === "cloze") return false
  if (cardType === "extract" && action === "extract") return false
  return settings.actions[action] === true
}

/**
 * 生成「应隐藏」的 selector token 列表（动作 = marker；格式 = Tabler）。
 * 未知 token 永不进入列表。
 */
export function listHiddenIconTokensForContext(
  settings: IRSelectionToolbarSettings,
  cardType: IRCardToolbarContext,
  options?: { inCurrentCardBody?: boolean }
): string[] {
  const inCurrentCardBody = options?.inCurrentCardBody !== false
  const hidden = new Set<string>()

  for (const action of IR_TOOLBAR_ACTION_IDS) {
    const visible = resolveToolbarButtonVisibility({
      classification: { kind: "action", action },
      settings,
      cardType,
      inIRScope: true,
      inCurrentCardBody
    })
    if (!visible) hidden.add(IR_TOOLBAR_ACTION_MARKER_CLASS[action])
  }

  for (const [token, group] of FORMAT_EXACT) {
    if (!settings.formatGroups[group]) hidden.add(token)
  }
  for (const { prefix, group } of FORMAT_PREFIXES) {
    if (!settings.formatGroups[group]) hidden.add(prefix)
  }

  return Array.from(hidden).sort()
}

/**
 * 生成注入用 CSS（仅在 `html.ir-stb-scope` 时生效）。
 * 插件动作用唯一 marker；原生格式用 Tabler；未知按钮无规则 → 默认可见。
 */
export function buildIRSelectionToolbarHideCss(
  settings: IRSelectionToolbarSettings
): string {
  const lines: string[] = [
    "/* IR selection toolbar compact — generated; do not edit by hand */"
  ]

  const hideRule = (
    scopeSelector: string,
    iconSelector: string
  ): string =>
    `${scopeSelector} .orca-editor-toolbar-bar .orca-editor-toolbar-button-item:has(${iconSelector})` +
    "{display:none!important;}"

  const scopeAll = "html.ir-stb-scope"
  const scopeTopic = 'html.ir-stb-scope[data-ir-stb-card="topic"]'
  const scopeExtract = 'html.ir-stb-scope[data-ir-stb-card="extract"]'
  const scopeNotCurrentBody =
    'html.ir-stb-scope:not([data-ir-stb-current-body="1"])'

  // 动作开关：用唯一 marker，避免误伤其它插件同 Tabler 图标
  for (const action of IR_TOOLBAR_ACTION_IDS) {
    const marker = `.${IR_TOOLBAR_ACTION_MARKER_CLASS[action]}`
    if (!settings.actions[action]) {
      lines.push(hideRule(scopeAll, marker))
    }
  }

  // 当前卡正文外：摘录/挖空/解释恒隐藏（近上下文 / 章节浏览）
  for (const action of IR_TOOLBAR_CURRENT_BODY_ONLY_ACTIONS) {
    lines.push(
      hideRule(scopeNotCurrentBody, `.${IR_TOOLBAR_ACTION_MARKER_CLASS[action]}`)
    )
  }

  // Topic 永不挖空；Extract 永不摘录（即使开关为开且在正文内）
  lines.push(
    hideRule(scopeTopic, `.${IR_TOOLBAR_ACTION_MARKER_CLASS.cloze}`)
  )
  lines.push(
    hideRule(scopeExtract, `.${IR_TOOLBAR_ACTION_MARKER_CLASS.extract}`)
  )

  // 格式组：关则隐藏精确 token + 前缀变体
  for (const [token, group] of FORMAT_EXACT) {
    if (!settings.formatGroups[group]) {
      lines.push(hideRule(scopeAll, `.${token}`))
    }
  }
  for (const { prefix, group } of FORMAT_PREFIXES) {
    if (!settings.formatGroups[group]) {
      lines.push(hideRule(scopeAll, `.${prefix}, [class*="${prefix}-"]`))
    }
  }

  return lines.join("\n")
}
