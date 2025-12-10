/**
 * 虎鲸笔记 SRS 闪卡插件 - 主入口
 * 
 * 该模块负责插件生命周期管理：
 * - 注册命令、工具栏按钮、斜杠命令
 * - 注册块渲染器和转换器
 * - 管理复习会话
 */

import { setupL10N, t } from "./libs/l10n"
import zhCN from "./translations/zhCN"
import SrsReviewSessionRenderer from "./components/SrsReviewSessionRenderer"
import SrsCardBlockRenderer from "./components/SrsCardBlockRenderer"
import ClozeInlineRenderer from "./components/ClozeInlineRenderer"
import type { BlockForConversion, Repr, CursorData, Block } from "./orca.d.ts"
import { getOrCreateReviewSessionBlock, cleanupReviewSessionBlock } from "./srs/reviewSessionManager"

// 导入拆分后的模块
import { findRightPanel, schedulePanelResize } from "./srs/panelUtils"
import { BlockWithRepr } from "./srs/blockUtils"
import { collectReviewCards, buildReviewQueue } from "./srs/cardCollector"
import { extractDeckName, calculateDeckStats } from "./srs/deckUtils"
import { scanCardsFromTags, makeCardFromBlock } from "./srs/cardCreator"
import { openCardBrowser, closeCardBrowser } from "./srs/cardBrowser"
import { createCloze } from "./srs/clozeUtils"

// 插件全局状态
let pluginName: string
let reviewHostPanelId: string | null = null

/**
 * 插件加载函数
 * 在插件启用时被 Orca 调用
 */
export async function load(_name: string) {
  pluginName = _name

  // 设置国际化
  setupL10N(orca.state.locale, { "zh-CN": zhCN })

  console.log(`[${pluginName}] 插件已加载`)

  // ========================================
  // 1. 注册命令
  // ========================================

  // 命令：开始 SRS 复习会话
  orca.commands.registerCommand(
    `${pluginName}.startReviewSession`,
    async () => {
      console.log(`[${pluginName}] 开始 SRS 复习会话`)
      await startReviewSession()
    },
    "SRS: 开始复习"
  )

  // 命令：扫描带标签的块并转换为卡片
  orca.commands.registerCommand(
    `${pluginName}.scanCardsFromTags`,
    () => {
      console.log(`[${pluginName}] 执行标签扫描`)
      scanCardsFromTags(pluginName)
    },
    "SRS: 扫描带标签的卡片"
  )

  // 命令：打开卡片浏览器
  orca.commands.registerCommand(
    `${pluginName}.openCardBrowser`,
    () => {
      console.log(`[${pluginName}] 打开卡片浏览器`)
      openCardBrowser(pluginName)
    },
    "SRS: 打开卡片浏览器"
  )

  // ========================================
  // 2. 注册编辑器命令：将当前块转换为 SRS 卡片
  // ========================================
  orca.commands.registerEditorCommand(
    `${pluginName}.makeCardFromBlock`,
    // do 函数：执行转换
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor, isRedo] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await makeCardFromBlock(cursor, pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    // undo 函数：撤销转换（恢复原始 _repr 和文本）
    async (undoArgs: any) => {
      if (!undoArgs || !undoArgs.blockId) return

      const block = orca.state.blocks[undoArgs.blockId] as BlockWithRepr
      if (!block) return

      // 恢复原始 _repr
      block._repr = undoArgs.originalRepr || { type: "text" }

      // 恢复原始文本（如果有的话）
      if (undoArgs.originalText !== undefined) {
        block.text = undoArgs.originalText
      }

      console.log(`[${pluginName}] 已撤销：块 #${undoArgs.blockId} 已恢复`)
    },
    {
      label: "SRS: 将块转换为记忆卡片",
      hasArgs: false
    }
  )

  // 命令：将选中文本转换为 Cloze 填空
  orca.commands.registerEditorCommand(
    `${pluginName}.createCloze`,
    // do 函数：执行 cloze 转换
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor, isRedo] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await createCloze(cursor, pluginName)
      return result ? { ret: result, undoArgs: result } : null
    },
    // undo 函数：撤销 cloze 转换
    async (undoArgs: any) => {
      if (!undoArgs || !undoArgs.blockId) return

      const block = orca.state.blocks[undoArgs.blockId] as Block
      if (!block) return

      // 恢复原始内容
      if (undoArgs.originalContent) {
        // 如果有原始 content 数组，使用编辑器命令恢复
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
      } else if (undoArgs.originalText !== undefined) {
        // 如果只有原始 text，更新为文本片段
        await orca.commands.invokeEditorCommand(
          "core.editor.setBlocksContent",
          null,
          [
            {
              id: undoArgs.blockId,
              content: [{ t: "t", v: undoArgs.originalText }]
            }
          ],
          false
        )
      }
    },
    {
      label: "SRS: 创建 Cloze 填空",
      hasArgs: false
    }
  )


  // ========================================
  // 3. 注册工具栏按钮
  // ========================================
  orca.toolbar.registerToolbarButton(`${pluginName}.reviewButton`, {
    icon: "ti ti-cards",
    tooltip: "开始 SRS 复习",
    command: `${pluginName}.startReviewSession`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.browserButton`, {
    icon: "ti ti-list",
    tooltip: "打开卡片浏览器",
    command: `${pluginName}.openCardBrowser`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.clozeButton`, {
    icon: "ti ti-braces",
    tooltip: "创建 Cloze 填空",
    command: `${pluginName}.createCloze`
  })


  // ========================================
  // 4. 注册斜杠命令
  // ========================================
  orca.slashCommands.registerSlashCommand(`${pluginName}.makeCard`, {
    icon: "ti ti-card-plus",
    group: "SRS",
    title: "转换为记忆卡片",
    command: `${pluginName}.makeCardFromBlock`
  })

  // ========================================
  // 5. 注册自定义块渲染器
  // ========================================
  orca.renderers.registerBlock(
    "srs.card",
    false,
    SrsCardBlockRenderer,
    [],
    false
  )

  // 注册 cloze 卡片渲染器（使用相同的渲染器组件）
  orca.renderers.registerBlock(
    "srs.cloze-card",
    false,
    SrsCardBlockRenderer,
    [],
    false
  )

  orca.renderers.registerBlock(
    "srs.review-session",
    false,
    SrsReviewSessionRenderer,
    [],
    false
  )

  // ========================================
  // 5.5. 注册自定义 inline 渲染器
  // ========================================
  orca.renderers.registerInline(
    `${pluginName}.cloze`,
    false,
    ClozeInlineRenderer
  )

  // ========================================
  // 6. 注册 plain 转换器
  // ========================================
  orca.converters.registerBlock(
    "plain",
    "srs.card",
    (blockContent: BlockForConversion, repr: Repr) => {
      const front = repr.front || "（无题目）"
      const back = repr.back || "（无答案）"
      return `[SRS 卡片]\n题目: ${front}\n答案: ${back}`
    }
  )

  // 注册 cloze 卡片转换器
  orca.converters.registerBlock(
    "plain",
    "srs.cloze-card",
    (blockContent: BlockForConversion, repr: Repr) => {
      const front = repr.front || "（无题目）"
      const back = repr.back || "（无答案）"
      return `[SRS 填空卡片]\n题目: ${front}\n答案: ${back}`
    }
  )

  orca.converters.registerBlock(
    "plain",
    "srs.review-session",
    () => "[SRS 复习会话面板块]"
  )

  // 注册 cloze inline 转换器
  orca.converters.registerInline(
    "plain",
    `${pluginName}.cloze`,
    (fragment: any) => {
      // 将 cloze inline 转换为 {cN:: 内容} 格式的纯文本
      const clozeNumber = fragment.clozeNumber || 1
      const content = fragment.v || ""
      return `{c${clozeNumber}:: ${content}}`
    }
  )

  console.log(`[${pluginName}] 命令、UI 组件和渲染器已注册`)
}

