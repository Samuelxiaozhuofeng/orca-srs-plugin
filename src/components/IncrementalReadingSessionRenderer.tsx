import type { DbId } from "../orca.d.ts"
import type { IRCard } from "../srs/incrementalReadingCollector"
import IncrementalReadingSessionDemo from "./IncrementalReadingSessionDemo"
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

export default function IncrementalReadingSessionRenderer(props: RendererProps) {
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

  const [cards, setCards] = useState<IRCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pluginName, setPluginName] = useState("orca-srs")
  const [queueInfo, setQueueInfo] = useState<{
    dailyLimit: number
    totalDueCount: number
    overflowCount: number
    enableOverflowDefer: boolean
  }>({
    dailyLimit: 0,
    totalDueCount: 0,
    overflowCount: 0,
    enableOverflowDefer: true
  })

  useEffect(() => {
    void loadReadingQueue()
  }, [blockId])

  const loadReadingQueue = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const { getPluginName } = await import("../main")
      const currentPluginName = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      setPluginName(currentPluginName)

      const { collectIRCards, buildIRQueue } = await import("../srs/incrementalReadingCollector")
      const { getIncrementalReadingSettings } = await import("../srs/settings/incrementalReadingSettingsSchema")
      const dueCards = await collectIRCards(currentPluginName)
      const settings = getIncrementalReadingSettings(currentPluginName)
      const queue = await buildIRQueue(dueCards, {
        topicQuotaPercent: settings.topicQuotaPercent,
        dailyLimit: settings.dailyLimit
      })
      setCards(queue)
      setQueueInfo({
        dailyLimit: settings.dailyLimit,
        totalDueCount: dueCards.length,
        overflowCount: settings.dailyLimit > 0 ? Math.max(0, dueCards.length - queue.length) : 0,
        enableOverflowDefer: settings.enableAutoDefer
      })
    } catch (error) {
      console.error("[IR Session Renderer] 加载阅读队列失败:", error)
      setErrorMessage(error instanceof Error ? error.message : `${error}`)
      orca.notify("error", "加载渐进阅读队列失败", { title: "渐进阅读" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    orca.nav.close(panelId)
  }

  const handleDeferOverflow = async (): Promise<number> => {
    try {
      const currentPluginName = pluginName
      const { collectIRCards, buildIRQueue, deferIROverflow } = await import("../srs/incrementalReadingCollector")
      const { getIncrementalReadingSettings } = await import("../srs/settings/incrementalReadingSettingsSchema")

      const dueCards = await collectIRCards(currentPluginName)
      const settings = getIncrementalReadingSettings(currentPluginName)
      const queue = await buildIRQueue(dueCards, {
        topicQuotaPercent: settings.topicQuotaPercent,
        dailyLimit: settings.dailyLimit
      })

      const { deferredCount } = await deferIROverflow(dueCards, queue, { now: new Date() })
      await loadReadingQueue()
      return deferredCount
    } catch (error) {
      console.error("[IR Session Renderer] 溢出推后失败:", error)
      throw error
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
          加载渐进阅读队列中...
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
          <Button variant="solid" onClick={loadReadingQueue}>
            重试
          </Button>
        </div>
      )
    }

    return (
      <SrsErrorBoundary componentName="渐进阅读会话" errorTitle="渐进阅读会话加载出错">
        <IncrementalReadingSessionDemo
          cards={cards}
          panelId={panelId}
          pluginName={pluginName}
          dailyLimit={queueInfo.dailyLimit}
          totalDueCount={queueInfo.totalDueCount}
          overflowCount={queueInfo.overflowCount}
          enableOverflowDefer={queueInfo.enableOverflowDefer}
          onDeferOverflow={handleDeferOverflow}
          onClose={handleClose}
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
      reprClassName="srs-ir-session"
      contentClassName="srs-ir-session-content"
      contentJsx={renderContent()}
      childrenJsx={null}
    />
  )
}
