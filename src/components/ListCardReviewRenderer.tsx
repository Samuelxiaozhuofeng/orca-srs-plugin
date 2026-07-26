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
import { previewIntervals, previewDueDates, formatDueDate } from "../srs/algorithm"
import { removeHashTags } from "../srs/blockUtils"
import CardInfoPanel from "./review-card/CardInfoPanel"

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
  /** F2-08：预览间隔读取同一插件 FSRS 设置 */
  pluginName: string
  readOnly?: boolean
  readOnlyStatusText?: string
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
  pluginName,
  readOnly = false,
  readOnlyStatusText,
}: ListCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(!!readOnly)
  const [showCardInfo, setShowCardInfo] = useState(false)

  const prevCardKeyRef = useRef<string>("")
  const currentCardKey = `${blockId}-${listItemId}`

  useEffect(() => {
    if (prevCardKeyRef.current !== currentCardKey) {
      setShowAnswer(!!readOnly)
      setShowCardInfo(false)
      prevCardKeyRef.current = currentCardKey
    } else if (readOnly) {
      setShowAnswer(true)
    }
  }, [currentCardKey, readOnly])

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
    if (isGrading || readOnly) return
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
    readOnly,
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
    return previewIntervals(fullState, undefined, pluginName)
  }, [srsInfo, pluginName])

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
    return previewDueDates(fullState, undefined, pluginName)
  }, [srsInfo, pluginName])

  if (!parentBlock) {
    return (
      <div className="srs-review-card-placeholder">列表卡加载中...</div>
    )
  }

  return (
    <div
      className={`srs-review-list-shell ${
        inSidePanel ? "srs-review-list-shell--side" : ""
      }`}
    >
      {isAuxiliaryPreview && (
        <div contentEditable={false} className="srs-review-banner">
          辅助预览：允许评分，但不计入统计，也不会更新记忆状态
        </div>
      )}

      <div className="srs-review-card">
        {/* 顶部工具栏 */}
        <div contentEditable={false} className="srs-review-toolbar">
          {/* 左侧：回到上一张按钮 + 卡片类型标识 */}
          <div className="srs-review-toolbar__group">
            {onPrevious && (
              <Button
                variant="plain"
                onClick={canGoPrevious ? onPrevious : undefined}
                title="回到上一张"
                className={`srs-review-icon-btn ${
                  canGoPrevious ? "" : "srs-review-icon-btn--disabled"
                }`}
              >
                <i className="ti ti-arrow-left" />
              </Button>
            )}
            <div className="srs-review-type-chip srs-review-type-chip--success">
              <i className="ti ti-list-numbers" />
              列表卡
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <div className="srs-review-toolbar__group">
            {!readOnly && onPostpone && (
              <Button
                variant="plain"
                onClick={onPostpone}
                title="推迟到明天 (B)"
                className="srs-review-icon-btn"
              >
                <i className="ti ti-calendar-pause" />
              </Button>
            )}
            {!readOnly && onSuspend && (
              <Button
                variant="plain"
                onClick={onSuspend}
                title="暂停卡片 (S)"
                className="srs-review-icon-btn"
              >
                <i className="ti ti-player-pause" />
              </Button>
            )}
            {onJumpToCard && (
              <Button
                variant="plain"
                onClick={(e: React.MouseEvent) => onJumpToCard(blockId, e.shiftKey)}
                title="跳转到卡片 (Shift+点击在侧面板打开)"
                className="srs-review-icon-btn"
              >
                <i className="ti ti-external-link" />
              </Button>
            )}
            {/* 卡片信息按钮 */}
            <Button
              variant="plain"
              onClick={() => setShowCardInfo(!showCardInfo)}
              title="卡片信息"
              className={`srs-review-icon-btn ${
                showCardInfo ? "srs-review-icon-btn--active" : ""
              }`}
            >
              <i className="ti ti-info-circle" />
            </Button>
          </div>
        </div>

        {/* 可折叠的卡片信息面板 */}
        {showCardInfo && <CardInfoPanel srsInfo={srsInfo} />}

        {/* 题目区域 */}
        <div className="srs-review-face">
          <div className="srs-review-list-prompt__title">
            {title}
          </div>
          <div className="srs-review-list-prompt__counter">
            条目 {listItemIndex} / {listItemIds.length}
          </div>
        </div>

        {/* 列表内容 */}
        <ol className="srs-review-list">
          {itemTexts.map((text: string, idx: number) => {
            const isCurrent = idx + 1 === listItemIndex
            const display = isCurrent && !showAnswer ? "[...]" : text
            const highlight = isCurrent && showAnswer
            return (
              <li
                key={listItemIds[idx]}
                className={`srs-review-list__item ${
                  highlight ? "srs-review-list__item--highlight" : ""
                }`}
              >
                {display}
              </li>
            )
          })}
        </ol>

        {readOnly && (
          <div contentEditable={false} className="srs-review-banner">
            {readOnlyStatusText ?? "只读回看"}
          </div>
        )}

        {/* 显示答案按钮 / 评分按钮 / 只读继续 */}
        {readOnly ? (
          <div className="srs-review-actions">
            {onSkip && (
              <Button
                variant="solid"
                onClick={onSkip}
                title="继续复习"
                className="srs-review-cta"
              >
                继续
              </Button>
            )}
          </div>
        ) : !showAnswer ? (
          <div className="srs-review-actions">
            {/* 跳过按钮 - 在答案未显示时也可用 */}
            {onSkip && (
              <Button
                variant="outline"
                onClick={onSkip}
                title="跳过当前卡片，不评分"
                className="srs-review-secondary-btn"
              >
                跳过
              </Button>
            )}
            <Button
              variant="solid"
              onClick={isGrading ? undefined : () => setShowAnswer(true)}
              className={`srs-review-cta ${isGrading ? "srs-review-cta--busy" : ""}`}
            >
              显示答案
            </Button>
          </div>
        ) : (
          <div className="srs-card-grade-buttons srs-grade-buttons">
            {/* 跳过按钮 */}
            {onSkip && (
              <button
                onClick={onSkip}
                className="srs-grade-btn srs-grade-btn--skip"
              >
                <div className="srs-grade-btn__preview">不评分</div>
                <span className="srs-grade-btn__emoji">⏭️</span>
                <span className="srs-grade-btn__label">跳过</span>
              </button>
            )}

            <button
              onClick={() => handleGrade("again")}
              className={`srs-grade-btn srs-grade-btn--again ${
                isGrading ? "srs-grade-btn--busy" : ""
              }`}
            >
              <div className="srs-grade-btn__preview">{formatDueDate(dueDates.again)}</div>
              <span className="srs-grade-btn__emoji">😞</span>
              <span className="srs-grade-btn__label">忘记</span>
            </button>

            <button
              onClick={() => handleGrade("hard")}
              className={`srs-grade-btn srs-grade-btn--hard ${
                isGrading ? "srs-grade-btn--busy" : ""
              }`}
            >
              <div className="srs-grade-btn__preview">{formatDueDate(dueDates.hard)}</div>
              <span className="srs-grade-btn__emoji">😐</span>
              <span className="srs-grade-btn__label">困难</span>
            </button>

            <button
              onClick={() => handleGrade("good")}
              className={`srs-grade-btn srs-grade-btn--good ${
                isGrading ? "srs-grade-btn--busy" : ""
              }`}
            >
              <div className="srs-grade-btn__preview">{formatDueDate(dueDates.good)}</div>
              <span className="srs-grade-btn__emoji">😊</span>
              <span className="srs-grade-btn__label">良好</span>
            </button>

            <button
              onClick={() => handleGrade("easy")}
              className={`srs-grade-btn srs-grade-btn--easy ${
                isGrading ? "srs-grade-btn--busy" : ""
              }`}
            >
              <div className="srs-grade-btn__preview">{formatDueDate(dueDates.easy)}</div>
              <span className="srs-grade-btn__emoji">😄</span>
              <span className="srs-grade-btn__label">简单</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
