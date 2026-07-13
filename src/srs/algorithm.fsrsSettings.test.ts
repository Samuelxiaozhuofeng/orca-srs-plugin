/**
 * F2-08：算法入口只接收 validated 配置；warning 去重；预览/正式同参
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { default_w } from "ts-fsrs"
import {
  applyValidatedFsrsConfig,
  buildFsrsConfigFingerprint,
  clearFsrsRuntimeState,
  clearFsrsWarningFingerprint,
  createInitialSrsState,
  getEffectiveFsrsParams,
  getFsrsInstance,
  maybeWarnFsrsConfigIssues,
  nextReviewState,
  previewDueDates,
  previewIntervals,
  resolveAndApplyFsrsConfig
} from "./algorithm"
import {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_MAXIMUM_INTERVAL,
  DEFAULT_REQUEST_RETENTION,
  REVIEW_SETTINGS_KEYS,
  validateFsrsConfig
} from "./settings/reviewSettingsSchema"

const PLUGIN = "test-fsrs-plugin"
const fixedNow = new Date("2026-07-13T12:00:00.000Z")

function installOrca(settings: Record<string, unknown> = {}) {
  const notify = vi.fn()
  ;(globalThis as { orca?: unknown }).orca = {
    state: {
      plugins: {
        [PLUGIN]: { settings: { ...settings } }
      }
    },
    notify
  }
  return { notify }
}

beforeEach(() => {
  clearFsrsRuntimeState()
  vi.restoreAllMocks()
})

afterEach(() => {
  clearFsrsRuntimeState()
})

describe("F2-08 algorithm validated path", () => {
  it("非法权重不会成为生效参数（回退 default_w）", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "1,2,3",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 36500
    })

    getFsrsInstance(PLUGIN)
    const effective = getEffectiveFsrsParams()
    expect(effective.weights).toEqual([...default_w])
    expect(effective.requestRetention).toBe(DEFAULT_REQUEST_RETENTION)
    expect(effective.maximumInterval).toBe(DEFAULT_MAXIMUM_INTERVAL)
  })

  it("非法 retention / max 不进入生效参数", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 1.0,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 0
    })

    getFsrsInstance(PLUGIN)
    const effective = getEffectiveFsrsParams()
    expect(effective.requestRetention).toBe(DEFAULT_REQUEST_RETENTION)
    expect(effective.maximumInterval).toBe(DEFAULT_MAXIMUM_INTERVAL)
  })

  it("合法自定义 retention/max 生效", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.85,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 100
    })

    getFsrsInstance(PLUGIN)
    const effective = getEffectiveFsrsParams()
    expect(effective.requestRetention).toBe(0.85)
    expect(effective.maximumInterval).toBe(100)
  })

  it("同配置 warning 只通知一次；配置变化可再通知", () => {
    const { notify } = installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "bad",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.5,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: -1
    })

    getFsrsInstance(PLUGIN)
    getFsrsInstance(PLUGIN)
    // preview 四评分也会多次 getFsrsInstance
    previewIntervals(createInitialSrsState(fixedNow), fixedNow, PLUGIN)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toBe("warn")
    expect(String(notify.mock.calls[0][1])).toMatch(/FSRS 设置无效/)

    // 换另一份非法配置
    ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings = {
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "1abc," + Array.from({ length: 20 }, () => "1").join(","),
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 36500
    }
    getFsrsInstance(PLUGIN)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it("非法 A → 合法 → 非法 A：合法会重置去重，再次破坏必须再通知", () => {
    const illegalA = {
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "bad-A",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.5,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: -1
    }
    const legal = {
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 36500
    }
    const { notify } = installOrca(illegalA)

    getFsrsInstance(PLUGIN)
    expect(notify).toHaveBeenCalledTimes(1)

    // 修好：无 issues → 重置 fingerprint；不改 FSRS 生效值的比较逻辑
    ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings =
      legal
    getFsrsInstance(PLUGIN)
    expect(notify).toHaveBeenCalledTimes(1) // 合法不额外 warn

    // 再破坏为同一非法 A → 必须第二次 warn
    ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings =
      illegalA
    getFsrsInstance(PLUGIN)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify.mock.calls[1][0]).toBe("warn")
  })

  it("未设置（undefined 静默默认）后首次非法 A 可通知", () => {
    const { notify } = installOrca({}) // 全部 undefined → 无 issues
    getFsrsInstance(PLUGIN)
    expect(notify).not.toHaveBeenCalled()

    ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings = {
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "first-illegal",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 36500
    }
    getFsrsInstance(PLUGIN)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("notify 失败不阻止安全默认值", () => {
    const { notify } = installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "nope",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 36500
    })
    notify.mockImplementation(() => {
      throw new Error("notify down")
    })
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => getFsrsInstance(PLUGIN)).not.toThrow()
    expect(getEffectiveFsrsParams().weights).toEqual([...default_w])
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it("不同非法原值若生效参数相同，不反复重建（规范化 cache）", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "a",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 2,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: -5
    })
    getFsrsInstance(PLUGIN)
    const first = getEffectiveFsrsParams()

    ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings = {
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "b",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 3,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: -9
    }
    // 另一非法配置，生效仍为默认；instance 可不重建，但 warn 应可再触发
    clearFsrsWarningFingerprint()
    getFsrsInstance(PLUGIN)
    const second = getEffectiveFsrsParams()
    expect(second).toEqual(first)
  })

  it("preview 与 nextReviewState 同 pluginName 使用同一有效参数", () => {
    installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.8,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 50
    })

    const prev = createInitialSrsState(fixedNow)
    // 先预览（内部多次 next），再正式评分；生效参数应一致
    const preview = previewDueDates(prev, fixedNow, PLUGIN)
    const paramsAfterPreview = getEffectiveFsrsParams()
    expect(paramsAfterPreview.requestRetention).toBe(0.8)
    expect(paramsAfterPreview.maximumInterval).toBe(50)

    const { state } = nextReviewState(prev, "good", fixedNow, PLUGIN)
    const paramsAfterGrade = getEffectiveFsrsParams()
    expect(paramsAfterGrade).toEqual(paramsAfterPreview)
    // good 预览 due 与正式评分 due 一致（同实例同 fuzz 种子语义下确定性）
    expect(state.due.getTime()).toBe(preview.good.getTime())
  })

  it("clearFsrsRuntimeState 后恢复默认并清空 warning 指纹", () => {
    const { notify } = installOrca({
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: "bad",
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 0.9,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: 36500
    })
    getFsrsInstance(PLUGIN)
    expect(notify).toHaveBeenCalledTimes(1)

    clearFsrsRuntimeState()
    expect(getEffectiveFsrsParams().requestRetention).toBe(
      DEFAULT_REQUEST_RETENTION
    )
    expect(getEffectiveFsrsParams().weights).toEqual([...default_w])

    // 指纹已清：同一非法配置可再 warn
    getFsrsInstance(PLUGIN)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it("resolveAndApplyFsrsConfig 纯 raw 路径与 fingerprint 稳定", () => {
    const raw = {
      weights: "x",
      requestRetention: 0.5,
      maximumInterval: 0
    }
    const cfg = validateFsrsConfig(raw)
    const fp1 = buildFsrsConfigFingerprint(raw, cfg.issues)
    const fp2 = buildFsrsConfigFingerprint(raw, cfg.issues)
    expect(fp1).toBe(fp2)

    const { notify } = installOrca()
    maybeWarnFsrsConfigIssues(cfg, fp1)
    maybeWarnFsrsConfigIssues(cfg, fp1)
    expect(notify).toHaveBeenCalledTimes(1)

    applyValidatedFsrsConfig(cfg)
    expect(getEffectiveFsrsParams().requestRetention).toBe(
      DEFAULT_REQUEST_RETENTION
    )
  })

  it("warn:false 时不 notify 仍应用安全默认", () => {
    const { notify } = installOrca()
    resolveAndApplyFsrsConfig(
      { weights: "bad", requestRetention: 9, maximumInterval: -1 },
      { warn: false }
    )
    expect(notify).not.toHaveBeenCalled()
    expect(getEffectiveFsrsParams().weights).toEqual([...default_w])
  })
})
