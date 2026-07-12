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
import {
  formatDuration,
  formatAccuracyRate,
  computeReviewTiming
} from "../srs/sessionProgressTracker"
import {
  createSessionFinalizeController,
  ensureSessionFinalized,
  resetSessionFinalizeController
} from "../srs/sessionProgressFinalize"
import { useSessionProgressTracker } from "../hooks/useSessionProgressTracker"
import {
  allowsFullLibraryDynamicScan,
  createAllScope,
  FIXED_SCOPE_NO_DYNAMIC_SCAN_MESSAGE,
  isCardInSessionScope,
  selectNewDueCardsForSession,
  selectPendingDueCardsForRequeue,
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
import SrsCardDemo from "./SrsCardDemo"
import GradeDistributionBar from "./GradeDistributionBar"

// 从全局 window 对象获取 React（Orca 插件约定）
const { useEffect, useMemo, useRef, useState } = window.React
const { useSnapshot } = window.Valtio
const { Button, ModalOverlay } = orca.components

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
  onRepeatRound
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

  // 使用会话进度追踪 Hook（FC-09：scoped key，不自动恢复；FC-10：有效时长由评分同源传入）
  const {
    progressState,
    accuracyRate,
    recordEffectiveGrade: recordProgressEffectiveGrade,
    resetSession: resetProgressSession,
    finishSession: finishProgressSession,
    abandonSession: abandonProgressSession,
  } = useSessionProgressTracker({
    autoSave: true,
    storageKey: progressStorageKey
  })

  /**
   * 统一关闭入口：先清理 scoped 会话进度，再走 Renderer async onClose flush。
   * 完成 / 主动关闭 / Modal overlay / 卡片关闭按钮均走此路径。
   * 清理失败仅 warn，不阻断 flush / close。
   */
  const handleRequestClose = () => {
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

  // 当最大化状态变化时，设置父级 .orca-block-editor 的 maximize 属性并隐藏 query tabs
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 查找父级 .orca-block-editor 元素
    const blockEditor = container.closest('.orca-block-editor') as HTMLElement | null
    if (!blockEditor) return

    // 查找需要隐藏的元素（编辑器级别）
    const noneEditableEl = blockEditor.querySelector('.orca-block-editor-none-editable') as HTMLElement | null
    const goBtns = blockEditor.querySelector('.orca-block-editor-go-btns') as HTMLElement | null
    const sidetools = blockEditor.querySelector('.orca-block-editor-sidetools') as HTMLElement | null
    // 注意：不隐藏 .orca-panel-drag-handle，保持面板拖拽手柄可见

    // 查找 repr 级别需要隐藏的元素（块手柄、折叠按钮等）
    const reprNoneEditable = blockEditor.querySelector('.orca-repr-main-none-editable') as HTMLElement | null
    const breadcrumb = blockEditor.querySelector('.orca-breadcrumb') as HTMLElement | null

    if (isMaximized) {
      blockEditor.setAttribute('maximize', '1')
      // 隐藏 query tabs 区域和其他工具栏
      if (noneEditableEl) noneEditableEl.style.display = 'none'
      if (goBtns) goBtns.style.display = 'none'
      if (sidetools) sidetools.style.display = 'none'
      // 隐藏块手柄和折叠按钮（在 repr 层级）
      if (reprNoneEditable) reprNoneEditable.style.display = 'none'
      if (breadcrumb) breadcrumb.style.display = 'none'
      
      // 修改 4：批量隐藏块手柄、bullet、拖拽手柄、折叠按钮
      const blockHandles = blockEditor.querySelectorAll('.orca-block-handle, .orca-repr-handle')
      blockHandles.forEach((el: Element) => {
        (el as HTMLElement).style.display = 'none'
      })
      
      const bullets = blockEditor.querySelectorAll('.orca-block-bullet, [data-role="bullet"]')
      bullets.forEach((el: Element) => {
        (el as HTMLElement).style.display = 'none'
      })
      
      const dragHandles = blockEditor.querySelectorAll('.orca-block-drag-handle')
      dragHandles.forEach((el: Element) => {
        (el as HTMLElement).style.display = 'none'
      })
      
      const collapseButtons = blockEditor.querySelectorAll('.orca-repr-collapse, [class*="collapse"]')
      collapseButtons.forEach((el: Element) => {
        (el as HTMLElement).style.display = 'none'
      })
    } else {
      blockEditor.removeAttribute('maximize')
      // 恢复显示所有被隐藏的元素
      if (noneEditableEl) noneEditableEl.style.display = ''
      if (goBtns) goBtns.style.display = ''
      if (sidetools) sidetools.style.display = ''
      if (reprNoneEditable) reprNoneEditable.style.display = ''
      if (breadcrumb) breadcrumb.style.display = ''
      
      // 恢复所有被隐藏的块UI元素
      const blockHandles = blockEditor.querySelectorAll('.orca-block-handle, .orca-repr-handle')
      blockHandles.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
      
      const bullets = blockEditor.querySelectorAll('.orca-block-bullet, [data-role="bullet"]')
      bullets.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
      
      const dragHandles = blockEditor.querySelectorAll('.orca-block-drag-handle')
      dragHandles.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
      
      const collapseButtons = blockEditor.querySelectorAll('.orca-repr-collapse, [class*="collapse"]')
      collapseButtons.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
    }

    // 清理函数：组件卸载时恢复原状
    return () => {
      blockEditor.removeAttribute('maximize')
      if (noneEditableEl) noneEditableEl.style.display = ''
      if (goBtns) goBtns.style.display = ''
      if (sidetools) sidetools.style.display = ''
      if (reprNoneEditable) reprNoneEditable.style.display = ''
      if (breadcrumb) breadcrumb.style.display = ''
      
      // 恢复所有被隐藏的块UI元素
      const blockHandles = blockEditor.querySelectorAll('.orca-block-handle, .orca-repr-handle')
      blockHandles.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
      
      const bullets = blockEditor.querySelectorAll('.orca-block-bullet, [data-role="bullet"]')
      bullets.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
      
      const dragHandles = blockEditor.querySelectorAll('.orca-block-drag-handle')
      dragHandles.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
      
      const collapseButtons = blockEditor.querySelectorAll('.orca-repr-collapse, [class*="collapse"]')
      collapseButtons.forEach((el: Element) => {
        (el as HTMLElement).style.display = ''
      })
    }
  }, [isMaximized])

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

  // 订阅当前卡片相关的块，便于在“块被删除/卸载”时触发自动剔除逻辑
  const snapshot = useSnapshot(orca.state)
  const currentCardBlock = currentCard ? snapshot?.blocks?.[currentCard.id] : null
  const currentListItemBlock = currentCard?.listItemId
    ? snapshot?.blocks?.[currentCard.listItemId]
    : null

  /**
   * 确保当前卡片相关的块已加载
   * - 如果只是未加载：尝试从后端拉取并写入 orca.state.blocks，避免被误判为“已删除”
   * - 如果确实不存在（被删除）：从队列中剔除，不再推送到复习界面
   */
  const autoDroppedCardKeysRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!currentCard) return

    const currentCardKey = getReviewCardKey(currentCard)
    if (autoDroppedCardKeysRef.current.has(currentCardKey)) {
      return
    }

    let cancelled = false

    const ensureBlockLoaded = async (id: DbId): Promise<boolean> => {
      const existing = orca.state.blocks?.[id]
      if (existing) return true

      try {
        const fetched = await orca.invokeBackend("get-block", id)
        if (cancelled) return false
        if (!fetched) return false

        // 将拉取到的块写回 state，供各渲染器复用
        const stateAny = orca.state as any
        if (!stateAny.blocks) stateAny.blocks = {}
        stateAny.blocks[id] = fetched
        return true
      } catch (e) {
        console.warn(`[${pluginName}] 拉取块失败: ${id}`, e)
        return false
      }
    }

    void (async () => {
      const requiredIds: DbId[] = [currentCard.id]
      if (currentCard.listItemId) {
        requiredIds.push(currentCard.listItemId)
      }

      for (const id of requiredIds) {
        const ok = await ensureBlockLoaded(id)
        if (cancelled) return
        if (!ok) {
          autoDroppedCardKeysRef.current.add(currentCardKey)
          console.log(`[${pluginName}] 卡片对应块不存在，自动剔除: ${currentCardKey}`)

          // 从队列中移除当前卡片，让下一张卡片顶上来（不要求用户手动“跳过”）
          setQueue((prevQueue: ReviewCard[]) => {
            if (currentIndex < 0 || currentIndex >= prevQueue.length) return prevQueue
            const keyAtIndex = getReviewCardKey(prevQueue[currentIndex]!)
            if (keyAtIndex !== currentCardKey) return prevQueue
            return [...prevQueue.slice(0, currentIndex), ...prevQueue.slice(currentIndex + 1)]
          })

          // FC-06：历史按 cardKey 定位，删除队列项后无需改写索引；
          // 返回时若 key 已不在队列会 warn 并安全跳过。

          setLastLog("已自动跳过不存在的卡片")
          return
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    currentCard?.id,
    currentCard?.listItemId,
    currentIndex,
    pluginName,
    currentCardBlock,
    currentListItemBlock
  ])

  // 预缓存下一张卡片的块数据，防止切换时闪烁
  useEffect(() => {
    if (nextCard?.id) {
      // 触发 Orca 加载下一张卡片的块数据
      // 通过访问 orca.state.blocks[nextCard.id] 来预加载
      const block = orca.state.blocks?.[nextCard.id]
      if (!block) {
        // 如果块数据不存在，尝试通过 API 预加载
        void (async () => {
          try {
            const fetched = await orca.invokeBackend("get-block", nextCard.id)
            if (!fetched) return
            const stateAny = orca.state as any
            if (!stateAny.blocks) stateAny.blocks = {}
            stateAny.blocks[nextCard.id] = fetched
            console.log(`[SRS Review Session] 已预缓存下一张卡片: ${nextCard.id}`)
          } catch (e) {
            console.warn(`[SRS Review Session] 预缓存失败: ${nextCard.id}`, e)
          }
        })()
      }
    }
  }, [nextCard?.id])

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

  // 追踪即将到期的卡片（评分为 Again 后 1 分钟内到期的卡片）
  const pendingDueCardsRef = useRef<Map<string, { card: ReviewCard, dueTime: number }>>(new Map())
  // 短期卡片检查定时器 ID
  const pendingCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 当前索引的 ref（用于在定时器回调中获取最新值）
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex

  // 检查待到期卡片的函数
  const checkPendingDueCards = () => {
    const now = Date.now()
    const pendingCards = pendingDueCardsRef.current
    const dueCards: ReviewCard[] = []
    const scope = sessionScopeRef.current
    
    console.log(`[${pluginName}] 检查待到期卡片，当前追踪 ${pendingCards.size} 张`)
    
    // 检查哪些卡片已经到期
    for (const [cardKey, { card, dueTime }] of pendingCards.entries()) {
      console.log(`[${pluginName}] 检查卡片 ${cardKey}: dueTime=${dueTime}, now=${now}, diff=${dueTime - now}ms`)
      if (now >= dueTime) {
        dueCards.push(card)
        pendingCards.delete(cardKey)
        console.log(`[${pluginName}] 卡片 ${cardKey} 已到期，准备加入队列`)
      }
    }
    
    // 防御性：scope + 已接纳额度（短期重学同一身份不重复消耗）
    const budget = sessionBudgetRef.current
    const inScopeDueCards = selectPendingDueCardsForRequeue(dueCards, scope, budget)
    if (dueCards.length > 0 && inScopeDueCards.length < dueCards.length) {
      console.warn(
        `[${pluginName}] ${dueCards.length - inScopeDueCards.length} 张短期到期卡因 scope/额度被跳过`
      )
    }

    if (inScopeDueCards.length > 0) {
      console.log(`[${pluginName}] ${inScopeDueCards.length} 张短期卡片已到期，添加到复习队列`)
      
      // 检查是否已在**整个队列**中（防止同一张卡片在一次会话中被多次添加）
      setQueue((prevQueue: ReviewCard[]) => {
        // 检查整个队列，而不仅仅是 currentIndex 之后的部分
        // 这样可以防止同一张卡片在一次会话中被多次复习
        const existingKeys = new Set(prevQueue.map((c: ReviewCard) => getReviewCardKey(c)))
        
        const newCards = inScopeDueCards.filter((c: ReviewCard) => !existingKeys.has(getReviewCardKey(c)))
        
        if (newCards.length > 0) {
          setNewCardsAdded((prev: number) => prev + newCards.length)
          setLastLog(`${newCards.length} 张卡片已到期，加入队列`)
          orca.notify("info", `${newCards.length} 张卡片已到期`, { title: "SRS 复习" })
          console.log(`[${pluginName}] 成功添加 ${newCards.length} 张卡片到队列末尾`)
          return [...prevQueue, ...newCards]
        }
        console.log(`[${pluginName}] 卡片已在队列中，跳过添加`)
        return prevQueue
      })
    }
    
    // 如果还有待检查的卡片，继续定时检查
    if (pendingCards.size > 0) {
      // 找到最近的到期时间
      let nearestDue = Infinity
      for (const { dueTime } of pendingCards.values()) {
        if (dueTime < nearestDue) nearestDue = dueTime
      }
      const delay = Math.max(1000, nearestDue - now + 500) // 至少 1 秒，到期后多等 500ms
      console.log(`[${pluginName}] 还有 ${pendingCards.size} 张待检查卡片，${delay}ms 后再次检查`)
      pendingCheckTimeoutRef.current = setTimeout(checkPendingDueCards, delay)
    } else {
      pendingCheckTimeoutRef.current = null
    }
  }
  
  // 当评分为 Again 时，将卡片添加到待检查列表
  const trackPendingDueCard = (card: ReviewCard, dueTime: Date) => {
    // 防御性：不在会话 scope 内的卡不进入 pending 追踪
    if (!isCardInSessionScope(card, sessionScopeRef.current)) {
      console.warn(
        `[${pluginName}] 跳过追踪 scope 外的短期到期卡: ${getReviewCardKey(card)}`
      )
      return
    }

    const cardKey = getReviewCardKey(card)
    const dueTimestamp = dueTime.getTime()
    const now = Date.now()
    
    // 只追踪 5 分钟内到期的卡片
    if (dueTimestamp - now <= 5 * 60 * 1000) {
      pendingDueCardsRef.current.set(cardKey, { card, dueTime: dueTimestamp })
      const delaySeconds = Math.round((dueTimestamp - now) / 1000)
      console.log(`[${pluginName}] 追踪短期到期卡片: ${cardKey}, 将在 ${delaySeconds} 秒后到期`)
      setLastLog(`卡片将在 ${delaySeconds} 秒后重新加入队列`)
      
      // 如果没有正在运行的检查定时器，启动一个
      if (!pendingCheckTimeoutRef.current) {
        const delay = Math.max(1000, dueTimestamp - now + 500)
        console.log(`[${pluginName}] 启动定时器，${delay}ms 后检查`)
        pendingCheckTimeoutRef.current = setTimeout(checkPendingDueCards, delay)
      }
    }
  }

  // 动态更新复习队列：定期检查是否有新的到期卡片（受 sessionScope 约束）
  // FC-13：评估过「仅扫描初始收集中的短期将到期候选」——pendingDueCardsRef 已覆盖
  // Again 短期重学；新到期/他处变更无完整失效事件，不能可靠替代全库扫描。
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

    // 组件卸载时清理定时器
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (pendingCheckTimeoutRef.current) {
        clearTimeout(pendingCheckTimeoutRef.current)
        pendingCheckTimeoutRef.current = null
      }
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

    setIsGrading(true)

    console.log(`[SRS Card Demo] 用户选择评分: ${grade}${isRepeatMode ? ' (专项训练模式，不更新SRS)' : ''}`)

    let nextQueue = [...queue]
    let updatedCard = currentCard
    let cardLabel = ""
    const isListCard = !!currentCard.listItemId && !!currentCard.listItemIndex && !!currentCard.listItemIds

    if (currentCard.clozeNumber) {
      cardLabel = ` [c${currentCard.clozeNumber}]`
    } else if (currentCard.directionType) {
      cardLabel = ` [${currentCard.directionType === "forward" ? "→" : "←"}]`
    } else if (isListCard) {
      cardLabel = ` [L${currentCard.listItemIndex}/${currentCard.listItemIds!.length}]`
    }

    // 重复复习模式（专项训练）：不更新 SRS 状态，只是单纯刷题
    // FC-10：不经 gradeReviewCard，但仍用统一 helper 基于 cardStartTime/单次 now 计有效时长
    if (isRepeatMode) {
      const repeatNow = Date.now()
      const repeatTiming = computeReviewTiming(cardStartTime, repeatNow)
      setLastLog(`评分 ${grade.toUpperCase()}${cardLabel} (专项训练，不影响复习进度)`)
      setReviewedCount((prev: number) => prev + 1)
      recordProgressEffectiveGrade(grade, repeatTiming.effectiveDuration)

      // 标记父卡片为已处理
      markParentCardProcessed(
        currentCard.id,
        currentCard.clozeNumber,
        currentCard.directionType,
        currentCard.listItemId
      )

      // 更新队列
      setQueue(nextQueue)

      setIsGrading(false)
      // 记录历史并前进（repeat_grade 锁定只读，虽不写 SRS）
      pushHistory("repeat_grade", { grade })
      setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
      return
    }

    // 列表卡辅助预览：允许评分，但不计入统计/不更新 SRS/不写日志
    if (isListCard && currentCard.isAuxiliaryPreview) {
      setLastLog(`评分 ${grade.toUpperCase()}${cardLabel}（辅助预览，不计入统计）`)

      markParentCardProcessed(
        currentCard.id,
        currentCard.clozeNumber,
        currentCard.directionType,
        currentCard.listItemId
      )

      setQueue(nextQueue)
      setIsGrading(false)
      pushHistory("auxiliary_grade", { grade })
      setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
      return
    }

    const gradeResult = await gradeReviewCard(
      currentCard,
      grade,
      pluginName,
      cardStartTime,
      { updateListProgression: false }
    )
    if (!gradeResult.ok) {
      console.error("[SRS Review Session] 评分失败:", gradeResult.error)
      orca.notify("error", `评分失败: ${gradeResult.error}`, { title: "SRS 复习" })
      setIsGrading(false)
      return
    }

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

    // 子卡片处理说明：
    // 初始队列已经通过 buildReviewQueueWithChildren 展开了子卡片链
    // 例如：[A1, B, C, D, A2, B, C, D]
    // 
    // 这里只需要标记当前卡片为已处理，防止 Again 按钮导致的重复处理
    // 不再需要动态插入子卡片
    markParentCardProcessed(
      currentCard.id,
      currentCard.clozeNumber,
      currentCard.directionType,
      currentCard.listItemId
    )

    // 列表卡规则：Good/Easy 才解锁下一条；Again/Hard 将后续条目安排到明天，并当日以辅助预览继续
    if (isListCard) {
      const itemIds = currentCard.listItemIds ?? []
      const currentIdx0 = (currentCard.listItemIndex ?? 1) - 1
      const tomorrow = getTomorrowMidnight()

      // 工具：写入 due（仅改 due，不改其他参数）
      const setDue = async (itemId: DbId, due: Date) => {
        await orca.commands.invokeEditorCommand(
          "core.editor.setProperties",
          null,
          [itemId],
          [{ name: "srs.due", type: 5, value: due }]
        )
        invalidateBlockCache(itemId)
      }

      // 工具：构建列表条目卡片
      const buildListItemCard = async (
        itemId: DbId,
        index1: number,
        isAux: boolean
      ): Promise<ReviewCard> => {
        // 初始化缺失的 SRS（第 1 条今天，其余明天）
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
          // FC-02 fixed List 规则依赖 cardType:"list"；动态构造必须显式带上
          cardType: "list" as const,
          tags: currentCard.tags,
          listItemId: itemId,
          listItemIndex: index1,
          listItemIds: itemIds,
          isAuxiliaryPreview: isAux
        }
      }

      const existingKeys = new Set(nextQueue.slice(currentIndex + 1).map(getReviewCardKey))

      if (grade === "good" || grade === "easy") {
        const nextIdx0 = currentIdx0 + 1
        if (nextIdx0 < itemIds.length) {
          const nextItemId = itemIds[nextIdx0]
          // 解锁下一条：将 due 调整为现在，使其当天进入正式复习
          await ensureCardSrsStateWithInitialDue(nextItemId, tomorrow)
          await setDue(nextItemId, new Date())

          const nextCard = await buildListItemCard(nextItemId, nextIdx0 + 1, false)
          // 同根 List 条目：scope helper 应允许 fixed 根卡后续 listItemId
          if (
            isCardInSessionScope(nextCard, sessionScopeRef.current) &&
            !existingKeys.has(getReviewCardKey(nextCard))
          ) {
            nextQueue.push(nextCard)
          }
        }
      } else if (grade === "again" || grade === "hard") {
        // 后续条目：若 due 早于明天零点，则推迟到明天零点
        for (let i = currentIdx0 + 1; i < itemIds.length; i++) {
          const itemId = itemIds[i]
          await ensureCardSrsStateWithInitialDue(itemId, tomorrow)
          const srsState = await loadCardSrsState(itemId)
          if (srsState.due.getTime() < tomorrow.getTime()) {
            await setDue(itemId, tomorrow)
          }

          const auxCard = await buildListItemCard(itemId, i + 1, true)
          if (
            isCardInSessionScope(auxCard, sessionScopeRef.current) &&
            !existingKeys.has(getReviewCardKey(auxCard))
          ) {
            nextQueue.push(auxCard)
            existingKeys.add(getReviewCardKey(auxCard))
          }
        }

        setLastLog(`评分 ${grade.toUpperCase()}${cardLabel} -> 后续条目已安排明天，今日以辅助预览继续`)
      }
    }
    
    // 更新队列
    setQueue(nextQueue)
    
    // 如果评分为 Again 或 Hard，且卡片在 5 分钟内到期，追踪它以便自动加入队列
    const dueTime = updatedCard.srs.due.getTime()
    const now = Date.now()
    if ((grade === "again" || grade === "hard") && dueTime - now <= 5 * 60 * 1000) {
      trackPendingDueCard(updatedCard, updatedCard.srs.due)
    }
    
    setIsGrading(false)
    // 记录历史并前进（正式评分锁定只读）
    pushHistory("grade", { grade })
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }

  /**
   * 推迟卡片：将 due 时间设置为明天，不改变 SRS 状态
   */
  const handlePostpone = async () => {
    if (!currentCard || isGrading) return

    const postponeKey = getReviewCardKey(currentCard)
    const postponeGuard = guardSideEffectAction(postponeKey, sessionHistory)
    if (!postponeGuard.allowed) {
      notifyReadOnlyBlocked(postponeGuard.message)
      return
    }

    setIsGrading(true)

    try {
      const postponeBlockId = currentCard.listItemId ?? currentCard.id
      await postponeCard(
        postponeBlockId,
        currentCard.clozeNumber,
        currentCard.directionType
      )

      const cardLabel = buildCardLabel(currentCard)

      setLastLog(`已推迟${cardLabel}，明天再复习`)
      showNotification("orca-srs", "info", "卡片已推迟，明天再复习", { title: "SRS 复习" })

      // 通知其他组件静默刷新
      emitCardPostponed(postponeBlockId)

      setIsGrading(false)
      pushHistory("postpone")
      setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
    } catch (error) {
      console.error("[SRS Review Session] 推迟卡片失败:", error)
      orca.notify("error", `推迟失败: ${error}`, { title: "SRS 复习" })
      setIsGrading(false)
    }
  }

  /**
   * 暂停卡片：标记为 suspend 状态，不再出现在复习队列
   */
  const handleSuspend = async () => {
    if (!currentCard || isGrading) return

    const suspendKey = getReviewCardKey(currentCard)
    const suspendGuard = guardSideEffectAction(suspendKey, sessionHistory)
    if (!suspendGuard.allowed) {
      notifyReadOnlyBlocked(suspendGuard.message)
      return
    }

    setIsGrading(true)

    try {
      await suspendCard(currentCard.id)

      const cardLabel = buildCardLabel(currentCard)

      setLastLog(`已暂停${cardLabel}`)
      showNotification("orca-srs", "info", "卡片已暂停，可在卡片浏览器中取消暂停", { title: "SRS 复习" })

      // 通知其他组件静默刷新
      emitCardSuspended(currentCard.id)

      setIsGrading(false)
      pushHistory("suspend")
      setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
    } catch (error) {
      console.error("[SRS Review Session] 暂停卡片失败:", error)
      orca.notify("error", `暂停失败: ${error}`, { title: "SRS 复习" })
      setIsGrading(false)
    }
  }

  /**
   * 跳过卡片：不评分，不改变 SRS/进度；返回后仍允许评分
   */
  const handleSkip = () => {
    if (!currentCard || isGrading) return
    // 只读回看应走 handleContinue，不应把 continue 记成 skip
    if (isCurrentReadOnly) {
      handleContinue()
      return
    }

    const cardLabel = buildCardLabel(currentCard)
    setLastLog(`已跳过${cardLabel}`)

    pushHistory("skip")
    setCurrentIndex((prev: number) => prev + 1)
  }

  /**
   * FC-06 只读回看中的「继续」：回到后续流程，不覆盖 locking outcome
   */
  const handleContinue = () => {
    if (!currentCard || isGrading || !currentCardKey) return
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
   */
  const handlePrevious = () => {
    if (!historyCanGoPrevious(sessionHistory) || isGrading) return

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

  // 是否可以回到上一张
  const canGoPrevious = historyCanGoPrevious(sessionHistory) && !isGrading

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
    const emptyContent = (
      <div style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "32px",
        maxWidth: "480px",
        width: "100%",
        textAlign: "center",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
      }}>
        <h3 style={{ marginBottom: "12px" }}>今天没有到期或新卡</h3>
        <div style={{ color: "var(--orca-color-text-2)", marginBottom: "20px" }}>
          请先创建或等待卡片到期，然后再次开始复习
        </div>
        {onClose && (
          <Button variant="solid" onClick={handleRequestClose}>关闭</Button>
        )}
      </div>
    )

    if (inSidePanel) {
      return (
        <div style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px"
        }}>
          {emptyContent}
        </div>
      )
    }

    return (
      <ModalOverlay visible={true} canClose={true} onClose={handleRequestClose}>
        {emptyContent}
      </ModalOverlay>
    )
  }

  // ========================================
  // 渲染：复习结束界面（纯读取 sessionStats，不在 render 中 finish）
  // ========================================
  if (isSessionComplete) {
    // 极短窗口：effect 尚未写入 sessionStats
    if (sessionStats == null) {
      const summarizingContent = (
        <div className="srs-session-complete-container" style={{
          backgroundColor: "var(--orca-color-bg-1)",
          borderRadius: "12px",
          padding: "32px 48px",
          maxWidth: "520px",
          width: "100%",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          textAlign: "center"
        }}>
          <div style={{
            fontSize: "16px",
            color: "var(--orca-color-text-2)"
          }}>
            正在汇总...
          </div>
        </div>
      )

      if (inSidePanel) {
        return (
          <div style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px"
          }}>
            {summarizingContent}
          </div>
        )
      }

      return (
        <ModalOverlay
          visible={true}
          canClose={true}
          onClose={handleRequestClose}
          className="srs-session-complete-modal"
        >
          {summarizingContent}
        </ModalOverlay>
      )
    }

    const stats = sessionStats

    const completeContent = (
      <div className="srs-session-complete-container" style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "32px 48px",
        maxWidth: "520px",
        width: "100%",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        textAlign: "center"
      }}>
        <div style={{
          fontSize: "56px",
          marginBottom: "16px"
        }}>
          🎉
        </div>

        <h2 style={{
          fontSize: "22px",
          fontWeight: "600",
          color: "var(--orca-color-text-1)",
          marginBottom: "24px"
        }}>
          {isRepeatMode ? `第 ${currentRound} 轮复习结束！` : "本次复习结束！"}
        </h2>

        {/* 统计摘要 */}
        <div style={{
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
          textAlign: "left"
        }}>
          {/* 核心统计数据 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "16px",
            marginBottom: "20px"
          }}>
            {/* 复习卡片数 */}
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "28px",
                fontWeight: "600",
                color: "var(--orca-color-primary-5)"
              }}>
                {stats.totalReviewed}
              </div>
              <div style={{
                fontSize: "12px",
                color: "var(--orca-color-text-3)",
                marginTop: "4px"
              }}>
                复习卡片
              </div>
            </div>

            {/* 准确率 */}
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "28px",
                fontWeight: "600",
                color: stats.accuracyRate >= 0.8 
                  ? "#22c55e" 
                  : stats.accuracyRate >= 0.6 
                    ? "#f59e0b" 
                    : "#ef4444"
              }}>
                {formatAccuracyRate(stats.accuracyRate)}
              </div>
              <div style={{
                fontSize: "12px",
                color: "var(--orca-color-text-3)",
                marginTop: "4px"
              }}>
                准确率
              </div>
            </div>

            {/* 会话总时长 */}
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "28px",
                fontWeight: "600",
                color: "var(--orca-color-text-1)"
              }}>
                {formatDuration(stats.totalSessionTime)}
              </div>
              <div style={{
                fontSize: "12px",
                color: "var(--orca-color-text-3)",
                marginTop: "4px"
              }}>
                总时长
              </div>
            </div>

            {/* 平均每卡耗时 */}
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "28px",
                fontWeight: "600",
                color: "var(--orca-color-text-1)"
              }}>
                {stats.totalReviewed > 0 
                  ? `${Math.round(stats.averageTimePerCard / 1000)}s`
                  : "0s"
                }
              </div>
              <div style={{
                fontSize: "12px",
                color: "var(--orca-color-text-3)",
                marginTop: "4px"
              }}>
                平均每卡
              </div>
            </div>
          </div>

          {/* 有效复习时长（如果与总时长差异较大才显示） */}
          {stats.totalSessionTime > 0 && 
           stats.effectiveReviewTime < stats.totalSessionTime * 0.9 && (
            <div style={{
              fontSize: "12px",
              color: "var(--orca-color-text-3)",
              textAlign: "center",
              marginBottom: "16px"
            }}>
              有效复习时长: {formatDuration(stats.effectiveReviewTime)}
            </div>
          )}

          {/* 评分分布条 */}
          <div>
            <div style={{
              fontSize: "13px",
              color: "var(--orca-color-text-2)",
              marginBottom: "8px",
              textAlign: "center"
            }}>
              评分分布
            </div>
            <GradeDistributionBar 
              distribution={stats.gradeDistribution} 
              showLabels={true}
              height={28}
            />
          </div>
        </div>

        <div style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          marginBottom: "24px"
        }}>
          坚持复习，持续进步！
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          {isRepeatMode && onRepeatRound && (
            <Button
              variant="outline"
              onClick={onRepeatRound}
              style={{
                padding: "12px 24px",
                fontSize: "16px"
              }}
            >
              再复习一轮
            </Button>
          )}
          <Button
            variant="solid"
            onClick={handleFinishSession}
            style={{
              padding: "12px 32px",
              fontSize: "16px"
            }}
          >
            完成
          </Button>
        </div>
      </div>
    )

    if (inSidePanel) {
      return (
        <div style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px"
        }}>
          {completeContent}
        </div>
      )
    }

    return (
      <ModalOverlay
        visible={true}
        canClose={true}
        onClose={handleRequestClose}
        className="srs-session-complete-modal"
      >
        {completeContent}
      </ModalOverlay>
    )
  }

  // ========================================
  // 渲染：正在进行的复习会话
  // ========================================
  if (inSidePanel) {
    return (
      <div
        ref={containerRef}
        className={`srs-review-session-panel ${isMaximized ? 'orca-maximized' : ''}`}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          backgroundColor: "var(--orca-color-bg-0)"
        }}
      >
        <div 
          className="srs-review-progress-bar"
          contentEditable={false}
          style={{
            height: "4px",
            backgroundColor: "var(--orca-color-bg-2)"
          }}
        >
          <div style={{
            height: "100%",
            width: `${(currentIndex / totalCards) * 100}%`,
            backgroundColor: "var(--orca-color-primary-5)",
            transition: "width 0.3s ease"
          }} />
        </div>

        <div 
          className="srs-review-header"
          contentEditable={false}
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--orca-color-border-1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
          <div contentEditable={false} style={{ userSelect: 'none' }}>
            <div style={{
              fontSize: "14px",
              color: "var(--orca-color-text-2)",
              fontWeight: 500,
              userSelect: 'none',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {isRepeatMode && (
                <span style={{
                  backgroundColor: "var(--orca-color-warning-1)",
                  color: "var(--orca-color-warning-6)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600
                }}>
                  重复复习 · 第 {currentRound} 轮
                </span>
              )}
              <span>
                卡片 {currentIndex + 1} / {totalCards}（到期 {counters.due} | 新卡 {counters.fresh}）
              </span>
              {newCardsAdded > 0 && (
                <span style={{ 
                  color: "var(--orca-color-primary-6)", 
                  fontSize: "12px"
                }}>
                  +{newCardsAdded} 新增
                </span>
              )}
            </div>
            {lastLog && (
              <div style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--orca-color-text-2)",
                opacity: 0.8
              }}>
                {lastLog}
              </div>
            )}
            {childExpandWarning && (
              <div
                role="status"
                style={{
                  marginTop: "6px",
                  fontSize: "12px",
                  color: "var(--orca-color-warning-6)",
                  backgroundColor: "var(--orca-color-warning-1)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  maxWidth: "420px"
                }}
                title={childExpandWarning}
              >
                {childExpandWarning}
              </div>
            )}
          </div>
          {/* 手动检查新卡片按钮 */}
          <Button
            variant="plain"
            onClick={handleCheckNewCards}
            title="检查新到期卡片"
            style={{ marginLeft: "8px" }}
          >
            <i className="ti ti-refresh" />
          </Button>
          
          {/* 最大化按钮已隐藏，默认最大化状态 */}
          {false && (
          <Button
            variant="plain"
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "还原" : "最大化"}
            style={{ marginLeft: "8px" }}
          >
            <i className={`ti ${isMaximized ? 'ti-maximize-off' : 'ti-maximize'}`} />
          </Button>
          )}
        </div>

        {/* 修改 5：移除主内容区 padding，让卡片内容占满面板 */}
        <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
          {currentCard ? (
          <SrsCardDemo
            front={currentCard.front}
            back={currentCard.back}
            onGrade={handleGrade}
            onPostpone={isCurrentReadOnly ? undefined : handlePostpone}
            onSuspend={isCurrentReadOnly ? undefined : handleSuspend}
            onClose={handleRequestClose}
            onSkip={isCurrentReadOnly ? handleContinue : handleSkip}
            onPrevious={handlePrevious}
            canGoPrevious={canGoPrevious}
            srsInfo={currentCard.srs}
            isGrading={isGrading}
            blockId={currentCard.id}
            nextBlockId={nextCard?.id}
            onJumpToCard={handleJumpToCard}
            inSidePanel={true}
            panelId={panelId}
            pluginName={pluginName}
            clozeNumber={currentCard.clozeNumber}
            directionType={currentCard.directionType}
            listItemId={currentCard.listItemId}
            listItemIndex={currentCard.listItemIndex}
            listItemIds={currentCard.listItemIds}
            isAuxiliaryPreview={currentCard.isAuxiliaryPreview}
            readOnly={isCurrentReadOnly}
            readOnlyStatusText={readOnlyStatusText}
          />
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--orca-color-text-2)"
            }}>
              加载中...
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="srs-review-session">
      {/* 复习进度条 */}
      <div contentEditable={false} style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        backgroundColor: 'var(--orca-color-bg-2)',
        zIndex: 10000
      }}>
        <div style={{
          height: '100%',
          width: `${(currentIndex / totalCards) * 100}%`,
          backgroundColor: 'var(--orca-color-primary-5)',
          transition: 'width 0.3s ease'
        }} />
      </div>

      {/* 进度文字提示 */}
      <div contentEditable={false} style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '8px 16px',
        backgroundColor: 'var(--orca-color-bg-1)',
        borderRadius: '20px',
        fontSize: '14px',
        color: 'var(--orca-color-text-2)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        {isRepeatMode && (
          <span style={{
            backgroundColor: "var(--orca-color-warning-1)",
            color: "var(--orca-color-warning-6)",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            fontWeight: 600
          }}>
            重复复习 · 第 {currentRound} 轮
          </span>
        )}
        <span>
          卡片 {currentIndex + 1} / {totalCards}（到期 {counters.due} | 新卡 {counters.fresh}）
        </span>
        {newCardsAdded > 0 && (
          <span style={{ 
            color: "var(--orca-color-primary-6)", 
            fontSize: "12px"
          }}>
            +{newCardsAdded} 新增
          </span>
        )}
      </div>

      {/* 最近一次评分日志 */}
      {lastLog && (
        <div contentEditable={false} style={{
          position: 'fixed',
          top: '48px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '6px 12px',
          backgroundColor: 'var(--orca-color-bg-2)',
          borderRadius: '12px',
          fontSize: '12px',
          color: 'var(--orca-color-text-2)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          zIndex: 10001
        }}>
          {lastLog}
        </div>
      )}

      {/* FC-12：子卡展开截断提示 */}
      {childExpandWarning && (
        <div
          role="status"
          contentEditable={false}
          title={childExpandWarning}
          style={{
            position: "fixed",
            top: lastLog ? "80px" : "48px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 12px",
            backgroundColor: "var(--orca-color-warning-1)",
            borderRadius: "12px",
            fontSize: "12px",
            color: "var(--orca-color-warning-6)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            zIndex: 10001,
            maxWidth: "90vw"
          }}
        >
          {childExpandWarning}
        </div>
      )}

      {/* 当前卡片（复用 SrsCardDemo 组件） */}
      {currentCard ? (
      <SrsCardDemo
        front={currentCard.front}
        back={currentCard.back}
        onGrade={handleGrade}
        onPostpone={isCurrentReadOnly ? undefined : handlePostpone}
        onSuspend={isCurrentReadOnly ? undefined : handleSuspend}
        onClose={handleRequestClose}
        onSkip={isCurrentReadOnly ? handleContinue : handleSkip}
        onPrevious={handlePrevious}
        canGoPrevious={canGoPrevious}
        srsInfo={currentCard.srs}
        isGrading={isGrading}
        blockId={currentCard.id}
        nextBlockId={nextCard?.id}
        onJumpToCard={handleJumpToCard}
        panelId={panelId}
        pluginName={pluginName}
        clozeNumber={currentCard.clozeNumber}
        directionType={currentCard.directionType}
        listItemId={currentCard.listItemId}
        listItemIndex={currentCard.listItemIndex}
        listItemIds={currentCard.listItemIds}
        isAuxiliaryPreview={currentCard.isAuxiliaryPreview}
        readOnly={isCurrentReadOnly}
        readOnlyStatusText={readOnlyStatusText}
      />
      ) : (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "var(--orca-color-text-2)"
        }}>
          加载中...
        </div>
      )}
    </div>
  )
}
