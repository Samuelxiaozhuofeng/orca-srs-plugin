/**
 * 选择题卡片创建模块
 *
 * 将当前块转换为选择题（#card type=choice + #choice），与 makeCardFromBlock 对称：
 * - 无 #card → insertTag + buildCardTagData(..., "choice") + ensureCardTagProperties
 * - 无 #choice → insertTag "choice"（双保险；extractCardType 优先 isChoiceTag）
 * - 设置 _repr = srs.choice-card
 * - 新卡 cleanup + writeInitialSrsState；已有卡 ensureCardSrsState
 * - 若无 #correct/#正确 子选项，info 提示（不阻断）
 */

import type { Block, CursorData } from "../orca.d.ts"
import { BlockWithRepr, resolveFrontBack } from "./blockUtils"
import { ensureCardSrsState, invalidateBlockCache, writeInitialSrsState } from "./storage"
import { cleanupSrsProperties } from "./tagCleanup"
import { isCardTag, isChoiceTag, isCorrectTag } from "./tagUtils"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { buildCardTagData } from "./cardTagDataBuilder"

export type ChoiceCardCreationResult = {
  blockId: number
  originalRepr: unknown
  originalText: string
  pluginName: string
  addedCardTag: boolean
  addedChoiceTag: boolean
  wroteInitialSrs: boolean
}

/**
 * 将当前块转换为选择题 SRS 卡
 */
export async function createChoiceCardFromBlock(
  cursor: CursorData,
  pluginName: string
): Promise<ChoiceCardCreationResult | null> {
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取光标位置")
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as BlockWithRepr

  if (!block) {
    orca.notify("error", "未找到当前块")
    return null
  }

  const originalRepr = block._repr ? { ...block._repr } : { type: "text" }
  const originalText = block.text || ""

  const hasCardTag =
    block.refs?.some(
      ref => ref.type === 2 && isCardTag(ref.alias)
    ) ?? false
  const hasChoiceTag =
    block.refs?.some(
      ref => ref.type === 2 && isChoiceTag(ref.alias)
    ) ?? false

  let addedCardTag = false
  let addedChoiceTag = false

  if (!hasCardTag) {
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        blockId,
        "card",
        await buildCardTagData(pluginName, blockId, "choice")
      )
      await ensureCardTagProperties(pluginName)
      addedCardTag = true
    } catch (error) {
      console.error(`[${pluginName}] 添加 #card 标签失败:`, error)
      orca.notify("error", `添加标签失败: ${error}`, { title: "选择题" })
      return null
    }
  } else {
    // 已有 #card：尽量把 type 写为 choice（不新增标签）
    const cardRef = block.refs?.find(
      ref => ref.type === 2 && isCardTag(ref.alias)
    )
    if (cardRef) {
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          cardRef,
          [{ name: "type", value: "choice" }]
        )
        invalidateBlockCache(blockId)
      } catch (error) {
        console.error(`[${pluginName}] 更新 #card type=choice 失败:`, error)
        orca.notify("error", `更新卡片类型失败: ${error}`, { title: "选择题" })
        return null
      }
    }
  }

  if (!hasChoiceTag) {
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        blockId,
        "choice"
      )
      addedChoiceTag = true
    } catch (error) {
      console.error(`[${pluginName}] 添加 #choice 标签失败:`, error)
      orca.notify("error", `添加 #choice 失败: ${error}`, { title: "选择题" })
      return null
    }
  }

  const { front, back } = resolveFrontBack(block)

  block._repr = {
    type: "srs.choice-card",
    front,
    back,
    cardType: "choice"
  }

  const wroteInitialSrs = !hasCardTag
  if (wroteInitialSrs) {
    await cleanupSrsProperties(blockId, pluginName)
    await writeInitialSrsState(blockId)
  } else {
    await ensureCardSrsState(blockId)
  }

  // 无正确选项标签时提示，不阻断创建
  const childIds = (block.children ?? []) as number[]
  let hasCorrectOption = false
  for (const childId of childIds) {
    const child =
      (orca.state.blocks?.[childId] as Block | undefined) ||
      ((await orca.invokeBackend("get-block", childId)) as Block | undefined)
    if (
      child?.refs?.some(
        ref => ref.type === 2 && isCorrectTag(ref.alias)
      )
    ) {
      hasCorrectOption = true
      break
    }
  }
  if (!hasCorrectOption) {
    orca.notify(
      "info",
      "已创建选择题：请在正确选项子块上打 #correct 或 #正确",
      { title: "选择题" }
    )
  }

  orca.notify("success", "已转换为选择题卡片", { title: "选择题" })

  return {
    blockId,
    originalRepr,
    originalText,
    pluginName,
    addedCardTag,
    addedChoiceTag,
    wroteInitialSrs
  }
}
