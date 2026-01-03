/**
 * 已删除卡片清理模块
 * 
 * 在插件启动时扫描并清理已删除卡片的相关数据
 */

import type { DbId } from "../orca.d.ts"
import { collectSrsBlocks } from "./cardCollector"
import { getAllReviewLogs } from "./reviewLogStorage"
import type { ReviewLogEntry, ReviewLogStorage } from "./types"

// 存储键前缀（与 reviewLogStorage.ts 保持一致）
const STORAGE_KEY_PREFIX = "reviewLogs"

/**
 * 扫描并清理已删除卡片的数据
 * 
 * 检查复习日志中的卡片 ID，验证对应的块是否仍然存在
 * 如果块已被删除，清理相关的复习日志记录
 * 
 * @param pluginName - 插件名称
 * @returns 清理的记录数量
 */
export async function cleanupDeletedCards(pluginName: string): Promise<number> {
  console.log(`[${pluginName}] 开始扫描已删除的卡片...`)
  
  let cleanedCount = 0
  
  try {
    // 获取所有 SRS 块的 ID
    const srsBlocks = await collectSrsBlocks(pluginName)
    const validBlockIds = new Set<DbId>(srsBlocks.map(block => block.id))
    
    console.log(`[${pluginName}] 找到 ${validBlockIds.size} 个有效的 SRS 卡片块`)
    
    // 获取所有复习日志
    const allLogs = await getAllReviewLogs(pluginName)
    
    if (allLogs.length === 0) {
      console.log(`[${pluginName}] 没有复习日志需要清理`)
      return 0
    }
    
    // 找出已删除卡片的日志
    const deletedCardIds = new Set<DbId>()
    for (const log of allLogs) {
      if (!validBlockIds.has(log.cardId)) {
        deletedCardIds.add(log.cardId)
      }
    }
    
    if (deletedCardIds.size === 0) {
      console.log(`[${pluginName}] 没有已删除卡片的日志需要清理`)
      return 0
    }
    
    console.log(`[${pluginName}] 发现 ${deletedCardIds.size} 个已删除卡片的日志记录`)
    
    // 按月份分组清理
    const allKeys = await orca.plugins.getDataKeys(pluginName)
    const reviewLogKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX))
    
    for (const storageKey of reviewLogKeys) {
      const storedData = await orca.plugins.getData(pluginName, storageKey) as string | null
      if (!storedData) continue
      
      try {
        const storage = JSON.parse(storedData) as ReviewLogStorage
        const originalCount = storage.logs?.length || 0
        
        // 过滤掉已删除卡片的日志
        const filteredLogs = (storage.logs || []).filter(
          (log: ReviewLogEntry) => validBlockIds.has(log.cardId)
        )
        
        const removedCount = originalCount - filteredLogs.length
        
        if (removedCount > 0) {
          cleanedCount += removedCount
          
          if (filteredLogs.length > 0) {
            // 保存过滤后的日志
            const newStorage: ReviewLogStorage = {
              version: storage.version || 1,
              logs: filteredLogs
            }
            await orca.plugins.setData(pluginName, storageKey, JSON.stringify(newStorage))
          } else {
            // 如果没有剩余日志，删除整个存储键
            await orca.plugins.removeData(pluginName, storageKey)
          }
          
          console.log(`[${pluginName}] 从 ${storageKey} 清理了 ${removedCount} 条记录`)
        }
      } catch (error) {
        console.warn(`[${pluginName}] 处理 ${storageKey} 时出错:`, error)
      }
    }
    
    console.log(`[${pluginName}] 已删除卡片清理完成，共清理了 ${cleanedCount} 条复习日志`)
  } catch (error) {
    console.error(`[${pluginName}] 清理已删除卡片失败:`, error)
  }
  
  return cleanedCount
}

/**
 * 验证卡片块是否存在
 * 
 * @param blockId - 块 ID
 * @returns 块是否存在
 */
export async function isCardBlockExists(blockId: DbId): Promise<boolean> {
  try {
    // 先检查 state
    if (orca.state.blocks?.[blockId]) {
      return true
    }
    
    // 从后端获取
    const block = await orca.invokeBackend("get-block", blockId)
    return !!block
  } catch (error) {
    return false
  }
}
