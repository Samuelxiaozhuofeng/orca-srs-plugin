import type { DbId } from "../orca.d.ts"

/**
 * 渐进阅读会话块管理器
 * 负责创建、获取和清理渐进阅读会话块
 */

let irSessionBlockId: DbId | null = null
const STORAGE_KEY = "incrementalReadingSessionBlockId"
const FOCUS_CARD_KEY = "incrementalReadingSessionFocusCardId"

export const IR_SESSION_STORAGE_KEY = STORAGE_KEY
export const IR_SESSION_FOCUS_CARD_KEY = FOCUS_CARD_KEY

export async function getStoredIncrementalReadingSessionBlockId(pluginName: string): Promise<DbId | null> {
  const storedId = await orca.plugins.getData(pluginName, STORAGE_KEY)
  return typeof storedId === "number" ? storedId : null
}

/**
 * 获取或创建渐进阅读会话块
 */
export async function getOrCreateIncrementalReadingSessionBlock(
  pluginName: string
): Promise<DbId> {
  if (irSessionBlockId) {
    const existing = await resolveBlock(irSessionBlockId)
    if (existing) return irSessionBlockId
  }

  const storedId = await orca.plugins.getData(pluginName, STORAGE_KEY)
  if (typeof storedId === "number") {
    const existing = await resolveBlock(storedId)
    if (existing) {
      irSessionBlockId = storedId
      return storedId
    }
  }

  const newId = await createIncrementalReadingSessionBlock(pluginName)
  await orca.plugins.setData(pluginName, STORAGE_KEY, newId)
  irSessionBlockId = newId
  return newId
}

/**
 * 创建渐进阅读会话块
 */
async function createIncrementalReadingSessionBlock(pluginName: string): Promise<DbId> {
  const blockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[渐进阅读会话 - ${pluginName}]` }],
    { type: "srs.ir-session" }
  ) as DbId

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [
      { name: "ir.isSessionBlock", value: true, type: 4 },
      { name: "ir.pluginName", value: pluginName, type: 2 }
    ]
  )

  const block = orca.state.blocks?.[blockId] as any
  if (block) {
    block._repr = {
      type: "srs.ir-session"
    }
  }

  console.log(`[${pluginName}] 创建渐进阅读会话块: #${blockId}`)
  return blockId
}

/**
 * 清理会话块记录
 */
export async function cleanupIncrementalReadingSessionBlock(pluginName: string): Promise<void> {
  if (irSessionBlockId) {
    const block = orca.state.blocks?.[irSessionBlockId] as any
    if (block && block._repr?.type === "srs.ir-session") {
      delete block._repr
    }
    irSessionBlockId = null
  }

  await orca.plugins.removeData(pluginName, STORAGE_KEY)
}

/**
 * 设置“下次打开/刷新会话时要优先展示的卡片”（一次性）
 *
 * 用于“提前学”等场景：先写入 focusCardId，再打开会话面板即可。
 */
export async function setNextIRSessionFocusCardId(
  pluginName: string,
  focusCardId: DbId
): Promise<void> {
  await orca.plugins.setData(pluginName, FOCUS_CARD_KEY, focusCardId)
}

/**
 * 读取并清空“会话 focusCardId”（一次性使用）
 */
export async function popNextIRSessionFocusCardId(
  pluginName: string
): Promise<DbId | null> {
  try {
    const raw = await orca.plugins.getData(pluginName, FOCUS_CARD_KEY)
    await orca.plugins.removeData(pluginName, FOCUS_CARD_KEY)
    return typeof raw === "number" ? raw : null
  } catch (error) {
    console.warn("[IR] popNextIRSessionFocusCardId failed:", error)
    return null
  }
}

async function resolveBlock(blockId: DbId) {
  const fromState = orca.state.blocks?.[blockId]
  if (fromState) return fromState
  try {
    const fetched = await orca.invokeBackend("get-block", blockId)
    return fetched
  } catch (error) {
    console.warn("[ir] 无法从后端获取渐进阅读会话块:", error)
    return null
  }
}
