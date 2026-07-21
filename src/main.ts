/**
 * 虎鲸笔记 SRS 闪卡插件 - 主入口
 * 
 * 该模块负责插件生命周期管理：
 * - 注册命令、工具栏按钮、斜杠命令
 * - 注册块渲染器和转换器
 * - 管理复习会话
 */

import "./styles/srs-review.css"
import "./styles/ai-card-dialog.css"
import "./styles/ir-workspace.css"
import "./styles/flashcard-home.css"
import "./styles/ai-quick-interact.css"
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
import { reviewSettingsSchema } from "./srs/settings/reviewSettingsSchema"
import {
  getIncrementalReadingSettings,
  incrementalReadingSettingsSchema
} from "./srs/settings/incrementalReadingSettingsSchema"
import { createReviewSessionBlockWithDescriptor } from "./srs/reviewSessionManager"
import {
  createFixedRepeatSessionDescriptor,
  createNormalSessionDescriptor
} from "./srs/reviewSessionDescriptor"
import { getOrCreateFlashcardHomeBlock } from "./srs/flashcardHomeManager"
import { cleanupDeletedCards } from "./srs/deletedCardCleanup"
import { startAutoMarkExtract, stopAutoMarkExtract } from "./srs/incrementalReadingAutoMark"
import { startRecentDeckWatcher, stopRecentDeckWatcher } from "./srs/recentDeckManager"
import {
  cleanupIncrementalReadingManagerBlock
} from "./srs/incrementalReadingManagerUtils"
import type { IRWorkspaceMode } from "./components/incremental-reading/workspace/irWorkspaceTypes"
import { openIRWorkspace } from "./srs/incremental-reading/irWorkspacePanelLaunch"
import {
  runPluginUnloadSequence,
  UNLOAD_LOG_FLUSH_PENDING_MESSAGE
} from "./srs/pluginUnloadSequence"
import { flushReviewLogs } from "./srs/reviewLogStorage"
import {
  clearRegisteredSessionProgressKeys,
  getDefaultSessionStorage
} from "./srs/sessionProgressStorage"

// 插件全局状态
let pluginName: string
/** @deprecated F2-01：scope 已写入会话块 descriptor，不再作为加载来源 */
let reviewDeckFilter: string | null = null
let reviewHostPanelId: string | null = null
const PLUGIN_UI_STYLE_ROLE = "orca-srs-ui"

/**
 * 插件加载函数
 * 在插件启用时被 Orca 调用
 */
