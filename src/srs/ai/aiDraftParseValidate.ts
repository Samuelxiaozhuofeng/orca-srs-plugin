/**
 * AI 闪卡响应解析与确定性校验（无第三方依赖）
 *
 * Draft `id` is always a local unique identity — model-provided IDs are ignored.
 */

import {
  type AICardDraft,
  type AICardType,
  type AIDraftValidationResult,
  type BasicCardDraft,
  type ChoiceCardDraft,
  type ChoiceOptionDraft,
  type ClozeCardDraft,
  type MaxCardsOption,
  type RejectedDraftItem,
  CHOICE_OPTION_MAX,
  CHOICE_OPTION_MIN,
  FIELD_LIMITS,
  SOURCE_QUOTE_MIN_TARGET
} from "./aiDraftTypes"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * 规范化空白，用于接地与包含关系（保留原始字段写入）
 */
export function normalizeForContainment(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Strip Markdown link/image syntax for grounding only.
 * `[label](url)` / `![alt](url)` → visible label/alt.
 * Supports one level of parentheses inside the URL (Wikipedia-style).
 * Does not mutate stored draft fields.
 */
export function stripMarkdownLinks(text: string): string {
  // Image first so `![...](...)` is not partially handled as a link.
  let s = text.replace(
    /!\[([^\]]*)\]\(((?:[^()]|\([^)]*\))*)\)/g,
    "$1"
  )
  s = s.replace(/\[([^\]]+)\]\(((?:[^()]|\([^)]*\))*)\)/g, "$1")
  return s
}

/**
 * Grounding-only normalization: strip Markdown links, drop bare numeric
 * footnote markers like `[1]` common in wiki paste, then collapse whitespace.
 * Used when models return plain readable text while the block still has MD links.
 */
export function normalizeForGrounding(text: string): string {
  let s = stripMarkdownLinks(text)
  // Wikipedia-style citation markers; strip on both sides so quote/source align.
  s = s.replace(/\[(\d+)\]/g, "")
  return normalizeForContainment(s)
}

/**
 * Minimum informative sourceQuote length for a given source.
 * Documented rule: min(8, normalized source length).
 */
export function minSourceQuoteLength(sourceText: string): number {
  const n = normalizeForContainment(sourceText).length
  if (n <= 0) return 0
  return Math.min(SOURCE_QUOTE_MIN_TARGET, n)
}

/**
 * Contiguous-excerpt check: exact whitespace-normalized first, then
 * Markdown-stripped grounding form (models often drop link markup).
 */
function isGroundedExcerpt(sourceText: string, excerpt: string): boolean {
  const sourceWs = normalizeForContainment(sourceText)
  const partWs = normalizeForContainment(excerpt)
  if (sourceWs && partWs && sourceWs.includes(partWs)) return true

  const sourceG = normalizeForGrounding(sourceText)
  const partG = normalizeForGrounding(excerpt)
  if (!sourceG || !partG) return false
  return sourceG.includes(partG)
}

/**
 * sourceQuote 是否 grounded 于 source（空白规范化；兼容 Markdown 链接纯文本摘录）
 */
/** 省略号分隔符：中文 `……`、西文 `...`、单个 `…`。 */
const QUOTE_ELLIPSIS = /(?:…{1,}|\.{3,})/

/** 拆开后每段仍需有足够信息量，避免用一堆碎片凑出「接地」。 */
const MIN_ELLIPSIS_SEGMENT_LENGTH = 4

/**
 * sourceQuote 是否接地。
 *
 * 除了整段连续匹配，还接受**用省略号拼接的多段引用**：模型经常写成
 * 「前半句……后半句」，两段各自都出自原文，接地依据其实完全成立，
 * 一律判为「未出现在源文本中」是过度严格，会把好卡整批打掉。
 *
 * 放宽的边界很清楚：每一段都必须**独立通过**同一套接地判定，且不能是
 * 碎片——否则就成了用几个词拼出一个假的「引用」。
 */
