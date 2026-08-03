/**
 * 章末小测块：紧凑状态/入口。
 * 完整答题 UI 仅在 Custom Panel（ChapterQuizExperience）中，避免双活竞争写题。
 */

import {
  CHAPTER_QUIZ_COPY,
  countAnsweredQuestions,
  countConfidentCorrect,
  dispatchChapterQuizAdvance,
  formatQuizGenProgressLabel,
  listWeakQuestions,
  openChapterQuizInSidePanel
} from "../../srs/incremental-reading/chapterQuiz"
import { useChapterQuizController } from "./useChapterQuizController"

const { useMemo } = window.React
const { Button, BlockShell } = orca.components

type Props = {
  panelId: string
  blockId: number
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: number
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
  pluginName?: string
  topicBlockId?: number
  phase?: string
  questionCount?: number
  sessionContinueNext?: boolean
}

export default function ChapterQuizBlock(props: Props) {
  const {
    panelId,
    blockId,
    rndId,
    blockLevel,
    indentLevel,
    mirrorId,
    initiallyCollapsed,
    renderingMode
  } = props

  const initialSeed = useMemo(
    () => ({
      pluginName: props.pluginName || "orca-srs",
      topicBlockId: props.topicBlockId,
      phase: props.phase as
        | "generating"
        | "quiz"
        | "done"
        | "error"
        | undefined,
      questionCount: props.questionCount,
      sessionContinueNext: props.sessionContinueNext
    }),
    // first-mount seed only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockId]
  )

  const {
    repr,
    hydrated,
    busy,
    questions,
    handleCancelGenerate,
    handleRetryGenerate,
    handleDelete
  } = useChapterQuizController({
    blockId,
    initialSeed,
    autoGenerate: true
  })

  const answered = countAnsweredQuestions(questions, repr.revealed)
  // 与面板同一语义：当前清晰 = 确定答对；薄弱 = 答错 / 不知道 / 猜对
  const confidentCorrect = countConfidentCorrect(questions, repr)
  const weakCount = listWeakQuestions(questions, repr).length
  const total = questions.length

  const handleOpenPanel = () => {
    openChapterQuizInSidePanel({
      hostPanelId: panelId,
      quizBlockId: blockId,
      topicBlockId: repr.topicBlockId
    })
  }

  const main = (
    <div className="chapter-quiz chapter-quiz--compact" contentEditable={false}>
      <div className="chapter-quiz__header">
        <div className="chapter-quiz__header-main">
          <span className="chapter-quiz__title">
            {CHAPTER_QUIZ_COPY.quizTitle}
          </span>
          {total > 0 && (repr.phase === "quiz" || repr.phase === "done") ? (
            <span className="chapter-quiz__progress">
              {CHAPTER_QUIZ_COPY.compactProgress(
                repr.phase === "done" ? total : answered,
                total
              )}
            </span>
          ) : null}
        </div>
      </div>

      {!hydrated ? (
        <div className="chapter-quiz__panel">
          <div className="chapter-quiz__hint">加载中…</div>
        </div>
      ) : null}

      {hydrated && repr.phase === "generating" ? (
        <div className="chapter-quiz__panel">
          <div className="chapter-quiz__status">
            {formatQuizGenProgressLabel(repr.genStage, repr.genAttempt)}
          </div>
          <div className="chapter-quiz__actions">
            <Button variant="outline" onClick={handleCancelGenerate}>
              {CHAPTER_QUIZ_COPY.cancelGenerate}
            </Button>
            <Button
              variant="solid"
              title={CHAPTER_QUIZ_COPY.openSidePanelTitle}
              onClick={handleOpenPanel}
            >
              {CHAPTER_QUIZ_COPY.openSidePanel}
            </Button>
          </div>
        </div>
      ) : null}

      {hydrated && repr.phase === "error" ? (
        <div className="chapter-quiz__panel">
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
        </div>
      ) : null}

      {hydrated && repr.phase === "quiz" ? (
        <div className="chapter-quiz__panel">
          <div className="chapter-quiz__hint">
            {answered === 0
              ? CHAPTER_QUIZ_COPY.compactReady
              : CHAPTER_QUIZ_COPY.compactInProgress}
          </div>
          <div className="chapter-quiz__actions">
            <Button
              variant="solid"
              title={
                answered === 0
                  ? CHAPTER_QUIZ_COPY.startQuizTitle
                  : CHAPTER_QUIZ_COPY.continueQuizTitle
              }
              onClick={handleOpenPanel}
            >
              {answered === 0
                ? CHAPTER_QUIZ_COPY.startQuiz
                : CHAPTER_QUIZ_COPY.continueQuiz}
            </Button>
          </div>
        </div>
      ) : null}

      {hydrated && repr.phase === "done" ? (
        <div className="chapter-quiz__panel">
          <div className="chapter-quiz__status">
            {CHAPTER_QUIZ_COPY.resultTitle}：
            {CHAPTER_QUIZ_COPY.resultSummary(confidentCorrect, weakCount)}
          </div>
          <div className="chapter-quiz__hint">
            {weakCount > 0 ? `${CHAPTER_QUIZ_COPY.weakCountLabel(weakCount)} · ` : ""}
            {CHAPTER_QUIZ_COPY.doneHint}
          </div>
          <div className="chapter-quiz__actions">
            {repr.sessionContinueNext ? (
              <Button
                variant="solid"
                onClick={() => {
                  dispatchChapterQuizAdvance({
                    topicBlockId: repr.topicBlockId,
                    quizBlockId: blockId
                  })
                }}
              >
                {CHAPTER_QUIZ_COPY.continueNext}
              </Button>
            ) : null}
            <Button
              variant="outline"
              title={CHAPTER_QUIZ_COPY.reviewDoneTitle}
              onClick={handleOpenPanel}
            >
              {CHAPTER_QUIZ_COPY.reviewDone}
            </Button>
            <Button
              variant={repr.sessionContinueNext ? "outline" : "solid"}
              onClick={() => void handleDelete()}
            >
              {CHAPTER_QUIZ_COPY.deleteQuiz}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="chapter-quiz-repr"
      contentClassName="chapter-quiz-repr-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={main}
      childrenJsx={null}
    />
  )
}
