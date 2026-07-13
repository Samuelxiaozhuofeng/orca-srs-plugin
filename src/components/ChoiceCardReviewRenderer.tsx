/**
 * 选择题卡片复习渲染器
 *
 * 功能：
 * - 显示问题和乱序后的选项
 * - 单选模式：点击即确认
 * - 多选模式：切换选择 + 提交按钮
 * - 答案揭晓后显示正确/错误样式
 * - 自动评分建议
 * 
 * Requirements: 3.1, 3.7, 3.8, 3.9, 3.10
 */

const { useState, useMemo, useCallback, useRef, useEffect } = window.React
const { useSnapshot } = window.Valtio
const { Button } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState, ChoiceOption, ChoiceMode } from "../srs/types"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewDueDates, formatDueDate } from "../srs/algorithm"
import {
  canFireSingleSubmit,
  completeSingleSubmit,
  createChoiceSubmitGate,
  enterReadOnlyGate,
  isSubmitGateBlocking,
  resetGateForCard,
  tryBeginMultiSubmit,
  tryBeginSingleSubmit,
  type ChoiceSubmitGateState
} from "../srs/choiceSubmitGate"
import { State } from "ts-fsrs"
import ChoiceOptionRenderer from "./ChoiceOptionRenderer"
import SafeBlockPreview from "./SafeBlockPreview"

const SINGLE_SUBMIT_DELAY_MS = 150

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

interface ChoiceCardReviewRendererProps {
  blockId: DbId                              // 卡片块 ID
  options: ChoiceOption[]                    // 乱序后的选项列表
  mode: ChoiceMode                           // 单选/多选模式
  onGrade: (grade: Grade) => Promise<void> | void
  onAnswer?: (selectedIds: DbId[]) => void   // 答案提交回调（FC-08 接入；本任务只读时不得调用）
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
  suggestedGrade?: Grade | null              // 自动评分建议
  /** FC-06 只读回看：展示正确答案，禁止选择/提交/评分 */
  readOnly?: boolean
  readOnlyStatusText?: string
}

