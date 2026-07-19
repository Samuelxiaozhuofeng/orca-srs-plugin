/**
 * 渐进阅读 Extract（摘录）创建工具
 *
 * SuperMemo 风格：将当前块中选中的文本“摘录”为一个子块，并为该子块打上 #card 标签。
 *
 * 注意：本实现严格复用现有代码库的模式：
 * - 光标/选区处理：参考 src/srs/clozeUtils.ts
 * - #card 标签与 IR 初始化：参考 src/srs/topicCardCreator.ts
 */

import type { Block, ContentFragment, CursorData, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import {
  ensureIRState,
  invalidateIrBlockCache,
  loadIRState,
  updatePriority
} from "./incrementalReadingStorage"
import { DEFAULT_IR_PRIORITY, normalizePriority } from "./incrementalReadingScheduler"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { isCardTag } from "./tagUtils"
import { buildCardTagData } from "./cardTagDataBuilder"

/**
 * 新 Extract 排期初始化生产顺序（可注入依赖以便测试约束调用序）。
 *
 * 调用前刚 insertTag / setRefData(type=extracts)，IR cache 可能仍是无标签快照。
 * 必须先 invalidate，再 ensure，避免按 basic 错误 cardType 初始化。
 *
 * 有 sourceTopicId：
 *   invalidate(tag) → setSource → invalidate(source) → ensure → updatePriority
 * 无 source：
 *   invalidate(tag) → ensure → updatePriority
 */
export async function initializeExtractScheduleAfterCreate(args: {
  extractBlockId: DbId
  sourceTopicId: DbId | null
  priority: number
  deps?: {
    ensureIRState?: typeof ensureIRState
    setSourceTopicId?: (blockId: DbId, topicId: DbId) => Promise<void>
    invalidateIrBlockCache?: (blockId: DbId) => void
    updatePriority?: typeof updatePriority
  }
}): Promise<void> {
  const ensure = args.deps?.ensureIRState ?? ensureIRState
  const invalidate = args.deps?.invalidateIrBlockCache ?? invalidateIrBlockCache
  const updatePrio = args.deps?.updatePriority ?? updatePriority
  const setSource =
    args.deps?.setSourceTopicId
    ?? (async (blockId: DbId, topicId: DbId) => {
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [blockId],
        [{ name: "ir.sourceTopicId", value: topicId, type: 3 }]
      )
    })

  // 1) 标签刚写入：先失效 cache，确保 ensure 读到 #card/type=extracts
  invalidate(args.extractBlockId)
  // 2) 有来源时写 sourceTopicId，写后再失效
  if (args.sourceTopicId != null) {
    await setSource(args.extractBlockId, args.sourceTopicId)
    invalidate(args.extractBlockId)
  }
  // 3) ensure 使用最新卡种；4) updatePriority 读 sourceTopicId 算 sibling delay
  await ensure(args.extractBlockId)
  await updatePrio(args.extractBlockId, args.priority)
}

const findNearestTopic = (block: Block): Block | null => {
  let current: Block | undefined = block
  let guard = 0

  while (current && guard < 100) {
    if (extractCardType(current) === "topic") {
      return current
    }
    const parentId = current.parent
    if (!parentId) return null
    current = orca.state.blocks?.[parentId] as Block | undefined
    guard += 1
  }

  return null
}

const resolveInheritedPriority = async (block: Block): Promise<number> => {
  const topic = findNearestTopic(block)
  if (!topic) return DEFAULT_IR_PRIORITY
  try {
    const state = await loadIRState(topic.id)
    return normalizePriority(state.priority)
  } catch {
    return DEFAULT_IR_PRIORITY
  }
}

/**
 * 创建摘录子块并初始化其 #card 与渐进阅读状态
 *
 * @returns { blockId, extractBlockId } 便于上层做撤销/定位等操作
 */
