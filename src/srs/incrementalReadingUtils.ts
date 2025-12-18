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
