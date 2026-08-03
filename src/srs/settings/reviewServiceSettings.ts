/**
 * 独立服务面板「复习」页表单：load / 严格 parse / save。
 *
 * 可见数值三项：每日新卡上限、每日复习上限、目标记忆保留率。
 * 存储仍用 plugin settings 原 key（`review.newCardsPerDay` /
 * `review.reviewCardsPerDay` / `review.fsrsRequestRetention`）。
 *
 * 复习界面两项（默认均关闭，仅影响 UI，不改 FSRS 排期）：
 * - `review.passFailButtons`：仅失败 / 通过两键
 * - `review.showNextReviewTime`：按钮上方显示下次复习时间
 *
 * 权重与最大间隔**不**进入本表单草稿、不显示、普通保存不写回；
 * 仍由 algorithm runtime / 恢复 FSRS 默认命令读写。
 *
 * 额度规则复用 `reviewSessionBudget`；retention 规则复用
 * `reviewSettingsSchema` 的严格区间，本模块不另造范围常量。
 */

import { clearFsrsRuntimeState } from "../algorithm"
import {
  isValidDailyCardLimit,
  MAX_DAILY_CARD_LIMIT
} from "../reviewSessionBudget"
import {
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_REQUEST_RETENTION,
  DEFAULT_REVIEW_CARDS_PER_DAY,
  FSRS_REQUEST_RETENTION_MAX,
  FSRS_REQUEST_RETENTION_MIN,
  isValidFsrsRequestRetention,
  REVIEW_SETTINGS_KEYS
} from "./reviewSettingsSchema"

/** 复习界面显示偏好（plugin settings key，默认均为 false） */
export const REVIEW_UI_DISPLAY_KEYS = {
  passFailButtons: "review.passFailButtons",
  showNextReviewTime: "review.showNextReviewTime"
} as const

export const DEFAULT_PASS_FAIL_BUTTONS = false
export const DEFAULT_SHOW_NEXT_REVIEW_TIME = false

/** 复习页表单草稿（数值用字符串便于 input 双向绑定；开关为 boolean） */
export type ReviewServiceSettingsDraft = {
  newCardsPerDay: string
  reviewCardsPerDay: string
  requestRetention: string
  /** 仅显示失败 / 通过（映射 again / good） */
  passFailButtons: boolean
  /** 按钮上方显示下次复习时间 */
  showNextReviewTime: boolean
}

/** 复习界面运行时读取（评分按钮 / 快捷键） */
export type ReviewUiDisplaySettings = {
  readonly passFailButtons: boolean
  readonly showNextReviewTime: boolean
}

/** 可见字段校验问题（仅三项数值，不含 weights / maximumInterval / UI 开关） */
export type ReviewServiceSettingIssue = {
  readonly field:
    | "newCardsPerDay"
    | "reviewCardsPerDay"
    | "fsrsRequestRetention"
  readonly rawSummary: string
  readonly reason: string
  readonly fallback: string
}

/** 打开面板时：安全生效草稿 + 非法旧配置可见警告 */
export type ReviewServiceSettingsLoadResult = {
  readonly draft: ReviewServiceSettingsDraft
  readonly issues: readonly ReviewServiceSettingIssue[]
  readonly warningMessage: string | null
}

/** 严格解析结果：合法则带可见项 patch；非法则不写盘 */
export type ReviewServiceSettingsParseResult =
  | {
      readonly ok: true
      readonly patch: Record<string, number | boolean>
      readonly values: {
        readonly newCardsPerDay: number
        readonly reviewCardsPerDay: number
        readonly requestRetention: number
        readonly passFailButtons: boolean
        readonly showNextReviewTime: boolean
      }
    }
  | {
      readonly ok: false
      readonly message: string
      readonly issues: readonly ReviewServiceSettingIssue[]
    }

/** 仅 true 为开启；其它类型/缺省 → 默认 false（不得静默当 true） */
function coerceReviewUiBoolean(raw: unknown, defaultValue: boolean): boolean {
  if (raw === true) return true
  if (raw === false) return false
  return defaultValue
}

/**
 * 复习 UI 显示偏好变更序号：保存成功后 +1，已挂载的评分按钮 / 快捷键订阅后重读 settings。
 * 不依赖 orca.state 是否经 Valtio 传播；纯内存 pub/sub，测试环境无 window.Valtio 也可。
 */
