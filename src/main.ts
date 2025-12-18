/**
 * 虎鲸笔记 SRS 闪卡插件 - 主入口
 * 
 * 该模块负责插件生命周期管理：
 * - 注册命令、工具栏按钮、斜杠命令
 * - 注册块渲染器和转换器
 * - 管理复习会话
 */

import { setupL10N } from "./libs/l10n"
import zhCN from "./translations/zhCN"
import { collectReviewCards, buildReviewQueue } from "./srs/cardCollector"
import { extractDeckName, calculateDeckStats } from "./srs/deckUtils"
import { registerCommands, unregisterCommands } from "./srs/registry/commands"
import { registerUIComponents, unregisterUIComponents } from "./srs/registry/uiComponents"
import { registerRenderers, unregisterRenderers } from "./srs/registry/renderers"
import { registerConverters, unregisterConverters } from "./srs/registry/converters"
import { aiSettingsSchema } from "./srs/ai/aiSettingsSchema"
import { reviewSettingsSchema } from "./srs/settings/reviewSettingsSchema"
import { getOrCreateReviewSessionBlock, cleanupReviewSessionBlock } from "./srs/reviewSessionManager"
import { startAutoMarkExtract, stopAutoMarkExtract } from "./srs/incrementalReadingAutoMark"

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
  registerCommands(pluginName, openFlashcardHome)
  registerUIComponents(pluginName)
  registerRenderers(pluginName)
  registerConverters(pluginName)

  // 启动渐进阅读自动标记
  startAutoMarkExtract(pluginName)

  console.log(`[${pluginName}] 命令、UI 组件、渲染器、转换器已注册`)
}

/**
 * 插件卸载函数
 * 在插件禁用或 Orca 关闭时被调用
 */
export async function unload() {
  // 停止渐进阅读自动标记
  stopAutoMarkExtract(pluginName)

  unregisterCommands(pluginName)
  unregisterUIComponents(pluginName)
  unregisterRenderers(pluginName)
  unregisterConverters(pluginName)
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
 * @param openInCurrentPanel - 是否在当前面板打开（用于从 FlashcardHome 调用）
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
      // 从 FlashcardHome 调用：在当前面板打开
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

// ========================================
// Flashcard Home
// ========================================

/**
 * 打开 Flashcard Home
 */
async function openFlashcardHome() {
  try {
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "Flashcard Home" })
      return
    }

    // 使用自定义面板打开 Flashcard Home
    orca.nav.goTo("srs.flashcard-home", {}, activePanelId)
    
    orca.notify("success", "Flashcard Home 已打开", { title: "Flashcard Home" })
    console.log(`[${pluginName}] Flashcard Home opened in panel ${activePanelId}`)
  } catch (error) {
    console.error(`[${pluginName}] 打开 Flashcard Home 失败:`, error)
    orca.notify("error", `无法打开 Flashcard Home: ${error}`, { title: "Flashcard Home" })
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

// 导出供浏览器组件和其他模块使用
export {
  calculateDeckStats,
  collectReviewCards,
  extractDeckName,
  startReviewSession,
  buildReviewQueue
}
