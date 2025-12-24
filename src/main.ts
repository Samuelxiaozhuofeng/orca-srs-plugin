/**
 * 虎鲸笔记 SRS 闪卡插件 - 主入口
 * 
 * 该模块负责插件生命周期管理：
 * - 注册命令、工具栏按钮、斜杠命令
 * - 注册块渲染器和转换器
 * - 管理复习会话
 */

import "./styles/srs-review.css"
import { setupL10N } from "./libs/l10n"
import zhCN from "./translations/zhCN"
import { collectReviewCards, buildReviewQueue, buildReviewQueueWithChildren } from "./srs/cardCollector"
import { extractDeckName, calculateDeckStats } from "./srs/deckUtils"
import { registerCommands, unregisterCommands } from "./srs/registry/commands"
import { registerUIComponents, unregisterUIComponents } from "./srs/registry/uiComponents"
import { registerRenderers, unregisterRenderers } from "./srs/registry/renderers"
import { registerConverters, unregisterConverters } from "./srs/registry/converters"
import { registerContextMenu, unregisterContextMenu } from "./srs/registry/contextMenuRegistry"
import { collectCardsFromQueryBlock, collectCardsFromChildren, isQueryBlock } from "./srs/blockCardCollector"
import { createRepeatReviewSession } from "./srs/repeatReviewManager"
import type { DbId } from "./orca.d.ts"
import { BlockWithRepr } from "./srs/blockUtils"
import { aiSettingsSchema } from "./srs/ai/aiSettingsSchema"
import { reviewSettingsSchema } from "./srs/settings/reviewSettingsSchema"
import { getOrCreateReviewSessionBlock, cleanupReviewSessionBlock } from "./srs/reviewSessionManager"
import { getOrCreateFlashcardHomeBlock } from "./srs/flashcardHomeManager"

// 插件全局状态
let pluginName: string
let reviewDeckFilter: string | null = null
let reviewHostPanelId: string | null = null

/**
 * 插件加载函数
 * 在插件启用时被 Orca 调用
 */
export async function load(_name: string) {
  pluginName = _name

  // 设置国际化
  setupL10N(orca.state.locale, { "zh-CN": zhCN })

  // 注册插件设置（合并 AI 设置和复习设置）
  try {
    await orca.plugins.setSettingsSchema(pluginName, {
      ...aiSettingsSchema,
      ...reviewSettingsSchema
    })
    console.log(`[${pluginName}] 插件设置已注册（AI + 复习）`)
  } catch (error) {
    console.warn(`[${pluginName}] 注册插件设置失败:`, error)
  }

  console.log(`[${pluginName}] 插件已加载`)
  registerCommands(pluginName)
  registerUIComponents(pluginName)
  registerRenderers(pluginName)
  registerConverters(pluginName)
  registerContextMenu(pluginName)

  console.log(`[${pluginName}] 命令、UI 组件、渲染器、转换器、右键菜单已注册`)
}

/**
 * 插件卸载函数
 * 在插件禁用或 Orca 关闭时被调用
 */
export async function unload() {
  unregisterCommands(pluginName)
  unregisterUIComponents(pluginName)
  unregisterRenderers(pluginName)
  unregisterConverters(pluginName)
  unregisterContextMenu(pluginName)
  console.log(`[${pluginName}] 插件已卸载`)
}

// ========================================
// 复习会话管理（使用块渲染器模式）
// ========================================

/**
 * 启动复习会话
 * 使用块渲染器模式，创建虚拟块
 * 
 * @param deckName - 可选的牌组名称过滤
 * @param openInCurrentPanel - 是否在当前面板打开
 */
