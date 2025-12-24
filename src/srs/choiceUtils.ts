/**
 * 选择题卡片工具模块
 *
 * 职责：
 * - 检测锚定选项（包含"以上"等关键词）
 * - 从块中提取选择项
 * - 检测选择题模式（单选/多选）
 * - 智能乱序选项
 * - 计算自动评分
 */

import type { Block, DbId } from "../orca.d.ts"
import type { ChoiceOption, ChoiceMode, Grade } from "./types"
import { isCorrectTag } from "./tagUtils"

/**
 * 锚定关键词列表
 * 包含这些关键词的选项在乱序时会固定在末尾
 */
const ANCHOR_KEYWORDS = [
  "以上",
  "皆非",
  "都是",
  "都不是",
  "all of the above",
  "none of the above",
  "all above",
  "none above"
]

/**
 * 检测选项文本是否为锚定选项
 * 
 * 锚定选项包含特定关键词（如"以上"、"皆非"等），
 * 在乱序时应固定在末尾位置
 * 
 * @param text - 选项文本
 * @returns 是否为锚定选项
 */
export function isAnchorOption(text: string): boolean {
  if (!text) return false
  const lowerText = text.toLowerCase()
  return ANCHOR_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()))
}

/**
 * 从选择题卡片块中提取选择项
 * 
 * 只识别直接子块作为选项，嵌套内容会被完整保留但不作为独立选项
 * 
 * @param block - 选择题卡片块
 * @returns 选择项数组
 */
export function extractChoiceOptions(block: Block): ChoiceOption[] {
  if (!block.children || block.children.length === 0) {
    return []
  }

  const options: ChoiceOption[] = []

  for (const childId of block.children) {
    const childBlock = orca.state.blocks[childId] as Block | undefined
    if (!childBlock) continue

    // 获取选项文本
    const text = childBlock.text || ""
    
    // 获取完整内容用于渲染
    const content = childBlock.content || []

    // 检查是否为正确选项（通过 #correct 或 #正确 标签）
    const isCorrect = childBlock.refs?.some(
      ref => ref.type === 2 && isCorrectTag(ref.alias)
    ) ?? false

    // 检查是否为锚定选项
    const isAnchor = isAnchorOption(text)

    options.push({
      blockId: childId,
      text,
      content,
      isCorrect,
      isAnchor
    })
  }

  return options
}

/**
 * 检测选择题模式
 * 
 * 根据正确选项数量判断：
 * - 0 个正确选项：undefined（未定义）
 * - 1 个正确选项：single（单选）
 * - 多个正确选项：multiple（多选）
 * 
 * @param options - 选择项数组
 * @returns 选择题模式
 */
export function detectChoiceMode(options: ChoiceOption[]): ChoiceMode {
  const correctCount = options.filter(opt => opt.isCorrect).length
  
  if (correctCount === 0) {
    return "undefined"
  } else if (correctCount === 1) {
    return "single"
  } else {
    return "multiple"
  }
}


/**
 * Fisher-Yates 洗牌算法
 * 
 * @param array - 要打乱的数组
 * @returns 打乱后的新数组
 */
function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * 智能乱序选项（分段合并算法）
 * 
 * 算法步骤：
 * 1. 将选项分为非锚定选项和锚定选项两组
 * 2. 对非锚定选项进行随机打乱
 * 3. 将锚定选项按原始顺序追加到末尾
 * 
 * @param options - 选择项数组
 * @param isOrdered - 是否禁用乱序（#ordered 标签）
 * @returns 乱序后的选项和索引映射
 */
export function shuffleOptions(
  options: ChoiceOption[],
  isOrdered: boolean
): { options: ChoiceOption[]; shuffledOrder: number[] } {
  // 如果启用有序模式，直接返回原顺序
  if (isOrdered) {
    return {
      options: [...options],
      shuffledOrder: options.map((_, i) => i)
    }
  }

  // 分离非锚定选项和锚定选项，同时记录原始索引
  const nonAnchorItems: { option: ChoiceOption; originalIndex: number }[] = []
  const anchorItems: { option: ChoiceOption; originalIndex: number }[] = []

  options.forEach((option, index) => {
    if (option.isAnchor) {
      anchorItems.push({ option, originalIndex: index })
    } else {
      nonAnchorItems.push({ option, originalIndex: index })
    }
  })

  // 打乱非锚定选项
  const shuffledNonAnchor = fisherYatesShuffle(nonAnchorItems)

  // 合并：打乱后的非锚定选项 + 原顺序的锚定选项
  const combined = [...shuffledNonAnchor, ...anchorItems]

  return {
    options: combined.map(item => item.option),
    shuffledOrder: combined.map(item => item.originalIndex)
  }
}

/**
 * 计算自动评分
 * 
 * 评分策略：
 * - 全对（选中所有正确选项且无错选）-> Good
 * - 部分对（多选题：漏选但无错选）-> Hard
 * - 有错选或单选题答错 -> Again
 * - 无正确答案定义 -> null（跳过自动评分）
 * 
 * @param selectedIds - 用户选中的选项 Block IDs
 * @param correctIds - 正确选项 Block IDs
 * @param mode - 选择题模式
 * @returns 建议的评分，或 null 表示跳过自动评分
 */
export function calculateAutoGrade(
  selectedIds: DbId[],
  correctIds: DbId[],
  mode: ChoiceMode
): Grade | null {
  // 无正确答案定义时跳过自动评分
  if (mode === "undefined" || correctIds.length === 0) {
    return null
  }

  // 转换为 Set 便于比较
  const selectedSet = new Set(selectedIds)
  const correctSet = new Set(correctIds)

  // 检查是否有错选（选中了不正确的选项）
  const hasIncorrectSelection = selectedIds.some(id => !correctSet.has(id))

  // 检查是否选中了所有正确选项
  const allCorrectSelected = correctIds.every(id => selectedSet.has(id))

  // 单选题逻辑
  if (mode === "single") {
    // 单选题：选对唯一正确答案 -> Good，否则 -> Again
    if (selectedIds.length === 1 && correctSet.has(selectedIds[0])) {
      return "good"
    }
    return "again"
  }

  // 多选题逻辑
  if (hasIncorrectSelection) {
    // 有错选 -> Again
    return "again"
  }

  if (allCorrectSelected) {
    // 全对 -> Good
    return "good"
  }

  // 部分对（漏选但无错选）-> Hard
  return "hard"
}
