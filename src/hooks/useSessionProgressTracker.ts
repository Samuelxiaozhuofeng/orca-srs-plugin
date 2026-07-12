/**
 * useSessionProgressTracker Hook
 *
 * 封装会话进度追踪的状态管理和副作用。
 * FC-09：不支持断点恢复；storageKey 必填；scoped 自动保存 / 清理。
 */

import type { Grade } from "../srs/types"
import type {
  SessionProgressState,
  SessionStatsSummary,
} from "../srs/sessionProgressTracker"
import {
  createInitialProgressState,
  recordEffectiveGrade as recordEffectiveGradePure,
  calculateAccuracyRate,
  generateStatsSummary,
  serializeProgressState,
} from "../srs/sessionProgressTracker"
import {
  autoSaveSessionProgress,
  clearSessionProgressKey,
  getDefaultSessionStorage,
  registerSessionProgressKey,
  tryParseSessionProgressJson,
  unregisterSessionProgressKey,
  type StorageLike,
} from "../srs/sessionProgressStorage"

const { useState, useRef, useMemo, useEffect, useCallback } = window.React

// ============================================
// Type Definitions
// ============================================

/**
 * Hook 配置选项
 *
 * storageKey 必填：避免遗漏时共享固定键污染。
 * autoSave=false 时仍要求传入 key（便于 finish/abandon 语义一致），但不读写 storage。
 */
export interface UseSessionProgressTrackerOptions {
  /** 是否自动保存到 sessionStorage（默认 true） */
  autoSave?: boolean
  /**
   * sessionStorage 键名（必填）。
   * 由 Renderer 冻结的 progressStorageKey 传入，不得使用全局默认共享键。
   */
  storageKey: string
  /** 可注入 StorageLike（测试）；默认 sessionStorage */
  storage?: StorageLike | null
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
  /**
   * 记录一次评分，使用调用方提供的**有效时长**（FC-10）。
   * 内部不再读取 Date.now 计算 duration，保证与 gradeReviewCard / 日志同源。
   * @param grade - 评分
   * @param effectiveDuration - 有效时长（毫秒）；异常值由纯函数再归一化
   */
  recordEffectiveGrade: (grade: Grade, effectiveDuration: number) => void
  /**
   * 同 recordEffectiveGrade；保留 recordGrade 名称便于调用方渐进迁移。
   * 必须传入 effectiveDuration，禁止无参二次计时。
   */
  recordGrade: (grade: Grade, effectiveDuration: number) => void
  /** 重置会话（轮次归零统计；同 scope 继续 autoSave） */
  resetSession: () => void
  /** 结束会话并返回统计摘要（清理 scoped key） */
  finishSession: () => SessionStatsSummary
  /**
   * 主动放弃 / 关闭前清理 scoped key（不生成摘要）。
   * 清理失败仅 warn，不阻断后续 onClose flush。
   */
  abandonSession: () => void

  // 序列化
  /** 序列化当前状态 */
  serialize: () => string
  /**
   * 从 JSON **显式**恢复状态（本阶段 UI 不自动调用）。
   * 结构/version 无效时返回 false 并 warn，不把损坏数据当成功。
   */
  restore: (json: string) => boolean
}

// ============================================
// Hook Implementation
// ============================================

/**
 * 会话进度追踪 Hook
 *
 * @param options - 配置（storageKey 必填）
 * @returns 进度状态和操作方法
 *
 * @example
 * ```tsx
 * const {
 *   progressState,
 *   accuracyRate,
 *   recordEffectiveGrade,
 *   resetSession,
 *   finishSession,
 *   abandonSession,
 * } = useSessionProgressTracker({ storageKey: progressStorageKey })
 *
 * // 正式评分：传入 gradeReviewCard 返回的 effectiveDuration
 * recordEffectiveGrade(grade, gradeResult.timing.effectiveDuration)
 * ```
 */
