/**
 * 服务面板进阶字段的 load / 严格 parse / save。
 *
 * 五项仍写 plugin settings 原 key（与原生设置页同一份数据）：
 * FSRS 权重、最大间隔、图片遮罩模式、关闭通知、IR 源记忆卡首次学习时间。
 * 校验全部复用 reviewSettingsSchema 的解析与区间，本模块不另造常量。
 */

import { clearFsrsRuntimeState } from "../algorithm"
import {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_IMAGE_OCCLUSION_MODE,
  DEFAULT_IR_ITEM_INITIAL_DUE_MODE,
  DEFAULT_MAXIMUM_INTERVAL,
  FSRS_MAXIMUM_INTERVAL_MAX,
  FSRS_MAXIMUM_INTERVAL_MIN,
  formatFsrsWeights,
  isImageOcclusionMode,
  isValidFsrsMaximumInterval,
  parseFsrsWeightsStrict,
  parseImageOcclusionMode,
  parseIrItemInitialDueMode,
  REVIEW_SETTINGS_KEYS,
  summarizeFsrsRawValue,
  type ImageOcclusionModeSetting,
  type IrItemInitialDueModeSetting
} from "./reviewSettingsSchema"

/** 服务面板进阶字段草稿（数值用字符串便于 input 双向绑定） */
export type ReviewAdvancedSettingsDraft = {
  fsrsWeights: string
  fsrsMaximumInterval: string
  imageOcclusionMode: ImageOcclusionModeSetting
  disableNotifications: boolean
  irItemInitialDueMode: IrItemInitialDueModeSetting
}

export type ReviewAdvancedSettingField =
  | "fsrsWeights"
  | "fsrsMaximumInterval"
  | "imageOcclusionMode"
  | "disableNotifications"
  | "irItemInitialDueMode"

export type ReviewAdvancedSettingIssue = {
  readonly field: ReviewAdvancedSettingField
  readonly rawSummary: string
  readonly reason: string
  readonly fallback: string
}

export type ReviewAdvancedSettingsLoadResult = {
  readonly draft: ReviewAdvancedSettingsDraft
  readonly issues: readonly ReviewAdvancedSettingIssue[]
  readonly warningMessage: string | null
}

export type ReviewAdvancedSettingsParseResult =
  | {
      readonly ok: true
      readonly patch: Record<string, string | number | boolean>
      readonly values: {
        readonly fsrsWeights: string
        readonly fsrsMaximumInterval: number
        readonly imageOcclusionMode: ImageOcclusionModeSetting
        readonly disableNotifications: boolean
        readonly irItemInitialDueMode: IrItemInitialDueModeSetting
      }
    }
  | {
      readonly ok: false
      readonly message: string
      readonly issues: readonly ReviewAdvancedSettingIssue[]
    }

function fieldLabel(field: ReviewAdvancedSettingField): string {
  switch (field) {
    case "fsrsWeights":
      return "FSRS 权重"
    case "fsrsMaximumInterval":
      return "最大间隔"
    case "imageOcclusionMode":
      return "图片遮罩复习模式"
    case "disableNotifications":
      return "关闭通知提醒"
    case "irItemInitialDueMode":
      return "IR 源记忆卡首次学习时间"
    default:
      return field
  }
}

function formatIssuesMessage(
  issues: readonly ReviewAdvancedSettingIssue[],
  mode: "runtime" | "save"
): string {
  if (issues.length === 0) return ""
  const parts = issues.map((issue) =>
    mode === "save"
      ? `${fieldLabel(issue.field)}：${issue.reason}（当前值 ${issue.rawSummary}）`
      : `${fieldLabel(issue.field)}：${issue.reason}（已回退 ${issue.fallback}；原值 ${issue.rawSummary}）`
  )
  if (mode === "save") {
    return `进阶复习设置无效，无法保存。${parts.join("；")}`
  }
  return `进阶复习设置无效，已使用安全默认值。${parts.join("；")}`
}

function parseMaximumIntervalInput(raw: string): unknown {
  const trim = raw.trim()
  if (trim === "") return ""
  const n = Number(trim)
  return Number.isFinite(n) ? n : raw
}

function maximumIntervalRejectReason(raw: unknown): string {
  if (typeof raw !== "number") {
    return `仅接受 ${FSRS_MAXIMUM_INTERVAL_MIN}–${FSRS_MAXIMUM_INTERVAL_MAX} 的有限整数`
  }
  if (!Number.isFinite(raw)) {
    return "不是有限数字（拒绝 NaN / Infinity）"
  }
  if (!Number.isInteger(raw)) {
    return `必须是整数（收到 ${raw}）`
  }
  return `必须落在 ${FSRS_MAXIMUM_INTERVAL_MIN}–${FSRS_MAXIMUM_INTERVAL_MAX} 之间（收到 ${raw}）`
}

function isIrItemInitialDueMode(
  raw: unknown
): raw is IrItemInitialDueModeSetting {
  return raw === parseIrItemInitialDueMode(raw)
}

