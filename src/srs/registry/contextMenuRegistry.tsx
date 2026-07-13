/**
 * 右键菜单注册模块
 * 
 * 负责注册和注销块右键菜单项
 * 支持查询块和普通块的复习功能
 */

import React from "react"
import type { DbId, Block } from "../../orca.d.ts"
import { BlockWithRepr } from "../blockUtils"
import {
  isQueryBlock,
  collectCardsFromQueryBlock,
  collectCardsFromChildren,
  estimateCardCount
} from "../blockCardCollector"
import { createRepeatReviewSession } from "../repeatReviewManager"
import {
  createFixedRepeatSessionDescriptor,
  type FixedRepeatSessionDescriptor
} from "../reviewSessionDescriptor"
import { getChapterBlockIds, getChapterBlockIdsAsync } from "../bookIRCreator"
import { showIRBookDialog } from "../../components/IRBookDialogMount"
import { classifyTopicIRBlockMenu, advanceTopicDueToToday } from "../topicIRMenu"
import { createTopicCardByBlockId } from "../topicCardCreator"

/** 已注册的菜单项 ID 列表 */
const registeredMenuIds: string[] = []

/** 重试状态存储 */
const retryState: Map<DbId, { type: 'query' | 'children', retryCount: number }> = new Map()

/** 渐进阅读右键动作进行中的块（防双击并发写入；菜单 close 后组件会卸载） */
const topicIRMenuInflight = new Set<string>()

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

  // 注册渐进阅读书籍菜单项（当块包含 inline references 时显示）
  const bookIRMenuId = `${pluginName}.createBookIR`
  orca.blockMenuCommands.registerBlockMenuCommand(bookIRMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, _rootBlockId: DbId, close: () => void) => {
      // 获取块数据
      const block = orca.state.blocks?.[blockId] as Block | undefined

      // 对非查询块显示
      if (!block || isQueryBlock(block as BlockWithRepr)) {
        return null
      }

      return (
        <BookIRMenuItem
          blockId={blockId}
          block={block}
          pluginName={pluginName}
          close={close}
        />
      )
    }
  })
  registeredMenuIds.push(bookIRMenuId)

  // 整本移出渐进阅读（书籍页，基于 ir.bookPlan，非 batchId）
  const removeBookIRMenuId = `${pluginName}.removeBookFromIRMenu`
  orca.blockMenuCommands.registerBlockMenuCommand(removeBookIRMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, _rootBlockId: DbId, close: () => void) => {
      const block = orca.state.blocks?.[blockId] as Block | undefined
      if (!block || isQueryBlock(block as BlockWithRepr)) {
        return null
      }
      const hasPlan = block.properties?.some((p) => p.name === "ir.bookPlan")
      if (!hasPlan) {
        return null
      }
      const MenuText = orca.components.MenuText
      return (
        <MenuText
          preIcon="ti ti-book-off"
          title="将整本书移出渐进阅读"
          onClick={() => {
            close()
            void orca.commands.invokeCommand(`${pluginName}.removeBookFromIR`, blockId)
          }}
        />
      )
    }
  })
  registeredMenuIds.push(removeBookIRMenuId)

  // 跨会话：继续未完成的 EPUB 导入
  const resumeEpubMenuId = `${pluginName}.resumeEpubImportMenu`
  orca.blockMenuCommands.registerBlockMenuCommand(resumeEpubMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, _rootBlockId: DbId, close: () => void) => {
      const block = orca.state.blocks?.[blockId] as Block | undefined
      if (!block || isQueryBlock(block as BlockWithRepr)) {
        return null
      }
      const status = block.properties?.find((p) => p.name === "epub.importStatus")?.value
      if (status !== "partial" && status !== "importing") {
        return null
      }
      const MenuText = orca.components.MenuText
      return (
        <MenuText
          preIcon="ti ti-player-play"
          title="继续导入 EPUB"
          onClick={() => {
            close()
            void orca.commands.invokeCommand(`${pluginName}.resumeEpubImport`, blockId)
          }}
        />
      )
    }
  })
  registeredMenuIds.push(resumeEpubMenuId)

  // 加入渐进阅读（普通非查询块，且当前不是 Topic IR）
  const joinTopicIRMenuId = `${pluginName}.joinTopicIR`
  orca.blockMenuCommands.registerBlockMenuCommand(joinTopicIRMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, _rootBlockId: DbId, close: () => void) => {
      const block = orca.state.blocks?.[blockId] as Block | undefined
      if (classifyTopicIRBlockMenu(block) !== "join") {
        return null
      }
      return (
        <JoinTopicIRMenuItem
          blockId={blockId}
          pluginName={pluginName}
          close={close}
        />
      )
    }
  })
  registeredMenuIds.push(joinTopicIRMenuId)

  // 今天阅读（已是 Topic IR 的非查询块；仅提前 due）
  const readTopicTodayMenuId = `${pluginName}.readTopicToday`
  orca.blockMenuCommands.registerBlockMenuCommand(readTopicTodayMenuId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, _rootBlockId: DbId, close: () => void) => {
      const block = orca.state.blocks?.[blockId] as Block | undefined
      if (classifyTopicIRBlockMenu(block) !== "readToday") {
        return null
      }
      return (
        <ReadTopicTodayMenuItem
          blockId={blockId}
          pluginName={pluginName}
          close={close}
        />
      )
    }
  })
  registeredMenuIds.push(readTopicTodayMenuId)

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

      // F2-01：descriptor + sessionId 绑定后再开面板
      const descriptor = createFixedRepeatSessionDescriptor({
        cards,
        sourceBlockId: blockId,
        sourceType: "query"
      })
      createRepeatReviewSession(
        cards,
        blockId,
        "query",
        descriptor.sessionId
      )
      await startRepeatReviewFromContextMenu(pluginName, descriptor)

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

      // F2-01：descriptor + sessionId 绑定后再开面板
      const descriptor = createFixedRepeatSessionDescriptor({
        cards,
        sourceBlockId: blockId,
        sourceType: "children"
      })
      createRepeatReviewSession(
        cards,
        blockId,
        "children",
        descriptor.sessionId
      )
      await startRepeatReviewFromContextMenu(pluginName, descriptor)

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
 * 渐进阅读书籍菜单项
 * 优先从 epub.manifest 读取已导入章节（支持重新加入）；否则回退 inline refs。
 */
