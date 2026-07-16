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
  type ClozeCardDraft,
  type MaxCardsOption,
  type RejectedDraftItem,
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
 * Minimum informative sourceQuote length for a given source.
 * Documented rule: min(8, normalized source length).
 */
export function minSourceQuoteLength(sourceText: string): number {
  const n = normalizeForContainment(sourceText).length
  if (n <= 0) return 0
  return Math.min(SOURCE_QUOTE_MIN_TARGET, n)
}

/**
 * sourceQuote 是否 grounded 于 source（规范化空白后包含）
 */
export function isSourceQuoteGrounded(sourceText: string, sourceQuote: string): boolean {
  const source = normalizeForContainment(sourceText)
  const quote = normalizeForContainment(sourceQuote)
  if (!source || !quote) return false
  return source.includes(quote)
}

/**
 * Whether `excerpt` is a contiguous excerpt of `source` (normalized whitespace).
 */
export function isContiguousExcerpt(sourceText: string, excerpt: string): boolean {
  const source = normalizeForContainment(sourceText)
  const part = normalizeForContainment(excerpt)
  if (!source || !part) return false
  return source.includes(part)
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
  return `cloze|${normalizeForContainment(draft.text).toLowerCase()}|${normalizeForContainment(draft.clozeText).toLowerCase()}`
}

/**
 * Model-output Basic validation (strict grounding).
 * Local id is assigned by the caller after acceptance.
 */
function validateBasicRaw(
  raw: Record<string, unknown>,
  sourceText: string,
  expectedType: AICardType
): { ok: true; draft: Omit<BasicCardDraft, "id"> } | { ok: false; reason: string } {
  if (expectedType !== "basic") {
    return { ok: false, reason: `期望 cloze，收到 basic` }
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
  expectedType: AICardType
): { ok: true; draft: Omit<ClozeCardDraft, "id"> } | { ok: false; reason: string } {
  if (expectedType !== "cloze") {
    return { ok: false, reason: `期望 basic，收到 cloze` }
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
 * 解析并校验模型返回的卡片草稿列表。
 *
 * 部分合法卡可保留；零合法卡时返回 failure。
 * Over-limit valid cards increment truncatedCount only (not rejected).
 */
export function parseAndValidateDrafts(
  rawContent: string,
  sourceText: string,
  expectedType: AICardType,
  maxCards: MaxCardsOption
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
    const typeHint =
      raw.type === "cloze" || raw.type === "basic"
        ? (raw.type as AICardType)
        : expectedType

    const result =
      typeHint === "cloze"
        ? validateClozeRaw(raw, sourceText, expectedType)
        : validateBasicRaw(raw, sourceText, expectedType)

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
  if (accepted.length > maxCards) {
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
