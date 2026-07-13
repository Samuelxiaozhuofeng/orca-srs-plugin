import { FSRS, Rating, State, createEmptyCard, generatorParameters } from "ts-fsrs"
import type { Card, Grade as FsrsGrade, RecordLogItem, FSRSParameters } from "ts-fsrs"
import type { Grade, SrsState } from "./types"
import {
  DEFAULT_FSRS_WEIGHTS_ARRAY,
  DEFAULT_REQUEST_RETENTION,
  DEFAULT_MAXIMUM_INTERVAL,
  formatFsrsIssuesMessage,
  formatFsrsWeights,
  getDefaultValidatedFsrsConfig,
  readAndValidateFsrsSettings,
  validateFsrsConfig,
  type ValidatedFsrsConfig
} from "./settings/reviewSettingsSchema"

/** 规范化后的生效参数（用于 cache 比较；不含 issues） */
export type EffectiveFsrsParams = {
  readonly weightsStr: string
  readonly requestRetention: number
  readonly maximumInterval: number
  readonly weights: readonly number[]
}

// 当前生效 FSRS 参数缓存（规范化后）
let currentParams: EffectiveFsrsParams = {
  weightsStr: formatFsrsWeights(DEFAULT_FSRS_WEIGHTS_ARRAY),
  requestRetention: DEFAULT_REQUEST_RETENTION,
  maximumInterval: DEFAULT_MAXIMUM_INTERVAL,
  weights: [...DEFAULT_FSRS_WEIGHTS_ARRAY]
}

/**
 * 同一份非法配置指纹只 warn 一次；配置变化可再通知。
 * 指纹基于 raw 校验输入的稳定序列化，而非「碰巧相同的默认生效值」。
 */
let lastWarnedConfigFingerprint: string | null = null

/**
 * 仅用已校验配置创建 FSRS 实例。
 * 调用方必须保证 weights 为恰好 21 个有限数字；本函数不再做宽松 `>=19` 判断。
 */
const createFsrsInstanceFromValidated = (
  config: Pick<
    ValidatedFsrsConfig,
    "weights" | "requestRetention" | "maximumInterval"
  >
): FSRS => {
  const params: Partial<FSRSParameters> = {
    request_retention: config.requestRetention,
    maximum_interval: config.maximumInterval,
    w: [...config.weights]
  }
  return new FSRS(generatorParameters(params))
}

// 默认 FSRS 实例（安全默认）
let fsrs = createFsrsInstanceFromValidated(getDefaultValidatedFsrsConfig())

function effectiveKey(params: EffectiveFsrsParams): string {
  return `${params.requestRetention}|${params.maximumInterval}|${params.weightsStr}`
}

function toEffectiveParams(config: ValidatedFsrsConfig): EffectiveFsrsParams {
  return {
    weightsStr: config.weightsStr,
    requestRetention: config.requestRetention,
    maximumInterval: config.maximumInterval,
    weights: config.weights
  }
}

/**
 * 用 validated 配置更新运行时 FSRS（仅当规范化参数变化时重建）。
 */
export function applyValidatedFsrsConfig(config: ValidatedFsrsConfig): void {
  const next = toEffectiveParams(config)
  if (effectiveKey(next) === effectiveKey(currentParams)) {
    return
  }
  fsrs = createFsrsInstanceFromValidated(config)
  currentParams = {
    weightsStr: next.weightsStr,
    requestRetention: next.requestRetention,
    maximumInterval: next.maximumInterval,
    weights: [...next.weights]
  }
  console.log("[FSRS] 已更新算法参数", {
    requestRetention: currentParams.requestRetention,
    maximumInterval: currentParams.maximumInterval,
    weightsCount: currentParams.weights.length
  })
}

/**
 * 构建非法配置指纹（用于 notify 去重）。
 * 同一 raw 设置重复预览四个评分时不重复弹通知。
 */
