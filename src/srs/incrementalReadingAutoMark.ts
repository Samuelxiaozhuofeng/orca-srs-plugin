/**
 * 渐进阅读自动化模块
 *
 * 功能：监听块变化，自动为Topic的子块标记Extract
 *
 * 设计原则：
 * - 实时响应：用户粘贴子块后立即标记
 * - 零感知：完全自动化，无需手动操作
 * - 无特殊情况：只要父块是Topic，子块就是Extract
 */

import type { Block, DbId } from "../orca.d.ts"
import { isIncrementalReadingTopic } from "./incrementalReadingUtils"
import { extractCardType } from "./deckUtils"
import { isCardTag } from "./tagUtils"

// 记录已处理的块，避免重复标记
const processedBlocks = new Set<DbId>()

// Valtio订阅取消函数
let unsubscribe: (() => void) | null = null

/**
 * 检查块是否已标记为Extract
 */
function isAlreadyExtract(block: Block): boolean {
  const cardType = extractCardType(block)
  return cardType === "extracts"
}

/**
 * 检查块的父块是否是渐进阅读Topic
 */
function isChildOfTopic(blockId: DbId): boolean {
  // 遍历所有块，找到包含该blockId作为子块的父块
  const allBlocks = orca.state.blocks as Record<number, Block | undefined>

  for (const block of Object.values(allBlocks)) {
    if (!block || !block.children) continue

    // 如果这个块的children包含当前blockId
    if (block.children.includes(blockId)) {
      // 检查父块是否是Topic
      return isIncrementalReadingTopic(block)
    }
  }

  return false
}

/**
 * 自动标记块为Extract
 */
async function autoMarkAsExtract(blockId: DbId, pluginName: string): Promise<void> {
  // 避免重复处理
  if (processedBlocks.has(blockId)) {
    return
  }

  const block = orca.state.blocks[blockId] as Block
  if (!block) {
    return
  }

  // 检查是否已经是Extract
  if (isAlreadyExtract(block)) {
    processedBlocks.add(blockId)
    return
  }

  // 检查父块是否是Topic
  if (!isChildOfTopic(blockId)) {
    return
  }

  console.log(`[${pluginName}] 自动标记 Extract: 块 ${blockId}`)

  try {
    // 添加 #card 标签并设置 type: extracts
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      [
        { name: "type", value: "extracts" },
        { name: "牌组", value: [] },
        { name: "status", value: "" }
      ]
    )

    // 设置 _repr
    const blockWithRepr = orca.state.blocks[blockId] as any
    blockWithRepr._repr = {
      type: "srs.extract-card",
      front: block.text || "",
      back: "(回忆/理解这段内容)",
      cardType: "extracts"
    }

    // 设置属性标记
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: "srs.isCard", value: true, type: 4 }]
    )

    // 初始化SRS状态
    const { ensureCardSrsState } = await import("./storage")
    await ensureCardSrsState(blockId)

    processedBlocks.add(blockId)
    console.log(`[${pluginName}] 自动标记完成: 块 ${blockId}`)
  } catch (error) {
    console.error(`[${pluginName}] 自动标记失败:`, error)
  }
}

/**
 * 扫描Topic的所有子块，标记未标记的Extract
 */
async function scanAndMarkTopicChildren(pluginName: string): Promise<void> {
  const allBlocks = orca.state.blocks as Record<number, Block | undefined>

  for (const block of Object.values(allBlocks)) {
    if (!block) continue

    // 检查是否是Topic
    if (!isIncrementalReadingTopic(block)) continue

    // 检查Topic的所有子块
    if (!block.children || block.children.length === 0) continue

    for (const childId of block.children) {
      await autoMarkAsExtract(childId, pluginName)
    }
  }
}

/**
 * 启动自动标记监听器
 *
 * 使用valtio监听orca.state.blocks的变化
 * 当检测到新块时，检查是否是Topic的子块，如果是则自动标记
 */
export function startAutoMarkExtract(pluginName: string): void {
  console.log(`[${pluginName}] 启动渐进阅读自动标记`)

  // 首次扫描现有的Topic子块
  scanAndMarkTopicChildren(pluginName).catch(error => {
    console.error(`[${pluginName}] 初始扫描失败:`, error)
  })

  // 监听blocks变化
  // 使用setTimeout延迟处理，避免频繁触发
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  unsubscribe = (window as any).Valtio.subscribe(orca.state.blocks, () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      scanAndMarkTopicChildren(pluginName).catch(error => {
        console.error(`[${pluginName}] 自动标记失败:`, error)
      })
    }, 500) // 500ms防抖
  })

  console.log(`[${pluginName}] 渐进阅读自动标记已启动`)
}

/**
 * 停止自动标记监听器
 */
export function stopAutoMarkExtract(pluginName: string): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
    console.log(`[${pluginName}] 渐进阅读自动标记已停止`)
  }

  // 清空已处理记录
  processedBlocks.clear()
}
