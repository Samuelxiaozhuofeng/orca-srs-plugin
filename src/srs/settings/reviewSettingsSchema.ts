/**
 * 复习设置 Schema 模块
 *
 * 定义复习界面的配置选项，并对 FSRS 运行时参数做严格校验。
 * F2-08：权重恰好 21 个有限数字；retention 0.7..0.99；maximum interval 1..36500。
 * 非法字段逐项回退明确默认值，并返回可诊断 issues（不得静默成功）。
 */

/**
 * FSRS v6 默认权重参数（21 个）
 *
 * 数值与已安装 ts-fsrs@5.2.3 的 `default_w` 一致（由测试锁定）。
 * UI 标注 FSRS v6 / 21 个，运行时只接受恰好 21 个有限数字。
 *
 * @see https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 */
export const DEFAULT_FSRS_WEIGHTS =
  "0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542"

/** FSRS-6 要求的权重个数（本项目 UI / 运行时只接受恰好此数） */
export const FSRS_WEIGHTS_COUNT = 21

/** 每日新卡上限默认值 */
export const DEFAULT_NEW_CARDS_PER_DAY = 30

/** 每日复习卡上限默认值 */
export const DEFAULT_REVIEW_CARDS_PER_DAY = 200

/** FSRS 目标记忆保留率默认值 */
export const DEFAULT_REQUEST_RETENTION = 0.9

/** FSRS 最大间隔天数默认值（与 ts-fsrs default_maximum_interval 一致） */
export const DEFAULT_MAXIMUM_INTERVAL = 36500

/** retention 有效闭区间下限 */
export const FSRS_REQUEST_RETENTION_MIN = 0.7

/** retention 有效闭区间上限 */
export const FSRS_REQUEST_RETENTION_MAX = 0.99

/** maximum interval 有效闭区间下限 */
export const FSRS_MAXIMUM_INTERVAL_MIN = 1

/** maximum interval 有效闭区间上限（安全上限，与默认值一致） */
export const FSRS_MAXIMUM_INTERVAL_MAX = 36500

/** 设置键名（避免散落字符串） */
export const REVIEW_SETTINGS_KEYS = {
  disableNotifications: "review.disableNotifications",
  newCardsPerDay: "review.newCardsPerDay",
  reviewCardsPerDay: "review.reviewCardsPerDay",
  fsrsWeights: "review.fsrsWeights",
  fsrsRequestRetention: "review.fsrsRequestRetention",
  fsrsMaximumInterval: "review.fsrsMaximumInterval"
} as const

export type ReviewSettingsKey =
  (typeof REVIEW_SETTINGS_KEYS)[keyof typeof REVIEW_SETTINGS_KEYS]

/** FSRS 可校验字段 */
export type FsrsSettingField =
  | "fsrsWeights"
  | "fsrsRequestRetention"
  | "fsrsMaximumInterval"

/**
 * 单字段校验问题：供用户可见诊断与测试断言。
 * 不得包含无关数据。
 */
export type FsrsSettingIssue = {
  readonly field: FsrsSettingField
  /** 原始值摘要（截断/类型化，避免泄露大段无关内容） */
  readonly rawSummary: string
  /** 中文原因 */
  readonly reason: string
  /** 回退说明（人类可读） */
  readonly fallback: string
}

/**
 * 校验后的 FSRS 运行时配置。
 * 始终可安全传入 generatorParameters / FSRS（已是默认或合法值）。
 */
export type ValidatedFsrsConfig = {
  readonly weights: readonly number[]
  /** 规范化权重字符串（生效值），用于 cache 比较 */
  readonly weightsStr: string
  readonly requestRetention: number
  readonly maximumInterval: number
  readonly issues: readonly FsrsSettingIssue[]
}

/** 从 settings 读取 FSRS 原始字段时的输入形状 */
export type RawFsrsSettingsInput = {
  readonly weights?: unknown
  readonly requestRetention?: unknown
  readonly maximumInterval?: unknown
}

/**
 * 默认 FSRS 权重数字数组（与 DEFAULT_FSRS_WEIGHTS 解析结果一致）。
 * 模块加载时解析；若常量损坏则抛错（开发期可见，避免 silent 半默认）。
 */
export const DEFAULT_FSRS_WEIGHTS_ARRAY: readonly number[] = (() => {
  const parsed = parseFsrsWeightsStrict(DEFAULT_FSRS_WEIGHTS)
  if (!parsed.ok) {
    throw new Error(
      `[FSRS] DEFAULT_FSRS_WEIGHTS 常量无效: ${parsed.reason}`
    )
  }
  return Object.freeze([...parsed.weights])
})()