/** 恢复默认按钮用的草稿（仅更新 UI，不写盘） */
export function getDefaultReviewAdvancedSettingsDraft(): ReviewAdvancedSettingsDraft {
  return {
    fsrsWeights: DEFAULT_FSRS_WEIGHTS,
    fsrsMaximumInterval: String(DEFAULT_MAXIMUM_INTERVAL),
    imageOcclusionMode: DEFAULT_IMAGE_OCCLUSION_MODE,
    disableNotifications: false,
    irItemInitialDueMode: DEFAULT_IR_ITEM_INITIAL_DUE_MODE
  }
}

/**
 * 从 plugin settings 加载进阶五项。
 * 表单填入安全生效值；非法旧值 → issues / warningMessage 必须可见。
 */
export function loadReviewAdvancedSettings(
  pluginName: string
): ReviewAdvancedSettingsLoadResult {
  const settings = orca.state.plugins[pluginName]?.settings
  const rawWeights = settings?.[REVIEW_SETTINGS_KEYS.fsrsWeights]
  const rawMax = settings?.[REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]
  const rawIo = settings?.[REVIEW_SETTINGS_KEYS.imageOcclusionMode]
  const rawNotify = settings?.[REVIEW_SETTINGS_KEYS.disableNotifications]
  const rawIrDue = settings?.[REVIEW_SETTINGS_KEYS.irItemInitialDueMode]

  const issues: ReviewAdvancedSettingIssue[] = []

  let fsrsWeights = DEFAULT_FSRS_WEIGHTS
  if (rawWeights === undefined) {
    fsrsWeights = DEFAULT_FSRS_WEIGHTS
  } else {
    const parsed = parseFsrsWeightsStrict(rawWeights)
    if (parsed.ok) {
      fsrsWeights =
        typeof rawWeights === "string" ? rawWeights : formatFsrsWeights(parsed.weights)
    } else {
      issues.push({
        field: "fsrsWeights",
        rawSummary: summarizeFsrsRawValue(rawWeights),
        reason: parsed.reason,
        fallback: "默认权重（21 个）"
      })
    }
  }

  let fsrsMaximumInterval = DEFAULT_MAXIMUM_INTERVAL
  if (rawMax === undefined) {
    fsrsMaximumInterval = DEFAULT_MAXIMUM_INTERVAL
  } else if (isValidFsrsMaximumInterval(rawMax)) {
    fsrsMaximumInterval = rawMax
  } else {
    issues.push({
      field: "fsrsMaximumInterval",
      rawSummary: summarizeFsrsRawValue(rawMax),
      reason: maximumIntervalRejectReason(rawMax),
      fallback: String(DEFAULT_MAXIMUM_INTERVAL)
    })
  }

  let imageOcclusionMode = DEFAULT_IMAGE_OCCLUSION_MODE
  if (rawIo === undefined) {
    imageOcclusionMode = DEFAULT_IMAGE_OCCLUSION_MODE
  } else if (isImageOcclusionMode(rawIo)) {
    imageOcclusionMode = rawIo
  } else {
    imageOcclusionMode = parseImageOcclusionMode(rawIo)
    issues.push({
      field: "imageOcclusionMode",
      rawSummary: summarizeFsrsRawValue(rawIo),
      reason: "只接受「题面只遮当前 / 题面全遮只揭当前 / 题面全遮全部揭开」",
      fallback: imageOcclusionMode
    })
  }

  let disableNotifications = false
  if (rawNotify === undefined) {
    disableNotifications = false
  } else if (rawNotify === true || rawNotify === false) {
    disableNotifications = rawNotify
  } else {
    issues.push({
      field: "disableNotifications",
      rawSummary: summarizeFsrsRawValue(rawNotify),
      reason: "只接受开或关",
      fallback: "关（仍显示通知）"
    })
  }

  let irItemInitialDueMode = DEFAULT_IR_ITEM_INITIAL_DUE_MODE
  if (rawIrDue === undefined) {
    irItemInitialDueMode = DEFAULT_IR_ITEM_INITIAL_DUE_MODE
  } else if (isIrItemInitialDueMode(rawIrDue)) {
    irItemInitialDueMode = rawIrDue
  } else {
    issues.push({
      field: "irItemInitialDueMode",
      rawSummary: summarizeFsrsRawValue(rawIrDue),
      reason: "只接受「分散到约 1–14 天后 / 今天 / 明天」",
      fallback: DEFAULT_IR_ITEM_INITIAL_DUE_MODE
    })
    irItemInitialDueMode = DEFAULT_IR_ITEM_INITIAL_DUE_MODE
  }

  const draft: ReviewAdvancedSettingsDraft = {
    fsrsWeights,
    fsrsMaximumInterval: String(fsrsMaximumInterval),
    imageOcclusionMode,
    disableNotifications,
    irItemInitialDueMode
  }

  if (issues.length === 0) {
    return { draft, issues: [], warningMessage: null }
  }
  return {
    draft,
    issues,
    warningMessage: formatIssuesMessage(issues, "runtime")
  }
}

