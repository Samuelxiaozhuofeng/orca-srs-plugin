/**
 * SRS 复习会话组件（使用真实数据队列）
 */
import type { DbId } from "../orca.d.ts"
import type { Grade, ReviewCard } from "../srs/types"
import { updateSrsState, updateClozeSrsState, updateDirectionSrsState } from "../srs/storage"
import { buryCard, suspendCard } from "../srs/cardStatusUtils"
import { emitCardBuried, emitCardGraded, emitCardSuspended } from "../srs/srsEvents"
import SrsCardDemo from "./SrsCardDemo"

// 从全局 window 对象获取 React（Orca 插件约定）
const { useEffect, useMemo, useRef, useState } = window.React
const { Button, ModalOverlay } = orca.components

type SrsReviewSessionProps = {
  cards: ReviewCard[]
  onClose?: () => void
  onJumpToCard?: (blockId: DbId) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName?: string
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
  pluginName = "orca-srs"
}: SrsReviewSessionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [queue, setQueue] = useState<ReviewCard[]>(cards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [isGrading, setIsGrading] = useState(false)
  const [lastLog, setLastLog] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(true)  // 默认最大化

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
      // 恢复显示
      if (noneEditableEl) noneEditableEl.style.display = ''
      if (goBtns) goBtns.style.display = ''
      if (sidetools) sidetools.style.display = ''
      if (reprNoneEditable) reprNoneEditable.style.display = ''
      if (breadcrumb) breadcrumb.style.display = ''
    }

    // 清理函数：组件卸载时恢复原状
    return () => {
      blockEditor.removeAttribute('maximize')
      if (noneEditableEl) noneEditableEl.style.display = ''
      if (goBtns) goBtns.style.display = ''
      if (sidetools) sidetools.style.display = ''
      if (reprNoneEditable) reprNoneEditable.style.display = ''
      if (breadcrumb) breadcrumb.style.display = ''
    }
  }, [isMaximized])

  const totalCards = queue.length
  const currentCard = queue[currentIndex]
  const isSessionComplete = currentIndex >= totalCards

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

  const handleGrade = async (grade: Grade) => {
    if (!currentCard) return
    setIsGrading(true)

    // 根据卡片类型选择不同的更新函数
    let result
    if (currentCard.clozeNumber) {
      // Cloze 卡片
      result = await updateClozeSrsState(currentCard.id, currentCard.clozeNumber, grade)
    } else if (currentCard.directionType) {
      // Direction 卡片
      result = await updateDirectionSrsState(currentCard.id, currentCard.directionType, grade)
    } else {
      // Basic 卡片
      result = await updateSrsState(currentCard.id, grade)
    }

    const updatedCard: ReviewCard = { ...currentCard, srs: result.state, isNew: false }
    const nextQueue = [...queue]
    nextQueue[currentIndex] = updatedCard
    setQueue(nextQueue)

    // 构建日志标签
    let cardLabel = ""
    if (currentCard.clozeNumber) {
      cardLabel = ` [c${currentCard.clozeNumber}]`
    } else if (currentCard.directionType) {
      cardLabel = ` [${currentCard.directionType === "forward" ? "→" : "←"}]`
    }

    setLastLog(
      `评分 ${grade.toUpperCase()}${cardLabel} -> 下次 ${formatSimpleDate(result.state.due)}，间隔 ${result.state.interval} 天`
    )

    // 通知 FlashcardHome 静默刷新（避免返回后仍显示旧统计/旧队列）
    emitCardGraded(currentCard.id, grade)

    setReviewedCount((prev: number) => prev + 1)
    setIsGrading(false)
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }

  /**
   * 埋藏卡片：将 due 时间设置为明天，不改变 SRS 状态
   */
  const handleBury = async () => {
    if (!currentCard || isGrading) return
    setIsGrading(true)

    try {
      await buryCard(
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

      setLastLog(`已埋藏${cardLabel}，明天再复习`)
      orca.notify("info", "卡片已埋藏，明天再复习", { title: "SRS 复习" })

      // 通知 FlashcardHome 静默刷新
      emitCardBuried(currentCard.id)
    } catch (error) {
      console.error("[SRS Review Session] 埋藏卡片失败:", error)
      orca.notify("error", `埋藏失败: ${error}`, { title: "SRS 复习" })
    }

    setIsGrading(false)
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
      orca.notify("info", "卡片已暂停，可在卡片浏览器中取消暂停", { title: "SRS 复习" })

      // 通知 FlashcardHome 静默刷新
      emitCardSuspended(currentCard.id)
    } catch (error) {
      console.error("[SRS Review Session] 暂停卡片失败:", error)
      orca.notify("error", `暂停失败: ${error}`, { title: "SRS 复习" })
    }

    setIsGrading(false)
    setTimeout(() => setCurrentIndex((prev: number) => prev + 1), 250)
  }

  const handleJumpToCard = (blockId: DbId) => {
    if (onJumpToCard) {
      onJumpToCard(blockId)
      return
    }
    console.log(`[SRS Review Session] 跳转到卡片 #${blockId}`)
    orca.nav.goTo("block", { blockId })
    orca.notify(
      "info",
      "已跳转到卡片，复习界面仍然保留",
      { title: "SRS 复习" }
    )
  }

  const handleFinishSession = () => {
    console.log(`[SRS Review Session] 本次复习结束，共复习 ${reviewedCount} 张卡片`)

    orca.notify(
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
          ?
        </div>

        <h2 style={{
          fontSize: "24px",
          fontWeight: "600",
          color: "var(--orca-color-text-1)",
          marginBottom: "16px"
        }}>
          本次复习结束！
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
        <div style={{
          height: "4px",
          backgroundColor: "var(--orca-color-bg-2)"
        }}>
          <div style={{
            height: "100%",
            width: `${(currentIndex / totalCards) * 100}%`,
            backgroundColor: "var(--orca-color-primary-5)",
            transition: "width 0.3s ease"
          }} />
        </div>

        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--orca-color-border-1)",
          backgroundColor: "var(--orca-color-bg-1)",
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
              pointerEvents: 'none'
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
          <SrsCardDemo
            front={currentCard.front}
            back={currentCard.back}
            onGrade={handleGrade}
            onBury={handleBury}
            onSuspend={handleSuspend}
            onClose={onClose}
            srsInfo={currentCard.srs}
            isGrading={isGrading}
            blockId={currentCard.id}
            onJumpToCard={handleJumpToCard}
            inSidePanel={true}
            panelId={panelId}
            pluginName={pluginName}
            clozeNumber={currentCard.clozeNumber}
            directionType={currentCard.directionType}
          />
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
        zIndex: 10001
      }}>
        卡片 {currentIndex + 1} / {totalCards}（到期 {counters.due} | 新卡 {counters.fresh}）
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
      <SrsCardDemo
        front={currentCard.front}
        back={currentCard.back}
        onGrade={handleGrade}
        onBury={handleBury}
        onSuspend={handleSuspend}
        onClose={onClose}
        srsInfo={currentCard.srs}
        isGrading={isGrading}
        blockId={currentCard.id}
        onJumpToCard={handleJumpToCard}
        panelId={panelId}
        pluginName={pluginName}
        clozeNumber={currentCard.clozeNumber}
        directionType={currentCard.directionType}
      />
    </div>
  )
}
