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

import type { PanelProps, DbId, ContentFragment } from "../../orca.d.ts"
import type { ReviewCard, Grade, SrsState } from "../../srs/types"
import SrsErrorBoundary from "../../components/SrsErrorBoundary"
import { updateSrsState, updateClozeSrsState, updateDirectionSrsState } from "../../srs/storage"
import { previewIntervals, formatInterval } from "../../srs/algorithm"
import { buryCard, suspendCard } from "../../srs/cardStatusUtils"
import { useReviewShortcuts } from "../../hooks/useReviewShortcuts"
import DirectionCardRenderer from "./DirectionCardRenderer"

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
 * 渲染 ContentFragment 数组为可视化内容（用于 Cloze 卡片）
 *
 * @param fragments - 内容片段数组
 * @param showAnswers - 是否显示答案（true = 显示答案，false = 显示 [...]）
 * @param pluginName - 插件名称（用于识别 cloze fragment）
 * @param currentClozeNumber - 当前复习的填空编号（仅隐藏该编号的填空，其他填空显示答案）
 */
function renderFragments(
  fragments: ContentFragment[] | undefined,
  showAnswers: boolean,
  pluginName: string,
  currentClozeNumber?: number
): React.ReactNode[] {
  const React = window.React
  
  if (!fragments || fragments.length === 0) {
    return [<span key="empty">（空白内容）</span>]
  }

  return fragments.map((fragment, index) => {
    // 普通文本片段
    if (fragment.t === "t") {
      return <span key={index}>{fragment.v}</span>
    }

    // Cloze 片段（支持任何 xxx.cloze 格式）
    const isClozeFragment = 
      fragment.t === `${pluginName}.cloze` ||
      (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
    
    if (isClozeFragment) {
      const fragmentClozeNumber = (fragment as any).clozeNumber

      // 判断是否应该隐藏此填空
      // 如果 currentClozeNumber 存在，只隐藏该编号的填空；否则隐藏所有填空
      const shouldHide = currentClozeNumber
        ? fragmentClozeNumber === currentClozeNumber
        : true

      if (showAnswers || !shouldHide) {
        // 显示答案：高亮显示填空内容
        return (
          <span
            key={index}
            style={{
              backgroundColor: "var(--orca-color-primary-1)",
              color: "var(--orca-color-primary-5)",
              fontWeight: "600",
              padding: "2px 6px",
              borderRadius: "4px",
              borderBottom: "2px solid var(--orca-color-primary-5)"
            }}
          >
            {fragment.v}
          </span>
        )
      } else {
        // 隐藏答案：显示 [...]
        return (
          <span
            key={index}
            style={{
              color: "var(--orca-color-text-2)",
              fontWeight: "500",
              padding: "2px 6px",
              backgroundColor: "var(--orca-color-bg-3)",
              borderRadius: "4px",
              border: "1px dashed var(--orca-color-border-1)"
            }}
          >
            [...]
          </span>
        )
      }
    }

    // 其他简单片段类型：代码、链接引用等，显示其文本内容
    if (fragment.v) {
      return <span key={index}>{fragment.v}</span>
    }

    // 未知类型的 fragment，显示占位符
    return (
      <span key={index} style={{ color: "var(--orca-color-text-3)" }}>
        [...]
      </span>
    )
  })
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

  // 从 viewArgs 获取的参数（一次性加载）
  const [deckFilter, setDeckFilter] = useState<string | null>(null)
  const [hostPanelId, setHostPanelId] = useState<string | null>(null)
  const [viewArgsLoaded, setViewArgsLoaded] = useState(false)

  // 根元素引用
  const rootRef = useRef<HTMLDivElement | null>(null)

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

  /**
   * 获取插件名称
   */
  useEffect(() => {
    void (async () => {
      try {
        const { getPluginName } = await import("../../main")
        const name = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
        setPluginName(name)
      } catch (error) {
        console.error("[SrsNewWindowPanel] 获取插件名失败:", error)
      }
    })()
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
    setIsLoading(true)
    setErrorMessage(null)
    setCurrentIndex(0)
    setReviewedCount(0)
    setLastLog(null)
    setShowAnswer(false)

    try {
      const { collectReviewCards, buildReviewQueue } = await import("../../main")
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
      
      // 延迟切换到下一张
      setTimeout(() => {
        setCurrentIndex((prev: number) => prev + 1)
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
   * 跳转到卡片
   */
  const handleJumpToCard = async (blockId: DbId) => {
    try {
      const { findLeftPanel, schedulePanelResize } = await import("../../srs/panelUtils")
      
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
   * 渲染 Basic 卡片（纯文本版，避免 Block 组件兼容性问题）
   */
  const renderBasicCard = () => {
    if (!currentCard) return null

    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "24px",
        overflow: "auto"
      }}>
        <div style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: "24px"
        }}>
          <div style={{
            backgroundColor: "var(--orca-color-bg-1)",
            borderRadius: "12px",
            padding: "24px",
            width: "100%",
            maxWidth: "700px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
          }}>
            {/* 顶部工具栏 */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              marginBottom: "16px"
            }}>
              <Button
                variant="soft"
                onClick={handleBury}
                style={{
                  padding: "6px 12px",
                  fontSize: "13px"
                }}
                title="埋藏到明天 (B)"
              >
                埋藏
              </Button>
              <Button
                variant="soft"
                onClick={handleSuspend}
                style={{
                  padding: "6px 12px",
                  fontSize: "13px"
                }}
                title="暂停卡片 (S)"
              >
                暂停
              </Button>
              <Button
                variant="soft"
                onClick={() => handleJumpToCard(currentCard.id)}
                style={{
                  padding: "6px 12px",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                跳转到卡片
              </Button>
            </div>

            {/* 题目区域（使用纯文本） */}
            <div style={{
              marginBottom: "16px",
              padding: "16px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px"
            }}>
              <div style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "var(--orca-color-text-2)",
                marginBottom: "12px"
              }}>
                题目
              </div>
              <div style={{
                fontSize: "18px",
                color: "var(--orca-color-text-1)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap"
              }}>
                {currentCard.front || "(无题目内容)"}
              </div>
            </div>

            {/* 显示答案按钮 / 答案区域 */}
            {!showAnswer ? (
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <Button
                  variant="solid"
                  onClick={() => setShowAnswer(true)}
                  style={{
                    padding: "12px 32px",
                    fontSize: "16px"
                  }}
                >
                  显示答案
                </Button>
              </div>
            ) : (
              <>
                {/* 答案区域（使用纯文本） */}
                <div style={{
                  marginBottom: "16px",
                  padding: "16px",
                  backgroundColor: "var(--orca-color-bg-2)",
                  borderRadius: "8px",
                  borderLeft: "4px solid var(--orca-color-primary-5)"
                }}>
                  <div style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "var(--orca-color-text-2)",
                    marginBottom: "12px"
                  }}>
                    答案
                  </div>
                  <div style={{
                    fontSize: "18px",
                    color: "var(--orca-color-text-1)",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap"
                  }}>
                    {currentCard.back || "(无答案内容)"}
                  </div>
                </div>

                {/* 评分按钮 */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "8px"
                }}>
                  <Button
                    variant="dangerous"
                    onClick={() => handleGrade("again")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.again)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>忘记</span>
                  </Button>

                  <Button
                    variant="soft"
                    onClick={() => handleGrade("hard")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.hard)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>困难</span>
                  </Button>

                  <Button
                    variant="solid"
                    onClick={() => handleGrade("good")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.good)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>良好</span>
                  </Button>

                  <Button
                    variant="solid"
                    onClick={() => handleGrade("easy")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      opacity: 0.9
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.easy)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>简单</span>
                  </Button>
                </div>
              </>
            )}

            {/* 提示文字 */}
            <div style={{
              marginTop: "16px",
              textAlign: "center",
              fontSize: "12px",
              color: "var(--orca-color-text-2)",
              opacity: 0.7
            }}>
              {!showAnswer ? "点击\"显示答案\"查看答案内容" : "根据记忆程度选择评分"}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /**
   * 渲染 Cloze（填空）卡片
   * 使用 renderFragments 将 ContentFragment 数组渲染为填空显示
   */
  const renderClozeCard = () => {
    if (!currentCard) return null

    // 渲染题目（隐藏当前填空编号的答案）
    const questionContent = renderFragments(
      currentCard.content,
      false,
      pluginName,
      currentCard.clozeNumber
    )

    // 渲染答案（显示所有填空并高亮当前填空）
    const answerContent = renderFragments(
      currentCard.content,
      true,
      pluginName,
      currentCard.clozeNumber
    )

    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "24px",
        overflow: "auto"
      }}>
        <div style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: "24px"
        }}>
          <div style={{
            backgroundColor: "var(--orca-color-bg-1)",
            borderRadius: "12px",
            padding: "24px",
            width: "100%",
            maxWidth: "700px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
          }}>
            {/* 顶部工具栏（与 Basic 卡片相同） */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px"
            }}>
              {/* 卡片类型标识 */}
              <div style={{
                fontSize: "12px",
                fontWeight: "500",
                color: "var(--orca-color-primary-5)",
                backgroundColor: "var(--orca-color-primary-1)",
                padding: "4px 10px",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}>
                填空卡 c{currentCard.clozeNumber}
              </div>
              
              {/* 操作按钮 */}
              <div style={{ display: "flex", gap: "8px" }}>
                <Button
                  variant="soft"
                  onClick={handleBury}
                  style={{
                    padding: "6px 12px",
                    fontSize: "13px"
                  }}
                  title="埋藏到明天 (B)"
                >
                  埋藏
                </Button>
                <Button
                  variant="soft"
                  onClick={handleSuspend}
                  style={{
                    padding: "6px 12px",
                    fontSize: "13px"
                  }}
                  title="暂停卡片 (S)"
                >
                  暂停
                </Button>
                <Button
                  variant="soft"
                  onClick={() => handleJumpToCard(currentCard.id)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  跳转到卡片
                </Button>
              </div>
            </div>

            {/* 填空内容区域 */}
            <div style={{
              marginBottom: "16px",
              padding: "16px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px",
              minHeight: "100px",
              fontSize: "18px",
              lineHeight: "1.8",
              color: "var(--orca-color-text-1)"
            }}>
              {showAnswer ? answerContent : questionContent}
            </div>

            {/* 显示答案按钮 / 评分按钮 */}
            {!showAnswer ? (
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <Button
                  variant="solid"
                  onClick={() => setShowAnswer(true)}
                  style={{
                    padding: "12px 32px",
                    fontSize: "16px"
                  }}
                >
                  显示答案
                </Button>
              </div>
            ) : (
              <>
                {/* 评分按钮（与 Basic 卡片相同） */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "8px"
                }}>
                  <Button
                    variant="dangerous"
                    onClick={() => handleGrade("again")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.again)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>忘记</span>
                  </Button>

                  <Button
                    variant="soft"
                    onClick={() => handleGrade("hard")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.hard)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>困难</span>
                  </Button>

                  <Button
                    variant="solid"
                    onClick={() => handleGrade("good")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.good)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>良好</span>
                  </Button>

                  <Button
                    variant="solid"
                    onClick={() => handleGrade("easy")}
                    style={{
                      padding: "12px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      opacity: 0.9
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{formatInterval(intervals.easy)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>简单</span>
                  </Button>
                </div>
              </>
            )}

            {/* 提示文字 */}
            <div style={{
              marginTop: "16px",
              textAlign: "center",
              fontSize: "12px",
              color: "var(--orca-color-text-2)",
              opacity: 0.7
            }}>
              {!showAnswer ? "点击\"显示答案\"查看填空内容" : "根据记忆程度选择评分"}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /**
   * 渲染主内容区域（根据卡片类型路由到对应渲染器）
   */
  const renderMainContent = () => {
    if (totalCards === 0) {
      return renderEmptyQueue()
    }

    if (isSessionComplete) {
      return renderSessionComplete()
    }

    // 根据卡片类型选择渲染器
    if (currentCard?.clozeNumber !== undefined) {
      return renderClozeCard()
    }
    
    // Direction 卡片：使用独立的渲染组件
    if (currentCard?.directionType) {
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
    
    return renderBasicCard()
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