export function useSessionProgressTracker(
  options: UseSessionProgressTrackerOptions
): UseSessionProgressTrackerReturn {
  const {
    autoSave = true,
    storageKey,
    storage: storageOption,
  } = options

  if (typeof storageKey !== "string" || storageKey.length === 0) {
    throw new Error(
      "useSessionProgressTracker: storageKey 必填，禁止使用共享默认键"
    )
  }

  // ============================================
  // State Management — 始终全新状态，不 getItem 自动恢复
  // ============================================

  const [progressState, setProgressState] = useState<SessionProgressState>(() =>
    createInitialProgressState()
  )

  /**
   * 当前实例已初始化的 storage key。
   * 仅在 key 真正变化时清空并重置；不因 progress 更新而清空。
   */
  const activeKeyRef = useRef<string | null>(null)
  /** finish / abandon 后停止 autoSave，避免清理后又写回 */
  const storageActiveRef = useRef(true)
  const storageRef = useRef<StorageLike | null>(
    storageOption !== undefined ? storageOption : getDefaultSessionStorage()
  )
  if (storageOption !== undefined) {
    storageRef.current = storageOption
  }

  // ============================================
  // Derived State
  // ============================================

  const accuracyRate = useMemo(
    () => calculateAccuracyRate(progressState.gradeDistribution),
    [progressState.gradeDistribution]
  )

  // ============================================
  // Actions
  // ============================================

  /**
   * FC-10：记录评分时长仅使用调用方传入的 effectiveDuration，
   * 不再二次 Date.now()，与永久日志保持同一数值。
   * 卡切换的 cardStartTime 由 Demo 维护并传给 gradeReviewCard。
   */
  const recordEffectiveGrade = useCallback(
    (grade: Grade, effectiveDuration: number) => {
      setProgressState((prevState: SessionProgressState) =>
        recordEffectiveGradePure(prevState, grade, effectiveDuration)
      )
    },
    []
  )

  const recordGrade = recordEffectiveGrade

  /**
   * 轮次 / 手动重置：统计归零，同 scope 继续可 autoSave。
   */
  const resetSession = useCallback(() => {
    const newState = createInitialProgressState()
    setProgressState(newState)
    storageActiveRef.current = true

    if (autoSave) {
      const storage = storageRef.current
      if (storage) {
        clearSessionProgressKey(storage, storageKey)
      }
      registerSessionProgressKey(storageKey)
    }
  }, [autoSave, storageKey])

  /**
   * 正常完成：生成摘要并清理 scoped key。
   */
  const finishSession = useCallback((): SessionStatsSummary => {
    const sessionEndTime = Date.now()
    const summary = generateStatsSummary(progressState, sessionEndTime)

    storageActiveRef.current = false
    if (autoSave) {
      const storage = storageRef.current
      if (storage) {
        clearSessionProgressKey(storage, storageKey)
      }
      unregisterSessionProgressKey(storageKey)
    }

    return summary
  }, [progressState, autoSave, storageKey])

  /**
   * 主动关闭 / 放弃：清理 scoped key，不生成摘要。
   * 清理失败 warning 但仍允许调用方继续 flush / close。
   */
  const abandonSession = useCallback(() => {
    storageActiveRef.current = false
    if (autoSave) {
      const storage = storageRef.current
      if (storage) {
        clearSessionProgressKey(storage, storageKey)
      }
      unregisterSessionProgressKey(storageKey)
    }
  }, [autoSave, storageKey])

  // ============================================
  // Serialization
  // ============================================

  const serialize = useCallback((): string => {
    return serializeProgressState(progressState)
  }, [progressState])

  const restore = useCallback((json: string): boolean => {
    const restoredState = tryParseSessionProgressJson(json)
    if (!restoredState) {
      // tryParse 已 warn
      return false
    }
    setProgressState(restoredState)
    storageActiveRef.current = true
    return true
  }, [])

  // ============================================
  // Side Effects
  // ============================================

  /**
   * 会话 key 初始化：仅在 storageKey 真正变化 / 新挂载时执行一次。
   * - 不 getItem 恢复
   * - 清理同 scope 旧值
   * - 登记 registry
   * - key 切换时旧 key 清理且统计归零
   *
   * 不依赖 progressState，故 progress 更新不会触发清空。
   */
  useEffect(() => {
    if (!autoSave) {
      activeKeyRef.current = storageKey
      return
    }

    const storage = storageRef.current
    const prevKey = activeKeyRef.current

    if (prevKey === storageKey) {
      // 同 key 重复 effect（不应在 progress 更新时进入此 effect）
      return
    }

    // key 切换：清理旧 key
    if (prevKey != null && storage) {
      clearSessionProgressKey(storage, prevKey)
      unregisterSessionProgressKey(prevKey)
    }

    // 新会话：清理同 scope 遗留，登记，从零开始
    if (storage) {
      clearSessionProgressKey(storage, storageKey)
    }
    registerSessionProgressKey(storageKey)
    activeKeyRef.current = storageKey
    storageActiveRef.current = true

    if (prevKey != null) {
      // 真正切换会话 scope：归零
      setProgressState(createInitialProgressState())
    }
  }, [storageKey, autoSave])

  /**
   * 自动保存到 scoped key（finish/abandon 后不再写入）
   */
  useEffect(() => {
    if (!autoSave || !storageActiveRef.current) return
    const storage = storageRef.current
    if (!storage) return

    const serialized = serializeProgressState(progressState)
    autoSaveSessionProgress(storage, storageKey, serialized)
  }, [progressState, autoSave, storageKey])

  // ============================================
  // Return
  // ============================================

  return {
    progressState,
    accuracyRate,
    recordEffectiveGrade,
    recordGrade,
    resetSession,
    finishSession,
    abandonSession,
    serialize,
    restore,
  }
}

export default useSessionProgressTracker
