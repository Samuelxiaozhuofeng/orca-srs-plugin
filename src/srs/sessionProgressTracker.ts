/**
 * Session Progress Tracker
 *
 * 纯函数模块，负责复习会话进度追踪的所有计算逻辑。
 * 包含评分分布追踪、准确率计算、时间统计等功能。
 *
 * FC-10：墙钟时长与有效时长归一化的**唯一**实现源。
 * 永久日志与 Hook 均须 import 此处常量与函数，禁止复制规则。
 */

import type { Grade, ReviewLogEntry } from "./types"

// ============================================
// Constants
// ============================================

/**
 * 单卡有效复习时长上限（毫秒）= 60 秒。
 * 产品规则：使用墙钟耗时（页面隐藏/失焦/编辑内容暂不暂停），但每张卡有效时长最多 60 秒。
 */
export const MAX_EFFECTIVE_CARD_DURATION_MS = 60 * 1000

/**
 * @deprecated 请优先使用 MAX_EFFECTIVE_CARD_DURATION_MS；保留别名避免外部引用断裂。
 */
export const IDLE_TIMEOUT_THRESHOLD = MAX_EFFECTIVE_CARD_DURATION_MS

/** 当前数据版本 */
export const CURRENT_VERSION = 1

// ============================================
// Type Definitions
// ============================================

/**
 * 评分分布
 */
export interface GradeDistribution {
  again: number
  hard: number
  good: number
  easy: number
}

/**
 * 会话进度状态
 */
export interface SessionProgressState {
  /** 数据版本号 */
  version: number
  /** 会话开始时间戳（毫秒） */
  sessionStartTime: number
  /** 评分分布 */
  gradeDistribution: GradeDistribution
  /** 已评分卡片总数 */
  totalGradedCards: number
  /** 有效复习时长（毫秒） */
  effectiveReviewTime: number
  /** 每张卡片的有效复习时长数组 */
  cardDurations: number[]
}

/**
 * 会话统计摘要
 */
export interface SessionStatsSummary {
  /** 已复习卡片数 */
  totalReviewed: number
  /** 会话总时长（毫秒） */
  totalSessionTime: number
  /** 有效复习时长（毫秒） */
  effectiveReviewTime: number
  /** 平均每卡耗时（毫秒） */
  averageTimePerCard: number
  /** 准确率（0-1） */
  accuracyRate: number
  /** 评分分布 */
  gradeDistribution: GradeDistribution
}

/**
 * 一次评分的墙钟 / 有效时长（同源 now）
 */
export interface ReviewTiming {
  /** 评分时刻时间戳（毫秒），与 duration 同源 */
  timestamp: number
  /**
   * 安全非负原始墙钟值（毫秒）：
   * 非有限 / 负数（含系统时间回拨）→ 0；无上限截断
   */
  rawDuration: number
  /**
   * 有效时长（毫秒）：0..MAX_EFFECTIVE_CARD_DURATION_MS
   */
  effectiveDuration: number
}

/**
 * 序列化数据结构
 */
export interface SerializedSessionData {
  version: number
  data: SessionProgressState
}


// ============================================
// Pure Functions — duration (FC-10 唯一口径)
// ============================================

/**
 * 将任意 unknown/number 归一化为**有效**复习时长（毫秒）。
 *
 * 规则（幂等）：
 * - 非 number / NaN / ±Infinity / -Infinity → 0
 * - 负数（含时间回拨产生的负差）→ 0
 * - 超过 MAX_EFFECTIVE_CARD_DURATION_MS → 截断为该阈值
 * - 否则返回原值
 *
 * @param duration - 原始或已归一化耗时
 * @returns 有效耗时 ∈ [0, MAX_EFFECTIVE_CARD_DURATION_MS]
 */
export function calculateEffectiveDuration(duration: unknown): number {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    return 0
  }
  return Math.min(duration, MAX_EFFECTIVE_CARD_DURATION_MS)
}

/**
 * 安全的原始墙钟时长（毫秒）：供 `rawDuration` 写入日志。
 * - 非有限 / 非 number / 负数 → 0
 * - **不**做 60s 上限截断
 */
