import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "../srs/types"
import SrsReviewSessionDemo from "./SrsReviewSessionDemo"

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

  useEffect(() => {
    void loadReviewQueue()
  }, [])

  const loadReviewQueue = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const { collectReviewCards, buildReviewQueue } = await import("../main")
      const allCards = await collectReviewCards()
      const queue = buildReviewQueue(allCards)
      setCards(queue)
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

  const handleJumpToCard = (cardBlockId: DbId) => {
    const leftPanelId = findLeftPanel(orca.state.panels, panelId)
    if (leftPanelId) {
      orca.nav.goTo("block", { blockId: cardBlockId }, leftPanelId)
      orca.nav.switchFocusTo(leftPanelId)
      orca.notify("info", "已在左侧面板打开卡片", { title: "SRS 复习" })
    } else {
      orca.nav.goTo("block", { blockId: cardBlockId })
      orca.notify("warn", "未找到左侧面板，已在当前面板打开", { title: "SRS 复习" })
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
      <SrsReviewSessionDemo
        cards={cards}
        onClose={handleClose}
        onJumpToCard={handleJumpToCard}
        inSidePanel={true}
      />
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

function findLeftPanel(node: any, currentPanelId: string): string | null {
  if (!node) return null

  if (node.type === "hsplit" && node.children?.length === 2) {
    const [leftPanel, rightPanel] = node.children
    if (containsPanel(rightPanel, currentPanelId)) {
      return typeof leftPanel?.id === "string" ? leftPanel.id : extractPanelId(leftPanel)
    }
  }

  if (node.children) {
    for (const child of node.children) {
      const result = findLeftPanel(child, currentPanelId)
      if (result) return result
    }
  }

  return null
}

function containsPanel(node: any, panelId: string): boolean {
  if (!node) return false
  if (node.id === panelId) return true
  if (!node.children) return false
  return node.children.some((child: any) => containsPanel(child, panelId))
}

function extractPanelId(node: any): string | null {
  if (!node) return null
  if (typeof node.id === "string") return node.id
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const result = extractPanelId(child)
      if (result) return result
    }
  }
  return null
}
