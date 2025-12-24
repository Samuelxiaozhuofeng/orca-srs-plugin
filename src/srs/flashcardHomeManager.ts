import type { DbId } from "../orca.d.ts"

/**
 * Flash Home 块管理器
 * 负责创建、获取和清理 Flash Home 块
 * 
 * 设计原则：
 * - 复用现有块：如果已存在 Flash Home 块，则复用而非创建新块
 * - 持久化存储：使用 orca.plugins.getData/setData 存储块 ID
 * - 内存缓存：使用模块级变量缓存块 ID，避免重复查询
 */

let flashcardHomeBlockId: DbId | null = null
const STORAGE_KEY = "flashcardHomeBlockId"

/**
 * 获取或创建 Flash Home 块
 * 
 * 逻辑顺序：
 * 1. 检查内存缓存
 * 2. 检查持久化存储
 * 3. 创建新块并存储
 * 
 * @param pluginName - 插件名称
 * @returns Flash Home 块的 ID
 */
export async function getOrCreateFlashcardHomeBlock(pluginName: string): Promise<DbId> {
  // 1. 检查内存缓存
  if (flashcardHomeBlockId) {
    const existing = await resolveBlock(flashcardHomeBlockId)
    if (existing) return flashcardHomeBlockId
  }

  // 2. 检查持久化存储
  const storedId = await orca.plugins.getData(pluginName, STORAGE_KEY)
  if (typeof storedId === "number") {
    const existing = await resolveBlock(storedId)
    if (existing) {
      flashcardHomeBlockId = storedId
      return storedId
    }
  }

  // 3. 创建新块并存储
  const newId = await createFlashcardHomeBlock(pluginName)
  await orca.plugins.setData(pluginName, STORAGE_KEY, newId)
  flashcardHomeBlockId = newId
  return newId
}

/**
 * 创建 Flash Home 块
 * 
 * @param pluginName - 插件名称
 * @returns 新创建的块 ID
 */
async function createFlashcardHomeBlock(pluginName: string): Promise<DbId> {
  const blockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[SRS Flashcard Home - ${pluginName}]` }],
    { type: "srs.flashcard-home" }
  ) as DbId

  // 设置块属性
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [
      { name: "srs.isFlashcardHomeBlock", value: true, type: 4 },
      { name: "srs.pluginName", value: pluginName, type: 2 }
    ]
  )

  // 设置块的 repr 类型
  const block = orca.state.blocks?.[blockId] as any
  if (block) {
    block._repr = {
      type: "srs.flashcard-home"
    }
  }

  console.log(`[${pluginName}] 创建 Flash Home 块: #${blockId}`)
  return blockId
}

/**
 * 清理 Flash Home 块记录
 * 
 * 注意：此函数只清理记录，不删除实际块
 * 
 * @param pluginName - 插件名称
 */
export async function cleanupFlashcardHomeBlock(pluginName: string): Promise<void> {
  // 清理内存中的 repr 标记
  if (flashcardHomeBlockId) {
    const block = orca.state.blocks?.[flashcardHomeBlockId] as any
    if (block && block._repr?.type === "srs.flashcard-home") {
      delete block._repr
    }
    flashcardHomeBlockId = null
  }

  // 清理持久化存储
  await orca.plugins.removeData(pluginName, STORAGE_KEY)
}

/**
 * 解析块 ID，检查块是否存在
 * 
 * @param blockId - 块 ID
 * @returns 块对象或 null
 */
async function resolveBlock(blockId: DbId) {
  // 先从内存状态查找
  const fromState = orca.state.blocks?.[blockId]
  if (fromState) return fromState

  // 从后端获取
  try {
    const fetched = await orca.invokeBackend("get-block", blockId)
    return fetched
  } catch (error) {
    console.warn("[srs] 无法从后端获取 Flash Home 块:", error)
    return null
  }
}