export function isSourceQuoteGrounded(sourceText: string, sourceQuote: string): boolean {
  if (isGroundedExcerpt(sourceText, sourceQuote)) return true

  const segments = sourceQuote
    .split(QUOTE_ELLIPSIS)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (segments.length < 2) return false
  return segments.every(
    (segment) =>
      segment.length >= MIN_ELLIPSIS_SEGMENT_LENGTH &&
      isGroundedExcerpt(sourceText, segment)
  )
}

/**
 * Whether `excerpt` is a contiguous excerpt of `source` (normalized whitespace;
 * Markdown link labels accepted when source uses `[label](url)`).
 */
export function isContiguousExcerpt(sourceText: string, excerpt: string): boolean {
  return isGroundedExcerpt(sourceText, excerpt)
}

function isSourceQuoteInformative(sourceText: string, sourceQuote: string): boolean {
  const quote = normalizeForContainment(sourceQuote)
  const minLen = minSourceQuoteLength(sourceText)
  return quote.length >= minLen
}

/**
 * 从模型响应中安全提取 JSON 文本：纯 JSON 或单个 fenced 代码块。
 * 不使用贪婪正则吞并无关对象。
 */
export function extractJsonText(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed
  }

  const fenceMatch = trimmed.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i)
  if (fenceMatch && fenceMatch[1] != null) {
    const inner = fenceMatch[1].trim()
    return inner || null
  }

  const embedded = trimmed.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i)
  if (embedded && embedded[1] != null) {
    const inner = embedded[1].trim()
    if (inner.startsWith("{") || inner.startsWith("[")) {
      return inner
    }
  }

  return null
}

/** Local UI identity — never reuse model ids */
export function allocateLocalDraftId(acceptedIndex: number): string {
  return `draft_${acceptedIndex + 1}`
}

function draftDedupeKey(draft: AICardDraft): string {
  if (draft.type === "basic") {
    return `basic|${normalizeForContainment(draft.question).toLowerCase()}|${normalizeForContainment(draft.answer).toLowerCase()}`
  }
  if (draft.type === "choice") {
    // 题干相同即视为重复：同一考点换一组干扰项不算新卡
    return `choice|${normalizeForContainment(draft.question).toLowerCase()}`
  }
  return `cloze|${normalizeForContainment(draft.text).toLowerCase()}|${normalizeForContainment(draft.clozeText).toLowerCase()}`
}

/**
 * Model-output Basic validation (strict grounding).
 * Local id is assigned by the caller after acceptance.
 */
function validateBasicRaw(
  raw: Record<string, unknown>,
  sourceText: string,
  allowedTypes: AICardType[]
): { ok: true; draft: Omit<BasicCardDraft, "id"> } | { ok: false; reason: string } {
  if (!allowedTypes.includes("basic")) {
    return { ok: false, reason: "未启用问答卡型" }
  }
  if (raw.type != null && raw.type !== "basic") {
    return { ok: false, reason: `type 应为 "basic"，收到 ${String(raw.type)}` }
  }

  const question = trimString(raw.question)
  const answer = trimString(raw.answer)
  const sourceQuote = trimString(raw.sourceQuote)

  if (!isNonEmptyString(question)) return { ok: false, reason: "question 为空" }
  if (!isNonEmptyString(answer)) return { ok: false, reason: "answer 为空" }
  if (!isNonEmptyString(sourceQuote)) return { ok: false, reason: "sourceQuote 为空" }

  if (question.length > FIELD_LIMITS.question) {
    return { ok: false, reason: `question 超过 ${FIELD_LIMITS.question} 字符` }
  }
  if (answer.length > FIELD_LIMITS.answer) {
    return { ok: false, reason: `answer 超过 ${FIELD_LIMITS.answer} 字符` }
  }
  if (sourceQuote.length > FIELD_LIMITS.sourceQuote) {
    return { ok: false, reason: `sourceQuote 超过 ${FIELD_LIMITS.sourceQuote} 字符` }
  }

  if (!isSourceQuoteGrounded(sourceText, sourceQuote)) {
    return { ok: false, reason: "sourceQuote 未出现在源文本中" }
  }
  if (!isSourceQuoteInformative(sourceText, sourceQuote)) {
    return {
      ok: false,
      reason: `sourceQuote 过短（至少 ${minSourceQuoteLength(sourceText)} 个有效字符）`
    }
  }

  // answer must be copied verbatim from sourceQuote (normalized whitespace OK)
  if (!isContiguousExcerpt(sourceQuote, answer)) {
    return { ok: false, reason: "answer 未出现在 sourceQuote 中" }
  }

  return {
    ok: true,
    draft: { type: "basic", question, answer, sourceQuote }
  }
}