export function buildFsrsConfigFingerprint(
  raw: {
    weights?: unknown
    requestRetention?: unknown
    maximumInterval?: unknown
  },
  issues: ValidatedFsrsConfig["issues"]
): string {
  // 稳定序列化：字段 + 原值摘要 + 原因，避免仅 console
  const issuePart = issues
    .map((i) => `${i.field}:${i.rawSummary}:${i.reason}`)
    .join("|")
  // 含 raw 三元组，确保「不同非法值但相同 issue 文案」仍可区分
  let rawWeights = ""
  let rawRet = ""
  let rawMax = ""
  try {
    rawWeights = JSON.stringify(raw.weights)
  } catch {
    rawWeights = String(raw.weights)
  }
  try {
    rawRet = JSON.stringify(raw.requestRetention)
  } catch {
    rawRet = String(raw.requestRetention)
  }
  try {
    rawMax = JSON.stringify(raw.maximumInterval)
  } catch {
    rawMax = String(raw.maximumInterval)
  }
  return `${rawWeights}#${rawRet}#${rawMax}#${issuePart}`
}

/**
 * 当存在 issues 时向用户 warn（按指纹去重）。
 * 无 issues（合法 / 未设置静默默认）时重置去重状态，使「修好后再破坏」可再次通知。
 * 不修改 FSRS 实例 cache。
 * notify 失败仅 console，不得阻止使用安全默认值。
 */
export function maybeWarnFsrsConfigIssues(
  config: ValidatedFsrsConfig,
  fingerprint: string
): void {
  if (config.issues.length === 0) {
    // 安全配置也算配置变化：清除非法 fingerprint
    lastWarnedConfigFingerprint = null
    return
  }
  if (fingerprint === lastWarnedConfigFingerprint) {
    return
  }
  lastWarnedConfigFingerprint = fingerprint

  const message = formatFsrsIssuesMessage(config.issues)
  console.warn("[FSRS]", message, config.issues)

  try {
    orca.notify("warn", message, { title: "SRS FSRS 设置" })
  } catch (error) {
    console.error("[FSRS] 无法显示设置警告通知:", error)
  }
}

/**
 * 从 raw 输入校验、可选 warn、并应用运行时实例。
 * 返回生效配置（issues 可能非空）。
 *
 * 去重规则：
 * - 同一非法指纹连续预览/四评分：只 notify 一次
 * - 非法 A → 非法 B：各 notify 一次
 * - 无 issues（合法或 undefined 静默默认）时重置去重；之后再遇非法 A 必须再 notify
 * - 重置去重不影响 FSRS 生效参数 cache
 */
export function resolveAndApplyFsrsConfig(
  raw: {
    weights?: unknown
    requestRetention?: unknown
    maximumInterval?: unknown
  },
  options?: { warn?: boolean }
): ValidatedFsrsConfig {
  const config = validateFsrsConfig(raw)
  if (config.issues.length === 0) {
    // 合法 / 未设置：安全状态，清除非法 warning 去重（不动 FSRS cache 逻辑）
    lastWarnedConfigFingerprint = null
  } else if (options?.warn !== false) {
    const fingerprint = buildFsrsConfigFingerprint(raw, config.issues)
    maybeWarnFsrsConfigIssues(config, fingerprint)
  }
  applyValidatedFsrsConfig(config)
  return config
}

/**
 * 更新 FSRS 实例参数（接受可能非法的 raw；内部严格校验）。
 * 非法值不会传入 generatorParameters。
 *
 * @param weightsStr - 权重字符串
 * @param requestRetention - 目标记忆保留率
 * @param maximumInterval - 最大间隔天数
 * @param options.warn - 是否用户可见 warn（默认 true）
 */
export const updateFsrsParams = (
  weightsStr: string,
  requestRetention: number,
  maximumInterval: number,
  options?: { warn?: boolean }
): ValidatedFsrsConfig => {
  return resolveAndApplyFsrsConfig(
    {
      weights: weightsStr,
      requestRetention,
      maximumInterval
    },
    options
  )
}

/**
 * 获取当前 FSRS 实例（确保使用最新、已校验设置）
 *
 * @param pluginName - 插件名称（用于读取设置）；省略时返回当前缓存实例（默认或上次生效）
 */
