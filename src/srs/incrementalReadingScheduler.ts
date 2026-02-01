/**
 * 渐进阅读调度算法
 *
 * 基于数值优先级（0-100）计算间隔、推后与下一次到期时间。
 *
 * 设计原则：
 * - `ir.priority` 是唯一真相；不从 #card 的 ref.data 读取优先级
 * - 允许会话中动态调整优先级
 * - 为避免同日堆积，在 due 上加入少量随机抖动
 */

export const DEFAULT_IR_PRIORITY = 50

export type IRCardType = "topic" | "extracts"

/**
 * 规范化优先级到 0-100（整数）
 */
export function normalizePriority(priority: number): number {
  if (!Number.isFinite(priority)) return DEFAULT_IR_PRIORITY
  const rounded = Math.round(priority)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

const DAY_MS = 24 * 60 * 60 * 1000

const randomIntInclusive = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export function getBaseIntervalDays(cardType: IRCardType, priority: number): number {
  const p = normalizePriority(priority) / 100

  if (cardType === "extracts") {
    // 高优先级更频繁
    return Math.max(1, Math.round(lerp(7, 1, p)))
  }

  return Math.max(1, Math.round(lerp(14, 2, p)))
}

export function getExtractBaseIntervalDays(priority: number): number {
  return getBaseIntervalDays("extracts", priority)
}

export function getTopicBaseIntervalDays(priority: number): number {
  return getBaseIntervalDays("topic", priority)
}

export function getPostponeDays(cardType: IRCardType, priority: number): number {
  const p = normalizePriority(priority) / 100
  const inv = 1 - p

  if (cardType === "extracts") {
    const min = Math.max(1, Math.round(lerp(1, 4, inv)))
    const max = Math.max(min, Math.round(lerp(2, 10, inv)))
    return randomIntInclusive(min, max)
  }

  const min = Math.max(1, Math.round(lerp(1, 7, inv)))
  const max = Math.max(min, Math.round(lerp(2, 14, inv)))
  return randomIntInclusive(min, max)
}

/**
 * 计算下一次到期时间
 * @param cardType - 卡片类型
 * @param priority - 优先级（0-100）
 * @param baseDate - 基准时间（通常为当前时间或上次阅读时间）
 */
export function calculateNextDue(
  cardType: IRCardType,
  priority: number,
  baseDate: Date = new Date()
): Date {
  const intervalDays = getBaseIntervalDays(cardType, priority)
  const jitterMs = Math.floor(Math.random() * 12 * 60 * 60 * 1000) // 0-12h
  return new Date(baseDate.getTime() + intervalDays * DAY_MS + jitterMs)
}
