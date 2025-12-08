/**
 * SRS 复习会话组件（使用真实数据队列）
 */
import type { DbId } from "../orca.d.ts"
import type { Grade, ReviewCard } from "../srs/types"
import { updateSrsState } from "../srs/storage"
import SrsCardDemo from "./SrsCardDemo"

// 从全局 window 对象获取 React（Orca 插件约定）
const { useMemo, useState } = window.React
const { Button, ModalOverlay } = orca.components

type SrsReviewSessionProps = {
  cards: ReviewCard[]
  onClose?: () => void
  onJumpToCard?: (blockId: DbId) => void
  inSidePanel?: boolean
  panelId?: string
}

export default function SrsReviewSession({
  cards,
  onClose,
  onJumpToCard,
  inSidePanel = false,
  panelId
}: SrsReviewSessionProps) {
  const [queue, setQueue] = useState<ReviewCard[]>(cards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [isGrading, setIsGrading] = useState(false)
  const [lastLog, setLastLog] = useState<string | null>(null)

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
    const result = await updateSrsState(currentCard.id, grade)

    const updatedCard: ReviewCard = { ...currentCard, srs: result.state, isNew: false }
    const nextQueue = [...queue]
    nextQueue[currentIndex] = updatedCard
    setQueue(nextQueue)

    setLastLog(
      `评分 ${grade.toUpperCase()} -> 下次 ${result.state.due.toLocaleString()}，间隔 ${result.state.interval} 天，稳定度 ${result.state.stability.toFixed(2)}`
    )

    setReviewedCount((prev: number) => prev + 1)
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
      <div className="srs-review-session-panel" style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--orca-color-bg-0)"
      }}>
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
          backgroundColor: "var(--orca-color-bg-1)"
        }}>
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

        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          <SrsCardDemo
            front={currentCard.front}
            back={currentCard.back}
            onGrade={handleGrade}
            onClose={onClose}
            srsInfo={currentCard.srs}
            isGrading={isGrading}
            blockId={currentCard.id}
            onJumpToCard={handleJumpToCard}
            inSidePanel={true}
            panelId={panelId}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="srs-review-session">
      {/* 复习进度条 */}
      <div style={{
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
      <div style={{
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
        <div style={{
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
        onClose={onClose}
        srsInfo={currentCard.srs}
        isGrading={isGrading}
        blockId={currentCard.id}
        onJumpToCard={handleJumpToCard}
        panelId={panelId}
      />
    </div>
  )
}
