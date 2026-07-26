/**
 * 同批生成标记（batchId）。
 *
 * 动机：AI 一次生成多张卡后，这些卡会各自独立排期，在未来几周里分散触发，
 * 用户反复遇到「这段我刚复习过」。给同一批卡打上同一个 batchId，
 * 复习队列就能把它们聚拢在一起展示，而不额外增加复习次数。
 *
 * 命名与生成沿用仓库既有约定（见 `book-ir/bookIRService.ts` 的 `book-…`
 * 与 `incremental-reading/irOverloadService.ts` 的 `ir-auto-…`）：
 * batchId 是**分组令牌，不是实体身份** —— 不得用它做卡片的唯一标识。
 */

import type { Block, DbId } from "../orca.d.ts"
import { invalidateBlockCache } from "./storage"
import { invalidateIrBlockCache } from "./incremental-reading/irBlockCache"

/** 块属性名。走 `srs.` 前缀，因此会被 deleteCardSrsData 一并清除（重置卡片即丢分组，可接受）。 */
export const CARD_BATCH_PROPERTY = "srs.batchId"

/** Orca 属性类型码：2 = 文本。 */
const PROPERTY_TYPE_TEXT = 2

/**
 * 生成一个批次 id。
 * @param prefix 来源前缀，如 "ai"
 */
export function createCardBatchId(
  prefix = "ai",
  now: Date = new Date(),
  random: () => number = Math.random
): string {
  const stamp = now.getTime().toString(36)
  const suffix = random().toString(36).slice(2, 8)
  return `${prefix}-${stamp}-${suffix}`
}

/** 从块属性读取 batchId；缺失或非字符串返回 undefined。 */
export function readCardBatchId(block: Block | null | undefined): string | undefined {
  if (!block || !Array.isArray(block.properties)) return undefined
  const property = block.properties.find((p) => p?.name === CARD_BATCH_PROPERTY)
  if (!property) return undefined
  const value = property.value
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

/**
 * 写入 batchId。
 *
 * 写失败必须抛出，让调用方决定——静默失败只会让聚簇「有时生效」，更难排查。
 *
 * 写后必须失效两套块缓存：`reviewCardFactory` 随后要读回这条属性，
 * 若命中写入前的旧快照就读不到 batchId，聚簇会毫无征兆地不生效。
 * 两套缓存都要清——storage 的 blockCache 与 irBlockCache 互不相通。
 */
export async function writeCardBatchId(
  blockId: DbId,
  batchId: string
): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [{ name: CARD_BATCH_PROPERTY, value: batchId, type: PROPERTY_TYPE_TEXT }]
  )
  invalidateBlockCache(blockId)
  invalidateIrBlockCache(blockId)
}