function BookIRMenuItem({
  blockId,
  block,
  pluginName,
  close
}: {
  blockId: DbId
  block: Block
  pluginName: string
  close: () => void
}) {
  const [chapterCount, setChapterCount] = React.useState<number>(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [source, setSource] = React.useState<"manifest" | "refs" | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function fetchChapterCount() {
      try {
        const hasManifest = block.properties?.some((p) => p.name === "epub.manifest")
        if (hasManifest) {
          const { getImportedChaptersFromManifest } = await import(
            "../../importers/epub/epubManifestChapters"
          )
          const { chapters } = await getImportedChaptersFromManifest(blockId)
          if (!cancelled) {
            setChapterCount(chapters.length)
            setSource("manifest")
            setIsLoading(false)
          }
          return
        }

        const chapterIds = await getChapterBlockIdsAsync(block)
        if (!cancelled) {
          setChapterCount(chapterIds.length)
          setSource("refs")
          setIsLoading(false)
        }
      } catch (error) {
        console.error(`[${pluginName}] 获取章节数量失败:`, error)
        if (!cancelled) {
          setChapterCount(0)
          setSource(null)
          setIsLoading(false)
        }
      }
    }

    fetchChapterCount()

    return () => {
      cancelled = true
    }
  }, [block, blockId, pluginName])

  const handleClick = async () => {
    close()

    const bookTitle = block.text?.trim() || "未命名书籍"
    let chapterIds: DbId[] = []

    try {
      if (source === "manifest" || block.properties?.some((p) => p.name === "epub.manifest")) {
        const { getImportedChaptersFromManifest } = await import(
          "../../importers/epub/epubManifestChapters"
        )
        const { chapters } = await getImportedChaptersFromManifest(blockId)
        chapterIds = chapters.map((c) => c.blockId)
      } else {
        chapterIds = await getChapterBlockIdsAsync(block)
      }
    } catch (error) {
      orca.notify(
        "error",
        error instanceof Error ? error.message : "读取章节失败",
        { title: "渐进阅读" }
      )
      return
    }

    if (chapterIds.length === 0) {
      orca.notify("warn", "没有可加入渐进阅读的章节", { title: "渐进阅读" })
      return
    }

    showIRBookDialog(chapterIds, bookTitle, blockId)
  }

  if (isLoading || chapterCount === 0) {
    return null
  }

  const MenuText = orca.components.MenuText
  const title =
    source === "manifest"
      ? `创建/重新加入渐进阅读 (${chapterCount} 章)`
      : `创建渐进阅读书籍 (${chapterCount} 章)`

  return (
    <MenuText
      preIcon="ti ti-book"
      title={title}
      onClick={handleClick}
    />
  )
}

