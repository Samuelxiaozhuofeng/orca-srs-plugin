/**
 * AI 交互式卡片创建器 - 简化版
 * 
 * 使用 Orca 原生的块渲染器方式，而不是 ReactDOM
 */

import type { CursorData, Block, ContentFragment } from "../../orca.d.ts"
import type { KnowledgePoint } from "./aiKnowledgeExtractor"
import type { GenerationConfig } from "../../components/AICardGenerationDialog"
import { extractKnowledgePoints } from "./aiKnowledgeExtractor"
import { generateBasicCards, generateClozeCards, type BasicCardData, type ClozeCardData } from "./aiCardGenerators"
import { ensureCardSrsState, writeInitialClozeSrsState } from "../storage"
import { ensureCardTagProperties } from "../tagPropertyInit"
import { getMaxClozeNumberFromContent } from "../clozeUtils"
import { buildCardTagData } from "../cardTagDataBuilder"

let dialogBlockId: number | null = null
let dialogResolve: ((count: number | null) => void) | null = null

export async function startInteractiveCardCreationSimple(
  cursor: CursorData,
  pluginName: string
): Promise<number | null> {
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("warn", "请先选中一个块")
    return null
  }
  
  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block
  
  if (!block) {
    orca.notify("error", "未找到当前块")
    return null
  }
  
  const content = block.text?.trim()
  if (!content) {
    orca.notify("warn", "当前块内容为空，无法生成卡片")
    return null
  }
  
  orca.notify("info", "AI 正在分析内容...", { title: "智能制卡" })
  
  const extractResult = await extractKnowledgePoints(pluginName, content)
  
  if (!extractResult.success) {
    orca.notify("error", extractResult.error.message, { title: "分析失败" })
    return null
  }
  
  if (extractResult.knowledgePoints.length === 0) {
    orca.notify("warn", "未检测到知识点，将使用原始内容生成卡片", { title: "智能制卡" })
    
    const cardType = await askCardType()
    if (!cardType) return null
    
    return await generateAndInsertCardsSimple(block, [content], cardType, content, pluginName)
  }
  
  const dialogBlock = await createDialogBlock(block, extractResult.knowledgePoints, content, pluginName)
  if (!dialogBlock) {
    orca.notify("error", "无法创建对话框")
    return null
  }
  
  dialogBlockId = dialogBlock
  
  return new Promise((resolve) => {
    dialogResolve = resolve
  })
}

async function createDialogBlock(
  parentBlock: Block,
  knowledgePoints: KnowledgePoint[],
  originalContent: string,
  pluginName: string
): Promise<number | null> {
  try {
    const dialogBlockId = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      parentBlock,
      "lastChild",
      [{ t: "t", v: "🤖 AI 智能制卡 - 请选择知识点" }]
    )
    
    if (!dialogBlockId) return null
    
    const dialogBlock = orca.state.blocks[dialogBlockId] as any
    if (dialogBlock) {
      dialogBlock._repr = {
        type: "orca-srs.ai-dialog",
        knowledgePoints,
        originalContent,
        pluginName
      }
    }
    
    return dialogBlockId
  } catch (error) {
    console.error("[AI Interactive Card Creator] 创建对话框块失败:", error)
    return null
  }
}

async function askCardType(): Promise<"basic" | "cloze" | null> {
  return new Promise((resolve) => {
    orca.notify("info", "请选择卡片类型：\n1. Basic Card（问答卡）\n2. Cloze Card（填空卡）", {
      title: "选择卡片类型"
    })
    
    setTimeout(() => resolve("basic"), 100)
  })
}

export async function handleDialogGenerate(
  config: GenerationConfig,
  originalContent: string,
  pluginName: string
): Promise<void> {
  if (!dialogBlockId || !dialogResolve) {
    orca.notify("error", "对话框状态异常")
    return
  }
  
  const block = orca.state.blocks[dialogBlockId] as Block
  if (!block || !block.parent) {
    orca.notify("error", "无法找到原始块")
    return
  }
  
  const parentBlock = orca.state.blocks[block.parent] as Block
  
  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [dialogBlockId]
    )
  } catch (error) {
    console.warn("[AI Interactive Card Creator] 删除对话框块失败:", error)
  }
  
  const count = await generateAndInsertCardsSimple(
    parentBlock,
    config.selectedKnowledgePoints,
    config.cardType,
    originalContent,
    pluginName
  )
  
  dialogResolve(count)
  dialogBlockId = null
  dialogResolve = null
}

export async function handleDialogCancel(): Promise<void> {
  if (dialogBlockId) {
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.deleteBlocks",
        null,
        [dialogBlockId]
      )
    } catch (error) {
      console.warn("[AI Interactive Card Creator] 删除对话框块失败:", error)
    }
  }
  
  if (dialogResolve) {
    dialogResolve(null)
  }
  
  dialogBlockId = null
  dialogResolve = null
}