/**
 * 严格解析进阶草稿：任一字段非法则失败（保存路径禁止回退写盘）。
 */
export function parseReviewAdvancedSettingsDraftStrict(
  draft: ReviewAdvancedSettingsDraft
): ReviewAdvancedSettingsParseResult {
  const issues: ReviewAdvancedSettingIssue[] = []

  const weightsParse = parseFsrsWeightsStrict(draft.fsrsWeights)
  let fsrsWeights = DEFAULT_FSRS_WEIGHTS
  if (!weightsParse.ok) {
    issues.push({
      field: "fsrsWeights",
      rawSummary: summarizeFsrsRawValue(draft.fsrsWeights),
      reason: weightsParse.reason,
      fallback: "默认权重（21 个）"
    })
  } else {
    fsrsWeights = formatFsrsWeights(weightsParse.weights)
  }

  const rawMax = parseMaximumIntervalInput(draft.fsrsMaximumInterval)
  let fsrsMaximumInterval = DEFAULT_MAXIMUM_INTERVAL
  if (!isValidFsrsMaximumInterval(rawMax)) {
    issues.push({
      field: "fsrsMaximumInterval",
      rawSummary: summarizeFsrsRawValue(
        draft.fsrsMaximumInterval.trim() === "" ? "" : rawMax
      ),
      reason: maximumIntervalRejectReason(rawMax),
      fallback: String(DEFAULT_MAXIMUM_INTERVAL)
    })
  } else {
    fsrsMaximumInterval = rawMax
  }

  let imageOcclusionMode = DEFAULT_IMAGE_OCCLUSION_MODE
  if (!isImageOcclusionMode(draft.imageOcclusionMode)) {
    issues.push({
      field: "imageOcclusionMode",
      rawSummary: summarizeFsrsRawValue(draft.imageOcclusionMode),
      reason: "只接受「题面只遮当前 / 题面全遮只揭当前 / 题面全遮全部揭开」",
      fallback: DEFAULT_IMAGE_OCCLUSION_MODE
    })
  } else {
    imageOcclusionMode = draft.imageOcclusionMode
  }

  let disableNotifications = false
  if (
    draft.disableNotifications !== true &&
    draft.disableNotifications !== false
  ) {
    issues.push({
      field: "disableNotifications",
      rawSummary: summarizeFsrsRawValue(draft.disableNotifications),
      reason: "只接受开或关",
      fallback: "关（仍显示通知）"
    })
  } else {
    disableNotifications = draft.disableNotifications
  }

  let irItemInitialDueMode = DEFAULT_IR_ITEM_INITIAL_DUE_MODE
  if (!isIrItemInitialDueMode(draft.irItemInitialDueMode)) {
    issues.push({
      field: "irItemInitialDueMode",
      rawSummary: summarizeFsrsRawValue(draft.irItemInitialDueMode),
      reason: "只接受「分散到约 1–14 天后 / 今天 / 明天」",
      fallback: DEFAULT_IR_ITEM_INITIAL_DUE_MODE
    })
  } else {
    irItemInitialDueMode = draft.irItemInitialDueMode
  }

  if (issues.length > 0) {
    return {
      ok: false,
      message: formatIssuesMessage(issues, "save"),
      issues
    }
  }

  return {
    ok: true,
    patch: {
      [REVIEW_SETTINGS_KEYS.fsrsWeights]: fsrsWeights,
      [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: fsrsMaximumInterval,
      [REVIEW_SETTINGS_KEYS.imageOcclusionMode]: imageOcclusionMode,
      [REVIEW_SETTINGS_KEYS.disableNotifications]: disableNotifications,
      [REVIEW_SETTINGS_KEYS.irItemInitialDueMode]: irItemInitialDueMode
    },
    values: {
      fsrsWeights,
      fsrsMaximumInterval,
      imageOcclusionMode,
      disableNotifications,
      irItemInitialDueMode
    }
  }
}

/**
 * 将合法进阶草稿写回 plugin settings，并清理 FSRS runtime cache
 * （使权重 / 最大间隔立即被下次 getFsrsInstance 重读）。
 * 非法时抛错且不调用 setSettings。
 */
export async function saveReviewAdvancedSettingsFromForm(
  pluginName: string,
  draft: ReviewAdvancedSettingsDraft
): Promise<{
  fsrsWeights: string
  fsrsMaximumInterval: number
  imageOcclusionMode: ImageOcclusionModeSetting
  disableNotifications: boolean
  irItemInitialDueMode: IrItemInitialDueModeSetting
}> {
  const parsed = parseReviewAdvancedSettingsDraftStrict(draft)
  if (!parsed.ok) {
    throw new Error(parsed.message)
  }
  await orca.plugins.setSettings("app", pluginName, parsed.patch)
  clearFsrsRuntimeState()
  return parsed.values
}