/**
 * 加入渐进阅读：将普通块初始化为 Topic IR
 */
function JoinTopicIRMenuItem({
  blockId,
  pluginName,
  close
}: {
  blockId: DbId
  pluginName: string
  close: () => void
}) {
  const [working, setWorking] = React.useState(false)
  const inflightKey = `join:${String(blockId)}`

  const handleClick = async () => {
    if (working || topicIRMenuInflight.has(inflightKey)) return
    topicIRMenuInflight.add(inflightKey)
    setWorking(true)
    close()
    try {
      await createTopicCardByBlockId(blockId, pluginName)
    } catch (error) {
      console.error(`[${pluginName}] 加入渐进阅读失败:`, error)
      orca.notify("error", `加入渐进阅读失败: ${error}`, { title: "渐进阅读" })
    } finally {
      topicIRMenuInflight.delete(inflightKey)
      setWorking(false)
    }
  }

  const MenuText = orca.components.MenuText
  return (
    <MenuText
      preIcon="ti ti-book-2"
      title={working ? "加入渐进阅读..." : "加入渐进阅读"}
      disabled={working}
      onClick={() => { void handleClick() }}
    />
  )
}

/**
 * 今天阅读：仅 advanceDueToToday，不改其他长期 IR 状态
 */
function ReadTopicTodayMenuItem({
  blockId,
  pluginName,
  close
}: {
  blockId: DbId
  pluginName: string
  close: () => void
}) {
  const [working, setWorking] = React.useState(false)
  const inflightKey = `today:${String(blockId)}`

  const handleClick = async () => {
    if (working || topicIRMenuInflight.has(inflightKey)) return
    topicIRMenuInflight.add(inflightKey)
    setWorking(true)
    close()
    try {
      await advanceTopicDueToToday(blockId, pluginName)
    } catch (error) {
      console.error(`[${pluginName}] 今天阅读失败:`, error)
      orca.notify("error", `今天阅读失败: ${error}`, { title: "渐进阅读" })
    } finally {
      topicIRMenuInflight.delete(inflightKey)
      setWorking(false)
    }
  }

  const MenuText = orca.components.MenuText
  return (
    <MenuText
      preIcon="ti ti-calendar-due"
      title={working ? "今天阅读..." : "今天阅读"}
      disabled={working}
      onClick={() => { void handleClick() }}
    />
  )
}

/**
 * 从右键菜单启动重复复习会话
 *
 * @param pluginName - 插件名称
 * @param descriptor - 已创建并绑定卡片载荷的 fixed/repeat 描述
 */
async function startRepeatReviewFromContextMenu(
  pluginName: string,
  descriptor: FixedRepeatSessionDescriptor
): Promise<void> {
  // 动态导入以避免循环依赖
  const { createReviewSessionBlockWithDescriptor } = await import(
    "../reviewSessionManager"
  )

  const activePanelId = orca.state.activePanel

  if (!activePanelId) {
    orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" })
    return
  }

  // 每次启动新建会话块并写入 descriptor
  const blockId = await createReviewSessionBlockWithDescriptor(
    pluginName,
    descriptor
  )

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
