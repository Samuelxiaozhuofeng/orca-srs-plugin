/**
 * SRS 数据存储模块
 *
 * 负责 SRS 卡片状态的读取和保存
 * 支持三种卡片类型：
 * - 普通卡片：属性前缀为 "srs."
 * - Cloze 卡片：属性前缀为 "srs.cN."（N 为填空编号）
 * - Direction 卡片：属性前缀为 "srs.forward." 或 "srs.backward."
 */

import { State } from "ts-fsrs"

import type { Block, DbId } from "../orca.d.ts"
import { createInitialSrsState, nextReviewState } from "./algorithm"
import type { Grade, SrsState } from "./types"

// ============================================================================
// 块读取缓存（避免同一轮收集/复习中重复 get-block 导致的性能浪费）
// ============================================================================

const blockCache = new Map<DbId, Block | null>()

/** get-blocks 默认批次大小，同时作为硬上限 */
export const BLOCK_PREFETCH_BATCH_SIZE = 50
/** get-blocks 默认最大并发批次数，同时作为硬上限（禁止无上限 Promise.all） */
export const BLOCK_PREFETCH_CONCURRENCY = 4

/**
 * 归一化受控正整数限制（batchSize / concurrency）。
 * - 非 number、非有限（NaN/±Infinity）、≤0 → 回退 defaultValue
 * - 小数：Math.floor（明确整数规则）
 * - 最终 clamp 到 [1, maxValue]
 * defaultValue / maxValue 通常均为导出的 50 或 4。
 */
export function normalizeBoundedPositiveInt(
  value: unknown,
  defaultValue: number,
  maxValue: number
): number {
  const max = Number.isFinite(maxValue) && maxValue >= 1
    ? Math.floor(maxValue)
    : 1
  const fallbackRaw = Number.isFinite(defaultValue) && defaultValue >= 1
    ? Math.floor(defaultValue)
    : 1
  const fallback = Math.min(Math.max(1, fallbackRaw), max)

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback
  }
  const floored = Math.floor(value)
  if (floored < 1) {
    return fallback
  }
  return Math.min(floored, max)
}

const getBlockCached = async (blockId: DbId): Promise<Block | undefined> => {
  if (blockCache.has(blockId)) {
    return blockCache.get(blockId) ?? undefined
  }

  const block = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
  blockCache.set(blockId, block ?? null)
  return block
}

/**
 * 清除指定块的缓存
 * 在外部模块修改块属性后调用，确保下次读取获取最新数据
 *
 * @param blockId - 块 ID
 */
export const invalidateBlockCache = (blockId: DbId): void => {
  blockCache.delete(blockId)
}

/**
 * 用已获取的完整块预热本轮缓存（例如 get-blocks-with-tags 返回值）。
 * 不发起后端请求；覆盖同 id 的既有缓存条目。
 * 写入/评分后的 invalidateBlockCache / save* 失效语义不变。
 *
 * @returns 写入缓存的块数量
 */
export function preheatBlockCache(blocks: ReadonlyArray<Block | null | undefined>): number {
  let count = 0
  for (const block of blocks) {
    if (block == null || block.id == null) continue
    blockCache.set(block.id, block)
    count++
  }
  return count
}

/**
 * 清空全部块缓存（测试与单轮收集边界清理用）。
 * 生产路径依赖 invalidateBlockCache 做精确失效，不应依赖本函数作长期索引。
 */
export function clearBlockCache(): void {
  blockCache.clear()
}

/** 测试/诊断：指定块是否已在缓存中 */
export function hasBlockCacheEntry(blockId: DbId): boolean {
  return blockCache.has(blockId)
}

export type PrefetchBlocksByIdsOptions = {
  batchSize?: number
  concurrency?: number
  /** 跳过已在缓存中的 id */
  skipCached?: boolean
}

export type PrefetchBlocksByIdsResult = {
  requestedIds: number
  fetchedIds: number
  batchCount: number
  concurrencyPeak: number
  getBlocksCalls: number
}

/**
 * 对缺失块 id 用正式 `get-blocks` 分批预热缓存。
 * 批次大小与并发均有固定上限；批量失败会抛出，不得静默吞掉。
 */
