/**
 * 服务面板进阶字段：load / 严格 parse / save
 *
 * REVIEW_SETTINGS_KEYS 必须仍在 reviewSettingsSchema 注册的锁死断言
 * 见 reviewSettingsSchema.test.ts
 * 「原生 reviewSettingsSchema 覆盖全部 REVIEW_SETTINGS_KEYS」。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearFsrsRuntimeState,
  getEffectiveFsrsParams,
  getFsrsInstance
} from "../algorithm"
import {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_IMAGE_OCCLUSION_MODE,
  DEFAULT_IR_ITEM_INITIAL_DUE_MODE,
  DEFAULT_MAXIMUM_INTERVAL,
  FSRS_MAXIMUM_INTERVAL_MAX,
  FSRS_MAXIMUM_INTERVAL_MIN,
  REVIEW_SETTINGS_KEYS,
  formatFsrsWeights,
  parseFsrsWeightsStrict
} from "./reviewSettingsSchema"
import {
  getDefaultReviewAdvancedSettingsDraft,
  loadReviewAdvancedSettings,
  parseReviewAdvancedSettingsDraftStrict,
  saveReviewAdvancedSettingsFromForm,
  type ReviewAdvancedSettingsDraft
} from "./reviewAdvancedSettings"

const PLUGIN = "test-review-advanced-settings-plugin"

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

function defaultDraft(
  overrides: Partial<ReviewAdvancedSettingsDraft> = {}
): ReviewAdvancedSettingsDraft {
  return {
    ...getDefaultReviewAdvancedSettingsDraft(),
    ...overrides
  }
}

function twentyOneWeights(first: string): string {
  const parsed = parseFsrsWeightsStrict(DEFAULT_FSRS_WEIGHTS)
  if (!parsed.ok) throw new Error(parsed.reason)
  const next = [...parsed.weights]
  next[0] = Number(first)
  return formatFsrsWeights(next)
}

beforeEach(() => {
  clearFsrsRuntimeState()
  vi.restoreAllMocks()
})

afterEach(() => {
  clearFsrsRuntimeState()
})

describe("parseReviewAdvancedSettingsDraftStrict", () => {
  it("21 个合法权重解析成功", () => {
    const result = parseReviewAdvancedSettingsDraftStrict(defaultDraft())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values.fsrsWeights).toBe(
      formatFsrsWeights(
        (parseFsrsWeightsStrict(DEFAULT_FSRS_WEIGHTS) as { weights: number[] })
          .weights
      )
    )
    expect(result.patch[REVIEW_SETTINGS_KEYS.fsrsWeights]).toBe(
      result.values.fsrsWeights
    )
  })

  it("20 个权重拒绝并给出可读消息", () => {
    const twenty = Array.from({ length: 20 }, () => "1").join(", ")
    const result = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({ fsrsWeights: twenty })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/无法保存/)
    expect(result.message).toMatch(/21|数量/)
    expect(result.issues[0]?.field).toBe("fsrsWeights")
  })

  it("22 个权重拒绝并给出可读消息", () => {
    const twentyTwo = Array.from({ length: 22 }, () => "1").join(", ")
    const result = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({ fsrsWeights: twentyTwo })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/无法保存/)
    expect(result.message).toMatch(/21|数量/)
    expect(result.issues[0]?.reason).toMatch(/22/)
  })

  it("含非数字权重拒绝并指出第几项", () => {
    const tokens = Array.from({ length: 21 }, () => "1")
    tokens[3] = "abc"
    const result = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({ fsrsWeights: tokens.join(", ") })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/第 4 个/)
    expect(result.message).toMatch(/有限数字|abc/)
  })

  it("最大间隔下界-1 拒绝", () => {
    const result = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({
        fsrsMaximumInterval: String(FSRS_MAXIMUM_INTERVAL_MIN - 1)
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/最大间隔/)
    expect(result.message).toMatch(String(FSRS_MAXIMUM_INTERVAL_MIN))
  })

  it("最大间隔上界+1 拒绝", () => {
    const result = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({
        fsrsMaximumInterval: String(FSRS_MAXIMUM_INTERVAL_MAX + 1)
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/最大间隔/)
    expect(result.message).toMatch(String(FSRS_MAXIMUM_INTERVAL_MAX))
  })

  it("最大间隔小数拒绝", () => {
    const result = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({ fsrsMaximumInterval: "10.5" })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/最大间隔/)
    expect(result.message).toMatch(/整数/)
  })

  it("两个枚举传非法字符串时 parse 拒绝", () => {
    const io = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({
        imageOcclusionMode: "not-a-mode" as ReviewAdvancedSettingsDraft["imageOcclusionMode"]
      })
    )
    expect(io.ok).toBe(false)
    if (!io.ok) {
      expect(io.message).toMatch(/图片遮罩/)
      expect(io.message).toMatch(/无法保存/)
    }

    const due = parseReviewAdvancedSettingsDraftStrict(
      defaultDraft({
        irItemInitialDueMode:
          "next-week" as ReviewAdvancedSettingsDraft["irItemInitialDueMode"]
      })
    )
    expect(due.ok).toBe(false)
    if (!due.ok) {
      expect(due.message).toMatch(/首次学习时间/)
      expect(due.message).toMatch(/无法保存/)
    }
  })
})

describe("loadReviewAdvancedSettings", () => {
  it("读到空 settings 时全部拿到 schema defaultValue", () => {
    installOrca({})
    const loaded = loadReviewAdvancedSettings(PLUGIN)
    expect(loaded.warningMessage).toBeNull()
    expect(loaded.issues).toHaveLength(0)
    expect(loaded.draft).toEqual(getDefaultReviewAdvancedSettingsDraft())
    expect(loaded.draft.fsrsWeights).toBe(DEFAULT_FSRS_WEIGHTS)
    expect(loaded.draft.fsrsMaximumInterval).toBe(String(DEFAULT_MAXIMUM_INTERVAL))
    expect(loaded.draft.imageOcclusionMode).toBe(DEFAULT_IMAGE_OCCLUSION_MODE)
    expect(loaded.draft.disableNotifications).toBe(false)
    expect(loaded.draft.irItemInitialDueMode).toBe(DEFAULT_IR_ITEM_INITIAL_DUE_MODE)
  })

  it("合法存值原样进草稿且无警告", () => {
    const weights = twentyOneWeights("0.5")
    installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: weights,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 100,
      [REVIEW_SETTINGS_KEYS.imageOcclusionMode]: "hideAll",
      [REVIEW_SETTINGS_KEYS.disableNotifications]: true,
      [REVIEW_SETTINGS_KEYS.irItemInitialDueMode]: "tomorrow"
    })
    const loaded = loadReviewAdvancedSettings(PLUGIN)
    expect(loaded.warningMessage).toBeNull()
    expect(loaded.draft.fsrsWeights).toBe(weights)
    expect(loaded.draft.fsrsMaximumInterval).toBe("100")
    expect(loaded.draft.imageOcclusionMode).toBe("hideAll")
    expect(loaded.draft.disableNotifications).toBe(true)
    expect(loaded.draft.irItemInitialDueMode).toBe("tomorrow")
  })

  it("两个枚举非法字符串时回落默认并产出 issue", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.imageOcclusionMode]: "banana",
      [REVIEW_SETTINGS_KEYS.irItemInitialDueMode]: "next-week"
    })
    const loaded = loadReviewAdvancedSettings(PLUGIN)
    expect(loaded.issues.length).toBe(2)
    expect(loaded.warningMessage).toMatch(/已使用安全默认值/)
    expect(loaded.draft.imageOcclusionMode).toBe(DEFAULT_IMAGE_OCCLUSION_MODE)
    expect(loaded.draft.irItemInitialDueMode).toBe(
      DEFAULT_IR_ITEM_INITIAL_DUE_MODE
    )
    expect(loaded.issues.map((issue) => issue.field).sort()).toEqual([
      "imageOcclusionMode",
      "irItemInitialDueMode"
    ])
  })

  it("非法权重与越界最大间隔回落默认并产出 issue", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "1,2,3",
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 0
    })
    const loaded = loadReviewAdvancedSettings(PLUGIN)
    expect(loaded.issues.length).toBe(2)
    expect(loaded.warningMessage).toMatch(/FSRS 权重|最大间隔/)
    expect(loaded.draft.fsrsWeights).toBe(DEFAULT_FSRS_WEIGHTS)
    expect(loaded.draft.fsrsMaximumInterval).toBe(
      String(DEFAULT_MAXIMUM_INTERVAL)
    )
  })
})

describe("saveReviewAdvancedSettingsFromForm", () => {
  it("合法草稿只写进阶五项并清理 FSRS runtime", async () => {
    const weights = twentyOneWeights("0.5")
    const { setSettings } = installOrca({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 15,
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: DEFAULT_MAXIMUM_INTERVAL
    })
    getFsrsInstance(PLUGIN)

    await saveReviewAdvancedSettingsFromForm(
      PLUGIN,
      defaultDraft({
        fsrsWeights: weights,
        fsrsMaximumInterval: "90",
        imageOcclusionMode: "hideAllRevealAll",
        disableNotifications: true,
        irItemInitialDueMode: "today"
      })
    )

    expect(setSettings).toHaveBeenCalledTimes(1)
    const patchArg = setSettings.mock.calls[0][2] as Record<string, unknown>
    expect(Object.keys(patchArg).sort()).toEqual(
      [
        REVIEW_SETTINGS_KEYS.disableNotifications,
        REVIEW_SETTINGS_KEYS.fsrsMaximumInterval,
        REVIEW_SETTINGS_KEYS.fsrsWeights,
        REVIEW_SETTINGS_KEYS.imageOcclusionMode,
        REVIEW_SETTINGS_KEYS.irItemInitialDueMode
      ].sort()
    )
    expect(patchArg).not.toHaveProperty(REVIEW_SETTINGS_KEYS.newCardsPerDay)
    expect(patchArg[REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]).toBe(90)
    expect(patchArg[REVIEW_SETTINGS_KEYS.imageOcclusionMode]).toBe(
      "hideAllRevealAll"
    )

    const settings = orca.state.plugins[PLUGIN]?.settings as Record<
      string,
      unknown
    >
    expect(settings[REVIEW_SETTINGS_KEYS.newCardsPerDay]).toBe(15)
    expect(getEffectiveFsrsParams().maximumInterval).toBe(DEFAULT_MAXIMUM_INTERVAL)
    getFsrsInstance(PLUGIN)
    expect(getEffectiveFsrsParams().maximumInterval).toBe(90)
    expect(getEffectiveFsrsParams().weights[0]).toBe(0.5)
  })

  it("非法草稿不调用 setSettings", async () => {
    const { setSettings } = installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS
    })
    await expect(
      saveReviewAdvancedSettingsFromForm(
        PLUGIN,
        defaultDraft({ fsrsWeights: "1,2" })
      )
    ).rejects.toThrow(/无法保存|权重/)
    expect(setSettings).not.toHaveBeenCalled()
  })
})
