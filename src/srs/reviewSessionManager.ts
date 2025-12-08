import type { DbId } from "../orca.d.ts"

/**
 * 复习会话块管理器
 * 负责创建、获取和清理复习会话块
 */

let reviewSessionBlockId: DbId | null = null
const STORAGE_KEY = "reviewSessionBlockId"

/**
 * 获取或创建复习会话块
 */
export async function getOrCreateReviewSessionBlock(pluginName: string): Promise<DbId> {
  if (reviewSessionBlockId) {
    const existing = await resolveBlock(reviewSessionBlockId)
    if (existing) return reviewSessionBlockId
  }

  const storedId = await orca.plugins.getData(pluginName, STORAGE_KEY)
  if (typeof storedId === "number") {
    const existing = await resolveBlock(storedId)
    if (existing) {
      reviewSessionBlockId = storedId
      return storedId
    }
  }

  const newId = await createReviewSessionBlock(pluginName)
  await orca.plugins.setData(pluginName, STORAGE_KEY, newId)
  reviewSessionBlockId = newId
  return newId
}

/**
 * 创建复习会话块
 */
async function createReviewSessionBlock(pluginName: string): Promise<DbId> {
  const blockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[SRS 复习会话 - ${pluginName}]` }],
    { type: "srs.review-session" }
  ) as DbId

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [
      { name: "srs.isReviewSessionBlock", value: true, type: 4 },
      { name: "srs.pluginName", value: pluginName, type: 2 }
    ]
  )
  const block = orca.state.blocks?.[blockId] as any
  if (block) {
    block._repr = {
      type: "srs.review-session"
    }
  }

  console.log(`[${pluginName}] 创建复习会话块: #${blockId}`)
  return blockId
}

/**
 * 清理复习会话块记录
 */
export async function cleanupReviewSessionBlock(pluginName: string): Promise<void> {
  if (reviewSessionBlockId) {
    const block = orca.state.blocks?.[reviewSessionBlockId] as any
    if (block && block._repr?.type === "srs.review-session") {
      delete block._repr
    }
    reviewSessionBlockId = null
  }

  await orca.plugins.removeData(pluginName, STORAGE_KEY)
}

async function resolveBlock(blockId: DbId) {
  const fromState = orca.state.blocks?.[blockId]
  if (fromState) return fromState
  try {
    const fetched = await orca.invokeBackend("get-block", blockId)
    return fetched
  } catch (error) {
    console.warn("[srs] 无法从后端获取复习会话块:", error)
    return null
  }
}