/**
 * 插件卸载函数
 * 在插件禁用时被 Orca 调用
 */
export async function unload() {
  console.log(`[${pluginName}] 开始卸载插件`)

  // 清理卡片浏览器组件
  closeCardBrowser(pluginName)

  await cleanupReviewSessionBlock(pluginName)

  // 移除注册的命令
  orca.commands.unregisterCommand(`${pluginName}.startReviewSession`)
  orca.commands.unregisterCommand(`${pluginName}.scanCardsFromTags`)
  orca.commands.unregisterCommand(`${pluginName}.openCardBrowser`)
  orca.commands.unregisterEditorCommand(`${pluginName}.makeCardFromBlock`)
  orca.commands.unregisterEditorCommand(`${pluginName}.createCloze`)

  // 移除工具栏按钮
  orca.toolbar.unregisterToolbarButton(`${pluginName}.reviewButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.browserButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.clozeButton`)

  // 移除斜杠命令
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.makeCard`)

  // 移除块渲染器
  orca.renderers.unregisterBlock("srs.card")
  orca.renderers.unregisterBlock("srs.review-session")

  // 移除转换器
  orca.converters.unregisterBlock("plain", "srs.card")
  orca.converters.unregisterBlock("plain", "srs.review-session")

  console.log(`[${pluginName}] 插件已卸载`)
}

// ========================================
// 复习会话管理
// ========================================

/**
 * 显示 SRS 复习会话组件（使用真实队列）
 */
async function startReviewSession(deckName?: string) {
  try {
    const reviewSessionBlockId = await getOrCreateReviewSessionBlock(pluginName)
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" })
      return
    }

    reviewHostPanelId = activePanelId

    let rightPanelId = findRightPanel(orca.state.panels, activePanelId)

    if (!rightPanelId) {
      rightPanelId = orca.nav.addTo(activePanelId, "right", {
        view: "block",
        viewArgs: { blockId: reviewSessionBlockId },
        viewState: {}
      })

      if (!rightPanelId) {
        orca.notify("error", "无法创建侧边面板", { title: "SRS 复习" })
        return
      }

      schedulePanelResize(activePanelId, pluginName)
    } else {
      orca.nav.goTo("block", { blockId: reviewSessionBlockId }, rightPanelId)
    }

    if (rightPanelId) {
      const targetPanelId = rightPanelId
      setTimeout(() => {
        orca.nav.switchFocusTo(targetPanelId)
      }, 100)
    }

    const message = deckName
      ? `已打开 ${deckName} 复习会话`
      : "复习会话已在右侧面板打开"

    orca.notify("success", message, { title: "SRS 复习" })
    console.log(`[${pluginName}] 复习会话已启动，面板ID: ${rightPanelId}`)
  } catch (error) {
    console.error(`[${pluginName}] 启动复习失败:`, error)
    orca.notify("error", `启动复习失败: ${error}`, { title: "SRS 复习" })
  }
}

/**
 * 获取复习宿主面板 ID
 */
export function getReviewHostPanelId(): string | null {
  return reviewHostPanelId
}

/**
 * 获取插件名称
 * 供其他模块使用
 */
export function getPluginName(): string {
  return pluginName
}

// 导出供浏览器组件和其他模块使用
export {
  calculateDeckStats,
  collectReviewCards,
  extractDeckName,
  startReviewSession,
  buildReviewQueue
}