export async function createExtract(
  cursor: CursorData,
  pluginName: string
): Promise<{ blockId: DbId; extractBlockId: DbId } | null> {
  // 验证光标数据
  if (!cursor?.anchor?.blockId) {
    orca.notify("error", "无法获取光标位置")
    console.error(`[${pluginName}] 错误：无法获取光标位置`)
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks?.[blockId] as Block | undefined

  if (!block) {
    orca.notify("error", "未找到当前块")
    console.error(`[${pluginName}] 错误：未找到块 #${blockId}`)
    return null
  }

  // 确保有 content 数组
  if (!block.content || block.content.length === 0) {
    orca.notify("warn", "块内容为空")
    return null
  }

  const { planExtractSelection, extractTextFromFragments } = await import("./incremental-reading/irRichExtract")
  const plan = planExtractSelection(cursor)
  if (!plan) {
    orca.notify("warn", "请先选择要摘录的文本")
    return null
  }

  if (plan.mode === "cross_block") {
    const {
      buildCrossBlockSegments,
      extractTextFromCrossBlockSegments,
      resolveSiblingBlockChain
    } = await import("./incremental-reading/irRichExtract")

    const startBlock = orca.state.blocks?.[plan.startBlockId] as Block | undefined
    const endBlock = orca.state.blocks?.[plan.endBlockId] as Block | undefined
    if (!startBlock || !endBlock) {
      orca.notify("warn", "跨块选区的块不存在")
      return null
    }

    const parentId = startBlock.parent
    if (!parentId || endBlock.parent !== parentId) {
      orca.notify("warn", "跨块摘录目前仅支持同一父块下的相邻兄弟块")
      return null
    }

    const parent = orca.state.blocks?.[parentId] as Block | undefined
    const siblings = (parent?.children ?? []) as DbId[]
    const chainIds = resolveSiblingBlockChain(plan.startBlockId, plan.endBlockId, siblings)
    if (!chainIds || chainIds.length === 0) {
      orca.notify("warn", "无法解析跨块选区路径")
      return null
    }

    // 保证按选区方向排列
    const orderedIds = plan.isForward ? chainIds : [...chainIds].reverse()
    // plan 已归一化为 start→end 的阅读方向，chain 使用 siblings 升序后与 plan 对齐
    const forwardIds = siblings.indexOf(plan.startBlockId) <= siblings.indexOf(plan.endBlockId)
      ? chainIds
      : [...chainIds].reverse()

    const chain = forwardIds.map(id => {
      const b = orca.state.blocks?.[id] as Block | undefined
      return {
        id,
        content: (b?.content ?? []) as ContentFragment[]
      }
    })

    const segments = buildCrossBlockSegments(plan, chain)
    const selectedTextCross = extractTextFromCrossBlockSegments(segments).trim()
    if (!selectedTextCross) {
      orca.notify("warn", "跨块选区为空")
      return null
    }

    // 摘录挂到选区起点块下，保持来源就近
    const attachBlock = orca.state.blocks?.[plan.startBlockId] as Block | undefined
    if (!attachBlock) {
      orca.notify("error", "无法定位摘录挂载块")
      return null
    }

    void orderedIds
    return await createExtractFromText({
      cursor,
      pluginName,
      block: attachBlock,
      blockId: plan.startBlockId,
      selectedText: selectedTextCross
    })
  }

  const selectedText = extractTextFromFragments(block.content as ContentFragment[], plan)
  if (!selectedText || selectedText.trim() === "") {
    orca.notify("warn", "请先选择要摘录的文本")
    return null
  }

  return await createExtractFromText({
    cursor,
    pluginName,
    block,
    blockId,
    selectedText
  })
}

async function createExtractFromText(args: {
  cursor: CursorData
  pluginName: string
  block: Block
  blockId: DbId
  selectedText: string
}): Promise<{ blockId: DbId; extractBlockId: DbId } | null> {
  const { cursor, pluginName, block, blockId, selectedText } = args

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.formatHighlightYellow",
      cursor
    )
  } catch (error) {
    console.warn(`[${pluginName}] 高亮原文失败:`, error)
  }

  // 1) 创建子块（摘录块）
  let extractBlockId: DbId
  try {
    const insertResult = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      block,
      "lastChild",
      [{ t: "t", v: selectedText }]
    )

    if (typeof insertResult !== "number") {
      orca.notify("error", "创建摘录块失败：无法获取新块 ID", { title: "渐进阅读" })
      console.error(`[${pluginName}] 创建摘录块失败：insertBlock 返回值异常`, insertResult)
      return null
    }
    extractBlockId = insertResult
  } catch (error) {
    console.error(`[${pluginName}] 创建摘录块失败:`, error)
    orca.notify("error", `创建摘录块失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  // 2) 为摘录块添加/更新 #card 标签属性
  const inheritedPriority = await resolveInheritedPriority(block)
  const topic = findNearestTopic(block)

  try {
    const extractBlock = orca.state.blocks?.[extractBlockId] as Block | undefined
    const hasCardTag = extractBlock?.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false

    if (!hasCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        extractBlockId,
        "card",
        await buildCardTagData(pluginName, extractBlockId, "extracts")
      )
      await ensureCardTagProperties(pluginName)
    } else {
      const cardRef = extractBlock?.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
      if (cardRef) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          cardRef,
          [{ name: "type", value: "extracts" }]
        )
      }
    }
  } catch (error) {
    console.error(`[${pluginName}] 创建 Extract 卡片失败（标签处理）:`, error)
    orca.notify("error", `创建 Extract 卡片失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  // 3) 初始化渐进阅读状态（ir.*）：必须先写 sourceTopicId + invalidate，再 updatePriority
  //    （sibling queueDelay 依赖 ir.sourceTopicId 找来源 Topic；真实嵌套 Extract 的 parent 不是 Topic）
  try {
    await initializeExtractScheduleAfterCreate({
      extractBlockId,
      sourceTopicId: topic?.id ?? null,
      priority: inheritedPriority
    })
    try {
      const { upsertIRIndexId } = await import("./incremental-reading/irIndex")
      upsertIRIndexId(pluginName, extractBlockId, "extracts")
    } catch {
      // 索引失败不影响主流程
    }
  } catch (error) {
    console.error(`[${pluginName}] 初始化渐进阅读状态失败:`, error)
    orca.notify("error", `初始化渐进阅读状态失败: ${error}`, { title: "渐进阅读" })
    return null
  }

  orca.notify("success", "已创建摘录（Extract）", { title: "渐进阅读" })
  return { blockId, extractBlockId }
}
