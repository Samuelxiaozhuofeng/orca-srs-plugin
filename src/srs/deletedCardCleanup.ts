/**
 * 已删除卡片清理模块（FC-04）
 *
 * 启动时按「块真实存在性 + 结构化身份」清理无效复习日志。
 * 不再以 collectSrsBlocks() 的结果作为删除真相；读取失败（unknown）时保留日志。
 */

import type { Block, DbId } from "../orca.d.ts"
import {
  buildCardKey,
  parentBlockIdFromLog
} from "./cardIdentity"
import { getAllClozeNumbers } from "./clozeUtils"
import { extractCardType } from "./deckUtils"
import { extractDirectionInfo, getDirectionList } from "./directionUtils"
import { isSrsCardBlock, type BlockWithRepr } from "./blockUtils"
import { clearLogCache } from "./reviewLogStorage"
import { isChoiceTag } from "./tagUtils"
import type { CardType, ReviewLogEntry, ReviewLogStorage } from "./types"

/**
 * 是否仍可视为 SRS 卡片块。
 * Choice 卡可能只有 #choice 标签而无 #card，需单独识别。
 */
function isStillSrsCard(block: BlockWithRepr): boolean {
  if (isSrsCardBlock(block)) return true
  return block.refs?.some(ref => ref.type === 2 && isChoiceTag(ref.alias)) ?? false
}

/** 块读取三态 */
export type BlockExistenceStatus = "exists" | "missing" | "unknown"

/** 单条日志清理判定 */
export type LogRetentionDecision = "keep" | "delete" | "unknown"

/** 清理结果报告 */
export type CleanupDeletedCardsReport = {
  cleanedCount: number
  retainedUnknownCount: number
  errors: string[]
}

type BlockResolveResult = {
  status: BlockExistenceStatus
  block?: Block
  error?: unknown
}

// 存储键前缀（与 reviewLogStorage.ts 保持一致）
const STORAGE_KEY_PREFIX = "reviewLogs"

/**
 * 单次清理运行内的块读取缓存，避免对同一 blockId 重复后端调用
 */
export class BlockExistenceCache {
  private cache = new Map<DbId, BlockResolveResult>()

  async resolve(blockId: DbId): Promise<BlockResolveResult> {
    const cached = this.cache.get(blockId)
    if (cached) return cached

    // orca.state.blocks 仅作命中缓存：有则 exists；缺失不代表 missing
    const fromState = orca.state?.blocks?.[blockId]
    if (fromState) {
      const hit: BlockResolveResult = { status: "exists", block: fromState as Block }
      this.cache.set(blockId, hit)
      return hit
    }

    try {
      const block = (await orca.invokeBackend("get-block", blockId)) as Block | null | undefined
      // 仅 null/undefined 视为 missing；抛错为 unknown
      if (block == null) {
        const missing: BlockResolveResult = { status: "missing" }
        this.cache.set(blockId, missing)
        return missing
      }
      const exists: BlockResolveResult = { status: "exists", block }
      this.cache.set(blockId, exists)
      return exists
    } catch (error) {
      const unknown: BlockResolveResult = { status: "unknown", error }
      this.cache.set(blockId, unknown)
      return unknown
    }
  }

  /** 测试用：预置缓存 */
  set(blockId: DbId, result: BlockResolveResult): void {
    this.cache.set(blockId, result)
  }
}

/**
 * 解析块存在性（三态）。同一 cleanup 运行应复用 BlockExistenceCache。
 */
export async function resolveBlockExistence(
  blockId: DbId,
  cache?: BlockExistenceCache
): Promise<BlockResolveResult> {
  const c = cache ?? new BlockExistenceCache()
  return c.resolve(blockId)
}

/**
 * 验证卡片块是否存在（兼容导出）。
 *
 * - exists → true
 * - missing → false
 * - unknown → 抛出错误（不得将 unknown 当作 false）
 */
export async function isCardBlockExists(blockId: DbId): Promise<boolean> {
  const result = await resolveBlockExistence(blockId)
  if (result.status === "unknown") {
    const detail =
      result.error instanceof Error ? result.error.message : String(result.error ?? "unknown error")
    throw new Error(
      `[isCardBlockExists] 无法确认块是否存在 (blockId=${blockId}): ${detail}`
    )
  }
  return result.status === "exists"
}

