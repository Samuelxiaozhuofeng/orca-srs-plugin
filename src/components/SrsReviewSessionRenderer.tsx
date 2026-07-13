import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "../srs/types"
import SrsReviewSessionDemo from "./SrsReviewSessionDemo"
import SrsErrorBoundary from "./SrsErrorBoundary"
import {
  getRepeatReviewSessionById,
  retainRepeatReviewSession,
  releaseRepeatReviewSession,
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
import {
  ReviewSessionDescriptorError,
  readReviewSessionDescriptorFromBlock,
  scopeFromReviewSessionDescriptor,
  type ReviewSessionDescriptor
} from "../srs/reviewSessionDescriptor"
import { resolveReviewSessionBlock } from "../srs/reviewSessionManager"
import { createLoadGenerationGate } from "../srs/asyncLoadGeneration"
import { shouldManageHostEditorChrome } from "../srs/registry/panelTreeUtils"

const { useEffect, useState, useMemo, useRef, useCallback } = window.React
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

function deckFilterFromDescriptor(
  descriptor: ReviewSessionDescriptor
): string | null {
  if (descriptor.kind === "normal" && descriptor.scope.kind === "deck") {
    return descriptor.scope.deckName
  }
  return null
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
  const [isRepeatMode, setIsRepeatMode] = useState(false)
  const [currentRound, setCurrentRound] = useState(1)
  const [repeatSession, setRepeatSession] = useState<RepeatReviewSession | null>(null)
  const [sessionScope, setSessionScope] = useState<ReviewSessionScope>(() => createAllScope())
  const [sessionDailyLimits, setSessionDailyLimits] = useState<ReviewQueueLimits | null>(null)
  const [sessionFormalRootCards, setSessionFormalRootCards] = useState<ReviewCard[]>([])
  const [progressDescriptor, setProgressDescriptor] = useState<SessionProgressDescriptor>(
    () => createSessionProgressDescriptorFromNormal(null)
  )
  const [childExpandWarning, setChildExpandWarning] = useState<string | null>(null)
  const [sessionChildExpandLimits, setSessionChildExpandLimits] =
    useState<ChildExpandLimits | null>(null)

  /** 异步 load latest-wins */
  const loadGateRef = useRef(createLoadGenerationGate())
  /**
   * 本 Renderer 当前 retain 的 fixed sessionId（引用计数）。
   * 生命周期：成功绑定后 retain；effect cleanup / 换代 release。
   * 关闭不在 beforeFlush 再 release，避免双重 release。
   */
  const retainedSessionIdRef = useRef<string | null>(null)
  /** 诊断用：最近一次成功 commit 的 sessionId */
  const boundSessionIdRef = useRef<string | null>(null)

  const releaseRetainedIfAny = useCallback(() => {
    const sid = retainedSessionIdRef.current
    if (sid == null) return
    console.log(
      `[SRS Review Session Renderer] release repeat 引用 sessionId=${sid}`
    )
    releaseRepeatReviewSession(sid)
    retainedSessionIdRef.current = null
  }, [])

  /**
   * 在 generation 仍有效时 retain；同一 sessionId 已 retain 则不重复。
   * 切换到不同 sessionId 时先 release 旧引用。
   */
  const retainIfCurrent = useCallback(
    (generation: number, sessionId: string): boolean => {
      if (!loadGateRef.current.isCurrent(generation)) {
        return false
      }
      if (retainedSessionIdRef.current === sessionId) {
        return true
      }
      if (retainedSessionIdRef.current != null) {
        releaseRepeatReviewSession(retainedSessionIdRef.current)
        retainedSessionIdRef.current = null
      }
      retainRepeatReviewSession(sessionId)
      retainedSessionIdRef.current = sessionId
      return true
    },
    []
  )

  const commitIfCurrent = useCallback((generation: number): boolean => {
    return loadGateRef.current.isCurrent(generation)
  }, [])

  const loadReviewQueue = useCallback(
    async (targetBlockId: DbId, generation: number) => {
      // 同步阶段：仅当前 gen 可进入 loading UI
      if (!commitIfCurrent(generation)) return
      setIsLoading(true)
      setErrorMessage(null)
      setChildExpandWarning(null)

      try {
        const { getPluginName } = await import("../main")
        if (!commitIfCurrent(generation)) return

        const currentPluginName =
          typeof getPluginName === "function" ? getPluginName() : "orca-srs"
        if (!commitIfCurrent(generation)) return
        setPluginName(currentPluginName)

        const sessionBlock = await resolveReviewSessionBlock(targetBlockId)
        if (!commitIfCurrent(generation)) return

        let descriptor: ReviewSessionDescriptor
        try {
          descriptor = readReviewSessionDescriptorFromBlock(sessionBlock)
        } catch (descError) {
          const message =
            descError instanceof ReviewSessionDescriptorError
              ? descError.message
              : descError instanceof Error
                ? descError.message
                : String(descError)
          throw new Error(
            `无法加载会话描述（block #${targetBlockId}）：${message}`
          )
        }
        if (!commitIfCurrent(generation)) return

        console.log(
          `[SRS Review Session Renderer] 加载会话 gen=${generation} sessionId=${descriptor.sessionId} kind=${descriptor.kind}`
        )

        if (descriptor.kind === "custom") {
          throw new ReviewSessionDescriptorError(
            "unsupported_kind",
            "自定义学习尚未实现，无法加载此会话。请使用普通复习或重复复习入口。"
          )
        }

        const resolvedChildExpand = resolveChildExpandLimits(undefined)
        const frozenChildExpand: ChildExpandLimits = Object.freeze({
          maxDepth: resolvedChildExpand.maxDepth,
          maxAuxChildCards: resolvedChildExpand.maxAuxChildCards
        })
        if (!commitIfCurrent(generation)) return
        setSessionChildExpandLimits(frozenChildExpand)

        if (descriptor.kind === "fixed" && descriptor.mode === "repeat") {
          const activeRepeatSession = getRepeatReviewSessionById(
            descriptor.sessionId
          )

          if (!activeRepeatSession) {
            throw new Error(
              `重复复习会话数据不可用（sessionId=${descriptor.sessionId}）。` +
                `请重新从查询块/子块/困难卡入口启动；不会回退为全部复习。`
            )
          }

          if (
            String(activeRepeatSession.sourceBlockId) !==
              descriptor.source.sourceBlockId ||
            activeRepeatSession.sourceType !== descriptor.source.sourceType
          ) {
            throw new Error(
              `重复复习会话与块描述不一致（sessionId=${descriptor.sessionId}），已中止加载`
            )
          }

          const { buildSessionReviewQueue } = await import("../srs/cardCollector")
          if (!commitIfCurrent(generation)) return

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
          if (!commitIfCurrent(generation)) return

          if (childExpandDiagnostics.length > 0) {
            console.warn(
              `[SRS Review Session Renderer] 子卡展开截断诊断:`,
              childExpandDiagnostics
            )
          }

          // retain 必须在任意 setState 之前且 generation 有效时完成
          if (!retainIfCurrent(generation, descriptor.sessionId)) {
            return
          }
          if (!commitIfCurrent(generation)) {
            // retain 后 generation 失效：释放本次 retain，不写 state
            releaseRetainedIfAny()
            return
          }

          boundSessionIdRef.current = descriptor.sessionId
          const fixedScope = prepareFixedSessionScope(expandedCards)
          setSessionScope(fixedScope)
          setProgressDescriptor(
            createSessionProgressDescriptorFromFixedSource(
              activeRepeatSession.sourceType,
              activeRepeatSession.sourceBlockId
            )
          )
          setSessionDailyLimits(null)
          setSessionFormalRootCards(formalRootCards)
          setChildExpandWarning(formatChildExpandWarning(childExpandDiagnostics))
          setCards(expandedCards)
          setIsRepeatMode(true)
          setCurrentRound(activeRepeatSession.currentRound)
          setRepeatSession({ ...activeRepeatSession, cards: expandedCards })
        } else if (descriptor.kind === "normal") {
          // normal 不参与 repeat retain；若先前 retain 了 fixed，换到 normal 时应释放
          // （effect cleanup 在 blockId 变化时已 release；retry 同 normal 块则无 retain）
          if (retainedSessionIdRef.current != null) {
            releaseRetainedIfAny()
          }

          const { collectReviewCards } = await import("../main")
          const { buildSessionReviewQueue } = await import("../srs/cardCollector")
          if (!commitIfCurrent(generation)) return

          const allCards = await collectReviewCards(currentPluginName)
          if (!commitIfCurrent(generation)) return

          const deckFilter = deckFilterFromDescriptor(descriptor)
          const { scope, filteredCards } = prepareNormalSessionQueueInput(
            allCards,
            deckFilter
          )
          const scopeFromDesc = scopeFromReviewSessionDescriptor(descriptor)
          if (scope.kind !== scopeFromDesc.kind) {
            throw new Error(
              `会话 scope 与描述不一致：prepared=${scope.kind} descriptor=${scopeFromDesc.kind}`
            )
          }
          if (
            scope.kind === "deck" &&
            scopeFromDesc.kind === "deck" &&
            scope.deckName !== scopeFromDesc.deckName
          ) {
            throw new Error(
              `会话牌组与描述不一致：prepared=${scope.deckName} descriptor=${scopeFromDesc.deckName}`
            )
          }

          const settings = getReviewSettings(currentPluginName)
          const resolvedLimits = resolveDailyQueueLimits(
            settings.newCardsPerDay,
            settings.reviewCardsPerDay
          )
          if (resolvedLimits.warnings.length > 0) {
            console.warn(
              `[SRS Review Session Renderer] 每日限额设置无效，已回退默认：`,
              resolvedLimits.warnings
            )
            if (commitIfCurrent(generation)) {
              orca.notify(
                "warn",
                `每日限额设置无效，已使用默认 ${resolvedLimits.newCardsPerDay}/${resolvedLimits.reviewCardsPerDay}`,
                { title: "SRS 复习" }
              )
            }
          }
          const configuredLimits: ReviewQueueLimits = Object.freeze({
            newCardsPerDay: resolvedLimits.newCardsPerDay,
            reviewCardsPerDay: resolvedLimits.reviewCardsPerDay
          })

          const { start: todayStart, end: todayEnd } = getLocalTodayBounds()
          const todayLogs = await getReviewLogs(
            currentPluginName,
            todayStart,
            todayEnd
          )
          if (!commitIfCurrent(generation)) return

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
          if (!commitIfCurrent(generation)) return

          if (childExpandDiagnostics.length > 0) {
            console.warn(
              `[SRS Review Session Renderer] 子卡展开截断诊断:`,
              childExpandDiagnostics
            )
          }

          boundSessionIdRef.current = descriptor.sessionId
          setSessionScope(scope)
          setProgressDescriptor(
            createSessionProgressDescriptorFromNormal(deckFilter)
          )
          setSessionDailyLimits(frozenLimits)
          setSessionFormalRootCards(formalRootCards)
          setChildExpandWarning(formatChildExpandWarning(childExpandDiagnostics))
          setCards(queue)
          setIsRepeatMode(false)
          setCurrentRound(1)
          setRepeatSession(null)
        } else {
          throw new Error(
            `不支持的会话描述 kind，无法加载（不得回退 all）`
          )
        }
      } catch (error) {
        if (!commitIfCurrent(generation)) {
          // 旧 generation 失败不得覆盖新 generation 的成功/错误状态
          return
        }
        console.error("[SRS Review Session Renderer] 加载复习队列失败:", error)
        setErrorMessage(error instanceof Error ? error.message : `${error}`)
        orca.notify("error", "加载复习队列失败", { title: "SRS 复习" })
      } finally {
        if (commitIfCurrent(generation)) {
          setIsLoading(false)
        }
      }
    },
    [commitIfCurrent, retainIfCurrent, releaseRetainedIfAny]
  )

  // blockId 变化或首次挂载：新 generation；cleanup 使旧 gen 失效并 release retain
  useEffect(() => {
    const generation = loadGateRef.current.begin()
    void loadReviewQueue(blockId, generation)
    return () => {
      loadGateRef.current.invalidate()
      releaseRetainedIfAny()
      boundSessionIdRef.current = null
    }
  }, [blockId, loadReviewQueue, releaseRetainedIfAny])

  const handleRetry = useCallback(() => {
    // 重试：新 generation；不在 begin 前 release payload（同 session 可能仍需）。
    // 若成功绑定同一 sessionId，retainIfCurrent 不会双计；
    // 若最终变为 normal，load 内会 release。
    const generation = loadGateRef.current.begin()
    void loadReviewQueue(blockId, generation)
  }, [blockId, loadReviewQueue])

  const handleRepeatRound = async () => {
    if (!repeatSession) return

    const updatedSession = resetCurrentRound(repeatSession)
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
  }

  const isRepeatModeRef = useRef(isRepeatMode)
  isRepeatModeRef.current = isRepeatMode

  const handleClose = useMemo(
    () =>
      createGuardedSessionCloser({
        pluginName,
        flush: flushReviewLogs,
        // 不在此 release：避免与 effect cleanup 双重 release。
        // 关面板 → unmount → effect cleanup → releaseRetainedIfAny。
        beforeFlush: undefined,
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

  const handleJumpToCard = (cardBlockId: DbId, shiftKey?: boolean) => {
    if (shiftKey) {
      orca.nav.openInLastPanel("block", { blockId: cardBlockId })
    } else {
      orca.nav.goTo("block", { blockId: cardBlockId }, panelId)
    }
  }

  /**
   * 仅当本 panel 的主视图就是此 review-session 块时，才允许 Demo 操作宿主
   * `.orca-block-editor`（maximize / 隐藏 query tabs 等）。
   * Journal「当日创建的」、引用预览、查询嵌入等场景 panel 主视图不是本块，
   * 必须为 false，避免把外层 Journal 的 none-editable 区域藏成 0×0。
   * 判定依赖 panel 主视图关系，不依赖 renderingMode。
   * 每次 render 重读 orca.state.panels，避免 useMemo 缓存陈旧 gate。
   */
  const panel = orca.nav.findViewPanel(panelId, orca.state.panels)
  const manageHostEditorChrome = shouldManageHostEditorChrome(
    panel,
    panelId,
    blockId
  )

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
          <Button variant="solid" onClick={handleRetry}>
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
          manageHostEditorChrome={manageHostEditorChrome}
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
