/**
 * 独立服务面板「复习」页 form helper：load / 严格 parse / save
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearFsrsRuntimeState,
  getEffectiveFsrsParams,
  getFsrsInstance
} from "../algorithm"
import {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_MAXIMUM_INTERVAL,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_REQUEST_RETENTION,
  DEFAULT_REVIEW_CARDS_PER_DAY,
  REVIEW_SETTINGS_KEYS
} from "./reviewSettingsSchema"
import {
  getDefaultReviewServiceSettingsDraft,
  loadReviewServiceSettings,
  parseReviewServiceSettingsDraftStrict,
  saveReviewServiceSettingsFromForm
} from "./reviewServiceSettings"

const PLUGIN = "test-review-service-settings-plugin"

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

describe("复习服务设置 form helper", () => {
  it("loadReviewServiceSettings：合法值原样进草稿且无警告", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 15,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 80,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.85,
      // 隐藏字段即使「非默认」也不应进入草稿 / 警告
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "1,2,3",
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 0
    })
    const loaded = loadReviewServiceSettings(PLUGIN)
    expect(loaded.warningMessage).toBeNull()
    expect(loaded.issues).toHaveLength(0)
    expect(loaded.draft.newCardsPerDay).toBe("15")
    expect(loaded.draft.reviewCardsPerDay).toBe("80")
    expect(loaded.draft.requestRetention).toBe("0.85")
    expect(loaded.draft).not.toHaveProperty("weights")
    expect(loaded.draft).not.toHaveProperty("maximumInterval")
  })

  it("loadReviewServiceSettings：非法 daily/retention 可见警告 + 安全草稿", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: -1,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 1.5,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 1.5
    })
    const loaded = loadReviewServiceSettings(PLUGIN)
    expect(loaded.issues.length).toBe(3)
    expect(loaded.warningMessage).toMatch(/复习设置无效/)
    expect(loaded.draft.newCardsPerDay).toBe(String(DEFAULT_NEW_CARDS_PER_DAY))
    expect(loaded.draft.reviewCardsPerDay).toBe(
      String(DEFAULT_REVIEW_CARDS_PER_DAY)
    )
    expect(loaded.draft.requestRetention).toBe(String(DEFAULT_REQUEST_RETENTION))
  })

  it("loadReviewServiceSettings：隐藏权重非法不阻止可见三项加载、不产生面板警告", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 10,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 50,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "bad",
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: -5
    })
    const loaded = loadReviewServiceSettings(PLUGIN)
    expect(loaded.warningMessage).toBeNull()
    expect(loaded.draft.newCardsPerDay).toBe("10")
    expect(loaded.draft.reviewCardsPerDay).toBe("50")
    expect(loaded.draft.requestRetention).toBe("0.9")
  })

  it("parseReviewServiceSettingsDraftStrict：合法草稿仅产出三项 patch", () => {
    const result = parseReviewServiceSettingsDraftStrict({
      newCardsPerDay: "12",
      reviewCardsPerDay: "99",
      requestRetention: "0.88"
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.patch).toEqual({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 12,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 99,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.88
    })
    expect(result.patch).not.toHaveProperty(REVIEW_SETTINGS_KEYS.fsrsWeights)
    expect(result.patch).not.toHaveProperty(
      REVIEW_SETTINGS_KEYS.fsrsMaximumInterval
    )
    expect(Object.keys(result.patch).sort()).toEqual(
      [
        REVIEW_SETTINGS_KEYS.fsrsRequestRetention,
        REVIEW_SETTINGS_KEYS.newCardsPerDay,
        REVIEW_SETTINGS_KEYS.reviewCardsPerDay
      ].sort()
    )
  })

  it("parseReviewServiceSettingsDraftStrict：接受 0 作为合法日额度", () => {
    const result = parseReviewServiceSettingsDraftStrict({
      newCardsPerDay: "0",
      reviewCardsPerDay: "0",
      requestRetention: "0.9"
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values.newCardsPerDay).toBe(0)
    expect(result.values.reviewCardsPerDay).toBe(0)
  })

  it("parseReviewServiceSettingsDraftStrict：非法拒绝且 message 为 save 模式", () => {
    const result = parseReviewServiceSettingsDraftStrict({
      newCardsPerDay: "-3",
      reviewCardsPerDay: "10001",
      requestRetention: "2"
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/无法保存/)
    expect(result.message).not.toMatch(/已使用安全默认值/)
    expect(result.issues.length).toBe(3)
  })

  it("getDefaultReviewServiceSettingsDraft 为 30 / 200 / 0.9", () => {
    const draft = getDefaultReviewServiceSettingsDraft()
    expect(draft.newCardsPerDay).toBe(String(DEFAULT_NEW_CARDS_PER_DAY))
    expect(draft.reviewCardsPerDay).toBe(String(DEFAULT_REVIEW_CARDS_PER_DAY))
    expect(draft.requestRetention).toBe(String(DEFAULT_REQUEST_RETENTION))
  })

  it("saveReviewServiceSettingsFromForm：合法值只写三项并清理 runtime", async () => {
    const personalWeights =
      "9.9, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542"
    const { setSettings } = installOrca({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 30,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 200,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.5,
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: personalWeights,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 999
    })
    // 污染 runtime
    getFsrsInstance(PLUGIN)

    await saveReviewServiceSettingsFromForm(PLUGIN, {
      newCardsPerDay: "20",
      reviewCardsPerDay: "150",
      requestRetention: "0.75"
    })

    expect(setSettings).toHaveBeenCalledTimes(1)
    const patchArg = setSettings.mock.calls[0][2] as Record<string, unknown>
    expect(patchArg).toEqual({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 20,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 150,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.75
    })
    expect(patchArg).not.toHaveProperty(REVIEW_SETTINGS_KEYS.fsrsWeights)
    expect(patchArg).not.toHaveProperty(REVIEW_SETTINGS_KEYS.fsrsMaximumInterval)

    const settings = orca.state.plugins[PLUGIN]?.settings as
      | Record<string, unknown>
      | undefined
    expect(settings?.[REVIEW_SETTINGS_KEYS.newCardsPerDay]).toBe(20)
    expect(settings?.[REVIEW_SETTINGS_KEYS.reviewCardsPerDay]).toBe(150)
    expect(settings?.[REVIEW_SETTINGS_KEYS.fsrsRequestRetention]).toBe(0.75)
    // 个人权重与最大间隔不得被规范化或覆盖
    expect(settings?.[REVIEW_SETTINGS_KEYS.fsrsWeights]).toBe(personalWeights)
    expect(settings?.[REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]).toBe(999)

    // clearFsrsRuntimeState 后生效参数为默认，直到再次 getFsrsInstance 读 settings
    expect(getEffectiveFsrsParams().requestRetention).toBe(
      DEFAULT_REQUEST_RETENTION
    )
    getFsrsInstance(PLUGIN)
    expect(getEffectiveFsrsParams().requestRetention).toBe(0.75)
    // 个人最大间隔仍应从 settings 读入 runtime
    expect(getEffectiveFsrsParams().maximumInterval).toBe(999)
  })

  it("saveReviewServiceSettingsFromForm：非法任一可见值不调用 setSettings", async () => {
    const { setSettings } = installOrca({
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: 30,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: 200,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: DEFAULT_MAXIMUM_INTERVAL
    })

    await expect(
      saveReviewServiceSettingsFromForm(PLUGIN, {
        newCardsPerDay: "abc",
        reviewCardsPerDay: "200",
        requestRetention: "0.9"
      })
    ).rejects.toThrow(/无法保存|每日新卡/)

    expect(setSettings).not.toHaveBeenCalled()
    const settings = orca.state.plugins[PLUGIN]?.settings as
      | Record<string, unknown>
      | undefined
    expect(settings?.[REVIEW_SETTINGS_KEYS.newCardsPerDay]).toBe(30)
    expect(settings?.[REVIEW_SETTINGS_KEYS.fsrsWeights]).toBe(DEFAULT_FSRS_WEIGHTS)
  })

  it("saveReviewServiceSettingsFromForm：非法 retention 不 setSettings", async () => {
    const { setSettings } = installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9
    })
    await expect(
      saveReviewServiceSettingsFromForm(PLUGIN, {
        newCardsPerDay: "30",
        reviewCardsPerDay: "200",
        requestRetention: "0.5"
      })
    ).rejects.toThrow(/无法保存|保留率/)
    expect(setSettings).not.toHaveBeenCalled()
  })
})