export const getFsrsInstance = (pluginName?: string): FSRS => {
  if (pluginName) {
    const settings = orca.state.plugins[pluginName]?.settings
    const raw = {
      weights: settings?.["review.fsrsWeights"],
      requestRetention: settings?.["review.fsrsRequestRetention"],
      maximumInterval: settings?.["review.fsrsMaximumInterval"]
    }
    resolveAndApplyFsrsConfig(raw, { warn: true })
  }
  return fsrs
}

/**
 * 读取并返回当前生效的规范化参数（可选带 pluginName 刷新）。
 * 测试/诊断用；保证与 getFsrsInstance 同一校验路径。
 */
export function getEffectiveFsrsParams(
  pluginName?: string
): EffectiveFsrsParams {
  if (pluginName) {
    getFsrsInstance(pluginName)
  }
  return {
    weightsStr: currentParams.weightsStr,
    requestRetention: currentParams.requestRetention,
    maximumInterval: currentParams.maximumInterval,
    weights: [...currentParams.weights]
  }
}

/**
 * 返回最近一次 validate 后的 issues 视角：从 plugin settings 重新校验（不应用、不 warn）。
 * 供测试断言「非法值不会成为生效参数」。
 */
export function peekValidatedFsrsConfig(
  pluginName: string
): ValidatedFsrsConfig {
  return readAndValidateFsrsSettings(pluginName)
}

/**
 * 清理 FSRS 运行时 warning 指纹与实例缓存，恢复为项目默认参数。
 * 供「恢复 FSRS 默认设置」命令在 setSettings 成功后调用；
 * 下一次预览/评分将确定使用默认（或新写入的设置）。
 */
export function clearFsrsRuntimeState(): void {
  lastWarnedConfigFingerprint = null
  const defaults = getDefaultValidatedFsrsConfig()
  fsrs = createFsrsInstanceFromValidated(defaults)
  currentParams = {
    weightsStr: defaults.weightsStr,
    requestRetention: defaults.requestRetention,
    maximumInterval: defaults.maximumInterval,
    weights: [...defaults.weights]
  }
  console.log("[FSRS] 运行时状态已重置为默认参数")
}

/**
 * 仅清除 warning 去重指纹（测试用；生产命令走 clearFsrsRuntimeState）。
 */
export function clearFsrsWarningFingerprint(): void {
  lastWarnedConfigFingerprint = null
}

const GRADE_TO_RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again as FsrsGrade,
  hard: Rating.Hard as FsrsGrade,
  good: Rating.Good as FsrsGrade,
  easy: Rating.Easy as FsrsGrade
}

const DEFAULT_NOW = () => new Date()

const toFsrsCard = (prevState: SrsState | null, now: Date): Card => {
  const base = createEmptyCard(now) as Card

  if (!prevState) {
    return base
  }

  return {
    ...base,
    stability: prevState.stability ?? base.stability,
    difficulty: prevState.difficulty ?? base.difficulty,
    due: prevState.due ?? base.due,
    last_review: prevState.lastReviewed ?? base.last_review,
    scheduled_days: prevState.interval ?? base.scheduled_days,
    reps: prevState.reps ?? base.reps,
    lapses: prevState.lapses ?? base.lapses,
    // 使用保存的 FSRS 状态，如果没有则根据 reps 推断
    // 注意：必须保留 Learning/Relearning 状态，否则间隔计算会出错
    state: prevState.state ?? (prevState.reps > 0 ? State.Review : State.New)
  }
}

const cardToState = (card: Card, log: RecordLogItem["log"] | null, resets?: number): SrsState => ({
  stability: card.stability,           // 记忆稳定度，越高遗忘越慢
  difficulty: card.difficulty,         // 记忆难度，Again/Hard 提升，Easy 降低
  interval: card.scheduled_days,       // 下次间隔天数（FSRS 计算的 scheduled_days）
  due: card.due,                       // 下次到期时间
  lastReviewed: log?.review ?? card.last_review ?? null, // 最近复习时间
  reps: card.reps,                     // 累计复习次数
  lapses: card.lapses,                 // 遗忘次数（Again 增加）
  state: card.state,                   // FSRS 内部状态（New/Learning/Review/Relearning）
  resets: resets ?? 0                  // 重置次数
})