export async function prefetchBlocksByIds(
  blockIds: ReadonlyArray<DbId>,
  options: PrefetchBlocksByIdsOptions = {}
): Promise<PrefetchBlocksByIdsResult> {
  const batchSize = normalizeBoundedPositiveInt(
    options.batchSize,
    BLOCK_PREFETCH_BATCH_SIZE,
    BLOCK_PREFETCH_BATCH_SIZE
  )
  const concurrency = normalizeBoundedPositiveInt(
    options.concurrency,
    BLOCK_PREFETCH_CONCURRENCY,
    BLOCK_PREFETCH_CONCURRENCY
  )
  const skipCached = options.skipCached !== false

  const unique: DbId[] = []
  const seen = new Set<DbId>()
  for (const id of blockIds) {
    if (id == null || seen.has(id)) continue
    seen.add(id)
    if (skipCached && blockCache.has(id)) continue
    unique.push(id)
  }

  if (unique.length === 0) {
    return {
      requestedIds: 0,
      fetchedIds: 0,
      batchCount: 0,
      concurrencyPeak: 0,
      getBlocksCalls: 0
    }
  }

  const batches: DbId[][] = []
  for (let i = 0; i < unique.length; i += batchSize) {
    batches.push(unique.slice(i, i + batchSize))
  }

  let concurrencyPeak = 0
  let active = 0
  let getBlocksCalls = 0
  let fetchedIds = 0

  await runBoundedConcurrency(batches, concurrency, async (batch) => {
    active++
    if (active > concurrencyPeak) concurrencyPeak = active
    try {
      getBlocksCalls++
      const result = (await orca.invokeBackend("get-blocks", batch)) as
        | Block[]
        | undefined
        | null
      if (!Array.isArray(result)) {
        throw new Error(
          `[storage] get-blocks 返回非数组（batchSize=${batch.length}）`
        )
      }
      for (const block of result) {
        if (block == null || block.id == null) continue
        blockCache.set(block.id, block)
        fetchedIds++
      }
      // 请求了但未返回的 id：缓存为 null，避免随后逐个 get-block 风暴
      const returned = new Set(
        result.filter((b): b is Block => b != null && b.id != null).map((b) => b.id)
      )
      for (const id of batch) {
        if (!returned.has(id) && !blockCache.has(id)) {
          blockCache.set(id, null)
        }
      }
    } catch (error) {
      console.error(
        `[storage] get-blocks 批量读取失败（ids=${batch.slice(0, 8).join(",")}${batch.length > 8 ? "…" : ""} count=${batch.length}）:`,
        error
      )
      throw error
    } finally {
      active--
    }
  })

  return {
    requestedIds: unique.length,
    fetchedIds,
    batchCount: batches.length,
    concurrencyPeak,
    getBlocksCalls
  }
}

/**
 * 固定上限并发执行任务（worker 数量 = min(normalizedConcurrency, items.length)）。
 * 禁止对全量 items 做无上限 Promise.all。
 * concurrency 经归一化：NaN/Infinity/小数/过大均不会创建无界 runner。
 *
 * @param hardMax - 并发硬上限，默认 BLOCK_PREFETCH_CONCURRENCY（4）
 */
export async function runBoundedConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  hardMax: number = BLOCK_PREFETCH_CONCURRENCY
): Promise<void> {
  const limit = normalizeBoundedPositiveInt(
    concurrency,
    BLOCK_PREFETCH_CONCURRENCY,
    hardMax
  )
  if (items.length === 0) return

  let next = 0
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++
        await worker(items[index], index)
      }
    }
  )
  await Promise.all(runners)
}

const hasPropertyWithPrefix = (block: Block | undefined, prefix: string): boolean =>
  !!block?.properties?.some(prop => prop.name.startsWith(prefix))

/**
 * 顶层普通卡调度属性（排除 srs.isCard、cloze/direction 命名空间）。
 * 仅有 srs.isCard 不算“已初始化调度”。
 */
export function blockHasTopLevelSrsScheduling(
  block: Block | null | undefined
): boolean {
  if (!block?.properties?.length) return false
  return block.properties.some((prop) => {
    const name = prop.name
    if (typeof name !== "string" || !name.startsWith("srs.")) return false
    if (name === "srs.isCard") return false
    if (/^srs\.c\d+\./.test(name)) return false
    if (name.startsWith("srs.forward.") || name.startsWith("srs.backward.")) {
      return false
    }
    return true
  })
}

