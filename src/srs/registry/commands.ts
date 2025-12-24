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
import { makeAICardFromBlock } from "../ai/aiCardCreator"
import { testAIConnection } from "../ai/aiService"

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
      
      const result = await testAIConnection(_pluginName)
      
      if (result.success) {
        orca.notify("success", result.message, { title: "AI 连接测试" })
      } else {
        orca.notify("error", result.message, { title: "AI 连接测试" })
      }
    },
    "SRS: 测试 AI 连接"
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
}

export function unregisterCommands(pluginName: string): void {
  orca.commands.unregisterCommand(`${pluginName}.scanCardsFromTags`)
  orca.commands.unregisterEditorCommand(`${pluginName}.makeCardFromBlock`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createCloze`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createDirectionForward`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createDirectionBackward`)
  
  // AI 命令注销
  orca.commands.unregisterEditorCommand(`${pluginName}.makeAICard`)
  orca.commands.unregisterCommand(`${pluginName}.testAIConnection`)
  orca.commands.unregisterCommand(`${pluginName}.openOldReviewPanel`)
  
  // Flash Home 命令注销
  orca.commands.unregisterCommand(`${pluginName}.openFlashcardHome`)
}
