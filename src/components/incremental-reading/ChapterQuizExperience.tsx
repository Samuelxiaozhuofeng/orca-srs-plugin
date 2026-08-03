/**
 * 章末小测专注答题体验（Custom Panel 主视图）。
 * 主路径：首轮作答 → 动作小结 → 修复轮 / 整理薄弱点；
 * 揭晓后辅助为扁平意图条：加入复习 / 问 AI / 原文。
 */

import {
  CHAPTER_QUIZ_COPY,
  countAnsweredQuestions,
  countFirstCategories,
  countRecordedCardAdds,
  countRepairedWeakItems,
  dispatchChapterQuizAdvance,
  ensureRepairOptionOrder,
  formatQuizGenProgressLabel,
  formatSelectedWrongChoiceLabel,
  isAnswerCorrect,
  isKeyboardEventFromEditableTarget,
  jumpToQuizSourceBlock,
  listUnresolvedWeakItemIds,
  listWeakItemIds,
  quizOptionLetter,
  resolveDisplayedOptionIndices,
  resolveQuestionFeedbackDisplay,
  resolveQuizKeyboardDecision,
  rewriteQuestionAsCloze,
  type ChapterQuizQuestion
} from "../../srs/incremental-reading/chapterQuiz"
import { renderLightMarkdown } from "./chapterQuizMarkdown"
import ChapterQuizWeaknessOrganizer from "./ChapterQuizWeaknessOrganizer"
import {
  useChapterQuizController,
  type ClozePreview
} from "./useChapterQuizController"

const { useCallback, useEffect, useMemo, useRef, useState } = window.React
const { Button } = orca.components

export type ChapterQuizExperienceProps = {
  panelId: string
  quizBlockId: number
  /** PanelProps.active：仅活动面板注册键盘快捷键 */
  active?: boolean
}

/** 揭晓后展开的辅助面板：填空菜单 或 AI 追问 */
type IntentPanel = null | "review-menu" | "ai"
type PanelView = "main" | "organizer"

