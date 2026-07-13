/**
 * F2-08：各卡类型预览路径应把 pluginName 传给 previewIntervals/previewDueDates。
 * 不引入 React 测试框架；用轻量 harness 固定调用约定与共享参数路径。
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearFsrsRuntimeState,
  getEffectiveFsrsParams,
  nextReviewState,
  previewDueDates,
  previewIntervals,
  createInitialSrsState
} from "./algorithm"
import {
  DEFAULT_FSRS_WEIGHTS,
  REVIEW_SETTINGS_KEYS
} from "./settings/reviewSettingsSchema"

const PLUGIN_A = "plugin-a"
const PLUGIN_B = "plugin-b"
const fixedNow = new Date("2026-07-13T08:00:00.000Z")

/**
 * 模拟各渲染器在 useMemo 中的预览调用约定（与组件源码一致）：
 * previewIntervals(fullState, undefined, pluginName)
 */
function previewLikeCardRenderers(
  pluginName: string,
  srsState: ReturnType<typeof createInitialSrsState>
) {
  return {
    basic: previewIntervals(srsState, undefined, pluginName),
    cloze: previewIntervals(srsState, undefined, pluginName),
    direction: previewIntervals(srsState, undefined, pluginName),
    list: previewIntervals(srsState, undefined, pluginName),
    choiceDue: previewDueDates(srsState, undefined, pluginName)
  }
}

beforeEach(() => {
  clearFsrsRuntimeState()
  ;(globalThis as { orca?: unknown }).orca = {
    state: {
      plugins: {
        [PLUGIN_A]: {
          settings: {
            [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
            [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.75,
            [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 30
          }
        },
        [PLUGIN_B]: {
          settings: {
            [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
            [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.95,
            [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 200
          }
        }
      }
    },
    notify: vi.fn()
  }
})

describe("F2-08 preview pluginName harness", () => {
  it("各卡类型预览约定传入同一 pluginName 时生效参数一致", () => {
    const state = createInitialSrsState(fixedNow)
    const previews = previewLikeCardRenderers(PLUGIN_A, state)
    // 全部预览后生效参数应为 A
    expect(getEffectiveFsrsParams().requestRetention).toBe(0.75)
    expect(getEffectiveFsrsParams().maximumInterval).toBe(30)
    // 各类型调用结果一致（同一 state/now/plugin）
    expect(previews.basic).toEqual(previews.cloze)
    expect(previews.basic).toEqual(previews.direction)
    expect(previews.basic).toEqual(previews.list)
  })

  it("预览 plugin A 与正式评分 plugin A 同参；切换 B 后参数改变", () => {
    const state = createInitialSrsState(fixedNow)
    const duePreview = previewDueDates(state, fixedNow, PLUGIN_A)
    const { state: graded } = nextReviewState(state, "good", fixedNow, PLUGIN_A)
    expect(graded.due.getTime()).toBe(duePreview.good.getTime())
    expect(getEffectiveFsrsParams().requestRetention).toBe(0.75)

    nextReviewState(state, "good", fixedNow, PLUGIN_B)
    expect(getEffectiveFsrsParams().requestRetention).toBe(0.95)
    expect(getEffectiveFsrsParams().maximumInterval).toBe(200)
  })

  it("源码约定：preview 第三参为 pluginName（防回归空调用）", async () => {
    // 读取组件源文件，确保关键路径包含 pluginName 传参
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const root = path.resolve(import.meta.dirname, "../components")
    const files = [
      "SrsCardDemo.tsx",
      "ClozeCardReviewRenderer.tsx",
      "DirectionCardReviewRenderer.tsx",
      "ListCardReviewRenderer.tsx",
      "ChoiceCardReviewRenderer.tsx"
    ]
    for (const file of files) {
      const src = await fs.readFile(path.join(root, file), "utf8")
      expect(src, file).toMatch(/preview(Intervals|DueDates)\([^)]*pluginName/)
    }
  })
})