/**
 * 是否已有不可覆盖的顶层复习进度（至少复习过一次或有 lastReviewed）。
 * Extract 自动标记写入的 reps=0 空壳不算真进度。
 */
export function cardSrsHasMeaningfulProgress(
  state: Pick<SrsState, "reps" | "lastReviewed">
): boolean {
  if (state.reps > 0) return true
  if (state.lastReviewed != null) return true
  return false
}


// ============================================================================
// 工具函数
// ============================================================================

/**
 * 构建属性名称
 * @param base - 基础属性名（如 "stability", "due" 等）
 * @param clozeNumber - 填空编号（可选，普通卡片不传）
 * @returns 完整的属性名
 */
const buildPropertyName = (base: string, clozeNumber?: number): string =>
  clozeNumber !== undefined ? `srs.c${clozeNumber}.${base}` : `srs.${base}`

/**
 * 构建方向卡属性名称
 * @param base - 基础属性名（如 "stability", "due" 等）
 * @param directionType - 方向类型（"forward" 或 "backward"）
 * @returns 完整的属性名
 */
const buildDirectionPropertyName = (
  base: string,
  directionType: "forward" | "backward"
): string => `srs.${directionType}.${base}`

/**
 * 从块属性中读取指定名称的值
 */
const readProp = (block: Block | undefined, name: string): any =>
  block?.properties?.find(prop => prop.name === name)?.value

/**
 * 解析数字值，无效时返回默认值
 */
const parseNumber = (value: any, fallback: number): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

/**
 * 解析日期值，无效时返回默认值
 */