export function safeRawDuration(duration: unknown): number {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    return 0
  }
  return duration
}

/**
 * 基于 cardStart 与**单次** now 计算 timing（timestamp / raw / effective 同源）。
 * 墙钟差 = now - reviewStartedAt；不暂停隐藏/失焦。
 */
export function computeReviewTiming(
  reviewStartedAt: number,
  now: number
): ReviewTiming {
  const wallClock = now - reviewStartedAt
  return {
    timestamp: now,
    rawDuration: safeRawDuration(wallClock),
    effectiveDuration: calculateEffectiveDuration(wallClock),
  }
}

/**
 * 从复习日志读取有效时长（统计累计**唯一**入口 helper）。
 *
 * - 新日志：`duration` 已是有效时长（0..60000）；再次归一化幂等
 * - 旧日志：仅有 `duration` 时按同一规则截断异常大值 / 负 / NaN
 * - **不**使用 `rawDuration` 做统计累加，避免与有效口径重复
 */
export function effectiveDurationFromReviewLog(
  log: Pick<ReviewLogEntry, "duration"> | { duration?: unknown; rawDuration?: unknown }
): number {
  return calculateEffectiveDuration(
    log && typeof log === "object" ? (log as { duration?: unknown }).duration : undefined
  )
}

// ============================================
// Pure Functions — progress state
// ============================================

/**
 * 创建初始进度状态
 * @returns 初始化的会话进度状态
 */
export function createInitialProgressState(): SessionProgressState {
  return {
    version: CURRENT_VERSION,
    sessionStartTime: Date.now(),
    gradeDistribution: {
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    },
    totalGradedCards: 0,
    effectiveReviewTime: 0,
    cardDurations: [],
  }
}


/**
 * 记录一次**已约定为有效时长**的评分（推荐会话进度入口）。
 *
 * 仍会再跑 `calculateEffectiveDuration` 做防御性校验，防止调用方传入负/NaN/超阈值。
 * 与 `recordGrade` 数值语义相同；命名强调「传入与日志一致的 effective」。
 *
 * @param state - 当前进度状态
 * @param grade - 评分
 * @param effectiveDuration - 有效时长（毫秒）；异常输入归一化为 0 或阈值
 */
export function recordEffectiveGrade(
  state: SessionProgressState,
  grade: Grade,
  effectiveDuration: unknown
): SessionProgressState {
  const effective = calculateEffectiveDuration(effectiveDuration)

  return {
    ...state,
    gradeDistribution: {
      ...state.gradeDistribution,
      [grade]: state.gradeDistribution[grade] + 1,
    },
    totalGradedCards: state.totalGradedCards + 1,
    effectiveReviewTime: state.effectiveReviewTime + effective,
    cardDurations: [...state.cardDurations, effective],
  }
}

/**
 * 记录一次评分（纯函数）。
 *
 * `duration` 可为原始墙钟或已归一化值：内部统一经 `calculateEffectiveDuration`。
 * 正式评分路径请优先使用 `recordEffectiveGrade`，并传入与日志相同的 effective 值。
 *
 * @param state - 当前进度状态
 * @param grade - 评分
 * @param duration - 本次复习耗时（毫秒，原始或有效均可）
 * @returns 更新后的进度状态
 */
export function recordGrade(
  state: SessionProgressState,
  grade: Grade,
  duration: unknown
): SessionProgressState {
  return recordEffectiveGrade(state, grade, duration)
}


/**
 * 计算准确率
 * @param distribution - 评分分布
 * @returns 准确率（0-1），无评分时返回 0
 */
export function calculateAccuracyRate(distribution: GradeDistribution): number {
  const total = distribution.again + distribution.hard + distribution.good + distribution.easy
  if (total === 0) {
    return 0
  }
  return (distribution.hard + distribution.good + distribution.easy) / total
}


/**
 * 将任意毫秒数安全为非负有限数（供 format / summary 使用）
 */
function safeNonNegativeMs(milliseconds: unknown): number {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return 0
  }
  return milliseconds
}

/**
 * 格式化时长为 HH:MM:SS
 * @param milliseconds - 毫秒数（NaN / Infinity / 负 → 00:00:00）
 * @returns 格式化字符串，永不输出 NaN:NaN
 */
