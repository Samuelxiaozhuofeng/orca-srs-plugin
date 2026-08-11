/**
 * F2-08：FSRS 设置纯校验与默认 patch；
 * 原生 schema 必须覆盖 REVIEW_SETTINGS_KEYS 全部 key（未注册的 key 无法持久化）。
 * 独立面板 form helper 见 reviewServiceSettings.test.ts
 */

import { describe, expect, it } from "vitest"
import { default_w } from "ts-fsrs"
import {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_FSRS_WEIGHTS_ARRAY,
  DEFAULT_MAXIMUM_INTERVAL,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_REQUEST_RETENTION,
  DEFAULT_REVIEW_CARDS_PER_DAY,
  FSRS_WEIGHTS_COUNT,
  formatFsrsIssuesMessage,
  formatFsrsWeights,
  getDefaultFsrsSettingsPatch,
  getDefaultValidatedFsrsConfig,
  isValidFsrsMaximumInterval,
  isValidFsrsRequestRetention,
  parseFsrsWeights,
  parseFsrsWeightsStrict,
  REVIEW_SETTINGS_KEYS,
  reviewSettingsSchema,
  summarizeFsrsRawValue,
  validateFsrsConfig
} from "./reviewSettingsSchema"

describe("F2-08 FSRS 权重与 default_w 一致性", () => {
  it("项目默认权重与 ts-fsrs default_w 均为 21 且数值一致", () => {
    expect(default_w.length).toBe(21)
    expect(DEFAULT_FSRS_WEIGHTS_ARRAY.length).toBe(FSRS_WEIGHTS_COUNT)
    expect(FSRS_WEIGHTS_COUNT).toBe(21)
    expect([...DEFAULT_FSRS_WEIGHTS_ARRAY]).toEqual([...default_w])
    expect(parseFsrsWeights(DEFAULT_FSRS_WEIGHTS)).toEqual([...default_w])
  })
})

describe("parseFsrsWeightsStrict / parseFsrsWeights", () => {
  it("接受恰好 21 个有限数字", () => {
    const ok = parseFsrsWeightsStrict(DEFAULT_FSRS_WEIGHTS)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.weights).toHaveLength(21)
    }
  })

  it("拒绝空字符串", () => {
    const r = parseFsrsWeightsStrict("")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/空/)
    expect(parseFsrsWeights("")).toBeUndefined()
  })

  it("拒绝仅空白", () => {
    expect(parseFsrsWeightsStrict("   ").ok).toBe(false)
  })

  it("拒绝空 token（连续逗号）", () => {
    const tokens = Array.from({ length: 21 }, (_, i) => (i === 5 ? "" : "1"))
    const r = parseFsrsWeightsStrict(tokens.join(","))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/空/)
  })

  it("拒绝 1abc（禁止 parseFloat 半解析）", () => {
    const parts = DEFAULT_FSRS_WEIGHTS.split(",")
    parts[0] = "1abc"
    const r = parseFsrsWeightsStrict(parts.join(","))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/有限数字|1abc/)
  })

  it("拒绝 Infinity / -Infinity token", () => {
    const withInf = DEFAULT_FSRS_WEIGHTS.split(",")
    withInf[0] = "Infinity"
    expect(parseFsrsWeightsStrict(withInf.join(",")).ok).toBe(false)

    withInf[0] = "-Infinity"
    expect(parseFsrsWeightsStrict(withInf.join(",")).ok).toBe(false)
  })

  it("拒绝 20 / 22 个权重", () => {
    const twenty = Array.from({ length: 20 }, () => "1").join(",")
    const twentyTwo = Array.from({ length: 22 }, () => "1").join(",")
    const r20 = parseFsrsWeightsStrict(twenty)
    const r22 = parseFsrsWeightsStrict(twentyTwo)
    expect(r20.ok).toBe(false)
    expect(r22.ok).toBe(false)
    if (!r20.ok) {
      expect(r20.reason).toMatch(/21/)
    }
  })

  it("拒绝非 string（number / null / array）", () => {
    expect(parseFsrsWeightsStrict(123 as unknown as string).ok).toBe(false)
    expect(parseFsrsWeightsStrict(null).ok).toBe(false)
    expect(parseFsrsWeightsStrict([1, 2] as unknown as string).ok).toBe(false)
  })

  it("parseFsrsWeights 兼容导出：失败 undefined，成功数组", () => {
    expect(parseFsrsWeights(DEFAULT_FSRS_WEIGHTS)).toHaveLength(21)
    expect(parseFsrsWeights("1,2,3")).toBeUndefined()
  })
})