const parseDate = (value: any, fallback: Date | null): Date | null => {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

/** ts-fsrs State 枚举的合法取值（0=New, 1=Learning, 2=Review, 3=Relearning） */
const FSRS_STATE_VALUES: ReadonlySet<number> = new Set([
  State.New,
  State.Learning,
  State.Review,
  State.Relearning
])

/**
 * 解析 FSRS state 枚举值。
 * 块属性是可被外部改写的持久化数据：越界/非整数的 state（如 7、"abc"）若原样
 * 流入 ts-fsrs，评分时会在调度器内部失败，导致该卡永远无法评分。
 * 此处按枚举白名单校验：非法值回退 State.New 并 console.warn（错误可见但不中断读取）；
 * 缺失值（undefined/null）视为未初始化，静默回退，不告警。
 */
const parseFsrsState = (value: any, blockId: DbId, propertyName: string): State => {
  if (value === undefined || value === null) return State.New
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN
  if (Number.isInteger(num) && FSRS_STATE_VALUES.has(num)) {
    return num as State
  }
  console.warn(
    `[storage] 块 ${blockId} 的 ${propertyName} 值非法（${JSON.stringify(value)}），已回退为 State.New（合法值：0-3）`
  )
  return State.New
}

// ============================================================================
// 核心内部函数（统一的加载/保存逻辑）
// ============================================================================

/**
 * 内部函数：加载 SRS 状态
 * 统一处理普通卡片和 Cloze 卡片的状态加载
 *
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号（可选，普通卡片不传）
 * @returns SRS 状态
 */
const loadSrsStateInternal = async (
  blockId: DbId,
  clozeNumber?: number
): Promise<SrsState> => {
  const now = new Date()
  const initial = createInitialSrsState(now)
  const block = await getBlockCached(blockId)

  if (!block) {
    return initial
  }

  // 使用统一的属性名构建函数
  const getPropValue = (base: string) =>
    readProp(block, buildPropertyName(base, clozeNumber))

  return {
    stability: parseNumber(getPropValue("stability"), initial.stability),
    difficulty: parseNumber(getPropValue("difficulty"), initial.difficulty),
    interval: parseNumber(getPropValue("interval"), initial.interval),
    due: parseDate(getPropValue("due"), initial.due) ?? initial.due,
    lastReviewed: parseDate(getPropValue("lastReviewed"), initial.lastReviewed),
    reps: parseNumber(getPropValue("reps"), initial.reps),
    lapses: parseNumber(getPropValue("lapses"), initial.lapses),
    // 读取保存的 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）；脏值回退 State.New
    state: parseFsrsState(
      getPropValue("state"),
      blockId,
      buildPropertyName("state", clozeNumber)
    ),
    resets: parseNumber(getPropValue("resets"), 0)
  }
}

/**
 * 内部函数：保存 SRS 状态
 * 统一处理普通卡片和 Cloze 卡片的状态保存
 *
 * @param blockId - 块 ID
 * @param newState - 新的 SRS 状态
 * @param clozeNumber - 填空编号（可选，普通卡片不传）
 */
const saveSrsStateInternal = async (
  blockId: DbId,
  newState: SrsState,
  clozeNumber?: number
): Promise<void> => {
  // 构建属性列表
  const properties = [
    { name: buildPropertyName("stability", clozeNumber), value: newState.stability, type: 3 },
    { name: buildPropertyName("difficulty", clozeNumber), value: newState.difficulty, type: 3 },
    { name: buildPropertyName("lastReviewed", clozeNumber), value: newState.lastReviewed ?? null, type: 5 },
    { name: buildPropertyName("interval", clozeNumber), value: newState.interval, type: 3 },
    { name: buildPropertyName("due", clozeNumber), value: newState.due, type: 5 },
    { name: buildPropertyName("reps", clozeNumber), value: newState.reps, type: 3 },
    { name: buildPropertyName("lapses", clozeNumber), value: newState.lapses, type: 3 },
    { name: buildPropertyName("resets", clozeNumber), value: newState.resets ?? 0, type: 3 },
    // 保存 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    { name: buildPropertyName("state", clozeNumber), value: newState.state ?? 0, type: 3 }
  ]

  // 普通卡片需要额外添加 isCard 标记
  if (clozeNumber === undefined) {
    properties.unshift({ name: "srs.isCard", value: true as any, type: 4 })
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    properties
  )

  // 写入后使缓存失效，避免后续读取仍拿到旧 properties 导致状态不刷新
  blockCache.delete(blockId)
}

// ============================================================================
// 普通卡片 API
// ============================================================================

/**
 * 加载普通卡片的 SRS 状态
 */
export const loadCardSrsState = (blockId: DbId): Promise<SrsState> =>
  loadSrsStateInternal(blockId)

/**
 * 保存普通卡片的 SRS 状态
 */
export const saveCardSrsState = (blockId: DbId, newState: SrsState): Promise<void> =>
  saveSrsStateInternal(blockId, newState)

/**
 * 为普通卡片写入初始 SRS 状态
 */
export const writeInitialSrsState = async (
  blockId: DbId,
  now: Date = new Date()
): Promise<SrsState> => {
  const initial = createInitialSrsState(now)
  await saveCardSrsState(blockId, initial)
  return initial
}

/**
 * 更新普通卡片的 SRS 状态（评分后）
 */
export const updateSrsState = async (blockId: DbId, grade: Grade, pluginName?: string) => {
  const prev = await loadCardSrsState(blockId)
  const result = nextReviewState(prev, grade, new Date(), pluginName)
  await saveCardSrsState(blockId, result.state)
  return result
}

// ============================================================================
// Cloze 卡片 API
// ============================================================================

/**
 * 加载 Cloze 卡片某个填空的 SRS 状态
 *
 * 属性命名：srs.c1.due, srs.c1.interval, srs.c1.stability 等
 *
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号（1, 2, 3...）
 * @returns SRS 状态
 */
export const loadClozeSrsState = (
  blockId: DbId,
  clozeNumber: number
): Promise<SrsState> => loadSrsStateInternal(blockId, clozeNumber)

/**
 * 保存 Cloze 卡片某个填空的 SRS 状态
 *
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号
 * @param newState - 新的 SRS 状态
 */
export const saveClozeSrsState = (
  blockId: DbId,
  clozeNumber: number,
  newState: SrsState
): Promise<void> => saveSrsStateInternal(blockId, newState, clozeNumber)

/**
 * 为 Cloze 卡片的某个填空写入初始 SRS 状态
 *
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号
 * @param daysOffset - 距离今天的天数偏移（c1=0, c2=1, c3=2...）；当 initialDue 缺省时使用
 * @param initialDue - 可选绝对首次 due（IR Item 分散路径）；提供时忽略 daysOffset
 */
export const writeInitialClozeSrsState = async (
  blockId: DbId,
  clozeNumber: number,
  daysOffset: number = 0,
  initialDue?: Date
): Promise<SrsState> => {
  let dueDate: Date
  if (initialDue != null) {
    dueDate = new Date(initialDue.getTime())
  } else {
    const now = new Date()
    dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + daysOffset)
    dueDate.setHours(0, 0, 0, 0) // 设置为当天零点
  }

  const initial = createInitialSrsState(dueDate)
  await saveClozeSrsState(blockId, clozeNumber, initial)
  return initial
}

