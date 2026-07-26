import { describe, expect, it } from "vitest"
import { State } from "ts-fsrs"

import type { SrsState } from "./types"
import {
  createInitialSrsState,
  getFsrsInstance,
  nextReviewState,
  previewDueDates,
  previewIntervals,
  resetCardState,
} from "./algorithm"

const fixedNow = new Date("2026-07-12T12:00:00.000Z")

/** 成熟复习卡：good/easy 会给出天级（≥2.5 天）间隔，从而进入 fuzz 抖动路径 */
function matureReviewState(): SrsState {
  return {
    stability: 30,
    difficulty: 5,
    interval: 21,
    due: new Date("2026-07-10T12:00:00.000Z"),
    lastReviewed: new Date("2026-06-19T12:00:00.000Z"),
    reps: 12,
    lapses: 0,
    state: State.Review,
  }
}

describe("algorithm resets", () => {
  it.each(["Basic", "Cloze", "Direction", "List"])(
    "%s 评分后保留重置次数",
    () => {
      const resetState = resetCardState(createInitialSrsState(fixedNow), fixedNow)

      const { state } = nextReviewState(resetState, "good", fixedNow)

      expect(state.resets).toBe(1)
    },
  )

  it("多次重置后评分保留累计值", () => {
    const initialState = createInitialSrsState(fixedNow)
    const resetOnce = resetCardState(initialState, fixedNow)
    const resetTwice = resetCardState(resetOnce, fixedNow)

    const { state } = nextReviewState(resetTwice, "hard", fixedNow)

    expect(state.resets).toBe(2)
  })

  it("未重置卡片评分后重置次数为零", () => {
    const { state } = nextReviewState(createInitialSrsState(fixedNow), "easy", fixedNow)

    expect(state.resets).toBe(0)
  })

  it("预览评分不会修改原状态", () => {
    const previousState = {
      ...resetCardState(createInitialSrsState(fixedNow), fixedNow),
      due: new Date("2026-07-13T12:00:00.000Z"),
      lastReviewed: new Date("2026-07-11T12:00:00.000Z"),
    }
    const snapshot = structuredClone(previousState)

    previewIntervals(previousState, fixedNow)

    expect(previousState).toEqual(snapshot)
    expect(previousState.resets).toBe(1)
  })
})

describe("FSRS fuzz", () => {
  it("默认运行时实例启用 enable_fuzz", () => {
    // 分散复习负载：天级间隔叠加抖动，避免同日到期"雪崩"
    expect(getFsrsInstance().parameters.enable_fuzz).toBe(true)
  })

  it("确定性：相同输入状态 + 相同 now 两次评分间隔/到期完全一致", () => {
    const prev = matureReviewState()
    const a = nextReviewState(prev, "good", fixedNow)
    const b = nextReviewState(prev, "good", fixedNow)

    // fuzz 由 `${reviewTime}_${reps}_${difficulty*stability}` 确定性播种，
    // apply_fuzz 每次重建 alea 生成器，故同输入结果稳定
    expect(a.state.interval).toBe(b.state.interval)
    expect(a.state.due.getTime()).toBe(b.state.due.getTime())
  })

  it("天级间隔：预览与正式评分共用同一实例同一 now，fuzz 结果一致", () => {
    const prev = matureReviewState()
    const preview = previewDueDates(prev, fixedNow)
    const { state } = nextReviewState(prev, "good", fixedNow)

    // 该 good 间隔为天级（≥2.5 天），确实经过 fuzz 路径
    expect(state.interval).toBeGreaterThanOrEqual(3)
    // 预览四评分与正式评分同输入 → 同 fuzz 因子 → due 完全相等
    expect(state.due.getTime()).toBe(preview.good.getTime())
  })

  it("分钟级学习步不受 fuzz 影响：新卡 Again 仍为亚天级且确定性一致", () => {
    const initial = createInitialSrsState(fixedNow)
    const first = previewIntervals(initial, fixedNow)
    const second = previewIntervals(initial, fixedNow)

    // 学习步（1m/10m）不走 apply_fuzz；短间隔断言不受 fuzz 干扰
    expect(first.again).toBe(second.again)
    expect(first.again).toBeLessThan(2.5 * 24 * 60 * 60 * 1000)
    expect(first.again).toBeGreaterThan(0)
  })
})
