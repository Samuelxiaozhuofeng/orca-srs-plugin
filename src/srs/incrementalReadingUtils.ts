/**
 * 渐进阅读工具模块
 *
 * 实现 SuperMemo 18 渐进阅读的 Topic → Extract 机制
 *
 * 核心概念：
 * - Topic: 包含电子书/文章的页面，标记为 type: 渐进阅读
 * - Extract: Topic 下的子块，自动标记为 type: extracts
 *
 * MVP 设计原则：
 * - 最激进简化：不引入优先级队列，复用 FSRS 算法
 * - 自动化：Topic 的子块自动成为 Extract
 * - 渐进验证：每个步骤都有前端交互验证点
 */

import type { Block, DbId } from "../orca.d.ts"
import type { BlockWithRepr } from "./blockUtils"
import { extractCardType } from "./deckUtils"
import { isCardTag } from "./tagUtils"

/**
 * 判断块是否为渐进阅读 Topic
 *
 * 判断条件：
 * - 必须有 #card 标签
 * - type 属性必须为 "渐进阅读"
 *
 * @param block - 块对象
 * @returns 是否为渐进阅读 Topic
 */
export function isIncrementalReadingTopic(block: Block): boolean {
  const cardType = extractCardType(block)
  return cardType === "渐进阅读"
}

/**
 * 收集所有渐进阅读 Topic 块
 *
 * 工作流程：
 * 1. 复用 collectSrsBlocks 获取所有带 #card 标签的块
 * 2. 过滤出 type=渐进阅读 的块
 *
 * @param pluginName - 插件名称（用于日志）
 * @returns 渐进阅读 Topic 数组
 */
export async function collectIncrementalReadingTopics(
  pluginName: string = "srs-plugin"
): Promise<BlockWithRepr[]> {
  // 动态导入避免循环依赖
  const { collectSrsBlocks } = await import("./cardCollector")
  const allCardBlocks = await collectSrsBlocks(pluginName)

  // 过滤出 type=渐进阅读 的块
  const topics = allCardBlocks.filter(block => {
    const cardType = extractCardType(block)
    return cardType === "渐进阅读"
  })

  console.log(`[${pluginName}] collectIncrementalReadingTopics: 找到 ${topics.length} 个渐进阅读 Topic`)
  return topics
}

/**
 * 获取 Topic 的所有子块（潜在的 Extract）
 *
 * @param topicBlock - Topic 块对象
 * @returns 子块数组
 */
export function getTopicChildBlocks(topicBlock: Block): Block[] {
  const children: Block[] = []

  if (!topicBlock.children || topicBlock.children.length === 0) {
    return children
  }

  for (const childId of topicBlock.children) {
    const childBlock = orca.state.blocks[childId] as Block
    if (childBlock) {
      children.push(childBlock)
    }
  }

  return children
}

/**
 * 扫描所有渐进阅读 Topic 及其子块
 *
 * @param pluginName - 插件名称（用于日志）
 * @returns 扫描结果统计
 */
export async function scanIncrementalReadingTopics(
  pluginName: string = "srs-plugin"
): Promise<{
  topics: BlockWithRepr[]
  extractCandidates: number
  topicDetails: Array<{ topicId: DbId; topicText: string; childCount: number }>
}> {
  const topics = await collectIncrementalReadingTopics(pluginName)
  let totalChildren = 0
  const topicDetails = []

  for (const topic of topics) {
    const children = getTopicChildBlocks(topic)
    totalChildren += children.length
    topicDetails.push({
      topicId: topic.id,
      topicText: topic.text || "(无标题)",
      childCount: children.length
    })
  }

  console.log(`[${pluginName}] scanIncrementalReadingTopics: 扫描完成`)
  console.log(`  - Topics: ${topics.length}`)
  console.log(`  - 潜在 Extracts: ${totalChildren}`)
  topicDetails.forEach(detail => {
    console.log(`  - Topic "${detail.topicText}" (ID: ${detail.topicId}): ${detail.childCount} 个子块`)
  })

  return {
    topics,
    extractCandidates: totalChildren,
    topicDetails
  }
}