/**
 * 更新 Cloze 卡片某个填空的 SRS 状态
 *
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号
 * @param grade - 评分
 * @param pluginName - 插件名称（用于读取 FSRS 权重设置）
 */
export const updateClozeSrsState = async (
  blockId: DbId,
  clozeNumber: number,
  grade: Grade,
  pluginName?: string
) => {
  const prev = await loadClozeSrsState(blockId, clozeNumber)
  const result = nextReviewState(prev, grade, new Date(), pluginName)
  await saveClozeSrsState(blockId, clozeNumber, result.state)
  return result
}

// ============================================================================
// Direction 卡片 API
// ============================================================================

/**
 * 加载方向卡某个方向的 SRS 状态
 *
 * 属性命名：srs.forward.due, srs.backward.stability 等
 *
 * @param blockId - 块 ID
 * @param directionType - 方向类型（"forward" 或 "backward"）
 * @returns SRS 状态
 */
export const loadDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward"
): Promise<SrsState> => {
  const now = new Date()
  const initial = createInitialSrsState(now)
  const block = await getBlockCached(blockId)

  if (!block) {
    return initial
  }

  const getPropValue = (base: string) =>
    readProp(block, buildDirectionPropertyName(base, directionType))

  return {
    stability: parseNumber(getPropValue("stability"), initial.stability),
    difficulty: parseNumber(getPropValue("difficulty"), initial.difficulty),
    interval: parseNumber(getPropValue("interval"), initial.interval),
    due: parseDate(getPropValue("due"), initial.due) ?? initial.due,
    lastReviewed: parseDate(getPropValue("lastReviewed"), initial.lastReviewed),
    reps: parseNumber(getPropValue("reps"), initial.reps),
    lapses: parseNumber(getPropValue("lapses"), initial.lapses),
    // 读取保存的 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）；脏值回退 State.New
    state: parseFsrsState(
      getPropValue("state"),
      blockId,
      buildDirectionPropertyName("state", directionType)
    ),
    resets: parseNumber(getPropValue("resets"), 0)
  }
}

/**
 * 保存方向卡某个方向的 SRS 状态
 *
 * @param blockId - 块 ID
 * @param directionType - 方向类型
 * @param newState - 新的 SRS 状态
 */
export const saveDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward",
  newState: SrsState
): Promise<void> => {
  const properties = [
    { name: buildDirectionPropertyName("stability", directionType), value: newState.stability, type: 3 },
    { name: buildDirectionPropertyName("difficulty", directionType), value: newState.difficulty, type: 3 },
    { name: buildDirectionPropertyName("interval", directionType), value: newState.interval, type: 3 },
    { name: buildDirectionPropertyName("due", directionType), value: newState.due, type: 5 },
    { name: buildDirectionPropertyName("lastReviewed", directionType), value: newState.lastReviewed ?? null, type: 5 },
    { name: buildDirectionPropertyName("reps", directionType), value: newState.reps, type: 3 },
    { name: buildDirectionPropertyName("lapses", directionType), value: newState.lapses, type: 3 },
    { name: buildDirectionPropertyName("resets", directionType), value: newState.resets ?? 0, type: 3 },
    // 保存 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    { name: buildDirectionPropertyName("state", directionType), value: newState.state ?? 0, type: 3 }
  ]

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    properties
  )

  // 写入后使缓存失效，避免后续读取仍拿到旧 properties 导致状态不刷新
  blockCache.delete(blockId)
}