/**
 * 复习设置 Schema 定义
 * 用于 Orca 插件设置界面
 */
export const reviewSettingsSchema = {
  [REVIEW_SETTINGS_KEYS.disableNotifications]: {
    label: "关闭通知提醒",
    type: "boolean" as const,
    defaultValue: false,
    description: "开启后不显示任何 SRS 相关的通知提醒（评分、创建卡片等）"
  },
  [REVIEW_SETTINGS_KEYS.newCardsPerDay]: {
    label: "每日新卡上限",
    type: "number" as const,
    defaultValue: DEFAULT_NEW_CARDS_PER_DAY,
    description: "每天最多学习的新卡数量"
  },
  [REVIEW_SETTINGS_KEYS.reviewCardsPerDay]: {
    label: "每日复习卡上限",
    type: "number" as const,
    defaultValue: DEFAULT_REVIEW_CARDS_PER_DAY,
    description: "每天最多复习的旧卡数量"
  },
  [REVIEW_SETTINGS_KEYS.fsrsWeights]: {
    label: "FSRS v6 算法权重",
    type: "string" as const,
    defaultValue: DEFAULT_FSRS_WEIGHTS,
    description:
      "FSRS v6 算法权重参数（恰好 21 个逗号分隔的有限数字）。默认值为 ts-fsrs 官方 default_w，如需调整请使用 FSRS 优化器计算"
  },
  [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: {
    label: "FSRS 目标记忆保留率",
    type: "number" as const,
    defaultValue: DEFAULT_REQUEST_RETENTION,
    description:
      "期望的记忆保留率（有效区间 0.7-0.99），值越高复习频率越高。推荐 0.9"
  },
  [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: {
    label: "FSRS 最大间隔天数",
    type: "number" as const,
    defaultValue: DEFAULT_MAXIMUM_INTERVAL,
    description:
      "卡片复习的最大间隔天数（有限正整数 1-36500；默认 36500 天，约 100 年）"
  }
}

/**
 * 复习设置接口
 */
export interface ReviewSettings {
  disableNotifications: boolean
  newCardsPerDay: number
  reviewCardsPerDay: number
  fsrsWeights: string
  fsrsRequestRetention: number
  fsrsMaximumInterval: number
}

/**
 * 获取复习设置（原始读取；FSRS 三项可能尚未严格校验）。
 * 正式评分/预览应使用 algorithm 的 validated 路径，勿把本函数原始值直接喂给 FSRS。
 *
 * @param pluginName - 插件名称
 * @returns 复习设置对象
 */
export function getReviewSettings(pluginName: string): ReviewSettings {
  const settings = orca.state.plugins[pluginName]?.settings
  return {
    disableNotifications:
      settings?.[REVIEW_SETTINGS_KEYS.disableNotifications] ?? false,
    newCardsPerDay:
      settings?.[REVIEW_SETTINGS_KEYS.newCardsPerDay] ??
      DEFAULT_NEW_CARDS_PER_DAY,
    reviewCardsPerDay:
      settings?.[REVIEW_SETTINGS_KEYS.reviewCardsPerDay] ??
      DEFAULT_REVIEW_CARDS_PER_DAY,
    fsrsWeights:
      settings?.[REVIEW_SETTINGS_KEYS.fsrsWeights] ?? DEFAULT_FSRS_WEIGHTS,
    fsrsRequestRetention:
      settings?.[REVIEW_SETTINGS_KEYS.fsrsRequestRetention] ??
      DEFAULT_REQUEST_RETENTION,
    fsrsMaximumInterval:
      settings?.[REVIEW_SETTINGS_KEYS.fsrsMaximumInterval] ??
      DEFAULT_MAXIMUM_INTERVAL
  }
}

/**
 * 将任意值摘要为短字符串（用于 issue.rawSummary，截断过长内容）。
 */
export function summarizeFsrsRawValue(value: unknown, maxLen = 80): string {
  if (value === undefined) return "(undefined)"
  if (value === null) return "(null)"
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN"
    if (value === Infinity) return "Infinity"
    if (value === -Infinity) return "-Infinity"
    return String(value)
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") {
    if (value.length === 0) return '""'
    const shown =
      value.length > maxLen ? `${value.slice(0, maxLen)}…` : value
    return JSON.stringify(shown)
  }
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "symbol") return value.toString()
  if (typeof value === "function") return "(function)"
  return `(${typeof value})`
}

type WeightsParseOk = { ok: true; weights: number[] }
type WeightsParseFail = { ok: false; reason: string }
type WeightsParseResult = WeightsParseOk | WeightsParseFail

/**
 * 严格解析权重字符串：恰好 FSRS_WEIGHTS_COUNT 个完整合法有限数字 token。
 * 使用 trim 后 `Number(token)`，禁止 parseFloat 半解析（如 "1abc"）。
 */