export default function ChapterQuizExperience(props: ChapterQuizExperienceProps) {
  const { panelId, quizBlockId, active: panelActive = true } = props
  const ctl = useChapterQuizController({
    blockId: quizBlockId,
    autoGenerate: true,
    writeContextPanelId: panelId
  })

  const [intentPanel, setIntentPanel] = useState<IntentPanel>(null)
  const [panelView, setPanelView] = useState<PanelView>("main")
  const [focusedOption, setFocusedOption] = useState(0)
  const [correctDetailsOpen, setCorrectDetailsOpen] = useState(false)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const liveStatusRef = useRef<HTMLDivElement | null>(null)

  const {
    repr,
    hydrated,
    busy,
    questions,
    index,
    question,
    revealed,
    followUpDraft,
    setFollowUpDraft,
    followUps,
    followUpBusy,
    followUpError,
    clozePreview,
    setClozePreview,
    clozeBusy,
    cardBusyId,
    localError,
    handleSelect,
    handleSkip,
    handleToggleUncertain,
    handleNext,
    handleStartRepair,
    handleRepairSelect,
    handleRepairNext,
    handleBatchCreateCards,
    handleAddBasicFor,
    handleStartClozeFor,
    handleConfirmClozeFor,
    handleFollowUpFor,
    handleCancelGenerate,
    handleRetryGenerate,
    handleDelete,
    clearEphemeralForQuestion
  } = ctl

  const repairActive = repr.repairActive === true
  const repairQueue = repr.repairQueue ?? []
  const repairIndex = Math.min(
    Math.max(0, repr.repairIndex ?? 0),
    Math.max(0, repairQueue.length - 1)
  )
  const repairQuestionId = repairActive ? repairQueue[repairIndex] : undefined
  const repairQuestion = repairQuestionId
    ? questions.find((q: ChapterQuizQuestion) => q.id === repairQuestionId)
    : undefined

  const activeQuestion: ChapterQuizQuestion | undefined = repairActive
    ? repairQuestion
    : question

  const answeredCount = countAnsweredQuestions(questions, repr.revealed)
  const categoryCounts = countFirstCategories(questions, repr.firstCategories)
  const weakIds = useMemo(() => {
    if (repr.weakItemIds && repr.weakItemIds.length > 0) return repr.weakItemIds
    return listWeakItemIds(questions, repr.firstCategories, {
      answers: repr.answers,
      uncertainMarks: repr.uncertainMarks,
      skipped: repr.skipped
    })
  }, [
    questions,
    repr.answers,
    repr.firstCategories,
    repr.skipped,
    repr.uncertainMarks,
    repr.weakItemIds
  ])
  const weakTotal = weakIds.length
  const repairedCount = countRepairedWeakItems(weakIds, repr.repaired)
  const unresolvedIds = listUnresolvedWeakItemIds(weakIds, repr.repaired)
  const cardsAdded = countRecordedCardAdds(repr.cardAdds)
  const repairedIdSet = useMemo(() => {
    const set = new Set<string>()
    for (const [id, v] of Object.entries(repr.repaired ?? {})) {
      if (v === true) set.add(id)
    }
    return set
  }, [repr.repaired])
  const weakQuestions = useMemo(() => {
    const out: ChapterQuizQuestion[] = []
    for (const id of weakIds) {
      const q = questions.find((item: ChapterQuizQuestion) => item.id === id)
      if (q) out.push(q)
    }
    return out
  }, [questions, weakIds])

  // 换题时收起意图面板与正确讲解折叠
  useEffect(() => {
    setIntentPanel(null)
    setCorrectDetailsOpen(false)
    setFocusedOption(0)
    clearEphemeralForQuestion()
  }, [activeQuestion?.id, repairActive, clearEphemeralForQuestion])

  const displayOptions = useMemo(() => {
    if (!activeQuestion) return [] as Array<{ displayIndex: number; originalIndex: number; text: string }>
    if (repairActive) {
      const order = ensureRepairOptionOrder(
        repr.repairOptionOrders?.[activeQuestion.id],
        activeQuestion.options.length,
        `repair:${activeQuestion.id}`
      )
      return order.map((originalIndex, displayIndex) => ({
        displayIndex,
        originalIndex,
        text: activeQuestion.options[originalIndex] ?? ""
      }))
    }
    return activeQuestion.options.map((text, originalIndex) => ({
      displayIndex: originalIndex,
      originalIndex,
      text
    }))
  }, [activeQuestion, repairActive, repr.repairOptionOrders])

  const activeSelectedOriginal = (() => {
    if (!activeQuestion) return undefined
    if (repairActive) {
      const a = repr.repairAnswers?.[activeQuestion.id]
      return typeof a === "number" ? a : undefined
    }
    const a = repr.answers?.[activeQuestion.id]
    return typeof a === "number" ? a : undefined
  })()

  const activeRevealed = (() => {
    if (!activeQuestion) return false
    if (repairActive) return repr.repairRevealed?.[activeQuestion.id] === true
    return repr.revealed?.[activeQuestion.id] === true
  })()

  const isSkippedFirst =
    !repairActive &&
    activeQuestion != null &&
    (repr.skipped?.[activeQuestion.id] === true ||
      repr.firstCategories?.[activeQuestion.id] === "skipped")

  // 首轮跳过：不揭晓反馈内容
  const showFeedback =
    activeRevealed && !(isSkippedFirst && !repairActive)

  const activeIsCorrect =
    typeof activeSelectedOriginal === "number" &&
    activeQuestion != null &&
    isAnswerCorrect(activeQuestion, activeSelectedOriginal)

  const activeCardAdds = activeQuestion
    ? repr.cardAdds?.[activeQuestion.id]
    : undefined
  const uncertainOn =
    activeQuestion != null && repr.uncertainMarks?.[activeQuestion.id] === true

  const feedback = activeQuestion
    ? resolveQuestionFeedbackDisplay(activeQuestion, activeSelectedOriginal)
    : null

  const displayedIndices = useMemo(() => {
    if (!activeQuestion) {
      return { displayedCorrectIndex: 0, displayedSelectedIndex: undefined as number | undefined }
    }
    return resolveDisplayedOptionIndices(
      displayOptions,
      activeQuestion.correctIndex,
      activeSelectedOriginal
    )
  }, [activeQuestion, activeSelectedOriginal, displayOptions])

  const liveStatusText = useMemo(() => {
    // 优先结果小结，避免仍停留在最后一题 verdict
    if (repr.phase === "done" && !repairActive) {
      return [
        CHAPTER_QUIZ_COPY.actionSummaryTitle,
        `${CHAPTER_QUIZ_COPY.certainCorrectLabel} ${categoryCounts.certain_correct}`,
        `${CHAPTER_QUIZ_COPY.uncertainCorrectLabel} ${categoryCounts.uncertain_correct}`,
        `${CHAPTER_QUIZ_COPY.wrongLabel} ${categoryCounts.wrong}`,
        `${CHAPTER_QUIZ_COPY.skippedLabel} ${categoryCounts.skipped}`,
        CHAPTER_QUIZ_COPY.repairedProgress(repairedCount, weakTotal)
      ].join(" · ")
    }
    if (!activeQuestion) return ""
    const correctLabel = `${quizOptionLetter(displayedIndices.displayedCorrectIndex)}. ${
      activeQuestion.options[activeQuestion.correctIndex] ?? ""
    }`
    if (repairActive && activeRevealed) {
      if (activeIsCorrect) return CHAPTER_QUIZ_COPY.repairCorrect
      return `${CHAPTER_QUIZ_COPY.repairIncorrect} · ${CHAPTER_QUIZ_COPY.correctAnswerLabel}：${correctLabel}`
    }
    if (!repairActive && activeRevealed) {
      if (isSkippedFirst) return CHAPTER_QUIZ_COPY.skipVerdict
      if (activeIsCorrect) return CHAPTER_QUIZ_COPY.correct
      return `${CHAPTER_QUIZ_COPY.incorrect} · ${CHAPTER_QUIZ_COPY.correctAnswerLabel}：${correctLabel}`
    }
    return ""
  }, [
    activeIsCorrect,
    activeQuestion,
    activeRevealed,
    categoryCounts,
    displayedIndices.displayedCorrectIndex,
    isSkippedFirst,
    repairActive,
    repairedCount,
    repr.phase,
    weakTotal
  ])

  const handleJumpToSource = useCallback(() => {
    if (!activeQuestion?.sourceBlockId) {
      orca.notify("warn", CHAPTER_QUIZ_COPY.jumpToSourceMissing, {
        title: "章末小测"
      })
      return
    }
    jumpToQuizSourceBlock({
      sourceBlockId: activeQuestion.sourceBlockId,
      currentPanelId: panelId,
      topicBlockId: repr.topicBlockId
    })
  }, [activeQuestion, panelId, repr.topicBlockId])

  const answeringAllowed =
    !!activeQuestion &&
    !activeRevealed &&
    !busy &&
    (repairActive || repr.phase === "quiz") &&
    panelView === "main"

  // 键盘：仅当前活动 Custom Panel 注册；数字选、Enter 前进、↑↓ 焦点
  useEffect(() => {
    if (!panelActive) return
    if (panelView !== "main") return
    if (repr.phase !== "quiz" && !repairActive) return

    const onKeyDown = (e: KeyboardEvent) => {
      const composing = Boolean((e as KeyboardEvent & { isComposing?: boolean }).isComposing)
      if (composing) return
      const focusInEditable = isKeyboardEventFromEditableTarget(e.target)
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey
      // 追问输入 / 意图展开时阻止 Enter 推进
      const blockAdvance =
        intentPanel === "ai" ||
        intentPanel === "review-menu" ||
        focusInEditable

      const decision = resolveQuizKeyboardDecision(e.key, {
        answeringAllowed,
        feedbackRevealed: activeRevealed && !isSkippedFirst,
        optionCount: displayOptions.length,
        focusInEditable,
        isComposing: composing,
        hasModifier,
        blockAdvance,
        focusedOptionIndex: focusedOption
      })

      if (decision.type === "none") return
      e.preventDefault()

      if (decision.type === "select") {
        if (repairActive) void handleRepairSelect(decision.index)
        else void handleSelect(decision.index)
        return
      }
      if (decision.type === "advance") {
        if (repairActive) void handleRepairNext()
        else void handleNext()
        return
      }
      if (decision.type === "focusOption") {
        setFocusedOption(decision.index)
        const el = optionRefs.current[decision.index]
        el?.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    activeRevealed,
    answeringAllowed,
    displayOptions.length,
    focusedOption,
    handleNext,
    handleRepairNext,
    handleRepairSelect,
    handleSelect,
    intentPanel,
    isSkippedFirst,
    panelActive,
    panelView,
    repairActive,
    repr.phase
  ])

  if (!hydrated) {
    return (
      <div className="chapter-quiz-panel">
        <div className="chapter-quiz-panel__shell">
          <div className="chapter-quiz__status">加载小测…</div>
        </div>
      </div>
    )
  }

  const progressLabel = repairActive
    ? `修复 ${Math.min(repairIndex + 1, repairQueue.length)} / ${repairQueue.length}`
    : questions.length > 0 && repr.phase === "quiz"
      ? `第 ${index + 1} / ${questions.length} 题`
      : null

  return (
    <div className="chapter-quiz-panel">
      <div className="chapter-quiz-panel__shell">
        <header className="chapter-quiz-panel__header">
          <div className="chapter-quiz-panel__header-top">
            <span className="srs-card-badge srs-card-badge--reading">
              {repairActive
                ? CHAPTER_QUIZ_COPY.repairModeLabel
                : panelView === "organizer"
                  ? CHAPTER_QUIZ_COPY.organizerTitle
                  : "章末小测"}
            </span>
          </div>
          <div className="chapter-quiz-panel__header-main">
            <h1 className="chapter-quiz-panel__title">
              {panelView === "organizer"
                ? CHAPTER_QUIZ_COPY.organizerTitle
                : repairActive
                  ? CHAPTER_QUIZ_COPY.repairModeLabel
                  : CHAPTER_QUIZ_COPY.quizTitle}
            </h1>
            {progressLabel ? (
              <span className="chapter-quiz-panel__progress">{progressLabel}</span>
            ) : null}
            {repr.phase === "quiz" && !repairActive && questions.length > 0 ? (
              <span className="chapter-quiz-panel__progress-sub">
                {CHAPTER_QUIZ_COPY.compactProgress(
                  answeredCount,
                  questions.length
                )}
              </span>
            ) : null}
            {weakTotal > 0 && (repr.phase === "done" || repairActive) ? (
              <span className="chapter-quiz-panel__progress-sub">
                {CHAPTER_QUIZ_COPY.repairedProgress(repairedCount, weakTotal)}
              </span>
            ) : null}
          </div>
          {(repr.phase === "quiz" || repairActive) && questions.length > 0 ? (
            <div className="chapter-quiz-panel__progress-bar-track">
              <div
                className="chapter-quiz-panel__progress-bar-fill"
                style={{
                  width: `${
                    repairActive
                      ? ((Math.min(repairIndex + 1, repairQueue.length)) /
                          Math.max(1, repairQueue.length)) *
                        100
                      : ((index + 1) / questions.length) * 100
                  }%`
                }}
              />
            </div>
          ) : null}
        </header>

        <div
          ref={liveStatusRef}
          className="chapter-quiz-panel__sr-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {liveStatusText}
        </div>

        {repr.phase === "generating" ? (
          <section className="chapter-quiz-panel__section">
            <div className="chapter-quiz__status">
              {formatQuizGenProgressLabel(repr.genStage, repr.genAttempt)}
            </div>
            <Button variant="outline" onClick={handleCancelGenerate}>
              {CHAPTER_QUIZ_COPY.cancelGenerate}
            </Button>
          </section>
        ) : null}

        {repr.phase === "error" ? (
          <section className="chapter-quiz-panel__section">
            <div className="chapter-quiz__status chapter-quiz__status--error">
              {CHAPTER_QUIZ_COPY.genFailedTitle}
            </div>
            <div className="chapter-quiz__hint">
              {repr.errorMessage || CHAPTER_QUIZ_COPY.genFailedBody}
            </div>
            <div className="chapter-quiz__actions">
              <Button
                variant="outline"
                onClick={() => {
                  void handleDelete()
                }}
              >
                {CHAPTER_QUIZ_COPY.cancel}
              </Button>
              <Button
                variant="solid"
                className={busy ? "ir-button--blocked" : undefined}
                onClick={handleRetryGenerate}
              >
                {CHAPTER_QUIZ_COPY.retry}
              </Button>
            </div>
          </section>
        ) : null}

        {panelView === "organizer" && repr.phase === "done" && !repairActive ? (
          <ChapterQuizWeaknessOrganizer
            weakQuestions={weakQuestions}
            repairedIds={repairedIdSet}
            cardAdds={repr.cardAdds}
            cardBusyId={cardBusyId}
            onBack={() => setPanelView("main")}
            onStartClozePreview={async (q) => {
              try {
                const result = await rewriteQuestionAsCloze({
                  pluginName: repr.pluginName,
                  question: q
                })
                if (!result.success) {
                  return { ok: false as const, error: result.error.message }
                }
                return {
                  ok: true as const,
                  text: result.text,
                  clozeText: result.clozeText
                }
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error)
                console.error("[章末小测] 整理薄弱点填空预览失败:", error)
                return { ok: false as const, error: message }
              }
            }}
            onBatchCreate={handleBatchCreateCards}
          />
        ) : null}

        {panelView === "main" &&
        (repr.phase === "quiz" || repairActive) &&
        activeQuestion ? (
          <section className="chapter-quiz-panel__section">
            {!repairActive && repr.phase === "quiz" ? (
              <div className="chapter-quiz__quiz-vs-cards">
                {CHAPTER_QUIZ_COPY.quizVsCardsHint}
              </div>
            ) : null}
            <div className="chapter-quiz__stem" id={`quiz-stem-${activeQuestion.id}`}>
              {activeQuestion.text}
            </div>

            {!activeRevealed && !repairActive && repr.phase === "quiz" ? (
              <div className="chapter-quiz__pre-answer">
                <label className="chapter-quiz__uncertain">
                  <input
                    type="checkbox"
                    checked={uncertainOn}
                    disabled={busy}
                    onChange={() => {
                      void handleToggleUncertain()
                    }}
                  />
                  <span title={CHAPTER_QUIZ_COPY.uncertainToggleTitle}>
                    {CHAPTER_QUIZ_COPY.uncertainToggle}
                  </span>
                </label>
                <Button
                  variant="outline"
                  title={CHAPTER_QUIZ_COPY.skipTitle}
                  className={busy ? "ir-button--blocked" : undefined}
                  onClick={() => {
                    void handleSkip()
                  }}
                >
                  {CHAPTER_QUIZ_COPY.skip}
                </Button>
              </div>
            ) : null}

            <div
              className="chapter-quiz__options"
              role="radiogroup"
              aria-labelledby={`quiz-stem-${activeQuestion.id}`}
            >
              {displayOptions.map(
                (opt: {
                  displayIndex: number
                  originalIndex: number
                  text: string
                }) => {
                const isSelected =
                  typeof activeSelectedOriginal === "number" &&
                  activeSelectedOriginal === opt.originalIndex
                const isCorrectOpt =
                  opt.originalIndex === activeQuestion.correctIndex
                let stateClass = ""
                if (showFeedback) {
                  if (isCorrectOpt) stateClass = " is-correct"
                  else if (isSelected) stateClass = " is-wrong"
                } else if (isSelected) {
                  stateClass = " is-selected"
                }
                const disabled = activeRevealed || busy
                return (
                  <button
                    key={opt.displayIndex}
                    type="button"
                    ref={(el) => {
                      optionRefs.current[opt.displayIndex] = el
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${quizOptionLetter(opt.displayIndex)}. ${opt.text}`}
                    className={`chapter-quiz__option${stateClass}`}
                    disabled={disabled}
                    tabIndex={
                      focusedOption === opt.displayIndex || isSelected ? 0 : -1
                    }
                    onClick={() => {
                      if (disabled) return
                      if (repairActive) void handleRepairSelect(opt.displayIndex)
                      else void handleSelect(opt.originalIndex)
                    }}
                    onFocus={() => setFocusedOption(opt.displayIndex)}
                  >
                    <span className="chapter-quiz__option-letter">
                      {quizOptionLetter(opt.displayIndex)}
                    </span>
                    <span className="chapter-quiz__option-text">{opt.text}</span>
                    {showFeedback && isCorrectOpt ? (
                      <span className="chapter-quiz__option-mark" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                    {showFeedback && isSelected && !isCorrectOpt ? (
                      <span className="chapter-quiz__option-mark" aria-hidden="true">
                        ✗
                      </span>
                    ) : null}
                  </button>
                )
              }
              )}
            </div>

            {activeRevealed && isSkippedFirst && !repairActive ? (
              <div className="chapter-quiz-panel__feedback chapter-quiz-panel__feedback--skip">
                <div className="chapter-quiz__verdict-row">
                  <div className="chapter-quiz__verdict chapter-quiz__verdict--skip">
                    ○ {CHAPTER_QUIZ_COPY.skipVerdict}
                  </div>
                </div>
                <p className="chapter-quiz__hint">
                  首轮跳过不揭晓答案；可在修复轮再作答。
                </p>
              </div>
            ) : null}

            {showFeedback ? (
              <FeedbackBlock
                isCorrect={activeIsCorrect === true}
                isRepair={repairActive}
                question={activeQuestion}
                selectedOriginal={activeSelectedOriginal}
                displayedCorrectIndex={displayedIndices.displayedCorrectIndex}
                displayedSelectedIndex={displayedIndices.displayedSelectedIndex}
                feedback={feedback}
                correctDetailsOpen={correctDetailsOpen}
                setCorrectDetailsOpen={setCorrectDetailsOpen}
              />
            ) : !activeRevealed ? (
              <p className="chapter-quiz__primary-hint">
                选一项后显示对错与讲解；数字键 1–6 可选
              </p>
            ) : null}

            {showFeedback && activeQuestion ? (
              <IntentActionSection
                isCorrect={activeIsCorrect === true}
                intentPanel={intentPanel}
                setIntentPanel={setIntentPanel}
                question={activeQuestion}
                cardAdds={activeCardAdds}
                onJump={handleJumpToSource}
                onAddBasic={() => {
                  void handleAddBasicFor(activeQuestion)
                }}
                clozeBusy={clozeBusy}
                cardBusyId={cardBusyId}
                clozePreview={
                  clozePreview?.questionId === activeQuestion.id
                    ? clozePreview
                    : null
                }
                setClozePreview={setClozePreview}
                onStartCloze={() => {
                  void handleStartClozeFor(activeQuestion)
                }}
                onConfirmCloze={() => {
                  void handleConfirmClozeFor(activeQuestion)
                }}
                followUpDraft={followUpDraft}
                setFollowUpDraft={setFollowUpDraft}
                followUps={followUps}
                followUpBusy={followUpBusy}
                followUpError={followUpError}
                onFollowUp={() => {
                  void handleFollowUpFor(
                    activeQuestion,
                    activeSelectedOriginal
                  )
                }}
              />
            ) : null}

            <div className="chapter-quiz-panel__primary">
              <Button
                variant="solid"
                className={
                  !activeRevealed
                    ? "ir-button--blocked chapter-quiz__next-btn"
                    : "chapter-quiz__next-btn chapter-quiz-panel__cta"
                }
                onClick={() => {
                  if (!activeRevealed) return
                  if (repairActive) void handleRepairNext()
                  else void handleNext()
                }}
              >
                {repairActive
                  ? repairIndex >= repairQueue.length - 1
                    ? CHAPTER_QUIZ_COPY.repairRoundDone
                    : CHAPTER_QUIZ_COPY.next
                  : index >= questions.length - 1
                    ? CHAPTER_QUIZ_COPY.finish
                    : CHAPTER_QUIZ_COPY.next}
              </Button>
            </div>

            {localError ? (
              <div className="chapter-quiz__status chapter-quiz__status--error">
                {localError}
              </div>
            ) : null}
          </section>
        ) : null}

        {panelView === "main" &&
        repr.phase === "done" &&
        !repairActive ? (
          <ActionSummary
            categoryCounts={categoryCounts}
            repairedCount={repairedCount}
            weakTotal={weakTotal}
            unresolvedCount={unresolvedIds.length}
            cardsAdded={cardsAdded}
            sessionContinueNext={repr.sessionContinueNext === true}
            topicBlockId={repr.topicBlockId}
            quizBlockId={quizBlockId}
            onStartRepair={() => {
              void handleStartRepair()
            }}
            onOrganize={() => setPanelView("organizer")}
            onDelete={() => {
              void handleDelete()
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

function FeedbackBlock(props: {
  isCorrect: boolean
  isRepair: boolean
  question: ChapterQuizQuestion
  selectedOriginal: number | undefined
  displayedCorrectIndex: number
  displayedSelectedIndex: number | undefined
  feedback: ReturnType<typeof resolveQuestionFeedbackDisplay> | null
  correctDetailsOpen: boolean
  setCorrectDetailsOpen: (v: boolean) => void
}) {
  const {
    isCorrect,
    isRepair,
    question,
    selectedOriginal,
    displayedCorrectIndex,
    displayedSelectedIndex,
    feedback,
    correctDetailsOpen,
    setCorrectDetailsOpen
  } = props

  const verdictText = isRepair
    ? isCorrect
      ? CHAPTER_QUIZ_COPY.repairCorrect
      : CHAPTER_QUIZ_COPY.repairIncorrect
    : isCorrect
      ? CHAPTER_QUIZ_COPY.correct
      : CHAPTER_QUIZ_COPY.incorrect

  const correctDisplayText = `${quizOptionLetter(displayedCorrectIndex)}. ${
    question.options[question.correctIndex] ?? ""
  }`
  const selectedText =
    typeof selectedOriginal === "number"
      ? question.options[selectedOriginal]
      : undefined
  const selectedLabel = formatSelectedWrongChoiceLabel({
    displayedSelectedIndex,
    selectedOptionText: selectedText
  })

  const details = (
    <>
      {feedback?.correctReason ? (
        <div className="chapter-quiz__explain">
          <strong>{CHAPTER_QUIZ_COPY.correctReasonLabel}：</strong>
          {feedback.correctReason}
        </div>
      ) : null}
      {feedback?.selectedWrongReason ? (
        <div className="chapter-quiz__explain">
          <strong>
            {selectedLabel
              ? `${selectedLabel}错在：`
              : `${CHAPTER_QUIZ_COPY.wrongOptionReasonLabel}：`}
          </strong>
          {feedback.selectedWrongReason}
        </div>
      ) : null}
      {feedback?.confusion ? (
        <div className="chapter-quiz__explain">
          <strong>{CHAPTER_QUIZ_COPY.confusionLabel}：</strong>
          {feedback.confusion}
        </div>
      ) : null}
      {feedback?.sourceExcerpt ? (
        <div className="chapter-quiz__explain chapter-quiz__explain--excerpt">
          <strong>{CHAPTER_QUIZ_COPY.sourceExcerptLabel}：</strong>
          {feedback.sourceExcerpt}
        </div>
      ) : null}
      {feedback?.generalExplanation ? (
        <div className="chapter-quiz__explain">{feedback.generalExplanation}</div>
      ) : null}
    </>
  )

  return (
    <div
      className={
        isCorrect
          ? "chapter-quiz-panel__feedback chapter-quiz-panel__feedback--ok"
          : "chapter-quiz-panel__feedback chapter-quiz-panel__feedback--bad"
      }
    >
      <div className="chapter-quiz__verdict-row">
        <div
          className={
            isCorrect
              ? "chapter-quiz__verdict chapter-quiz__verdict--ok"
              : "chapter-quiz__verdict chapter-quiz__verdict--bad"
          }
        >
          <span aria-hidden="true">{isCorrect ? "✓ " : "✗ "}</span>
          {verdictText}
          {!isCorrect ? (
            <span className="chapter-quiz__answer-inline">
              {" · "}
              {CHAPTER_QUIZ_COPY.correctAnswerLabel}：
              {correctDisplayText}
            </span>
          ) : null}
        </div>
      </div>

      {isCorrect ? (
        <details
          className="chapter-quiz__details"
          open={correctDetailsOpen}
          onToggle={(e) => {
            setCorrectDetailsOpen(
              (e.currentTarget as HTMLDetailsElement).open
            )
          }}
        >
          <summary className="chapter-quiz__details-summary">
            {correctDetailsOpen
              ? CHAPTER_QUIZ_COPY.feedbackDetailsHide
              : CHAPTER_QUIZ_COPY.feedbackDetails}
          </summary>
          {details}
        </details>
      ) : (
        details
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action summary（结果页）
// ---------------------------------------------------------------------------

function ActionSummary(props: {
  categoryCounts: ReturnType<typeof countFirstCategories>
  repairedCount: number
  weakTotal: number
  unresolvedCount: number
  cardsAdded: number
  sessionContinueNext: boolean
  topicBlockId: number
  quizBlockId: number
  onStartRepair: () => void
  onOrganize: () => void
  onDelete: () => void
}) {
  const {
    categoryCounts,
    repairedCount,
    weakTotal,
    unresolvedCount,
    cardsAdded,
    sessionContinueNext,
    topicBlockId,
    quizBlockId,
    onStartRepair,
    onOrganize,
    onDelete
  } = props

  return (
    <section className="chapter-quiz-panel__section chapter-quiz-panel__action-summary">
      <h2 className="chapter-quiz-panel__action-title">
        {CHAPTER_QUIZ_COPY.actionSummaryTitle}
      </h2>
      <ul className="chapter-quiz-panel__action-counts">
        <li>
          {CHAPTER_QUIZ_COPY.certainCorrectLabel}: {categoryCounts.certain_correct}
        </li>
        <li>
          {CHAPTER_QUIZ_COPY.uncertainCorrectLabel}:{" "}
          {categoryCounts.uncertain_correct}
        </li>
        <li>
          {CHAPTER_QUIZ_COPY.wrongLabel}: {categoryCounts.wrong}
        </li>
        <li
          className={
            categoryCounts.skipped === 0
              ? "chapter-quiz-panel__action-counts--muted"
              : undefined
          }
        >
          {CHAPTER_QUIZ_COPY.skippedLabel}: {categoryCounts.skipped}
        </li>
        <li>
          {CHAPTER_QUIZ_COPY.repairedProgress(repairedCount, weakTotal)}
        </li>
        <li>{CHAPTER_QUIZ_COPY.cardsAddedCount(cardsAdded)}</li>
      </ul>

      <div className="chapter-quiz__hint chapter-quiz-panel__action-recs">
        {unresolvedCount > 0 ? (
          <div>{CHAPTER_QUIZ_COPY.recommendRepair(unresolvedCount)}</div>
        ) : null}
        {weakTotal > 0 ? (
          <div>{CHAPTER_QUIZ_COPY.recommendOrganize}</div>
        ) : null}
        {sessionContinueNext ? (
          <div>{CHAPTER_QUIZ_COPY.recommendContinue}</div>
        ) : null}
        {unresolvedCount === 0 && weakTotal === 0 ? (
          <div>{CHAPTER_QUIZ_COPY.doneHint}</div>
        ) : null}
      </div>

      <div className="chapter-quiz-panel__primary chapter-quiz-panel__primary--wrap">
        {unresolvedCount > 0 ? (
          <Button
            variant="solid"
            className="chapter-quiz-panel__cta"
            title={CHAPTER_QUIZ_COPY.startRepairTitle}
            onClick={onStartRepair}
          >
            {repairedCount > 0
              ? CHAPTER_QUIZ_COPY.continueRepair
              : CHAPTER_QUIZ_COPY.startRepair}
            {` (${unresolvedCount})`}
          </Button>
        ) : null}
        {weakTotal > 0 ? (
          <Button
            variant="outline"
            title={CHAPTER_QUIZ_COPY.organizeWeakTitle}
            onClick={onOrganize}
          >
            {CHAPTER_QUIZ_COPY.organizeWeak}
          </Button>
        ) : null}
        {sessionContinueNext ? (
          <Button
            variant={unresolvedCount > 0 ? "outline" : "solid"}
            className={
              unresolvedCount === 0 ? "chapter-quiz-panel__cta" : undefined
            }
            onClick={() => {
              dispatchChapterQuizAdvance({
                topicBlockId,
                quizBlockId
              })
            }}
          >
            {CHAPTER_QUIZ_COPY.continueNext}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onDelete}>
          {CHAPTER_QUIZ_COPY.deleteQuiz}
        </Button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Intent action bar
// ---------------------------------------------------------------------------

type IntentActionProps = {
  isCorrect: boolean
  intentPanel: IntentPanel
  setIntentPanel: (v: IntentPanel | ((prev: IntentPanel) => IntentPanel)) => void
  question: ChapterQuizQuestion
  cardAdds?: { basicBlockId?: number; clozeBlockId?: number }
  onJump: () => void
  onAddBasic: () => void
  clozeBusy: boolean
  cardBusyId: string | null
  clozePreview: ClozePreview | null
  setClozePreview: (v: ClozePreview | null) => void
  onStartCloze: () => void
  onConfirmCloze: () => void
  followUpDraft: string
  setFollowUpDraft: (v: string) => void
  followUps: { role: "user" | "assistant"; content: string }[]
  followUpBusy: boolean
  followUpError: string | null
  onFollowUp: () => void
}

function IntentActionSection(props: IntentActionProps) {
  const {
    isCorrect,
    intentPanel,
    setIntentPanel,
    question,
    cardAdds,
    onJump,
    onAddBasic,
    clozeBusy,
    cardBusyId,
    clozePreview,
    setClozePreview,
    onStartCloze,
    onConfirmCloze,
    followUpDraft,
    setFollowUpDraft,
    followUps,
    followUpBusy,
    followUpError,
    onFollowUp
  } = props

  const canAddCard = typeof question.sourceBlockId === "number"
  const hasSource = typeof question.sourceBlockId === "number"
  const basicDone = Boolean(cardAdds?.basicBlockId)
  const clozeDone = Boolean(cardAdds?.clozeBlockId)
  const basicBusy = cardBusyId === question.id
  const hasFollowUps = followUps.length > 0
  const reviewMenuOpen = intentPanel === "review-menu"
  const aiOpen = intentPanel === "ai"
  const intentPanelRef = useRef<HTMLDivElement | null>(null)
  const aiInputRef = useRef<HTMLInputElement | null>(null)
  const showClozePreview =
    clozePreview != null && clozePreview.questionId === question.id

  useEffect(() => {
    if (!reviewMenuOpen && !aiOpen) return
    let cancelled = false
    let raf1 = 0
    let raf2 = 0
    let timeoutId = 0

    const scrollAndFocus = () => {
      if (cancelled) return
      const el = intentPanelRef.current
      if (!el) return
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch (error) {
        console.warn("[章末小测] 意图面板 scrollIntoView 失败:", error)
      }
      if (aiOpen && aiInputRef.current) {
        try {
          aiInputRef.current.focus({ preventScroll: true })
        } catch {
          try {
            aiInputRef.current.focus()
          } catch (error) {
            console.warn("[章末小测] 追问输入框聚焦失败:", error)
          }
        }
      }
    }

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        scrollAndFocus()
        timeoutId = window.setTimeout(scrollAndFocus, 80)
      })
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [reviewMenuOpen, aiOpen, showClozePreview])

  const togglePanel = (panel: Exclude<IntentPanel, null>) => {
    setIntentPanel((prev) => (prev === panel ? null : panel))
  }

  const handleAddBasicClick = () => {
    if (!canAddCard || basicDone || basicBusy) return
    onAddBasic()
  }

  const reviewSplit = (
    <div
      className={
        "chapter-quiz-panel__intent-split" +
        (reviewMenuOpen ? " is-open" : "") +
        (!canAddCard ? " is-disabled" : "")
      }
    >
      <button
        type="button"
        className={
          "chapter-quiz-panel__intent-chip chapter-quiz-panel__intent-chip--main" +
          (basicDone ? " is-done" : "")
        }
        disabled={!canAddCard || basicDone || basicBusy}
        title={
          !canAddCard
            ? CHAPTER_QUIZ_COPY.cardSourceMissingTitle
            : basicDone
              ? CHAPTER_QUIZ_COPY.alreadyAdded
              : CHAPTER_QUIZ_COPY.intentAddReviewTitle
        }
        onClick={handleAddBasicClick}
      >
        {basicDone
          ? CHAPTER_QUIZ_COPY.alreadyAdded
          : basicBusy
            ? "…"
            : CHAPTER_QUIZ_COPY.addToReview}
      </button>
      <button
        type="button"
        className="chapter-quiz-panel__intent-chip chapter-quiz-panel__intent-chip--caret"
        disabled={!canAddCard}
        aria-expanded={reviewMenuOpen}
        aria-label={CHAPTER_QUIZ_COPY.addToReviewTitle}
        title={CHAPTER_QUIZ_COPY.addToReviewTitle}
        onClick={() => togglePanel("review-menu")}
      >
        ▾
      </button>
    </div>
  )

  const askAiBtn = (
    <button
      type="button"
      className={
        "chapter-quiz-panel__intent-chip" + (aiOpen ? " is-active" : "")
      }
      aria-expanded={aiOpen}
      title={CHAPTER_QUIZ_COPY.intentAskAiTitle}
      onClick={() => togglePanel("ai")}
    >
      {CHAPTER_QUIZ_COPY.intentAskAi}
      {hasFollowUps ? (
        <span className="chapter-quiz-panel__intent-badge">
          {followUps.length}
        </span>
      ) : null}
    </button>
  )

  const sourceBtn = hasSource ? (
    <button
      type="button"
      className="chapter-quiz-panel__intent-chip"
      title={CHAPTER_QUIZ_COPY.jumpToSourceTitle}
      onClick={onJump}
    >
      {CHAPTER_QUIZ_COPY.intentSource}
    </button>
  ) : null

  const orderedActions = isCorrect
    ? [reviewSplit, askAiBtn, sourceBtn]
    : [sourceBtn, askAiBtn, reviewSplit]

  return (
    <div className="chapter-quiz-panel__intent">
      <div
        className="chapter-quiz-panel__intent-bar"
        role="toolbar"
        aria-label={CHAPTER_QUIZ_COPY.intentBarLabel}
      >
        {orderedActions.map((node, i) =>
          node ? (
            <span key={i} className="chapter-quiz-panel__intent-item">
              {node}
            </span>
          ) : null
        )}
      </div>

      {!canAddCard ? (
        <div className="chapter-quiz__hint chapter-quiz-panel__intent-hint">
          {CHAPTER_QUIZ_COPY.cardSourceMissing}
        </div>
      ) : null}

      {reviewMenuOpen ? (
        <div
          ref={intentPanelRef}
          className="chapter-quiz-panel__intent-panel chapter-quiz-panel__review-add"
        >
          <div className="chapter-quiz__remember-label">
            {CHAPTER_QUIZ_COPY.rememberPrompt}
          </div>
          <div className="chapter-quiz__actions">
            <Button
              variant={basicDone ? "outline" : "solid"}
              className={
                !canAddCard || basicDone || basicBusy
                  ? "ir-button--blocked chapter-quiz__chip-btn"
                  : "chapter-quiz__chip-btn"
              }
              title={
                !canAddCard
                  ? CHAPTER_QUIZ_COPY.cardSourceMissingTitle
                  : CHAPTER_QUIZ_COPY.intentAddReviewTitle
              }
              onClick={handleAddBasicClick}
            >
              {basicDone
                ? CHAPTER_QUIZ_COPY.alreadyAdded
                : CHAPTER_QUIZ_COPY.addBasic}
            </Button>
            <Button
              variant="outline"
              className={
                !canAddCard || clozeDone || clozeBusy || basicBusy
                  ? "ir-button--blocked chapter-quiz__chip-btn"
                  : "chapter-quiz__chip-btn"
              }
              title={
                !canAddCard
                  ? CHAPTER_QUIZ_COPY.cardSourceMissingTitle
                  : CHAPTER_QUIZ_COPY.rememberPrompt
              }
              onClick={() => {
                if (!canAddCard || clozeDone || clozeBusy || basicBusy) return
                onStartCloze()
              }}
            >
              {clozeDone
                ? CHAPTER_QUIZ_COPY.alreadyAdded
                : clozeBusy
                  ? CHAPTER_QUIZ_COPY.clozeGenerating
                  : CHAPTER_QUIZ_COPY.addCloze}
            </Button>
          </div>
          {clozePreview && clozePreview.questionId === question.id ? (
            <div className="chapter-quiz__cloze-preview">
              <div className="chapter-quiz__remember-label">
                {CHAPTER_QUIZ_COPY.clozePreviewTitle}
              </div>
              <label className="chapter-quiz__field">
                全文
                <textarea
                  className="chapter-quiz__textarea"
                  value={clozePreview.text}
                  rows={3}
                  onChange={(e) =>
                    setClozePreview({
                      ...clozePreview,
                      text: e.currentTarget.value
                    })
                  }
                />
              </label>
              <label className="chapter-quiz__field">
                挖空
                <input
                  className="chapter-quiz__input"
                  value={clozePreview.clozeText}
                  onChange={(e) =>
                    setClozePreview({
                      ...clozePreview,
                      clozeText: e.currentTarget.value
                    })
                  }
                />
              </label>
              <div className="chapter-quiz__actions">
                <Button
                  variant="outline"
                  onClick={() => setClozePreview(null)}
                >
                  {CHAPTER_QUIZ_COPY.clozeCancel}
                </Button>
                <Button
                  variant="solid"
                  className={basicBusy ? "ir-button--blocked" : undefined}
                  onClick={() => {
                    if (basicBusy) return
                    onConfirmCloze()
                  }}
                >
                  {CHAPTER_QUIZ_COPY.clozeConfirm}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {aiOpen ? (
        <div
          ref={intentPanelRef}
          className="chapter-quiz-panel__intent-panel chapter-quiz__followup"
        >
          <div className="chapter-quiz__remember-label">
            {CHAPTER_QUIZ_COPY.followUpLabel}
          </div>
          <div className="chapter-quiz__followup-scroll">
            {followUps.length === 0 && !followUpBusy ? (
              <div className="chapter-quiz__hint">
                对这道题有疑问可在此追问。
              </div>
            ) : null}
            {followUps.map((turn, i) => (
              <div
                key={i}
                className={
                  turn.role === "user"
                    ? "chapter-quiz__fu chapter-quiz__fu--user"
                    : "chapter-quiz__fu chapter-quiz__fu--assistant"
                }
              >
                {turn.role === "assistant"
                  ? renderLightMarkdown(turn.content)
                  : turn.content}
              </div>
            ))}
            {followUpBusy ? (
              <div className="chapter-quiz__hint">
                {CHAPTER_QUIZ_COPY.followUpBusy}
              </div>
            ) : null}
            {followUpError ? (
              <div className="chapter-quiz__status chapter-quiz__status--error">
                {followUpError}
              </div>
            ) : null}
          </div>
          <div className="chapter-quiz__followup-row">
            <input
              ref={aiInputRef}
              className="chapter-quiz__input"
              value={followUpDraft}
              placeholder={CHAPTER_QUIZ_COPY.followUpPlaceholder}
              disabled={followUpBusy}
              onChange={(e) => setFollowUpDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  e.stopPropagation()
                  onFollowUp()
                }
              }}
            />
            <Button
              variant="solid"
              className={
                followUpBusy || !followUpDraft.trim()
                  ? "ir-button--blocked"
                  : undefined
              }
              onClick={() => {
                if (followUpBusy || !followUpDraft.trim()) return
                onFollowUp()
              }}
            >
              {CHAPTER_QUIZ_COPY.followUpSend}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
