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
import {
  createGuardedSessionCloser,
  REVIEW_LOG_FLUSH_PENDING_MESSAGE
} from "../srs/reviewSessionClose"
import { flushReviewLogs, getReviewLogs } from "../srs/reviewLogStorage"
import {
  createAllScope,
  prepareFixedSessionScope,
  prepareNormalSessionQueueInput,
  type ReviewSessionScope
} from "../srs/reviewSessionScope"
import {
  getLocalTodayBounds,
  remainingDailyLimitsFromLogs,
  resolveDailyQueueLimits,
  type ReviewQueueLimits
} from "../srs/reviewSessionBudget"
import { getReviewSettings } from "../srs/settings/reviewSettingsSchema"
import {
  createSessionProgressDescriptorFromFixedSource,
  createSessionProgressDescriptorFromNormal,
  type SessionProgressDescriptor
} from "../srs/sessionProgressStorage"
import {
  formatChildExpandWarning,
  resolveChildExpandLimits,
  type ChildExpandLimits
} from "../srs/cardCollector"

const { useEffect, useState, useMemo, useRef } = window.React
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
  /** 会话启动时冻结的范围；之后不随全局 reviewDeckFilter 变化 */
  const [sessionScope, setSessionScope] = useState<ReviewSessionScope>(() => createAllScope())
  /**
   * 会话启动时冻结的每日正式根卡额度；fixed 为 null（不限额）。
   * Demo 不得在会话中重读全局 settings。
   */
  const [sessionDailyLimits, setSessionDailyLimits] = useState<ReviewQueueLimits | null>(null)
  /** 初始正式根卡（计额度 seed）；子卡不在此列 */
  const [sessionFormalRootCards, setSessionFormalRootCards] = useState<ReviewCard[]>([])
  /**
   * FC-09：会话进度 storage 描述（加载队列时冻结）。
   * Demo 只消费 progressStorageKey，不得重读全局 filter / repeat manager。
   * 默认 all，避免 loading 阶段误用共享键。
   */
  const [progressDescriptor, setProgressDescriptor] = useState<SessionProgressDescriptor>(
    () => createSessionProgressDescriptorFromNormal(null)
  )
  /**
   * FC-12：子卡展开截断的会话顶部简短提示；无截断为 null。
   * 详细诊断在 console；核心展开不读全局 settings。
   */
  const [childExpandWarning, setChildExpandWarning] = useState<string | null>(null)
  /** 会话冻结的子卡展开限制（默认 10/200）；fixed/normal/repeat 共用 */
  const [sessionChildExpandLimits, setSessionChildExpandLimits] =
    useState<ChildExpandLimits | null>(null)

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
    setChildExpandWarning(null)

    try {
      const { getPluginName } = await import("../main")
      const currentPluginName = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      setPluginName(currentPluginName)

      // FC-12：边界解析默认展开限制，核心只收显式 limits（不读全局 settings）
      const resolvedChildExpand = resolveChildExpandLimits(undefined)
      const frozenChildExpand: ChildExpandLimits = Object.freeze({
        maxDepth: resolvedChildExpand.maxDepth,
        maxAuxChildCards: resolvedChildExpand.maxAuxChildCards
      })
      setSessionChildExpandLimits(frozenChildExpand)

      // 首先检查是否有活跃的重复复习会话（从右键菜单启动）
      const activeRepeatSession = getRepeatReviewSession()
      
      if (activeRepeatSession) {
        // 使用重复复习会话中的卡片，但需要展开子卡片链
        console.log(`[SRS Review Session Renderer] 使用重复复习会话，原始卡片数: ${activeRepeatSession.cards.length}`)
        
        const { buildSessionReviewQueue } = await import("../srs/cardCollector")
        // fixed：正式根不限额；子卡展开仍受 FC-12 限制（与 normal/repeat 一致）
        const {
          queue: expandedCards,
          formalRootCards,
          childExpandDiagnostics
        } = await buildSessionReviewQueue(
          activeRepeatSession.cards,
          currentPluginName,
          null,
          frozenChildExpand
        )
        
        console.log(`[SRS Review Session Renderer] 展开子卡片后卡片数: ${expandedCards.length}`)
        if (childExpandDiagnostics.length > 0) {
          console.warn(
            `[SRS Review Session Renderer] 子卡展开截断诊断:`,
            childExpandDiagnostics
          )
        }
        setChildExpandWarning(formatChildExpandWarning(childExpandDiagnostics))
        
        // fixed scope：原始卡 + 展开子卡均纳入允许集合（含 List root）
        const fixedScope = prepareFixedSessionScope(expandedCards)
        setSessionScope(fixedScope)
        // 进度 scope：困难卡 / 专项 / 重复；round 变更不改 key（同专项会话）
        setProgressDescriptor(
          createSessionProgressDescriptorFromFixedSource(
            activeRepeatSession.sourceType,
            activeRepeatSession.sourceBlockId
          )
        )
        setSessionDailyLimits(null)
        setSessionFormalRootCards(formalRootCards)
        setCards(expandedCards)
        setIsRepeatMode(true)
        setCurrentRound(activeRepeatSession.currentRound)
        setRepeatSession({ ...activeRepeatSession, cards: expandedCards })
      } else {
        // 正常模式：启动时只读取一次 deck filter + 每日限额，立即冻结
        const {
          collectReviewCards,
          getReviewDeckFilter
        } = await import("../main")
        const { buildSessionReviewQueue } = await import("../srs/cardCollector")
        
        const allCards = await collectReviewCards(currentPluginName)
        const deckFilter = typeof getReviewDeckFilter === "function" ? getReviewDeckFilter() : null
        const { scope, filteredCards } = prepareNormalSessionQueueInput(allCards, deckFilter)
        setSessionScope(scope)
        // 进度 scope：与队列 scope 同源冻结，Demo 不得重读 getReviewDeckFilter
        setProgressDescriptor(createSessionProgressDescriptorFromNormal(deckFilter))

        const settings = getReviewSettings(currentPluginName)
        const resolvedLimits = resolveDailyQueueLimits(
          settings.newCardsPerDay,
          settings.reviewCardsPerDay
        )
        // 无效设置告警仍展示 configured 回退值（非 remaining）
        if (resolvedLimits.warnings.length > 0) {
          console.warn(
            `[SRS Review Session Renderer] 每日限额设置无效，已回退默认：`,
            resolvedLimits.warnings
          )
          orca.notify(
            "warn",
            `每日限额设置无效，已使用默认 ${resolvedLimits.newCardsPerDay}/${resolvedLimits.reviewCardsPerDay}`,
            { title: "SRS 复习" }
          )
        }
        const configuredLimits: ReviewQueueLimits = Object.freeze({
          newCardsPerDay: resolvedLimits.newCardsPerDay,
          reviewCardsPerDay: resolvedLimits.reviewCardsPerDay
        })

        // 跨会话每日额度：读取本地时区「今天 00:00 → now」日志，扣除已用后冻结 remaining
        // getReviewLogs 会先 flush；读取/flush 失败必须向上抛出，禁止用 used=0 兜底突破限额
        const { start: todayStart, end: todayEnd } = getLocalTodayBounds()
        const todayLogs = await getReviewLogs(
          currentPluginName,
          todayStart,
          todayEnd
        )
        const deckNameForQuota =
          scope.kind === "deck" ? scope.deckName : null
        const remaining = remainingDailyLimitsFromLogs(
          configuredLimits,
          todayLogs,
          { deckName: deckNameForQuota }
        )
        const frozenLimits: ReviewQueueLimits = Object.freeze({
          newCardsPerDay: remaining.newCardsPerDay,
          reviewCardsPerDay: remaining.reviewCardsPerDay
        })
        console.log(
          `[SRS Review Session Renderer] 每日额度 ` +
            `scope=${scope.kind === "deck" ? `deck:${scope.deckName}` : "all"} ` +
            `configured new/review=${configuredLimits.newCardsPerDay}/${configuredLimits.reviewCardsPerDay} ` +
            `used=${remaining.usedNew}/${remaining.usedReview} ` +
            `remaining=${frozenLimits.newCardsPerDay}/${frozenLimits.reviewCardsPerDay} ` +
            `(logs=${todayLogs.length})`
        )
        // 会话预算与初始队列均使用 remaining，动态追加不得绕过
        setSessionDailyLimits(frozenLimits)

        // 正式根卡应用冻结剩余额度；子卡展开不消耗额度，但受 FC-12 限制
        const {
          queue,
          formalRootCards,
          childExpandDiagnostics
        } = await buildSessionReviewQueue(
          filteredCards,
          currentPluginName,
          frozenLimits,
          frozenChildExpand
        )
        if (childExpandDiagnostics.length > 0) {
          console.warn(
            `[SRS Review Session Renderer] 子卡展开截断诊断:`,
            childExpandDiagnostics
          )
        }
        setChildExpandWarning(formatChildExpandWarning(childExpandDiagnostics))
        setSessionFormalRootCards(formalRootCards)
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
    
    // fixed 轮次：正式根仍不限额；子卡展开用会话冻结的 FC-12 限制
    const { buildSessionReviewQueue } = await import("../srs/cardCollector")
    const expandLimits =
      sessionChildExpandLimits ??
      (() => {
        const r = resolveChildExpandLimits(undefined)
        return Object.freeze({
          maxDepth: r.maxDepth,
          maxAuxChildCards: r.maxAuxChildCards
        })
      })()
    const {
      queue: expandedCards,
      formalRootCards,
      childExpandDiagnostics
    } = await buildSessionReviewQueue(
      updatedSession.cards,
      pluginName,
      null,
      expandLimits
    )
    
    if (childExpandDiagnostics.length > 0) {
      console.warn(
        `[SRS Review Session Renderer] 子卡展开截断诊断（第 ${updatedSession.currentRound} 轮）:`,
        childExpandDiagnostics
      )
    }
    setChildExpandWarning(formatChildExpandWarning(childExpandDiagnostics))
    setSessionFormalRootCards(formalRootCards)
    setCards(expandedCards)
    setCurrentRound(updatedSession.currentRound)
    setRepeatSession({ ...updatedSession, cards: expandedCards })
    
    console.log(`[SRS Review Session Renderer] 开始第 ${updatedSession.currentRound} 轮复习，展开后卡片数: ${expandedCards.length}`)
  }

  // 统一 async 关闭：flush -> 失败 notify -> close；防重复点击
  // 唯一 flush 入口，Demo 所有 onClose 最终走此处，避免双重 flush
  const isRepeatModeRef = useRef(isRepeatMode)
  isRepeatModeRef.current = isRepeatMode

  const handleClose = useMemo(
    () =>
      createGuardedSessionCloser({
        pluginName,
        flush: flushReviewLogs,
        beforeFlush: () => {
          if (isRepeatModeRef.current) {
            clearRepeatReviewSession()
          }
        },
        notifyFlushFailure: (message) => {
          orca.notify("error", message || REVIEW_LOG_FLUSH_PENDING_MESSAGE, {
            title: "SRS 复习"
          })
        },
        close: () => {
          orca.nav.close(panelId)
        }
      }),
    [pluginName, panelId]
  )

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
          sessionScope={sessionScope}
          sessionDailyLimits={sessionDailyLimits}
          sessionFormalRootCards={sessionFormalRootCards}
          progressStorageKey={progressDescriptor.storageKey}
          childExpandWarning={childExpandWarning}
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