export default function ChoiceCardReviewRenderer({
  blockId,
  options,
  mode,
  onGrade,
  onAnswer,
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
  suggestedGrade,
  readOnly = false,
  readOnlyStatusText,
}: ChoiceCardReviewRendererProps) {
  const [selectedIds, setSelectedIds] = useState<Set<DbId>>(new Set())
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(!!readOnly)
  const [showCardInfo, setShowCardInfo] = useState(false)
  const [currentSuggestedGrade, setCurrentSuggestedGrade] = useState<Grade | null>(null)

  const currentCardKey = `${blockId}`

  // 最新 props / 门闩 / timer — 避免 setTimeout 闭包读到过期 readOnly
  const readOnlyRef = useRef(readOnly)
  const cardKeyRef = useRef(currentCardKey)
  const mountedRef = useRef(true)
  const gateRef = useRef<ChoiceSubmitGateState>(createChoiceSubmitGate(currentCardKey))
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onAnswerRef = useRef(onAnswer)
  const correctIdsRef = useRef<Set<DbId>>(new Set())

  readOnlyRef.current = readOnly
  cardKeyRef.current = currentCardKey
  onAnswerRef.current = onAnswer

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // 挂载 / 卸载
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearPendingTimeout()
      // 作废 token，防止任何残留逻辑
      gateRef.current = enterReadOnlyGate(gateRef.current)
    }
  }, [clearPendingTimeout])

  // 切卡：清 timer、重置门闩与 UI
  useEffect(() => {
    clearPendingTimeout()
    gateRef.current = resetGateForCard(gateRef.current, currentCardKey)
    setSelectedIds(new Set())
    setIsAnswerRevealed(!!readOnlyRef.current)
    setShowCardInfo(false)
    setCurrentSuggestedGrade(null)
  }, [currentCardKey, clearPendingTimeout])

  // 进入只读：清 timer、作废 pending
  useEffect(() => {
    if (!readOnly) return
    clearPendingTimeout()
    gateRef.current = enterReadOnlyGate(gateRef.current)
    setIsAnswerRevealed(true)
  }, [readOnly, clearPendingTimeout])

  // 订阅 orca.state
  const snapshot = useSnapshot(orca.state)

  // 获取正确选项 IDs
  const correctIds = useMemo(() => {
    return new Set(options.filter(opt => opt.isCorrect).map(opt => opt.blockId))
  }, [options])
  correctIdsRef.current = correctIds

  // 计算自动评分
  const calculateGrade = useCallback((): Grade | null => {
    if (mode === "undefined" || correctIds.size === 0) {
      return null
    }

    const selectedArray = Array.from(selectedIds)
    const hasIncorrectSelection = selectedArray.some(id => !correctIds.has(id))
    const allCorrectSelected = Array.from(correctIds).every(id => selectedIds.has(id))

    if (mode === "single") {
      if (selectedIds.size === 1 && correctIds.has(selectedArray[0])) {
        return "good"
      }
      return "again"
    }

    // 多选模式
    if (hasIncorrectSelection) {
      return "again"
    }
    if (allCorrectSelected) {
      return "good"
    }
    // 部分对（漏选但无错选）
    return "hard"
  }, [selectedIds, correctIds, mode])

  // 处理选项点击
  const handleOptionClick = useCallback((optionId: DbId) => {
    const gate = gateRef.current
    if (
      isSubmitGateBlocking(gate, {
        readOnly: readOnlyRef.current,
        answerRevealed: isAnswerRevealed,
        isGrading
      })
    ) {
      return
    }

    if (mode === "single") {
      // 同步锁：重复点击 / 快捷键在重渲染前也只能 begin 一次
      const begun = tryBeginSingleSubmit(gate, {
        cardKey: cardKeyRef.current,
        readOnly: readOnlyRef.current,
        answerRevealed: isAnswerRevealed,
        isGrading
      })
      gateRef.current = begun.state
      if (begun.token == null) return

      setSelectedIds(new Set([optionId]))
      const token = begun.token
      const scheduledCardKey = cardKeyRef.current

      clearPendingTimeout()
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        const latest = gateRef.current
        if (
          !canFireSingleSubmit(latest, {
            token,
            cardKey: cardKeyRef.current,
            readOnly: readOnlyRef.current,
            mounted: mountedRef.current
          })
        ) {
          return
        }
        // 额外：调度时的卡与当前卡一致
        if (cardKeyRef.current !== scheduledCardKey) return

        gateRef.current = completeSingleSubmit(latest, token)
        setIsAnswerRevealed(true)
        const grade = correctIdsRef.current.has(optionId) ? "good" : "again"
        setCurrentSuggestedGrade(grade)
        onAnswerRef.current?.([optionId])
      }, SINGLE_SUBMIT_DELAY_MS)
    } else {
      // 多选模式：切换选择状态（提交另走 handleSubmit 锁）
      setSelectedIds((prev: Set<DbId>) => {
        const newSet = new Set(prev)
        if (newSet.has(optionId)) {
          newSet.delete(optionId)
        } else {
          newSet.add(optionId)
        }
        return newSet
      })
    }
  }, [mode, isAnswerRevealed, isGrading, clearPendingTimeout])

  // 处理多选提交（同步提交锁，防同一周期重复 Enter/点击）
  const handleSubmit = useCallback(() => {
    if (mode !== "multiple") return

    const begun = tryBeginMultiSubmit(gateRef.current, {
      cardKey: cardKeyRef.current,
      readOnly: readOnlyRef.current,
      answerRevealed: isAnswerRevealed,
      isGrading
    })
    gateRef.current = begun.state
    if (!begun.accepted) return

    setIsAnswerRevealed(true)
    const grade = calculateGrade()
    setCurrentSuggestedGrade(grade)
    onAnswerRef.current?.(Array.from(selectedIds))
  }, [isAnswerRevealed, isGrading, mode, selectedIds, calculateGrade])

  // 处理评分
  const handleGrade = useCallback(async (grade: Grade) => {
    if (isGrading || readOnlyRef.current) return
    await onGrade(grade)
    // 重置状态（同卡再次出现时由 gate reset 在切卡 effect 处理；评分后会话会前进）
    clearPendingTimeout()
    setSelectedIds(new Set())
    setIsAnswerRevealed(false)
    setCurrentSuggestedGrade(null)
  }, [isGrading, onGrade, clearPendingTimeout])

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

  // 快捷键支持（包括选择题特有的数字键和Enter键）
  // Requirements: 5.1, 5.2, 5.3, 5.4
  // FC-06：readOnly 禁用评分/bury/suspend/choice 选择与提交
  useReviewShortcuts({
    showAnswer: isAnswerRevealed,
    isGrading,
    onGrade: handleGrade,
    onBury: onPostpone,
    onSuspend,
    readOnly,
    choiceCard: {
      mode,
      optionCount: options.length,
      onSelectOption: (index) => handleOptionClick(options[index].blockId),
      onSubmit: handleSubmit,
    },
  })

  // 模式标签
  const modeLabel = mode === "single" ? "单选" : mode === "multiple" ? "多选" : "选择"
  const modeColor = mode === "single" 
    ? "var(--orca-color-primary-5)" 
    : "var(--orca-color-warning-5)"
  const modeBgColor = mode === "single"
    ? "var(--orca-color-primary-1)"
    : "var(--orca-color-warning-1)"

  return (
    <div
      className="srs-choice-card-container"
      style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "16px",
        width: inSidePanel ? "100%" : "90%",
        minWidth: inSidePanel ? "0" : "600px",
        maxWidth: "800px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      }}
    >
      {readOnly && (
        <div
          contentEditable={false}
          style={{
            marginBottom: "10px",
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--orca-color-warning-6)",
            backgroundColor: "var(--orca-color-warning-1)",
            textAlign: "center",
          }}
        >
          {readOnlyStatusText ?? "只读回看"}
        </div>
      )}

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
              color: modeColor,
              backgroundColor: modeBgColor,
              padding: "2px 8px",
              borderRadius: "4px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <i className="ti ti-list-check" style={{ fontSize: "11px" }} />
            {modeLabel}
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div style={{ display: "flex", gap: "2px" }}>
          {!readOnly && onPostpone && (
            <Button
              variant="plain"
              onClick={onPostpone}
              title="推迟到明天 (B)"
              style={{ padding: "4px 6px", fontSize: "14px" }}
            >
              <i className="ti ti-calendar-pause" />
            </Button>
          )}
          {!readOnly && onSuspend && (
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
          </div>
        </div>
      )}

      {/* 题目区域 */}
      <div
        className="srs-choice-question"
        style={{
          marginBottom: "16px",
          padding: "16px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "8px",
          minHeight: "60px",
          fontSize: "16px",
          lineHeight: "1.8",
        }}
      >
        <SafeBlockPreview blockId={blockId} panelId={panelId || "choice-review"} />
      </div>

      {/* 选项列表 */}
      <div
        className="srs-choice-options"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        {options.map((option, index) => (
          <ChoiceOptionRenderer
            key={option.blockId}
            blockId={option.blockId}
            index={index}
            isSelected={selectedIds.has(option.blockId)}
            isCorrect={option.isCorrect}
            isAnswerRevealed={isAnswerRevealed || readOnly}
            mode={mode}
            onClick={() => handleOptionClick(option.blockId)}
            disabled={isAnswerRevealed || readOnly}
          />
        ))}
      </div>

      {/* 只读继续 */}
      {readOnly && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
          {onSkip && (
            <button
              onClick={onSkip}
              title="继续复习"
              style={{
                padding: "12px 32px",
                fontSize: "16px",
                backgroundColor: "var(--orca-color-primary-5)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              继续
            </button>
          )}
        </div>
      )}

      {/* 多选模式提交按钮 */}
      {!readOnly && mode === "multiple" && !isAnswerRevealed && (
        <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "12px" }}>
          {/* 跳过按钮 - 在答案未揭晓时也可用 */}
          {onSkip && (
            <button
              onClick={onSkip}
              title="跳过当前卡片，不评分"
              style={{
                padding: "12px 24px",
                fontSize: "16px",
                backgroundColor: "transparent",
                color: "var(--orca-color-text-2)",
                border: "1px solid var(--orca-color-border-2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              跳过
            </button>
          )}
          <button
            onClick={handleSubmit}
            style={{
              padding: "12px 32px",
              fontSize: "16px",
              opacity: selectedIds.size === 0 ? 0.5 : 1,
              backgroundColor: "var(--orca-color-primary-5)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            提交答案
          </button>
        </div>
      )}

      {/* 单选模式跳过按钮（答案未揭晓时显示） */}
      {!readOnly && mode !== "multiple" && !isAnswerRevealed && onSkip && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
          <button
            onClick={onSkip}
            title="跳过当前卡片，不评分"
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: "transparent",
              color: "var(--orca-color-text-2)",
              border: "1px solid var(--orca-color-border-2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            跳过
          </button>
        </div>
      )}

      {/* 评分按钮（答案揭晓后显示；只读时隐藏） */}
      {!readOnly && isAnswerRevealed && (
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
              backgroundColor: currentSuggestedGrade === "again" 
                ? "rgba(239, 68, 68, 0.25)" 
                : "rgba(239, 68, 68, 0.12)",
              border: currentSuggestedGrade === "again"
                ? "2px solid rgba(239, 68, 68, 0.5)"
                : "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)"
              e.currentTarget.style.transform = "translateY(-2px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = currentSuggestedGrade === "again" 
                ? "rgba(239, 68, 68, 0.25)" 
                : "rgba(239, 68, 68, 0.12)"
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
              backgroundColor: currentSuggestedGrade === "hard"
                ? "rgba(251, 191, 36, 0.25)"
                : "rgba(251, 191, 36, 0.12)",
              border: currentSuggestedGrade === "hard"
                ? "2px solid rgba(251, 191, 36, 0.5)"
                : "1px solid rgba(251, 191, 36, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)"
              e.currentTarget.style.transform = "translateY(-2px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = currentSuggestedGrade === "hard"
                ? "rgba(251, 191, 36, 0.25)"
                : "rgba(251, 191, 36, 0.12)"
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
              backgroundColor: currentSuggestedGrade === "good"
                ? "rgba(34, 197, 94, 0.25)"
                : "rgba(34, 197, 94, 0.12)",
              border: currentSuggestedGrade === "good"
                ? "2px solid rgba(34, 197, 94, 0.5)"
                : "1px solid rgba(34, 197, 94, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)"
              e.currentTarget.style.transform = "translateY(-2px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = currentSuggestedGrade === "good"
                ? "rgba(34, 197, 94, 0.25)"
                : "rgba(34, 197, 94, 0.12)"
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

      {/* 自动评分提示 */}
      {isAnswerRevealed && currentSuggestedGrade && (
        <div style={{
          marginTop: "12px",
          textAlign: "center",
          fontSize: "12px",
          color: "var(--orca-color-text-3)",
        }}>
          {currentSuggestedGrade === "good" && "✓ 全部正确！建议评分：良好"}
          {currentSuggestedGrade === "hard" && "△ 部分正确，建议评分：困难"}
          {currentSuggestedGrade === "again" && "✗ 答案错误，建议评分：忘记"}
        </div>
      )}
    </div>
  )
}