function validateClozeRaw(
  raw: Record<string, unknown>,
  sourceText: string,
  allowedTypes: AICardType[]
): { ok: true; draft: Omit<ClozeCardDraft, "id"> } | { ok: false; reason: string } {
  if (!allowedTypes.includes("cloze")) {
    return { ok: false, reason: "未启用填空卡型" }
  }
  if (raw.type != null && raw.type !== "cloze") {
    return { ok: false, reason: `type 应为 "cloze"，收到 ${String(raw.type)}` }
  }

  const text = trimString(raw.text)
  const clozeText = trimString(raw.clozeText)
  const sourceQuote = trimString(raw.sourceQuote)

  if (!isNonEmptyString(text)) return { ok: false, reason: "text 为空" }
  if (!isNonEmptyString(clozeText)) return { ok: false, reason: "clozeText 为空" }
  if (!isNonEmptyString(sourceQuote)) return { ok: false, reason: "sourceQuote 为空" }

  if (text.length > FIELD_LIMITS.text) {
    return { ok: false, reason: `text 超过 ${FIELD_LIMITS.text} 字符` }
  }
  if (clozeText.length > FIELD_LIMITS.clozeText) {
    return { ok: false, reason: `clozeText 超过 ${FIELD_LIMITS.clozeText} 字符` }
  }
  if (sourceQuote.length > FIELD_LIMITS.sourceQuote) {
    return { ok: false, reason: `sourceQuote 超过 ${FIELD_LIMITS.sourceQuote} 字符` }
  }

  if (!text.includes(clozeText)) {
    return { ok: false, reason: "clozeText 未出现在 text 中" }
  }

  // Entire cloze text must be a contiguous excerpt of the source
  if (!isContiguousExcerpt(sourceText, text)) {
    return { ok: false, reason: "text 不是源文本的连续摘录" }
  }

  if (!isSourceQuoteGrounded(sourceText, sourceQuote)) {
    return { ok: false, reason: "sourceQuote 未出现在源文本中" }
  }
  if (!isSourceQuoteInformative(sourceText, sourceQuote)) {
    return {
      ok: false,
      reason: `sourceQuote 过短（至少 ${minSourceQuoteLength(sourceText)} 个有效字符）`
    }
  }

  return {
    ok: true,
    draft: { type: "cloze", text, clozeText, sourceQuote }
  }
}

/**
 * Model-output Choice validation.
 *
 * 干扰项**允许模型合成**——这正是 LLM 相对人工的优势，强求逐字摘录只会
 * 让整批卡失败。接地要求落在 sourceQuote 上：这张卡必须有源文本依据。
 */