let reviewUiDisplayRevision = 0
const reviewUiDisplayListeners = new Set<() => void>()

/** 当前 revision（测试与调试用） */
export function getReviewUiDisplayRevision(): number {
  return reviewUiDisplayRevision
}

/** 订阅显示偏好变更；返回取消订阅函数 */
export function subscribeReviewUiDisplaySettings(
  listener: () => void
): () => void {
  reviewUiDisplayListeners.add(listener)
  return () => {
    reviewUiDisplayListeners.delete(listener)
  }
}

/** 保存（或外部写入）显示偏好后调用，强制复习 UI 与快捷键对齐最新 settings */
export function notifyReviewUiDisplaySettingsChanged(): void {
  reviewUiDisplayRevision += 1
  for (const listener of reviewUiDisplayListeners) {
    try {
      listener()
    } catch (error) {
      console.error(
        "[reviewServiceSettings] review UI display listener failed:",
        error
      )
    }
  }
}

/**
 * 复习界面显示偏好：从 plugin settings 读取。
 * 默认关闭；仅严格 `true` 视为开启。
 */
export function getReviewUiDisplaySettings(
  pluginName: string
): ReviewUiDisplaySettings {
  const settings = orca.state.plugins[pluginName]?.settings
  return {
    passFailButtons: coerceReviewUiBoolean(
      settings?.[REVIEW_UI_DISPLAY_KEYS.passFailButtons],
      DEFAULT_PASS_FAIL_BUTTONS
    ),
    showNextReviewTime: coerceReviewUiBoolean(
      settings?.[REVIEW_UI_DISPLAY_KEYS.showNextReviewTime],
      DEFAULT_SHOW_NEXT_REVIEW_TIME
    )
  }
}

function summarizeRaw(value: unknown, maxLen = 80): string {
  if (value === undefined) return "(undefined)"
  if (value === null) return "(null)"
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN"
    if (value === Infinity) return "Infinity"
    if (value === -Infinity) return "-Infinity"
    return String(value)
  }
  if (typeof value === "string") {
    if (value.length === 0) return '""'
    const shown =
      value.length > maxLen ? `${value.slice(0, maxLen)}…` : value
    return JSON.stringify(shown)
  }
  return `(${typeof value})`
}

function fieldLabel(field: ReviewServiceSettingIssue["field"]): string {
  switch (field) {
    case "newCardsPerDay":
      return "每日新卡上限"
    case "reviewCardsPerDay":
      return "每日复习上限"
    case "fsrsRequestRetention":
      return "目标记忆保留率"
    default:
      return field
  }
}

function formatIssuesMessage(
  issues: readonly ReviewServiceSettingIssue[],
  mode: "runtime" | "save"
): string {
  if (issues.length === 0) return ""
  const parts = issues.map((issue) =>
    mode === "save"
      ? `${fieldLabel(issue.field)}：${issue.reason}（当前值 ${issue.rawSummary}）`
      : `${fieldLabel(issue.field)}：${issue.reason}（已回退 ${issue.fallback}；原值 ${issue.rawSummary}）`
  )
  if (mode === "save") {
    return `复习设置无效，无法保存。${parts.join("；")}`
  }
  return `复习设置无效，已使用安全默认值。${parts.join("；")}`
}

/**
 * 将表单字符串解析为 daily limit 数字。
 * 空串 / 非数字 / 非整数不得伪装成 undefined（否则会静默默认）。
 */
function parseDailyLimitInput(raw: string): unknown {
  const trim = raw.trim()
  if (trim === "") return ""
  const n = Number(trim)
  // 拒绝 "1.5" 等小数：Number 成功但 isValidDailyCardLimit 会拒绝
  // 拒绝 "1abc"：Number 为 NaN，原样返回字符串便于摘要
  return Number.isFinite(n) ? n : raw
}

/**
 * 将表单字符串解析为 retention 数字。
 */
function parseRetentionInput(raw: string): unknown {
  const trim = raw.trim()
  if (trim === "") return ""
  const n = Number(trim)
  return Number.isFinite(n) ? n : raw
}