async function generateAndInsertCardsSimple(
  parentBlock: Block,
  knowledgePoints: string[],
  cardType: "basic" | "cloze",
  originalContent: string,
  pluginName: string
): Promise<number> {
  if (knowledgePoints.length === 0) {
    orca.notify("warn", "请至少选择一个知识点")
    return 0
  }
  
  orca.notify("info", `正在生成 ${knowledgePoints.length} 个知识点的卡片...`, { title: "智能制卡" })
  
  let cards: BasicCardData[] | ClozeCardData[]
  
  if (cardType === "basic") {
    const result = await generateBasicCards(pluginName, knowledgePoints, originalContent)
    if (!result.success) {
      orca.notify("error", result.error.message, { title: "生成失败" })
      return 0
    }
    cards = result.cards
  } else {
    const result = await generateClozeCards(pluginName, knowledgePoints, originalContent)
    if (!result.success) {
      orca.notify("error", result.error.message, { title: "生成失败" })
      return 0
    }
    cards = result.cards
  }
  
  if (cards.length === 0) {
    orca.notify("warn", "AI 未生成任何卡片", { title: "智能制卡" })
    return 0
  }
  
  await ensureCardTagProperties(pluginName)
  
  let successCount = 0
  
  for (const card of cards) {
    try {
      if (cardType === "basic") {
        await insertBasicCard(parentBlock, card as BasicCardData, pluginName)
        successCount++
      } else {
        await insertClozeCard(parentBlock, card as ClozeCardData, pluginName)
        successCount++
      }
    } catch (error) {
      console.error("[AI Interactive Card Creator] 插入卡片失败:", error)
    }
  }
  
  if (successCount > 0) {
    orca.notify("success", `成功生成 ${successCount} 张卡片`, { title: "智能制卡" })
  } else {
    orca.notify("error", "所有卡片插入失败", { title: "智能制卡" })
  }
  
  return successCount
}

async function insertBasicCard(
  parentBlock: Block,
  cardData: BasicCardData,
  pluginName: string
): Promise<void> {
  const questionBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    parentBlock,
    "lastChild",
    [{ t: "t", v: cardData.question }]
  )
  
  if (!questionBlockId) {
    throw new Error("创建问题块失败")
  }
  
  const questionBlock = orca.state.blocks[questionBlockId] as Block
  if (!questionBlock) {
    throw new Error("无法获取问题块")
  }
  
  const answerBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    questionBlock,
    "lastChild",
    [{ t: "t", v: cardData.answer }]
  )
  
  if (!answerBlockId) {
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [questionBlockId]
    )
    throw new Error("创建答案块失败")
  }
  
  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    questionBlockId,
    "card",
    await buildCardTagData(pluginName, questionBlockId, "basic")
  )
  
  await ensureCardSrsState(questionBlockId)
}

async function insertClozeCard(
  parentBlock: Block,
  cardData: ClozeCardData,
  pluginName: string
): Promise<void> {
  const blockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    parentBlock,
    "lastChild",
    [{ t: "t", v: cardData.text }]
  )
  
  if (!blockId) {
    throw new Error("创建填空卡块失败")
  }
  
  const block = orca.state.blocks[blockId] as Block
  if (!block) {
    throw new Error("无法获取填空卡块")
  }
  
  const clozeIndex = cardData.text.indexOf(cardData.clozeText)
  if (clozeIndex === -1) {
    console.warn(`[AI Interactive Card Creator] 无法在文本中找到挖空词: "${cardData.clozeText}"`)
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [blockId]
    )
    throw new Error("无法定位挖空位置")
  }
  
  const maxClozeNumber = getMaxClozeNumberFromContent(block.content, pluginName)
  const newClozeNumber = maxClozeNumber + 1
  
  const beforeText = cardData.text.substring(0, clozeIndex)
  const afterText = cardData.text.substring(clozeIndex + cardData.clozeText.length)
  
  const newContent: ContentFragment[] = []
  
  if (beforeText) {
    newContent.push({ t: "t", v: beforeText })
  }
  
  newContent.push({
    t: `${pluginName}.cloze`,
    v: cardData.clozeText,
    clozeNumber: newClozeNumber
  } as any)
  
  if (afterText) {
    newContent.push({ t: "t", v: afterText })
  }
  
  await orca.commands.invokeEditorCommand(
    "core.editor.setBlockContent",
    null,
    blockId,
    newContent
  )
  
  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    blockId,
    "card",
    await buildCardTagData(pluginName, blockId, "cloze")
  )
  
  await writeInitialClozeSrsState(blockId, newClozeNumber, 0)
}
