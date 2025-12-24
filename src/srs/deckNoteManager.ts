/**
 * 卡组备注管理器
 * 负责存储和管理卡组备注信息
 */

const DECK_NOTES_STORAGE_KEY = "deckNotes"

/**
 * 卡组备注数据结构
 */
type DeckNotesData = {
  [deckName: string]: string
}

/**
 * 获取卡组备注
 * 
 * @param pluginName - 插件名称
 * @param deckName - 卡组名称
 * @returns 卡组备注，如果没有则返回空字符串
 */
export async function getDeckNote(pluginName: string, deckName: string): Promise<string> {
  try {
    const storedData = await orca.plugins.getData(pluginName, DECK_NOTES_STORAGE_KEY) as string | null
    if (!storedData) return ""
    
    const deckNotes = JSON.parse(storedData) as DeckNotesData
    return deckNotes?.[deckName] || ""
  } catch (error) {
    console.warn(`[${pluginName}] 获取卡组备注失败:`, error)
    return ""
  }
}

/**
 * 设置卡组备注
 * 
 * @param pluginName - 插件名称
 * @param deckName - 卡组名称
 * @param note - 备注内容
 */
export async function setDeckNote(pluginName: string, deckName: string, note: string): Promise<void> {
  try {
    const storedData = await orca.plugins.getData(pluginName, DECK_NOTES_STORAGE_KEY) as string | null
    const deckNotes: DeckNotesData = storedData ? JSON.parse(storedData) : {}
    
    if (note.trim() === "") {
      // 如果备注为空，删除该条目
      delete deckNotes[deckName]
    } else {
      // 设置备注
      deckNotes[deckName] = note.trim()
    }
    
    await orca.plugins.setData(pluginName, DECK_NOTES_STORAGE_KEY, JSON.stringify(deckNotes))
  } catch (error) {
    console.error(`[${pluginName}] 设置卡组备注失败:`, error)
    throw error
  }
}

/**
 * 删除卡组备注
 * 
 * @param pluginName - 插件名称
 * @param deckName - 卡组名称
 */
export async function deleteDeckNote(pluginName: string, deckName: string): Promise<void> {
  await setDeckNote(pluginName, deckName, "")
}

/**
 * 获取所有卡组备注
 * 
 * @param pluginName - 插件名称
 * @returns 所有卡组备注的映射
 */
export async function getAllDeckNotes(pluginName: string): Promise<DeckNotesData> {
  try {
    const storedData = await orca.plugins.getData(pluginName, DECK_NOTES_STORAGE_KEY) as string | null
    if (!storedData) return {}
    
    return JSON.parse(storedData) as DeckNotesData
  } catch (error) {
    console.warn(`[${pluginName}] 获取所有卡组备注失败:`, error)
    return {}
  }
}

/**
 * 重命名卡组时更新备注
 * 
 * @param pluginName - 插件名称
 * @param oldDeckName - 旧卡组名称
 * @param newDeckName - 新卡组名称
 */
export async function renameDeckNote(pluginName: string, oldDeckName: string, newDeckName: string): Promise<void> {
  try {
    const storedData = await orca.plugins.getData(pluginName, DECK_NOTES_STORAGE_KEY) as string | null
    const deckNotes: DeckNotesData = storedData ? JSON.parse(storedData) : {}
    
    if (deckNotes[oldDeckName]) {
      deckNotes[newDeckName] = deckNotes[oldDeckName]
      delete deckNotes[oldDeckName]
      await orca.plugins.setData(pluginName, DECK_NOTES_STORAGE_KEY, JSON.stringify(deckNotes))
    }
  } catch (error) {
    console.error(`[${pluginName}] 重命名卡组备注失败:`, error)
    throw error
  }
}