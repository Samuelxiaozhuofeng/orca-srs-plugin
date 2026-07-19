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

export const GENERATION_TIMEOUT_MS = 40_000

/** Connection test timeout (registered test command) */
export const CONNECTION_TEST_TIMEOUT_MS = 15_000

/** Max chars kept from plain-text HTTP error bodies */
export const HTTP_ERROR_BODY_MAX = 500

/** Hard cap for AI Chat Completions success JSON body (bytes). */
export const AI_MAX_RESPONSE_BYTES = 1 * 1024 * 1024
