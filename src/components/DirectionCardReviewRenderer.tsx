/**
 * 方向卡复习渲染器
 *
 * 功能：
 * - 根据复习方向显示问题和答案
 * - 正向：左边是问题，右边是答案
 * - 反向：右边是问题，左边是答案
 */

const { useState, useMemo } = window.React
const { useSnapshot } = window.Valtio
const { Button } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import { extractDirectionInfo } from "../srs/directionUtils"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, formatInterval, previewDueDates, formatDueDate } from "../srs/algorithm"
import { State } from "ts-fsrs"

/**
 * 格式化卡片状态为中文
 */
function formatCardState(state?: State): string {
  if (state === undefined || state === null) return "新卡"
  switch (state) {
    case State.New: return "新卡"
    case State.Learning: return "学习中"
    case State.Review: return "复习中"
    case State.Relearning: return "重学中"
    default: return "未知"
  }
}

/**
 * 格式化日期时间
 */
function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "从未"
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

interface DirectionCardReviewRendererProps {
  blockId: DbId
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void  // 跳过当前卡片
  onPrevious?: () => void  // 回到上一张
  canGoPrevious?: boolean  // 是否可以回到上一张
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
  reviewDirection: "forward" | "backward" // 当前复习的方向
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
}: DirectionCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [showCardInfo, setShowCardInfo] = useState(false)

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
    if (isGrading) return
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
    return previewIntervals(fullState)
  }, [srsInfo])

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
    return previewDueDates(fullState)
  }, [srsInfo])

  if (!dirInfo) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        无法解析方向卡内容
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
  const dirColor = reviewDirection === "forward" 
    ? "var(--orca-color-primary-5)" 
    : "var(--orca-color-warning-5)"
  const dirBgColor = reviewDirection === "forward"
    ? "var(--orca-color-primary-1)"
    : "var(--orca-color-warning-1)"

  return (
    <div
      className="srs-direction-card-container"
      style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "16px",
        width: inSidePanel ? "100%" : "90%",
        minWidth: inSidePanel ? "0" : "600px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      }}
    >
      {/* 卡片类型标识 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          opacity: 0.6,
          transition: "opacity 0.2s"
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
        onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"}
      >
        {/* 左侧：回到上一张按钮 + 卡片类型标识 */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {onPrevious && (
            <Button
              variant="plain"
              onClick={canGoPrevious ? onPrevious : undefined}
              title="回到上一张"
              style={{
                padding: "4px 6px",
                fontSize: "14px",
                opacity: canGoPrevious ? 1 : 0.3,
                cursor: canGoPrevious ? "pointer" : "not-allowed"
              }}
            >
              <i className="ti ti-arrow-left" />
            </Button>
          )}
          <div
            style={{
              fontSize: "12px",
              fontWeight: "500",
              color: dirColor,
              backgroundColor: dirBgColor,
              padding: "2px 8px",
              borderRadius: "4px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <i className={`ti ${arrowIcon}`} style={{ fontSize: "11px" }} />
            {dirLabel}
          </div>
        </div>

        {/* 右侧：操作按钮（仅图标） */}
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
          {blockId && onJumpToCard && (
            <Button
              variant="plain"
              onClick={(e: React.MouseEvent) => onJumpToCard(blockId, e.shiftKey)}
              title="跳转到卡片 (Shift+点击在侧面板打开)"
              style={{ padding: "4px 6px", fontSize: "14px" }}
            >
              <i className="ti ti-external-link" />
            </Button>
          )}
          {/* 卡片信息按钮 */}
          <Button
            variant="plain"
            onClick={() => setShowCardInfo(!showCardInfo)}
            title="卡片信息"
            style={{
              padding: "4px 6px",
              fontSize: "14px",
              color: showCardInfo ? "var(--orca-color-primary-5)" : undefined
            }}
          >
            <i className="ti ti-info-circle" />
          </Button>
        </div>
      </div>

      {/* 可折叠的卡片信息面板 */}
      {showCardInfo && (
        <div 
          contentEditable={false}
          style={{
            marginBottom: "12px",
            padding: "12px 16px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "8px",
            fontSize: "13px",
            color: "var(--orca-color-text-2)"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>遗忘次数</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{srsInfo?.lapses ?? 0}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>复习次数</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{srsInfo?.reps ?? 0}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>卡片状态</span>
              <span style={{ 
                color: srsInfo?.state === State.Review ? "var(--orca-color-success)" : 
                       srsInfo?.state === State.Learning || srsInfo?.state === State.Relearning ? "var(--orca-color-warning)" :
                       "var(--orca-color-primary)"
              }}>
                {formatCardState(srsInfo?.state)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>最后复习</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{formatDateTime(srsInfo?.lastReviewed)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>下次到期</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{formatDateTime(srsInfo?.due)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>间隔天数</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{srsInfo?.interval ?? 0} 天</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>稳定性</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{(srsInfo?.stability ?? 0).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>难度</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{(srsInfo?.difficulty ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 题目区域 */}
      <div
        className="srs-direction-question"
        style={{
          marginBottom: "16px",
          padding: "20px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "8px",
          minHeight: "100px",
          fontSize: "18px",
          lineHeight: "1.8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        {reviewDirection === "forward" ? (
          <>
            <span style={{ fontWeight: 500 }}>{question}</span>
            <i
              className={`ti ${arrowIcon}`}
              style={{
                fontSize: "20px",
                color: dirColor,
              }}
            />
            {showAnswer ? (
              <span
                style={{
                  fontWeight: 600,
                  color: dirColor,
                  backgroundColor: dirBgColor,
                  padding: "4px 12px",
                  borderRadius: "6px",
                }}
              >
                {answer}
              </span>
            ) : (
              <span
                style={{
                  color: "var(--orca-color-text-2)",
                  backgroundColor: "var(--orca-color-bg-3)",
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "1px dashed var(--orca-color-border-1)",
                }}
              >
                ❓
              </span>
            )}
          </>
        ) : (
          <>
            {showAnswer ? (
              <span
                style={{
                  fontWeight: 600,
                  color: dirColor,
                  backgroundColor: dirBgColor,
                  padding: "4px 12px",
                  borderRadius: "6px",
                }}
              >
                {answer}
              </span>
            ) : (
              <span
                style={{
                  color: "var(--orca-color-text-2)",
                  backgroundColor: "var(--orca-color-bg-3)",
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "1px dashed var(--orca-color-border-1)",
                }}
              >
                ❓
              </span>
            )}
            <i
              className={`ti ${arrowIcon}`}
              style={{
                fontSize: "20px",
                color: dirColor,
              }}
            />
            <span style={{ fontWeight: 500 }}>{question}</span>
          </>
        )}
      </div>

      {/* 显示答案 / 评分按钮 */}
      {!showAnswer ? (
        <div style={{ textAlign: "center", marginBottom: "12px" }}>
          <Button
            variant="solid"
            onClick={() => setShowAnswer(true)}
            style={{
              padding: "12px 32px",
              fontSize: "16px",
            }}
          >
            显示答案
          </Button>
        </div>
      ) : (
        <div
          className="srs-card-grade-buttons"
          style={{
            display: "grid",
            gridTemplateColumns: onSkip ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
            gap: "8px",
            marginTop: "16px",
          }}
        >
          {/* 跳过按钮 */}
          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(156, 163, 175, 0.12)",
                border: "1px solid rgba(156, 163, 175, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>不评分</div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>⏭️</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>跳过</span>
            </button>
          )}

          <button
            onClick={() => handleGrade("again")}
            style={{
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)"
              e.currentTarget.style.transform = "translateY(-2px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)"
              e.currentTarget.style.transform = "translateY(0)"
            }}
          >
            <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.again)}</div>
            <span style={{ fontSize: "32px", lineHeight: "1" }}>😞</span>
            <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>忘记</span>
          </button>

          <button
            onClick={() => handleGrade("hard")}
            style={{
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)"
              e.currentTarget.style.transform = "translateY(-2px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)"
              e.currentTarget.style.transform = "translateY(0)"
            }}
          >
            <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.hard)}</div>
            <span style={{ fontSize: "32px", lineHeight: "1" }}>😐</span>
            <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>困难</span>
          </button>

          <button
            onClick={() => handleGrade("good")}
            style={{
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)"
              e.currentTarget.style.transform = "translateY(-2px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)"
              e.currentTarget.style.transform = "translateY(0)"
            }}
          >
            <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.good)}</div>
            <span style={{ fontSize: "32px", lineHeight: "1" }}>😊</span>
            <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>良好</span>
          </button>

          <button
            onClick={() => handleGrade("easy")}
            style={{
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)"
              e.currentTarget.style.transform = "translateY(-2px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)"
              e.currentTarget.style.transform = "translateY(0)"
            }}
          >
            <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.easy)}</div>
            <span style={{ fontSize: "32px", lineHeight: "1" }}>😄</span>
            <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>简单</span>
          </button>
        </div>
      )}
    </div>
  )
}
