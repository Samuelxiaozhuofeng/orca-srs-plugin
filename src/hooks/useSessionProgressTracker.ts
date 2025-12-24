/**
 * useSessionProgressTracker Hook
 * 
 * 封装会话进度追踪的状态管理和副作用。
 * 连接纯函数模块与 React 组件，提供实时进度追踪功能。
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.2
 */

import type { Grade } from "../srs/types"
import type {
  SessionProgressState,
  SessionStatsSummary,
} from "../srs/sessionProgressTracker"
import {
  createInitialProgressState,
  recordGrade as recordGradePure,
  calculateAccuracyRate,
  generateStatsSummary,
  serializeProgressState,
  deserializeProgressState,
} from "../srs/sessionProgressTracker"

const { useState, useRef, useMemo, useEffect, useCallback } = window.React

// ============================================
// Type Definitions
// ============================================

/**
 * Hook 配置选项
 */
export interface UseSessionProgressTrackerOptions {
  /** 是否自动保存到 sessionStorage（默认 true） */
  autoSave?: boolean
  /** sessionStorage 键名（默认 'srs-session-progress'） */
  storageKey?: string
}

/**
 * Hook 返回值
 */
export interface UseSessionProgressTrackerReturn {
  // 状态
  /** 当前进度状态 */
  progressState: SessionProgressState
  /** 实时准确率（0-1） */
  accuracyRate: number
  
  // 操作
  /** 记录一次评分 */
  recordGrade: (grade: Grade) => void
  /** 重置会话 */
  resetSession: () => void
  /** 结束会话并返回统计摘要 */
  finishSession: () => SessionStatsSummary
  
  // 序列化
  /** 序列化当前状态 */
  serialize: () => string
  /** 从 JSON 恢复状态 */
  restore: (json: string) => boolean
}

// ============================================
// Constants
// ============================================

const DEFAULT_STORAGE_KEY = 'srs-session-progress'

// ============================================
// Hook Implementation
// ============================================

/**
 * 会话进度追踪 Hook
 * 
 * @param options - 配置选项
 * @returns 进度状态和操作方法
 * 
 * @example
 * ```tsx
 * const {
 *   progressState,
 *   accuracyRate,
 *   recordGrade,
 *   resetSession,
 *   finishSession,
 * } = useSessionProgressTracker()
 * 
 * // 记录评分
 * recordGrade("good")
 * 
 * // 结束会话
 * const stats = finishSession()
 * ```
 */
export function useSessionProgressTracker(
  options: UseSessionProgressTrackerOptions = {}
): UseSessionProgressTrackerReturn {
  const {
    autoSave = true,
    storageKey = DEFAULT_STORAGE_KEY,
  } = options

  // ============================================
  // State Management
  // ============================================

  // 初始化状态：尝试从 sessionStorage 恢复，否则创建新状态
  const [progressState, setProgressState] = useState<SessionProgressState>(() => {
    if (autoSave) {
      try {
        const saved = sessionStorage.getItem(storageKey)
        if (saved) {
          return deserializeProgressState(saved)
        }
      } catch {
        // sessionStorage 不可用，静默失败
      }
    }
    return createInitialProgressState()
  })

  // 使用 useRef 记录卡片开始时间，避免不必要的重渲染
  const cardStartTimeRef = useRef<number>(Date.now())

  // ============================================
  // Derived State (useMemo)
  // ============================================

  // 实时准确率
  const accuracyRate = useMemo(
    () => calculateAccuracyRate(progressState.gradeDistribution),
    [progressState.gradeDistribution]
  )

  // ============================================
  // Actions
  // ============================================

  /**
   * 记录一次评分
   * Requirements: 2.1, 5.1
   */
  const recordGrade = useCallback((grade: Grade) => {
    const now = Date.now()
    const duration = now - cardStartTimeRef.current
    
    setProgressState((prevState: SessionProgressState) => recordGradePure(prevState, grade, duration))
    
    // 重置卡片开始时间
    cardStartTimeRef.current = now
  }, [])

  /**
   * 重置会话
   * Requirements: 1.1
   */
  const resetSession = useCallback(() => {
    const newState = createInitialProgressState()
    setProgressState(newState)
    cardStartTimeRef.current = Date.now()
    
    // 清除 sessionStorage
    if (autoSave) {
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        // 静默失败
      }
    }
  }, [autoSave, storageKey])

  /**
   * 结束会话并返回统计摘要
   * Requirements: 1.1, 4.2
   */
  const finishSession = useCallback((): SessionStatsSummary => {
    const sessionEndTime = Date.now()
    const summary = generateStatsSummary(progressState, sessionEndTime)
    
    // 清除 sessionStorage
    if (autoSave) {
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        // 静默失败
      }
    }
    
    return summary
  }, [progressState, autoSave, storageKey])

  // ============================================
  // Serialization
  // ============================================

  /**
   * 序列化当前状态
   * Requirements: 6.1
   */
  const serialize = useCallback((): string => {
    return serializeProgressState(progressState)
  }, [progressState])

  /**
   * 从 JSON 恢复状态
   * Requirements: 6.2
   */
  const restore = useCallback((json: string): boolean => {
    try {
      const restoredState = deserializeProgressState(json)
      setProgressState(restoredState)
      cardStartTimeRef.current = Date.now()
      return true
    } catch {
      return false
    }
  }, [])

  // ============================================
  // Side Effects
  // ============================================

  /**
   * 自动保存到 sessionStorage
   * Requirements: 6.1, 6.2
   */
  useEffect(() => {
    if (!autoSave) return

    try {
      const serialized = serializeProgressState(progressState)
      sessionStorage.setItem(storageKey, serialized)
    } catch {
      // sessionStorage 不可用，静默失败
    }
  }, [progressState, autoSave, storageKey])

  // ============================================
  // Return
  // ============================================

  return {
    progressState,
    accuracyRate,
    recordGrade,
    resetSession,
    finishSession,
    serialize,
    restore,
  }
}

export default useSessionProgressTracker