/**
 * 为方向卡写入初始 SRS 状态
 *
 * @param blockId - 块 ID
 * @param directionType - 方向类型
 * @param daysOffset - 距离今天的天数偏移（forward=0, backward=1）；initialDue 缺省时使用
 * @param initialDue - 可选绝对首次 due（IR Item 分散路径）；提供时忽略 daysOffset
 * @returns 初始 SRS 状态
 */
export const writeInitialDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward",
  daysOffset: number = 0,
  initialDue?: Date
): Promise<SrsState> => {
  let dueDate: Date
  if (initialDue != null) {
    dueDate = new Date(initialDue.getTime())
  } else {
    const now = new Date()
    dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + daysOffset)
    dueDate.setHours(0, 0, 0, 0)
  }

  const initial = createInitialSrsState(dueDate)
  await saveDirectionSrsState(blockId, directionType, initial)
  return initial
}

/**
 * 更新方向卡某个方向的 SRS 状态
 *
 * @param blockId - 块 ID
 * @param directionType - 方向类型
 * @param grade - 评分
 * @param pluginName - 插件名称（用于读取 FSRS 权重设置）
 * @returns { state, log }
 */
export const updateDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward",
  grade: Grade,
  pluginName?: string
) => {
  const prev = await loadDirectionSrsState(blockId, directionType)
  const result = nextReviewState(prev, grade, new Date(), pluginName)
  await saveDirectionSrsState(blockId, directionType, result.state)
  return result
}

// ============================================================================
// 初始化保障（避免因部分 block 缺少 properties 而反复重置进度）
// ============================================================================

/**
 * 确保普通卡片存在 SRS 属性：若块上没有任何 `srs.` 前缀属性，则写入初始状态。
 *
 * 注意：这里用后端 get-block 的结果判断是否已初始化，避免使用 `block.properties` 的“半数据”误判，
 * 否则会出现每次收集时都把卡片重置为 reps=0 的问题。
 */
export const ensureCardSrsState = async (
  blockId: DbId,
  now: Date = new Date()
): Promise<SrsState> => {
  const block = await getBlockCached(blockId)
  const hasAnySrsProps = hasPropertyWithPrefix(block, "srs.")
  if (!hasAnySrsProps) {
    return await writeInitialSrsState(blockId, now)
  }
  return await loadCardSrsState(blockId)
}

/**
 * 确保普通卡片存在 SRS 属性（支持自定义初始 due）
 *
 * - 无顶层调度属性（可仅有 srs.isCard）→ 写入 initialDue
 * - 有调度但无真进度（reps=0 且无 lastReviewed）且 forceIfNoProgress
 *   → 覆盖写入 initialDue（用于 Extract 遗留壳 / IR Item 首次分散）
 * - 已有真进度 → 绝不覆盖
 *
 * 列表卡等路径默认 forceIfNoProgress=false，保持旧行为（有任意顶层调度则不动）。
 */
export const ensureCardSrsStateWithInitialDue = async (
  blockId: DbId,
  initialDue: Date,
  options?: { forceIfNoProgress?: boolean }
): Promise<SrsState> => {
  const block = await getBlockCached(blockId)
  const hasScheduling = blockHasTopLevelSrsScheduling(block)
  if (!hasScheduling) {
    return await writeInitialSrsState(blockId, initialDue)
  }
  const existing = await loadCardSrsState(blockId)
  if (
    options?.forceIfNoProgress === true
    && !cardSrsHasMeaningfulProgress(existing)
  ) {
    return await writeInitialSrsState(blockId, initialDue)
  }
  return existing
}

/**
 * 确保 Cloze 某个填空编号存在 SRS 属性：若没有 `srs.cN.` 前缀属性，则写入初始状态（含分天偏移）。
 * 已有 `srs.cN.*` 时绝不覆盖（升级插件不会重排旧卡）。
 */
export const ensureClozeSrsState = async (
  blockId: DbId,
  clozeNumber: number,
  daysOffset: number = 0,
  initialDue?: Date
): Promise<SrsState> => {
  const block = await getBlockCached(blockId)
  const prefix = `srs.c${clozeNumber}.`
  if (!hasPropertyWithPrefix(block, prefix)) {
    return await writeInitialClozeSrsState(
      blockId,
      clozeNumber,
      daysOffset,
      initialDue
    )
  }
  return await loadClozeSrsState(blockId, clozeNumber)
}

