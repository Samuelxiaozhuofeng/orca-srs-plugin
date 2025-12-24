/**
 * 困难卡片管理器
 * 
 * 自动识别和收集经常遗忘的困难卡片，帮助用户集中攻克
 * 
 * 困难卡片判定标准：
 * 1. 最近 N 次复习中 Again 次数 >= 阈值
 * 2. 或 lapses（遗忘次数）>= 阈值
 * 3. 或难度值 >= 阈值
 */

import type { ReviewCard, ReviewLogEntry } from "./types"
import { getReviewLogs } from "./reviewLogStorage"
import { collectReviewCards } from "./cardCollector"

// ============================================
// 配置常量
// ============================================

/** 最近复习次数窗口（用于计算 Again 比例） */
const RECENT_REVIEW_WINDOW = 10

/** Again 次数阈值（最近 N 次中 Again >= 此值视为困难） */
const AGAIN_COUNT_THRESHOLD = 3

/** 遗忘次数阈值（lapses >= 此值视为困难） */
const LAPSES_THRESHOLD = 3

/** 难度值阈值（difficulty >= 此值视为困难） */
const DIFFICULTY_THRESHOLD = 7

/** 复习记录查询天数（查询最近多少天的记录） */
const REVIEW_LOG_DAYS = 30

// ============================================
// 类型定义
// ============================================

/**
 * 困难卡片信息
 */
export interface DifficultCardInfo {
  card: ReviewCard
  reason: DifficultReason
  recentAgainCount: number    // 最近 Again 次数
  totalLapses: number         // 总遗忘次数
  difficulty: number          // 难度值
  lastReviewDate: Date | null // 最后复习时间
}

/**
 * 困难原因
 */
export type DifficultReason = 
  | "high_again_rate"    // Again 比例高
  | "high_lapses"        // 遗忘次数多
  | "high_difficulty"    // 难度值高
  | "multiple"           // 多重原因

/**
 * 困难卡片统计
 */
export interface DifficultCardsStats {
  totalCount: number           // 困难卡片总数
  byReason: {
    highAgainRate: number      // 高 Again 比例
    highLapses: number         // 高遗忘次数
    highDifficulty: number     // 高难度值
  }
  byDeck: Map<string, number>  // 按牌组统计
}

// ============================================
// 核心函数
// ============================================

/**
 * 生成卡片唯一键
 * 用于匹配复习记录和卡片
 */
function getCardKey(card: ReviewCard): string {
  if (card.clozeNumber) {
    return `${card.id}_cloze_${card.clozeNumber}`
  }
  if (card.directionType) {
    return `${card.id}_direction_${card.directionType}`
  }
  return `${card.id}_basic`
}

/**
 * 从复习记录中提取卡片键
 */
function getCardKeyFromLog(log: ReviewLogEntry): string {
  // 复习记录的 cardId 格式可能是 "blockId" 或 "blockId_cloze_N" 或 "blockId_direction_type"
  return log.cardId.toString()
}

/**
 * 分析卡片的复习记录，计算最近 Again 次数
 */
function analyzeRecentReviews(
  cardKey: string,
  logs: ReviewLogEntry[]
): { recentAgainCount: number; lastReviewDate: Date | null } {
  // 筛选该卡片的复习记录
  const cardLogs = logs.filter(log => {
    const logKey = getCardKeyFromLog(log)
    // 简单匹配：检查 cardId 是否包含在 cardKey 中
    return cardKey.includes(log.cardId.toString())
  })

  if (cardLogs.length === 0) {
    return { recentAgainCount: 0, lastReviewDate: null }
  }

  // 按时间排序（最新的在前）
  cardLogs.sort((a, b) => b.timestamp - a.timestamp)

  // 取最近 N 次复习
  const recentLogs = cardLogs.slice(0, RECENT_REVIEW_WINDOW)
  
  // 统计 Again 次数
  const recentAgainCount = recentLogs.filter(log => log.grade === "again").length

  // 最后复习时间
  const lastReviewDate = new Date(cardLogs[0].timestamp)

  return { recentAgainCount, lastReviewDate }
}

/**
 * 判断卡片是否为困难卡片
 */
function isDifficultCard(
  card: ReviewCard,
  recentAgainCount: number
): { isDifficult: boolean; reason: DifficultReason } {
  const reasons: DifficultReason[] = []

  // 检查最近 Again 比例
  if (recentAgainCount >= AGAIN_COUNT_THRESHOLD) {
    reasons.push("high_again_rate")
  }

  // 检查遗忘次数
  if (card.srs.lapses >= LAPSES_THRESHOLD) {
    reasons.push("high_lapses")
  }

  // 检查难度值
  if (card.srs.difficulty >= DIFFICULTY_THRESHOLD) {
    reasons.push("high_difficulty")
  }

  if (reasons.length === 0) {
    return { isDifficult: false, reason: "high_again_rate" }
  }

  const reason: DifficultReason = reasons.length > 1 ? "multiple" : reasons[0]
  return { isDifficult: true, reason }
}

