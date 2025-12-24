/**
 * Session Progress Tracker
 * 
 * 纯函数模块，负责复习会话进度追踪的所有计算逻辑。
 * 包含评分分布追踪、准确率计算、时间统计等功能。
 */

import type { Grade } from "./types"

// ============================================
// Constants
// ============================================

/** 闲置超时阈值（毫秒）- 60秒 */
export const IDLE_TIMEOUT_THRESHOLD = 60 * 1000

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
 * 序列化数据结构
 */
export interface SerializedSessionData {
  version: number
  data: SessionProgressState
}


// ============================================
// Pure Functions
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
 * 计算有效复习时长（应用闲置超时阈值）
 * @param duration - 原始耗时（毫秒）
 * @returns 有效耗时（不超过阈值，负数视为0）
 */
export function calculateEffectiveDuration(duration: number): number {
  if (duration < 0) {
    return 0
  }
  return Math.min(duration, IDLE_TIMEOUT_THRESHOLD)
}


/**
 * 记录一次评分（纯函数，返回新状态）
 * @param state - 当前进度状态
 * @param grade - 评分
 * @param duration - 本次复习耗时（毫秒）
 * @returns 更新后的进度状态
 */
export function recordGrade(
  state: SessionProgressState,
  grade: Grade,
  duration: number
): SessionProgressState {
  const effectiveDuration = calculateEffectiveDuration(duration)
  
  return {
    ...state,
    gradeDistribution: {
      ...state.gradeDistribution,
      [grade]: state.gradeDistribution[grade] + 1,
    },
    totalGradedCards: state.totalGradedCards + 1,
    effectiveReviewTime: state.effectiveReviewTime + effectiveDuration,
    cardDurations: [...state.cardDurations, effectiveDuration],
  }
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
 * 格式化时长为 HH:MM:SS
 * @param milliseconds - 毫秒数
 * @returns 格式化字符串
 */
export function formatDuration(milliseconds: number): string {
  // Handle edge cases
  if (milliseconds < 0) {
    milliseconds = 0
  }
  
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  const pad = (n: number): string => n.toString().padStart(2, '0')
  
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}


/**
 * 格式化准确率为百分比字符串
 * @param rate - 准确率（0-1）
 * @returns 百分比字符串，如 "85.5%"
 */
export function formatAccuracyRate(rate: number): string {
  // Clamp rate to valid range
  if (rate < 0) {
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
 * @returns 统计摘要
 */
export function generateStatsSummary(
  state: SessionProgressState,
  sessionEndTime: number
): SessionStatsSummary {
  const totalSessionTime = sessionEndTime - state.sessionStartTime
  const averageTimePerCard = state.totalGradedCards > 0
    ? state.effectiveReviewTime / state.totalGradedCards
    : 0
  const accuracyRate = calculateAccuracyRate(state.gradeDistribution)
  
  return {
    totalReviewed: state.totalGradedCards,
    totalSessionTime: Math.max(0, totalSessionTime),
    effectiveReviewTime: state.effectiveReviewTime,
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
 * 反序列化进度状态
 * @param json - JSON 字符串
 * @returns 进度状态，版本不匹配或解析错误时返回初始状态
 */
export function deserializeProgressState(json: string): SessionProgressState {
  try {
    const parsed: SerializedSessionData = JSON.parse(json)
    
    // Validate version field
    if (parsed.version !== CURRENT_VERSION) {
      console.warn(
        `Session progress version mismatch: expected ${CURRENT_VERSION}, got ${parsed.version}. Returning initial state.`
      )
      return createInitialProgressState()
    }
    
    return parsed.data
  } catch (error) {
    // Handle JSON parse errors
    console.warn('Failed to deserialize session progress:', error)
    return createInitialProgressState()
  }
}