/**
 * 确保 Direction 某个方向存在 SRS 属性：若没有 `srs.forward.` / `srs.backward.` 前缀属性，则写入初始状态（含分天偏移）。
 * 已有前缀属性时绝不覆盖。
 */
export const ensureDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward",
  daysOffset: number = 0,
  initialDue?: Date
): Promise<SrsState> => {
  const block = await getBlockCached(blockId)
  const prefix = `srs.${directionType}.`
  if (!hasPropertyWithPrefix(block, prefix)) {
    return await writeInitialDirectionSrsState(
      blockId,
      directionType,
      daysOffset,
      initialDue
    )
  }
  return await loadDirectionSrsState(blockId, directionType)
}

// ============================================================================
// 重置卡片 API
// ============================================================================

/**
 * 重置普通卡片为新卡状态
 * 保留重置次数计数，其他状态重置为初始值
 *
 * @param blockId - 块 ID
 * @returns 重置后的 SRS 状态
 */
export const resetCardSrsState = async (blockId: DbId): Promise<SrsState> => {
  const prev = await loadCardSrsState(blockId)
  const now = new Date()
  const initial = createInitialSrsState(now)
  const newState: SrsState = {
    ...initial,
    resets: (prev.resets ?? 0) + 1
  }
  await saveCardSrsState(blockId, newState)
  return newState
}

/**
 * 重置 Cloze 卡片某个填空为新卡状态
 *
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号
 * @returns 重置后的 SRS 状态
 */
export const resetClozeSrsState = async (
  blockId: DbId,
  clozeNumber: number
): Promise<SrsState> => {
  const prev = await loadClozeSrsState(blockId, clozeNumber)
  const now = new Date()
  const initial = createInitialSrsState(now)
  const newState: SrsState = {
    ...initial,
    resets: (prev.resets ?? 0) + 1
  }
  await saveClozeSrsState(blockId, clozeNumber, newState)
  return newState
}

/**
 * 重置方向卡某个方向为新卡状态
 *
 * @param blockId - 块 ID
 * @param directionType - 方向类型
 * @returns 重置后的 SRS 状态
 */
export const resetDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward"
): Promise<SrsState> => {
  const prev = await loadDirectionSrsState(blockId, directionType)
  const now = new Date()
  const initial = createInitialSrsState(now)
  const newState: SrsState = {
    ...initial,
    resets: (prev.resets ?? 0) + 1
  }
  await saveDirectionSrsState(blockId, directionType, newState)
  return newState
}

// ============================================================================
// 删除卡片 API
// ============================================================================

/**
 * 获取块上所有 SRS 属性名称
 */
const getSrsPropertyNames = async (blockId: DbId, prefix: string = "srs."): Promise<string[]> => {
  const block = await getBlockCached(blockId)
  if (!block?.properties) return []
  
  return block.properties
    .filter(prop => prop.name.startsWith(prefix))
    .map(prop => prop.name)
}

/**
 * 删除普通卡片的 Card 标记和所有 SRS 属性
 *
 * @param blockId - 块 ID
 */
export const deleteCardSrsData = async (blockId: DbId): Promise<void> => {
  const propertyNames = await getSrsPropertyNames(blockId, "srs.")
  
  if (propertyNames.length === 0) {
    return
  }
  
  await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [blockId],
    propertyNames
  )
  
  // 清除缓存
  blockCache.delete(blockId)
}

/**
 * 删除 Cloze 卡片某个填空的 SRS 属性
 *
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号
 */
export const deleteClozeCardSrsData = async (
  blockId: DbId,
  clozeNumber: number
): Promise<void> => {
  const prefix = `srs.c${clozeNumber}.`
  const propertyNames = await getSrsPropertyNames(blockId, prefix)
  
  if (propertyNames.length === 0) {
    return
  }
  
  await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [blockId],
    propertyNames
  )
  
  // 清除缓存
  blockCache.delete(blockId)
}

