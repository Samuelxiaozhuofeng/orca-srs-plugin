/**
 * 独立服务面板「复习」页表单：load / 严格 parse / save。
 *
 * 可见三项：每日新卡上限、每日复习上限、目标记忆保留率。
 * 存储仍用 plugin settings 原 key（`review.newCardsPerDay` /
 * `review.reviewCardsPerDay` / `review.fsrsRequestRetention`）。
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

/** 复习页表单草稿（字符串便于 input 双向绑定） */
export type ReviewServiceSettingsDraft = {
  newCardsPerDay: string
  reviewCardsPerDay: string
  requestRetention: string
}

/** 可见字段校验问题（仅三项，不含 weights / maximumInterval） */
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

/** 严格解析结果：合法则带仅含三项的 patch；非法则不写盘 */
export type ReviewServiceSettingsParseResult =
  | {
      readonly ok: true
      readonly patch: Record<string, number>
      readonly values: {
        readonly newCardsPerDay: number
        readonly reviewCardsPerDay: number
        readonly requestRetention: number
      }
    }
  | {
      readonly ok: false
      readonly message: string
      readonly issues: readonly ReviewServiceSettingIssue[]
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
    requestRetention: String(DEFAULT_REQUEST_RETENTION)
  }
}

/**
 * 从 plugin settings 加载复习页可见三项。
 * 表单填入**安全生效值**；非法旧值 → issues / warningMessage 必须可见。
 * 不读取、不校验权重与最大间隔（由算法 runtime 警告负责）。
 */
export function loadReviewServiceSettings(
  pluginName: string
): ReviewServiceSettingsLoadResult {
  const settings = orca.state.plugins[pluginName]?.settings
  const rawNew = settings?.[REVIEW_SETTINGS_KEYS.newCardsPerDay]
  const rawReview = settings?.[REVIEW_SETTINGS_KEYS.reviewCardsPerDay]
  const rawRetention = settings?.[REVIEW_SETTINGS_KEYS.fsrsRequestRetention]

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
    requestRetention: String(requestRetention)
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
 * 严格解析表单草稿：任一可见字段非法则失败（保存路径禁止回退写盘）。
 * 成功 patch **仅**含三项可见 key，明确不含 weights / maximumInterval。
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
      [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: requestRetention
    },
    values: {
      newCardsPerDay,
      reviewCardsPerDay,
      requestRetention
    }
  }
}

/**
 * 将合法复习页表单写回 plugin settings，并清理 FSRS runtime cache
 * （使 retention 立即生效）。非法时抛错且**不**调用 setSettings。
 *
 * 写回 patch 仅三项可见 key；不会规范化或覆盖个人优化权重 / 最大间隔。
 */
export async function saveReviewServiceSettingsFromForm(
  pluginName: string,
  draft: ReviewServiceSettingsDraft
): Promise<{
  newCardsPerDay: number
  reviewCardsPerDay: number
  requestRetention: number
}> {
  const parsed = parseReviewServiceSettingsDraftStrict(draft)
  if (!parsed.ok) {
    throw new Error(parsed.message)
  }
  await orca.plugins.setSettings("app", pluginName, parsed.patch)
  clearFsrsRuntimeState()
  return parsed.values
}