export async function load(_name: string) {
  pluginName = _name
  orca.themes.removeCSSResources(PLUGIN_UI_STYLE_ROLE)
  orca.themes.injectCSSResource(`${pluginName}/dist/style.css`, PLUGIN_UI_STYLE_ROLE)

  // 设置国际化
  setupL10N(orca.state.locale, { "zh-CN": zhCN })

  // 注册插件设置（复习 + 渐进阅读；AI/Firecrawl 已独立到服务设置面板）
  try {
    await orca.plugins.setSettingsSchema(pluginName, {
      ...reviewSettingsSchema,
      ...incrementalReadingSettingsSchema
    })
    console.log(`[${pluginName}] 插件设置已注册（复习 + 渐进阅读）`)
  } catch (error) {
    console.warn(`[${pluginName}] 注册插件设置失败:`, error)
  }

  console.log(`[${pluginName}] 插件已加载`)
  registerCommands(pluginName)
  registerUIComponents(pluginName)
  registerRenderers(pluginName)
  registerConverters(pluginName)
  registerContextMenu(pluginName)
  startRecentDeckWatcher(pluginName)

  // 提示词库 + AI/Firecrawl 连接：从 plugin data hydrate；失败不阻断加载
  try {
    const { hydrateToolbarAIPromptLibrary } = await import(
      "./srs/ai/aiToolbarPromptStore"
    )
    await hydrateToolbarAIPromptLibrary(pluginName)
  } catch (error) {
    console.warn(`[${pluginName}] 加载 AI 提示词库失败:`, error)
  }
  try {
    const { hydrateAISettings } = await import("./srs/ai/aiSettingsSchema")
    await hydrateAISettings(pluginName)
  } catch (error) {
    console.warn(`[${pluginName}] 加载 AI 连接设置失败:`, error)
  }
  try {
    const { hydrateWebImportSettings } = await import(
      "./srs/settings/webImportSettingsSchema"
    )
    await hydrateWebImportSettings(pluginName)
  } catch (error) {
    console.warn(`[${pluginName}] 加载 Firecrawl 设置失败:`, error)
  }

  try {
    const { registerIRDefaultShortcuts } = await import("./srs/incremental-reading/irShortcutsRegistry")
    await registerIRDefaultShortcuts(pluginName)
  } catch (error) {
    console.warn(`[${pluginName}] 注册渐进阅读默认快捷键失败:`, error)
  }

  console.log(`[${pluginName}] 命令、UI 组件、渲染器、转换器、右键菜单已注册`)

  // 根据设置决定是否启动渐进阅读自动标记
  try {
    const { enableAutoExtractMark } = getIncrementalReadingSettings(pluginName)
    if (enableAutoExtractMark) {
      startAutoMarkExtract(pluginName)
    } else {
      console.log(`[${pluginName}] 渐进阅读自动标记已关闭`)
    }
  } catch (error) {
    console.warn(`[${pluginName}] 读取渐进阅读设置失败，按默认关闭处理:`, error)
  }

  // 延迟执行已删除卡片清理（避免阻塞启动）
  setTimeout(async () => {
    try {
      const report = await cleanupDeletedCards(pluginName)
      if (report.errors.length > 0) {
        console.error(
          `[${pluginName}] 已删除卡片清理未完全成功: cleaned=${report.cleanedCount}, retainedUnknown=${report.retainedUnknownCount}, errors=${report.errors.length}`,
          report.errors
        )
      }
    } catch (error) {
      console.error(`[${pluginName}] 清理已删除卡片时出错（未完成）:`, error)
    }
  }, 3000) // 延迟 3 秒执行
}

/**
 * 插件卸载函数
 * 在插件禁用或 Orca 关闭时被调用。
 * 顺序：先 flush 复习日志（数据 API 仍可用）→ 再注销/清理；flush 失败不阻断卸载。
 */
export async function unload() {
  const name = pluginName
  const result = await runPluginUnloadSequence({
    pluginName: name,
    flush: flushReviewLogs,
    notifyFlushFailure: (message) => {
      try {
        orca.notify("error", message, { title: "SRS 日志" })
      } catch (notifyError) {
        // unload 时 notify 可能已不可用；不静默吞错
        console.warn(`[${name}] unload 时 notify 失败:`, notifyError)
      }
    },
    cleanupSteps: [
      {
        // FC-09：不支持断点恢复；卸载不依赖 progress 恢复。
        // 仅清理本进程已登记的 scoped keys，失败可见且不阻断后续 unload。
        name: "clearSessionProgressStorage",
        run: () => {
          const storage = getDefaultSessionStorage()
          if (!storage) {
            console.warn(
              `[${name}] 卸载时 sessionStorage 不可用，跳过会话进度清理`
            )
            return
          }
          const result = clearRegisteredSessionProgressKeys(storage)
          if (result.errors.length > 0) {
            console.warn(
              `[${name}] 卸载时部分会话进度 key 清理失败:`,
              result.errors
            )
          }
          if (result.cleared.length > 0) {
            console.log(
              `[${name}] 已清理会话进度 keys: ${result.cleared.length}`
            )
          }
        }
      },
      {
        name: "removeCSSResources",
        run: () => {
          orca.themes.removeCSSResources(PLUGIN_UI_STYLE_ROLE)
        }
      },
      { name: "stopRecentDeckWatcher", run: () => stopRecentDeckWatcher() },
      { name: "stopAutoMarkExtract", run: () => stopAutoMarkExtract(name) },
      { name: "unregisterCommands", run: () => unregisterCommands(name) },
      { name: "unregisterUIComponents", run: () => unregisterUIComponents(name) },
      { name: "unregisterRenderers", run: () => unregisterRenderers(name) },
      { name: "unregisterConverters", run: () => unregisterConverters(name) },
      { name: "unregisterContextMenu", run: () => unregisterContextMenu(name) },
      {
        name: "cleanupIncrementalReadingManagerBlock",
        run: () => cleanupIncrementalReadingManagerBlock(name)
      }
    ]
  })

  if (!result.flushOk) {
    console.error(
      `[${name}] 卸载完成，但统计日志未确认落盘：${UNLOAD_LOG_FLUSH_PENDING_MESSAGE}`,
      result.flushError
    )
  }
  console.log(`[${name}] 插件已卸载`)
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
    // 诊断用；Renderer 不得读取此变量作为 scope 来源
    reviewDeckFilter = deckName ?? null
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" })
      return
    }

    // 记录主面板 ID（用于跳转到卡片）
    reviewHostPanelId = activePanelId

    // F2-01：每次启动新建会话块 + 版本化 descriptor，禁止复用单例块覆盖 scope
    const descriptor = createNormalSessionDescriptor(deckName)
    const blockId = await createReviewSessionBlockWithDescriptor(
      pluginName,
      descriptor
    )

    // 根据调用方式决定打开位置
    if (openInCurrentPanel) {
      // 在当前面板打开
      orca.nav.goTo("block", { blockId }, activePanelId)
      const message = deckName
        ? `已打开 ${deckName} 复习会话`
        : "复习会话已打开"
      orca.notify("success", message, { title: "SRS 复习" })
      console.log(
        `[${pluginName}] 复习会话已在当前面板启动，sessionId=${descriptor.sessionId}, 面板ID: ${activePanelId}`
      )
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
      // 导航到现有右侧面板（新 blockId，新 descriptor）
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
    console.log(
      `[${pluginName}] 复习会话已启动，sessionId=${descriptor.sessionId}, 面板ID: ${rightPanelId}`
    )
  } catch (error) {
    console.error(`[${pluginName}] 启动复习失败:`, error)
    orca.notify("error", `启动复习失败: ${error}`, { title: "SRS 复习" })
  }
}