export const createInitialSrsState = (now: Date = DEFAULT_NOW()): SrsState => {
  const base = createEmptyCard(now) as Card
  return cardToState(base, null)
}

/**
 * 重置卡片为新卡状态
 *
 * 保留重置次数计数，其他状态重置为初始值
 *
 * @param prevState - 当前 SRS 状态
 * @param now - 当前时间（默认为现在）
 * @returns 重置后的 SRS 状态
 */
export const resetCardState = (
  prevState: SrsState | null,
  now: Date = DEFAULT_NOW()
): SrsState => {
  const initialState = createInitialSrsState(now)
  const currentResets = prevState?.resets ?? 0

  return {
    ...initialState,
    resets: currentResets + 1
  }
}

export const nextReviewState = (
  prevState: SrsState | null,
  grade: Grade,
  now: Date = DEFAULT_NOW(),
  pluginName?: string
): { state: SrsState, log: RecordLogItem["log"] } => {
  const fsrsInstance = getFsrsInstance(pluginName)
  const fsrsCard = toFsrsCard(prevState, now)
  const record = fsrsInstance.next(fsrsCard, now, GRADE_TO_RATING[grade])

  const nextState: SrsState = {
    stability: record.card.stability,           // 记忆稳定度，评分越高增长越快
    difficulty: record.card.difficulty,         // 记忆难度，Again/Hard 会调高，Easy 会降低
    interval: record.card.scheduled_days,       // 下次间隔天数，已包含 FSRS 的遗忘曲线与 fuzz
    due: record.card.due,                       // 具体下次到期时间（now + interval）
    lastReviewed: record.log.review,            // 本次复习时间
    reps: record.card.reps,                     // 总复习次数（每次评分 +1）
    lapses: record.card.lapses,                 // 遗忘次数（Again 会累计）
    state: record.card.state,                   // 当前 FSRS 状态（New/Learning/Review/Relearning）
    resets: prevState?.resets ?? 0              // 重置次数不参与 FSRS 计算，但必须跨评分保留
  }

  return { state: nextState, log: record.log }
}

/**
 * 预览各评分对应的间隔时间（毫秒）
 *
 * 用于在评分按钮上显示预览时间，帮助用户了解不同评分的后果
 *
 * @param prevState - 当前 SRS 状态
 * @param now - 当前时间（默认为现在）
 * @param pluginName - 插件名称（用于读取设置）
 * @returns 各评分对应的间隔毫秒数 { again: 60000, hard: 600000, good: 86400000, easy: 691200000 }
 */
export const previewIntervals = (
  prevState: SrsState | null,
  now: Date = DEFAULT_NOW(),
  pluginName?: string
): Record<Grade, number> => {
  const grades: Grade[] = ["again", "hard", "good", "easy"]
  const result = {} as Record<Grade, number>

  for (const grade of grades) {
    const { state } = nextReviewState(prevState, grade, now, pluginName)
    // 计算 due 时间与当前时间的差值（毫秒）
    const intervalMs = state.due.getTime() - now.getTime()
    result[grade] = Math.max(0, intervalMs)
  }

  return result
}

/**
 * 格式化间隔毫秒数为人类可读的字符串
 *
 * 支持分钟、小时、天、月、年的显示（类似 Anki）
 *
 * @param ms - 间隔毫秒数
 * @returns 格式化后的字符串，如 "1m", "10m", "1h", "5d", "2mo", "1y"
 */
export const formatInterval = (ms: number): string => {
  const minutes = ms / (1000 * 60)
  const hours = ms / (1000 * 60 * 60)
  const days = ms / (1000 * 60 * 60 * 24)

  // 小于 1 分钟：显示 <1m
  if (minutes < 1) return "<1m"
  // 小于 1 小时：显示分钟
  if (minutes < 60) return `${Math.round(minutes)}m`
  // 小于 1 天：显示小时
  if (hours < 24) return `${Math.round(hours)}h`
  // 小于 30 天：显示天数
  if (days < 30) return `${Math.round(days)}d`
  // 小于 365 天：显示月数
  if (days < 365) return `${Math.round(days / 30)}mo`
  // 大于等于 365 天：显示年数
  return `${(days / 365).toFixed(1)}y`
}