/** 恢复默认按钮用的草稿（仅更新 UI，不写盘） */
export function getDefaultReviewServiceSettingsDraft(): ReviewServiceSettingsDraft {
  return {
    newCardsPerDay: String(DEFAULT_NEW_CARDS_PER_DAY),
    reviewCardsPerDay: String(DEFAULT_REVIEW_CARDS_PER_DAY),
    requestRetention: String(DEFAULT_REQUEST_RETENTION),
    passFailButtons: DEFAULT_PASS_FAIL_BUTTONS,
    showNextReviewTime: DEFAULT_SHOW_NEXT_REVIEW_TIME
  }
}

/**
 * 从 plugin settings 加载复习页可见项。
 * 表单填入**安全生效值**；非法旧值 → issues / warningMessage 必须可见。
 * 不读取、不校验权重与最大间隔（由算法 runtime 警告负责）。
 * UI 开关缺省 / 非 boolean → 默认 false，不产生警告。
 */
export function loadReviewServiceSettings(
  pluginName: string
): ReviewServiceSettingsLoadResult {
  const settings = orca.state.plugins[pluginName]?.settings
  const rawNew = settings?.[REVIEW_SETTINGS_KEYS.newCardsPerDay]
  const rawReview = settings?.[REVIEW_SETTINGS_KEYS.reviewCardsPerDay]
  const rawRetention = settings?.[REVIEW_SETTINGS_KEYS.fsrsRequestRetention]
  const ui = getReviewUiDisplaySettings(pluginName)

  const issues: ReviewServiceSettingIssue[] = []

  let newCardsPerDay = DEFAULT_NEW_CARDS_PER_DAY
  if (rawNew === undefined) {
    newCardsPerDay = DEFAULT_NEW_CARDS_PER_DAY
  } else if (isValidDailyCardLimit(rawNew)) {
    newCardsPerDay = rawNew
  } else {
    issues.push({
      field: "newCardsPerDay",
      rawSummary: summarizeRaw(rawNew),
      reason: `仅接受 0..${MAX_DAILY_CARD_LIMIT} 的有限非负整数`,
      fallback: String(DEFAULT_NEW_CARDS_PER_DAY)
    })
  }

  let reviewCardsPerDay = DEFAULT_REVIEW_CARDS_PER_DAY
  if (rawReview === undefined) {
    reviewCardsPerDay = DEFAULT_REVIEW_CARDS_PER_DAY
  } else if (isValidDailyCardLimit(rawReview)) {
    reviewCardsPerDay = rawReview
  } else {
    issues.push({
      field: "reviewCardsPerDay",
      rawSummary: summarizeRaw(rawReview),
      reason: `仅接受 0..${MAX_DAILY_CARD_LIMIT} 的有限非负整数`,
      fallback: String(DEFAULT_REVIEW_CARDS_PER_DAY)
    })
  }

  let requestRetention = DEFAULT_REQUEST_RETENTION
  if (rawRetention === undefined) {
    requestRetention = DEFAULT_REQUEST_RETENTION
  } else if (isValidFsrsRequestRetention(rawRetention)) {
    requestRetention = rawRetention
  } else {
    const detail =
      typeof rawRetention === "number" && Number.isFinite(rawRetention)
        ? `数值 ${rawRetention} 不在 ${FSRS_REQUEST_RETENTION_MIN}..${FSRS_REQUEST_RETENTION_MAX}`
        : `类型或值无效（需有限 number，区间 ${FSRS_REQUEST_RETENTION_MIN}..${FSRS_REQUEST_RETENTION_MAX}）`
    issues.push({
      field: "fsrsRequestRetention",
      rawSummary: summarizeRaw(rawRetention),
      reason: detail,
      fallback: String(DEFAULT_REQUEST_RETENTION)
    })
  }

  const draft: ReviewServiceSettingsDraft = {
    newCardsPerDay: String(newCardsPerDay),
    reviewCardsPerDay: String(reviewCardsPerDay),
    requestRetention: String(requestRetention),
    passFailButtons: ui.passFailButtons,
    showNextReviewTime: ui.showNextReviewTime
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
 * 严格解析表单草稿：任一数值字段非法则失败（保存路径禁止回退写盘）。
 * UI 开关强制为 boolean（表单 checkbox）；非法数值失败时整包不写。
 * 成功 patch 含三项数值 key + 两项 UI key；明确不含 weights / maximumInterval。
 */
export function parseReviewServiceSettingsDraftStrict(
  draft: ReviewServiceSettingsDraft
): ReviewServiceSettingsParseResult {
  const issues: ReviewServiceSettingIssue[] = []

  const rawNew = parseDailyLimitInput(draft.newCardsPerDay)
  let newCardsPerDay = DEFAULT_NEW_CARDS_PER_DAY
  if (!isValidDailyCardLimit(rawNew)) {
    issues.push({
      field: "newCardsPerDay",
      rawSummary: summarizeRaw(
        draft.newCardsPerDay.trim() === "" ? "" : rawNew
      ),
      reason: `仅接受 0..${MAX_DAILY_CARD_LIMIT} 的有限非负整数`,
      fallback: String(DEFAULT_NEW_CARDS_PER_DAY)
    })
  } else {
    newCardsPerDay = rawNew
  }

  const rawReview = parseDailyLimitInput(draft.reviewCardsPerDay)
  let reviewCardsPerDay = DEFAULT_REVIEW_CARDS_PER_DAY
  if (!isValidDailyCardLimit(rawReview)) {
    issues.push({
      field: "reviewCardsPerDay",
      rawSummary: summarizeRaw(
        draft.reviewCardsPerDay.trim() === "" ? "" : rawReview
      ),
      reason: `仅接受 0..${MAX_DAILY_CARD_LIMIT} 的有限非负整数`,
      fallback: String(DEFAULT_REVIEW_CARDS_PER_DAY)
    })
  } else {
    reviewCardsPerDay = rawReview
  }

  const rawRetention = parseRetentionInput(draft.requestRetention)
  let requestRetention = DEFAULT_REQUEST_RETENTION
  if (!isValidFsrsRequestRetention(rawRetention)) {
    const detail =
      typeof rawRetention === "number" && Number.isFinite(rawRetention)
        ? `数值 ${rawRetention} 不在 ${FSRS_REQUEST_RETENTION_MIN}..${FSRS_REQUEST_RETENTION_MAX}`
        : `类型或值无效（需有限 number，区间 ${FSRS_REQUEST_RETENTION_MIN}..${FSRS_REQUEST_RETENTION_MAX}）`
    issues.push({
      field: "fsrsRequestRetention",
      rawSummary: summarizeRaw(
        draft.requestRetention.trim() === "" ? "" : rawRetention
      ),
      reason: detail,
      fallback: String(DEFAULT_REQUEST_RETENTION)
    })
  } else {
    requestRetention = rawRetention
  }

  // checkbox 状态恒为 boolean；防御非 boolean 时回退默认 false
  const passFailButtons =
    typeof draft.passFailButtons === "boolean"
      ? draft.passFailButtons
      : DEFAULT_PASS_FAIL_BUTTONS
  const showNextReviewTime =
    typeof draft.showNextReviewTime === "boolean"
      ? draft.showNextReviewTime
      : DEFAULT_SHOW_NEXT_REVIEW_TIME

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
      [REVIEW_SETTINGS_KEYS.newCardsPerDay]: newCardsPerDay,
      [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: reviewCardsPerDay,
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: requestRetention,
      [REVIEW_UI_DISPLAY_KEYS.passFailButtons]: passFailButtons,
      [REVIEW_UI_DISPLAY_KEYS.showNextReviewTime]: showNextReviewTime
    },
    values: {
      newCardsPerDay,
      reviewCardsPerDay,
      requestRetention,
      passFailButtons,
      showNextReviewTime
    }
  }
}

/**
 * 将合法复习页表单写回 plugin settings，并清理 FSRS runtime cache
 * （使 retention 立即生效）。非法时抛错且**不**调用 setSettings。
 *
 * 写回 patch 含三项数值 key + 两项 UI 开关；不会规范化或覆盖个人优化权重 / 最大间隔。
 */
export async function saveReviewServiceSettingsFromForm(
  pluginName: string,
  draft: ReviewServiceSettingsDraft
): Promise<{
  newCardsPerDay: number
  reviewCardsPerDay: number
  requestRetention: number
  passFailButtons: boolean
  showNextReviewTime: boolean
}> {
  const parsed = parseReviewServiceSettingsDraftStrict(draft)
  if (!parsed.ok) {
    throw new Error(parsed.message)
  }
  await orca.plugins.setSettings("app", pluginName, parsed.patch)
  clearFsrsRuntimeState()
  // 使已打开的复习会话立刻按新 UI 开关重绘（按钮与 keydown 读取对齐）
  notifyReviewUiDisplaySettingsChanged()
  return parsed.values
}
