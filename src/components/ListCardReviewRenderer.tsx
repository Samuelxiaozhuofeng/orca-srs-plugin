/**
 * 列表卡复习渲染器
 *
 * - 列表条目来源：父块的直接子块（children）
 * - 当前条目：由 listItemIndex/listItemId 指定
 * - 辅助预览：允许评分，但不计入统计、不更新 SRS
 */

const { useEffect, useMemo, useRef, useState } = window.React
const { useSnapshot } = window.Valtio
const { Button } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, previewDueDates, formatInterval, formatDueDate } from "../srs/algorithm"
import { removeHashTags } from "../srs/blockUtils"

type ListCardReviewRendererProps = {
  blockId: DbId
  listItemId: DbId
  listItemIndex: number
  listItemIds: DbId[]
  isAuxiliaryPreview?: boolean
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void
  onPrevious?: () => void
  canGoPrevious?: boolean
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
}

export default function ListCardReviewRenderer({
  blockId,
  listItemId,
  listItemIndex,
  listItemIds,
  isAuxiliaryPreview = false,
  onGrade,
  onPostpone,
  onSuspend,
  onClose,
  onSkip,
  onPrevious,
  canGoPrevious = false,
  srsInfo,
  isGrading = false,
  onJumpToCard,
  inSidePanel = false,
  panelId,
}: ListCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(false)

  const prevCardKeyRef = useRef<string>("")
  const currentCardKey = `${blockId}-${listItemId}`

  useEffect(() => {
    if (prevCardKeyRef.current !== currentCardKey) {
      setShowAnswer(false)
      prevCardKeyRef.current = currentCardKey
    }
  }, [currentCardKey])

  const snapshot = useSnapshot(orca.state)

  const parentBlock = useMemo(() => {
    const blocks = snapshot?.blocks ?? {}
    return blocks[blockId]
  }, [snapshot?.blocks, blockId])

  const itemTexts = useMemo<string[]>(() => {
    const blocks = snapshot?.blocks ?? {}
    return listItemIds.map((id) => {
      const b = blocks[id]
      const text = (b?.text ?? "").trim()
      return text ? removeHashTags(text) : "（加载中...）"
    })
  }, [snapshot?.blocks, listItemIds])

  const title = useMemo(() => {
    const raw = (parentBlock?.text ?? "").trim()
    return raw ? removeHashTags(raw) : "列表卡"
  }, [parentBlock?.text])

  const handleGrade = async (grade: Grade) => {
    if (isGrading) return
    await onGrade(grade)
    setShowAnswer(false)
  }

  useReviewShortcuts({
    showAnswer,
    isGrading,
    onShowAnswer: () => setShowAnswer(true),
    onGrade: handleGrade,
    onBury: onPostpone,
    onSuspend,
  })

  const intervals = useMemo(() => {
    const fullState: SrsState | null = srsInfo
      ? {
          stability: srsInfo.stability ?? 0,
          difficulty: srsInfo.difficulty ?? 0,
          interval: srsInfo.interval ?? 0,
          due: srsInfo.due ?? new Date(),
          lastReviewed: srsInfo.lastReviewed ?? null,
          reps: srsInfo.reps ?? 0,
          lapses: srsInfo.lapses ?? 0,
          state: srsInfo.state,
        }
      : null
    return previewIntervals(fullState)
  }, [srsInfo])

  const dueDates = useMemo(() => {
    const fullState: SrsState | null = srsInfo
      ? {
          stability: srsInfo.stability ?? 0,
          difficulty: srsInfo.difficulty ?? 0,
          interval: srsInfo.interval ?? 0,
          due: srsInfo.due ?? new Date(),
          lastReviewed: srsInfo.lastReviewed ?? null,
          reps: srsInfo.reps ?? 0,
          lapses: srsInfo.lapses ?? 0,
          state: srsInfo.state,
        }
      : null
    return previewDueDates(fullState)
  }, [srsInfo])

  if (!parentBlock) {
    return (
      <div style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "32px",
        textAlign: "center",
        color: "var(--orca-color-text-2)"
      }}>
        <div style={{ fontSize: "16px", marginBottom: "8px" }}>列表卡已被删除或未加载</div>
        <div style={{ fontSize: "14px", opacity: 0.7 }}>请跳过此卡片继续复习</div>
        {onSkip && (
          <Button variant="outline" onClick={onSkip} style={{ marginTop: "16px" }}>
            跳过
          </Button>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: inSidePanel ? "12px" : "16px" }}>
      {isAuxiliaryPreview && (
        <div
          contentEditable={false}
          style={{
            marginBottom: "10px",
            padding: "8px 12px",
            borderRadius: "10px",
            backgroundColor: "var(--orca-color-warning-1)",
            color: "var(--orca-color-warning-6)",
            fontSize: "13px",
            fontWeight: 600
          }}
        >
          辅助预览：允许评分，但不计入统计，也不会更新记忆状态
        </div>
      )}

      <div style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)"
      }}>
        <div contentEditable={false} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
          opacity: 0.75
        }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {onPrevious && (
              <Button
                variant="plain"
                onClick={canGoPrevious ? onPrevious : undefined}
                title="回到上一张"
                style={{
                  padding: "4px 6px",
                  fontSize: "14px",
                  opacity: canGoPrevious ? 1 : 0.3,
                  cursor: canGoPrevious ? "pointer" : "not-allowed",
                }}
              >
                <i className="ti ti-arrow-left" />
              </Button>
            )}
          </div>

          <div style={{ display: "flex", gap: "2px" }}>
            {onPostpone && (
              <Button
                variant="plain"
                onClick={onPostpone}
                title="推迟到明天 (B)"
                style={{ padding: "4px 6px", fontSize: "14px" }}
              >
                <i className="ti ti-calendar-pause" />
              </Button>
            )}
            {onSuspend && (
              <Button
                variant="plain"
                onClick={onSuspend}
                title="暂停卡片 (S)"
                style={{ padding: "4px 6px", fontSize: "14px" }}
              >
                <i className="ti ti-player-pause" />
              </Button>
            )}
            {onJumpToCard && (
              <Button
                variant="plain"
                onClick={() => onJumpToCard(blockId)}
                title="跳转到卡片"
                style={{ padding: "4px 6px", fontSize: "14px" }}
              >
                <i className="ti ti-external-link" />
              </Button>
            )}
            {onClose && (
              <Button
                variant="plain"
                onClick={onClose}
                title="关闭 (Esc)"
                style={{ padding: "4px 6px", fontSize: "14px" }}
              >
                <i className="ti ti-x" />
              </Button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "14px", color: "var(--orca-color-text-2)", marginBottom: "6px" }}>
            {title}
          </div>
          <div style={{ fontSize: "13px", color: "var(--orca-color-text-3)" }}>
            条目 {listItemIndex} / {listItemIds.length}
          </div>
        </div>

        <ol style={{
          margin: 0,
          paddingLeft: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          {itemTexts.map((text: string, idx: number) => {
            const isCurrent = idx + 1 === listItemIndex
            const display = isCurrent && !showAnswer ? "[...]" : text
            const highlight = isCurrent && showAnswer
            return (
              <li
                key={listItemIds[idx]}
                style={{
                  color: highlight ? "var(--orca-color-primary-6)" : "var(--orca-color-text-1)",
                  fontWeight: highlight ? 700 : 500,
                  backgroundColor: highlight ? "var(--orca-color-primary-1)" : "transparent",
                  borderRadius: "8px",
                  padding: highlight ? "6px 8px" : "0"
                }}
              >
                {display}
              </li>
            )
          })}
        </ol>

        <div contentEditable={false} style={{
          display: "flex",
          gap: "8px",
          marginTop: "16px",
          flexWrap: "wrap"
        }}>
          {!showAnswer ? (
            <Button
              variant="solid"
              onClick={isGrading ? undefined : () => setShowAnswer(true)}
              style={{
                flex: "1 1 160px",
                opacity: isGrading ? 0.6 : 1,
                cursor: isGrading ? "not-allowed" : "pointer"
              }}
            >
              显示答案（空格）
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={isGrading ? undefined : () => handleGrade("again")}
                style={{
                  flex: "1 1 140px",
                  opacity: isGrading ? 0.6 : 1,
                  cursor: isGrading ? "not-allowed" : "pointer"
                }}
              >
                Again · {formatInterval(intervals.again)} · {formatDueDate(dueDates.again)}
              </Button>
              <Button
                variant="outline"
                onClick={isGrading ? undefined : () => handleGrade("hard")}
                style={{
                  flex: "1 1 140px",
                  opacity: isGrading ? 0.6 : 1,
                  cursor: isGrading ? "not-allowed" : "pointer"
                }}
              >
                Hard · {formatInterval(intervals.hard)} · {formatDueDate(dueDates.hard)}
              </Button>
              <Button
                variant="outline"
                onClick={isGrading ? undefined : () => handleGrade("good")}
                style={{
                  flex: "1 1 140px",
                  opacity: isGrading ? 0.6 : 1,
                  cursor: isGrading ? "not-allowed" : "pointer"
                }}
              >
                Good · {formatInterval(intervals.good)} · {formatDueDate(dueDates.good)}
              </Button>
              <Button
                variant="outline"
                onClick={isGrading ? undefined : () => handleGrade("easy")}
                style={{
                  flex: "1 1 140px",
                  opacity: isGrading ? 0.6 : 1,
                  cursor: isGrading ? "not-allowed" : "pointer"
                }}
              >
                Easy · {formatInterval(intervals.easy)} · {formatDueDate(dueDates.easy)}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
