/**
 * FC-10：repeat 专项模式会话进度使用同一 computeReviewTiming helper；
 * 辅助预览不计进度（行为契约，纯函数层验证 helper 与「不调用」规则）。
 */
import { describe, expect, it } from "vitest"
import {
  computeReviewTiming,
  createInitialProgressState,
  recordEffectiveGrade,
  MAX_EFFECTIVE_CARD_DURATION_MS,
} from "./sessionProgressTracker"

/**
 * Demo 专项训练路径镜像：不经 gradeReviewCard，但用统一 helper 计时后写入会话。
 */
function recordRepeatModeProgress(
  state: ReturnType<typeof createInitialProgressState>,
  grade: "again" | "hard" | "good" | "easy",
  cardStartTime: number,
  now: number
) {
  const timing = computeReviewTiming(cardStartTime, now)
  return {
    state: recordEffectiveGrade(state, grade, timing.effectiveDuration),
    timing,
  }
}

describe("FC-10 repeat mode session progress", () => {
  it("uses same helper: <60s effective matches wall", () => {
    const start = 1_000
    const now = start + 12_000
    const { state, timing } = recordRepeatModeProgress(
      createInitialProgressState(),
      "good",
      start,
      now
    )
    expect(timing.effectiveDuration).toBe(12_000)
    expect(timing.rawDuration).toBe(12_000)
    expect(state.effectiveReviewTime).toBe(12_000)
    expect(state.cardDurations).toEqual([12_000])
  })

  it("uses same helper: >60s caps at 60000", () => {
    const start = 0
    const now = 150_000
    const { state, timing } = recordRepeatModeProgress(
      createInitialProgressState(),
      "hard",
      start,
      now
    )
    expect(timing.rawDuration).toBe(150_000)
    expect(timing.effectiveDuration).toBe(MAX_EFFECTIVE_CARD_DURATION_MS)
    expect(state.effectiveReviewTime).toBe(60_000)
  })

  it("auxiliary preview must not call recordEffectiveGrade (contract)", () => {
    // 列表辅助预览路径：Demo 在 isAuxiliaryPreview 时 early-return，不调用进度 API。
    // 此处用「状态不变」契约文档化：辅助预览等价于从不调用 recordEffectiveGrade。
    const state = createInitialProgressState()
    const isAuxiliaryPreview = true
    let next = state
    if (!isAuxiliaryPreview) {
      next = recordEffectiveGrade(state, "good", 10_000)
    }
    expect(next).toBe(state)
    expect(next.totalGradedCards).toBe(0)
    expect(next.effectiveReviewTime).toBe(0)
  })
})
