/**
 * AI 智能制卡弹窗挂载组件
 * 
 * 这个组件被注册到 Headbar，作为"特洛伊木马"将弹窗注入到 Orca 的 React 树中
 * 平时渲染为 null，当状态变化时渲染弹窗
 */

import { aiDialogState, closeAIDialog } from "../srs/ai/aiDialogState"
import { AICardGenerationDialog, type GenerationConfig } from "./AICardGenerationDialog"
import type { Block } from "../orca.d.ts"
import { generateBasicCards, generateClozeCards, type BasicCardData, type ClozeCardData } from "../srs/ai/aiCardGenerators"
import { ensureCardSrsState, writeInitialClozeSrsState } from "../srs/storage"
import { ensureCardTagProperties } from "../srs/tagPropertyInit"
import { getMaxClozeNumberFromContent } from "../srs/clozeUtils"
import type { ContentFragment } from "../orca.d.ts"

const { React, Valtio } = window
const { useSnapshot } = Valtio

interface AIDialogMountProps {
  pluginName: string
}

export function AIDialogMount({ pluginName }: AIDialogMountProps) {
  // 订阅状态变化
  const snap = useSnapshot(aiDialogState)

  // 处理生成卡片
  const handleGenerate = async (config: GenerationConfig) => {
    if (!snap.sourceBlockId) {
      orca.notify("error", "无法找到源块")
      return
    }

    const sourceBlock = orca.state.blocks[snap.sourceBlockId] as Block
    if (!sourceBlock) {
      orca.notify("error", "源块不存在")
      return
    }

    // 获取选中的知识点文本
    const selectedKnowledgePoints = snap.knowledgePoints
      .filter((kp: any) => config.selectedKnowledgePoints.includes(kp.id))
      .map((kp: any) => kp.text)

    // 如果有自定义输入，添加到知识点列表
    if (config.customInput) {
      selectedKnowledgePoints.push(config.customInput)
    }

    if (selectedKnowledgePoints.length === 0) {
      orca.notify("warn", "请至少选择一个知识点")
      return
    }

    orca.notify("info", `正在生成 ${selectedKnowledgePoints.length} 个知识点的卡片...`, { title: "智能制卡" })

    try {
      let cards: BasicCardData[] | ClozeCardData[]

      if (config.cardType === "basic") {
        const result = await generateBasicCards(pluginName, selectedKnowledgePoints, snap.originalContent)
        if (!result.success) {
          orca.notify("error", result.error.message, { title: "生成失败" })
          return
        }
        cards = result.cards
      } else {
        const result = await generateClozeCards(pluginName, selectedKnowledgePoints, snap.originalContent)
        if (!result.success) {
          orca.notify("error", result.error.message, { title: "生成失败" })
          return
        }
        cards = result.cards
      }

      if (cards.length === 0) {
        orca.notify("warn", "AI 未生成任何卡片", { title: "智能制卡" })
        return
      }

      await ensureCardTagProperties(pluginName)

      let successCount = 0

      for (const card of cards) {
        try {
          if (config.cardType === "basic") {
            await insertBasicCard(sourceBlock, card as BasicCardData, pluginName)
            successCount++
          } else {
            await insertClozeCard(sourceBlock, card as ClozeCardData, pluginName)
            successCount++
          }
        } catch (error) {
          console.error("[AI Dialog Mount] 插入卡片失败:", error)
        }
      }

      if (successCount > 0) {
        orca.notify("success", `成功生成 ${successCount} 张卡片`, { title: "智能制卡" })
      } else {
        orca.notify("error", "所有卡片插入失败", { title: "智能制卡" })
      }
    } catch (error) {
      console.error("[AI Dialog Mount] 生成卡片失败:", error)
      orca.notify("error", "生成卡片失败，请重试", { title: "智能制卡" })
    }
  }

  // 如果弹窗未打开，不渲染任何内容
  if (!snap.isOpen) return null

  return (
    <AICardGenerationDialog
      visible={snap.isOpen}
      onClose={closeAIDialog}
      knowledgePoints={snap.knowledgePoints}
      originalContent={snap.originalContent}
      onGenerate={handleGenerate}
    />
  )
}

// ========================================
// 卡片插入辅助函数
// ========================================

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
    console.warn(`[AI Dialog Mount] 无法在文本中找到挖空词: "${cardData.clozeText}"`)
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