/**
 * @deprecated F2-01：Renderer 必须从会话块 descriptor 读取 scope。
 * 保留导出仅兼容旧调用；值可能被后续启动覆盖，不可靠。
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
// 渐进阅读会话管理
// ========================================

/**
 * 启动渐进阅读会话
 * 使用原生 block 面板打开 srs.ir-session 虚拟块
 *
 * @param openInCurrentPanel - 是否在当前面板打开
 */
async function startIncrementalReadingSession(
  openInCurrentPanel: boolean = false,
  workspaceMode: IRWorkspaceMode = "reading"
) {
  try {
    await openIRWorkspace({
      pluginName,
      mode: workspaceMode,
      openInCurrentPanel
    })
  } catch (error) {
    console.error(`[${pluginName}] 启动渐进阅读失败:`, error)
    orca.notify("error", `启动渐进阅读失败: ${error}`, { title: "渐进阅读" })
  }
}

// ========================================
// 渐进阅读管理面板
// ========================================

/**
 * 打开渐进阅读工作区（管理入口）
 * 与 startIncrementalReadingSession 共用同一 canonical 工作区 Panel
 */
async function openIRManager() {
  await startIncrementalReadingSession(true, "library")
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

    // F2-01：descriptor 与内存载荷共用 sessionId，再写入新会话块
    const descriptor = createFixedRepeatSessionDescriptor({
      cards,
      sourceBlockId: blockId,
      sourceType
    })
    createRepeatReviewSession(
      cards,
      blockId,
      sourceType,
      descriptor.sessionId
    )
    const reviewBlockId = await createReviewSessionBlockWithDescriptor(
      pluginName,
      descriptor
    )

    // 根据调用方式决定打开位置
    if (openInCurrentPanel) {
      // 在当前面板打开
      orca.nav.goTo("block", { blockId: reviewBlockId }, activePanelId)
      orca.notify("success", `已开始复习 ${cards.length} 张卡片`, { title: "SRS 复习" })
      console.log(
        `[${pluginName}] 重复复习会话已在当前面板启动，sessionId=${descriptor.sessionId}, 面板ID: ${activePanelId}`
      )
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
    console.log(
      `[${pluginName}] 重复复习会话已启动，sessionId=${descriptor.sessionId}, 面板ID: ${rightPanelId}`
    )
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
  openIRManager,
  openFlashcardHome,
  startRepeatReviewSession,
  startIncrementalReadingSession
}

// 导出子卡片收集器
export { collectChildCards, hasChildCards, getCardKey } from "./srs/childCardCollector"
