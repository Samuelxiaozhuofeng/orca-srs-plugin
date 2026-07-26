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

/**
 * 用后端返回的完整块批量预热缓存（语义对齐 storage.ts 的 preheatBlockCache）。
 *
 * 预热来源必须是后端返回的块（get-blocks-with-tags / get-blocks / get-block 的结果可信）。
 * 不得用 orca.state.blocks 里的块预热：见上方 getBlockCached 内注释，
 * state 可能是旧快照（properties 不一定最新），预热会把旧值固化进缓存。
 *
 * 不发起后端请求；覆盖同 id 的既有缓存条目。
 * 写入后的 invalidateIrBlockCache（saveIRState 等）按块失效语义不变。
 *
 * @returns 写入缓存的块数量
 */
export function preheatIrBlockCache(blocks: ReadonlyArray<Block | null | undefined>): number {
  let count = 0
  for (const block of blocks) {
    if (block == null || block.id == null) continue
    blockCache.set(block.id, block)
    count++
  }
  return count
}

/**
 * 清空全部块缓存（测试边界清理用，语义对齐 storage.ts 的 clearBlockCache）。
 * 生产路径依赖 invalidateIrBlockCache 做精确失效，不应依赖本函数。
 */
export function clearIrBlockCache(): void {
  blockCache.clear()
}

export const invalidateIrBlockCache = (blockId: DbId): void => {
  blockCache.delete(blockId)
}

/** 强制丢弃指定块缓存（用于 parent children 时间敏感读取） */
export const dropIrBlockCacheEntry = (blockId: DbId): void => {
  blockCache.delete(blockId)
}
