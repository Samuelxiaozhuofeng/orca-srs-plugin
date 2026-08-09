/**
 * 方向卡复习渲染器
 *
 * 功能：
 * - 根据复习方向显示问题和答案
 * - 正向：左边是问题，右边是答案
 * - 反向：右边是问题，左边是答案
 */

const { useState, useMemo, useRef, useEffect } = window.React
const { useSnapshot } = window.Valtio
const { Button } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import { buildCardKey } from "../srs/cardIdentity"
import { extractDirectionInfo } from "../srs/directionUtils"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, previewDueDates } from "../srs/algorithm"
import CardInfoPanel from "./review-card/CardInfoPanel"
import ReviewGradeButtons from "./review-card/ReviewGradeButtons"

interface DirectionCardReviewRendererProps {
  blockId: DbId
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void  // 跳过当前卡片（只读时为继续）
  onPrevious?: () => void  // 回到上一张
  canGoPrevious?: boolean  // 是否可以回到上一张
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
  reviewDirection: "forward" | "backward" // 当前复习的方向
  readOnly?: boolean
  readOnlyStatusText?: string
}

export default function DirectionCardReviewRenderer({
  blockId,
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
  reviewDirection,
  readOnly = false,
  readOnlyStatusText,
}: DirectionCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(!!readOnly)
  const [showCardInfo, setShowCardInfo] = useState(false)

  // 用于追踪上一个卡片的唯一标识，检测卡片切换
  const prevCardKeyRef = useRef<string>("")
  const currentCardKey = buildCardKey({
    blockId,
    cardType: "direction",
    directionType: reviewDirection
  })

  // 当卡片变化时重置状态；只读回看默认展示答案
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
  const block = useMemo(() => {
    return snapshot?.blocks?.[blockId]
  }, [snapshot?.blocks, blockId])

  // 解析方向卡内容
  const dirInfo = useMemo(() => {
    return extractDirectionInfo(block?.content, pluginName)
  }, [block?.content, pluginName])

  // 处理评分
  const handleGrade = async (grade: Grade) => {
    if (isGrading || readOnly) return
    await onGrade(grade)
    setShowAnswer(false)
  }

  // 快捷键支持（空格显示答案，1-4 评分，b 推迟，s 暂停）
  useReviewShortcuts({
    showAnswer,
    isGrading,
    onShowAnswer: () => setShowAnswer(true),
    onGrade: handleGrade,
    onBury: onPostpone,
    onSuspend,
    readOnly,
    pluginName,
  })

  // 预览间隔
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
    // F2-08：与正式 nextReviewState 共用 pluginName → validated 配置
    return previewIntervals(fullState, undefined, pluginName)
  }, [srsInfo, pluginName])

  // 预览到期日期
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

  // 块数据可能只是尚未加载；不要误判为“已删除”
  if (!block) {
    return (
      <div className="srs-review-card-placeholder">卡片加载中...</div>
    )
  }

  if (!dirInfo) {
    return (
      <div className="srs-review-state srs-review-state--error">
        <div className="srs-review-state__error-text">无法解析方向卡内容</div>
      </div>
    )
  }

  // 根据复习方向决定问题和答案
  const question =
    reviewDirection === "forward" ? dirInfo.leftText : dirInfo.rightText
  const answer =
    reviewDirection === "forward" ? dirInfo.rightText : dirInfo.leftText

  const arrowIcon =
    reviewDirection === "forward" ? "ti-arrow-right" : "ti-arrow-left"
  const dirLabel = reviewDirection === "forward" ? "正向" : "反向"
  // 方向语义色（正向=primary / 反向=warning）由容器 modifier 类下发，
  // 见 srs-review.css 的 .srs-review-card--dir-forward / --dir-backward
  const dirModifier =
    reviewDirection === "forward"
      ? "srs-review-card--dir-forward"
      : "srs-review-card--dir-backward"

  return (
    <div
      className={`srs-direction-card-container srs-review-card ${dirModifier} ${
        inSidePanel ? "" : "srs-review-card--modal"
      }`}
    >
      {/* 卡片类型标识 */}
      <div className="srs-review-toolbar">
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
          <div className="srs-review-type-chip srs-review-type-chip--direction">
            <i className={`ti ${arrowIcon}`} />
            {dirLabel}
          </div>
        </div>

        {/* 右侧：操作按钮（仅图标） */}
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
          {blockId && onJumpToCard && (
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
      <div className="srs-direction-question srs-review-face">
        {reviewDirection === "forward" ? (
          <>
            <span className="srs-direction-question__term">{question}</span>
            <i className={`ti ${arrowIcon} srs-direction-question__arrow`} />
            {showAnswer ? (
              <span className="srs-direction-question__answer">
                {answer}
              </span>
            ) : (
              <span className="srs-direction-question__mask">
                ❓
              </span>
            )}
          </>
        ) : (
          <>
            {showAnswer ? (
              <span className="srs-direction-question__answer">
                {answer}
              </span>
            ) : (
              <span className="srs-direction-question__mask">
                ❓
              </span>
            )}
            <i className={`ti ${arrowIcon} srs-direction-question__arrow`} />
            <span className="srs-direction-question__term">{question}</span>
          </>
        )}
      </div>

      {readOnly && (
        <div contentEditable={false} className="srs-review-banner">
          {readOnlyStatusText ?? "只读回看"}
        </div>
      )}

      {/* 显示答案 / 评分按钮 / 只读继续 */}
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
            onClick={() => setShowAnswer(true)}
            className="srs-review-cta"
          >
            显示答案
          </Button>
        </div>
      ) : (
        <ReviewGradeButtons
          intervals={intervals}
          dueDates={dueDates}
          onGrade={handleGrade}
          onSkip={onSkip}
          readOnly={readOnly}
          pluginName={pluginName}
          isGrading={isGrading}
        />
      )}
    </div>
  )
}
