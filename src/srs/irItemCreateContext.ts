/**
 * 判定「当前块上制记忆卡」是否应走 IR Item 首次 due 策略。
 *
 * 规则（产品契约）：
 * - 当前块自身是 #card type=topic / extracts → 是
 * - 当前块是 Topic/Extract 的**任意后代**（子块、孙子块…）→ 是
 * - keep_extract 后仍带 live IR 的混合块（及后代）→ 是
 * - 否则 → 普通 legacy
 *
 * priority 取最近祖先 IR 源上的 ir.priority（找不到则默认值）。
 * 祖先 walk 有深度 / 步数硬 cap，防环与无界扫描。
 */

import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import {
  blockHasLiveIRScheduling,
  resolveIRCardType
} from "./incremental-reading/irHybridExtract"
import { getBlockCached } from "./incremental-reading/irBlockCache"
import { DEFAULT_PRIORITY } from "./incremental-reading/irSchedulingHelpers"
import { loadIRState } from "./incrementalReadingStorage"
import type { CreateClozeOptions } from "./clozeUtils"
import type { InsertDirectionOptions } from "./directionUtils"

export type IrItemCreateOptions = CreateClozeOptions & InsertDirectionOptions

/** 向上查找 IR 源的最大层数（含自身） */
export const IR_ITEM_SOURCE_MAX_DEPTH = 32

export type IrItemSourceResolution = {
  /** Topic / Extract / 混合 live IR 块 ID */
  sourceBlockId: DbId
  /** 用于诊断：topic | extracts */
  sourceKind: "topic" | "extracts"
  priority: number
  /** 从制卡块到源的距离：0=自身，1=直接父… */
  depth: number
}

export type ResolveIrItemSourceDeps = {
  getBlock: (id: DbId) => Promise<Block | null | undefined>
  loadPriority: (id: DbId) => Promise<number>
  maxDepth?: number
}

function defaultGetBlock(id: DbId): Promise<Block | null | undefined> {
  return getBlockCached(id)
}

async function defaultLoadPriority(id: DbId): Promise<number> {
  try {
    return (await loadIRState(id)).priority
  } catch (error) {
    console.error(
      `[SRS] 读取块 #${id} ir.priority 失败，回退 ${DEFAULT_PRIORITY}:`,
      error
    )
    return DEFAULT_PRIORITY
  }
}

/**
 * 纯判定：块本身是否为 IR 源（#card topic/extract 或 hybrid live IR）。
 */
export function isIrItemSourceBlock(block: Block | null | undefined): boolean {
  if (!block) return false
  return resolveIRCardType(block) != null
}

/**
 * 从 blockId 向上（含自身）找最近的 Topic/Extract（或 live IR 混合块）。
 * 有界：maxDepth、visited 防环；触 cap 打 warn，不静默装完整。
 */
export async function resolveIrItemSourceForBlock(
  blockId: DbId,
  seedBlock?: Block | null,
  partialDeps?: Partial<ResolveIrItemSourceDeps>
): Promise<IrItemSourceResolution | null> {
  const getBlock = partialDeps?.getBlock ?? defaultGetBlock
  const loadPriority = partialDeps?.loadPriority ?? defaultLoadPriority
  const maxDepth = partialDeps?.maxDepth ?? IR_ITEM_SOURCE_MAX_DEPTH

  const visited = new Set<DbId>()
  let currentId: DbId | null | undefined = blockId
  let depth = 0

  while (currentId != null && depth <= maxDepth) {
    if (visited.has(currentId)) {
      console.warn(
        `[SRS] IR 源祖先 walk 检测到环，停止。blockId=${blockId} at=${currentId}`
      )
      return null
    }
    visited.add(currentId)

    let block: Block | null | undefined =
      depth === 0 && seedBlock && seedBlock.id === currentId
        ? seedBlock
        : await getBlock(currentId)

    if (!block && depth === 0 && seedBlock) {
      block = seedBlock
    }
    if (!block) {
      return null
    }

    const irKind = resolveIRCardType(block)
    if (irKind != null) {
      const priority = await loadPriority(currentId)
      return {
        sourceBlockId: currentId,
        sourceKind: irKind,
        priority,
        depth
      }
    }

    const parentId: DbId | null | undefined = block.parent as DbId | null | undefined
    if (parentId == null || parentId === currentId) {
      return null
    }
    currentId = parentId
    depth += 1
  }

  if (depth > maxDepth) {
    console.warn(
      `[SRS] IR 源祖先 walk 触达 maxDepth=${maxDepth}，未找到 Topic/Extract。`
        + ` start=${blockId}`
    )
  }
  return null
}

/**
 * 若当前块或其祖先是 Topic/Extract（含 live IR 混合），返回 ir_item 制卡选项。
 */
export async function getIrItemCreateOptionsForBlock(
  block: Block | null | undefined,
  blockId: DbId,
  partialDeps?: Partial<ResolveIrItemSourceDeps>
): Promise<IrItemCreateOptions | undefined> {
  const source = await resolveIrItemSourceForBlock(blockId, block, partialDeps)
  if (!source) return undefined
  return {
    initialDueOrigin: "ir_item",
    irPriority: source.priority
  }
}

/** 测试/诊断：与旧 shouldUseIrItemInitialDue 对齐的「自身」判定（不含祖先） */
export function shouldUseIrItemInitialDueOnBlock(
  block: Block | null | undefined
): boolean {
  if (!block) return false
  const cardType = extractCardType(block)
  if (cardType === "topic" || cardType === "extracts") return true
  return blockHasLiveIRScheduling(block)
}