/** cloze 编号是否已有任意 `srs.cN.*` 属性（尾点号前缀，不伤 c10） */
export const hasClozeSrsData = async (
  blockId: DbId,
  clozeNumber: number
): Promise<boolean> => {
  if (!Number.isInteger(clozeNumber) || clozeNumber < 1) return false
  const names = await getSrsPropertyNames(blockId, `srs.c${clozeNumber}.`)
  return names.length > 0
}

export type MoveClozeCardSrsResult =
  | "moved"
  | "already-done"
  | "skipped-same"

export type MoveClozeCardSrsOptions = {
  /**
   * 计划迁移路径：源无数据时 —
   * - 目标已有数据 → 视为幂等完成（中断后重试）
   * - 目标也无 → 抛错（错误可见，禁止静默成功）
   */
  requireSource?: boolean
  /**
   * 目标槽已有属性时是否允许覆盖。
   * 默认 false：源有数据且目标非空则抛错，避免并发/脏写互踩。
   */
  overwriteTarget?: boolean
}

/**
 * 将某个 cloze 编号的 SRS 属性整体迁移到另一编号（保留进度）。
 * 用于图片遮罩删除编号后的连续重排（c3→c2 等）。
 *
 * - 前缀以 `srs.cN.` 结尾点号匹配，避免 c1 误伤 c10
 * - 写序：校验 →（可选清目标）→ 写目标 → 删源；任一步失败会抛错
 * - 不先无条件清目标：目标非空且未允许覆盖时中止，避免「先破坏再失败」
 */
export const moveClozeCardSrsData = async (
  blockId: DbId,
  fromNumber: number,
  toNumber: number,
  options?: MoveClozeCardSrsOptions
): Promise<MoveClozeCardSrsResult> => {
  if (!Number.isInteger(fromNumber) || fromNumber < 1) {
    throw new Error(`非法 cloze 源编号: ${fromNumber}`)
  }
  if (!Number.isInteger(toNumber) || toNumber < 1) {
    throw new Error(`非法 cloze 目标编号: ${toNumber}`)
  }
  if (fromNumber === toNumber) {
    return "skipped-same"
  }

  const fromPrefix = `srs.c${fromNumber}.`
  const toPrefix = `srs.c${toNumber}.`
  const block = await getBlockCached(blockId)
  const props = block?.properties ?? []
  const sourceProps = props.filter(p => p.name.startsWith(fromPrefix))
  const targetProps = props.filter(p => p.name.startsWith(toPrefix))
  const hasFrom = sourceProps.length > 0
  const hasTo = targetProps.length > 0

  if (!hasFrom) {
    if (hasTo) {
      // 幂等：上次已迁完（源已清、目标已有）
      return "already-done"
    }
    if (options?.requireSource) {
      throw new Error(
        `无法迁移 srs.c${fromNumber}.* → srs.c${toNumber}.*：源编号无 SRS 数据且目标为空（数据不一致）`
      )
    }
    return "already-done"
  }

  if (hasTo && !options?.overwriteTarget) {
    throw new Error(
      `无法迁移 srs.c${fromNumber}.* → srs.c${toNumber}.*：目标槽非空，拒绝覆盖（可能并发写入）`
    )
  }

  if (hasTo) {
    await deleteClozeCardSrsData(blockId, toNumber)
  }

  const properties = sourceProps.map(p => ({
    name: `${toPrefix}${p.name.slice(fromPrefix.length)}`,
    value: p.value,
    type: p.type ?? 3
  }))

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    properties
  )
  blockCache.delete(blockId)

  await deleteClozeCardSrsData(blockId, fromNumber)
  return "moved"
}

/**
 * 删除方向卡某个方向的 SRS 属性
 *
 * @param blockId - 块 ID
 * @param directionType - 方向类型
 */
export const deleteDirectionCardSrsData = async (
  blockId: DbId,
  directionType: "forward" | "backward"
): Promise<void> => {
  const prefix = `srs.${directionType}.`
  const propertyNames = await getSrsPropertyNames(blockId, prefix)
  
  if (propertyNames.length === 0) {
    return
  }
  
  await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [blockId],
    propertyNames
  )
  
  // 清除缓存
  blockCache.delete(blockId)
}
