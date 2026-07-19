import type { State } from "ts-fsrs"
import type { DbId, ContentFragment } from "../orca.d.ts"

export type Grade = "again" | "hard" | "good" | "easy"

// ============================================
// 卡片类型
// ============================================

/**
 * 卡片类型
 * - basic: 基础卡片
 * - cloze: 填空卡片
 * - direction: 方向卡片
 * - list: 列表卡片
 * - excerpt: 摘录卡片
 * - choice: 选择题卡片
 * - extracts: 渐进阅读摘录卡片
 * - topic: 渐进阅读主题卡片
 */
export type CardType = "basic" | "cloze" | "direction" | "list" | "excerpt" | "choice" | "extracts" | "topic"

// ============================================
// 选择题卡片相关类型 (Choice Card)
// ============================================

/**
 * 选择题模式
 * - single: 单选题（只有一个正确选项）
 * - multiple: 多选题（有多个正确选项）
 * - undefined: 未定义（没有标记正确选项）
 */
export type ChoiceMode = "single" | "multiple" | "undefined"

/**
 * 选择项信息
 */
export interface ChoiceOption {
  blockId: DbId              // 选项块 ID
  text: string               // 选项文本
  content: ContentFragment[] // 完整内容（用于块渲染）
  isCorrect: boolean         // 是否为正确选项
  isAnchor: boolean          // 是否为锚定选项（"以上"等）
}

/**
 * 选择题卡片扩展数据
 */
export interface ChoiceCardData {
  options: ChoiceOption[]    // 选项列表
  mode: ChoiceMode           // 单选/多选模式
  shuffledOrder: number[]    // 乱序后的索引顺序
}

/**
 * 选择统计记录条目
 */
export interface ChoiceStatisticsEntry {
  timestamp: number          // 选择时间戳
  selectedBlockIds: DbId[]   // 选中的选项 Block IDs
  correctBlockIds: DbId[]    // 正确选项 Block IDs
  isCorrect: boolean         // 是否全部正确
}

/**
 * 选择统计存储结构
 */
export interface ChoiceStatisticsStorage {
  version: number            // 数据版本号
  entries: ChoiceStatisticsEntry[]  // 统计记录列表
}

export type SrsState = {
  stability: number       // 记忆稳定度，越大代表遗忘速度越慢
  difficulty: number      // 记忆难度，1-10 越大越难
  interval: number        // 间隔天数（FSRS 计算出的 scheduled_days）
  due: Date               // 下次应复习的具体时间
  lastReviewed: Date | null // 上次复习时间，null 表示新卡未复习
  reps: number            // 已复习次数
  lapses: number          // 遗忘次数（Again 会增加）
  state?: State           // FSRS 内部状态（New/Learning/Review/Relearning）
  resets?: number         // 重置次数
}

export type ReviewCard = {
  id: DbId
  front: string
  back: string
  srs: SrsState
  isNew: boolean
  deck: string  // 修改：从 deck?: string 改为必填
  /**
   * 卡片类型。真实收集路径（cardCollector / blockCardCollector）必须显式填入，
   * 以便 Basic 与 Choice 等可区分；测试 fixture 可省略，由 cardIdentity 兜底推断。
   */
  cardType?: CardType
  clozeNumber?: number  // 填空编号（仅 cloze 卡片使用）
  directionType?: "forward" | "backward"  // 方向类型（仅 direction 卡片使用）
  // 列表卡相关字段（仅 list 卡片使用）
  listItemId?: DbId  // 当前复习的条目子块 ID（用于独立 SRS / 日志）
  listItemIndex?: number  // 条目序号（从 1 开始，基于当前 children 顺序）
  listItemIds?: DbId[]  // 列表条目子块 ID 列表（基于当前 children 顺序）
  isAuxiliaryPreview?: boolean  // 是否为辅助预览（不计入统计、不更新 SRS）
  content?: ContentFragment[]  // 块内容（仅 cloze 卡片使用，用于渲染填空）
  tags?: TagInfo[]  // 额外标签（排除 #card）
}

// 标签信息
export type TagInfo = {
  name: string     // 标签名称
  blockId: DbId    // 标签块 ID（用于跳转）
}

// Deck 统计信息
export type DeckInfo = {
  name: string              // deck 名称
  totalCount: number        // 总卡片数
  newCount: number          // 新卡数
  overdueCount: number      // 积压：已到期且到期日早于今天
  todayCount: number        // 今日到期：已到期且到期日落在今天
  futureCount: number       // 尚未到点（含今天稍后与更远未来）
  note?: string             // 卡组备注
}

// 全局统计
export type DeckStats = {
  decks: DeckInfo[]
  totalCards: number
  totalNew: number
  totalOverdue: number
}

export type TodayStats = {
  pendingCount: number
  todayCount: number
  newCount: number
  totalCount: number
}

// ============================================
// 复习日志相关类型
// ============================================

/**
 * 卡片状态类型
 * - new: 新卡
 * - learning: 学习中
 * - review: 复习中（已掌握）
 * - relearning: 重学中
 */
export type CardState = "new" | "learning" | "review" | "relearning"

/**
 * 复习记录条目
 * 记录单次复习的详细信息
 *
 * 身份字段（FC-05 / 存储 v2）：
 * - cardId：兼容旧语义（List 用 listItemId，其余用父 blockId）；新逻辑不得用它猜变体
 * - blockId / cardType / cardKey / 变体字段：新日志必写
 * - legacy：读取 v1 或缺字段日志时归一化为 true
 */
export interface ReviewLogEntry {
  id: string                    // 唯一标识 (timestamp + cardKey 或兼容 cardId)
  cardId: DbId                  // 兼容卡片 ID（见上）
  /** 父卡块 ID；新日志必写 */
  blockId?: DbId
  /** 卡片类型；新日志必写 */
  cardType?: CardType
  /** 稳定身份键，由 cardIdentity 统一生成；新日志必写 */
  cardKey?: string
  clozeNumber?: number
  directionType?: "forward" | "backward"
  listItemId?: DbId
  /** 旧版或缺少结构化身份的日志 */
  legacy?: boolean
  deckName: string              // 牌组名称
  timestamp: number             // 复习时间戳 (毫秒)
  grade: Grade                  // 评分 (again/hard/good/easy)
  /**
   * 有效复习时长（毫秒）。
   * FC-10：统一为 0..60000；新日志写入有效时长；旧日志读取时经 calculateEffectiveDuration 再归一化。
   */
  duration: number
  /**
   * 可选：安全非负原始墙钟耗时（毫秒，无 60s 截断）。
   * 异常（负/NaN/Infinity）写入 0；时长累加使用 duration，不使用本字段。
   */
  rawDuration?: number
  previousInterval: number      // 复习前的间隔天数
  newInterval: number           // 复习后的间隔天数
  previousState: CardState      // 复习前的卡片状态
  newState: CardState           // 复习后的卡片状态
}

/**
 * 复习记录存储结构（按月分片）
 */
export interface ReviewLogStorage {
  version: number               // 数据版本号
  logs: ReviewLogEntry[]        // 该月的复习记录
}
