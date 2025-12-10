import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "../srs/types"
import SrsReviewSessionDemo from "./SrsReviewSessionDemo"
import SrsErrorBoundary from "./SrsErrorBoundary"

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
  const [cardPanelId, setCardPanelId] = useState(panelId)
  const [pluginName, setPluginName] = useState("orca-srs")

  useEffect(() => {
    void loadReviewQueue()
  }, [])

  const loadReviewQueue = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const {
        collectReviewCards,
        buildReviewQueue,
        getReviewHostPanelId,
        getPluginName,
        getReviewDeckFilter
      } = await import("../main")
      const currentPluginName = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      const allCards = await collectReviewCards(currentPluginName)
      const deckFilter = typeof getReviewDeckFilter === "function" ? getReviewDeckFilter() : null
      const filteredCards = deckFilter
        ? allCards.filter(card => card.deck === deckFilter)
        : allCards
      const queue = buildReviewQueue(filteredCards)
      setCards(queue)
      const hostPanelId = typeof getReviewHostPanelId === "function" ? getReviewHostPanelId() : null
      setCardPanelId(hostPanelId ?? panelId)
      setPluginName(currentPluginName)
    } catch (error) {
      console.error("[SRS Review Session Renderer] 加载复习队列失败:", error)
      setErrorMessage(error instanceof Error ? error.message : `${error}`)
      orca.notify("error", "加载复习队列失败", { title: "SRS 复习" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    orca.nav.close(panelId)
  }

  const handleJumpToCard = async (cardBlockId: DbId) => {
    try {
      const { getReviewHostPanelId } = await import("../main")
      const hostPanelId = typeof getReviewHostPanelId === "function" ? getReviewHostPanelId() : null

      if (hostPanelId) {
        orca.nav.goTo("block", { blockId: cardBlockId }, hostPanelId)
        orca.nav.switchFocusTo(hostPanelId)
        orca.notify("info", "已在主面板打开卡片", { title: "SRS 复习" })
      } else {
        orca.nav.goTo("block", { blockId: cardBlockId })
        orca.notify("info", "已在当前面板打开卡片", { title: "SRS 复习" })
      }
    } catch (error) {
      console.error("[SRS Review Session Renderer] 跳转到卡片失败:", error)
      orca.nav.goTo("block", { blockId: cardBlockId })
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
          panelId={cardPanelId}
          pluginName={pluginName}
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
      contentAttrs={{ contentEditable: false }}
      contentJsx={renderContent()}
      childrenJsx={null}
    />
  )
}
