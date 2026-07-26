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
import ChoiceOptionRenderer from "./ChoiceOptionRenderer"
import SafeBlockPreview from "./SafeBlockPreview"
import CardInfoPanel from "./review-card/CardInfoPanel"

const SINGLE_SUBMIT_DELAY_MS = 150

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
  // 单选=primary / 多选=warning，配色由 srs-review.css 的 chip modifier 承担
  const modeChipModifier =
    mode === "single"
      ? "srs-review-type-chip--primary"
      : "srs-review-type-chip--warning"

  return (
    <div
      className={`srs-choice-card-container srs-review-card ${
        inSidePanel ? "" : "srs-review-card--modal"
      }`}
    >
      {readOnly && (
        <div contentEditable={false} className="srs-review-banner">
          {readOnlyStatusText ?? "只读回看"}
        </div>
      )}

      {/* 卡片类型标识 */}
      <div
        className="srs-review-toolbar"
      >
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
          <div className={`srs-review-type-chip ${modeChipModifier}`}>
            <i className="ti ti-list-check" />
            {modeLabel}
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

      {/* 可折叠的卡片信息面板（选择题卡历史上不显示间隔/稳定性/难度三行） */}
      {showCardInfo && <CardInfoPanel srsInfo={srsInfo} showSchedulingDetails={false} />}

      {/* 题目区域 */}
      <div className="srs-choice-question srs-review-face srs-review-face--question">
        <SafeBlockPreview blockId={blockId} panelId={panelId || "choice-review"} />
      </div>

      {/* 选项列表 */}
      <div className="srs-choice-options">
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
        <div className="srs-review-actions">
          {onSkip && (
            <button
              onClick={onSkip}
              title="继续复习"
              className="srs-review-btn srs-review-btn--primary"
            >
              继续
            </button>
          )}
        </div>
      )}

      {/* 多选模式提交按钮 */}
      {!readOnly && mode === "multiple" && !isAnswerRevealed && (
        <div className="srs-review-actions">
          {/* 跳过按钮 - 在答案未揭晓时也可用 */}
          {onSkip && (
            <button
              onClick={onSkip}
              title="跳过当前卡片，不评分"
              className="srs-review-btn srs-review-btn--outline"
            >
              跳过
            </button>
          )}
          <button
            onClick={handleSubmit}
            className={`srs-review-btn srs-review-btn--primary ${
              selectedIds.size === 0 ? "srs-review-btn--disabled" : ""
            }`}
          >
            提交答案
          </button>
        </div>
      )}

      {/* 单选模式跳过按钮（答案未揭晓时显示） */}
      {!readOnly && mode !== "multiple" && !isAnswerRevealed && onSkip && (
        <div className="srs-review-actions">
          <button
            onClick={onSkip}
            title="跳过当前卡片，不评分"
            className="srs-review-btn srs-review-btn--outline"
          >
            跳过
          </button>
        </div>
      )}

      {/* 评分按钮（答案揭晓后显示；只读时隐藏） */}
      {!readOnly && isAnswerRevealed && (
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
              currentSuggestedGrade === "again" ? "srs-grade-btn--suggested" : ""
            }`}
          >
            <div className="srs-grade-btn__preview">{formatDueDate(dueDates.again)}</div>
            <span className="srs-grade-btn__emoji">😞</span>
            <span className="srs-grade-btn__label">忘记</span>
          </button>

          <button
            onClick={() => handleGrade("hard")}
            className={`srs-grade-btn srs-grade-btn--hard ${
              currentSuggestedGrade === "hard" ? "srs-grade-btn--suggested" : ""
            }`}
          >
            <div className="srs-grade-btn__preview">{formatDueDate(dueDates.hard)}</div>
            <span className="srs-grade-btn__emoji">😐</span>
            <span className="srs-grade-btn__label">困难</span>
          </button>

          <button
            onClick={() => handleGrade("good")}
            className={`srs-grade-btn srs-grade-btn--good ${
              currentSuggestedGrade === "good" ? "srs-grade-btn--suggested" : ""
            }`}
          >
            <div className="srs-grade-btn__preview">{formatDueDate(dueDates.good)}</div>
            <span className="srs-grade-btn__emoji">😊</span>
            <span className="srs-grade-btn__label">良好</span>
          </button>

          <button
            onClick={() => handleGrade("easy")}
            className="srs-grade-btn srs-grade-btn--easy"
          >
            <div className="srs-grade-btn__preview">{formatDueDate(dueDates.easy)}</div>
            <span className="srs-grade-btn__emoji">😄</span>
            <span className="srs-grade-btn__label">简单</span>
          </button>
        </div>
      )}

      {/* 自动评分提示 */}
      {isAnswerRevealed && currentSuggestedGrade && (
        <div className="srs-choice-grade-hint">
          {currentSuggestedGrade === "good" && "✓ 全部正确！建议评分：良好"}
          {currentSuggestedGrade === "hard" && "△ 部分正确，建议评分：困难"}
          {currentSuggestedGrade === "again" && "✗ 答案错误，建议评分：忘记"}
        </div>
      )}
    </div>
  )
}
