/**
 * AI 闪卡草稿与生成结果类型（Plan B）
 */

export type AICardType = "basic" | "cloze" | "choice"

/** 允许 AI 生成的卡型集合（UI 多选）。 */
export const AI_CARD_TYPES: AICardType[] = ["basic", "cloze", "choice"]

export const AI_CARD_TYPE_LABELS: Record<AICardType, string> = {
  basic: "问答卡",
  cloze: "填空卡",
  choice: "选择题"
}

/** @deprecated 由 AIDetailLevel 取代；保留供旧调用点编译。 */
export type MaxCardsOption = 1 | 3 | 5

/**
 * 详细程度。
 *
 * 取代此前的固定张数（1/3/5）。旧设计里「最多 3 张」与 system prompt 的
 * "Quality over quantity ... return fewer cards or an empty array" 直接打架：
 * 给了数字，模型就把它当成产量目标去凑；给了质量优先，数字又成了摆设。
 * 语义档位把「要多深」交给用户，把「几张合适」交还给模型。
 */
export const AI_DETAIL_LEVELS = ["summary", "key", "exhaustive"] as const
export type AIDetailLevel = (typeof AI_DETAIL_LEVELS)[number]
export const DEFAULT_AI_DETAIL_LEVEL: AIDetailLevel = "key"

export const AI_DETAIL_LEVEL_LABELS: Record<AIDetailLevel, string> = {
  summary: "高层概要",
  key: "重要观点",
  exhaustive: "详尽覆盖"
}

export const AI_DETAIL_LEVEL_HINTS: Record<AIDetailLevel, string> = {
  summary: "只取最核心的一两点",
  key: "覆盖必须记住的要点（推荐）",
  exhaustive: "连次要细节一并覆盖"
}

/**
 * 各档的硬闸门。
 * 只作为「不得超过」的上限传给模型与本地截断，**不是产量目标**。
 */
export const AI_DETAIL_LEVEL_CARD_CAP: Record<AIDetailLevel, number> = {
  summary: 2,
  key: 5,
  exhaustive: 12
}

/**
 * `cardCap = 0`（数量由模型自主决定）时仍然生效的兜底硬上限。
 * 防止预览块下挂几十张卡；不写进提示词，只在校验阶段截断。
 */
export const AUTO_CARD_CAP_FALLBACK = 20

/**
 * 卡片语言。
 *
 * 注意：只影响**题干措辞**。答案 / sourceQuote / cloze 正文必须是源文本的
 * 连续摘录（接地校验的前提），翻译它们会让整批卡校验失败——因此明确不翻译。
 */
export const AI_CARD_LANGUAGES = ["auto", "zh", "en", "ja"] as const
export type AICardLanguage = (typeof AI_CARD_LANGUAGES)[number]
export const DEFAULT_AI_CARD_LANGUAGE: AICardLanguage = "auto"

export const AI_CARD_LANGUAGE_LABELS: Record<AICardLanguage, string> = {
  auto: "跟随源文本",
  zh: "中文",
  en: "English",
  ja: "日本語"
}

/** 送进 prompt 的语言名（英文，模型侧更稳）。 */
export const AI_CARD_LANGUAGE_PROMPT_NAMES: Record<
  Exclude<AICardLanguage, "auto">,
  string
> = {
  zh: "Chinese",
  en: "English",
  ja: "Japanese"
}

/** 自定义指令长度上限。 */
export const AI_CUSTOM_INSTRUCTION_MAX = 500

export interface BasicCardDraft {
  id: string
  type: "basic"
  question: string
  answer: string
  sourceQuote: string
}

/** 选项：干扰项允许模型合成，正确项必须有源文本依据。 */
export interface ChoiceOptionDraft {
  text: string
  correct: boolean
}

export interface ChoiceCardDraft {
  id: string
  type: "choice"
  question: string
  options: ChoiceOptionDraft[]
  sourceQuote: string
}

export interface ClozeCardDraft {
  id: string
  type: "cloze"
  text: string
  clozeText: string
  sourceQuote: string
}

export type AICardDraft = BasicCardDraft | ClozeCardDraft | ChoiceCardDraft

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
  /**
   * 允许生成的卡型集合。模型按内容特点在其中自行分配：
   * 定义类适合 basic、术语密集段适合 cloze、有明确对错的适合 choice。
   */
  cardTypes: AICardType[]
  /** 详细程度；决定深度与硬上限。 */
  detailLevel?: AIDetailLevel
  /**
   * 显式覆盖单次生成的卡片硬上限。缺省（undefined）用 detailLevel 档位；
   * 传 0 = 提示词不写数字（由模型根据内容自主决定数量），校验阶段仍用
   * AUTO_CARD_CAP_FALLBACK 兜底截断。
   */
  cardCap?: number
  /** 用户自定义追加指令（在 SOURCE 分隔符之外，仍属受信指令）。 */
  customInstruction?: string
  /** 题干语言；答案与摘录始终保持源文本原文。 */
  cardLanguage?: AICardLanguage
  /**
   * 已有草稿的去重线索（题干 / cloze 目标）。
   * 「再生成一批」时传入，避免第二批原样重复第一批。
   */
  excludeSummaries?: string[]
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
  sourceQuote: 500,
  optionText: 300
} as const

/** 选择题选项数量区间。少于 3 项没有测验价值，多于 6 项在复习界面不可读。 */
export const CHOICE_OPTION_MIN = 3
export const CHOICE_OPTION_MAX = 6

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