/**
 * 是否存在任一结构化身份痕迹。
 * 用于区分「纯 v1 legacy」与「部分结构化 / 完整结构化」——
 * 不得仅因 isStructuredReviewLog 失败就把部分字段日志当 legacy。
 */
export function hasStructuredIdentityTrace(
  log: Pick<
    ReviewLogEntry,
    | "legacy"
    | "blockId"
    | "cardType"
    | "cardKey"
    | "clozeNumber"
    | "directionType"
    | "listItemId"
  >
): boolean {
  if (log.legacy === false) return true
  if (log.blockId != null) return true
  if (log.cardType != null) return true
  if (
    typeof log.cardKey === "string" &&
    log.cardKey.length > 0 &&
    !log.cardKey.startsWith("legacy:")
  ) {
    return true
  }
  if (log.clozeNumber != null) return true
  if (log.directionType != null) return true
  if (log.listItemId != null) return true
  return false
}

/**
 * 清理路径上是否应按 pure legacy 规则处理。
 * 仅：明确 legacy===true，或完全无结构化身份痕迹的 v1 日志。
 */
export function isLegacyCleanupLog(
  log: Pick<
    ReviewLogEntry,
    | "legacy"
    | "blockId"
    | "cardType"
    | "cardKey"
    | "clozeNumber"
    | "directionType"
    | "listItemId"
  >
): boolean {
  if (log.legacy === true) return true
  return !hasStructuredIdentityTrace(log)
}

/**
 * 结构化日志字段是否完整且与 cardKey 一致
 */
