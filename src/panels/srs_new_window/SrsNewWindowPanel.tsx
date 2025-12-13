/**
 * SRS 复习会话面板（Custom Panel 架构）
 *
 * 阶段 5：支持 Basic Card、Cloze Card 和 Direction Card
 * - 从 viewArgs 获取参数（deckFilter, hostPanelId）
 * - 加载队列支持 basic、cloze 和 direction 卡片
 * - Basic 卡片使用纯文本渲染（front/back）
 * - Cloze 卡片使用 renderFragments 渲染填空内容
 * - Direction 卡片使用 DirectionCardRenderer 渲染方向问答
 * - 实现评分逻辑（调用 updateSrsState/updateClozeSrsState/updateDirectionSrsState）
 */

import type { PanelProps, DbId } from "../../orca.d.ts"
import type { ReviewCard, Grade, SrsState } from "../../srs/types"
import SrsErrorBoundary from "../../components/SrsErrorBoundary"
import { updateSrsState, updateClozeSrsState, updateDirectionSrsState } from "../../srs/storage"
import { previewIntervals } from "../../srs/algorithm"
import { buryCard, suspendCard } from "../../srs/cardStatusUtils"
import { useReviewShortcuts } from "../../hooks/useReviewShortcuts"
import { findLeftPanel, schedulePanelResize } from "../../srs/panelUtils"
import { collectReviewCards, buildReviewQueue, getPluginName } from "../../main"
import DirectionCardRenderer from "./DirectionCardRenderer"
import BasicCardRenderer from "./BasicCardRenderer"
import ClozeCardRenderer from "./ClozeCardRenderer"

const { useEffect, useState, useRef, useMemo, useCallback } = window.React
const { Button } = orca.components

/**
 * 格式化日期为简单的"月-日"格式
 */
