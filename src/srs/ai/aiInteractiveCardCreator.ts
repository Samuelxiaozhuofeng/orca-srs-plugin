import type { CursorData, Block, ContentFragment } from "../../orca.d.ts"
import type { KnowledgePoint } from "./aiKnowledgeExtractor"
import type { GenerationConfig } from "../../components/AICardGenerationDialog"
import { extractKnowledgePoints } from "./aiKnowledgeExtractor"
import { generateBasicCards, generateClozeCards, type BasicCardData, type ClozeCardData } from "./aiCardGenerators"
import { ensureCardSrsState, writeInitialClozeSrsState } from "../storage"
import { ensureCardTagProperties } from "../tagPropertyInit"
import { getMaxClozeNumberFromContent } from "../clozeUtils"

let dialogContainer: HTMLDivElement | null = null
let dialogRoot: any = null

function getOrCreateDialogContainer(): HTMLDivElement {
  if (!dialogContainer) {
    dialogContainer = document.createElement("div")
    dialogContainer.id = "ai-card-generation-dialog-container"
    document.body.appendChild(dialogContainer)
  }
  return dialogContainer
}

async function showDialog(
  knowledgePoints: KnowledgePoint[],
  originalContent: string,
  onGenerate: (config: GenerationConfig) => Promise<void>,
  onCancel: () => void
): Promise<void> {
  const React = window.React
  const ReactDOM = window.ReactDOM as any
  
  if (!React || !ReactDOM) {
    console.error("[AI Interactive Card Creator] React or ReactDOM not found")
    console.error("[AI Interactive Card Creator] window.React:", typeof window.React)
    console.error("[AI Interactive Card Creator] window.ReactDOM:", typeof window.ReactDOM)
    orca.notify("error", "无法加载对话框组件，请刷新页面重试")
    return
  }
  
  const { AICardGenerationDialog } = await import("../../components/AICardGenerationDialog")
  
  const container = getOrCreateDialogContainer()
  
  if (!dialogRoot) {
    if (ReactDOM.createRoot) {
      dialogRoot = ReactDOM.createRoot(container)
    } else {
      console.warn("[AI Interactive Card Creator] 使用旧版 ReactDOM.render")
      dialogRoot = {
        render: (element: any) => ReactDOM.render(element, container)
      }
    }
  }
  
  const handleClose = () => {
    dialogRoot.render(React.createElement(AICardGenerationDialog, {
      visible: false,
      onClose: () => {},
      knowledgePoints: [],
      originalContent: "",
      onGenerate: async () => {}
    }))
    onCancel()
  }
  
  const handleGenerate = async (config: GenerationConfig) => {
    await onGenerate(config)
    handleClose()
  }
  
  dialogRoot.render(React.createElement(AICardGenerationDialog, {
    visible: true,
    onClose: handleClose,
    knowledgePoints,
    originalContent,
    onGenerate: handleGenerate
  }))
}

export async function startInteractiveCardCreation(
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
    orca.notify("warn", "未检测到知识点，请使用自定义输入", { title: "智能制卡" })
  }
  
  return new Promise((resolve) => {
    showDialog(
      extractResult.knowledgePoints,
      content,
      async (config) => {
        try {
          const count = await generateAndInsertCards(block, config, content, pluginName)
          resolve(count)
        } catch (error) {
          console.error("[AI Interactive Card Creator] 生成卡片失败:", error)
          orca.notify("error", "生成卡片失败，请重试")
          resolve(null)
        }
      },
      () => resolve(null)
    )
  })
}

async function generateAndInsertCards(
  parentBlock: Block,
  config: GenerationConfig,
  originalContent: string,
  pluginName: string
): Promise<number> {
  const selectedKnowledgePoints = config.selectedKnowledgePoints
  const customKnowledgePoint = config.customInput
  
  const allKnowledgePoints: string[] = [...selectedKnowledgePoints]
  if (customKnowledgePoint) {
    allKnowledgePoints.push(customKnowledgePoint)
  }
  
  if (allKnowledgePoints.length === 0) {
    orca.notify("warn", "请至少选择一个知识点")
    return 0
  }
  
  orca.notify("info", `正在生成 ${allKnowledgePoints.length} 个知识点的卡片...`, { title: "智能制卡" })
  
  let cards: BasicCardData[] | ClozeCardData[]
  
  if (config.cardType === "basic") {
    const result = await generateBasicCards(pluginName, allKnowledgePoints, originalContent)
    if (!result.success) {
      orca.notify("error", result.error.message, { title: "生成失败" })
      return 0
    }
    cards = result.cards
  } else {
    const result = await generateClozeCards(pluginName, allKnowledgePoints, originalContent)
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
      if (config.cardType === "basic") {
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
    [
      { name: "type", value: "basic" },
      { name: "牌组", value: [] },
      { name: "status", value: "" }
    ]
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
    [
      { name: "type", value: "cloze" },
      { name: "牌组", value: [] },
      { name: "status", value: "" }
    ]
  )
  
  await writeInitialClozeSrsState(blockId, newClozeNumber, 0)
}
