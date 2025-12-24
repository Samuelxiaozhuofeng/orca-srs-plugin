import type { State } from "ts-fsrs"
import type { DbId, ContentFragment } from "../orca.d.ts"

export type Grade = "again" | "hard" | "good" | "easy"

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
  clozeNumber?: number  // 填空编号（仅 cloze 卡片使用）
  directionType?: "forward" | "backward"  // 方向类型（仅 direction 卡片使用）
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
  overdueCount: number      // 已到期数
  todayCount: number        // 今天到期数
  futureCount: number       // 未来到期数
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
// 统计功能相关类型 (Anki Statistics)
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
 * 时间范围类型
 */
export type TimeRange = "1month" | "3months" | "1year" | "all"

/**
 * 获取时间范围的起始日期
 */
export function getTimeRangeStartDate(range: TimeRange): Date {
  const now = new Date()
  switch (range) {
    case "1month":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    case "3months":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
    case "1year":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    case "all":
      return new Date(0)
  }
}

/**
 * 复习记录条目
 * 记录单次复习的详细信息
 */
export interface ReviewLogEntry {
  id: string                    // 唯一标识 (timestamp + cardId)
  cardId: DbId                  // 卡片 ID
  deckName: string              // 牌组名称
  timestamp: number             // 复习时间戳 (毫秒)
  grade: Grade                  // 评分 (again/hard/good/easy)
  duration: number              // 复习耗时 (毫秒)
  previousInterval: number      // 复习前的间隔天数
  newInterval: number           // 复习后的间隔天数
  previousState: CardState      // 复习前的卡片状态
  newState: CardState           // 复习后的卡片状态
}

/**
 * 今日统计
 */
export interface TodayStatistics {
  reviewedCount: number         // 已复习卡片数
  newLearnedCount: number       // 新学卡片数
  relearnedCount: number        // 重学卡片数 (按了 Again)
  totalTime: number             // 总复习时间 (毫秒)
  gradeDistribution: {          // 评分分布
    again: number
    hard: number
    good: number
    easy: number
  }
}

/**
 * 未来预测 - 单日数据
 */
export interface ForecastDay {
  date: Date                    // 日期
  reviewDue: number             // 复习卡到期数
  newAvailable: number          // 可学新卡数
  cumulative: number            // 累计到期数
}

/**
 * 未来预测
 */
export interface FutureForecast {
  days: ForecastDay[]           // 每天的预测数据
}

/**
 * 复习历史 - 单日数据
 */
export interface HistoryDay {
  date: Date                    // 日期
  again: number                 // Again 次数
  hard: number                  // Hard 次数
  good: number                  // Good 次数
  easy: number                  // Easy 次数
  total: number                 // 总次数
}

/**
 * 复习历史
 */
export interface ReviewHistory {
  days: HistoryDay[]            // 每天的历史数据
  totalReviews: number          // 总复习次数
  averagePerDay: number         // 日均复习数
}

/**
 * 卡片状态分布
 */
export interface CardStateDistribution {
  new: number                   // 新卡数量
  learning: number              // 学习中数量
  review: number                // 复习中数量 (已掌握)
  suspended: number             // 暂停数量
  total: number                 // 总数量
}

/**
 * 间隔分布 - 分组数据
 */
export interface IntervalBucket {
  label: string                 // 分组标签 (如 "1-3天")
  minDays: number               // 最小天数
  maxDays: number               // 最大天数
  count: number                 // 卡片数量
}

/**
 * 间隔分布
 */
export interface IntervalDistribution {
  buckets: IntervalBucket[]     // 间隔分组
  averageInterval: number       // 平均间隔
  maxInterval: number           // 最大间隔
}

/**
 * 答题按钮统计
 */
export interface AnswerButtonStats {
  again: number
  hard: number
  good: number
  easy: number
  total: number
  correctRate: number           // 正确率 (good + easy) / total
}

/**
 * 难度分布 - 分组数据
 */
export interface DifficultyBucket {
  label: string                 // 分组标签 (如 "1-2")
  minValue: number              // 最小值
  maxValue: number              // 最大值
  count: number                 // 卡片数量
}

/**
 * 难度分布
 */
export interface DifficultyDistribution {
  buckets: DifficultyBucket[]   // 难度分组
  averageDifficulty: number     // 平均难度
  minDifficulty: number         // 最小难度
  maxDifficulty: number         // 最大难度
}

/**
 * 复习时间统计
 */
export interface ReviewTimeStats {
  dailyTime: { date: Date; time: number }[]  // 每日复习时间
  averagePerDay: number         // 平均每天复习时间 (毫秒)
  totalTime: number             // 总复习时间 (毫秒)
}

/**
 * 复习记录存储结构（按月分片）
 */
export interface ReviewLogStorage {
  version: number               // 数据版本号
  logs: ReviewLogEntry[]        // 该月的复习记录
}
