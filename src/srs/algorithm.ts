import { FSRS, Rating, State, createEmptyCard, generatorParameters } from "ts-fsrs"
import type { Card, Grade as FsrsGrade, RecordLogItem, FSRSParameters } from "ts-fsrs"
import type { Grade, SrsState } from "./types"
import { 
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_REQUEST_RETENTION, 
  DEFAULT_MAXIMUM_INTERVAL,
  parseFsrsWeights
} from "./settings/reviewSettingsSchema"

// 当前 FSRS 参数缓存
let currentParams = {
  weightsStr: DEFAULT_FSRS_WEIGHTS,
  requestRetention: DEFAULT_REQUEST_RETENTION,
  maximumInterval: DEFAULT_MAXIMUM_INTERVAL
}

// 创建 FSRS 实例的函数
const createFsrsInstance = (
  weights?: number[],
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
  maximumInterval: number = DEFAULT_MAXIMUM_INTERVAL
): FSRS => {
  const params: Partial<FSRSParameters> = {
    request_retention: requestRetention,
    maximum_interval: maximumInterval
  }
  // 如果提供了有效权重则使用，否则让 ts-fsrs 使用原生默认权重
  if (weights && weights.length >= 19) {
    params.w = weights
  }
  return new FSRS(generatorParameters(params))
}

// 解析默认权重
const defaultWeights = parseFsrsWeights(DEFAULT_FSRS_WEIGHTS)

// 默认 FSRS 实例
let fsrs = createFsrsInstance(defaultWeights, DEFAULT_REQUEST_RETENTION, DEFAULT_MAXIMUM_INTERVAL)

/**
 * 更新 FSRS 实例的参数
 * 
 * @param weightsStr - 权重字符串
 * @param requestRetention - 目标记忆保留率
 * @param maximumInterval - 最大间隔天数
 */
export const updateFsrsParams = (
  weightsStr: string,
  requestRetention: number,
  maximumInterval: number
): void => {
  // 检查参数是否有变化
  if (
    weightsStr === currentParams.weightsStr &&
    requestRetention === currentParams.requestRetention &&
    maximumInterval === currentParams.maximumInterval
  ) {
    return
  }
  
  const weights = parseFsrsWeights(weightsStr)
  fsrs = createFsrsInstance(weights, requestRetention, maximumInterval)
  currentParams = { weightsStr, requestRetention, maximumInterval }
  console.log("[FSRS] 已更新算法参数", { requestRetention, maximumInterval })
}

/**
 * 获取当前 FSRS 实例（确保使用最新设置）
 * 
 * @param pluginName - 插件名称（用于读取设置）
 */
export const getFsrsInstance = (pluginName?: string): FSRS => {
  if (pluginName) {
    const settings = orca.state.plugins[pluginName]?.settings
    const weightsStr = settings?.["review.fsrsWeights"] ?? DEFAULT_FSRS_WEIGHTS
    const requestRetention = settings?.["review.fsrsRequestRetention"] ?? DEFAULT_REQUEST_RETENTION
    const maximumInterval = settings?.["review.fsrsMaximumInterval"] ?? DEFAULT_MAXIMUM_INTERVAL
    updateFsrsParams(weightsStr, requestRetention, maximumInterval)
  }
  return fsrs
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
    state: record.card.state                    // 当前 FSRS 状态（New/Learning/Review/Relearning）
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
