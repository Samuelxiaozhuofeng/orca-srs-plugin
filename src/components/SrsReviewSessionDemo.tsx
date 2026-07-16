/**
 * SRS 复习会话组件（使用真实数据队列）
 */
import type { DbId } from "../orca.d.ts"
import type { Grade, ReviewCard } from "../srs/types"
import type { SessionStatsSummary } from "../srs/sessionProgressTracker"
import {
  ensureCardSrsStateWithInitialDue,
  loadCardSrsState,
  invalidateBlockCache
} from "../srs/storage"
import { postponeCard, suspendCard } from "../srs/cardStatusUtils"
import { emitCardPostponed, emitCardSuspended } from "../srs/srsEvents"
import { showNotification } from "../srs/settings/reviewSettingsSchema"
import { gradeReviewCard } from "../srs/reviewCardGrading"
import { 
  markParentCardProcessed, 
  resetProcessedParentCards,
  getCardKey as getReviewCardKey
} from "../srs/childCardCollector"
import { computeReviewTiming } from "../srs/sessionProgressTracker"
import {
  createSessionFinalizeController,
  ensureSessionFinalized,
  resetSessionFinalizeController
} from "../srs/sessionProgressFinalize"
import { useSessionProgressTracker } from "../hooks/useSessionProgressTracker"
import { useHostEditorChrome } from "../hooks/useHostEditorChrome"
import { usePendingDueQueue } from "../hooks/usePendingDueQueue"
import {
  allowsFullLibraryDynamicScan,
  createAllScope,
  FIXED_SCOPE_NO_DYNAMIC_SCAN_MESSAGE,
  isCardInSessionScope,
  selectNewDueCardsForSession,
  type ReviewSessionScope
} from "../srs/reviewSessionScope"
import {
  createSessionRootCardBudget,
  type ReviewQueueLimits,
  type SessionRootCardBudget
} from "../srs/reviewSessionBudget"
import {
  buildHistoryEntry,
  canGoPrevious as historyCanGoPrevious,
  continueFromReadOnly,
  createEmptyHistory,
  formatReadOnlyStatus,
  getCardOutcome,
  guardSideEffectAction,
  isCardReadOnly,
  navigatePrevious,
  recordHistoryAction,
  type ReviewHistoryActionKind,
  type ReviewSessionHistoryState
} from "../srs/reviewSessionHistory"
/**
 * F2-05 会话动作 gate：grade / postpone / suspend / 切卡 timer。
 * 与 choiceSubmitGate（仅选择题答案提交）分工，不得互相替代。
 * isGrading 仅 UI/快捷键展示，并发正确性以本 gate 为准。
 */
import {
  canCommitSessionAction,
  createReviewSessionActionGate,
  decideAdvanceAfterDelay,
  type SessionActionKind,
  type SessionActionToken
} from "../srs/reviewSessionActionGate"
import { shouldTrackFormalShortRelearn } from "../srs/pendingDueRequeue"
import { useReviewCardAvailability } from "../hooks/useReviewCardAvailability"
import ReviewSessionActiveView from "./review-session/ReviewSessionActiveView"
import ReviewSessionCompletedView from "./review-session/ReviewSessionCompletedView"
import ReviewSessionEmptyView from "./review-session/ReviewSessionEmptyView"

// 从全局 window 对象获取 React（Orca 插件约定）
const { useEffect, useMemo, useRef, useState } = window.React

