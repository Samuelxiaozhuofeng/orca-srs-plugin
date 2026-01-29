/**
 * 渐进阅读会话组件
 */
import type { IRCard } from "../srs/incrementalReadingCollector"
import { completeIRCard, markAsRead, updatePosition, updatePriority } from "../srs/irSessionActions"
import IncrementalReadingBreadcrumb from "./IncrementalReadingBreadcrumb"

const { useEffect, useState } = window.React
const { Button, Block: OrcaBlock, ConfirmBox } = orca.components
type IncrementalReadingSessionProps = {
  cards: IRCard[]
  panelId: string
  pluginName?: string
  onClose?: () => void
}

function formatSimpleDate(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}-${day}`
}

export default function IncrementalReadingSessionDemo({
  cards,
  panelId,
  onClose
}: IncrementalReadingSessionProps) {
  const [queue, setQueue] = useState<IRCard[]>(cards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isWorking, setIsWorking] = useState<boolean>(false)
  const buttonStyle = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined

  const currentCard = queue[currentIndex]
  const isTopicCard = currentCard?.cardType === "topic"

  useEffect(() => {
    setQueue(cards)
    setCurrentIndex(0)
  }, [cards])

  const removeCardAtIndex = (index: number) => {
    setQueue((prev: IRCard[]) => {
      const next = prev.filter((_: IRCard, idx: number) => idx !== index)
      const nextIndex = next.length === 0
        ? 0
        : Math.min(index, next.length - 1)
      setCurrentIndex(nextIndex)
      return next
    })
  }

  const handleMarkRead = async () => {
    if (!currentCard || isWorking) return
    setIsWorking(true)

    try {
      await markAsRead(currentCard.id)
      removeCardAtIndex(currentIndex)
      orca.notify("success", "已标记为已读", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 标记已读失败:", error)
      orca.notify("error", "标记已读失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const pickNextPriority = (current: number): number => {
    // 复用现有数值优先级分段：高(>=8) / 中(4-7) / 低(<=3)
    if (current >= 8) return 5
    if (current >= 4) return 2
    return 9
  }

  const handleTogglePriority = async () => {
    console.log("[IR Session] toggle priority click", {
      hasCard: Boolean(currentCard),
      isTopicCard,
      isWorking,
      currentIndex,
      cardId: currentCard?.id,
      priority: currentCard?.priority
    })
    if (!currentCard || !isTopicCard || isWorking) {
      console.log("[IR Session] toggle priority ignored", {
        reason: !currentCard ? "no-card" : isWorking ? "working" : "not-topic"
      })
      return
    }
    setIsWorking(true)

    try {
      const next = pickNextPriority(currentCard.priority)
      console.log("[IR Session] toggle priority next", { cardId: currentCard.id, from: currentCard.priority, to: next })
      const nextState = await updatePriority(currentCard.id, next)
      console.log("[IR Session] toggle priority updated", { cardId: currentCard.id, priority: nextState.priority })
      setQueue((prev: IRCard[]) => prev.map((card: IRCard, idx: number) =>
        idx === currentIndex ? { ...card, priority: nextState.priority } : card
      ))
      orca.notify("success", "已切换优先级", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 切换优先级失败:", error)
      orca.notify("error", "切换优先级失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const computeMovedPosition = (
    direction: "forward" | "back",
    indices: number[],
    topicPos: number
  ): number | null => {
    const currentTopicIndex = indices[topicPos]
    if (currentTopicIndex === undefined) return null

    if (direction === "forward") {
      if (topicPos <= 0) return null
      const prevTopicIndex = indices[topicPos - 1]
      const prevPrevTopicIndex = indices[topicPos - 2]
      const prevPos = queue[prevTopicIndex]?.position ?? Date.now()
      const prevPrevPos = prevPrevTopicIndex !== undefined ? (queue[prevPrevTopicIndex]?.position ?? null) : null
      return prevPrevPos !== null ? (prevPrevPos + prevPos) / 2 : prevPos - 1
    }

    if (topicPos >= indices.length - 1) return null
    const nextTopicIndex = indices[topicPos + 1]
    const nextNextTopicIndex = indices[topicPos + 2]
    const nextPos = queue[nextTopicIndex]?.position ?? Date.now()
    const nextNextPos = nextNextTopicIndex !== undefined ? (queue[nextNextTopicIndex]?.position ?? null) : null
    return nextNextPos !== null ? (nextPos + nextNextPos) / 2 : nextPos + 1
  }

  const handleMoveTopic = async (direction: "forward" | "back") => {
    console.log("[IR Session] move topic click", {
      direction,
      hasCard: Boolean(currentCard),
      isTopicCard,
      isWorking,
      currentIndex,
      cardId: currentCard?.id,
      position: currentCard?.position
    })
    if (!currentCard || !isTopicCard || isWorking) {
      console.log("[IR Session] move topic ignored", {
        reason: !currentCard ? "no-card" : isWorking ? "working" : "not-topic"
      })
      return
    }

    const topicIndices = queue
      .map((card: IRCard, idx: number) => card.cardType === "topic" ? idx : -1)
      .filter((idx: number) => idx >= 0)
    console.log("[IR Session] move topic indices", { topicIndices })

    const topicPos = topicIndices.indexOf(currentIndex)
    if (topicPos < 0) {
      console.log("[IR Session] move topic ignored", { reason: "topic-not-found", currentIndex })
      return
    }

    const newPosition = computeMovedPosition(direction, topicIndices, topicPos)
    if (newPosition === null) {
      console.log("[IR Session] move topic ignored", { reason: "no-new-position", topicPos, topicIndices })
      return
    }

    const targetIndex = direction === "forward"
      ? topicIndices[topicPos - 1]
      : topicIndices[topicPos + 1]

    if (targetIndex === undefined) {
      console.log("[IR Session] move topic ignored", { reason: "no-target-index", topicPos, topicIndices })
      return
    }

    setIsWorking(true)

    try {
      console.log("[IR Session] move topic updating", { cardId: currentCard.id, newPosition, targetIndex })
      await updatePosition(currentCard.id, newPosition)
      console.log("[IR Session] move topic updated", { cardId: currentCard.id, newPosition })

      setQueue((prev: IRCard[]) => {
        const next: IRCard[] = [...prev]
        const removed = next.splice(currentIndex, 1)[0]
        const moved = { ...removed, position: newPosition }
        const insertIndex = direction === "forward" ? targetIndex : targetIndex
        next.splice(insertIndex, 0, moved)
        setCurrentIndex(insertIndex)
        return next
      })

      orca.notify("success", direction === "forward" ? "已靠前" : "已靠后", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 推送 Topic 失败:", error)
      orca.notify("error", "推送失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const handleSkip = () => {
    if (!currentCard || isWorking) return
    removeCardAtIndex(currentIndex)
  }

  const handleDelete = async () => {
    if (!currentCard || isWorking) return
    setIsWorking(true)

    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.deleteBlocks",
        null,
        [currentCard.id]
      )
      removeCardAtIndex(currentIndex)
      orca.notify("success", "已删除当前块", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 删除失败:", error)
      orca.notify("error", "删除失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const handleCompleteRead = async () => {
    if (!currentCard || isWorking) return
    setIsWorking(true)

    try {
      await completeIRCard(currentCard.id)
      removeCardAtIndex(currentIndex)
      orca.notify("success", "已读完并移出队列", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 读完处理失败:", error)
      orca.notify("error", "读完处理失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const handleClose = () => {
    if (onClose) {
      onClose()
    }
  }

  if (queue.length === 0) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "24px",
        alignItems: "center",
        justifyContent: "center",
        height: "100%"
      }}>
        <div style={{ color: "var(--orca-color-text-2)" }}>暂无到期的渐进阅读卡片</div>
        {onClose && (
          <Button variant="plain" onClick={handleClose}>
            关闭
          </Button>
        )}
      </div>
    )
  }

  if (!currentCard) {
    return null
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      height: "100%",
      overflow: "auto"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>
          进度 {currentIndex + 1} / {queue.length}
        </div>
        {onClose && (
          <Button variant="plain" onClick={handleClose}>
            关闭
          </Button>
        )}
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "12px",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        background: "var(--orca-color-bg-2)"
      }}>
        <IncrementalReadingBreadcrumb blockId={currentCard.id} panelId={panelId} />
        <div style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          fontSize: "12px",
          color: "var(--orca-color-text-2)"
        }}>
          <span>类型：{currentCard.cardType}</span>
          <span>到期：{formatSimpleDate(currentCard.due)}</span>
        </div>
      </div>

      <div style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap"
      }}>
        {isTopicCard ? (
          <>
            <Button variant="solid" onClick={handleMarkRead} style={buttonStyle}>
              已读
            </Button>
            <Button variant="plain" onClick={() => handleMoveTopic("forward")} style={buttonStyle}>
              靠前
            </Button>
            <Button variant="plain" onClick={() => handleMoveTopic("back")} style={buttonStyle}>
              靠后
            </Button>
            <Button variant="plain" onClick={handleTogglePriority} style={buttonStyle}>
              优先级切换
            </Button>
          </>
        ) : (
          <Button variant="solid" onClick={handleMarkRead} style={buttonStyle}>
            标记已读
          </Button>
        )}
        <Button variant="plain" onClick={handleSkip} style={buttonStyle}>
          跳过
        </Button>
        <ConfirmBox
          text="确认读完当前卡片？将移除 #card 标签并清除 SRS/IR 状态。"
          onConfirm={async (_e, close) => {
            await handleCompleteRead()
            close()
          }}
        >
          {(open) => (
            <Button variant="plain" onClick={open} style={buttonStyle}>
              读完
            </Button>
          )}
        </ConfirmBox>
        <Button variant="plain" onClick={handleDelete} style={buttonStyle}>
          删除
        </Button>
      </div>

      <div style={{
        flex: 1,
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "12px",
        background: "var(--orca-color-bg-1)"
      }}>
        <OrcaBlock
          panelId={panelId}
          blockId={currentCard.id}
          blockLevel={0}
          indentLevel={0}
        />
      </div>
    </div>
  )
}