export function parseFsrsWeightsStrict(
  weightsStr: unknown
): WeightsParseResult {
  if (typeof weightsStr !== "string") {
    return {
      ok: false,
      reason: `权重必须是字符串，收到 ${typeof weightsStr}`
    }
  }

  if (weightsStr.trim() === "") {
    return { ok: false, reason: "权重字符串为空" }
  }

  const tokens = weightsStr.split(",")
  const weights: number[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim()
    if (token === "") {
      return {
        ok: false,
        reason: `第 ${i + 1} 个权重 token 为空`
      }
    }
    // Number("1abc") === NaN；Number.isFinite 拒绝 NaN/±Infinity
    const n = Number(token)
    if (!Number.isFinite(n)) {
      return {
        ok: false,
        reason: `第 ${i + 1} 个权重 token 不是有限数字（${JSON.stringify(token)}）`
      }
    }
    weights.push(n)
  }

  if (weights.length !== FSRS_WEIGHTS_COUNT) {
    return {
      ok: false,
      reason: `权重数量必须为恰好 ${FSRS_WEIGHTS_COUNT} 个，当前为 ${weights.length} 个`
    }
  }

  return { ok: true, weights }
}

/**
 * 将权重数组格式化为规范化字符串（与 schema 默认风格一致：逗号+空格）。
 */
export function formatFsrsWeights(weights: readonly number[]): string {
  return weights.join(", ")
}

/**
 * 解析 FSRS 权重字符串为数字数组（兼容导出）。
 *
 * F2-08：语义升级为严格恰好 21 个有限数字；失败返回 undefined。
 * 上层应优先使用 `validateFsrsConfig` 以获得 issues 诊断，勿仅依赖 console。
 *
 * @param weightsStr - 逗号分隔的权重字符串
 * @returns 权重数组，如果解析失败返回 undefined
 */
export function parseFsrsWeights(weightsStr: string): number[] | undefined {
  const result = parseFsrsWeightsStrict(weightsStr)
  if (!result.ok) {
    console.warn(`[FSRS] 权重参数无效: ${result.reason}`)
    return undefined
  }
  return result.weights
}

/**
 * 校验 retention：仅有限 number 且在 [0.7, 0.99]。
 */
export function isValidFsrsRequestRetention(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= FSRS_REQUEST_RETENTION_MIN &&
    value <= FSRS_REQUEST_RETENTION_MAX
  )
}

/**
 * 校验 maximum interval：仅有限整数且在 [1, 36500]。
 */
export function isValidFsrsMaximumInterval(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= FSRS_MAXIMUM_INTERVAL_MIN &&
    value <= FSRS_MAXIMUM_INTERVAL_MAX
  )
}

/**
 * 纯函数：从原始设置字段得到统一 validated config + issues。
 * 非法字段逐项回退默认；不得把原始非法值原样返回给调用方当作「可用」。
 */
