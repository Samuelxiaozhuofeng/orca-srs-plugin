/**
 * 章末小测专注答题体验（Custom Panel 主视图）。
 * 主路径：题干 → 选项 → 揭晓 → 下一题；辅助功能默认折叠在「深入理解」。
 */

import {
  CHAPTER_QUIZ_COPY,
  countAnsweredQuestions,
  countCorrectAnswers,
  dispatchChapterQuizAdvance,
  isAnswerCorrect,
  jumpToQuizSourceBlock,
  listWrongQuestions,
  quizOptionLetter,
  type ChapterQuizQuestion
} from "../../srs/incremental-reading/chapterQuiz"
import { renderLightMarkdown } from "./chapterQuizMarkdown"
import {
  useChapterQuizController,
  type ClozePreview
} from "./useChapterQuizController"

const { useCallback, useEffect, useState } = window.React
const { Button } = orca.components

export type ChapterQuizExperienceProps = {
  panelId: string
  quizBlockId: number
}

type ReviewMode = "live" | "wrong"

export default function ChapterQuizExperience(props: ChapterQuizExperienceProps) {
  const { panelId, quizBlockId } = props
  const ctl = useChapterQuizController({
    blockId: quizBlockId,
    autoGenerate: true,
    // 右侧 Custom Panel id：制卡时短暂切到同布局左侧可写 ViewPanel
    writeContextPanelId: panelId
  })

  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const [reviewAddOpen, setReviewAddOpen] = useState(false)
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

  const wrongQuestions = listWrongQuestions(questions, repr.answers)
  const correctCount = countCorrectAnswers(questions, repr.answers ?? {})
  const answeredCount = countAnsweredQuestions(questions, repr.revealed)
  const isReviewingWrong = reviewMode === "wrong" && wrongQuestions.length > 0

  const activeQuestion: ChapterQuizQuestion | undefined = isReviewingWrong
    ? wrongQuestions[
        Math.min(wrongCursor, Math.max(0, wrongQuestions.length - 1))
      ]
    : question

  // 换题（含错题回看游标）时收起深入理解并清空临时追问 UI
  useEffect(() => {
    setDeepDiveOpen(false)
    setReviewAddOpen(false)
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
  const activeCardAdds = activeQuestion
    ? repr.cardAdds?.[activeQuestion.id]
    : undefined
  const activeIsCorrect =
    typeof activeSelected === "number" &&
    activeQuestion != null &&
    isAnswerCorrect(activeQuestion, activeSelected)

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
    if (wrongQuestions.length === 0) return
    setReviewMode("wrong")
    setWrongCursor(0)
    clearEphemeralForQuestion()
  }, [clearEphemeralForQuestion, wrongQuestions.length])

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
                  ? `错题 ${Math.min(wrongCursor + 1, wrongQuestions.length)} / ${wrongQuestions.length}`
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
        </header>

        <div className="chapter-quiz-panel__body">
          {repr.phase === "generating" ? (
            <section className="chapter-quiz-panel__section">
              <div className="chapter-quiz__status">
                {CHAPTER_QUIZ_COPY.generating}
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

              {activeRevealed ? (
                <div
                  className={
                    activeIsCorrect
                      ? "chapter-quiz-panel__feedback chapter-quiz-panel__feedback--ok"
                      : "chapter-quiz-panel__feedback chapter-quiz-panel__feedback--bad"
                  }
                >
                  <div className="chapter-quiz__verdict-row">
                    <div
                      className={
                        activeIsCorrect
                          ? "chapter-quiz__verdict chapter-quiz__verdict--ok"
                          : "chapter-quiz__verdict chapter-quiz__verdict--bad"
                      }
                    >
                      {activeIsCorrect
                        ? CHAPTER_QUIZ_COPY.correct
                        : CHAPTER_QUIZ_COPY.incorrect}
                      {!activeIsCorrect ? (
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
                </div>
              ) : (
                <p className="chapter-quiz__primary-hint">
                  选一项后显示对错与讲解
                </p>
              )}

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
                    {wrongCursor < wrongQuestions.length - 1 ? (
                      <Button
                        variant="solid"
                        className="chapter-quiz__next-btn chapter-quiz-panel__cta"
                        onClick={() => {
                          setWrongCursor((c: number) =>
                            Math.min(wrongQuestions.length - 1, c + 1)
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

              {activeRevealed ? (
                <DeepDiveSection
                  open={deepDiveOpen}
                  onToggle={() => setDeepDiveOpen((v: boolean) => !v)}
                  question={activeQuestion}
                  cardAdds={activeCardAdds}
                  reviewAddOpen={reviewAddOpen}
                  onToggleReviewAdd={() => setReviewAddOpen((v: boolean) => !v)}
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

              {localError ? (
                <div className="chapter-quiz__status chapter-quiz__status--error">
                  {localError}
                </div>
              ) : null}
            </section>
          ) : null}

          {repr.phase === "done" && !isReviewingWrong ? (
            <section className="chapter-quiz-panel__section">
              <div className="chapter-quiz__status">
                {CHAPTER_QUIZ_COPY.doneSummary(correctCount, questions.length)}
              </div>
              <div className="chapter-quiz__hint">
                {CHAPTER_QUIZ_COPY.wrongCountLabel(
                  Math.max(0, questions.length - correctCount)
                )}
                {" · "}
                {CHAPTER_QUIZ_COPY.doneHint}
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
                {wrongQuestions.length > 0 ? (
                  <Button
                    variant="outline"
                    title={CHAPTER_QUIZ_COPY.reviewWrongTitle}
                    onClick={startWrongReview}
                  >
                    {CHAPTER_QUIZ_COPY.reviewWrong}
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deep dive (collapsed by default)
// ---------------------------------------------------------------------------

type DeepDiveProps = {
  open: boolean
  onToggle: () => void
  question: ChapterQuizQuestion
  cardAdds?: { basicBlockId?: number; clozeBlockId?: number }
  reviewAddOpen: boolean
  onToggleReviewAdd: () => void
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

function DeepDiveSection(props: DeepDiveProps) {
  const {
    open,
    onToggle,
    question,
    cardAdds,
    reviewAddOpen,
    onToggleReviewAdd,
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

  // 制卡落点是当前题 sourceBlockId（与「跳转原文」同一来源）；缺失时禁用制卡
  const canAddCard = typeof question.sourceBlockId === "number"

  return (
    <div className="chapter-quiz-panel__deep">
      <button
        type="button"
        className="chapter-quiz-panel__deep-toggle"
        aria-expanded={open}
        title={CHAPTER_QUIZ_COPY.deepDiveTitle}
        onClick={onToggle}
      >
        <span className="chapter-quiz-panel__deep-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        {CHAPTER_QUIZ_COPY.deepDive}
      </button>

      {open ? (
        <div className="chapter-quiz-panel__deep-body">
          <div className="chapter-quiz-panel__deep-block">
            <div className="chapter-quiz__remember-label">
              {CHAPTER_QUIZ_COPY.sourceBasis}
            </div>
            {typeof question.sourceBlockId === "number" ? (
              <Button
                variant="outline"
                className="chapter-quiz__jump-btn"
                title={CHAPTER_QUIZ_COPY.jumpToSourceTitle}
                onClick={onJump}
              >
                {CHAPTER_QUIZ_COPY.jumpToSource}
              </Button>
            ) : (
              <div className="chapter-quiz__hint">
                {CHAPTER_QUIZ_COPY.jumpToSourceMissing}
              </div>
            )}
          </div>

          <div className="chapter-quiz-panel__deep-block chapter-quiz__followup">
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

          <div className="chapter-quiz-panel__deep-block">
            <button
              type="button"
              className="chapter-quiz-panel__deep-toggle chapter-quiz-panel__deep-toggle--nested"
              aria-expanded={reviewAddOpen}
              title={CHAPTER_QUIZ_COPY.addToReviewTitle}
              onClick={onToggleReviewAdd}
            >
              <span className="chapter-quiz-panel__deep-chevron" aria-hidden>
                {reviewAddOpen ? "▾" : "▸"}
              </span>
              {CHAPTER_QUIZ_COPY.addToReview}
            </button>
            {reviewAddOpen ? (
              <div className="chapter-quiz-panel__review-add">
                {!canAddCard ? (
                  <div className="chapter-quiz__hint">
                    {CHAPTER_QUIZ_COPY.cardSourceMissing}
                  </div>
                ) : null}
                <div className="chapter-quiz__actions">
                  <Button
                    variant={cardAdds?.basicBlockId ? "outline" : "solid"}
                    className={
                      !canAddCard ||
                      cardAdds?.basicBlockId ||
                      cardBusyId === question.id
                        ? "ir-button--blocked chapter-quiz__chip-btn"
                        : "chapter-quiz__chip-btn"
                    }
                    title={
                      !canAddCard
                        ? CHAPTER_QUIZ_COPY.cardSourceMissingTitle
                        : CHAPTER_QUIZ_COPY.rememberPrompt
                    }
                    onClick={() => {
                      if (
                        !canAddCard ||
                        cardAdds?.basicBlockId ||
                        cardBusyId === question.id
                      ) {
                        return
                      }
                      onAddBasic()
                    }}
                  >
                    {cardAdds?.basicBlockId
                      ? CHAPTER_QUIZ_COPY.alreadyAdded
                      : CHAPTER_QUIZ_COPY.addBasic}
                  </Button>
                  <Button
                    variant="outline"
                    className={
                      !canAddCard ||
                      cardAdds?.clozeBlockId ||
                      clozeBusy ||
                      cardBusyId === question.id
                        ? "ir-button--blocked chapter-quiz__chip-btn"
                        : "chapter-quiz__chip-btn"
                    }
                    title={
                      !canAddCard
                        ? CHAPTER_QUIZ_COPY.cardSourceMissingTitle
                        : CHAPTER_QUIZ_COPY.rememberPrompt
                    }
                    onClick={() => {
                      if (
                        !canAddCard ||
                        cardAdds?.clozeBlockId ||
                        clozeBusy ||
                        cardBusyId === question.id
                      ) {
                        return
                      }
                      onStartCloze()
                    }}
                  >
                    {cardAdds?.clozeBlockId
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
                        className={
                          cardBusyId === question.id
                            ? "ir-button--blocked"
                            : undefined
                        }
                        onClick={() => {
                          if (cardBusyId === question.id) return
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
          </div>
        </div>
      ) : null}
    </div>
  )
}
