import type { DbId } from "../orca.d.ts"
import type { IRCard } from "../srs/incrementalReadingCollector"
import { popNextIRSessionFocusCardId } from "../srs/incrementalReadingSessionManager"
import {
  applyAutoPostpone,
  formatAutoPostponeSummary,
  undoAutoPostponeBatch
} from "../srs/incremental-reading/irOverloadService"
import {
  DEFAULT_QUEUE_POLICY,
  selectQueueWithPolicy
} from "../srs/incremental-reading/irQueuePolicy"
import { buildCollectError, buildCollectOk } from "../srs/incremental-reading/irCollectResult"
import type { IRCollectResult } from "../srs/incremental-reading/irTypes"
import IncrementalReadingSessionDemo from "./IncrementalReadingSessionDemo"
import SrsErrorBoundary from "./SrsErrorBoundary"

const { useEffect, useRef, useState } = window.React
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

type SessionLaunchOptions = {
  timeBudgetMinutes: number
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
  const [collectResult, setCollectResult] = useState<IRCollectResult | null>(null)
  const [pluginName, setPluginName] = useState("orca-srs")
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(20)
  const [autoPostponeLabel, setAutoPostponeLabel] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const autoBatchIdRef = useRef<string | null>(null)

  useEffect(() => {
    // 仅预加载插件名；真正队列在用户选择时间盒后加载
    void (async () => {
      try {
        const { getPluginName } = await import("../main")
        const currentPluginName = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
        setPluginName(currentPluginName)
      } catch {
        setPluginName("orca-srs")
      } finally {
        setIsLoading(false)
      }
    })()
  }, [blockId])

  const loadReadingQueue = async (options: SessionLaunchOptions) => {
    setIsLoading(true)
    setCollectResult(null)
    const started = Date.now()

    try {
      const { getPluginName } = await import("../main")
      const currentPluginName = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      setPluginName(currentPluginName)

      const {
        collectIRCards,
        collectIRCardsDetailed
      } = await import("../srs/incrementalReadingCollector")
      const { getIncrementalReadingSettings } = await import("../srs/settings/incrementalReadingSettingsSchema")

      const detailed = typeof collectIRCardsDetailed === "function"
        ? await collectIRCardsDetailed(currentPluginName)
        : { cards: await collectIRCards(currentPluginName), failedCount: 0 }

      const result = buildCollectOk(detailed.cards, detailed.failedCount)
      setCollectResult(result)

      if (result.status === "error") {
        setCards([])
        return
      }

      const settings = getIncrementalReadingSettings(currentPluginName)
      const seed = new Date().toISOString().slice(0, 10)
      const policyQueue = selectQueueWithPolicy(result.cards, {
        ...DEFAULT_QUEUE_POLICY,
        timeBudgetMinutes: options.timeBudgetMinutes,
        dailyLimit: settings.dailyLimit,
        seed
      })

      // 自动推后：仅旧积压且不在保护队列
      const auto = await applyAutoPostpone(result.cards, {
        protectedIds: policyQueue.protectedIds,
        createBatchId: () => `session-${Date.now()}`
      })
      if (auto.batch && auto.deferredCount > 0) {
        autoBatchIdRef.current = auto.batch.batchId
        setAutoPostponeLabel(formatAutoPostponeSummary(auto.deferredCount))
      } else {
        autoBatchIdRef.current = null
        setAutoPostponeLabel(null)
      }

      const focusCardId = await popNextIRSessionFocusCardId(currentPluginName)
      let focusedQueue = policyQueue.queue
      if (focusCardId) {
        const focusCard = result.cards.find(card => card.id === focusCardId)
        if (focusCard) {
          const without = focusedQueue.filter(c => c.id !== focusCardId)
          focusedQueue = [focusCard, ...without]
          if (settings.dailyLimit > 0 && focusedQueue.length > settings.dailyLimit) {
            focusedQueue = focusedQueue.slice(0, settings.dailyLimit)
          }
        }
      }

      setCards(focusedQueue)
      setTimeBudgetMinutes(options.timeBudgetMinutes)
      setSessionReady(true)
      console.log(`[IR Session] queue loaded in ${Date.now() - started}ms, n=${focusedQueue.length}`)
    } catch (error) {
      console.error("[IR Session Renderer] 加载阅读队列失败:", error)
      const errResult = buildCollectError(error)
      setCollectResult(errResult)
      setCards([])
      orca.notify("error", "加载渐进阅读队列失败", { title: "渐进阅读" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    orca.nav.close(panelId)
  }

  const handleUndoAutoPostpone = async () => {
    const batchId = autoBatchIdRef.current
    if (!batchId) return
    try {
      const result = await undoAutoPostponeBatch(batchId)
      if (result.restored > 0) {
        orca.notify("success", `已撤销自动顺延 ${result.restored} 条`, { title: "渐进阅读" })
        setAutoPostponeLabel(null)
        autoBatchIdRef.current = null
      } else {
        orca.notify("info", "没有可撤销的自动顺延（可能已被手动修改）", { title: "渐进阅读" })
      }
    } catch (error) {
      console.error("[IR Session] 撤销自动推后失败:", error)
      orca.notify("error", "撤销自动推后失败", { title: "渐进阅读" })
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

    if (!sessionReady) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          alignItems: "center",
          justifyContent: "center",
          height: "100%"
        }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>开始渐进阅读</div>
          <div style={{ fontSize: 13, color: "var(--orca-color-text-3)" }}>选择本次时间盒</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[10, 20, 30].map(mins => (
              <Button
                key={mins}
                variant={mins === 20 ? "solid" : "outline"}
                onClick={() => void loadReadingQueue({ timeBudgetMinutes: mins })}
              >
                {mins} 分钟
              </Button>
            ))}
          </div>
        </div>
      )
    }

    const loadFailed = collectResult?.status === "error"
    return (
      <SrsErrorBoundary componentName="渐进阅读会话" errorTitle="渐进阅读会话加载出错">
        <IncrementalReadingSessionDemo
          cards={cards}
          panelId={panelId}
          pluginName={pluginName}
          timeBudgetMinutes={timeBudgetMinutes}
          loadFailed={loadFailed}
          loadErrorMessage={collectResult?.errorMessage ?? null}
          onRetryLoad={() => void loadReadingQueue({ timeBudgetMinutes })}
          autoPostponeLabel={autoPostponeLabel}
          onUndoAutoPostpone={handleUndoAutoPostpone}
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