function validateChoiceRaw(
  raw: Record<string, unknown>,
  sourceText: string,
  allowedTypes: AICardType[]
): { ok: true; draft: Omit<ChoiceCardDraft, "id"> } | { ok: false; reason: string } {
  if (!allowedTypes.includes("choice")) {
    return { ok: false, reason: "未启用选择题卡型" }
  }

  const question = trimString(raw.question)
  const sourceQuote = trimString(raw.sourceQuote)

  if (!isNonEmptyString(question)) {
    return { ok: false, reason: "question 为空" }
  }
  if (question.length > FIELD_LIMITS.question) {
    return { ok: false, reason: `question 超过 ${FIELD_LIMITS.question} 字符` }
  }
  if (!isNonEmptyString(sourceQuote)) {
    return { ok: false, reason: "sourceQuote 为空" }
  }
  if (sourceQuote.length > FIELD_LIMITS.sourceQuote) {
    return { ok: false, reason: `sourceQuote 超过 ${FIELD_LIMITS.sourceQuote} 字符` }
  }

  const rawOptions = raw.options
  if (!Array.isArray(rawOptions)) {
    return { ok: false, reason: "options 不是数组" }
  }
  if (rawOptions.length < CHOICE_OPTION_MIN) {
    return { ok: false, reason: `选项少于 ${CHOICE_OPTION_MIN} 项` }
  }
  if (rawOptions.length > CHOICE_OPTION_MAX) {
    return { ok: false, reason: `选项多于 ${CHOICE_OPTION_MAX} 项` }
  }

  const options: ChoiceOptionDraft[] = []
  const seen = new Set<string>()
  for (const item of rawOptions) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, reason: "选项项不是对象" }
    }
    const record = item as Record<string, unknown>
    const text = trimString(record.text)
    if (!isNonEmptyString(text)) {
      return { ok: false, reason: "存在空选项" }
    }
    if (text.length > FIELD_LIMITS.optionText) {
      return { ok: false, reason: `选项超过 ${FIELD_LIMITS.optionText} 字符` }
    }
    const key = normalizeForContainment(text).toLowerCase()
    if (seen.has(key)) {
      return { ok: false, reason: "存在重复选项" }
    }
    seen.add(key)
    options.push({ text, correct: record.correct === true })
  }

  const correctCount = options.filter((o) => o.correct).length
  if (correctCount === 0) {
    return { ok: false, reason: "没有标记正确选项" }
  }
  // 全对等于没考点：复习时任选皆对，卡片没有区分度
  if (correctCount === options.length) {
    return { ok: false, reason: "所有选项都被标为正确" }
  }

  if (!isSourceQuoteGrounded(sourceText, sourceQuote)) {
    return { ok: false, reason: "sourceQuote 未出现在源文本中" }
  }
  if (!isSourceQuoteInformative(sourceText, sourceQuote)) {
    return { ok: false, reason: "sourceQuote 过短，信息量不足" }
  }

  return { ok: true, draft: { type: "choice", question, options, sourceQuote } }
}

/**
 * 解析并校验模型返回的卡片草稿列表。
 *
 * 部分合法卡可保留；零合法卡时返回 failure。
 * Over-limit valid cards increment truncatedCount only (not rejected).
 */
export function parseAndValidateDrafts(
  rawContent: string,
  sourceText: string,
  /** 允许的卡型集合；模型返回集合外的类型一律计入 rejected。 */
  allowedTypes: AICardType[],
  /** 硬上限；<=0 表示不设硬上限（不截断，由模型自主决定数量）。 */
  maxCards: number
): AIDraftValidationResult {
  const jsonText = extractJsonText(rawContent)
  if (jsonText == null) {
    return {
      success: false,
      error: {
        code: "PARSE_ERROR",
        message: "无法从 AI 响应中解析 JSON（需要纯 JSON 或单个代码块）"
      }
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return {
      success: false,
      error: {
        code: "PARSE_ERROR",
        message: "AI 响应不是合法 JSON"
      }
    }
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      success: false,
      error: {
        code: "INVALID_FORMAT",
        message: "AI 响应应为包含 cards 数组的对象"
      }
    }
  }

  const cardsRaw = (parsed as { cards?: unknown }).cards
  if (!Array.isArray(cardsRaw)) {
    return {
      success: false,
      error: {
        code: "INVALID_FORMAT",
        message: "AI 响应缺少 cards 数组"
      }
    }
  }

  const rejected: RejectedDraftItem[] = []
  const accepted: AICardDraft[] = []
  const seenKeys = new Set<string>()

  cardsRaw.forEach((item, index) => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      rejected.push({ index, reason: "卡片项不是对象" })
      return
    }

    const raw = item as Record<string, unknown>
    const modelId = trimString(raw.id) || undefined
    // 混合卡型下 type 字段是必需的路由依据；缺失时退回唯一允许的卡型，
    // 允许多种卡型却不写 type 的项按无效处理，避免全部误判成 basic。
    const declared =
      raw.type === "cloze" || raw.type === "basic" || raw.type === "choice"
        ? (raw.type as AICardType)
        : null
    const typeHint =
      declared ?? (allowedTypes.length === 1 ? allowedTypes[0] : null)

    if (typeHint == null) {
      rejected.push({
        index,
        reason: "卡片缺少 type 字段，无法判定卡型",
        rawId: modelId
      })
      return
    }

    const result =
      typeHint === "cloze"
        ? validateClozeRaw(raw, sourceText, allowedTypes)
        : typeHint === "choice"
          ? validateChoiceRaw(raw, sourceText, allowedTypes)
          : validateBasicRaw(raw, sourceText, allowedTypes)

    if (!result.ok) {
      rejected.push({
        index,
        reason: result.reason,
        rawId: modelId
      })
      return
    }

    const key = draftDedupeKey({ ...result.draft, id: "_" } as AICardDraft)
    if (seenKeys.has(key)) {
      rejected.push({
        index,
        reason: "与已接受草稿重复",
        rawId: modelId
      })
      return
    }

    seenKeys.add(key)
    // Always allocate a deterministic local unique id
    const localId = allocateLocalDraftId(accepted.length)
    accepted.push({ ...result.draft, id: localId } as AICardDraft)
  })

  let truncatedCount = 0
  let cards = accepted
  if (maxCards > 0 && accepted.length > maxCards) {
    truncatedCount = accepted.length - maxCards
    cards = accepted.slice(0, maxCards)
    // Do NOT push truncated items into rejected
  }

  if (cards.length === 0) {
    const detail =
      rejected.length > 0
        ? rejected.map(r => `[#${r.index}] ${r.reason}`).join("；")
        : "模型未返回任何卡片"
    return {
      success: false,
      error: {
        code: "NO_VALID_CARDS",
        message: `没有有效的卡片草稿：${detail}`
      },
      rejected
    }
  }

  return {
    success: true,
    cards,
    rejected,
    truncatedCount
  }
}

