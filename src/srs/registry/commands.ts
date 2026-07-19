/**
 * 命令注册模块
 *
 * 负责注册和注销所有命令以及编辑器命令
 */

import type { Block } from "../../orca.d.ts"
import { BlockWithRepr } from "../blockUtils"
import { scanCardsFromTags, makeCardFromBlock } from "../cardCreator"
import { createClozeFromEditorCommand } from "../incremental-reading/irClozeCommandService"
import { insertDirection } from "../directionUtils"
import { createListCardFromBlock } from "../listCardCreator"
import { createTopicCard } from "../topicCardCreator"
import { createExtract } from "../extractUtils"
import { testAIConfigWithDetails } from "../ai/aiConfigValidator"
import { startAutoMarkExtract, stopAutoMarkExtract } from "../incrementalReadingAutoMark"
import { loadIRState, updateReadingBreakpoint, updateResumeBlockId } from "../incrementalReadingStorage"
import {
  getIncrementalReadingSettings,
  INCREMENTAL_READING_SETTINGS_KEYS
} from "../settings/incrementalReadingSettingsSchema"
import { getDefaultFsrsSettingsPatch } from "../settings/reviewSettingsSchema"
import { clearFsrsRuntimeState } from "../algorithm"
import { isCardTag } from "../tagUtils"
import { clearRecentDeckPreference } from "../recentDeckManager"

/** F2-08：恢复 FSRS 默认设置的命令 ID 后缀 */
export const RESET_FSRS_SETTINGS_COMMAND = "resetFsrsSettings" as const

export function getResetFsrsSettingsCommandId(pluginName: string): string {
  return `${pluginName}.${RESET_FSRS_SETTINGS_COMMAND}`
}

/**
 * F2-08：将 FSRS 三项设置写回默认，并清理运行时 cache/warning。
 * 成功/失败均由调用方负责用户可见通知；本函数失败会抛出（不假装成功）。
 */