/**
 * 为块添加 Extract 标记
 *
 * 工作流程：
 * 1. 添加 #card 标签（如果没有）
 * 2. 设置 type: extracts
 * 3. 设置 _repr 为 srs.extract-card
 * 4. 设置 srs.isCard 属性
 *
 * @param blockId - 块 ID
 * @param pluginName - 插件名称（用于日志）
 * @returns 是否成功标记
 */
async function markBlockAsExtract(
  blockId: DbId,
  pluginName: string
): Promise<boolean> {
  try {
    const block = orca.state.blocks[blockId] as Block
    if (!block) {
      console.error(`[${pluginName}] 块 ${blockId} 不存在`)
      return false
    }

    // 检查是否已有 #card 标签
    const hasCardTag = block.refs?.some(
      ref => ref.type === 2 && isCardTag(ref.alias)
    )

    if (hasCardTag) {
      // 已有标签，检查是否已是 extracts 类型
      const currentType = extractCardType(block)
      if (currentType === "extracts") {
        console.log(`[${pluginName}] 块 ${blockId} 已是 Extract，跳过`)
        return true
      }

      // 更新 type 为 extracts
      const cardRef = block.refs?.find(
        ref => ref.type === 2 && isCardTag(ref.alias)
      )
      if (cardRef) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          cardRef,
          [{ name: "type", value: "extracts" }]
        )
        console.log(`[${pluginName}] 更新块 ${blockId} 的 type 为 extracts`)
      }
    } else {
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
      console.log(`[${pluginName}] 为块 ${blockId} 添加 #card 标签，type: extracts`)
    }

    // 设置 _repr
    const blockWithRepr = orca.state.blocks[blockId] as BlockWithRepr
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

    console.log(`[${pluginName}] 块 ${blockId} 标记为 Extract 完成`)
    return true
  } catch (error) {
    console.error(`[${pluginName}] 标记 Extract 失败:`, error)
    return false
  }
}

/**
 * 批量标记 Topic 的子块为 Extract
 *
 * @param topicBlock - Topic 块对象
 * @param pluginName - 插件名称（用于日志）
 * @returns 成功和失败的数量统计
 */
export async function markTopicChildrenAsExtracts(
  topicBlock: Block,
  pluginName: string = "srs-plugin"
): Promise<{ success: number; failed: number }> {
  const children = getTopicChildBlocks(topicBlock)
  let success = 0
  let failed = 0

  for (const child of children) {
    const result = await markBlockAsExtract(child.id, pluginName)
    if (result) {
      success++
    } else {
      failed++
    }
  }

  return { success, failed }
}

/**
 * 批量标记所有渐进阅读 Topic 的子块
 *
 * @param pluginName - 插件名称（用于日志）
 * @returns 处理结果统计
 */
export async function markAllExtractCandidates(
  pluginName: string = "srs-plugin"
): Promise<{
  topicsProcessed: number
  extractsMarked: number
  extractsFailed: number
}> {
  const topics = await collectIncrementalReadingTopics(pluginName)
  let totalSuccess = 0
  let totalFailed = 0

  for (const topic of topics) {
    const { success, failed } = await markTopicChildrenAsExtracts(topic, pluginName)
    totalSuccess += success
    totalFailed += failed
  }

  console.log(`[${pluginName}] markAllExtractCandidates: 完成`)
  console.log(`  - 处理了 ${topics.length} 个 Topic`)
  console.log(`  - 成功标记 ${totalSuccess} 个 Extract`)
  console.log(`  - 失败 ${totalFailed} 个`)

  return {
    topicsProcessed: topics.length,
    extractsMarked: totalSuccess,
    extractsFailed: totalFailed
  }
}
