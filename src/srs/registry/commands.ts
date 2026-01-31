/**
 * 命令注册模块
 *
 * 负责注册和注销所有命令以及编辑器命令
 */

import type { Block } from "../../orca.d.ts"
import { BlockWithRepr } from "../blockUtils"
import { scanCardsFromTags, makeCardFromBlock } from "../cardCreator"
import { createCloze } from "../clozeUtils"
import { insertDirection } from "../directionUtils"
import { createListCardFromBlock } from "../listCardCreator"
import { createTopicCard } from "../topicCardCreator"
import { createExtract } from "../extractUtils"
import { makeAICardFromBlock } from "../ai/aiCardCreator"
import { testAIConnection } from "../ai/aiService"
import { startInteractiveCardCreation } from "../ai/aiInteractiveCardCreator"
import { testAIConfigWithDetails } from "../ai/aiConfigValidator"
import { startAutoMarkExtract, stopAutoMarkExtract } from "../incrementalReadingAutoMark"
import { loadIRState, updateResumeBlockId } from "../incrementalReadingStorage"
import {
  getIncrementalReadingSettings,
  INCREMENTAL_READING_SETTINGS_KEYS
} from "../settings/incrementalReadingSettingsSchema"
import { isCardTag } from "../tagUtils"

export function registerCommands(
  pluginName: string
): void {
  // 在闭包中捕获 pluginName，供 undo 函数使用
  const _pluginName = pluginName

  orca.commands.registerCommand(
    `${pluginName}.scanCardsFromTags`,
    () => {
      console.log(`[${_pluginName}] 执行标签扫描`)
      scanCardsFromTags(_pluginName)
    },
    "SRS: 扫描带标签的卡片"
  )

  orca.commands.registerEditorCommand(
    `${pluginName}.makeCardFromBlock`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await makeCardFromBlock(cursor, _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      if (!undoArgs || !undoArgs.blockId) return

      const block = orca.state.blocks[undoArgs.blockId] as BlockWithRepr
      if (!block) return

      block._repr = undoArgs.originalRepr || { type: "text" }

      if (undoArgs.originalText !== undefined) {
        block.text = undoArgs.originalText
      }

      console.log(`[${_pluginName}] 已撤销：块 #${undoArgs.blockId} 已恢复`)
    },
    {
      label: "SRS: 将块转换为记忆卡片",
      hasArgs: false
    }
  )

  orca.commands.registerEditorCommand(
    `${pluginName}.createCloze`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await createCloze(cursor, _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      // 由于使用虎鲸笔记原生命令（deleteSelection + insertFragments），
      // 撤销操作由框架自动处理，这里只记录日志
      if (!undoArgs || !undoArgs.blockId) return
      console.log(`[${_pluginName}] Cloze 撤销：块 #${undoArgs.blockId}，编号 c${undoArgs.clozeNumber}`)
    },
    {
      label: "SRS: 创建 Cloze 填空",
      hasArgs: false
    }
  )

  // 渐进阅读 Topic 卡命令：将当前块转换为 Topic 卡片
  orca.commands.registerEditorCommand(
    `${pluginName}.createTopicCard`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await createTopicCard(cursor, _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      if (!undoArgs || !undoArgs.blockId) return
      console.log(`[${_pluginName}] Topic 卡片撤销：块 #${undoArgs.blockId}`)
    },
    {
      label: "SRS: 创建 Topic 卡片",
      hasArgs: false
    }
  )

  // 摘录命令：将选中文本摘录为子块（Alt+X / Cmd+X）
  orca.commands.registerEditorCommand(
    `${pluginName}.createExtract`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await createExtract(cursor, _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      // 撤销：删除创建的摘录子块
      if (!undoArgs || !undoArgs.extractBlockId) return
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          [undoArgs.extractBlockId]
        )
        console.log(`[${_pluginName}] 已撤销摘录：删除块 #${undoArgs.extractBlockId}`)
      } catch (error) {
        console.error(`[${_pluginName}] 撤销摘录失败:`, error)
      }
    },
    {
      label: "SRS: 创建摘录（Extract）",
      hasArgs: false
    }
  )

  // 列表卡命令：将当前块转换为列表卡（子块作为条目）
  orca.commands.registerEditorCommand(
    `${pluginName}.createListCard`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await createListCardFromBlock(cursor, _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      // 列表卡涉及标签/属性/多个子块初始化，撤销交由编辑器原生命令栈处理，这里仅记录日志
      if (!undoArgs || !undoArgs.blockId) return
      console.log(`[${_pluginName}] 列表卡撤销：块 #${undoArgs.blockId}`)
    },
    {
      label: "SRS: 创建列表卡",
      hasArgs: false
    }
  )


  // 方向卡命令：正向 (Ctrl+Alt+.)
  orca.commands.registerEditorCommand(
    `${pluginName}.createDirectionForward`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await insertDirection(cursor, "forward", _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      if (!undoArgs || !undoArgs.blockId) return

      const block = orca.state.blocks[undoArgs.blockId] as Block
      if (!block) return

      if (undoArgs.originalContent) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setBlocksContent",
          null,
          [
            {
              id: undoArgs.blockId,
              content: undoArgs.originalContent
            }
          ],
          false
        )
      }
    },
    {
      label: "SRS: 创建正向方向卡 →",
      hasArgs: false
    }
  )

  // 方向卡命令：反向 (Ctrl+Alt+,)
  orca.commands.registerEditorCommand(
    `${pluginName}.createDirectionBackward`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await insertDirection(cursor, "backward", _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      if (!undoArgs || !undoArgs.blockId) return

      const block = orca.state.blocks[undoArgs.blockId] as Block
      if (!block) return

      if (undoArgs.originalContent) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setBlocksContent",
          null,
          [
            {
              id: undoArgs.blockId,
              content: undoArgs.originalContent
            }
          ],
          false
        )
      }
    },
    {
      label: "SRS: 创建反向方向卡 ←",
      hasArgs: false
    }
  )

  // ============ AI 卡片命令 ============

  // AI 生成卡片命令
  orca.commands.registerEditorCommand(
    `${pluginName}.makeAICard`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await makeAICardFromBlock(cursor, _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      // 撤销：删除创建的子块（答案孙子块会一起被删除）
      if (!undoArgs || !undoArgs.blockId) return

      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          [undoArgs.blockId]
        )
        console.log(`[${_pluginName}] 已撤销 AI 卡片：删除块 #${undoArgs.blockId}`)
      } catch (error) {
        console.error(`[${_pluginName}] 撤销 AI 卡片失败:`, error)
      }
    },
    {
      label: "SRS: AI 生成记忆卡片",
      hasArgs: false
    }
  )

  // AI 连接测试命令
  orca.commands.registerCommand(
    `${pluginName}.testAIConnection`,
    async () => {
      console.log(`[${_pluginName}] 测试 AI 连接`)
      orca.notify("info", "正在测试 AI 连接...", { title: "AI 连接测试" })
      
      const result = await testAIConfigWithDetails(_pluginName)
      
      if (result.success) {
        orca.notify("success", result.message, { title: "AI 连接测试" })
      } else {
        orca.notify("error", result.message, { title: "AI 连接测试失败" })
        console.error("[AI 连接测试] 详细信息:", result.details)
      }
    },
    "SRS: 测试 AI 连接"
  )

  orca.commands.registerEditorCommand(
    `${pluginName}.interactiveAICard`,
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      
      const { startInteractiveCardCreationNew } = await import("../ai/aiInteractiveCardCreatorNew")
      await startInteractiveCardCreationNew(cursor, _pluginName)
      return null
    },
    async undoArgs => {
      console.log(`[${_pluginName}] AI 智能制卡撤销（暂不支持批量撤销）`)
    },
    {
      label: "SRS: AI 智能制卡（交互式）",
      hasArgs: false
    }
  )

  // 打开旧复习面板命令（块渲染器模式）
  orca.commands.registerCommand(
    `${pluginName}.openOldReviewPanel`,
    async () => {
      console.log(`[${_pluginName}] 打开旧复习面板`)
      const { startReviewSession } = await import("../../main")
      await startReviewSession()
    },
    "SRS: 打开旧复习面板"
  )

  // 打开 Flash Home 命令
  orca.commands.registerCommand(
    `${pluginName}.openFlashcardHome`,
    async () => {
      console.log(`[${_pluginName}] 打开 Flash Home`)
      const { openFlashcardHome } = await import("../../main")
      await openFlashcardHome()
    },
    "SRS: 打开 Flash Home"
  )

  // 打开渐进阅读面板命令
  orca.commands.registerCommand(
    `${pluginName}.startIncrementalReadingSession`,
    async () => {
      console.log(`[${_pluginName}] 打开渐进阅读面板`)
      const { startIncrementalReadingSession } = await import("../../main")
      await startIncrementalReadingSession()
    },
    "SRS: 打开渐进阅读面板"
  )

  // 打开渐进阅读管理面板命令
  orca.commands.registerCommand(
    `${pluginName}.openIRManager`,
    async () => {
      console.log(`[${_pluginName}] 打开渐进阅读管理面板`)
      const { openIRManager } = await import("../../main")
      await openIRManager()
    },
    "SRS: 渐进阅读管理面板"
  )

  // 渐进阅读自动标签开关
  orca.commands.registerCommand(
    `${pluginName}.toggleAutoExtractMark`,
    async () => {
      const { enableAutoExtractMark } = getIncrementalReadingSettings(_pluginName)
      const nextValue = !enableAutoExtractMark

      try {
        await orca.plugins.setSettings("app", _pluginName, {
          [INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark]: nextValue
        })

        if (nextValue) {
          startAutoMarkExtract(_pluginName)
        } else {
          stopAutoMarkExtract(_pluginName)
        }

        const statusText = nextValue ? "启用" : "禁用"
        orca.notify("success", `渐进阅读自动标签已${statusText}`, { title: "渐进阅读" })
      } catch (error) {
        console.error(`[${_pluginName}] 切换渐进阅读自动标签失败:`, error)
        orca.notify("error", `切换渐进阅读自动标签失败: ${error}`, { title: "渐进阅读" })
      }
    },
    "SRS: 切换渐进阅读自动标签"
  )

  // 渐进阅读：记录当前阅读进度（用于下次自动跳转继续阅读）
  orca.commands.registerEditorCommand(
    `${pluginName}.irRecordProgress`,
    async (editor, ...args) => {
      const [_panelId, _rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置", { title: "渐进阅读" })
        return null
      }

      const currentBlockId = cursor.focus.blockId

      // 从光标位置向上寻找最近的 #card（允许在任意子块上执行）
      let cardBlockId: number | null = null
      let current = orca.state.blocks?.[currentBlockId] as Block | undefined
      let guard = 0
      while (current && guard < 200) {
        const hasCardTag = current.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias))
        if (hasCardTag) {
          cardBlockId = current.id
          break
        }
        if (!current.parent) break
        current = orca.state.blocks?.[current.parent] as Block | undefined
        guard += 1
      }

      if (!cardBlockId) {
        orca.notify("warn", "未找到包含 #card 的父块，无法记录渐进阅读进度", { title: "渐进阅读" })
        return null
      }

      const prev = await loadIRState(cardBlockId)
      await updateResumeBlockId(cardBlockId, currentBlockId)

      orca.notify("success", `已记录阅读进度：#${currentBlockId}`, { title: "渐进阅读" })

      return {
        ret: { cardId: cardBlockId, resumeBlockId: currentBlockId },
        undoArgs: { cardId: cardBlockId, prevResumeBlockId: prev.resumeBlockId }
      }
    },
    async undoArgs => {
      if (!undoArgs || typeof undoArgs.cardId !== "number") return
      await updateResumeBlockId(undoArgs.cardId, undoArgs.prevResumeBlockId ?? null)
    },
    {
      label: "IR: 记录阅读进度（ir_record）",
      hasArgs: false
    }
  )

}

export function unregisterCommands(pluginName: string): void {
  orca.commands.unregisterCommand(`${pluginName}.scanCardsFromTags`)
  orca.commands.unregisterEditorCommand(`${pluginName}.makeCardFromBlock`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createCloze`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createTopicCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createExtract`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createListCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createDirectionForward`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createDirectionBackward`)
  orca.commands.unregisterEditorCommand(`${pluginName}.makeAICard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.interactiveAICard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.irRecordProgress`)
  orca.commands.unregisterCommand(`${pluginName}.testAIConnection`)
  orca.commands.unregisterCommand(`${pluginName}.openOldReviewPanel`)
  
  // Flash Home 命令注销
  orca.commands.unregisterCommand(`${pluginName}.openFlashcardHome`)

  // 渐进阅读命令注销
  orca.commands.unregisterCommand(`${pluginName}.startIncrementalReadingSession`)
  orca.commands.unregisterCommand(`${pluginName}.openIRManager`)
  orca.commands.unregisterCommand(`${pluginName}.toggleAutoExtractMark`)
}
