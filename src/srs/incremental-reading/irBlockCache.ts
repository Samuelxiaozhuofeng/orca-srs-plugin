/**
 * 渐进阅读块读取缓存（backend-first get-block，避免 orca.state 旧快照）
 */

import type { Block, DbId } from "../../orca.d.ts"

const blockCache = new Map<DbId, Block | null>()

/**
 * 带缓存读取块：优先后端 get-block，miss 时回退 orca.state.blocks
 */
export const getBlockCached = async (blockId: DbId): Promise<Block | undefined> => {
  if (blockCache.has(blockId)) {
    return blockCache.get(blockId) ?? undefined
  }

  // 注意：orca.state.blocks 可能是旧快照（properties 不一定最新），会导致 IR 状态“读回旧值”。
  // 这里优先从后端 get-block 拉取最新数据，并用内存缓存避免重复请求。
  const block = (await orca.invokeBackend("get-block", blockId)) as Block | undefined
  if (!block) {
    const fromState = orca.state.blocks?.[blockId] as Block | undefined
    if (fromState) {
      blockCache.set(blockId, fromState)
      return fromState
    }
  }
  blockCache.set(blockId, block ?? null)
  return block
}

export const invalidateIrBlockCache = (blockId: DbId): void => {
  blockCache.delete(blockId)
}

/** 强制丢弃指定块缓存（用于 parent children 时间敏感读取） */
export const dropIrBlockCacheEntry = (blockId: DbId): void => {
  blockCache.delete(blockId)
}
