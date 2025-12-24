import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "../srs/types"
import SrsReviewSessionDemo from "./SrsReviewSessionDemo"
import SrsErrorBoundary from "./SrsErrorBoundary"
import {
  getRepeatReviewSession,
  clearRepeatReviewSession,
  resetCurrentRound,
  type RepeatReviewSession
} from "../srs/repeatReviewManager"

const { useEffect, useState } = window.React
const { BlockShell, Button } = orca.components

type RendererProps = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
}

export default function SrsReviewSessionRenderer(props: RendererProps) {
  const {
    panelId,
    blockId,
    rndId,
    blockLevel,
    indentLevel,
    mirrorId,
    initiallyCollapsed,
    renderingMode
  } = props

  const [cards, setCards] = useState<ReviewCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pluginName, setPluginName] = useState("orca-srs")
  // 重复复习模式状态
  const [isRepeatMode, setIsRepeatMode] = useState(false)
  const [currentRound, setCurrentRound] = useState(1)
  const [repeatSession, setRepeatSession] = useState<RepeatReviewSession | null>(null)

  useEffect(() => {
    void loadReviewQueue()
  }, [blockId])  // 当 blockId 变化时重新加载队列
  
  // 组件卸载时清理重复复习会话
  useEffect(() => {
    return () => {
      // 无论是否为重复模式，都尝试清理会话
      // 因为组件卸载时应该清理所有相关状态
      console.log(`[SRS Review Session Renderer] 组件卸载，清理重复复习会话`)
      clearRepeatReviewSession()
    }
  }, [])  // 只在组件卸载时执行

  const loadReviewQueue = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const { getPluginName } = await import("../main")
      const currentPluginName = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      setPluginName(currentPluginName)

      // 首先检查是否有活跃的重复复习会话（从右键菜单启动）
      const activeRepeatSession = getRepeatReviewSession()
      
      if (activeRepeatSession) {
        // 使用重复复习会话中的卡片，但需要展开子卡片链
        console.log(`[SRS Review Session Renderer] 使用重复复习会话，原始卡片数: ${activeRepeatSession.cards.length}`)
        
        const { buildReviewQueueWithChildren } = await import("../main")
        const expandedCards = await buildReviewQueueWithChildren(activeRepeatSession.cards, currentPluginName)
        
        console.log(`[SRS Review Session Renderer] 展开子卡片后卡片数: ${expandedCards.length}`)
        
        setCards(expandedCards)
        setIsRepeatMode(true)
        setCurrentRound(activeRepeatSession.currentRound)
        setRepeatSession({ ...activeRepeatSession, cards: expandedCards })
      } else {
        // 正常模式：加载所有到期卡片
        const {
          collectReviewCards,
          buildReviewQueueWithChildren,
          getReviewDeckFilter
        } = await import("../main")
        
        const allCards = await collectReviewCards(currentPluginName)
        const deckFilter = typeof getReviewDeckFilter === "function" ? getReviewDeckFilter() : null
        const filteredCards = deckFilter
          ? allCards.filter(card => card.deck === deckFilter)
          : allCards
        // 使用带子卡片展开的队列构建函数
        const queue = await buildReviewQueueWithChildren(filteredCards, currentPluginName)
        setCards(queue)
        setIsRepeatMode(false)
        setCurrentRound(1)
        setRepeatSession(null)
      }
    } catch (error) {
      console.error("[SRS Review Session Renderer] 加载复习队列失败:", error)
      setErrorMessage(error instanceof Error ? error.message : `${error}`)
      orca.notify("error", "加载复习队列失败", { title: "SRS 复习" })
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * 处理再复习一轮
   */
  const handleRepeatRound = async () => {
    if (!repeatSession) return
    
    const updatedSession = resetCurrentRound(repeatSession)
    
    // 展开子卡片链
    const { buildReviewQueueWithChildren } = await import("../main")
    const expandedCards = await buildReviewQueueWithChildren(updatedSession.cards, pluginName)
    
    setCards(expandedCards)
    setCurrentRound(updatedSession.currentRound)
    setRepeatSession({ ...updatedSession, cards: expandedCards })
    
    console.log(`[SRS Review Session Renderer] 开始第 ${updatedSession.currentRound} 轮复习，展开后卡片数: ${expandedCards.length}`)
  }

  const handleClose = () => {
    // 清理重复复习会话
    if (isRepeatMode) {
      clearRepeatReviewSession()
    }
    orca.nav.close(panelId)
  }

  /**
   * 跳转到卡片
   * - 直接点击：在当前面板打开
   * - Shift+点击：在侧面板打开（原生行为）
   */
  const handleJumpToCard = (cardBlockId: DbId, shiftKey?: boolean) => {
    if (shiftKey) {
      // Shift+点击：使用原生方法在新面板打开
      orca.nav.openInLastPanel("block", { blockId: cardBlockId })
    } else {
      // 直接点击：在当前面板打开
      orca.nav.goTo("block", { blockId: cardBlockId }, panelId)
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontSize: "14px",
          color: "var(--orca-color-text-2)"
        }}>
          加载复习队列中...
        </div>
      )
    }

    if (errorMessage) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "24px",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center"
        }}>
          <div style={{ color: "var(--orca-color-danger-5)" }}>加载失败：{errorMessage}</div>
          <Button variant="solid" onClick={loadReviewQueue}>
            重试
          </Button>
        </div>
      )
    }

    return (
      <SrsErrorBoundary componentName="复习会话" errorTitle="复习会话加载出错">
        <SrsReviewSessionDemo
          cards={cards}
          onClose={handleClose}
          onJumpToCard={handleJumpToCard}
          inSidePanel={true}
          panelId={panelId}
          pluginName={pluginName}
          isRepeatMode={isRepeatMode}
          currentRound={currentRound}
          onRepeatRound={isRepeatMode ? handleRepeatRound : undefined}
        />
      </SrsErrorBoundary>
    )
  }

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="srs-repr-review-session"
      contentClassName="srs-repr-review-session-content"
      contentJsx={renderContent()}
      childrenJsx={null}
    />
  )
}