function structuredIdentityIsComplete(log: ReviewLogEntry): {
  ok: boolean
  reason?: string
} {
  if (log.blockId == null || log.cardType == null || !log.cardKey) {
    return { ok: false, reason: "缺少 blockId/cardType/cardKey" }
  }

  const cardType = log.cardType
  if (cardType === "cloze" && log.clozeNumber == null) {
    return { ok: false, reason: "cloze 日志缺少 clozeNumber" }
  }
  if (cardType === "direction" && !log.directionType) {
    return { ok: false, reason: "direction 日志缺少 directionType" }
  }
  if (cardType === "list" && log.listItemId == null) {
    return { ok: false, reason: "list 日志缺少 listItemId" }
  }

  try {
    const expectedKey = buildCardKey({
      blockId: log.blockId,
      cardType,
      clozeNumber: log.clozeNumber,
      directionType: log.directionType,
      listItemId: log.listItemId
    })
    if (log.cardKey !== expectedKey) {
      return {
        ok: false,
        reason: `cardKey 不一致（log=${log.cardKey}, expected=${expectedKey}）`
      }
    }
  } catch (error) {
    return {
      ok: false,
      reason: `无法校验 cardKey: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return { ok: true }
}

/**
 * 判定单条复习日志是否仍有效
 */
export async function evaluateReviewLogRetention(
  log: ReviewLogEntry,
  pluginName: string,
  cache: BlockExistenceCache
): Promise<{ decision: LogRetentionDecision; reason: string }> {
  // —— pure legacy：仅检查 cardId 存在性（不猜卡型、不因缺 #card 删除）——
  // 不得把「有部分结构化字段但缺 cardKey」误判为 legacy
  if (isLegacyCleanupLog(log)) {
    const cardId = log.cardId
    if (cardId == null) {
      return {
        decision: "unknown",
        reason: "legacy 日志缺少 cardId，无法判定"
      }
    }
    const existence = await cache.resolve(cardId)
    if (existence.status === "exists") {
      return { decision: "keep", reason: "legacy：cardId 对应块存在" }
    }
    if (existence.status === "missing") {
      return { decision: "delete", reason: "legacy：cardId 对应块 missing" }
    }
    return {
      decision: "unknown",
      reason: `legacy：读取 cardId=${cardId} 失败（unknown）`
    }
  }

  // —— 结构化（完整或部分）：字段不完整/矛盾时，除非父块明确 missing，否则保留 ——
  const completeness = structuredIdentityIsComplete(log)

  if (!completeness.ok) {
    // 仅当有明确父块 blockId 且其 missing 时才允许删除；
    // 缺 blockId 时不得用 cardId（可能是 listItemId）冒充父块而误删
    if (log.blockId != null) {
      const parent = await cache.resolve(log.blockId)
      if (parent.status === "missing") {
        return {
          decision: "delete",
          reason: `结构化字段无效（${completeness.reason}）且父块 missing`
        }
      }
      return {
        decision: "unknown",
        reason: `结构化字段无效/矛盾：${completeness.reason}（父块 status=${parent.status}）`
      }
    }
    return {
      decision: "unknown",
      reason: `结构化字段无效/矛盾：${completeness.reason}（无明确 blockId，无法确认父块 missing）`
    }
  }

  const parentId = parentBlockIdFromLog(log)
  const parent = await cache.resolve(parentId)

  if (parent.status === "missing") {
    return { decision: "delete", reason: `父块 blockId=${parentId} missing` }
  }
  if (parent.status === "unknown") {
    return {
      decision: "unknown",
      reason: `读取父块 blockId=${parentId} 失败（unknown）`
    }
  }

  const parentBlock = parent.block as BlockWithRepr
  const currentType = extractCardType(parentBlock)
  const stillSrs = isStillSrsCard(parentBlock)
  const logType = log.cardType as CardType

  // List 卡：父列表 + 子条目双重要求
  if (logType === "list") {
    const listItemId = log.listItemId!
    if (!stillSrs || currentType !== "list") {
      return {
        decision: "delete",
        reason: `父块不再是 list 卡（stillSrs=${stillSrs}, type=${currentType}）`
      }
    }
    const children = parentBlock.children ?? []
    if (!children.includes(listItemId)) {
      return {
        decision: "delete",
        reason: `listItemId=${listItemId} 不再属于父列表 children`
      }
    }
    const child = await cache.resolve(listItemId)
    if (child.status === "missing") {
      return {
        decision: "delete",
        reason: `list 子条目 listItemId=${listItemId} missing`
      }
    }
    if (child.status === "unknown") {
      return {
        decision: "unknown",
        reason: `读取 list 子条目 listItemId=${listItemId} 失败（unknown）`
      }
    }
    return {
      decision: "keep",
      reason: "list：父块存在且为 list，子条目存在且在 children 中"
    }
  }

  // Cloze：类型仍为 cloze，且 clozeNumber 仍出现在内容中
  if (logType === "cloze") {
    if (!stillSrs || currentType !== "cloze") {
      return {
        decision: "delete",
        reason: `父块不再是 cloze 卡（stillSrs=${stillSrs}, type=${currentType}）`
      }
    }
    const numbers = getAllClozeNumbers(parentBlock.content, pluginName)
    if (!numbers.includes(log.clozeNumber!)) {
      return {
        decision: "delete",
        reason: `clozeNumber=${log.clozeNumber} 已不在块内容中`
      }
    }
    return { decision: "keep", reason: "cloze：父块存在且编号仍有效" }
  }

  // Direction：类型仍为 direction，且方向仍在当前定义生成的集合中
  if (logType === "direction") {
    if (!stillSrs || currentType !== "direction") {
      return {
        decision: "delete",
        reason: `父块不再是 direction 卡（stillSrs=${stillSrs}, type=${currentType}）`
      }
    }
    const dirInfo = extractDirectionInfo(parentBlock.content, pluginName)
    if (!dirInfo) {
      return {
        decision: "delete",
        reason: "direction 块内容中无方向标记"
      }
    }
    const allowed = getDirectionList(dirInfo.direction)
    if (!allowed.includes(log.directionType!)) {
      return {
        decision: "delete",
        reason: `directionType=${log.directionType} 不在当前方向集合 [${allowed.join(",")}]`
      }
    }
    return { decision: "keep", reason: "direction：父块存在且方向仍有效" }
  }

  // Basic / Excerpt / Choice 及其余：父块存在、仍是 SRS 卡、cardType 相符
  if (!stillSrs) {
    return {
      decision: "delete",
      reason: `父块不再是 SRS 卡（logType=${logType}）`
    }
  }
  if (currentType !== logType) {
    return {
      decision: "delete",
      reason: `cardType 已改变（log=${logType}, current=${currentType}）`
    }
  }
  return {
    decision: "keep",
    reason: `${logType}：父块存在且类型相符`
  }
}

/**
 * 扫描并清理已删除/失效卡片的复习日志
 *
 * @param pluginName - 插件名称
 * @returns 清理报告（cleanedCount / retainedUnknownCount / errors）
 */
export async function cleanupDeletedCards(
  pluginName: string
): Promise<CleanupDeletedCardsReport> {
  console.log(`[${pluginName}] 开始扫描已删除的卡片日志...`)

  const report: CleanupDeletedCardsReport = {
    cleanedCount: 0,
    retainedUnknownCount: 0,
    errors: []
  }
  const cache = new BlockExistenceCache()
  let storageMutated = false

  try {
    let allKeys: string[]
    try {
      allKeys = await orca.plugins.getDataKeys(pluginName)
    } catch (error) {
      const msg = `[${pluginName}] getDataKeys 失败，中止清理: ${
        error instanceof Error ? error.message : String(error)
      }`
      console.error(msg, error)
      report.errors.push(msg)
      return report
    }

    const reviewLogKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX))
    if (reviewLogKeys.length === 0) {
      console.log(`[${pluginName}] 没有复习日志分片需要清理`)
      return report
    }

    for (const storageKey of reviewLogKeys) {
      let storedData: string | null
      try {
        storedData = (await orca.plugins.getData(pluginName, storageKey)) as string | null
      } catch (error) {
        const msg = `[${pluginName}] getData 失败 storageKey=${storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
        console.error(msg, error)
        report.errors.push(msg)
        continue
      }

      if (!storedData) continue

      let storage: ReviewLogStorage
      try {
        storage = JSON.parse(storedData) as ReviewLogStorage
      } catch (error) {
        const msg = `[${pluginName}] 解析复习日志分片失败 storageKey=${storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
        console.error(msg, error)
        report.errors.push(msg)
        // 解析失败：不得修改该分片
        continue
      }

      const originalLogs = storage.logs || []
      if (originalLogs.length === 0) continue

      const keptLogs: ReviewLogEntry[] = []
      let removedInShard = 0

      for (const log of originalLogs) {
        try {
          const { decision, reason } = await evaluateReviewLogRetention(
            log,
            pluginName,
            cache
          )
          if (decision === "delete") {
            removedInShard++
            console.log(
              `[${pluginName}] 清理日志 id=${log.id} cardKey=${log.cardKey ?? "n/a"} cardId=${log.cardId}: ${reason}`
            )
          } else {
            keptLogs.push(log)
            if (decision === "unknown") {
              report.retainedUnknownCount++
              const err = `[${pluginName}] 保留无法确认的日志 id=${log.id} cardKey=${log.cardKey ?? "n/a"} cardId=${log.cardId}: ${reason}`
              console.error(err)
              report.errors.push(err)
            }
          }
        } catch (error) {
          // 判定过程异常：按 unknown 保留
          keptLogs.push(log)
          report.retainedUnknownCount++
          const err = `[${pluginName}] 判定日志异常，已保留 id=${log.id} storageKey=${storageKey}: ${
            error instanceof Error ? error.message : String(error)
          }`
          console.error(err, error)
          report.errors.push(err)
        }
      }

      if (removedInShard === 0) continue

      try {
        if (keptLogs.length > 0) {
          const newStorage: ReviewLogStorage = {
            version: storage.version || 1,
            logs: keptLogs
          }
          await orca.plugins.setData(
            pluginName,
            storageKey,
            JSON.stringify(newStorage)
          )
        } else {
          await orca.plugins.removeData(pluginName, storageKey)
        }
        report.cleanedCount += removedInShard
        storageMutated = true
        console.log(
          `[${pluginName}] 从 ${storageKey} 清理了 ${removedInShard} 条记录`
        )
      } catch (error) {
        const msg = `[${pluginName}] 写入清理结果失败 storageKey=${storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
        console.error(msg, error)
        report.errors.push(msg)
        // 写入失败：不把 removedInShard 计入 cleanedCount
      }
    }
  } catch (error) {
    const msg = `[${pluginName}] 清理已删除卡片失败: ${
      error instanceof Error ? error.message : String(error)
    }`
    console.error(msg, error)
    report.errors.push(msg)
  } finally {
    // 直接 setData/removeData 后必须失效 reviewLogStorage 内存缓存
    if (storageMutated) {
      clearLogCache()
    }
  }

  if (report.errors.length > 0) {
    console.error(
      `[${pluginName}] 已删除卡片清理结束（存在错误）: cleaned=${report.cleanedCount}, retainedUnknown=${report.retainedUnknownCount}, errors=${report.errors.length}`
    )
  } else {
    console.log(
      `[${pluginName}] 已删除卡片清理完成: cleaned=${report.cleanedCount}, retainedUnknown=${report.retainedUnknownCount}`
    )
  }

  return report
}
