/**
 * 右键菜单注册模块
 * 
 * 负责注册和注销块右键菜单项
 * 支持查询块和普通块的复习功能
 */

import React from "react"
import type { DbId } from "../../orca.d.ts"
import { BlockWithRepr } from "../blockUtils"
import {
  isQueryBlock,
  collectCardsFromQueryBlock,
  collectCardsFromChildren,
  estimateCardCount
} from "../blockCardCollector"
import { createRepeatReviewSession } from "../repeatReviewManager"

/** 已注册的菜单项 ID 列表 */
const registeredMenuIds: string[] = []

/** 重试状态存储 */
const retryState: Map<DbId, { type: 'query' | 'children', retryCount: number }> = new Map()

/**
 * 处理复习启动错误
 * 提供重试选项
 * 
 * @param error - 错误对象
 * @param pluginName - 插件名称
 * @param blockId - 块 ID
 * @param sourceType - 来源类型
 */
function handleReviewError(
  error: unknown,
  pluginName: string,
  blockId: DbId,
  sourceType: 'query' | 'children'
): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  
  // 检查是否为网络或加载错误
  const isLoadError = errorMessage.includes('load') || 
                      errorMessage.includes('fetch') || 
                      errorMessage.includes('network') ||
                      errorMessage.includes('timeout')
  
  if (isLoadError) {
    // 获取当前重试次数
    const state = retryState.get(blockId)
    const retryCount = state?.retryCount ?? 0
    
    if (retryCount < 2) {
      // 更新重试状态
      retryState.set(blockId, { type: sourceType, retryCount: retryCount + 1 })
      
      // 显示带重试选项的错误提示
      orca.notify("error", `卡片加载失败，请稍后重试`, { 
        title: "SRS 复习"
      })
    } else {
      // 超过重试次数，清除状态
      retryState.delete(blockId)
      orca.notify("error", `卡片加载失败: ${errorMessage}`, { title: "SRS 复习" })
    }
  } else {
    // 其他错误直接显示
    orca.notify("error", `启动复习失败: ${errorMessage}`, { title: "SRS 复习" })
  }
}

/**
 * 注册右键菜单
 * 
 * @param pluginName - 插件名称
 */
export function registerContextMenu(pluginName: string): void {
  // 注册查询块右键菜单项
  const queryMenuId = `${pluginName}.reviewQueryResults`
  orca.blockMenuCommands.registerBlockMenuCommand(queryMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, _rootBlockId: DbId, close: () => void) => {
      // 获取块数据
      const block = orca.state.blocks?.[blockId] as BlockWithRepr | undefined

      // 只对查询块显示
      if (!block || !isQueryBlock(block)) {
        return null
      }

      return (
        <QueryBlockMenuItem
          blockId={blockId}
          pluginName={pluginName}
          close={close}
        />
      )
    }
  })
  registeredMenuIds.push(queryMenuId)

  // 注册子块复习菜单项（包含当前块和子块，只有当有卡片时才显示）
  const childrenMenuId = `${pluginName}.reviewChildrenCards`
  orca.blockMenuCommands.registerBlockMenuCommand(childrenMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, _rootBlockId: DbId, close: () => void) => {
      // 获取块数据
      const block = orca.state.blocks?.[blockId] as BlockWithRepr | undefined

      // 对非查询块显示（普通块）
      if (!block || isQueryBlock(block)) {
        return null
      }

      return (
        <ChildrenBlockMenuItem
          blockId={blockId}
          pluginName={pluginName}
          close={close}
        />
      )
    }
  })
  registeredMenuIds.push(childrenMenuId)

  console.log(`[${pluginName}] 右键菜单已注册`)
}

/**
 * 注销右键菜单
 * 
 * @param pluginName - 插件名称
 */
export function unregisterContextMenu(pluginName: string): void {
  for (const menuId of registeredMenuIds) {
    orca.blockMenuCommands.unregisterBlockMenuCommand(menuId)
  }
  registeredMenuIds.length = 0
  console.log(`[${pluginName}] 右键菜单已注销`)
}


/**
 * 查询块菜单项组件
 * 显示"复习此查询结果"选项，并显示预估卡片数量
 */
