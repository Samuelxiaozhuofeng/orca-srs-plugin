/**
 * 章末小测专注答题体验（Custom Panel 主视图）。
 * 主路径：题干 → 选项 → 揭晓 → 下一题；
 * 揭晓后辅助为扁平意图条：加入复习 / 问 AI / 原文（方案 A）。
 */

import {
  CHAPTER_QUIZ_COPY,
  countAnsweredQuestions,
  countConfidentCorrect,
  dispatchChapterQuizAdvance,
  formatQuizGenProgressLabel,
  isAnswerCorrect,
  jumpToQuizSourceBlock,
  listWeakQuestions,
  quizOptionLetter,
  type ChapterQuizQuestion
} from "../../srs/incremental-reading/chapterQuiz"
import { renderLightMarkdown } from "./chapterQuizMarkdown"
import {
  useChapterQuizController,
  type ClozePreview
} from "./useChapterQuizController"

const { useCallback, useEffect, useRef, useState } = window.React
const { Button } = orca.components

export type ChapterQuizExperienceProps = {
  panelId: string
  quizBlockId: number
}

type ReviewMode = "live" | "wrong"
/** 揭晓后展开的辅助面板：填空菜单 或 AI 追问 */
type IntentPanel = null | "review-menu" | "ai"

export default function ChapterQuizExperience(props: ChapterQuizExperienceProps) {
  const { panelId, quizBlockId } = props
  const ctl = useChapterQuizController({
    blockId: quizBlockId,
    autoGenerate: true,
    // 右侧 Custom Panel id：制卡时短暂切到同布局左侧可写 ViewPanel
    writeContextPanelId: panelId
  })

  const [intentPanel, setIntentPanel] = useState<IntentPanel>(null)
  const [reviewMode, setReviewMode] = useState<ReviewMode>("live")
  const [wrongCursor, setWrongCursor] = useState(0)

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
    handleUnknown,
    handleToggleGuessed,
    handleNext,
    handleAddBasicFor,
    handleStartClozeFor,
    handleConfirmClozeFor,
    handleFollowUpFor,
    handleCancelGenerate,
    handleRetryGenerate,
    handleDelete,
    clearEphemeralForQuestion
  } = ctl

  // 弱项 = 答错 / 不知道 / 猜对（旧「错题」语义扩展，向后兼容）
  const weakQuestions = listWeakQuestions(questions, repr)
  const confidentCorrect = countConfidentCorrect(questions, repr)
  const answeredCount = countAnsweredQuestions(questions, repr.revealed)
  const isReviewingWrong = reviewMode === "wrong" && weakQuestions.length > 0

  const activeQuestion: ChapterQuizQuestion | undefined = isReviewingWrong
    ? weakQuestions[
        Math.min(wrongCursor, Math.max(0, weakQuestions.length - 1))
      ]
    : question

  // 换题（含错题回看游标）时收起意图面板并清空临时追问 UI
  useEffect(() => {
    setIntentPanel(null)
    clearEphemeralForQuestion()
  }, [activeQuestion?.id, reviewMode, clearEphemeralForQuestion])

  const activeSelected =
    activeQuestion && typeof repr.answers?.[activeQuestion.id] === "number"
      ? repr.answers![activeQuestion.id]
      : undefined
  const activeRevealed = isReviewingWrong
    ? true
    : activeQuestion
      ? repr.revealed?.[activeQuestion.id] === true
      : false
  /** 选「不知道」的题：未选选项即揭示，算弱项 */
  const activeUnknown =
    activeQuestion != null && repr.unknowns?.[activeQuestion.id] === true
  const activeGuessed =
    activeQuestion != null && repr.guessed?.[activeQuestion.id] === true
  const activeCardAdds = activeQuestion
    ? repr.cardAdds?.[activeQuestion.id]
    : undefined
  const activeIsCorrect =
    typeof activeSelected === "number" &&
    activeQuestion != null &&
    isAnswerCorrect(activeQuestion, activeSelected)
  /** 意图条/弱项语义：猜对也按弱项处理（偏理解排序） */
  const activeWeak = Boolean(
    activeQuestion != null &&
      (activeUnknown || activeGuessed || activeIsCorrect === false)
  )

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

  const startWrongReview = useCallback(() => {
    if (weakQuestions.length === 0) return
    setReviewMode("wrong")
    setWrongCursor(0)
    clearEphemeralForQuestion()
  }, [clearEphemeralForQuestion, weakQuestions.length])

  const exitWrongReview = useCallback(() => {
    setReviewMode("live")
    setWrongCursor(0)
    clearEphemeralForQuestion()
  }, [clearEphemeralForQuestion])

  if (!hydrated) {
    return (
      <div className="chapter-quiz-panel">
        <div className="chapter-quiz-panel__shell">
          <div className="chapter-quiz__status">加载小测…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="chapter-quiz-panel">
      <div className="chapter-quiz-panel__shell">
        <header className="chapter-quiz-panel__header">
          <div className="chapter-quiz-panel__header-top">
            <span className="srs-card-badge srs-card-badge--reading">
              {isReviewingWrong ? CHAPTER_QUIZ_COPY.reviewModeLabel : "章末小测"}
            </span>
          </div>
          <div className="chapter-quiz-panel__header-main">
            <h1 className="chapter-quiz-panel__title">
              {isReviewingWrong
                ? CHAPTER_QUIZ_COPY.reviewModeLabel
                : CHAPTER_QUIZ_COPY.quizTitle}
            </h1>
            {questions.length > 0 &&
            (repr.phase === "quiz" || isReviewingWrong) ? (
              <span className="chapter-quiz-panel__progress">
                {isReviewingWrong
                  ? `弱项 ${Math.min(wrongCursor + 1, weakQuestions.length)} / ${weakQuestions.length}`
                  : `第 ${index + 1} / ${questions.length} 题`}
              </span>
            ) : null}
            {repr.phase === "quiz" && !isReviewingWrong && questions.length > 0 ? (
              <span className="chapter-quiz-panel__progress-sub">
                {CHAPTER_QUIZ_COPY.compactProgress(
                  answeredCount,
                  questions.length
                )}
              </span>
            ) : null}
          </div>
          {questions.length > 0 && (repr.phase === "quiz" || isReviewingWrong) ? (
            <div className="chapter-quiz-panel__progress-bar-track">
              <div
                className="chapter-quiz-panel__progress-bar-fill"
                style={{
                  width: `${
                    isReviewingWrong
                      ? ((Math.min(wrongCursor + 1, weakQuestions.length)) / weakQuestions.length) * 100
                      : ((index + 1) / questions.length) * 100
                  }%`
                }}
              />
            </div>
          ) : null}
        </header>

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

          {(repr.phase === "quiz" || isReviewingWrong) && activeQuestion ? (
            <section className="chapter-quiz-panel__section">
              {repr.phase === "quiz" && !isReviewingWrong ? (
                <div className="chapter-quiz__quiz-vs-cards">
                  {CHAPTER_QUIZ_COPY.quizVsCardsHint}
                </div>
              ) : null}
              <div className="chapter-quiz__stem">{activeQuestion.text}</div>
              <div className="chapter-quiz__options" role="radiogroup">
                {activeQuestion.options.map((opt, oi) => {
                  const isSelected = activeSelected === oi
                  const isCorrect = oi === activeQuestion.correctIndex
                  let stateClass = ""
                  if (activeRevealed) {
                    if (isCorrect) stateClass = " is-correct"
                    else if (isSelected) stateClass = " is-wrong"
                  } else if (isSelected) {
                    stateClass = " is-selected"
                  }
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={`chapter-quiz__option${stateClass}`}
                      disabled={activeRevealed || busy || isReviewingWrong}
                      onClick={() => {
                        if (isReviewingWrong) return
                        void handleSelect(oi)
                      }}
                    >
                      <span className="chapter-quiz__option-letter">
                        {quizOptionLetter(oi)}
                      </span>
                      <span className="chapter-quiz__option-text">{opt}</span>
                    </button>
                  )
                })}
              </div>

              {!activeRevealed ? (
                <div className="chapter-quiz__unknown-row">
                  <button
                    type="button"
                    className="chapter-quiz__unknown-btn"
                    title={CHAPTER_QUIZ_COPY.unknownTitle}
                    disabled={busy || isReviewingWrong}
                    onClick={() => {
                      if (isReviewingWrong) return
                      void handleUnknown()
                    }}
                  >
                    {CHAPTER_QUIZ_COPY.unknown}
                  </button>
                </div>
              ) : null}

              {activeRevealed ? (
                <div
                  className={
                    activeUnknown || !activeIsCorrect
                      ? "chapter-quiz-panel__feedback chapter-quiz-panel__feedback--bad"
                      : "chapter-quiz-panel__feedback chapter-quiz-panel__feedback--ok"
                  }
                >
                  <div className="chapter-quiz__verdict-row">
                    <div
                      className={
                        activeUnknown || !activeIsCorrect
                          ? "chapter-quiz__verdict chapter-quiz__verdict--bad"
                          : "chapter-quiz__verdict chapter-quiz__verdict--ok"
                      }
                    >
                      {activeUnknown
                        ? CHAPTER_QUIZ_COPY.unknownVerdict
                        : activeIsCorrect
                          ? CHAPTER_QUIZ_COPY.correct
                          : CHAPTER_QUIZ_COPY.incorrect}
                      {activeUnknown || !activeIsCorrect ? (
                        <span className="chapter-quiz__answer-inline">
                          {" · "}
                          {CHAPTER_QUIZ_COPY.correctAnswerLabel}：
                          {quizOptionLetter(activeQuestion.correctIndex)}.{" "}
                          {activeQuestion.options[activeQuestion.correctIndex]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {activeQuestion.explanation ? (
                    <div className="chapter-quiz__explain">
                      {activeQuestion.explanation}
                    </div>
                  ) : null}
                  {activeIsCorrect ? (
                    <label className="chapter-quiz__guessed" title={CHAPTER_QUIZ_COPY.guessedTitle}>
                      <input
                        type="checkbox"
                        checked={activeGuessed}
                        disabled={busy || isReviewingWrong}
                        onChange={() => {
                          if (isReviewingWrong) return
                          void handleToggleGuessed(activeQuestion.id)
                        }}
                      />
                      <span>{CHAPTER_QUIZ_COPY.guessed}</span>
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="chapter-quiz__primary-hint">
                  选一项后显示对错与讲解
                </p>
              )}

              {activeRevealed ? (
                <IntentActionSection
                  isWeak={activeWeak}
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
                    void handleFollowUpFor(activeQuestion, activeSelected)
                  }}
                />
              ) : null}

              <div className="chapter-quiz-panel__primary">
                {isReviewingWrong ? (
                  <>
                    <Button
                      variant="outline"
                      className={
                        wrongCursor <= 0 ? "ir-button--blocked" : undefined
                      }
                      onClick={() => {
                        if (wrongCursor <= 0) return
                        setWrongCursor((c: number) => Math.max(0, c - 1))
                        clearEphemeralForQuestion()
                      }}
                    >
                      上一题
                    </Button>
                    {wrongCursor < weakQuestions.length - 1 ? (
                      <Button
                        variant="solid"
                        className="chapter-quiz__next-btn chapter-quiz-panel__cta"
                        onClick={() => {
                          setWrongCursor((c: number) =>
                            Math.min(weakQuestions.length - 1, c + 1)
                          )
                          clearEphemeralForQuestion()
                        }}
                      >
                        {CHAPTER_QUIZ_COPY.next}
                      </Button>
                    ) : (
                      <Button
                        variant="solid"
                        className="chapter-quiz__next-btn chapter-quiz-panel__cta"
                        onClick={exitWrongReview}
                      >
                        {CHAPTER_QUIZ_COPY.backToSummary}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    variant="solid"
                    className={
                      !revealed
                        ? "ir-button--blocked chapter-quiz__next-btn"
                        : "chapter-quiz__next-btn chapter-quiz-panel__cta"
                    }
                    onClick={() => {
                      if (!revealed) return
                      void handleNext()
                    }}
                  >
                    {index >= questions.length - 1
                      ? CHAPTER_QUIZ_COPY.finish
                      : CHAPTER_QUIZ_COPY.next}
                  </Button>
                )}
              </div>

              {localError ? (
                <div className="chapter-quiz__status chapter-quiz__status--error">
                  {localError}
                </div>
              ) : null}
            </section>
          ) : null}

          {repr.phase === "done" && !isReviewingWrong ? (
            <section className="chapter-quiz-panel__section chapter-quiz-panel__done-card">
              <div className="chapter-quiz-panel__done-hero">
                <div className="chapter-quiz-panel__done-score">
                  <span className="chapter-quiz-panel__done-score-num">
                    {confidentCorrect}
                  </span>
                  <span className="chapter-quiz-panel__done-score-total">
                    / {questions.length}
                  </span>
                </div>
                <div className="chapter-quiz-panel__done-badge">
                  {Math.round((confidentCorrect / (questions.length || 1)) * 100)}% 当前清晰
                </div>
              </div>
              <div className="chapter-quiz__status">
                {CHAPTER_QUIZ_COPY.resultTitle}
              </div>
              <div className="chapter-quiz__hint">
                {CHAPTER_QUIZ_COPY.resultSummary(
                  confidentCorrect,
                  weakQuestions.length
                )}
                {" · "}
                {CHAPTER_QUIZ_COPY.doneHint}
              </div>
              <div className="chapter-quiz__hint chapter-quiz__hint--muted">
                {CHAPTER_QUIZ_COPY.resultWeakScope}
              </div>
              <div className="chapter-quiz-panel__primary">
                {repr.sessionContinueNext ? (
                  <Button
                    variant="solid"
                    className="chapter-quiz-panel__cta"
                    onClick={() => {
                      dispatchChapterQuizAdvance({
                        topicBlockId: repr.topicBlockId,
                        quizBlockId
                      })
                    }}
                  >
                    {CHAPTER_QUIZ_COPY.continueNext}
                  </Button>
                ) : null}
                {weakQuestions.length > 0 ? (
                  <Button
                    variant="outline"
                    title={CHAPTER_QUIZ_COPY.reviewWeakTitle}
                    onClick={startWrongReview}
                  >
                    {CHAPTER_QUIZ_COPY.reviewWeak}
                  </Button>
                ) : null}
                <Button
                  variant={repr.sessionContinueNext ? "outline" : "solid"}
                  onClick={() => void handleDelete()}
                >
                  {CHAPTER_QUIZ_COPY.deleteQuiz}
                </Button>
              </div>
            </section>
          ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intent action bar (方案 A)：揭晓后扁平三意图，不再套「深入理解」折叠
// ---------------------------------------------------------------------------

type IntentActionProps = {
  /** 弱项（答错 / 不知道 / 猜对）：意图条偏理解排序；对题偏捕获 */
  isWeak: boolean
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
    isWeak,
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

  // 制卡落点是当前题 sourceBlockId（与「原文」同一来源）；缺失时禁用制卡
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

  /** 展开辅助面板后滚入视野，避免被 sticky「下一题」挡住且用户需手滑 */
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
        // center：把展开区滚到壳层中部，避开底部 sticky CTA 遮挡
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

    // 等展开内容完成布局后再滚（双 rAF + 短延迟覆盖 sticky 重排）
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

  // 弱项偏理解（原文 / 问 AI 靠前）；对题偏捕获（加入复习靠前）
  const orderedActions = isWeak
    ? [sourceBtn, askAiBtn, reviewSplit]
    : [reviewSplit, askAiBtn, sourceBtn]

  return (
    <div className="chapter-quiz-panel__intent">
      <div
        className="chapter-quiz-panel__intent-bar"
        role="toolbar"
        aria-label={CHAPTER_QUIZ_COPY.intentBarLabel}
      >
        {orderedActions.map((node, i) =>
          node ? <span key={i} className="chapter-quiz-panel__intent-item">{node}</span> : null
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
