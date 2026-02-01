/**
 * 渐进阅读调度算法
 *
 * 根据静态优先级映射到固定间隔天数，计算下一次到期时间。
 */

import type { Block } from "../orca.d.ts"
import { isCardTag } from "./tagUtils"

const DEFAULT_PRIORITY = 5
const PRIORITY_PROPERTY_NAME = "priority"
const PRIORITY_CHOICES = ["高优先级", "中优先级", "低优先级"] as const
const DEFAULT_PRIORITY_CHOICE: IRPriorityChoice = "中优先级"

export type IRPriorityChoice = typeof PRIORITY_CHOICES[number]

export type IRPriorityRank = 1 | 2 | 3

/**
 * 规范化优先级到 1-10
 */
export function normalizePriority(priority: number): number {
  if (!Number.isFinite(priority)) return DEFAULT_PRIORITY
  const rounded = Math.round(priority)
  if (rounded < 1) return 1
  if (rounded > 10) return 10
  return rounded
}

/**
 * 获取优先级对应的间隔天数
 *
 * 映射规则：
 * - 10 → 1 天
 * - 8-9 → 2 天
 * - 6-7 → 3 天
 * - 4-5 → 5 天
 * - 1-3 → 7 天
 */
export function getIntervalDays(priority: number): number {
  const normalized = normalizePriority(priority)

  if (normalized === 10) return 1
  if (normalized >= 8) return 2
  if (normalized >= 6) return 3
  if (normalized >= 4) return 5
  return 7
}

const normalizePriorityChoice = (value: unknown): IRPriorityChoice | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return PRIORITY_CHOICES.includes(trimmed as IRPriorityChoice)
    ? (trimmed as IRPriorityChoice)
    : null
}

const readNumericPriority = (block: Block): number | null => {
  const rawValue = block.properties?.find(prop => prop.name === "ir.priority")?.value
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue
  if (typeof rawValue === "string") {
    const parsed = Number(rawValue)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * 将数值优先级映射为“高/中/低”
 */
export function mapNumericPriorityToChoice(priority: number): IRPriorityChoice {
  const normalized = normalizePriority(priority)
  if (normalized >= 8) return "高优先级"
  if (normalized >= 4) return "中优先级"
  return "低优先级"
}

/**
 * 从块的 #card 标签中提取 priority 单选属性
 * 
 * 返回值仅限：高优先级/中优先级/低优先级
 */
export function getPriorityFromTag(block: Block): IRPriorityChoice | null {
  if (!block.refs || block.refs.length === 0) {
    return null
  }

  const cardRef = block.refs.find(ref =>
    ref.type === 2 && isCardTag(ref.alias)
  )
  if (!cardRef?.data || cardRef.data.length === 0) {
    return null
  }

  const priorityProp = cardRef.data.find(data => data.name === PRIORITY_PROPERTY_NAME)
  if (!priorityProp) {
    return null
  }

  const rawValue = priorityProp.value
  if (Array.isArray(rawValue)) {
    return normalizePriorityChoice(rawValue[0])
  }
  return normalizePriorityChoice(rawValue)
}

/**
 * 获取 Topic 的“有效优先级（高/中/低）”
 *
 * 规则：
 * - 如果 #card.priority 已被用户明确设置（非默认值），优先使用它
 * - 否则回退到 ir.priority 的数值映射（便于支持会话内切换）
 */
export function getPriorityChoiceFromTopic(
  block: Block,
  fallback: IRPriorityChoice = DEFAULT_PRIORITY_CHOICE
): IRPriorityChoice {
  const tagPriority = getPriorityFromTag(block)
  if (tagPriority && tagPriority !== fallback) {
    return tagPriority
  }

  const numericPriority = readNumericPriority(block)
  if (numericPriority !== null) {
    return mapNumericPriorityToChoice(numericPriority)
  }

  return tagPriority ?? fallback
}

const randomIntInclusive = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min

export function getPriorityRank(choice: IRPriorityChoice | null): IRPriorityRank {
  if (choice === "高优先级") return 3
  if (choice === "中优先级") return 2
  return 1
}

/**
 * 根据优先级区间随机生成间隔天数，避免同日堆积
 *
 * - 高优先级：1-2 天
 * - 中优先级：3-5 天
 * - 低优先级：7-10 天
 */
export function getRandomIntervalDays(priority: IRPriorityChoice | string): number {
  const normalized = normalizePriorityChoice(priority) ?? DEFAULT_PRIORITY_CHOICE

  if (normalized === "高优先级") return randomIntInclusive(1, 2)
  if (normalized === "中优先级") return randomIntInclusive(3, 5)
  return randomIntInclusive(7, 10)
}

export function getExtractBaseIntervalDays(priority: IRPriorityChoice | string): number {
  const normalized = normalizePriorityChoice(priority) ?? DEFAULT_PRIORITY_CHOICE
  if (normalized === "高优先级") return 1
  if (normalized === "中优先级") return 2
  return 3
}

export function getPostponeDays(priority: IRPriorityChoice | string): number {
  const normalized = normalizePriorityChoice(priority) ?? DEFAULT_PRIORITY_CHOICE
  if (normalized === "高优先级") return randomIntInclusive(1, 2)
  if (normalized === "中优先级") return randomIntInclusive(3, 5)
  return randomIntInclusive(7, 14)
}

/**
 * 计算下一次到期时间
 * @param priority - 优先级
 * @param baseDate - 基准时间（通常为当前时间或上次阅读时间）
 */
export function calculateNextDue(
  priority: number | IRPriorityChoice,
  baseDate: Date = new Date()
): Date {
  const intervalDays = typeof priority === "number"
    ? getIntervalDays(priority)
    : getRandomIntervalDays(priority)
  const next = new Date(baseDate.getTime())
  next.setDate(next.getDate() + intervalDays)
  return next
}