export async function resetFsrsSettingsToDefaults(
  pluginName: string
): Promise<void> {
  await orca.plugins.setSettings(
    "app",
    pluginName,
    getDefaultFsrsSettingsPatch()
  )
  clearFsrsRuntimeState()
}

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
      const [panelId, _rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }

      // 仅当命令目标就是会话当前卡时由 Shell 接管；Topic 子 Extract 继续走编辑器命令。
      const event = new CustomEvent("orca-srs:ir-session-action", {
        detail: {
          action: "itemize",
          panelId: panelId || cursor.panelId || orca.state.activePanel,
          targetBlockId: cursor.anchor.blockId
        },
        cancelable: true
      })
      if (!window.dispatchEvent(event)) return null

      try {
        const result = await createClozeFromEditorCommand(cursor, _pluginName)
        return result ? { ret: result, undoArgs: result } : null
      } catch (error) {
        console.error(`[${_pluginName}] Extract 制卡失败:`, error)
        orca.notify("error", error instanceof Error ? error.message : String(error), {
          title: "渐进阅读"
        })
        return null
      }
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

  // ============ AI 卡片命令（Plan B：单一流程） ============

  const runAIFlashcardCommand = async (editor: any) => {
    const [_panelId, _rootBlockId, cursor] = editor
    if (!cursor) {
      orca.notify("error", "无法获取光标位置")
      return null
    }
    // 动态 import，避免 commands 静态加载 Valtio 弹窗状态（Node 测试环境无 window）
    const { startAIFlashcardFlow } = await import("../ai/aiFlashcardFlow")
    await startAIFlashcardFlow(cursor, _pluginName)
    // 写入在弹窗确认时通过 invokeGroup 完成，命令本身不写块
    return null
  }

  // 主命令：AI 生成闪卡
  orca.commands.registerEditorCommand(
    `${pluginName}.makeAICard`,
    runAIFlashcardCommand,
    async () => {
      // 实际写卡在弹窗内 invokeGroup；此处无撤销参数
    },
    {
      label: "SRS: AI 生成闪卡",
      hasArgs: false
    }
  )

  // 兼容旧命令 ID / 快捷键：同一流程
  orca.commands.registerEditorCommand(
    `${pluginName}.interactiveAICard`,
    runAIFlashcardCommand,
    async () => {},
    {
      label: "SRS: AI 生成闪卡",
      hasArgs: false
    }
  )

  // AI 连接测试命令
  orca.commands.registerCommand(
    `${pluginName}.testAIConnection`,
    async () => {
      orca.notify("info", "正在测试 AI 连接...", { title: "AI 连接测试" })

      const result = await testAIConfigWithDetails(_pluginName)

      if (result.success) {
        orca.notify("success", result.message, { title: "AI 连接测试" })
      } else {
        orca.notify("error", result.message, { title: "AI 连接测试失败" })
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
    "SRS: 渐进阅读（资料库）"
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

  orca.commands.registerCommand(
    `${pluginName}.clearRecentDeckPreference`,
    async () => {
      try {
        await clearRecentDeckPreference(_pluginName)
        orca.notify("success", "后续新卡将回到 Default 牌组", { title: "SRS 默认牌组" })
      } catch (error) {
        console.error(`[${_pluginName}] 清除最近默认牌组失败:`, error)
        orca.notify("error", `清除最近默认牌组失败: ${error}`, { title: "SRS 默认牌组" })
      }
    },
    "SRS: 清除最近默认牌组"
  )

  // F2-08：恢复 FSRS 默认权重 / retention / maximum interval
  orca.commands.registerCommand(
    getResetFsrsSettingsCommandId(pluginName),
    async () => {
      try {
        await resetFsrsSettingsToDefaults(_pluginName)
        orca.notify("success", "已恢复 FSRS 默认设置（权重、目标保留率、最大间隔）", {
          title: "SRS FSRS 设置"
        })
      } catch (error) {
        console.error(`[${_pluginName}] 恢复 FSRS 默认设置失败:`, error)
        orca.notify(
          "error",
          `恢复 FSRS 默认设置失败: ${error instanceof Error ? error.message : String(error)}`,
          { title: "SRS FSRS 设置" }
        )
      }
    },
    "SRS: 恢复 FSRS 默认设置"
  )

  // 渐进阅读会话动作：可选手动绑定到非 Enter 键；广播必须带 panelId，默认不全局 assign Enter
  orca.commands.registerCommand(
    `${pluginName}.irSessionNext`,
    () => {
      const panelId = orca.state.activePanel
      if (!panelId) return
      window.dispatchEvent(new CustomEvent("orca-srs:ir-session-action", {
        detail: { action: "next", panelId }
      }))
    },
    "IR: 下一篇"
  )
  orca.commands.registerCommand(
    `${pluginName}.irSessionPostpone`,
    () => {
      const panelId = orca.state.activePanel
      if (!panelId) return
      window.dispatchEvent(new CustomEvent("orca-srs:ir-session-action", {
        detail: { action: "postpone", panelId }
      }))
    },
    "IR: 推后"
  )
  orca.commands.registerCommand(
    `${pluginName}.irSessionPriority`,
    () => {
      const panelId = orca.state.activePanel
      if (!panelId) return
      window.dispatchEvent(new CustomEvent("orca-srs:ir-session-action", {
        detail: { action: "priority", panelId }
      }))
    },
    "IR: 调整重要性"
  )
  orca.commands.registerCommand(
    `${pluginName}.irToggleViewMode`,
    () => {
      const panelId = orca.state.activePanel
      if (!panelId) return
      window.dispatchEvent(new CustomEvent("orca-srs:ir-session-action", {
        detail: { action: "toggleViewMode", panelId }
      }))
    },
    "IR: 切换到编辑模式"
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
      await updateReadingBreakpoint(cardBlockId, {
        resumeBlockId: currentBlockId,
        selection: {
          rootBlockId: cardBlockId,
          anchor: { ...cursor.anchor },
          focus: { ...cursor.focus },
          isForward: cursor.isForward
        }
      })

      orca.notify("success", `已记录阅读进度：#${currentBlockId}`, { title: "渐进阅读" })

      return {
        ret: { cardId: cardBlockId, resumeBlockId: currentBlockId },
        undoArgs: {
          cardId: cardBlockId,
          prevResumeBlockId: prev.resumeBlockId,
          prevReadingBreakpoint: prev.readingBreakpoint ?? null
        }
      }
    },
    async undoArgs => {
      if (!undoArgs || typeof undoArgs.cardId !== "number") return
      await updateResumeBlockId(undoArgs.cardId, undoArgs.prevResumeBlockId ?? null)
      await updateReadingBreakpoint(undoArgs.cardId, {
        previewBlockId: undoArgs.prevReadingBreakpoint?.previewBlockId ?? null,
        selection: undoArgs.prevReadingBreakpoint?.selection ?? null
      })
    },
    {
      label: "IR: 记录阅读进度（ir_record）",
      hasArgs: false
    }
  )

  // EPUB 导入（普通笔记）
  orca.commands.registerCommand(
    `${pluginName}.importEpub`,
    async () => {
      const { showEpubImportDialog } = await import("../../components/epub-import/EpubImportDialogMount")
      showEpubImportDialog(_pluginName)
    },
    "导入 EPUB"
  )

  // 网页文章导入（Firecrawl → 普通笔记 + 可选渐进阅读）
  orca.commands.registerCommand(
    `${pluginName}.importWeb`,
    async () => {
      const { showWebImportDialog } = await import("../../components/web-import/WebImportDialogMount")
      showWebImportDialog(_pluginName)
    },
    "导入网页"
  )

  // 顺序解锁：跳过本章并继续
  orca.commands.registerCommand(
    `${pluginName}.skipSequentialChapter`,
    async () => {
      try {
        // Prefer current IR session card via custom event if shell is open
        const panelId = orca.state.activePanel
        const notPrevented = window.dispatchEvent(new CustomEvent("orca-srs:ir-session-action", {
          detail: { action: "skipChapter", panelId },
          cancelable: true
        }))
        // Shell calls preventDefault when it handles skip
        if (!notPrevented) return

        // Fallback when session shell did not handle the event
        orca.notify("warn", "请在顺序阅读会话中操作；主路径请使用「完成」完成本章", {
          title: "渐进阅读"
        })
      } catch (error) {
        console.error("[BookIR] skip failed:", error)
        orca.notify("error", error instanceof Error ? error.message : String(error), {
          title: "渐进阅读"
        })
      }
    },
    "IR: 跳过本章并继续"
  )

  // 整本移出渐进阅读（按稳定 bookBlockId；共享确认摘要）
  orca.commands.registerCommand(
    `${pluginName}.removeBookFromIR`,
    async (bookBlockId?: number) => {
      const id = typeof bookBlockId === "number" ? bookBlockId : undefined
      if (typeof id !== "number") {
        orca.notify("warn", "未指定书籍块（请从书籍右键菜单或资料库来源书入口调用）", {
          title: "渐进阅读"
        })
        return
      }
      try {
        const { confirmAndRemoveBookFromIR } = await import("../book-ir/bookIRRemovalConfirm")
        const result = await confirmAndRemoveBookFromIR(id, _pluginName)
        if (result == null) return
        if (result.kind === "partial") {
          orca.notify(
            "warn",
            `移出成功 ${result.success.length}，失败 ${result.failed.length}（可重试）`,
            { title: "渐进阅读" }
          )
        } else {
          orca.notify("success", result.message || "已移出", { title: "渐进阅读" })
        }
      } catch (error) {
        console.error("[BookIR] remove book failed:", error)
        orca.notify("error", error instanceof Error ? error.message : String(error), {
          title: "渐进阅读"
        })
      }
    },
    "IR: 将整本书移出渐进阅读"
  )

  // 跨会话：继续未完成的 EPUB 导入
  orca.commands.registerCommand(
    `${pluginName}.resumeEpubImport`,
    async (bookBlockId?: number) => {
      const id = typeof bookBlockId === "number" ? bookBlockId : undefined
      if (typeof id !== "number") {
        orca.notify("warn", "未指定书籍块", { title: "EPUB 导入" })
        return
      }
      try {
        orca.notify("info", "正在继续导入…", { title: "EPUB 导入" })
        const { resumeEpubImport } = await import("../../importers/epub/epubImportService")
        const result = await resumeEpubImport(id)
        if (result.status === "complete") {
          orca.notify(
            "success",
            `继续导入完成（${result.importedChapterIds.length} 章）`,
            { title: "EPUB 导入" }
          )
        } else {
          orca.notify(
            "warn",
            `仍有未完成章节：失败 ${result.failedChapters.length}，未开始 ${result.pendingChapters.length}`,
            { title: "EPUB 导入" }
          )
        }
      } catch (error) {
        console.error("[epub] resume failed:", error)
        orca.notify("error", error instanceof Error ? error.message : String(error), {
          title: "EPUB 导入"
        })
      }
    },
    "继续导入 EPUB"
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
  orca.commands.unregisterCommand(`${pluginName}.irSessionNext`)
  orca.commands.unregisterCommand(`${pluginName}.irSessionPostpone`)
  orca.commands.unregisterCommand(`${pluginName}.irSessionPriority`)
  orca.commands.unregisterCommand(`${pluginName}.irToggleViewMode`)
  orca.commands.unregisterCommand(`${pluginName}.testAIConnection`)
  orca.commands.unregisterCommand(`${pluginName}.openOldReviewPanel`)
  
  // Flash Home 命令注销
  orca.commands.unregisterCommand(`${pluginName}.openFlashcardHome`)

  // 渐进阅读命令注销
  orca.commands.unregisterCommand(`${pluginName}.startIncrementalReadingSession`)
  orca.commands.unregisterCommand(`${pluginName}.openIRManager`)
  orca.commands.unregisterCommand(`${pluginName}.toggleAutoExtractMark`)
  orca.commands.unregisterCommand(`${pluginName}.clearRecentDeckPreference`)
  orca.commands.unregisterCommand(getResetFsrsSettingsCommandId(pluginName))
  orca.commands.unregisterCommand(`${pluginName}.importEpub`)
  orca.commands.unregisterCommand(`${pluginName}.importWeb`)
  orca.commands.unregisterCommand(`${pluginName}.skipSequentialChapter`)
  orca.commands.unregisterCommand(`${pluginName}.removeBookFromIR`)
  orca.commands.unregisterCommand(`${pluginName}.resumeEpubImport`)
}