/**
 * 保存 / 预览时校验用户编辑后的草稿。
 * User-owned content: structural rules + grounded informative sourceQuote.
 * Does not re-require answer⊆sourceQuote or text⊆source (model-output only).
 */
export function validateEditableDraft(
  draft: AICardDraft,
  sourceText: string
): string | null {
  if (draft.type === "basic") {
    if (!draft.question.trim()) return "问题不能为空"
    if (!draft.answer.trim()) return "答案不能为空"
    if (draft.question.length > FIELD_LIMITS.question) return "问题过长"
    if (draft.answer.length > FIELD_LIMITS.answer) return "答案过长"
  } else if (draft.type === "choice") {
    if (!draft.question.trim()) return "问题不能为空"
    if (draft.question.length > FIELD_LIMITS.question) return "问题过长"
    if (draft.options.length < CHOICE_OPTION_MIN) {
      return `至少需要 ${CHOICE_OPTION_MIN} 个选项`
    }
    if (draft.options.length > CHOICE_OPTION_MAX) {
      return `最多 ${CHOICE_OPTION_MAX} 个选项`
    }
    if (draft.options.some((o) => !o.text.trim())) return "选项不能为空"
    if (draft.options.some((o) => o.text.length > FIELD_LIMITS.optionText)) {
      return "选项过长"
    }
    const keys = draft.options.map((o) =>
      normalizeForContainment(o.text).toLowerCase()
    )
    if (new Set(keys).size !== keys.length) return "选项重复"
    const correct = draft.options.filter((o) => o.correct).length
    if (correct === 0) return "至少标记一个正确选项"
    if (correct === draft.options.length) return "不能所有选项都正确"
  } else {
    if (!draft.text.trim()) return "填空全文不能为空"
    if (!draft.clozeText.trim()) return "挖空文本不能为空"
    if (!draft.text.includes(draft.clozeText)) {
      return "挖空文本必须出现在全文中"
    }
    if (draft.text.length > FIELD_LIMITS.text) return "全文过长"
    if (draft.clozeText.length > FIELD_LIMITS.clozeText) return "挖空文本过长"
  }
  if (!draft.sourceQuote.trim()) return "缺少依据（sourceQuote）"
  if (!isSourceQuoteGrounded(sourceText, draft.sourceQuote)) {
    return "依据（sourceQuote）未出现在源文本中"
  }
  if (!isSourceQuoteInformative(sourceText, draft.sourceQuote)) {
    return `依据过短（至少 ${minSourceQuoteLength(sourceText)} 个有效字符）`
  }
  return null
}
