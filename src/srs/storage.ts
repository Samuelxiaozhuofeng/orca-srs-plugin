/**
 * SRS 数据存储模块
 *
 * 负责 SRS 卡片状态的读取和保存
 * 支持三种卡片类型：
 * - 普通卡片：属性前缀为 "srs."
 * - Cloze 卡片：属性前缀为 "srs.cN."（N 为填空编号）
 * - Direction 卡片：属性前缀为 "srs.forward." 或 "srs.backward."
 */

import type { Block, DbId } from "../orca.d.ts"
import { createInitialSrsState, nextReviewState } from "./algorithm"
import type { Grade, SrsState } from "./types"

// ============================================================================
// 块读取缓存（避免同一轮收集/复习中重复 get-block 导致的性能浪费）
// ============================================================================

const blockCache = new Map<DbId, Block | null>()

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

const hasPropertyWithPrefix = (block: Block | undefined, prefix: string): boolean =>
  !!block?.properties?.some(prop => prop.name.startsWith(prefix))


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
    // 读取保存的 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    state: parseNumber(getPropValue("state"), initial.state ?? 0),
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
 * @param daysOffset - 距离今天的天数偏移（c1=0, c2=1, c3=2...）
 */
export const writeInitialClozeSrsState = async (
  blockId: DbId,
  clozeNumber: number,
  daysOffset: number = 0
): Promise<SrsState> => {
  const now = new Date()
  // 设置到期时间为今天 + daysOffset 天
  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + daysOffset)
  dueDate.setHours(0, 0, 0, 0) // 设置为当天零点

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
    // 读取保存的 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    state: parseNumber(getPropValue("state"), initial.state ?? 0),
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
 * @param daysOffset - 距离今天的天数偏移（forward=0, backward=1）
 * @returns 初始 SRS 状态
 */
export const writeInitialDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward",
  daysOffset: number = 0
): Promise<SrsState> => {
  const now = new Date()
  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + daysOffset)
  dueDate.setHours(0, 0, 0, 0)

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
 * 确保 Cloze 某个填空编号存在 SRS 属性：若没有 `srs.cN.` 前缀属性，则写入初始状态（含分天偏移）。
 */
export const ensureClozeSrsState = async (
  blockId: DbId,
  clozeNumber: number,
  daysOffset: number = 0
): Promise<SrsState> => {
  const block = await getBlockCached(blockId)
  const prefix = `srs.c${clozeNumber}.`
  if (!hasPropertyWithPrefix(block, prefix)) {
    return await writeInitialClozeSrsState(blockId, clozeNumber, daysOffset)
  }
  return await loadClozeSrsState(blockId, clozeNumber)
}

/**
 * 确保 Direction 某个方向存在 SRS 属性：若没有 `srs.forward.` / `srs.backward.` 前缀属性，则写入初始状态（含分天偏移）。
 */
export const ensureDirectionSrsState = async (
  blockId: DbId,
  directionType: "forward" | "backward",
  daysOffset: number = 0
): Promise<SrsState> => {
  const block = await getBlockCached(blockId)
  const prefix = `srs.${directionType}.`
  if (!hasPropertyWithPrefix(block, prefix)) {
    return await writeInitialDirectionSrsState(blockId, directionType, daysOffset)
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