/**
 * 获取困难卡片列表
 * 
 * @param pluginName - 插件名称
 * @param deckName - 可选的牌组名称过滤
 * @returns 困难卡片信息列表
 */
export async function getDifficultCards(
  pluginName: string,
  deckName?: string
): Promise<DifficultCardInfo[]> {
  // 收集所有卡片
  const allCards = await collectReviewCards(pluginName)
  
  // 按牌组过滤
  const cards = deckName 
    ? allCards.filter(card => card.deck === deckName)
    : allCards

  // 获取最近的复习记录
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - REVIEW_LOG_DAYS)
  
  const logs = await getReviewLogs(pluginName, startDate, endDate)

  // 分析每张卡片
  const difficultCards: DifficultCardInfo[] = []

  for (const card of cards) {
    // 新卡不算困难卡片
    if (card.isNew) continue

    const cardKey = getCardKey(card)
    const { recentAgainCount, lastReviewDate } = analyzeRecentReviews(cardKey, logs)
    const { isDifficult, reason } = isDifficultCard(card, recentAgainCount)

    if (isDifficult) {
      difficultCards.push({
        card,
        reason,
        recentAgainCount,
        totalLapses: card.srs.lapses,
        difficulty: card.srs.difficulty,
        lastReviewDate
      })
    }
  }

  // 按困难程度排序（多重原因 > 高 Again > 高遗忘 > 高难度）
  difficultCards.sort((a, b) => {
    // 先按原因排序
    const reasonOrder: Record<DifficultReason, number> = {
      "multiple": 0,
      "high_again_rate": 1,
      "high_lapses": 2,
      "high_difficulty": 3
    }
    const reasonDiff = reasonOrder[a.reason] - reasonOrder[b.reason]
    if (reasonDiff !== 0) return reasonDiff

    // 同原因按 lapses 排序
    return b.totalLapses - a.totalLapses
  })

  return difficultCards
}

/**
 * 获取困难卡片统计
 * 
 * @param pluginName - 插件名称
 * @returns 困难卡片统计信息
 */
export async function getDifficultCardsStats(
  pluginName: string
): Promise<DifficultCardsStats> {
  const difficultCards = await getDifficultCards(pluginName)

  const stats: DifficultCardsStats = {
    totalCount: difficultCards.length,
    byReason: {
      highAgainRate: 0,
      highLapses: 0,
      highDifficulty: 0
    },
    byDeck: new Map()
  }

  for (const info of difficultCards) {
    // 按原因统计
    switch (info.reason) {
      case "high_again_rate":
        stats.byReason.highAgainRate++
        break
      case "high_lapses":
        stats.byReason.highLapses++
        break
      case "high_difficulty":
        stats.byReason.highDifficulty++
        break
      case "multiple":
        // 多重原因同时计入各类
        if (info.recentAgainCount >= AGAIN_COUNT_THRESHOLD) {
          stats.byReason.highAgainRate++
        }
        if (info.totalLapses >= LAPSES_THRESHOLD) {
          stats.byReason.highLapses++
        }
        if (info.difficulty >= DIFFICULTY_THRESHOLD) {
          stats.byReason.highDifficulty++
        }
        break
    }

    // 按牌组统计
    const deckCount = stats.byDeck.get(info.card.deck) || 0
    stats.byDeck.set(info.card.deck, deckCount + 1)
  }

  return stats
}

/**
 * 获取困难卡片用于复习
 * 返回 ReviewCard 数组，可直接用于复习会话
 * 
 * @param pluginName - 插件名称
 * @param deckName - 可选的牌组名称过滤
 * @param limit - 可选的数量限制
 * @returns ReviewCard 数组
 */
export async function getDifficultCardsForReview(
  pluginName: string,
  deckName?: string,
  limit?: number
): Promise<ReviewCard[]> {
  const difficultCards = await getDifficultCards(pluginName, deckName)
  
  let cards = difficultCards.map(info => info.card)
  
  if (limit && limit > 0) {
    cards = cards.slice(0, limit)
  }

  return cards
}

/**
 * 获取困难原因的显示文本
 */
export function getDifficultReasonText(reason: DifficultReason): string {
  switch (reason) {
    case "high_again_rate":
      return "频繁遗忘"
    case "high_lapses":
      return "遗忘次数多"
    case "high_difficulty":
      return "难度较高"
    case "multiple":
      return "多重困难"
  }
}

/**
 * 获取困难原因的颜色
 */
export function getDifficultReasonColor(reason: DifficultReason): string {
  switch (reason) {
    case "high_again_rate":
      return "var(--orca-color-danger-6)"
    case "high_lapses":
      return "var(--orca-color-warning-6)"
    case "high_difficulty":
      return "var(--orca-color-primary-6)"
    case "multiple":
      return "var(--orca-color-danger-5)"
  }
}
