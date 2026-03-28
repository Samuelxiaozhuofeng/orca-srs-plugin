/**
 * 渐进阅读会话组件
 */
import type { CursorData, DbId } from "../orca.d.ts"
import type { IRCard } from "../srs/incrementalReadingCollector"
import type { IRReadingBreakpointSelection } from "../srs/incrementalReadingStorage"
import { completeIRCard, markAsRead, markAsReadWithPriorityShift, postpone, updatePriority } from "../srs/irSessionActions"
import { updateReadingBreakpoint } from "../srs/incrementalReadingStorage"
import IncrementalReadingBreadcrumb from "./IncrementalReadingBreadcrumb"

const { useEffect, useRef, useState } = window.React
const { Button, Block: OrcaBlock, ConfirmBox } = orca.components
const BREAKPOINT_SAVE_DELAY_MS = 180
const RESTORE_ON_RESIZE_THRESHOLD = 40
const RESTORE_ON_RESIZE_DELAY_MS = 220

type SessionCard = IRCard & {
  isCardMaking?: boolean
}
type IncrementalReadingSessionProps = {
  cards: IRCard[]
  panelId: string
  pluginName?: string
  dailyLimit?: number
  totalDueCount?: number
  overflowCount?: number
  enableOverflowDefer?: boolean
  onDeferOverflow?: () => Promise<number>
  onClose?: () => void
}

function formatSimpleDate(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}-${day}`
}

function formatIntervalDays(days: number): string {
  if (!Number.isFinite(days)) return "-"
  const rounded = Math.round(days * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}d` : `${rounded}d`
}

function findBlockElement(container: HTMLElement, blockId: DbId): HTMLElement | null {
  const selectors = [
    `#block-${blockId}`,
    `[data-block-id="${blockId}"]`,
    `[data-blockid="${blockId}"]`,
    `[data-id="${blockId}"]`,
    `[blockid="${blockId}"]`
  ]

  for (const selector of selectors) {
    const el = container.querySelector<HTMLElement>(selector)
    if (el) return el
  }

  return null
}

function buildSelectionFromCursor(cursor: CursorData): IRReadingBreakpointSelection {
  return {
    rootBlockId: cursor.rootBlockId,
    anchor: { ...cursor.anchor },
    focus: { ...cursor.focus },
    isForward: cursor.isForward
  }
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "2px 8px",
      borderRadius: "999px",
      border: "1px solid var(--orca-color-border-1)",
      background: "var(--orca-color-bg-1)",
      fontSize: "12px",
      lineHeight: 1.6,
      whiteSpace: "nowrap"
    }}>
      <span style={{ color: "var(--orca-color-text-3)" }}>{label}</span>
      <span style={{ color: "var(--orca-color-text-2)" }}>{value}</span>
    </span>
  )
}