describe("retention / maximum interval 边界", () => {
  it("retention：0.7 / 0.99 接受；边界外与非法拒绝", () => {
    expect(isValidFsrsRequestRetention(0.7)).toBe(true)
    expect(isValidFsrsRequestRetention(0.99)).toBe(true)
    expect(isValidFsrsRequestRetention(0.9)).toBe(true)

    expect(isValidFsrsRequestRetention(0.69)).toBe(false)
    expect(isValidFsrsRequestRetention(1.0)).toBe(false)
    expect(isValidFsrsRequestRetention(NaN)).toBe(false)
    expect(isValidFsrsRequestRetention(Infinity)).toBe(false)
    expect(isValidFsrsRequestRetention(-Infinity)).toBe(false)
    expect(isValidFsrsRequestRetention("0.9")).toBe(false)
  })

  it("maximum：1 / 36500 接受；0/负/小数/36501/非法拒绝", () => {
    expect(isValidFsrsMaximumInterval(1)).toBe(true)
    expect(isValidFsrsMaximumInterval(36500)).toBe(true)

    expect(isValidFsrsMaximumInterval(0)).toBe(false)
    expect(isValidFsrsMaximumInterval(-1)).toBe(false)
    expect(isValidFsrsMaximumInterval(1.5)).toBe(false)
    expect(isValidFsrsMaximumInterval(36501)).toBe(false)
    expect(isValidFsrsMaximumInterval(NaN)).toBe(false)
    expect(isValidFsrsMaximumInterval(Infinity)).toBe(false)
    expect(isValidFsrsMaximumInterval("100")).toBe(false)
  })
})

describe("validateFsrsConfig 逐项回退与 issues", () => {
  it("全合法时 issues 为空且保留输入", () => {
    const cfg = validateFsrsConfig({
      weights: DEFAULT_FSRS_WEIGHTS,
      requestRetention: 0.85,
      maximumInterval: 100
    })
    expect(cfg.issues).toHaveLength(0)
    expect(cfg.requestRetention).toBe(0.85)
    expect(cfg.maximumInterval).toBe(100)
    expect(cfg.weights).toHaveLength(21)
  })

  it("字段 undefined（未设置）静默默认且无 issues", () => {
    const cfg = validateFsrsConfig({})
    expect(cfg.issues).toHaveLength(0)
    expect(cfg.requestRetention).toBe(DEFAULT_REQUEST_RETENTION)
    expect(cfg.maximumInterval).toBe(DEFAULT_MAXIMUM_INTERVAL)
    expect(cfg.weights).toEqual([...DEFAULT_FSRS_WEIGHTS_ARRAY])
  })

  it("混合非法：逐项回退并暴露 field/reason/fallback/rawSummary", () => {
    const cfg = validateFsrsConfig({
      weights: "1,2,3",
      requestRetention: 1.0,
      maximumInterval: 0
    })
    expect(cfg.issues).toHaveLength(3)
    expect(cfg.weights).toEqual([...DEFAULT_FSRS_WEIGHTS_ARRAY])
    expect(cfg.requestRetention).toBe(DEFAULT_REQUEST_RETENTION)
    expect(cfg.maximumInterval).toBe(DEFAULT_MAXIMUM_INTERVAL)

    const byField = Object.fromEntries(cfg.issues.map((i) => [i.field, i]))
    expect(byField.fsrsWeights.reason).toMatch(/21|数量/)
    expect(byField.fsrsWeights.fallback).toMatch(/默认权重/)
    expect(byField.fsrsRequestRetention.reason).toMatch(/0\.7|0\.99|不在/)
    expect(byField.fsrsRequestRetention.fallback).toBe(
      String(DEFAULT_REQUEST_RETENTION)
    )
    expect(byField.fsrsMaximumInterval.reason).toMatch(/1|36500|不在/)
    expect(byField.fsrsMaximumInterval.fallback).toBe(
      String(DEFAULT_MAXIMUM_INTERVAL)
    )
    expect(byField.fsrsWeights.rawSummary.length).toBeGreaterThan(0)
  })

  it("NaN / Infinity retention 与 maximum 回退", () => {
    const cfg = validateFsrsConfig({
      weights: DEFAULT_FSRS_WEIGHTS,
      requestRetention: NaN,
      maximumInterval: Infinity
    })
    expect(cfg.issues.map((i) => i.field).sort()).toEqual([
      "fsrsMaximumInterval",
      "fsrsRequestRetention"
    ])
    expect(cfg.requestRetention).toBe(DEFAULT_REQUEST_RETENTION)
    expect(cfg.maximumInterval).toBe(DEFAULT_MAXIMUM_INTERVAL)
  })

  it("formatFsrsIssuesMessage 中文可读", () => {
    const cfg = validateFsrsConfig({
      weights: "",
      requestRetention: 0.5,
      maximumInterval: -3
    })
    const msg = formatFsrsIssuesMessage(cfg.issues)
    expect(msg).toMatch(/FSRS 设置无效/)
    expect(msg).toMatch(/权重|目标保留率|最大间隔/)
    expect(msg).toMatch(/已回退/)
  })

  it("getDefaultFsrsSettingsPatch 写入三项默认 key", () => {
    const patch = getDefaultFsrsSettingsPatch()
    expect(patch[REVIEW_SETTINGS_KEYS.fsrsWeights]).toBe(DEFAULT_FSRS_WEIGHTS)
    expect(patch[REVIEW_SETTINGS_KEYS.fsrsRequestRetention]).toBe(
      DEFAULT_REQUEST_RETENTION
    )
    expect(patch[REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]).toBe(
      DEFAULT_MAXIMUM_INTERVAL
    )
  })

  it("getDefaultValidatedFsrsConfig 无 issues", () => {
    const d = getDefaultValidatedFsrsConfig()
    expect(d.issues).toEqual([])
    expect(d.weightsStr).toBe(formatFsrsWeights(DEFAULT_FSRS_WEIGHTS_ARRAY))
  })

  it("summarizeFsrsRawValue 截断与特殊数字", () => {
    expect(summarizeFsrsRawValue(NaN)).toBe("NaN")
    expect(summarizeFsrsRawValue(Infinity)).toBe("Infinity")
    expect(summarizeFsrsRawValue("")).toBe('""')
    const long = "x".repeat(100)
    // JSON.stringify 包裹后仍含截断标记
    expect(summarizeFsrsRawValue(long)).toContain("…")
    expect(summarizeFsrsRawValue(long).length).toBeLessThan(long.length + 10)
  })

})