type SrsReviewSessionProps = {
  cards: ReviewCard[]
  /**
   * 会话范围（启动时由 Renderer 冻结并传入）。
   * 默认 all，避免遗漏 prop 时误用全局 deck filter。
   * Demo 不得导入 getReviewDeckFilter。
   */
  sessionScope?: ReviewSessionScope
  /**
   * 会话启动时冻结的每日正式根卡额度。
   * null = 不限额（fixed / 专项训练）；不得在会话中重读全局 settings。
   */
  sessionDailyLimits?: ReviewQueueLimits | null
  /**
   * 初始正式根卡（用于额度 seed）。子卡展开项不应传入。
   * 与 sessionDailyLimits 一起在启动时冻结消费状态。
   */
  sessionFormalRootCards?: readonly ReviewCard[]
  /**
   * FC-09：会话进度 sessionStorage 键（由 Renderer 在加载队列时冻结并传入）。
   * Demo 不得重读全局 deck filter / repeat manager 自行拼 key。
   * 必填，禁止共享默认键。
   */
  progressStorageKey: string
  /**
   * FC-12：子卡展开截断的简短提示（由 Renderer 根据诊断生成）。
   * 无截断为 null/undefined；Demo 仅展示，不重新展开或读 settings。
   */
  childExpandWarning?: string | null
  /** 统一关闭入口（由 Renderer 提供：flush + close）；可 async */
  onClose?: () => void | Promise<void>
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName?: string
  /** 是否为重复复习模式 */
  isRepeatMode?: boolean
  /** 当前轮次（仅重复复习模式） */
  currentRound?: number
  /** 再复习一轮回调（仅重复复习模式） */
  onRepeatRound?: () => void
  /**
   * 是否允许操作宿主 `.orca-block-editor` 的 maximize / 隐藏 chrome。
   * 仅当本复习会话块是指定 panel 的主 block 视图时为 true。
   * 嵌入 Journal「当日创建的」、引用预览、查询结果等场景必须为 false，
   * 否则会误伤外层 Journal 的 query tabs（引用 / 当日创建的 / 同标签等）。
   * 默认 false（安全默认：不触碰宿主 DOM）。
   */
  manageHostEditorChrome?: boolean
}
function getTodayMidnight(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function getTomorrowMidnight(): Date {
  const tomorrow = getTodayMidnight()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}

export default function SrsReviewSession({
  cards,
  sessionScope = createAllScope(),
  sessionDailyLimits = null,
  sessionFormalRootCards = [],
  progressStorageKey,
  childExpandWarning = null,
  onClose,
  onJumpToCard,
  inSidePanel = false,
  panelId,
  pluginName = "orca-srs",
  isRepeatMode = false,
  currentRound = 1,
  onRepeatRound,
  manageHostEditorChrome = false
}: SrsReviewSessionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [queue, setQueue] = useState<ReviewCard[]>(cards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [isGrading, setIsGrading] = useState(false)
  const [lastLog, setLastLog] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(true)  // 默认最大化
  /** FC-06：会话历史（cardKey + 动作）；只读由 outcomes 判定，不依赖脆弱索引 */
  const [sessionHistory, setSessionHistory] = useState<ReviewSessionHistoryState>(
    () => createEmptyHistory()
  )
  const [newCardsAdded, setNewCardsAdded] = useState(0)  // 新增卡片计数器
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now())  // 当前卡片开始复习时间
  const [internalRound, setInternalRound] = useState(currentRound)  // 内部轮次状态
  const [sessionStats, setSessionStats] = useState<SessionStatsSummary | null>(null)  // 会话统计摘要
  /** 避免闭包读到陈旧 scope；不依赖可变全局 filter */
  const sessionScopeRef = useRef(sessionScope)
  sessionScopeRef.current = sessionScope
  /**
   * 会话冻结额度状态：正式根卡已接纳集合不因 currentIndex 前移释放。
   * null = 不限额（fixed）。
   */
  const sessionBudgetRef = useRef<SessionRootCardBudget | null>(
    createSessionRootCardBudget(sessionDailyLimits, sessionFormalRootCards)
  )
  /**
   * FC-09：一次性 finalize 控制器。
   * 保证从未完成→完成只调用 finishProgressSession 一次；render 禁止 finish。
   */
  const sessionFinalizeRef = useRef(createSessionFinalizeController<SessionStatsSummary>())
  /**
   * F2-05：会话动作同步门闩（ref 持有，同步 acquire，不依赖 isGrading 重渲染）。
   * choiceSubmitGate 只管 Choice 答案提交，见 reviewSessionActionGate 模块头注释。
   */
  const actionGateRef = useRef(createReviewSessionActionGate())
  /** 成功动作后 250ms 切卡 timer；导航/卸载必须清理 */
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 使用会话进度追踪 Hook（FC-09：scoped key，不自动恢复；FC-10：有效时长由评分同源传入）
  const {
    progressState,
    accuracyRate,
    recordEffectiveGrade: recordProgressEffectiveGrade,
    resetSession: resetProgressSession,
    finishSession: finishProgressSession,
    abandonSession: abandonProgressSession,
    resumeSessionPersistence: resumeProgressPersistence,
  } = useSessionProgressTracker({
    autoSave: true,
    storageKey: progressStorageKey
  })

  const {
    clear: clearPendingDueSession,
    reset: resetPendingDueSession,
    track: trackPendingDueCard
  } = usePendingDueQueue({
    queue,
    currentIndex,
    pluginName,
    scopeRef: sessionScopeRef,
    budgetRef: sessionBudgetRef,
    finalizeRef: sessionFinalizeRef,
    setQueue,
    setNewCardsAdded,
    setLastLog,
    setSessionStats,
    resumeProgressPersistence
  })

  /**
   * 统一关闭入口：先清理 scoped 会话进度，再走 Renderer async onClose flush。
   * 完成 / 主动关闭 / Modal overlay / 卡片关闭按钮均走此路径。
   * 清理失败仅 warn，不阻断 flush / close。
   * F2-04：关闭时停用 pending 并清 timer，避免卸载后 setState。
   */
  const handleRequestClose = () => {
    clearPendingDueSession("close")
    try {
      abandonProgressSession()
    } catch (error) {
      console.warn("[SRS Review Session] 清理会话进度失败（仍继续关闭）:", error)
    }
    if (onClose) {
      void Promise.resolve(onClose())
    }
  }

  // 当外部 cards 或 currentRound 变化时，重置队列和索引（用于"再复习一轮"）
  useEffect(() => {
    if (currentRound !== internalRound) {
      // 轮次变化，重置队列；额度按本轮 formal roots 重新 seed（fixed 仍为 null）
      sessionBudgetRef.current = createSessionRootCardBudget(
        sessionDailyLimits,
        sessionFormalRootCards
      )
      // F2-04：新轮次作废旧 pending timer，清空内存 pending（不持久化）
      resetPendingDueSession()
      setQueue([...cards])
      setCurrentIndex(0)
      setSessionHistory(createEmptyHistory())
      setReviewedCount(0)
      setNewCardsAdded(0)
      setInternalRound(currentRound)
      setLastLog(`开始第 ${currentRound} 轮复习`)
      // 新一轮：清除一次性 finalize 标记与摘要，允许再 finish 一次
      resetSessionFinalizeController(sessionFinalizeRef.current)
      setSessionStats(null)
      resetProgressSession()  // 重置进度追踪器
      // 重置已处理的父卡片集合，新一轮复习允许重新插入子卡片
      resetProcessedParentCards()
      console.log(`[SRS Review Session] 重置队列，开始第 ${currentRound} 轮复习，卡片数: ${cards.length}`)
    }
  }, [
    cards,
    currentRound,
    internalRound,
    resetProgressSession,
    sessionDailyLimits,
    sessionFormalRootCards
  ])

  // 组件首次挂载时重置已处理的父卡片集合；额度 seed 与 props 对齐
  useEffect(() => {
    resetProcessedParentCards()
    sessionBudgetRef.current = createSessionRootCardBudget(
      sessionDailyLimits,
      sessionFormalRootCards
    )
    console.log("[SRS Review Session] 会话开始，重置已处理父卡片集合与正式根卡额度")
  }, [])

  useHostEditorChrome(containerRef, manageHostEditorChrome, isMaximized)

  const totalCards = queue.length
  const currentCard = currentIndex < totalCards ? queue[currentIndex] : null
  // 获取下一张卡片用于预缓存
  const nextCard = currentIndex + 1 < totalCards ? queue[currentIndex + 1] : null
  // 修复：只有当 currentIndex 超出队列范围且队列不为空时才算完成
  // 这样当新卡片动态添加到队列末尾时，不会错误地显示完成界面
  const isSessionComplete = currentIndex >= totalCards && totalCards > 0

  /**
   * 会话完成结算：在 effect 中一次性 finish + setSessionStats。
   * render 保持纯函数，绝不 fallback 调用 finishProgressSession。
   *
   * F2-04 注意：到达队尾时 **不** 清 pending——最后一张 Again/Hard 的短期
   * 重学到期后仍应追加队尾并使 isSessionComplete 回到 false。
   * pending 实际追加后会 reopen finalize（见 checkPendingDueCards），使第二次
   * 完成摘要包含重入评分；仅在明确完成按钮/关闭/卸载/新轮次时 deactivate pending。
   */
  useEffect(() => {
    if (!isSessionComplete) return
    if (sessionStats != null) return

    const stats = ensureSessionFinalized(sessionFinalizeRef.current, () =>
      finishProgressSession()
    )
    setSessionStats(stats)
  }, [isSessionComplete, sessionStats, finishProgressSession])

  /** 当前卡片稳定 key（只读/历史均用此身份） */
  const currentCardKey = currentCard ? getReviewCardKey(currentCard) : null
  /** FC-06：已执行锁定动作后返回该卡 → 只读回看 */
  const isCurrentReadOnly =
    currentCardKey != null && isCardReadOnly(currentCardKey, sessionHistory)
  const currentReadOnlyOutcome =
    currentCardKey != null ? getCardOutcome(currentCardKey, sessionHistory) : undefined
  const readOnlyStatusText =
    isCurrentReadOnly && currentReadOnlyOutcome
      ? formatReadOnlyStatus(currentReadOnlyOutcome)
      : isCurrentReadOnly
        ? "只读回看"
        : undefined

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }

  /**
   * 成功动作后延迟切卡：token 仍有效才推进 index。
   * 锁保持到身份真正变化（bindCard effect 作废旧 token），满足
   * 「250ms 动画窗口内不得二次持久化」；失效则安静停止，不推进新卡。
   * isGrading 亦在身份变化时清零。
   */
  const scheduleAdvance = (token: SessionActionToken) => {
    clearAdvanceTimer()
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null
      if (decideAdvanceAfterDelay(actionGateRef.current, token) !== "advance") {
        return
      }
      // 仍持锁推进 index；render 后 bindCard(新 key) 同步作废旧 token
      setCurrentIndex((prev: number) => prev + 1)
    }, 250)
  }

  /** 导航 / 身份变化：作废 in-flight token 并取消切卡 timer */
  const invalidateSessionAction = () => {
    clearAdvanceTimer()
    actionGateRef.current.invalidate()
    setIsGrading(false)
  }

  // F2-05：卡片身份变化时绑定 gate（同 key 不误清 in-flight 锁）
  useEffect(() => {
    const gate = actionGateRef.current
    const previousKey = gate.boundCardKey
    gate.bindCard(currentCardKey)
    // 身份真正变化（跳过/返回/自动剔除/成功切卡）时：
    // 清理悬挂 timer，并结束 isGrading（UI 仅展示，正确性靠 gate）
    if (previousKey !== null && previousKey !== currentCardKey) {
      clearAdvanceTimer()
      setIsGrading(false)
    }
  }, [currentCardKey])

  // F2-05：卸载时作废 token，避免旧 Promise/timer 写已卸载组件
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = null
      }
      actionGateRef.current.invalidate()
    }
  }, [])

  const buildCardLabel = (card: ReviewCard): string => {
    if (card.clozeNumber) return ` [c${card.clozeNumber}]`
    if (card.directionType) {
      return ` [${card.directionType === "forward" ? "→" : "←"}]`
    }
    if (card.listItemIndex && card.listItemIds) {
      return ` [L${card.listItemIndex}/${card.listItemIds.length}]`
    }
    return ""
  }

  const pushHistory = (
    actionKind: ReviewHistoryActionKind,
    options?: { grade?: Grade; card?: ReviewCard; index?: number }
  ) => {
    const card = options?.card ?? currentCard
    if (!card) return
    const entry = buildHistoryEntry({
      cardKey: getReviewCardKey(card),
      actionKind,
      originalIndex: options?.index ?? currentIndex,
      grade: options?.grade,
      cardLabel: buildCardLabel(card)
    })
    setSessionHistory((prev: ReviewSessionHistoryState) =>
      recordHistoryAction(prev, entry)
    )
  }

  const notifyReadOnlyBlocked = (message: string) => {
    console.warn(`[${pluginName}] ${message}`)
    setLastLog(message)
    orca.notify("warn", message, { title: "SRS 复习" })
  }

  const {
    blockLoadError,
    currentCardKey: currentCardKeyForLoad,
    retry: handleRetryBlockLoad
  } = useReviewCardAvailability({
    currentCard,
    nextCard,
    currentIndex,
    pluginName,
    setQueue,
    setLastLog,
    onBeforeDrop: invalidateSessionAction
  })


  // 当切换到新卡片时，重置开始时间
  useEffect(() => {
    setCardStartTime(Date.now())
  }, [currentIndex])

  const counters = useMemo(() => {
    const now = Date.now()
    let due = 0
    let fresh = 0
    for (const card of queue) {
      if (card.isNew) {
        fresh += 1
      } else if (card.srs.due.getTime() <= now) {
        due += 1
      }
    }
    return { due, fresh }
  }, [queue])


  // 动态更新复习队列：定期检查是否有新的到期卡片（受 sessionScope 约束）
  // FC-13：评估过「仅扫描初始收集中的短期将到期候选」——F2-04 pendingDueStateRef 已覆盖
  // Again/Hard 短期重学；新到期/他处变更无完整失效事件，不能可靠替代全库扫描。
  // 故保留 60s 全量 collect；调用成本由 cardCollector 预热/批量牌组预取降低。fixed 仍跳过。
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    
    const checkForNewCards = async () => {
      const scope = sessionScopeRef.current

      // fixed：完全禁用全库动态扫描（不偷偷 collect）
      if (!allowsFullLibraryDynamicScan(scope)) {
        console.log(
          `[${pluginName}] 会话为 fixed scope，跳过自动全库动态检查`
        )
        timeoutId = setTimeout(checkForNewCards, 60000)
        return
      }

      try {
        const { collectReviewCards, buildReviewQueue } = await import("../srs/cardCollector")
        
        // 全量到期候选（不限额）；先 scope 再剩余额度（与手动入口同一 helper）
        const allCards = await collectReviewCards(pluginName)
        const newQueue = buildReviewQueue(allCards, null)
        const budget = sessionBudgetRef.current
        
        // 使用 setQueue 的函数形式来获取最新的队列状态
        setQueue((prevQueue: ReviewCard[]) => {
          const newCards = selectNewDueCardsForSession(
            newQueue,
            prevQueue,
            scope,
            budget
          )
          
          if (newCards.length > 0) {
            console.log(`[${pluginName}] 发现 ${newCards.length} 张新到期卡片，添加到复习队列`)
            setNewCardsAdded((prev: number) => prev + newCards.length)
            setLastLog(`发现 ${newCards.length} 张新到期卡片已加入队列`)
            orca.notify("info", `${newCards.length} 张新卡片已到期`, { 
              title: "SRS 复习"
            })
            return [...prevQueue, ...newCards]
          }
          
          return prevQueue
        })
      } catch (error) {
        console.error(`[${pluginName}] 检查新到期卡片失败:`, error)
        orca.notify("error", "检查新到期卡片失败", { title: "SRS 复习" })
      }
      
      // 安排下一次检查
      timeoutId = setTimeout(checkForNewCards, 60000) // 60秒后再次检查
    }

    // 启动第一次检查（延迟1分钟，避免初始化时立即执行）
    timeoutId = setTimeout(checkForNewCards, 60000)

    // 组件卸载：清理全库扫描 + F2-04 pending timer/状态（避免卸载后 setState）
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      clearPendingDueSession("unmount")
    }
  }, [pluginName]) // 移除 queue 依赖；scope 经 ref 读取，避免每次重置定时器

  const handleGrade = async (grade: Grade) => {
    if (!currentCard) return

    // FC-06 最终 guard：只读回看不得再次评分/推进 List/统计/日志
    const gradeKey = getReviewCardKey(currentCard)
    const gradeGuard = guardSideEffectAction(gradeKey, sessionHistory)
    if (!gradeGuard.allowed) {
      notifyReadOnlyBlocked(gradeGuard.message)
      return
    }

    const isListCard =
      !!currentCard.listItemId &&
      !!currentCard.listItemIndex &&
      !!currentCard.listItemIds

    // F2-05：同步 acquire；同 tick 双击 / 快捷键重复 / 与 postpone·suspend 交叉 → 第二次失败
    const actionKind: SessionActionKind = isRepeatMode
      ? "repeat_grade"
      : isListCard && currentCard.isAuxiliaryPreview
        ? "auxiliary_grade"
        : "grade"
    const token = actionGateRef.current.acquire(gradeKey, actionKind)
    if (!token) {
      // 重复触发：忽略，绝不第二次持久化
      return
    }

    setIsGrading(true)

    console.log(`[SRS Card Demo] 用户选择评分: ${grade}${isRepeatMode ? ' (专项训练模式，不更新SRS)' : ''}`)

    let nextQueue = [...queue]
    let updatedCard = currentCard
    let cardLabel = ""

    if (currentCard.clozeNumber) {
      cardLabel = ` [c${currentCard.clozeNumber}]`
    } else if (currentCard.directionType) {
      cardLabel = ` [${currentCard.directionType === "forward" ? "→" : "←"}]`
    } else if (isListCard) {
      cardLabel = ` [L${currentCard.listItemIndex}/${currentCard.listItemIds!.length}]`
    }

    const releaseGradeToken = () => {
      if (canCommitSessionAction(actionGateRef.current, token)) {
        actionGateRef.current.release(token)
      }
      setIsGrading(false)
    }

    // 重复复习模式（专项训练）：不更新 SRS 状态，只是单纯刷题
    // FC-10：不经 gradeReviewCard，但仍用统一 helper 基于 cardStartTime/单次 now 计有效时长
    if (isRepeatMode) {
      if (!canCommitSessionAction(actionGateRef.current, token)) return
      const repeatNow = Date.now()
      const repeatTiming = computeReviewTiming(cardStartTime, repeatNow)
      setLastLog(`评分 ${grade.toUpperCase()}${cardLabel} (专项训练，不影响复习进度)`)
      setReviewedCount((prev: number) => prev + 1)
      recordProgressEffectiveGrade(grade, repeatTiming.effectiveDuration)

      markParentCardProcessed(
        currentCard.id,
        currentCard.clozeNumber,
        currentCard.directionType,
        currentCard.listItemId
      )

      setQueue(nextQueue)
      // 记录历史；锁保持至 250ms 切卡（勿提前 release）
      pushHistory("repeat_grade", { grade })
      scheduleAdvance(token)
      return
    }

    // 列表卡辅助预览：允许评分，但不计入统计/不更新 SRS/不写日志
    if (isListCard && currentCard.isAuxiliaryPreview) {
      if (!canCommitSessionAction(actionGateRef.current, token)) return
      setLastLog(`评分 ${grade.toUpperCase()}${cardLabel}（辅助预览，不计入统计）`)

      markParentCardProcessed(
        currentCard.id,
        currentCard.clozeNumber,
        currentCard.directionType,
        currentCard.listItemId
      )

      setQueue(nextQueue)
      pushHistory("auxiliary_grade", { grade })
      scheduleAdvance(token)
      return
    }

    const gradeResult = await gradeReviewCard(
      currentCard,
      grade,
      pluginName,
      cardStartTime,
      { updateListProgression: false }
    )

    // await 后：token 失效则安静停止，不得写新卡状态
    if (!canCommitSessionAction(actionGateRef.current, token)) {
      return
    }

    if (!gradeResult.ok) {
      console.error("[SRS Review Session] 评分失败:", gradeResult.error)
      orca.notify("error", `评分失败: ${gradeResult.error}`, { title: "SRS 复习" })
      releaseGradeToken()
      return
    }

    // —— 评分已成功写入：后续 List 失败不得回滚评分，也不得靠 gate 吞错 ——
    updatedCard = gradeResult.updatedCard
    nextQueue[currentIndex] = updatedCard
    setLastLog(
      gradeResult.warning
        ? `${gradeResult.logMessage}（${gradeResult.warning}）`
        : gradeResult.logMessage
    )
    if (gradeResult.warning) {
      orca.notify("error", gradeResult.warning, { title: "SRS 复习" })
    }

    setReviewedCount((prev: number) => prev + 1)
    // FC-10：使用 gradeReviewCard 同源 effectiveDuration，禁止 Hook 无参二次计时
    // 日志失败时 gradeResult 仍含 timing，会话进度仍记录已成功评分时长
    recordProgressEffectiveGrade(grade, gradeResult.timing.effectiveDuration)

    // 子卡片：初始队列已展开；此处只标记已处理，防止 Again 重复处理
    markParentCardProcessed(
      currentCard.id,
      currentCard.clozeNumber,
      currentCard.directionType,
      currentCard.listItemId
    )

    // 列表卡规则：Good/Easy 才解锁下一条；Again/Hard 将后续条目安排到明天，并当日以辅助预览继续
    if (isListCard) {
      try {
        const itemIds = currentCard.listItemIds ?? []
        const currentIdx0 = (currentCard.listItemIndex ?? 1) - 1
        const tomorrow = getTomorrowMidnight()

        const setDue = async (itemId: DbId, due: Date) => {
          await orca.commands.invokeEditorCommand(
            "core.editor.setProperties",
            null,
            [itemId],
            [{ name: "srs.due", type: 5, value: due }]
          )
          invalidateBlockCache(itemId)
        }

        const buildListItemCard = async (
          itemId: DbId,
          index1: number,
          isAux: boolean
        ): Promise<ReviewCard> => {
          const initialDue = index1 === 1 ? getTodayMidnight() : tomorrow
          await ensureCardSrsStateWithInitialDue(itemId, initialDue)
          const srsState = await loadCardSrsState(itemId)
          return {
            id: currentCard.id,
            front: currentCard.front,
            back: currentCard.back,
            srs: srsState,
            isNew: !srsState.lastReviewed || srsState.reps === 0,
            deck: currentCard.deck,
            cardType: "list" as const,
            tags: currentCard.tags,
            listItemId: itemId,
            listItemIndex: index1,
            listItemIds: itemIds,
            isAuxiliaryPreview: isAux
          }
        }

        const existingKeys = new Set(
          nextQueue.slice(currentIndex + 1).map(getReviewCardKey)
        )

        if (grade === "good" || grade === "easy") {
          const nextIdx0 = currentIdx0 + 1
          if (nextIdx0 < itemIds.length) {
            const nextItemId = itemIds[nextIdx0]
            await ensureCardSrsStateWithInitialDue(nextItemId, tomorrow)
            if (!canCommitSessionAction(actionGateRef.current, token)) return
            await setDue(nextItemId, new Date())
            if (!canCommitSessionAction(actionGateRef.current, token)) return

            const nextCard = await buildListItemCard(nextItemId, nextIdx0 + 1, false)
            if (!canCommitSessionAction(actionGateRef.current, token)) return
            if (
              isCardInSessionScope(nextCard, sessionScopeRef.current) &&
              !existingKeys.has(getReviewCardKey(nextCard))
            ) {
              nextQueue.push(nextCard)
            }
          }
        } else if (grade === "again" || grade === "hard") {
          for (let i = currentIdx0 + 1; i < itemIds.length; i++) {
            const itemId = itemIds[i]
            await ensureCardSrsStateWithInitialDue(itemId, tomorrow)
            if (!canCommitSessionAction(actionGateRef.current, token)) return
            const srsState = await loadCardSrsState(itemId)
            if (!canCommitSessionAction(actionGateRef.current, token)) return
            if (srsState.due.getTime() < tomorrow.getTime()) {
              await setDue(itemId, tomorrow)
              if (!canCommitSessionAction(actionGateRef.current, token)) return
            }

            const auxCard = await buildListItemCard(itemId, i + 1, true)
            if (!canCommitSessionAction(actionGateRef.current, token)) return
            if (
              isCardInSessionScope(auxCard, sessionScopeRef.current) &&
              !existingKeys.has(getReviewCardKey(auxCard))
            ) {
              nextQueue.push(auxCard)
              existingKeys.add(getReviewCardKey(auxCard))
            }
          }

          if (canCommitSessionAction(actionGateRef.current, token)) {
            setLastLog(
              `评分 ${grade.toUpperCase()}${cardLabel} -> 后续条目已安排明天，今日以辅助预览继续`
            )
          }
        }
      } catch (listError) {
        // 评分已保存；List 后续处理部分失败 — 可见错误，不回滚评分
        console.error("[SRS Review Session] 评分已保存，但 List 后续处理失败:", listError)
        if (canCommitSessionAction(actionGateRef.current, token)) {
          const msg = `评分已保存，但后续处理失败: ${listError}`
          setLastLog(msg)
          orca.notify("error", msg, { title: "SRS 复习" })
        }
      }
    }

    // 最终提交前再校验：身份已变则不得推进 queue / history / index
    if (!canCommitSessionAction(actionGateRef.current, token)) {
      return
    }

    setQueue(nextQueue)

    // F2-04：仅正式 again/hard + 窗口内 + token 仍有效才 track（repeat/auxiliary 已 early-return）
    const dueTime = updatedCard.srs.due.getTime()
    const now = Date.now()
    if (
      canCommitSessionAction(actionGateRef.current, token) &&
      shouldTrackFormalShortRelearn({
        grade,
        dueTimeMs: dueTime,
        nowMs: now,
        isRepeatMode: false,
        isAuxiliaryPreview: false
      })
    ) {
      trackPendingDueCard(updatedCard, updatedCard.srs.due)
    }

    // 正式评分锁定只读；锁保持至 250ms 切卡完成
    pushHistory("grade", { grade })
    scheduleAdvance(token)
  }

  /**
   * 推迟卡片：将 due 时间设置为明天，不改变 SRS 状态
   * F2-05：与 grade 共享同步 gate，禁止并行写同一卡
   */
  const handlePostpone = async () => {
    if (!currentCard) return

    const postponeKey = getReviewCardKey(currentCard)
    const postponeGuard = guardSideEffectAction(postponeKey, sessionHistory)
    if (!postponeGuard.allowed) {
      notifyReadOnlyBlocked(postponeGuard.message)
      return
    }

    const token = actionGateRef.current.acquire(postponeKey, "postpone")
    if (!token) return

    setIsGrading(true)

    try {
      const postponeBlockId = currentCard.listItemId ?? currentCard.id
      await postponeCard(
        postponeBlockId,
        currentCard.clozeNumber,
        currentCard.directionType
      )

      if (!canCommitSessionAction(actionGateRef.current, token)) {
        return
      }

      const cardLabel = buildCardLabel(currentCard)

      setLastLog(`已推迟${cardLabel}，明天再复习`)
      showNotification("orca-srs", "info", "卡片已推迟，明天再复习", { title: "SRS 复习" })

      emitCardPostponed(postponeBlockId)

      pushHistory("postpone")
      scheduleAdvance(token)
    } catch (error) {
      console.error("[SRS Review Session] 推迟卡片失败:", error)
      if (canCommitSessionAction(actionGateRef.current, token)) {
        orca.notify("error", `推迟失败: ${error}`, { title: "SRS 复习" })
        actionGateRef.current.release(token)
        setIsGrading(false)
      }
    }
  }

  /**
   * 暂停卡片：标记为 suspend 状态，不再出现在复习队列
   * F2-05：与 grade 共享同步 gate
   */
  const handleSuspend = async () => {
    if (!currentCard) return

    const suspendKey = getReviewCardKey(currentCard)
    const suspendGuard = guardSideEffectAction(suspendKey, sessionHistory)
    if (!suspendGuard.allowed) {
      notifyReadOnlyBlocked(suspendGuard.message)
      return
    }

    const token = actionGateRef.current.acquire(suspendKey, "suspend")
    if (!token) return

    setIsGrading(true)

    try {
      await suspendCard(currentCard.id)

      if (!canCommitSessionAction(actionGateRef.current, token)) {
        return
      }

      const cardLabel = buildCardLabel(currentCard)

      setLastLog(`已暂停${cardLabel}`)
      showNotification("orca-srs", "info", "卡片已暂停，可在卡片浏览器中取消暂停", { title: "SRS 复习" })

      emitCardSuspended(currentCard.id)

      pushHistory("suspend")
      scheduleAdvance(token)
    } catch (error) {
      console.error("[SRS Review Session] 暂停卡片失败:", error)
      if (canCommitSessionAction(actionGateRef.current, token)) {
        orca.notify("error", `暂停失败: ${error}`, { title: "SRS 复习" })
        actionGateRef.current.release(token)
        setIsGrading(false)
      }
    }
  }

  /**
   * 跳过卡片：不评分，不改变 SRS/进度；返回后仍允许评分
   * F2-05：作废 in-flight 动作 token 与切卡 timer
   */
  const handleSkip = () => {
    if (!currentCard || isGrading || actionGateRef.current.locked) return
    // 只读回看应走 handleContinue，不应把 continue 记成 skip
    if (isCurrentReadOnly) {
      handleContinue()
      return
    }

    const cardLabel = buildCardLabel(currentCard)
    setLastLog(`已跳过${cardLabel}`)

    invalidateSessionAction()
    pushHistory("skip")
    setCurrentIndex((prev: number) => prev + 1)
  }

  /**
   * FC-06 只读回看中的「继续」：回到后续流程，不覆盖 locking outcome
   * F2-05：作废旧 token / timer
   */
  const handleContinue = () => {
    if (!currentCard || isGrading || actionGateRef.current.locked || !currentCardKey) {
      return
    }
    invalidateSessionAction()
    const result = continueFromReadOnly(sessionHistory, currentCardKey, currentIndex)
    setSessionHistory(result.state)
    setLastLog("继续复习")
    setCurrentIndex(result.nextIndex)
  }

  /**
   * 手动检查新到期卡片（与自动刷新共用 selectNewDueCardsForSession）
   */
  const handleCheckNewCards = async () => {
    const scope = sessionScopeRef.current

    // fixed：禁用全库扫描，明确提示用户
    if (!allowsFullLibraryDynamicScan(scope)) {
      setLastLog(FIXED_SCOPE_NO_DYNAMIC_SCAN_MESSAGE)
      orca.notify("info", FIXED_SCOPE_NO_DYNAMIC_SCAN_MESSAGE, { title: "SRS 复习" })
      return
    }

    try {
      const { collectReviewCards, buildReviewQueue } = await import("../srs/cardCollector")
      
      // 全量到期候选（不限额）；先 scope 再剩余额度（与自动入口同一 helper）
      const allCards = await collectReviewCards(pluginName)
      const newQueue = buildReviewQueue(allCards, null)
      const budget = sessionBudgetRef.current
      
      // 使用 setQueue 的函数形式来获取最新的队列状态，避免闭包问题
      let foundNewCards = 0
      setQueue((prevQueue: ReviewCard[]) => {
        const newCards = selectNewDueCardsForSession(
          newQueue,
          prevQueue,
          scope,
          budget
        )
        
        foundNewCards = newCards.length
        
        if (newCards.length > 0) {
          console.log(`[${pluginName}] 手动检查发现 ${newCards.length} 张新到期卡片`)
          setNewCardsAdded((prev: number) => prev + newCards.length)
          setLastLog(`手动检查发现 ${newCards.length} 张新到期卡片已加入队列`)
          return [...prevQueue, ...newCards]
        }
        
        return prevQueue
      })
      
      // 显示通知（在 setQueue 回调外部）
      if (foundNewCards > 0) {
        orca.notify("success", `发现 ${foundNewCards} 张新到期卡片`, { 
          title: "SRS 复习"
        })
      } else {
        setLastLog("暂无新到期卡片")
        orca.notify("info", "暂无新到期卡片", { 
          title: "SRS 复习"
        })
      }
    } catch (error) {
      console.error(`[${pluginName}] 手动检查新到期卡片失败:`, error)
      setLastLog("检查新卡片失败")
      orca.notify("error", "检查新卡片失败", { title: "SRS 复习" })
    }
  }

  /**
   * 回到上一张卡片（按 cardKey 定位；缺失则 warn 并安全跳过该项）
   * F2-05：作废 in-flight token 与切卡 timer，防止旧 Promise 改新卡
   */
  const handlePrevious = () => {
    if (
      !historyCanGoPrevious(sessionHistory) ||
      isGrading ||
      actionGateRef.current.locked
    ) {
      return
    }

    invalidateSessionAction()

    const result = navigatePrevious(sessionHistory, queue, getReviewCardKey)
    setSessionHistory(result.state)

    for (const w of result.warnings) {
      console.warn(`[${pluginName}] ${w}`)
    }

    if (!result.ok) {
      const msg = result.message
      setLastLog(msg)
      orca.notify("warn", msg, { title: "SRS 复习" })
      return
    }

    if (result.warnings.length > 0) {
      const warnMsg = result.warnings[result.warnings.length - 1]!
      orca.notify("warn", warnMsg, { title: "SRS 复习" })
    }

    setCurrentIndex(result.index)
    const outcome = getCardOutcome(result.entry.cardKey, result.state)
    if (outcome && outcome.actionKind !== "skip") {
      setLastLog(`返回上一张 · ${formatReadOnlyStatus(outcome)}`)
    } else {
      setLastLog("返回上一张")
    }
  }

  // 是否可以回到上一张（isGrading 仅 UI；锁住时也禁用）
  const canGoPrevious =
    historyCanGoPrevious(sessionHistory) &&
    !isGrading &&
    !actionGateRef.current.locked

  const handleJumpToCard = (blockId: DbId, shiftKey?: boolean) => {
    if (onJumpToCard) {
      onJumpToCard(blockId, shiftKey)
      return
    }
    console.log(`[SRS Review Session] 跳转到卡片 #${blockId}, shiftKey: ${shiftKey}`)
    orca.nav.goTo("block", { blockId })
    showNotification(
      "orca-srs",
      "info",
      "已跳转到卡片，复习界面仍然保留",
      { title: "SRS 复习" }
    )
  }

  const handleFinishSession = () => {
    // F2-04：明确完成时先停用 pending，再关会话
    clearPendingDueSession("finish")
    // 优先用已生成的 sessionStats；极端早于 effect 的点击走一次性 finalize（仍只 finish 一次）
    const stats =
      sessionStats ??
      ensureSessionFinalized(sessionFinalizeRef.current, () => finishProgressSession())
    if (sessionStats == null) {
      setSessionStats(stats)
    }

    console.log(`[SRS Review Session] 本次复习结束，共复习 ${stats.totalReviewed} 张卡片`)

    showNotification(
      "orca-srs",
      "success",
      `本次复习完成！共复习了 ${stats.totalReviewed} 张卡片`,
      { title: "SRS 复习会话" }
    )

    // finish 已清理 progress；abandon 幂等；随后 Renderer onClose flush
    try {
      abandonProgressSession()
    } catch (error) {
      console.warn("[SRS Review Session] 完成时二次清理会话进度失败（仍继续关闭）:", error)
    }
    if (onClose) {
      void Promise.resolve(onClose())
    }
  }

  if (totalCards === 0) {
    return (
      <ReviewSessionEmptyView
        inSidePanel={inSidePanel}
        onClose={handleRequestClose}
      />
    )
  }

  if (isSessionComplete) {
    return (
      <ReviewSessionCompletedView
        stats={sessionStats}
        inSidePanel={inSidePanel}
        isRepeatMode={isRepeatMode}
        currentRound={currentRound}
        onRepeatRound={onRepeatRound}
        onFinish={handleFinishSession}
        onClose={handleRequestClose}
      />
    )
  }

  return (
    <ReviewSessionActiveView
      containerRef={containerRef}
      inSidePanel={inSidePanel}
      isMaximized={isMaximized}
      currentIndex={currentIndex}
      totalCards={totalCards}
      counters={counters}
      newCardsAdded={newCardsAdded}
      lastLog={lastLog}
      blockLoadError={blockLoadError}
      currentCardKey={currentCardKeyForLoad}
      childExpandWarning={childExpandWarning}
      currentCard={currentCard}
      nextCard={nextCard}
      isCurrentReadOnly={isCurrentReadOnly}
      readOnlyStatusText={readOnlyStatusText}
      isGrading={isGrading}
      canGoPrevious={canGoPrevious}
      isRepeatMode={isRepeatMode}
      currentRound={currentRound}
      panelId={panelId}
      pluginName={pluginName}
      onGrade={handleGrade}
      onPostpone={handlePostpone}
      onSuspend={handleSuspend}
      onClose={handleRequestClose}
      onSkip={handleSkip}
      onContinue={handleContinue}
      onPrevious={handlePrevious}
      onJumpToCard={handleJumpToCard}
      onRetryBlockLoad={handleRetryBlockLoad}
      onCheckNewCards={handleCheckNewCards}
    />
  )
}