async function startReviewSession(deckName?: string, openInCurrentPanel: boolean = false) {
  try {
    reviewDeckFilter = deckName ?? null
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" })
      return
    }

    // 记录主面板 ID（用于跳转到卡片）
    reviewHostPanelId = activePanelId

    // 获取或创建复习会话块
    const blockId = await getOrCreateReviewSessionBlock(pluginName)

    // 根据调用方式决定打开位置
    if (openInCurrentPanel) {
      // 在当前面板打开
      orca.nav.goTo("block", { blockId }, activePanelId)
      const message = deckName
        ? `已打开 ${deckName} 复习会话`
        : "复习会话已打开"
      orca.notify("success", message, { title: "SRS 复习" })
      console.log(`[${pluginName}] 复习会话已在当前面板启动，面板ID: ${activePanelId}`)
      return
    }

    // 默认行为：在右侧面板打开
    const panels = orca.state.panels
    let rightPanelId: string | null = null

    // 查找已存在的右侧面板
    for (const [panelId, panel] of Object.entries(panels)) {
      if (panel.parentId === activePanelId && panel.position === "right") {
        rightPanelId = panelId
        break
      }
    }

    if (!rightPanelId) {
      // 创建右侧面板
      rightPanelId = orca.nav.addTo(activePanelId, "right", {
        view: "block",
        viewArgs: { blockId },
        viewState: {}
      })

      if (!rightPanelId) {
        orca.notify("error", "无法创建侧边面板", { title: "SRS 复习" })
        return
      }
    } else {
      // 导航到现有右侧面板
      orca.nav.goTo("block", { blockId }, rightPanelId)
    }

    // 聚焦到右侧面板
    if (rightPanelId) {
      setTimeout(() => {
        orca.nav.switchFocusTo(rightPanelId!)
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
 * 获取当前复习会话的 deck 过滤器
 */
export function getReviewDeckFilter(): string | null {
  return reviewDeckFilter
}

/**
 * 获取当前复习会话的主面板 ID
 * 用于跳转到卡片时的目标面板
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

// ========================================
// Flash Home 管理
// ========================================

/**
 * 打开 Flash Home（闪卡主页）
 * 使用块渲染器模式，在右侧面板打开
 * 支持复用已存在的右侧面板
 * 
 * @param openInCurrentPanel - 是否在当前面板打开（默认 false，在右侧打开）
 */
async function openFlashcardHome(openInCurrentPanel: boolean = false) {
  try {
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "Flash Home" })
      return
    }

    // 获取或创建 Flash Home 块
    const blockId = await getOrCreateFlashcardHomeBlock(pluginName)

    // 先检查是否已有面板打开了这个 Flash Home 块
    const panels = orca.state.panels
    for (const [panelId, panel] of Object.entries(panels)) {
      // 检查面板是否正在显示这个块
      if (panel.viewArgs?.blockId === blockId) {
        // 已经打开了，直接聚焦
        orca.nav.switchFocusTo(panelId)
        console.log(`[${pluginName}] Flash Home 已存在，聚焦到面板: ${panelId}`)
        return
      }
    }

    // 根据调用方式决定打开位置
    if (openInCurrentPanel) {
      // 在当前面板打开
      orca.nav.goTo("block", { blockId }, activePanelId)
      orca.notify("success", "Flash Home 已打开", { title: "SRS" })
      console.log(`[${pluginName}] Flash Home 已在当前面板打开，面板ID: ${activePanelId}`)
      return
    }

    // 默认行为：在右侧面板打开
    let rightPanelId: string | null = null

    // 查找已存在的右侧面板
    for (const [panelId, panel] of Object.entries(panels)) {
      if (panel.parentId === activePanelId && panel.position === "right") {
        rightPanelId = panelId
        break
      }
    }

    if (!rightPanelId) {
      // 创建右侧面板
      rightPanelId = orca.nav.addTo(activePanelId, "right", {
        view: "block",
        viewArgs: { blockId },
        viewState: {}
      })

      if (!rightPanelId) {
        orca.notify("error", "无法创建侧边面板", { title: "Flash Home" })
        return
      }
    } else {
      // 导航到现有右侧面板
      orca.nav.goTo("block", { blockId }, rightPanelId)
    }

    // 聚焦到右侧面板
    if (rightPanelId) {
      setTimeout(() => {
        orca.nav.switchFocusTo(rightPanelId!)
      }, 100)
    }

    orca.notify("success", "Flash Home 已在右侧面板打开", { title: "SRS" })
    console.log(`[${pluginName}] Flash Home 已打开，面板ID: ${rightPanelId}`)
  } catch (error) {
    console.error(`[${pluginName}] 打开 Flash Home 失败:`, error)
    orca.notify("error", `打开 Flash Home 失败: ${error}`, { title: "SRS" })
  }
}

// ========================================
// 重复复习会话管理
// ========================================

/**
 * 启动重复复习会话
 * 支持从查询块或子块启动
 * 
 * @param blockId - 要复习的块 ID
 * @param openInCurrentPanel - 是否在当前面板打开（默认 false，在右侧打开）
 */
async function startRepeatReviewSession(blockId: DbId, openInCurrentPanel: boolean = false) {
  try {
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" })
      return
    }

    // 获取块数据 - 先从 state 获取，再从后端获取
    let block = orca.state.blocks?.[blockId] as BlockWithRepr | undefined
    
    if (!block) {
      // 尝试从后端获取
      block = await orca.invokeBackend("get-block", blockId) as BlockWithRepr | undefined
    }

    if (!block) {
      orca.notify("error", "块不存在", { title: "SRS 复习" })
      return
    }

    // 根据块类型收集卡片
    let cards
    let sourceType: 'query' | 'children'

    if (isQueryBlock(block)) {
      // 先检查查询结果是否为空
      const { getQueryResults } = await import("./srs/blockCardCollector")
      const queryResults = await getQueryResults(blockId)
      
      if (queryResults.length === 0) {
        orca.notify("info", "查询结果为空", { title: "SRS 复习" })
        return
      }

      cards = await collectCardsFromQueryBlock(blockId, pluginName)
      sourceType = 'query'

      if (cards.length === 0) {
        orca.notify("info", "查询结果中没有找到卡片", { title: "SRS 复习" })
        return
      }
    } else {
      // 先检查是否有子块
      const { getAllDescendantIds } = await import("./srs/blockCardCollector")
      const descendantIds = await getAllDescendantIds(blockId)
      
      if (descendantIds.length === 0) {
        orca.notify("info", "该块没有子块", { title: "SRS 复习" })
        return
      }

      cards = await collectCardsFromChildren(blockId, pluginName)
      sourceType = 'children'

      if (cards.length === 0) {
        orca.notify("info", "子块中没有找到卡片", { title: "SRS 复习" })
        return
      }
    }

    // 创建重复复习会话
    createRepeatReviewSession(cards, blockId, sourceType)

    // 获取或创建复习会话块
    const reviewBlockId = await getOrCreateReviewSessionBlock(pluginName)

    // 根据调用方式决定打开位置
    if (openInCurrentPanel) {
      // 在当前面板打开
      orca.nav.goTo("block", { blockId: reviewBlockId }, activePanelId)
      orca.notify("success", `已开始复习 ${cards.length} 张卡片`, { title: "SRS 复习" })
      console.log(`[${pluginName}] 重复复习会话已在当前面板启动，面板ID: ${activePanelId}`)
      return
    }

    // 默认行为：在右侧面板打开
    const panels = orca.state.panels
    let rightPanelId: string | null = null

    // 查找已存在的右侧面板
    for (const [panelId, panel] of Object.entries(panels)) {
      if (panel.parentId === activePanelId && panel.position === "right") {
        rightPanelId = panelId
        break
      }
    }

    if (!rightPanelId) {
      // 创建右侧面板
      rightPanelId = orca.nav.addTo(activePanelId, "right", {
        view: "block",
        viewArgs: { blockId: reviewBlockId },
        viewState: {}
      })

      if (!rightPanelId) {
        orca.notify("error", "无法创建侧边面板", { title: "SRS 复习" })
        return
      }
    } else {
      // 导航到现有右侧面板
      orca.nav.goTo("block", { blockId: reviewBlockId }, rightPanelId)
    }

    // 聚焦到右侧面板
    if (rightPanelId) {
      setTimeout(() => {
        orca.nav.switchFocusTo(rightPanelId!)
      }, 100)
    }

    orca.notify("success", `已开始复习 ${cards.length} 张卡片`, { title: "SRS 复习" })
    console.log(`[${pluginName}] 重复复习会话已启动，面板ID: ${rightPanelId}`)
  } catch (error) {
    console.error(`[${pluginName}] 启动重复复习失败:`, error)
    
    // 提供更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isLoadError = errorMessage.includes('load') || 
                        errorMessage.includes('fetch') || 
                        errorMessage.includes('network') ||
                        errorMessage.includes('timeout')
    
    if (isLoadError) {
      orca.notify("error", "卡片加载失败，请稍后重试", { title: "SRS 复习" })
    } else {
      orca.notify("error", `启动复习失败: ${errorMessage}`, { title: "SRS 复习" })
    }
  }
}

// 导出供浏览器组件和其他模块使用
export {
  calculateDeckStats,
  collectReviewCards,
  extractDeckName,
  startReviewSession,
  buildReviewQueue,
  buildReviewQueueWithChildren,
  openFlashcardHome,
  startRepeatReviewSession
}

// 导出子卡片收集器
export { collectChildCards, hasChildCards, getCardKey } from "./srs/childCardCollector"
