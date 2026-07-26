/**
 * AI 闪卡草稿与生成结果类型（Plan B）
 */

export type AICardType = "basic" | "cloze"

export type MaxCardsOption = 1 | 3 | 5

export interface BasicCardDraft {
  id: string
  type: "basic"
  question: string
  answer: string
  sourceQuote: string
}

export interface ClozeCardDraft {
  id: string
  type: "cloze"
  text: string
  clozeText: string
  sourceQuote: string
}

export type AICardDraft = BasicCardDraft | ClozeCardDraft

export interface RejectedDraftItem {
  index: number
  reason: string
  /** Model-provided id if any (not used as UI identity) */
  rawId?: string
}

export interface AIServiceError {
  code: string
  message: string
}

/** 解析 + 校验后的成功结果；允许部分卡被过滤 */
export interface AIDraftValidationSuccess {
  success: true
  cards: AICardDraft[]
  /** Invalid / duplicate only — not over-limit truncations */
  rejected: RejectedDraftItem[]
  /** 因超过 maxCards 而未纳入的合法卡数量（不计入 rejected） */
  truncatedCount: number
}

export interface AIDraftValidationFailure {
  success: false
  error: AIServiceError
  rejected?: RejectedDraftItem[]
}

export type AIDraftValidationResult =
  | AIDraftValidationSuccess
  | AIDraftValidationFailure

export interface GenerateDraftsOptions {
  pluginName: string
  sourceText: string
  cardType: AICardType
  maxCards: MaxCardsOption
  signal?: AbortSignal
}

export type GenerateDraftsResult =
  | AIDraftValidationSuccess
  | { success: false; error: AIServiceError }

export const FIELD_LIMITS = {
  question: 500,
  answer: 1000,
  text: 2000,
  clozeText: 200,
  sourceQuote: 500
} as const

/** Informative sourceQuote minimum: min(8, normalized source length) */
export const SOURCE_QUOTE_MIN_TARGET = 8

/** 未指定路径时的兜底超时。 */
export const GENERATION_TIMEOUT_MS = 40_000

/**
 * 按路径分级的超时。
 *
 * 此前所有路径共用 40s：推理模型（reasoning_effort: high）+ 长文摘要很容易撞上，
 * 而查词这种要「立刻出结果」的场景干等 40s 又毫无意义。
 */
/** 制卡：一次要产出多张结构化卡，允许更久。 */
export const CARD_GENERATION_TIMEOUT_MS = 60_000
/** 快捷交互：查词/翻译，用户在等，宁可早点报错。 */
export const QUICK_INTERACT_TIMEOUT_MS = 30_000
/** 块解释：介于两者之间。 */
export const BLOCK_EXPLAIN_TIMEOUT_MS = 40_000
/** 网页总结：输入最长，给足时间。 */
export const WEB_SUMMARY_TIMEOUT_MS = 90_000

/**
 * 制卡请求的源文本字符上限。
 *
 * 块解释（BLOCK_EXPLAIN_SOURCE_MAX）与快捷交互（QUICK_SELECTION_MAX）一直有上限，
 * 唯独制卡把整块正文直接塞进 prompt：超长块会撞上游 context limit，
 * 用户只看到一个裸的 HTTP 400 而不是可理解的提示。
 */
export const AI_CARD_SOURCE_MAX = 6_000

/** Connection test timeout (registered test command) */
export const CONNECTION_TEST_TIMEOUT_MS = 15_000

/** Max chars kept from plain-text HTTP error bodies */
export const HTTP_ERROR_BODY_MAX = 500

/** Hard cap for AI Chat Completions success JSON body (bytes). */
export const AI_MAX_RESPONSE_BYTES = 1 * 1024 * 1024