describe("原生 reviewSettingsSchema 覆盖全部 REVIEW_SETTINGS_KEYS", () => {
  // orca.plugins.setSettings 只持久化已注册进 schema 的 key：
  // 少注册一个 key = 该设置改完关窗即丢。这里逐项锁死注册与默认值。
  it("每日额度两项与 FSRS 三项均已注册，且 defaultValue 取既有默认常量", () => {
    const schema = reviewSettingsSchema as Record<
      string,
      { type: string; defaultValue: unknown }
    >
    const expected = [
      [REVIEW_SETTINGS_KEYS.newCardsPerDay, "number", DEFAULT_NEW_CARDS_PER_DAY],
      [
        REVIEW_SETTINGS_KEYS.reviewCardsPerDay,
        "number",
        DEFAULT_REVIEW_CARDS_PER_DAY
      ],
      [REVIEW_SETTINGS_KEYS.fsrsWeights, "string", DEFAULT_FSRS_WEIGHTS],
      [
        REVIEW_SETTINGS_KEYS.fsrsRequestRetention,
        "number",
        DEFAULT_REQUEST_RETENTION
      ],
      [
        REVIEW_SETTINGS_KEYS.fsrsMaximumInterval,
        "number",
        DEFAULT_MAXIMUM_INTERVAL
      ]
    ] as const
    for (const [key, type, defaultValue] of expected) {
      expect(Object.keys(schema)).toContain(key)
      expect(schema[key].type).toBe(type)
      expect(schema[key].defaultValue).toBe(defaultValue)
    }
  })

  it("REVIEW_SETTINGS_KEYS 的每个 key 都在 schema 中（防止再漏注册）", () => {
    const keys = Object.keys(reviewSettingsSchema)
    for (const key of Object.values(REVIEW_SETTINGS_KEYS)) {
      expect(keys).toContain(key)
    }
  })

  it("仍保留其它复习项与全部 key 常量 / defaults 读取路径", () => {
    expect(reviewSettingsSchema).toHaveProperty(
      REVIEW_SETTINGS_KEYS.disableNotifications
    )
    expect(reviewSettingsSchema).toHaveProperty(
      REVIEW_SETTINGS_KEYS.irItemInitialDueMode
    )
    expect(REVIEW_SETTINGS_KEYS.newCardsPerDay).toBe("review.newCardsPerDay")
    expect(REVIEW_SETTINGS_KEYS.reviewCardsPerDay).toBe(
      "review.reviewCardsPerDay"
    )
    expect(REVIEW_SETTINGS_KEYS.fsrsWeights).toBe("review.fsrsWeights")
    expect(REVIEW_SETTINGS_KEYS.fsrsRequestRetention).toBe(
      "review.fsrsRequestRetention"
    )
    expect(REVIEW_SETTINGS_KEYS.fsrsMaximumInterval).toBe(
      "review.fsrsMaximumInterval"
    )
  })
})