export default function IncrementalReadingSessionDemo({
  cards,
  panelId,
  dailyLimit,
  totalDueCount,
  overflowCount,
  enableOverflowDefer = true,
  onDeferOverflow,
  onClose
}: IncrementalReadingSessionProps) {
  const [queue, setQueue] = useState<SessionCard[]>(cards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [previewBlockId, setPreviewBlockId] = useState<DbId | null>(null)
  const [isWorking, setIsWorking] = useState<boolean>(false)
  const [restoreVersion, setRestoreVersion] = useState(0)
  const sessionRootRef = useRef<HTMLDivElement | null>(null)
  const currentCardContainerRef = useRef<HTMLDivElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const autoJumpedCardIdRef = useRef<number | null>(null)
  const restoredCardIdRef = useRef<number | null>(null)
  const selectionSaveTimerRef = useRef<number | null>(null)
  const resizeRestoreTimerRef = useRef<number | null>(null)
  const containerWidthRef = useRef<number | null>(null)
  const buttonStyle = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined

  const currentCard = queue[currentIndex]
  const isTopicCard = currentCard?.cardType === "topic"
  const isCardMaking = Boolean(!isTopicCard && currentCard?.isCardMaking)
  const shouldShowPreview = Boolean(previewBlockId && currentCard && previewBlockId !== currentCard.id)

  useEffect(() => {
    if (!currentCard) return
    autoJumpedCardIdRef.current = null
    restoredCardIdRef.current = null
    const nextPreviewBlockId = currentCard.readingBreakpoint?.previewBlockId
    setPreviewBlockId(nextPreviewBlockId && nextPreviewBlockId !== currentCard.id ? nextPreviewBlockId : null)
  }, [currentCard?.id])

  useEffect(() => {
    if (!currentCard) return

    const breakpointSelection = currentCard.readingBreakpoint?.selection ?? null
    const targetRootBlockId = breakpointSelection?.rootBlockId ?? currentCard.id
    const targetBlockId = breakpointSelection?.focus.blockId ?? currentCard.resumeBlockId
    if (!targetBlockId) return
    if (autoJumpedCardIdRef.current === currentCard.id || restoredCardIdRef.current === currentCard.id) return

    const container = targetRootBlockId === currentCard.id
      ? currentCardContainerRef.current
      : previewContainerRef.current
    if (!container) return

    if (targetRootBlockId !== currentCard.id && previewBlockId !== targetRootBlockId) {
      return
    }

    let cancelled = false

    const tryRestore = async (): Promise<boolean> => {
      const el = findBlockElement(container, targetBlockId)
      if (!el) return false
      el.scrollIntoView({ behavior: "smooth", block: "center" })

      if (breakpointSelection) {
        try {
          await orca.utils.setSelectionFromCursorData({
            ...breakpointSelection,
            panelId,
            rootBlockId: breakpointSelection.rootBlockId
          })
        } catch (error) {
          console.warn("[IR Session] 恢复阅读选区失败:", error)
        }
      }

      autoJumpedCardIdRef.current = currentCard.id
      restoredCardIdRef.current = currentCard.id
      return true
    }

    let attempts = 0
    const tick = () => {
      if (cancelled) return
      attempts += 1
      void tryRestore().then(restored => {
        if (cancelled || restored || attempts >= 8) return
        setTimeout(tick, 250)
      })
    }

    setTimeout(tick, 50)
    return () => {
      cancelled = true
    }
  }, [currentCard?.id, currentCard?.resumeBlockId, currentCard?.readingBreakpoint, previewBlockId, panelId, restoreVersion])

  useEffect(() => {
    setQueue(cards)
    setCurrentIndex(0)
  }, [cards])

  useEffect(() => () => {
    if (selectionSaveTimerRef.current !== null) {
      window.clearTimeout(selectionSaveTimerRef.current)
      selectionSaveTimerRef.current = null
    }
    if (resizeRestoreTimerRef.current !== null) {
      window.clearTimeout(resizeRestoreTimerRef.current)
      resizeRestoreTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const root = sessionRootRef.current
    if (!root) return

    const scheduleRestore = () => {
      if (resizeRestoreTimerRef.current !== null) {
        window.clearTimeout(resizeRestoreTimerRef.current)
      }
      resizeRestoreTimerRef.current = window.setTimeout(() => {
        resizeRestoreTimerRef.current = null
        autoJumpedCardIdRef.current = null
        restoredCardIdRef.current = null
        setRestoreVersion((prev: number) => prev + 1)
      }, RESTORE_ON_RESIZE_DELAY_MS)
    }

    const handleWidthChange = (width: number) => {
      const prevWidth = containerWidthRef.current
      containerWidthRef.current = width
      if (prevWidth === null) return
      if (Math.abs(width - prevWidth) < RESTORE_ON_RESIZE_THRESHOLD) return
      scheduleRestore()
    }

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width
        if (typeof width === "number" && Number.isFinite(width)) {
          handleWidthChange(width)
        }
      })
      observer.observe(root)
      return () => {
        observer.disconnect()
      }
    }

    const handleWindowResize = () => {
      handleWidthChange(root.getBoundingClientRect().width)
    }

    handleWindowResize()
    window.addEventListener("resize", handleWindowResize)
    return () => {
      window.removeEventListener("resize", handleWindowResize)
    }
  }, [currentCard?.id])

  const patchCurrentCardState = (nextState: Partial<SessionCard>) => {
    if (!currentCard) return
    setQueue((prev: SessionCard[]) => prev.map((card: SessionCard, idx: number) =>
      idx === currentIndex ? { ...card, ...nextState } : card
    ))
  }

  const persistReadingBreakpoint = async (patch: {
    resumeBlockId?: DbId | null
    previewBlockId?: DbId | null
    selection?: IRReadingBreakpointSelection | null
  }) => {
    if (!currentCard) return
    try {
      const nextState = await updateReadingBreakpoint(currentCard.id, patch)
      patchCurrentCardState({
        resumeBlockId: nextState.resumeBlockId,
        readingBreakpoint: nextState.readingBreakpoint ?? null
      })
    } catch (error) {
      console.error("[IR Session] 保存阅读断点失败:", error)
    }
  }

  const captureReadingBreakpoint = () => {
    if (!currentCard) return

    const selection = window.getSelection()
    const cursor = orca.utils.getCursorDataFromSelection(selection)
    if (!cursor || cursor.panelId !== panelId) return

    const validRootIds = [currentCard.id]
    if (previewBlockId && previewBlockId !== currentCard.id) {
      validRootIds.push(previewBlockId)
    }
    if (!validRootIds.includes(cursor.rootBlockId)) return

    const selectionData = buildSelectionFromCursor(cursor)
    const nextPreviewBlockId = cursor.rootBlockId === currentCard.id
      ? (previewBlockId && previewBlockId !== currentCard.id ? previewBlockId : null)
      : cursor.rootBlockId

    void persistReadingBreakpoint({
      resumeBlockId: selectionData.focus.blockId,
      previewBlockId: nextPreviewBlockId,
      selection: selectionData
    })
  }

  const scheduleReadingBreakpointCapture = () => {
    if (selectionSaveTimerRef.current !== null) {
      window.clearTimeout(selectionSaveTimerRef.current)
    }
    selectionSaveTimerRef.current = window.setTimeout(() => {
      selectionSaveTimerRef.current = null
      captureReadingBreakpoint()
    }, BREAKPOINT_SAVE_DELAY_MS)
  }

  const handleBreadcrumbPreview = (targetId: DbId) => {
    if (!currentCard) return

    const nextPreviewBlockId = targetId === currentCard.id
      ? null
      : (previewBlockId === targetId ? null : targetId)

    setPreviewBlockId(nextPreviewBlockId)

    const selectionRootBlockId = currentCard.readingBreakpoint?.selection?.rootBlockId ?? null
    const shouldClearPreviewSelection = selectionRootBlockId !== null
      && selectionRootBlockId !== currentCard.id
      && selectionRootBlockId !== nextPreviewBlockId

    void persistReadingBreakpoint({
      previewBlockId: nextPreviewBlockId,
      selection: shouldClearPreviewSelection ? null : undefined
    })
  }

  const removeCardAtIndex = (index: number) => {
    setQueue((prev: SessionCard[]) => {
      const next = prev.filter((_: SessionCard, idx: number) => idx !== index)
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
      if (isCardMaking) {
        removeCardAtIndex(currentIndex)
        orca.notify("success", "已完成制卡并进入下一张", { title: "渐进阅读" })
        return
      }

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
    // 0-100：快速三档循环（20/50/80）
    if (current >= 70) return 50
    if (current >= 30) return 20
    return 80
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
        idx === currentIndex ? {
          ...card,
          priority: nextState.priority,
          due: nextState.due,
          intervalDays: nextState.intervalDays,
          postponeCount: nextState.postponeCount,
          stage: nextState.stage,
          lastAction: nextState.lastAction
        } : card
      ))
      orca.notify("success", "已切换优先级", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 切换优先级失败:", error)
      orca.notify("error", "切换优先级失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const handleAdjustPriority = async (direction: "forward" | "back") => {
    console.log("[IR Session] adjust priority click", {
      direction,
      hasCard: Boolean(currentCard),
      isWorking,
      currentIndex,
      cardId: currentCard?.id,
      cardType: currentCard?.cardType
    })
    if (!currentCard || isWorking) {
      console.log("[IR Session] adjust priority ignored", {
        reason: !currentCard ? "no-card" : "working"
      })
      return
    }

    setIsWorking(true)

    try {
      console.log("[IR Session] adjust priority updating", { cardId: currentCard.id, direction })
      await markAsReadWithPriorityShift(currentCard.id, currentCard.cardType, direction)
      removeCardAtIndex(currentIndex)
      orca.notify("success", direction === "forward" ? "已提高优先级并标记已读" : "已降低优先级并标记已读", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 调整优先级失败:", error)
      orca.notify("error", "调整优先级失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const handleMakeCard = async () => {
    if (!currentCard || isTopicCard || isCardMaking || isWorking) return
    setIsWorking(true)

    try {
      // 初始化为“普通块”：移除 #card + 清除 SRS/IR 数据，便于用 basic/cloze/direction 重新制卡
      await completeIRCard(currentCard.id)
      setQueue((prev: SessionCard[]) => prev.map((card: SessionCard, idx: number) =>
        idx === currentIndex ? { ...card, isCardMaking: true } : card
      ))
      orca.notify("success", "已初始化：现在可直接编辑并使用命令制卡；完成后点“已读”进入下一张", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 制卡初始化失败:", error)
      orca.notify("error", "制卡初始化失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
  }

  const handlePostpone = async () => {
    if (!currentCard || isCardMaking || isWorking) return
    setIsWorking(true)

    try {
      const result = await postpone(currentCard.id)
      removeCardAtIndex(currentIndex)
      orca.notify("success", `已推后 ${result.days} 天`, { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Session] 推后失败:", error)
      orca.notify("error", "推后失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
    }
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
    if (!currentCard || isCardMaking || isWorking) return
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

  const normalizedDailyLimit = typeof dailyLimit === "number" ? dailyLimit : 0
  const normalizedTotalDueCount = typeof totalDueCount === "number" ? totalDueCount : 0
  const normalizedOverflowCount = typeof overflowCount === "number" ? overflowCount : 0
  const canDeferOverflow = Boolean(
    enableOverflowDefer &&
    normalizedDailyLimit > 0 &&
    normalizedOverflowCount > 0 &&
    typeof onDeferOverflow === "function"
  )

  const handleDeferOverflow = async () => {
    if (!canDeferOverflow || !onDeferOverflow || isWorking) return
    setIsWorking(true)
    try {
      const deferredCount = await onDeferOverflow()
      if (deferredCount > 0) {
        orca.notify("success", `已推后溢出 ${deferredCount} 张`, { title: "渐进阅读" })
      } else {
        orca.notify("info", "当前没有需要推后的溢出卡片", { title: "渐进阅读" })
      }
    } catch (error) {
      console.error("[IR Session] 溢出推后失败:", error)
      orca.notify("error", "溢出推后失败", { title: "渐进阅读" })
    } finally {
      setIsWorking(false)
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
    }} ref={sessionRootRef} onMouseUp={scheduleReadingBreakpointCapture} onKeyUp={scheduleReadingBreakpointCapture}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px"
      }}>
        <div style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>
          进度 {currentIndex + 1} / {queue.length}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {normalizedDailyLimit > 0 ? (
            <>
              <MetaChip label="今日候选" value={`${normalizedTotalDueCount}`} />
              <MetaChip label="上限" value={`${normalizedDailyLimit}`} />
              {normalizedOverflowCount > 0 ? <MetaChip label="溢出" value={`${normalizedOverflowCount}`} /> : null}
            </>
          ) : null}
          {canDeferOverflow ? (
            <ConfirmBox
              text={`确认把溢出（未入选今天队列）的 ${normalizedOverflowCount} 张卡片推后吗？该操作会修改它们的排期。`}
              onConfirm={async (_e, close) => {
                await handleDeferOverflow()
                close()
              }}
            >
              {(open) => (
                <Button variant="outline" onClick={open} style={buttonStyle}>
                  一键把溢出推后
                </Button>
              )}
            </ConfirmBox>
          ) : null}
          {onClose ? (
            <Button variant="plain" onClick={handleClose}>
              关闭
            </Button>
          ) : null}
        </div>
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
        <IncrementalReadingBreadcrumb
          blockId={currentCard.id}
          panelId={panelId}
          cardType={currentCard.cardType}
          onItemClick={handleBreadcrumbPreview}
        />
        <div style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center"
        }}>
          <MetaChip label="类型" value={currentCard.cardType} />
          <MetaChip label="到期" value={formatSimpleDate(currentCard.due)} />
          <MetaChip
            label="调度"
            value={`Prio ${currentCard.priority} · ${formatIntervalDays(currentCard.intervalDays)} · 推后${currentCard.postponeCount}`}
          />
          <MetaChip
            label="状态"
            value={`${currentCard.stage} · ${currentCard.lastAction}`}
          />
        </div>
      </div>

      {shouldShowPreview ? (
        <div style={{
          border: "1px solid var(--orca-color-border-1)",
          borderRadius: "8px",
          padding: "12px",
          background: "var(--orca-color-bg-2)",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}>
          <div style={{ fontSize: "12px", color: "var(--orca-color-text-2)", fontWeight: 600 }}>
            上下文块
          </div>
          <div style={{
            border: "1px solid var(--orca-color-border-1)",
            borderRadius: "8px",
            padding: "12px",
            background: "var(--orca-color-bg-1)"
          }} ref={previewContainerRef}>
            <OrcaBlock
              panelId={panelId}
              blockId={previewBlockId!}
              blockLevel={0}
              indentLevel={0}
            />
          </div>
        </div>
      ) : null}

      <div style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap"
      }}>
        <Button variant="solid" onClick={handleMarkRead} style={buttonStyle}>
          {isTopicCard ? "已读" : (isCardMaking ? "下一张" : "标记已读")}
        </Button>
        {!isCardMaking ? (
          <>
            <Button variant="plain" onClick={() => handleAdjustPriority("forward")} style={buttonStyle}>
              靠前
            </Button>
            <Button variant="plain" onClick={() => handleAdjustPriority("back")} style={buttonStyle}>
              靠后
            </Button>
            {isTopicCard && (
              <Button variant="plain" onClick={handleTogglePriority} style={buttonStyle}>
                优先级切换
              </Button>
            )}
            {!isTopicCard && (
              <ConfirmBox
                text="确认进入制卡模式？将移除 #card 标签并清除 SRS/IR 状态，便于重新制卡。"
                onConfirm={async (_e, close) => {
                  await handleMakeCard()
                  close()
                }}
              >
                {(open) => (
                  <Button variant="plain" onClick={open} style={buttonStyle}>
                    制卡
                  </Button>
                )}
              </ConfirmBox>
            )}
            <Button variant="plain" onClick={handlePostpone} style={buttonStyle}>
              推后
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
          </>
        ) : null}
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
      }} ref={currentCardContainerRef}>
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