export function validateFsrsConfig(
  raw: RawFsrsSettingsInput
): ValidatedFsrsConfig {
  const issues: FsrsSettingIssue[] = []

  // --- weights ---
  // undefined = 设置项未写过 → 静默默认；其它非法值 → issue + 回退
  let weights: number[]
  let weightsStr: string
  if (raw.weights === undefined) {
    weights = [...DEFAULT_FSRS_WEIGHTS_ARRAY]
    weightsStr = formatFsrsWeights(weights)
  } else {
    const weightsParse = parseFsrsWeightsStrict(raw.weights)
    if (weightsParse.ok) {
      weights = weightsParse.weights
      weightsStr = formatFsrsWeights(weights)
    } else {
      issues.push({
        field: "fsrsWeights",
        rawSummary: summarizeFsrsRawValue(raw.weights),
        reason: weightsParse.reason,
        fallback: `默认权重（${FSRS_WEIGHTS_COUNT} 个）`
      })
      weights = [...DEFAULT_FSRS_WEIGHTS_ARRAY]
      weightsStr = formatFsrsWeights(weights)
    }
  }

  // --- request retention ---
  let requestRetention: number
  if (raw.requestRetention === undefined) {
    requestRetention = DEFAULT_REQUEST_RETENTION
  } else if (isValidFsrsRequestRetention(raw.requestRetention)) {
    requestRetention = raw.requestRetention
  } else {
    const detail =
      typeof raw.requestRetention === "number" &&
      Number.isFinite(raw.requestRetention)
        ? `数值 ${raw.requestRetention} 不在 ${FSRS_REQUEST_RETENTION_MIN}..${FSRS_REQUEST_RETENTION_MAX}`
        : `类型或值无效（需有限 number，区间 ${FSRS_REQUEST_RETENTION_MIN}..${FSRS_REQUEST_RETENTION_MAX}）`
    issues.push({
      field: "fsrsRequestRetention",
      rawSummary: summarizeFsrsRawValue(raw.requestRetention),
      reason: detail,
      fallback: String(DEFAULT_REQUEST_RETENTION)
    })
    requestRetention = DEFAULT_REQUEST_RETENTION
  }

  // --- maximum interval ---
  let maximumInterval: number
  if (raw.maximumInterval === undefined) {
    maximumInterval = DEFAULT_MAXIMUM_INTERVAL
  } else if (isValidFsrsMaximumInterval(raw.maximumInterval)) {
    maximumInterval = raw.maximumInterval
  } else {
    let detail: string
    if (typeof raw.maximumInterval !== "number") {
      detail = `类型无效（需有限整数，区间 ${FSRS_MAXIMUM_INTERVAL_MIN}..${FSRS_MAXIMUM_INTERVAL_MAX}）`
    } else if (!Number.isFinite(raw.maximumInterval)) {
      detail = "不是有限数字（拒绝 NaN / Infinity）"
    } else if (!Number.isInteger(raw.maximumInterval)) {
      detail = `不是整数（收到 ${raw.maximumInterval}）`
    } else {
      detail = `不在 ${FSRS_MAXIMUM_INTERVAL_MIN}..${FSRS_MAXIMUM_INTERVAL_MAX}（收到 ${raw.maximumInterval}）`
    }
    issues.push({
      field: "fsrsMaximumInterval",
      rawSummary: summarizeFsrsRawValue(raw.maximumInterval),
      reason: detail,
      fallback: String(DEFAULT_MAXIMUM_INTERVAL)
    })
    maximumInterval = DEFAULT_MAXIMUM_INTERVAL
  }

  return {
    weights,
    weightsStr,
    requestRetention,
    maximumInterval,
    issues
  }
}

/**
 * 从插件 raw settings 读取并校验 FSRS 配置（纯读取 + validate，不 notify）。
 */
export function readAndValidateFsrsSettings(
  pluginName: string
): ValidatedFsrsConfig {
  const settings = orca.state.plugins[pluginName]?.settings
  return validateFsrsConfig({
    weights: settings?.[REVIEW_SETTINGS_KEYS.fsrsWeights],
    requestRetention: settings?.[REVIEW_SETTINGS_KEYS.fsrsRequestRetention],
    maximumInterval: settings?.[REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]
  })
}

/**
 * 恢复 FSRS 默认设置时写入的三项 patch（key 与 schema 一致）。
 */
export function getDefaultFsrsSettingsPatch(): Record<string, string | number> {
  return {
    [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
    [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: DEFAULT_REQUEST_RETENTION,
    [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: DEFAULT_MAXIMUM_INTERVAL
  }
}

/**
 * 默认 validated 配置（无 issues）。
 */
export function getDefaultValidatedFsrsConfig(): ValidatedFsrsConfig {
  return {
    weights: [...DEFAULT_FSRS_WEIGHTS_ARRAY],
    weightsStr: formatFsrsWeights(DEFAULT_FSRS_WEIGHTS_ARRAY),
    requestRetention: DEFAULT_REQUEST_RETENTION,
    maximumInterval: DEFAULT_MAXIMUM_INTERVAL,
    issues: []
  }
}

/**
 * 将 issues 格式化为用户可见的中文摘要。
 */
export function formatFsrsIssuesMessage(
  issues: readonly FsrsSettingIssue[]
): string {
  if (issues.length === 0) return ""
  const parts = issues.map(
    (issue) =>
      `${fieldLabel(issue.field)}：${issue.reason}（已回退 ${issue.fallback}；原值 ${issue.rawSummary}）`
  )
  return `FSRS 设置无效，已使用安全默认值。${parts.join("；")}`
}

function fieldLabel(field: FsrsSettingField): string {
  switch (field) {
    case "fsrsWeights":
      return "权重"
    case "fsrsRequestRetention":
      return "目标保留率"
    case "fsrsMaximumInterval":
      return "最大间隔"
    default:
      return field
  }
}

/**
 * 显示通知（如果未禁用）
 *
 * @param pluginName - 插件名称
 * @param type - 通知类型
 * @param message - 通知消息
 * @param options - 通知选项
 */
export function showNotification(
  pluginName: string,
  type: "success" | "error" | "warn" | "info",
  message: string,
  options?: { title?: string }
): void {
  const settings = getReviewSettings(pluginName)
  if (!settings.disableNotifications) {
    orca.notify(type, message, options)
  }
}