function formatSimpleDate(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}-${day}`
}

/**
 * SRS 复习会话面板组件
 *
 * viewArgs 支持的参数：
 * - deckFilter: string | null - Deck 过滤器
 * - hostPanelId: string | null - 宿主面板 ID（用于跳转卡片）
 */
export default function SrsNewWindowPanel(props: PanelProps) {
  const { panelId, active } = props

  // 追踪面板激活状态变化
  const wasActiveRef = useRef(false)

  // 面板状态
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [queue, setQueue] = useState<ReviewCard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [isGrading, setIsGrading] = useState(false)
  const [lastLog, setLastLog] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [pluginName, setPluginName] = useState("orca-srs")
  // 卡片过渡动画状态
  const [isCardExiting, setIsCardExiting] = useState(false)

  // 从 viewArgs 获取的参数（一次性加载）
  const [deckFilter, setDeckFilter] = useState<string | null>(null)
  const [hostPanelId, setHostPanelId] = useState<string | null>(null)
  const [viewArgsLoaded, setViewArgsLoaded] = useState(false)

  // 根元素引用
  const rootRef = useRef<HTMLDivElement | null>(null)
  
  // 加载锁，防止竞态条件
  const isLoadingRef = useRef(false)
  
  // 上一次的 panelId，用于检测 panelId 变化时重置 viewArgsLoaded
  const prevPanelIdRef = useRef(panelId)

  // 计算派生状态
  const totalCards = queue.length
  const currentCard = queue[currentIndex]
  const isSessionComplete = currentIndex >= totalCards

  // 计算到期和新卡数量
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

  // 预览各评分对应的间隔天数
  const intervals = useMemo(() => {
    if (!currentCard?.srs) return previewIntervals(null)
    const fullState: SrsState = {
      stability: currentCard.srs.stability ?? 0,
      difficulty: currentCard.srs.difficulty ?? 0,
      interval: currentCard.srs.interval ?? 0,
      due: currentCard.srs.due ?? new Date(),
      lastReviewed: currentCard.srs.lastReviewed ?? null,
      reps: currentCard.srs.reps ?? 0,
      lapses: currentCard.srs.lapses ?? 0,
      state: currentCard.srs.state
    }
    return previewIntervals(fullState)
  }, [currentCard?.srs])

  /**
   * 一次性从 viewArgs 获取参数（避免无限更新）
   */
  useEffect(() => {
    if (viewArgsLoaded) return
    
    try {
      // 直接访问 orca.state（不使用 useSnapshot）
      const panels = orca.state.panels
      const viewPanel = orca.nav.findViewPanel(panelId, panels)
      if (viewPanel) {
        const filter = viewPanel.viewArgs?.deckFilter ?? null
        const host = viewPanel.viewArgs?.hostPanelId ?? null
        setDeckFilter(filter)
        setHostPanelId(host)
        console.log(`[SrsNewWindowPanel] viewArgs 已加载: deckFilter=${filter}, hostPanelId=${host}`)
      }
    } catch (error) {
      console.error("[SrsNewWindowPanel] 加载 viewArgs 失败:", error)
    }
    
    setViewArgsLoaded(true)
  }, [panelId, viewArgsLoaded])

  // 当 panelId 变化时，重置 viewArgsLoaded
  useEffect(() => {
    if (prevPanelIdRef.current !== panelId) {
      console.log(`[SrsNewWindowPanel] panelId 变化: ${prevPanelIdRef.current} -> ${panelId}，重置 viewArgsLoaded`)
      setViewArgsLoaded(false)
      prevPanelIdRef.current = panelId
    }
  }, [panelId])

  /**
   * 获取插件名称（使用静态导入）
   */
  useEffect(() => {
    try {
      const name = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      setPluginName(name)
    } catch (error) {
      console.error("[SrsNewWindowPanel] 获取插件名失败:", error)
    }
  }, [])

  /**
   * 注入 CSS 动画样式
   */
  useEffect(() => {
    const styleId = "srs-review-animations"
    if (document.getElementById(styleId)) return

    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
      /* 答案渐显动画 */
      @keyframes srsAnswerFadeIn {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* 卡片滑出动画 */
      @keyframes srsCardSlideOut {
        from {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateX(-60px) scale(0.95);
        }
      }
      
      /* 卡片滑入动画 */
      @keyframes srsCardSlideIn {
        from {
          opacity: 0;
          transform: translateX(40px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }
      
      .srs-card-exiting {
        animation: srsCardSlideOut 0.25s ease-out forwards;
      }
      
      .srs-card-entering {
        animation: srsCardSlideIn 0.3s ease-out forwards;
      }
      
      /* 评分按钮点击反馈 */
      .srs-new-window-panel button:active {
        transform: scale(0.95) !important;
      }
      
      /* 评分按钮悬浮效果 */
      .srs-new-window-panel button {
        transition: transform 0.1s ease, box-shadow 0.2s ease !important;
      }
      
      .srs-new-window-panel button:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
    `
    document.head.appendChild(style)

    return () => {
      const el = document.getElementById(styleId)
      if (el) el.remove()
    }
  }, [])

  /**
   * 加载复习队列（仅 basic card）
   */
  useEffect(() => {
    if (!viewArgsLoaded) return
    void loadReviewQueue()
  }, [viewArgsLoaded, deckFilter, pluginName])

  /**
   * 面板激活时重新加载队列（解决用户创建新卡片后看不到的问题）
   */
  useEffect(() => {
    // 当面板从非激活变为激活时，重新加载队列
    if (active && !wasActiveRef.current && viewArgsLoaded) {
      console.log(`[SrsNewWindowPanel] 面板激活，重新加载队列`)
      void loadReviewQueue()
    }
    wasActiveRef.current = active
  }, [active, viewArgsLoaded])

  const loadReviewQueue = async () => {
    // 加载锁：防止多次并发加载
    if (isLoadingRef.current) {
      console.log(`[SrsNewWindowPanel] 跳过重复加载（已在加载中）`)
      return
    }
    isLoadingRef.current = true
    
    setIsLoading(true)
    setErrorMessage(null)
    setCurrentIndex(0)
    setReviewedCount(0)
    setLastLog(null)
    setShowAnswer(false)

    try {
      // 使用静态导入的函数
      const allCards = await collectReviewCards(pluginName)
      
      // 应用 Deck 过滤
      let filteredCards = deckFilter
        ? allCards.filter((card: ReviewCard) => card.deck === deckFilter)
        : allCards
      
      // 阶段 5：支持 basic、cloze 和 direction 卡片（不再过滤）
      const reviewQueue = buildReviewQueue(filteredCards)
      setQueue(reviewQueue)

      // 统计卡片类型
      const basicCount = reviewQueue.filter((c: ReviewCard) => !c.clozeNumber && !c.directionType).length
      const clozeCount = reviewQueue.filter((c: ReviewCard) => c.clozeNumber !== undefined).length
      const directionCount = reviewQueue.filter((c: ReviewCard) => c.directionType !== undefined).length
      console.log(`[SrsNewWindowPanel] 加载队列完成: ${reviewQueue.length} 张卡片 (Basic: ${basicCount}, Cloze: ${clozeCount}, Direction: ${directionCount})` +
        (deckFilter ? ` (Deck: ${deckFilter})` : ""))

    } catch (error) {
      console.error("[SrsNewWindowPanel] 加载复习队列失败:", error)
      setErrorMessage(error instanceof Error ? error.message : `${error}`)
      orca.notify("error", "加载复习队列失败", { title: "SRS 复习" })
    } finally {
      setIsLoading(false)
      isLoadingRef.current = false
    }
  }

  /**
   * 处理评分（支持 Basic 和 Cloze 卡片）
   */
  const handleGrade = useCallback(async (grade: Grade) => {
    if (!currentCard || isGrading) return
    setIsGrading(true)

    try {
      let result
      
      // 根据卡片类型调用对应的评分函数
      if (currentCard.clozeNumber !== undefined) {
        // Cloze 卡片评分
        result = await updateClozeSrsState(currentCard.id, currentCard.clozeNumber, grade)
      } else if (currentCard.directionType) {
        // Direction 卡片评分
        result = await updateDirectionSrsState(currentCard.id, currentCard.directionType, grade)
      } else {
        // Basic 卡片评分
        result = await updateSrsState(currentCard.id, grade)
      }

      // 更新队列中的卡片状态
      const updatedCard: ReviewCard = { ...currentCard, srs: result.state, isNew: false }
      const nextQueue = [...queue]
      nextQueue[currentIndex] = updatedCard
      setQueue(nextQueue)

      // 设置日志（显示卡片类型）
      const cardTypeLabel = currentCard.clozeNumber !== undefined 
        ? `填空c${currentCard.clozeNumber}` 
        : currentCard.directionType 
          ? `方向${currentCard.directionType === "forward" ? "正向" : "反向"}`
          : "Basic"
      setLastLog(
        `[${cardTypeLabel}] 评分 ${grade.toUpperCase()} -> 下次 ${formatSimpleDate(result.state.due)}，间隔 ${result.state.interval} 天`
      )

      setReviewedCount((prev: number) => prev + 1)
      setShowAnswer(false)
      
      // 触发卡片滑出动画，然后切换到下一张
      setIsCardExiting(true)
      setTimeout(() => {
        setCurrentIndex((prev: number) => prev + 1)
        setIsCardExiting(false)
      }, 250)

    } catch (error) {
      console.error("[SrsNewWindowPanel] 评分失败:", error)
      orca.notify("error", `评分失败: ${error}`, { title: "SRS 复习" })
    } finally {
      setIsGrading(false)
    }
  }, [currentCard, isGrading, queue, currentIndex])

  /**
   * 埋藏卡片：将 due 时间设置为明天，不改变 SRS 状态
   * 对于 Cloze 卡片，只埋藏当前 clozeNumber 的变种
   * 对于 Direction 卡片，只埋藏当前 directionType 的变种
   */
  const handleBury = useCallback(async () => {
    if (!currentCard || isGrading) return
    setIsGrading(true)

    try {
      // 传递 clozeNumber 和 directionType 以正确埋藏特定卡片变种
      await buryCard(currentCard.id, currentCard.clozeNumber, currentCard.directionType)
      
      // 根据卡片类型显示不同的日志
      const cardTypeLabel = currentCard.clozeNumber !== undefined 
        ? `填空 c${currentCard.clozeNumber}` 
        : currentCard.directionType 
          ? `${currentCard.directionType === "forward" ? "正向" : "反向"}卡`
          : "卡片"
      setLastLog(`${cardTypeLabel}已埋藏，明天再复习`)
      orca.notify("info", `${cardTypeLabel}已埋藏，明天再复习`, { title: "SRS 复习" })
    } catch (error) {
      console.error("[SrsNewWindowPanel] 埋藏卡片失败:", error)
      orca.notify("error", `埋藏失败: ${error}`, { title: "SRS 复习" })
    }

    setIsGrading(false)
    setShowAnswer(false)
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }, [currentCard, isGrading])

  /**
   * 暂停卡片：标记为 suspend 状态，不再出现在复习队列
   * 注意：Suspend 操作会暂停整个块的所有卡片变种（设计意图）
   * 如果只想暂停特定变种，请使用 Bury 功能
   */
  const handleSuspend = useCallback(async () => {
    if (!currentCard || isGrading) return
    setIsGrading(true)

    try {
      // Suspend 操作会暂停整个块（#card 标签 status=suspend）
      // 这是设计意图：暂停一个变种意味着暂停整个卡片
      await suspendCard(currentCard.id)
      
      // 根据卡片类型显示不同的提示
      const hasMultipleVariants = currentCard.clozeNumber !== undefined || currentCard.directionType !== undefined
      const message = hasMultipleVariants 
        ? "卡片已暂停（所有变种都会暂停），可在卡片浏览器中取消暂停"
        : "卡片已暂停，可在卡片浏览器中取消暂停"
      setLastLog("已暂停")
      orca.notify("info", message, { title: "SRS 复习" })
    } catch (error) {
      console.error("[SrsNewWindowPanel] 暂停卡片失败:", error)
      orca.notify("error", `暂停失败: ${error}`, { title: "SRS 复习" })
    }

    setIsGrading(false)
    setShowAnswer(false)
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }, [currentCard, isGrading])

  /**
   * 键盘快捷键（空格显示答案、1234评分、b埋藏、s暂停）
   */
  useReviewShortcuts({
    showAnswer,
    isGrading,
    onShowAnswer: () => setShowAnswer(true),
    onGrade: handleGrade,
    onBury: handleBury,
    onSuspend: handleSuspend,
    enabled: !isLoading && !isSessionComplete && totalCards > 0
  })

  /**
   * 关闭面板
   */
  const handleClose = () => {
    orca.nav.close(panelId)
  }

  /**
   * 跳转到卡片（使用静态导入的 panelUtils）
   */
  const handleJumpToCard = async (blockId: DbId) => {
    try {
      // 优先使用 viewArgs 中的 hostPanelId
      if (hostPanelId) {
        orca.nav.goTo("block", { blockId }, hostPanelId)
        orca.nav.switchFocusTo(hostPanelId)
        return
      }

      // 查找左侧面板（直接访问 orca.state）
      let leftPanelId = findLeftPanel(orca.state.panels, panelId)

      if (!leftPanelId) {
        // 创建左侧面板
        leftPanelId = orca.nav.addTo(panelId, "left", {
          view: "block",
          viewArgs: { blockId },
          viewState: {}
        })

        if (leftPanelId) {
          schedulePanelResize(leftPanelId, pluginName)
          orca.nav.switchFocusTo(leftPanelId)
        }
      } else {
        orca.nav.goTo("block", { blockId }, leftPanelId)
        orca.nav.switchFocusTo(leftPanelId)
      }
    } catch (error) {
      console.error("[SrsNewWindowPanel] 跳转到卡片失败:", error)
      orca.nav.goTo("block", { blockId })
    }
  }

  /**
   * 渲染进度条
   */
  const renderProgressBar = () => {
    const progress = totalCards > 0 ? (currentIndex / totalCards) * 100 : 0
    
    return (
      <div style={{
        height: "4px",
        backgroundColor: "var(--orca-color-bg-2)"
      }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: "var(--orca-color-primary-5)",
          transition: "width 0.3s ease"
        }} />
      </div>
    )
  }

  /**
   * 渲染状态栏
   */
  const renderStatusBar = () => (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid var(--orca-color-border-1)",
      backgroundColor: "var(--orca-color-bg-1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }}>
      <div>
        <div style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          fontWeight: 500
        }}>
          卡片 {currentIndex + 1} / {totalCards}（到期 {counters.due} | 新卡 {counters.fresh}）
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
      
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}>
        {deckFilter && (
          <div style={{
            padding: "4px 8px",
            backgroundColor: "var(--orca-color-primary-1)",
            color: "var(--orca-color-primary-6)",
            borderRadius: "4px",
            fontSize: "12px",
            fontWeight: 500
          }}>
            Deck: {deckFilter}
          </div>
        )}
        
        {/* 刷新按钮 */}
        <Button
          variant="soft"
          onClick={loadReviewQueue}
          style={{
            padding: "4px 8px",
            fontSize: "12px"
          }}
          title="刷新队列"
        >
          刷新
        </Button>
      </div>
    </div>
  )

  /**
   * 渲染加载中状态
   */
  const renderLoading = () => (
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

  /**
   * 渲染错误状态
   */
  const renderError = () => (
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
      <div style={{ color: "var(--orca-color-danger-5)" }}>
        加载失败：{errorMessage}
      </div>
      <Button variant="solid" onClick={loadReviewQueue}>
        重试
      </Button>
    </div>
  )

  /**
   * 渲染空队列状态
   */
  const renderEmptyQueue = () => (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "32px",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center"
    }}>
      <div style={{ fontSize: "48px", marginBottom: "8px" }}>🎉</div>
      <h3 style={{
        fontSize: "18px",
        fontWeight: "600",
        color: "var(--orca-color-text-1)",
        margin: 0
      }}>
        {deckFilter ? `Deck "${deckFilter}" 没有待复习的 Basic 卡片` : "今天没有待复习的 Basic 卡片"}
      </h3>
      <p style={{
        fontSize: "14px",
        color: "var(--orca-color-text-2)",
        margin: 0
      }}>
        请添加新卡片或等待卡片到期
      </p>
      <Button variant="solid" onClick={handleClose} style={{ marginTop: "8px" }}>
        关闭
      </Button>
    </div>
  )

  /**
   * 渲染复习完成状态
   */
  const renderSessionComplete = () => (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "48px",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center"
    }}>
      <div style={{ fontSize: "64px", marginBottom: "8px" }}>🎊</div>
      <h2 style={{
        fontSize: "24px",
        fontWeight: "600",
        color: "var(--orca-color-text-1)",
        margin: 0
      }}>
        本次复习结束！
      </h2>
      <div style={{
        fontSize: "16px",
        color: "var(--orca-color-text-2)",
        lineHeight: 1.6
      }}>
        <p style={{ margin: "8px 0" }}>
          共复习了 <strong style={{ color: "var(--orca-color-primary-5)" }}>{reviewedCount}</strong> 张卡片
        </p>
        <p style={{ margin: "8px 0" }}>坚持复习，持续进步！</p>
      </div>
      <Button
        variant="solid"
        onClick={handleClose}
        style={{
          marginTop: "16px",
          padding: "12px 32px",
          fontSize: "16px"
        }}
      >
        完成
      </Button>
    </div>
  )

  /**
   * 渲染主内容区域（根据卡片类型路由到对应渲染器组件）
   */
  const renderMainContent = () => {
    if (totalCards === 0) {
      return renderEmptyQueue()
    }

    if (isSessionComplete) {
      return renderSessionComplete()
    }

    if (!currentCard) return null

    // 公共 props
    const commonProps = {
      showAnswer,
      isGrading,
      intervals,
      onShowAnswer: () => setShowAnswer(true),
      onGrade: handleGrade,
      onBury: handleBury,
      onSuspend: handleSuspend,
      onJumpToCard: () => handleJumpToCard(currentCard.id)
    }

    // 动画类名
    const animationClass = isCardExiting ? "srs-card-exiting" : "srs-card-entering"

    // 根据卡片类型选择渲染器组件，并包裹动画容器
    const renderCard = () => {
      if (currentCard.clozeNumber !== undefined) {
        return (
          <ClozeCardRenderer
            card={currentCard}
            pluginName={pluginName}
            {...commonProps}
          />
        )
      }
      
      // Direction 卡片：使用独立的渲染组件
      if (currentCard.directionType) {
        return (
          <DirectionCardRenderer
            card={currentCard}
            pluginName={pluginName}
            showAnswer={showAnswer}
            isGrading={isGrading}
            onShowAnswer={() => setShowAnswer(true)}
            onGrade={handleGrade}
            onBury={handleBury}
            onSuspend={handleSuspend}
            onJumpToCard={() => handleJumpToCard(currentCard.id)}
          />
        )
      }
      
      // Basic 卡片
      return (
        <BasicCardRenderer
          card={currentCard}
          {...commonProps}
        />
      )
    }

    // 包裹动画容器
    return (
      <div 
        key={`card-${currentIndex}`}
        className={animationClass}
        style={{ 
          flex: 1, 
          display: "flex", 
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {renderCard()}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="srs-new-window-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "var(--orca-color-bg-0)"
      }}
    >
      <SrsErrorBoundary componentName="复习会话面板" errorTitle="复习面板加载出错">
        {isLoading ? renderLoading() : errorMessage ? renderError() : (
          <>
            {renderProgressBar()}
            {totalCards > 0 && !isSessionComplete && renderStatusBar()}
            {renderMainContent()}
          </>
        )}
      </SrsErrorBoundary>
    </div>
  )
}
