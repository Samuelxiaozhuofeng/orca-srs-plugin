/**
 * 卡片筛选工具函数
 * 
 * 提供卡片列表的筛选功能，支持按到期状态筛选卡片
 * 
 * 需求: 4.2, 4.3
 */

import type { ReviewCard } from "./types"

/**
 * 筛选类型
 * - all: 全部卡片
 * - overdue: 已到期卡片（due < 今天零点，不含新卡）
 * - today: 今天到期卡片（今天零点 <= due < 明天零点，不含新卡）
 * - future: 未来到期卡片（due >= 明天零点，不含新卡）
 * - new: 新卡
 */
export type FilterType = "all" | "overdue" | "today" | "future" | "new"

/**
 * 获取今天零点的时间
 * @returns 今天零点的 Date 对象
 */
function getTodayMidnight(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * 获取明天零点的时间
 * @returns 明天零点的 Date 对象
 */
function getTomorrowMidnight(): Date {
  const today = getTodayMidnight()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}

/**
 * 筛选卡片列表
 * 
 * 根据筛选条件过滤卡片列表，返回符合条件的卡片
 * 
 * @param cards - ReviewCard 数组
 * @param filter - 筛选类型
 * @returns 筛选后的 ReviewCard 数组
 * 
 * 筛选逻辑：
 * - all: 返回所有卡片
 * - overdue: 返回已到期的非新卡（due < 今天零点）
 * - today: 返回今天到期的非新卡（今天零点 <= due < 明天零点）
 * - future: 返回未来到期的非新卡（due >= 明天零点）
 * - new: 返回所有新卡（isNew === true）
 * 
 * 需求: 4.2, 4.3
 */
export function filterCards(cards: ReviewCard[], filter: FilterType): ReviewCard[] {
  if (filter === "all") {
    return cards
  }

  if (filter === "new") {
    return cards.filter(card => card.isNew)
  }

  // 对于 overdue/today/future，只考虑非新卡
  const today = getTodayMidnight()
  const tomorrow = getTomorrowMidnight()

  switch (filter) {
    case "overdue":
      return cards.filter(card => {
        if (card.isNew) return false
        return card.srs.due < today
      })

    case "today":
      return cards.filter(card => {
        if (card.isNew) return false
        const due = card.srs.due
        return due >= today && due < tomorrow
      })

    case "future":
      return cards.filter(card => {
        if (card.isNew) return false
        return card.srs.due >= tomorrow
      })

    default:
      return cards
  }
}

/**
 * 检查卡片是否匹配筛选条件
 * 
 * 用于验证单张卡片是否满足指定的筛选条件
 * 
 * @param card - ReviewCard 对象
 * @param filter - 筛选类型
 * @returns 是否匹配筛选条件
 */
export function matchesFilter(card: ReviewCard, filter: FilterType): boolean {
  if (filter === "all") {
    return true
  }

  if (filter === "new") {
    return card.isNew
  }

  // 对于 overdue/today/future，新卡不匹配
  if (card.isNew) {
    return false
  }

  const today = getTodayMidnight()
  const tomorrow = getTomorrowMidnight()
  const due = card.srs.due

  switch (filter) {
    case "overdue":
      return due < today

    case "today":
      return due >= today && due < tomorrow

    case "future":
      return due >= tomorrow

    default:
      return false
  }
}