function QueryBlockMenuItem({
  blockId,
  pluginName,
  close
}: {
  blockId: DbId
  pluginName: string
  close: () => void
}) {
  const [cardCount, setCardCount] = React.useState<number | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [hasError, setHasError] = React.useState(false)
  const [queryResultsEmpty, setQueryResultsEmpty] = React.useState(false)

  // 异步获取卡片数量
  React.useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      try {
        // 先检查查询结果是否为空
        const { getQueryResults } = await import("../blockCardCollector")
        const queryResults = await getQueryResults(blockId)
        
        if (!cancelled) {
          if (queryResults.length === 0) {
            setQueryResultsEmpty(true)
            setCardCount(0)
            setIsLoading(false)
            return
          }
        }

        const count = await estimateCardCount(blockId, true)
        if (!cancelled) {
          setCardCount(count)
          setIsLoading(false)
        }
      } catch (error) {
        console.error(`[${pluginName}] 获取查询块卡片数量失败:`, error)
        if (!cancelled) {
          setHasError(true)
          setCardCount(0)
          setIsLoading(false)
        }
      }
    }

    fetchCount()

    return () => {
      cancelled = true
    }
  }, [blockId, pluginName])

  const handleClick = async () => {
    close()

    try {
      // 检查块是否存在
      const block = orca.state.blocks?.[blockId] as BlockWithRepr | undefined
      if (!block) {
        const fetchedBlock = await orca.invokeBackend("get-block", blockId)
        if (!fetchedBlock) {
          orca.notify("error", "块不存在", { title: "SRS 复习" })
          return
        }
      }

      // 检查查询结果是否为空
      const { getQueryResults } = await import("../blockCardCollector")
      const queryResults = await getQueryResults(blockId)
      if (queryResults.length === 0) {
        orca.notify("info", "查询结果为空", { title: "SRS 复习" })
        return
      }

      // 收集卡片
      const cards = await collectCardsFromQueryBlock(blockId, pluginName)

      if (cards.length === 0) {
        orca.notify("info", "查询结果中没有找到卡片", { title: "SRS 复习" })
        return
      }

      // 创建重复复习会话
      createRepeatReviewSession(cards, blockId, 'query')

      // 启动复习会话
      await startRepeatReviewFromContextMenu(pluginName)

      orca.notify("success", `已开始复习 ${cards.length} 张卡片`, { title: "SRS 复习" })
    } catch (error) {
      console.error(`[${pluginName}] 启动查询块复习失败:`, error)
      handleReviewError(error, pluginName, blockId, 'query')
    }
  }

  const MenuText = orca.components.MenuText

  // 构建标题（包含卡片数量和状态）
  let title: string
  if (isLoading) {
    title = "复习此查询结果..."
  } else if (hasError) {
    title = "复习此查询结果 (加载失败)"
  } else if (queryResultsEmpty) {
    title = "复习此查询结果 (查询为空)"
  } else if (cardCount === 0) {
    title = "复习此查询结果 (0)"
  } else {
    title = `复习此查询结果 (${cardCount})`
  }

  return (
    <MenuText
      preIcon="ti ti-cards"
      title={title}
      disabled={isLoading || cardCount === 0 || hasError}
      onClick={handleClick}
    />
  )
}

/**
 * 普通块菜单项组件
 * 显示"复习此块卡片"选项（包含当前块和子块），只有当有卡片时才显示
 */
function ChildrenBlockMenuItem({
  blockId,
  pluginName,
  close
}: {
  blockId: DbId
  pluginName: string
  close: () => void
}) {
  const [cardCount, setCardCount] = React.useState<number | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [shouldShow, setShouldShow] = React.useState(false)

  // 异步获取卡片数量
  React.useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      try {
        const count = await estimateCardCount(blockId, false)
        if (!cancelled) {
          setCardCount(count)
          // 只有当子块有卡片时才显示
          setShouldShow(count > 0)
          setIsLoading(false)
        }
      } catch (error) {
        console.error(`[${pluginName}] 获取子块卡片数量失败:`, error)
        if (!cancelled) {
          setShouldShow(false)
          setIsLoading(false)
        }
      }
    }

    fetchCount()

    return () => {
      cancelled = true
    }
  }, [blockId, pluginName])

  const handleClick = async () => {
    close()

    try {
      // 收集卡片
      const cards = await collectCardsFromChildren(blockId, pluginName)

      if (cards.length === 0) {
        orca.notify("info", "子块中没有找到卡片", { title: "SRS 复习" })
        return
      }

      // 创建重复复习会话
      createRepeatReviewSession(cards, blockId, 'children')

      // 启动复习会话
      await startRepeatReviewFromContextMenu(pluginName)

      orca.notify("success", `已开始复习 ${cards.length} 张卡片`, { title: "SRS 复习" })
    } catch (error) {
      console.error(`[${pluginName}] 启动子块复习失败:`, error)
      handleReviewError(error, pluginName, blockId, 'children')
    }
  }

  // 加载中或没有卡片时不显示
  if (isLoading || !shouldShow) {
    return null
  }

  const MenuText = orca.components.MenuText

  return (
    <MenuText
      preIcon="ti ti-cards"
      title={`复习此块卡片 (${cardCount})`}
      onClick={handleClick}
    />
  )
}

/**
 * 从右键菜单启动重复复习会话
 * 
 * @param pluginName - 插件名称
 */
async function startRepeatReviewFromContextMenu(pluginName: string): Promise<void> {
  // 动态导入以避免循环依赖
  const { getOrCreateReviewSessionBlock } = await import("../reviewSessionManager")

  const activePanelId = orca.state.activePanel

  if (!activePanelId) {
    orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" })
    return
  }

  // 获取或创建复习会话块
  const blockId = await getOrCreateReviewSessionBlock(pluginName)

  // 查找或创建右侧面板
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

  console.log(`[${pluginName}] 重复复习会话已启动，面板ID: ${rightPanelId}`)
}