export function formatDuration(milliseconds: unknown): string {
  const ms = safeNonNegativeMs(milliseconds)

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n: number): string => n.toString().padStart(2, "0")

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}


/**
 * 格式化准确率为百分比字符串
 * @param rate - 准确率（0-1）
 * @returns 百分比字符串，如 "85.5%"
 */
export function formatAccuracyRate(rate: number): string {
  // Clamp rate to valid range
  if (!Number.isFinite(rate) || rate < 0) {
    rate = 0
  }
  if (rate > 1) {
    rate = 1
  }

  const percentage = rate * 100
  return `${percentage.toFixed(1)}%`
}


/**
 * 生成会话统计摘要
 * @param state - 进度状态
 * @param sessionEndTime - 会话结束时间戳
 * @returns 统计摘要（时长字段对 NaN/Infinity 安全）
 */
export function generateStatsSummary(
  state: SessionProgressState,
  sessionEndTime: number
): SessionStatsSummary {
  const start = safeNonNegativeMs(state.sessionStartTime)
  const end = typeof sessionEndTime === "number" && Number.isFinite(sessionEndTime)
    ? sessionEndTime
    : start
  const totalSessionTime = Math.max(0, end - start)

  const effectiveReviewTime = safeNonNegativeMs(state.effectiveReviewTime)
  const totalGraded = typeof state.totalGradedCards === "number" && Number.isFinite(state.totalGradedCards)
    ? Math.max(0, state.totalGradedCards)
    : 0
  const averageTimePerCard = totalGraded > 0
    ? effectiveReviewTime / totalGraded
    : 0
  const accuracyRate = calculateAccuracyRate(state.gradeDistribution)

  return {
    totalReviewed: totalGraded,
    totalSessionTime,
    effectiveReviewTime,
    averageTimePerCard,
    accuracyRate,
    gradeDistribution: { ...state.gradeDistribution },
  }
}


/**
 * 序列化进度状态
 * @param state - 进度状态
 * @returns JSON 字符串
 */
export function serializeProgressState(state: SessionProgressState): string {
  const serializedData: SerializedSessionData = {
    version: CURRENT_VERSION,
    data: state,
  }
  return JSON.stringify(serializedData)
}


/**
 * 反序列化进度状态（兼容入口）
 *
 * FC-09：本阶段**不自动恢复**；显式 restore 请用
 * `tryParseSessionProgressJson`（sessionProgressStorage），失败返回 null。
 * 本函数在失败时 warn 并返回**全新**初始状态，调用方不得将其视为「恢复成功」。
 *
 * @param json - JSON 字符串
 * @returns 合法则返回状态；否则返回初始状态
 */
export function deserializeProgressState(json: string): SessionProgressState {
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed == null || typeof parsed !== "object") {
      console.warn("Failed to deserialize session progress: root is not an object")
      return createInitialProgressState()
    }
    const root = parsed as Partial<SerializedSessionData>
    if (root.version !== CURRENT_VERSION) {
      console.warn(
        `Session progress version mismatch: expected ${CURRENT_VERSION}, got ${String(root.version)}. Returning initial state.`
      )
      return createInitialProgressState()
    }
    const data = root.data
    if (
      data == null ||
      typeof data !== "object" ||
      data.version !== CURRENT_VERSION ||
      typeof data.sessionStartTime !== "number" ||
      typeof data.totalGradedCards !== "number" ||
      typeof data.effectiveReviewTime !== "number" ||
      !data.gradeDistribution ||
      !Array.isArray(data.cardDurations)
    ) {
      console.warn("Failed to deserialize session progress: invalid data shape")
      return createInitialProgressState()
    }
    return {
      version: data.version,
      sessionStartTime: data.sessionStartTime,
      gradeDistribution: { ...data.gradeDistribution },
      totalGradedCards: data.totalGradedCards,
      effectiveReviewTime: data.effectiveReviewTime,
      cardDurations: [...data.cardDurations]
    }
  } catch (error) {
    console.warn("Failed to deserialize session progress:", error)
    return createInitialProgressState()
  }
}
