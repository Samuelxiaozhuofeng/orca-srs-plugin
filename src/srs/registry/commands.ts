/**
 * 命令注册模块
 *
 * 负责注册和注销所有命令以及编辑器命令
 */

import type { Block } from "../../orca.d.ts"
import { scanCardsFromTags, makeCardFromBlock } from "../cardCreator"
import { createChoiceCardFromBlock } from "../choiceCardCreator"
import { createClozeFromEditorCommand } from "../incremental-reading/irClozeCommandService"
import { insertDirection } from "../directionUtils"
import { getIrItemCreateOptionsForBlock } from "../irItemCreateContext"
import { createListCardFromBlock } from "../listCardCreator"
import { createTopicCard } from "../topicCardCreator"
import { createExtract } from "../extractUtils"
import {
  undoBasicCardCreation,
  undoClozeCardCreation,
  undoListCardCreation,
  undoTopicCardCreation
} from "./cardCreationUndo"
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
import { launchGotItFromEditor } from "../incremental-reading/chapterQuiz"

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
      await undoBasicCardCreation(undoArgs)
    },
    {
      label: "SRS: 将块转换为记忆卡片",
      hasArgs: false
    }
  )

  // 选择题：#card type=choice + #choice
  orca.commands.registerEditorCommand(
    `${pluginName}.createChoiceCard`,
    async (editor, ...args) => {
      const [_panelId, _rootBlockId, cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await createChoiceCardFromBlock(cursor, _pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    async undoArgs => {
      await undoBasicCardCreation(undoArgs)
    },
    {
      label: "SRS: 创建选择题",
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
      // 内容 fragment 的撤销由编辑器原生命令栈处理；这里对称清理本次 srs.cN.* / 可选 #card
      await undoClozeCardCreation(undoArgs)
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
      await undoTopicCardCreation(undoArgs)
    },
    {
      label: "SRS: 创建 Topic 卡片",
      hasArgs: false
    }
  )

  // GOTIT?：任意页面底部按页面全文出一次性单选题小测（与 IR 完成路径共用章末小测块）
  orca.commands.registerEditorCommand(
    `${pluginName}.gotitQuiz`,
    async (editor) => {
      const [panelId, rootBlockId, cursor] = editor
      try {
        const blockId = await launchGotItFromEditor(_pluginName, [
          panelId,
          Number(rootBlockId),
          cursor
        ])
        return blockId != null ? { ret: { blockId }, undoArgs: {} } : null
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[GOTIT?] 启动失败:", error)
        orca.notify("error", message, { title: "GOTIT?" })
        return null
      }
    },
    () => {},
    {
      label: "SRS: GOTIT? 页面小测",
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

  // IR 选区工具栏「一键解释」：仅渐进阅读会话内生效（由 useIRBlockExplain 监听并 preventDefault）
  orca.commands.registerEditorCommand(
    `${pluginName}.irBlockExplainFromSelection`,
    async () => {
      const event = new CustomEvent("orca-srs:ir-block-explain-request", {
        cancelable: true,
        detail: { pluginName: _pluginName }
      })
      const handled = !window.dispatchEvent(event)
      if (!handled) {
        orca.notify("warn", "一键解释仅在渐进阅读会话内可用（请先选中正文中的文字）", {
          title: "块解释"
        })
      }
      return null
    },
    () => {},
    {
      label: "SRS: 渐进阅读一键解释",
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
      await undoListCardCreation(undoArgs)
    },
    {
      label: "SRS: 创建列表卡",
      hasArgs: false
    }
  )

  // 图片遮罩：打开编辑器（斜杠 /io / 右键 / 命令面板）
  orca.commands.registerEditorCommand(
    `${pluginName}.openImageOcclusionEditor`,
    async (editor) => {
      const [_panelId, _rootBlockId, cursor] = editor
      if (!cursor?.anchor?.blockId) {
        orca.notify("error", "无法获取光标位置", { title: "图片遮罩" })
        return null
      }
      try {
        const { openImageOcclusionEditor } = await import(
          "../../components/image-occlusion/ImageOcclusionEditorMount"
        )
        openImageOcclusionEditor(cursor.anchor.blockId, _pluginName)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[${_pluginName}] 打开图片遮罩编辑器失败:`, error)
        orca.notify("error", message, { title: "图片遮罩" })
      }
      return null
    },
    () => {},
    {
      label: "SRS: 图片遮罩（IO）",
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
      const blockId = cursor.anchor.blockId
      const block = (orca.state.blocks?.[blockId] as Block | undefined) ?? null
      const irOpts = await getIrItemCreateOptionsForBlock(block, blockId)
      const result = await insertDirection(
        cursor,
        "forward",
        _pluginName,
        irOpts
      )
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
      const blockId = cursor.anchor.blockId
      const block = (orca.state.blocks?.[blockId] as Block | undefined) ?? null
      const irOpts = await getIrItemCreateOptionsForBlock(block, blockId)
      const result = await insertDirection(
        cursor,
        "backward",
        _pluginName,
        irOpts
      )
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

  // 选中文本 AI 快捷交互（工具栏下拉）
  orca.commands.registerEditorCommand(
    `${pluginName}.aiQuickInteract`,
    async (editor, promptKey?: string) => {
      const [, , cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置", { title: "AI 快捷交互" })
        return null
      }
      const { startAIQuickInteractFlow } = await import("../ai/aiQuickInteract")
      if (promptKey === "__custom__") {
        await startAIQuickInteractFlow(cursor, _pluginName, { mode: "custom" })
      } else {
        await startAIQuickInteractFlow(cursor, _pluginName, {
          mode: "preset",
          promptId: String(promptKey ?? "")
        })
      }
      return null
    },
    async () => {
      // 写入在弹窗内 invokeGroup；命令本身无撤销
    },
    {
      label: "SRS: AI 快捷交互",
      hasArgs: true
    }
  )

  // 选中文本 → Azure TTS → 原生 audio block（对称 undo：删 audio + 恢复 manifest）
  orca.commands.registerEditorCommand(
    `${pluginName}.ttsFromSelection`,
    async (editor) => {
      const [, , cursor] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置", { title: "TTS" })
        return null
      }
      const {
        runSelectionTtsCommand
      } = await import("../tts/ttsSelectionCommand")
      const result = await runSelectionTtsCommand(cursor, _pluginName)
      if (!result.ok) {
        if (result.openSettings) {
          const { openAIServiceSettings } = await import(
            "../ai/aiServiceSettingsState"
          )
          await openAIServiceSettings(_pluginName)
        }
        return null
      }
      // skipped / 失败不产生可误删内容的 undoArgs
      if (result.status === "created" && result.undoArgs) {
        return { ret: result, undoArgs: result.undoArgs }
      }
      return null
    },
    async (undoArgs) => {
      // 与同文件 makeCard/createExtract 一致：宿主 undo 传入的首参即为 undoArgs
      const { undoSelectionTts } = await import("../tts/ttsSelectionCommand")
      // 失败时 undoSelectionTts 已 console.error + notify 并抛出
      await undoSelectionTts(undoArgs)
    },
    {
      label: "SRS: 选区生成语音",
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

  // ============ 快捷制卡（选中即生成，块下方预览） ============
  const QUICK_CARD_COMMANDS: Array<{
    suffix: string
    cardType: "basic" | "cloze" | "choice"
    label: string
  }> = [
    { suffix: "quickBasicCard", cardType: "basic", label: "SRS: 快捷问答卡" },
    { suffix: "quickClozeCard", cardType: "cloze", label: "SRS: 快捷填空卡" },
    { suffix: "quickChoiceCard", cardType: "choice", label: "SRS: 快捷选择题" }
  ]

  for (const entry of QUICK_CARD_COMMANDS) {
    orca.commands.registerEditorCommand(
      `${pluginName}.${entry.suffix}`,
      async (editor: any) => {
        const cursor = editor?.[2]
        if (!cursor) {
          orca.notify("error", "无法获取光标位置", { title: "AI 快捷制卡" })
          return null
        }
        /*
         * 刻意 fire-and-forget：editor command 本身就是一个可撤销事务单元，
         * 在它的 await 里做块写入会与 writeAICardDrafts 内部的 invokeGroup
         * 撞在一起（第二个顶层组等不到提交），表现为 AI 已返回但任务
         * 永远停在 generating。
         *
         * 仓库既有的后台任务也都不在 editor command 里写块：
         * 文本类快捷交互从 React 工具栏发起，制卡写入发生在弹窗组件里。
         */
        const { startQuickCardJob } = await import("../ai/aiQuickCardFlow")
        void startQuickCardJob({
          pluginName: _pluginName,
          cursor,
          cardType: entry.cardType
        }).catch((error) => {
          console.error("[AI 快捷制卡] 任务失败:", error)
        })
        return null
      },
      () => {},
      { label: entry.label }
    )
  }

  // 激活全部待激活卡片（AI 批量制卡时选了「保存为待激活」的那些）
  orca.commands.registerCommand(
    `${pluginName}.activatePendingCards`,
    async () => {
      const { collectReviewCards } = await import("../cardCollector")
      const { activatePendingCards } = await import("../cardStatusUtils")

      const cards = await collectReviewCards(_pluginName)
      // 同一个块可能产出多张卡（cloze/direction），按块去重后再写
      const pendingBlockIds = Array.from(
        new Set(cards.filter((c) => c.isPending).map((c) => c.id))
      )

      if (pendingBlockIds.length === 0) {
        orca.notify("info", "没有待激活的卡片", { title: "激活待激活卡片" })
        return
      }

      const { activated, failed } = await activatePendingCards(pendingBlockIds)

      if (failed.length > 0) {
        orca.notify(
          "warn",
          `已激活 ${activated.length} 张，${failed.length} 张失败：${failed
            .map((f) => `#${f.blockId} ${f.error}`)
            .slice(0, 3)
            .join("；")}`,
          { title: "激活待激活卡片" }
        )
        return
      }

      orca.notify("success", `已激活 ${activated.length} 张卡片`, {
        title: "激活待激活卡片"
      })
    },
    "SRS: 激活待激活卡片"
  )

  // 管理工具栏 AI 提示词（无需选区）
  orca.commands.registerCommand(
    `${pluginName}.manageAIToolbarPrompts`,
    async () => {
      const { openAIPromptManager } = await import("../ai/aiPromptManagerState")
      await openAIPromptManager(_pluginName)
    },
    "SRS: 打开 AI 提示词库"
  )

  // AI / Firecrawl 服务设置（独立面板，非原生设置页）
  orca.commands.registerCommand(
    `${pluginName}.openAIServiceSettings`,
    async () => {
      const { openAIServiceSettings } = await import(
        "../ai/aiServiceSettingsState"
      )
      await openAIServiceSettings(_pluginName)
    },
    "SRS: AI / Firecrawl 服务设置"
  )

  // 打开复习会话（次级入口 / 兼容旧命令 ID）
  orca.commands.registerCommand(
    `${pluginName}.openOldReviewPanel`,
    async () => {
      console.log(`[${_pluginName}] 打开复习会话`)
      const { startReviewSession } = await import("../../main")
      await startReviewSession()
    },
    "SRS: 开始复习"
  )

  // 打开今日学习主页（命令 ID 保留 openFlashcardHome 兼容）
  orca.commands.registerCommand(
    `${pluginName}.openFlashcardHome`,
    async () => {
      console.log(`[${_pluginName}] 打开今日学习`)
      const { openFlashcardHome } = await import("../../main")
      await openFlashcardHome()
    },
    "SRS: 今日学习"
  )

  // 打开阅读工作区（次级入口）
  orca.commands.registerCommand(
    `${pluginName}.startIncrementalReadingSession`,
    async () => {
      console.log(`[${_pluginName}] 打开阅读工作区`)
      const { startIncrementalReadingSession } = await import("../../main")
      await startIncrementalReadingSession()
    },
    "SRS: 打开阅读材料"
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
      // 完整恢复断点（含 viewportAnchor）；resume 一并写回，避免两步合并把 anchor 清掉
      await updateReadingBreakpoint(undoArgs.cardId, {
        resumeBlockId: undoArgs.prevResumeBlockId ?? null,
        previewBlockId: undoArgs.prevReadingBreakpoint?.previewBlockId ?? null,
        selection: undoArgs.prevReadingBreakpoint?.selection ?? null,
        viewportAnchor: undoArgs.prevReadingBreakpoint?.viewportAnchor ?? null
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
  orca.commands.unregisterEditorCommand(`${pluginName}.createChoiceCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createCloze`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createTopicCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.gotitQuiz`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createExtract`)
  orca.commands.unregisterEditorCommand(`${pluginName}.irBlockExplainFromSelection`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createListCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.openImageOcclusionEditor`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createDirectionForward`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createDirectionBackward`)
  orca.commands.unregisterEditorCommand(`${pluginName}.makeAICard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.interactiveAICard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.aiQuickInteract`)
  orca.commands.unregisterEditorCommand(`${pluginName}.ttsFromSelection`)
  orca.commands.unregisterEditorCommand(`${pluginName}.quickBasicCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.quickClozeCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.quickChoiceCard`)
  orca.commands.unregisterEditorCommand(`${pluginName}.irRecordProgress`)
  orca.commands.unregisterCommand(`${pluginName}.irSessionNext`)
  orca.commands.unregisterCommand(`${pluginName}.irSessionPostpone`)
  orca.commands.unregisterCommand(`${pluginName}.irSessionPriority`)
  orca.commands.unregisterCommand(`${pluginName}.irToggleViewMode`)
  orca.commands.unregisterCommand(`${pluginName}.testAIConnection`)
  orca.commands.unregisterCommand(`${pluginName}.activatePendingCards`)
  orca.commands.unregisterCommand(`${pluginName}.manageAIToolbarPrompts`)
  orca.commands.unregisterCommand(`${pluginName}.openAIServiceSettings`)
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
