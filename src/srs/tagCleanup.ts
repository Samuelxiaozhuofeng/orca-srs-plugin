/**
 * 标签清理模块
 * 
 * 提供清理 block 上 SRS 属性的功能
 * 
 * 使用场景：
 * 当用户删除 #card 标签后重新创建闪卡时，需要先清理残留的旧 SRS 属性，
 * 确保新卡片从初始状态开始，而非沿用旧的复习进度。
 */

import type { Block, DbId } from "../orca.d.ts"
import { invalidateBlockCache } from "./storage"

/**
 * 获取 block 上所有 srs. 前缀的属性名称
 */
async function getSrsPropertyNames(blockId: DbId): Promise<string[]> {
  const block = await orca.invokeBackend("get-block", blockId) as Block | undefined
  if (!block?.properties) return []
  
  return block.properties
    .filter(prop => prop.name.startsWith("srs."))
    .map(prop => prop.name)
}

/**
 * 清理 block 上所有 SRS 属性
 * 
 * @param blockId - 块 ID
 * @param pluginName - 插件名称，用于日志输出
 */
export async function cleanupSrsProperties(blockId: DbId, pluginName: string): Promise<void> {
  const propertyNames = await getSrsPropertyNames(blockId)
  
  if (propertyNames.length === 0) {
    return
  }
  
  console.log(`[${pluginName}] 清理块 #${blockId} 的 ${propertyNames.length} 个 SRS 属性`)
  
  await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [blockId],
    propertyNames
  )

  // 硬规则：块属性删除后立即失效块缓存，防止后续读取（如 ensureCardSrsState）
  // 从长期存活的 blockCache 拿到已删除的旧 srs.* 属性（与 deleteCardSrsData 语义一致）
  invalidateBlockCache(blockId)
}
