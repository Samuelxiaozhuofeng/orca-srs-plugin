/**
 * ReviewGradeButtons 纯逻辑与源码契约（不依赖 React 渲染）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  FOUR_GRADE_BUTTONS,
  PASS_FAIL_BUTTONS,
  resolveGradeButtonList,
  resolveReviewGradeUiOptions
} from "./reviewGradeButtonsLogic"
import {
  getReviewUiDisplayRevision,
  getReviewUiDisplaySettings,
  notifyReviewUiDisplaySettingsChanged,
  REVIEW_UI_DISPLAY_KEYS,
  saveReviewServiceSettingsFromForm,
  subscribeReviewUiDisplaySettings
} from "../../srs/settings/reviewServiceSettings"
import { clearFsrsRuntimeState } from "../../srs/algorithm"
import {
  DEFAULT_REQUEST_RETENTION,
  REVIEW_SETTINGS_KEYS
} from "../../srs/settings/reviewSettingsSchema"

const PLUGIN = "test-review-grade-buttons-plugin"

function installOrca(settings: Record<string, unknown> = {}) {
  const setSettings = vi.fn(
    async (_to: string, _name: string, patch: Record<string, unknown>) => {
      const prev = (orca.state.plugins[PLUGIN]?.settings ?? {}) as Record<
        string,
        unknown
      >
      ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings =
        {
          ...prev,
          ...patch
        }
    }
  )
  ;(globalThis as { orca?: unknown }).orca = {
    state: {
      plugins: {
        [PLUGIN]: { settings: { ...settings } }
      }
    },
    plugins: { setSettings },
    notify: vi.fn()
  }
  return { setSettings }
}

beforeEach(() => {
  clearFsrsRuntimeState()
  vi.restoreAllMocks()
})

afterEach(() => {
  clearFsrsRuntimeState()
})

describe("resolveGradeButtonList", () => {
  it("默认四级：again/hard/good/easy", () => {
    const list = resolveGradeButtonList(false)
    expect(list).toBe(FOUR_GRADE_BUTTONS)
    expect(list.map((b) => b.grade)).toEqual([
      "again",
      "hard",
      "good",
      "easy"
    ])
  })

  it("Pass/Fail 仅 again + good，标签为失败/通过", () => {
    const list = resolveGradeButtonList(true)
    expect(list).toBe(PASS_FAIL_BUTTONS)
    expect(list.map((b) => b.grade)).toEqual(["again", "good"])
    expect(list.map((b) => b.label)).toEqual(["失败", "通过"])
    expect(list.some((b) => b.grade === "hard" || b.grade === "easy")).toBe(
      false
    )
  })
})

describe("resolveReviewGradeUiOptions", () => {
  it("无 pluginName 时两项默认 false", () => {
    expect(resolveReviewGradeUiOptions({})).toEqual({
      passFailButtons: false,
      showNextReviewTime: false
    })
  })

  it("从 settings 读取；显式 prop 覆盖", () => {
    installOrca({
      [REVIEW_UI_DISPLAY_KEYS.passFailButtons]: true,
      [REVIEW_UI_DISPLAY_KEYS.showNextReviewTime]: true
    })
    expect(
      resolveReviewGradeUiOptions({ pluginName: PLUGIN })
    ).toEqual({
      passFailButtons: true,
      showNextReviewTime: true
    })
    expect(
      resolveReviewGradeUiOptions({
        pluginName: PLUGIN,
        passFailButtons: false,
        showNextReviewTime: false
      })
    ).toEqual({
      passFailButtons: false,
      showNextReviewTime: false
    })
  })
})

describe("notifyReviewUiDisplaySettingsChanged", () => {
  it("保存后 revision 递增并通知订阅者", async () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 30,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 200,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: DEFAULT_REQUEST_RETENTION
    })
    const before = getReviewUiDisplayRevision()
    const listener = vi.fn()
    const unsub = subscribeReviewUiDisplaySettings(listener)

    await saveReviewServiceSettingsFromForm(PLUGIN, {
      newCardsPerDay: "30",
      reviewCardsPerDay: "200",
      requestRetention: String(DEFAULT_REQUEST_RETENTION),
      passFailButtons: true,
      showNextReviewTime: true
    })

    expect(getReviewUiDisplayRevision()).toBe(before + 1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getReviewUiDisplaySettings(PLUGIN)).toEqual({
      passFailButtons: true,
      showNextReviewTime: true
    })
    unsub()
    notifyReviewUiDisplaySettingsChanged()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe("选择题源码契约：强制四级评分", () => {
  it("ChoiceCardReviewRenderer 显式 passFailButtons={false}", () => {
    const src = readFileSync(
      join(__dirname, "../ChoiceCardReviewRenderer.tsx"),
      "utf8"
    )
    expect(src).toContain("passFailButtons: false")
    expect(src).toContain("passFailButtons={false}")
    expect(src).toMatch(/选择题始终四级|强制四级|不用 Pass\/Fail/)
  })
})