/**
 * 格式化间隔为中文格式
 *
 * @param ms - 间隔毫秒数
 * @returns 格式化后的字符串，如 "10分钟后", "2天后", "3个月后"
 */
export const formatIntervalChinese = (ms: number): string => {
  const minutes = ms / (1000 * 60)
  const hours = ms / (1000 * 60 * 60)
  const days = ms / (1000 * 60 * 60 * 24)

  // 小于 1 分钟
  if (minutes < 1) return "1分钟内"
  // 小于 1 小时：显示分钟
  if (minutes < 60) return `${Math.round(minutes)}分钟后`
  // 小于 1 天：显示小时
  if (hours < 24) return `${Math.round(hours)}小时后`
  // 小于 30 天：显示天数
  if (days < 30) return `${Math.round(days)}天后`
  // 小于 365 天：显示月数
  if (days < 365) return `${Math.round(days / 30)}个月后`
  // 大于等于 365 天：显示年数
  const years = (days / 365).toFixed(1)
  return `${years}年后`
}

/**
 * 格式化日期为简短格式（月-日）
 *
 * @param date - 日期对象
 * @returns 格式化后的字符串，如 "12-25"
 */
export const formatDueDate = (date: Date): string => {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}-${day}`
}

/**
 * 预览各评分对应的具体到期日期
 *
 * @param prevState - 当前 SRS 状态
 * @param now - 当前时间（默认为现在）
 * @param pluginName - 插件名称（用于读取设置）
 * @returns 各评分对应的到期日期 { again: Date, hard: Date, good: Date, easy: Date }
 */
export const previewDueDates = (
  prevState: SrsState | null,
  now: Date = DEFAULT_NOW(),
  pluginName?: string
): Record<Grade, Date> => {
  const grades: Grade[] = ["again", "hard", "good", "easy"]
  const result = {} as Record<Grade, Date>

  for (const grade of grades) {
    const { state } = nextReviewState(prevState, grade, now, pluginName)
    result[grade] = state.due
  }

  return result
}

export const runExamples = () => {
  const fixedNow = new Date("2024-01-01T00:00:00Z")

  const exampleStates: Array<{ title: string, prev: SrsState | null, grade: Grade }> = [
    {
      title: "新卡首次评 Good",
      prev: createInitialSrsState(fixedNow),
      grade: "good"
    },
    {
      title: "已在复习队列评 Hard",
      prev: {
        stability: 8,
        difficulty: 4,
        interval: 5,
        due: new Date("2023-12-30T00:00:00Z"),
        lastReviewed: new Date("2023-12-25T00:00:00Z"),
        reps: 6,
        lapses: 0,
        state: State.Review
      },
      grade: "hard"
    },
    {
      title: "遗忘后再次评 Again",
      prev: {
        stability: 4,
        difficulty: 6,
        interval: 3,
        due: new Date("2023-12-28T00:00:00Z"),
        lastReviewed: new Date("2023-12-26T00:00:00Z"),
        reps: 4,
        lapses: 1,
        state: State.Relearning
      },
      grade: "again"
    },
    {
      title: "成熟卡评 Easy",
      prev: {
        stability: 25,
        difficulty: 3,
        interval: 21,
        due: new Date("2023-12-20T00:00:00Z"),
        lastReviewed: new Date("2023-11-29T00:00:00Z"),
        reps: 12,
        lapses: 1,
        state: State.Review
      },
      grade: "easy"
    }
  ]

  for (const item of exampleStates) {
    const { state, log } = nextReviewState(item.prev, item.grade, fixedNow)
    console.log(`[FSRS 示例] ${item.title}`, {
      grade: item.grade,
      prevInterval: item.prev?.interval ?? 0,
      nextInterval: state.interval,
      nextDue: state.due.toISOString(),
      stability: state.stability,
      difficulty: state.difficulty,
      reps: state.reps,
      lapses: state.lapses,
      reviewAt: log.review.toISOString()
    })
  }
}
