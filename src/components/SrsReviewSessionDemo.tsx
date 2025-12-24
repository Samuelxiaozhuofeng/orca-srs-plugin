/**
 * SRS 复习会话组件（使用真实数据队列）
 */
import type { DbId } from "../orca.d.ts"
import type { Grade, ReviewCard, CardState, ReviewLogEntry } from "../srs/types"
import { updateSrsState, updateClozeSrsState, updateDirectionSrsState } from "../srs/storage"
import { postponeCard, suspendCard } from "../srs/cardStatusUtils"
import { emitCardPostponed, emitCardGraded, emitCardSuspended } from "../srs/srsEvents"
import { showNotification } from "../srs/settings/reviewSettingsSchema"
import { saveReviewLog, createReviewLogId } from "../srs/reviewLogStorage"
import { 
  markParentCardProcessed, 
  resetProcessedParentCards 
} from "../srs/childCardCollector"
import SrsCardDemo from "./SrsCardDemo"

// 从全局 window 对象获取 React（Orca 插件约定）
const { useEffect, useMemo, useRef, useState } = window.React
const { Button, ModalOverlay } = orca.components

type SrsReviewSessionProps = {
  cards: ReviewCard[]
  onClose?: () => void
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

/**
 * 格式化日期为简单的"月-日"格式
 * @param date - 日期对象
 * @returns 格式化后的字符串，如 "12-10"
 */
function formatSimpleDate(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}-${day}`
}

export default function SrsReviewSession({
  cards,
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
  const [history, setHistory] = useState<number[]>([])  // 历史记录，存储已访问的卡片索引
  const [newCardsAdded, setNewCardsAdded] = useState(0)  // 新增卡片计数器
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now())  // 当前卡片开始复习时间
  const [internalRound, setInternalRound] = useState(currentRound)  // 内部轮次状态

  // 当外部 cards 或 currentRound 变化时，重置队列和索引（用于"再复习一轮"）
  useEffect(() => {
    if (currentRound !== internalRound) {
      // 轮次变化，重置队列
      setQueue([...cards])
      setCurrentIndex(0)
      setHistory([])
      setReviewedCount(0)
      setNewCardsAdded(0)
      setInternalRound(currentRound)
      setLastLog(`开始第 ${currentRound} 轮复习`)
      // 重置已处理的父卡片集合，新一轮复习允许重新插入子卡片
      resetProcessedParentCards()
      console.log(`[SRS Review Session] 重置队列，开始第 ${currentRound} 轮复习，卡片数: ${cards.length}`)
    }
  }, [cards, currentRound, internalRound])

  // 组件首次挂载时重置已处理的父卡片集合
  useEffect(() => {
    resetProcessedParentCards()
    console.log("[SRS Review Session] 会话开始，重置已处理父卡片集合")
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

  // 预缓存下一张卡片的块数据，防止切换时闪烁
  useEffect(() => {
    if (nextCard?.id) {
      // 触发 Orca 加载下一张卡片的块数据
      // 通过访问 orca.state.blocks[nextCard.id] 来预加载
      const block = orca.state.blocks?.[nextCard.id]
      if (!block) {
        // 如果块数据不存在，尝试通过 API 预加载
        console.log(`[SRS Review Session] 预缓存下一张卡片: ${nextCard.id}`)
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
    
    if (dueCards.length > 0) {
      console.log(`[${pluginName}] ${dueCards.length} 张短期卡片已到期，添加到复习队列`)
      
      // 检查是否已在**未复习的队列部分**（currentIndex 之后）
      setQueue((prevQueue: ReviewCard[]) => {
        const idx = currentIndexRef.current
        // 只检查当前位置之后的卡片（未复习的部分）
        const remainingQueue = prevQueue.slice(idx)
        const existingKeys = new Set(remainingQueue.map((c: ReviewCard) => 
          `${c.id}-${c.clozeNumber || 0}-${c.directionType || "basic"}`
        ))
        
        const newCards = dueCards.filter((c: ReviewCard) => {
          const key = `${c.id}-${c.clozeNumber || 0}-${c.directionType || "basic"}`
          return !existingKeys.has(key)
        })
        
        if (newCards.length > 0) {
          setNewCardsAdded((prev: number) => prev + newCards.length)
          setLastLog(`${newCards.length} 张卡片已到期，加入队列`)
          orca.notify("info", `${newCards.length} 张卡片已到期`, { title: "SRS 复习" })
          console.log(`[${pluginName}] 成功添加 ${newCards.length} 张卡片到队列末尾`)
          return [...prevQueue, ...newCards]
        }
        console.log(`[${pluginName}] 卡片已在未复习队列中，跳过添加`)
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
    const cardKey = `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
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

  // 动态更新复习队列：定期检查是否有新的到期卡片
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    
    const checkForNewCards = async () => {
      try {
        const { collectReviewCards, buildReviewQueue } = await import("../srs/cardCollector")
        
        // 获取所有当前到期的卡片
        const allCards = await collectReviewCards(pluginName)
        const newQueue = buildReviewQueue(allCards)
        
        // 检查是否有新的卡片（不在当前队列中的）
        const currentCardIds = new Set(queue.map((card: ReviewCard) => 
          `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
        ))
        
        const newCards = newQueue.filter((card: ReviewCard) => {
          const cardKey = `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
          return !currentCardIds.has(cardKey)
        })
        
        if (newCards.length > 0) {
          console.log(`[${pluginName}] 发现 ${newCards.length} 张新到期卡片，添加到复习队列`)
          
          // 将新卡片添加到队列末尾
          setQueue((prevQueue: ReviewCard[]) => [...prevQueue, ...newCards])
          setNewCardsAdded((prev: number) => prev + newCards.length)
          
          // 显示通知
          setLastLog(`发现 ${newCards.length} 张新到期卡片已加入队列`)
          
          // 可选：显示系统通知
          if (newCards.length > 0) {
            orca.notify("info", `${newCards.length} 张新卡片已到期`, { 
              title: "SRS 复习"
            })
          }
        }
      } catch (error) {
        console.error(`[${pluginName}] 检查新到期卡片失败:`, error)
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
  }, [pluginName]) // 移除 queue 依赖，避免每次队列变化都重新设置定时器

  const handleGrade = async (grade: Grade) => {
    if (!currentCard) return
    setIsGrading(true)

    console.log(`[SRS Card Demo] 用户选择评分: ${grade}${isRepeatMode ? ' (专项训练模式，不更新SRS)' : ''}`)

    let nextQueue = [...queue]
    let updatedCard = currentCard
    let cardLabel = ""

    if (currentCard.clozeNumber) {
      cardLabel = ` [c${currentCard.clozeNumber}]`
    } else if (currentCard.directionType) {
      cardLabel = ` [${currentCard.directionType === "forward" ? "→" : "←"}]`
    }

    // 重复复习模式（专项训练）：不更新 SRS 状态，只是单纯刷题
    if (isRepeatMode) {
      setLastLog(`评分 ${grade.toUpperCase()}${cardLabel} (专项训练，不影响复习进度)`)
      setReviewedCount((prev: number) => prev + 1)
      
      // 标记父卡片为已处理
      markParentCardProcessed(currentCard.id, currentCard.clozeNumber, currentCard.directionType)
      
      // 更新队列
      setQueue(nextQueue)
      
      setIsGrading(false)
      // 记录历史并前进
      setHistory((prev: number[]) => [...prev, currentIndex])
      setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
      return
    }

    // 正常复习模式：更新 SRS 状态
    // 记录复习前的状态
    const previousInterval = currentCard.srs.interval
    const previousState: CardState = currentCard.isNew 
      ? "new" 
      : (currentCard.srs.interval < 1 ? "learning" : "review")

    // 根据卡片类型选择不同的更新函数
    let result
    if (currentCard.clozeNumber) {
      // Cloze 卡片
      result = await updateClozeSrsState(currentCard.id, currentCard.clozeNumber, grade, pluginName)
    } else if (currentCard.directionType) {
      // Direction 卡片
      result = await updateDirectionSrsState(currentCard.id, currentCard.directionType, grade, pluginName)
    } else {
      // Basic 卡片
      result = await updateSrsState(currentCard.id, grade, pluginName)
    }

    updatedCard = { ...currentCard, srs: result.state, isNew: false }
    nextQueue[currentIndex] = updatedCard

    // 计算复习后的状态
    const newState: CardState = grade === "again" 
      ? "relearning" 
      : (result.state.interval < 1 ? "learning" : "review")

    // 计算复习耗时
    const reviewDuration = Date.now() - cardStartTime
    const timestamp = Date.now()

    // 记录复习日志 (Requirements: 11.1)
    const reviewLog: ReviewLogEntry = {
      id: createReviewLogId(timestamp, currentCard.id),
      cardId: currentCard.id,
      deckName: currentCard.deck,
      timestamp,
      grade,
      duration: reviewDuration,
      previousInterval,
      newInterval: result.state.interval,
      previousState,
      newState
    }

    // 异步保存复习记录，不阻塞 UI
    void saveReviewLog(pluginName, reviewLog)

    setLastLog(
      `评分 ${grade.toUpperCase()}${cardLabel} -> 下次 ${formatSimpleDate(result.state.due)}，间隔 ${result.state.interval} 天`
    )

    // 通知其他组件静默刷新
    emitCardGraded(currentCard.id, grade)

    setReviewedCount((prev: number) => prev + 1)
    
    // 子卡片处理说明：
    // 初始队列已经通过 buildReviewQueueWithChildren 展开了子卡片链
    // 例如：[A1, B, C, D, A2, B, C, D]
    // 
    // 这里只需要标记当前卡片为已处理，防止 Again 按钮导致的重复处理
    // 不再需要动态插入子卡片
    markParentCardProcessed(currentCard.id, currentCard.clozeNumber, currentCard.directionType)
    
    // 更新队列
    setQueue(nextQueue)
    
    // 如果评分为 Again 或 Hard，且卡片在 5 分钟内到期，追踪它以便自动加入队列
    const dueTime = result.state.due.getTime()
    const now = Date.now()
    if ((grade === "again" || grade === "hard") && dueTime - now <= 5 * 60 * 1000) {
      trackPendingDueCard(updatedCard, result.state.due)
    }
    
    setIsGrading(false)
    // 记录历史并前进
    setHistory((prev: number[]) => [...prev, currentIndex])
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }

  /**
   * 推迟卡片：将 due 时间设置为明天，不改变 SRS 状态
   */
  const handlePostpone = async () => {
    if (!currentCard || isGrading) return
    setIsGrading(true)

    try {
      await postponeCard(
        currentCard.id,
        currentCard.clozeNumber,
        currentCard.directionType
      )

      // 构建日志标签
      let cardLabel = ""
      if (currentCard.clozeNumber) {
        cardLabel = ` [c${currentCard.clozeNumber}]`
      } else if (currentCard.directionType) {
        cardLabel = ` [${currentCard.directionType === "forward" ? "→" : "←"}]`
      }

      setLastLog(`已推迟${cardLabel}，明天再复习`)
      showNotification("orca-srs", "info", "卡片已推迟，明天再复习", { title: "SRS 复习" })

      // 通知其他组件静默刷新
      emitCardPostponed(currentCard.id)
    } catch (error) {
      console.error("[SRS Review Session] 推迟卡片失败:", error)
      orca.notify("error", `推迟失败: ${error}`, { title: "SRS 复习" })
    }

    setIsGrading(false)
    // 记录历史并前进
    setHistory((prev: number[]) => [...prev, currentIndex])
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }

  /**
   * 暂停卡片：标记为 suspend 状态，不再出现在复习队列
   */
  const handleSuspend = async () => {
    if (!currentCard || isGrading) return
    setIsGrading(true)

    try {
      await suspendCard(currentCard.id)

      // 构建日志标签
      let cardLabel = ""
      if (currentCard.clozeNumber) {
        cardLabel = ` [c${currentCard.clozeNumber}]`
      } else if (currentCard.directionType) {
        cardLabel = ` [${currentCard.directionType === "forward" ? "→" : "←"}]`
      }

      setLastLog(`已暂停${cardLabel}`)
      showNotification("orca-srs", "info", "卡片已暂停，可在卡片浏览器中取消暂停", { title: "SRS 复习" })

      // 通知其他组件静默刷新
      emitCardSuspended(currentCard.id)
    } catch (error) {
      console.error("[SRS Review Session] 暂停卡片失败:", error)
      orca.notify("error", `暂停失败: ${error}`, { title: "SRS 复习" })
    }

    setIsGrading(false)
    // 记录历史并前进
    setHistory((prev: number[]) => [...prev, currentIndex])
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }

  /**
   * 跳过卡片：不评分，直接进入下一张
   */
  const handleSkip = () => {
    if (!currentCard || isGrading) return

    // 构建日志标签
    let cardLabel = ""
    if (currentCard.clozeNumber) {
      cardLabel = ` [c${currentCard.clozeNumber}]`
    } else if (currentCard.directionType) {
      cardLabel = ` [${currentCard.directionType === "forward" ? "→" : "←"}]`
    }

    setLastLog(`已跳过${cardLabel}`)
    
    // 记录历史并前进
    setHistory((prev: number[]) => [...prev, currentIndex])
    setCurrentIndex((prev: number) => prev + 1)
  }

  /**
   * 手动检查新到期卡片
   */
  const handleCheckNewCards = async () => {
    try {
      const { collectReviewCards, buildReviewQueue } = await import("../srs/cardCollector")
      
      // 获取所有当前到期的卡片
      const allCards = await collectReviewCards(pluginName)
      const newQueue = buildReviewQueue(allCards)
      
      // 检查是否有新的卡片（不在当前队列中的）
      const currentCardIds = new Set(queue.map((card: ReviewCard) => 
        `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
      ))
      
      const newCards = newQueue.filter((card: ReviewCard) => {
        const cardKey = `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
        return !currentCardIds.has(cardKey)
      })
      
      if (newCards.length > 0) {
        console.log(`[${pluginName}] 手动检查发现 ${newCards.length} 张新到期卡片`)
        
        // 将新卡片添加到队列末尾
        setQueue((prevQueue: ReviewCard[]) => [...prevQueue, ...newCards])
        setNewCardsAdded((prev: number) => prev + newCards.length)
        
        // 显示通知
        setLastLog(`手动检查发现 ${newCards.length} 张新到期卡片已加入队列`)
        
        orca.notify("success", `发现 ${newCards.length} 张新到期卡片`, { 
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
   * 回到上一张卡片
   */
  const handlePrevious = () => {
    if (history.length === 0 || isGrading) return

    const prevIndex = history[history.length - 1]
    setHistory((prev: number[]) => prev.slice(0, -1))
    setCurrentIndex(prevIndex)
    setLastLog("返回上一张")
  }

  // 是否可以回到上一张
  const canGoPrevious = history.length > 0 && !isGrading

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
    console.log(`[SRS Review Session] 本次复习结束，共复习 ${reviewedCount} 张卡片`)

    showNotification(
      "orca-srs",
      "success",
      `本次复习完成！共复习了 ${reviewedCount} 张卡片`,
      { title: "SRS 复习会话" }
    )

    if (onClose) {
      onClose()
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
          <Button variant="solid" onClick={onClose}>关闭</Button>
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
      <ModalOverlay visible={true} canClose={true} onClose={onClose}>
        {emptyContent}
      </ModalOverlay>
    )
  }

  // ========================================
  // 渲染：复习结束界面
  // ========================================
  if (isSessionComplete) {
    const completeContent = (
      <div className="srs-session-complete-container" style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "48px",
        maxWidth: "500px",
        width: "100%",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        textAlign: "center"
      }}>
        <div style={{
          fontSize: "64px",
          marginBottom: "24px"
        }}>
          🎉
        </div>

        <h2 style={{
          fontSize: "24px",
          fontWeight: "600",
          color: "var(--orca-color-text-1)",
          marginBottom: "16px"
        }}>
          {isRepeatMode ? `第 ${currentRound} 轮复习结束！` : "本次复习结束！"}
        </h2>

        <div style={{
          fontSize: "16px",
          color: "var(--orca-color-text-2)",
          marginBottom: "32px",
          lineHeight: "1.6"
        }}>
          <p>共复习了 <strong style={{ color: "var(--orca-color-primary-5)" }}>{reviewedCount}</strong> 张卡片</p>
          <p style={{ marginTop: "8px" }}>坚持复习，持续进步！</p>
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
        onClose={onClose}
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
            onPostpone={handlePostpone}
            onSuspend={handleSuspend}
            onClose={onClose}
            onSkip={handleSkip}
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

      {/* 当前卡片（复用 SrsCardDemo 组件） */}
      {currentCard ? (
      <SrsCardDemo
        front={currentCard.front}
        back={currentCard.back}
        onGrade={handleGrade}
        onPostpone={handlePostpone}
        onSuspend={handleSuspend}
        onClose={onClose}
        onSkip={handleSkip}
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
