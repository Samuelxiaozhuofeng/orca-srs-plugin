/**
 * 章末小测块渲染器：生成 → 一题一题单选 → 揭晓/讲解/追问/入卡 → 结束。
 */

import {
  CHAPTER_QUIZ_COPY,
  CHAPTER_QUIZ_DEFAULT_COUNT,
  collectTopicPlainText,
  countCorrectAnswers,
  deleteChapterQuizBlock,
  dispatchChapterQuizAdvance,
  generateChapterQuizFollowUp,
  generateChapterQuizWithRetries,
  isAnswerCorrect,
  jumpToQuizSourceBlock,
  loadChapterQuizState,
  normalizeChapterQuizRepr,
  openChapterQuizInSidePanel,
  rewriteQuestionAsCloze,
  saveChapterQuizRepr,
  writeBasicCardFromQuizQuestion,
  writeClozeCardFromQuizQuestion,
  type ChapterQuizQuestion,
  type ChapterQuizRepr
} from "../../srs/incremental-reading/chapterQuiz"
import { isAIConfigured } from "../../srs/ai/aiSettingsSchema"

const {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} = window.React
const { Button, BlockShell } = orca.components

type FollowUpTurn = { role: "user" | "assistant"; content: string }

type ClozePreview = {
  text: string
  clozeText: string
  questionId: string
}

type Props = {
  panelId: string
  blockId: number
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: number
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
} & Partial<ChapterQuizRepr>

function optionLetter(i: number): string {
  return String.fromCharCode(65 + i)
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

  const initial = useMemo(
    () =>
      normalizeChapterQuizRepr(props, {
        pluginName: props.pluginName || "orca-srs",
        topicBlockId: props.topicBlockId
      }),
    // only hydrate from first mount props; later state is local + saved
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockId]
  )

  const [repr, setRepr] = useState<ChapterQuizRepr>(initial)
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [followUpDraft, setFollowUpDraft] = useState("")
  const [followUps, setFollowUps] = useState<FollowUpTurn[]>([])
  const [followUpBusy, setFollowUpBusy] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const [clozePreview, setClozePreview] = useState<ClozePreview | null>(null)
  const [clozeBusy, setClozeBusy] = useState(false)
  const [cardBusyId, setCardBusyId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const genStartedRef = useRef(false)
  const reprRef = useRef(repr)
  reprRef.current = repr

  // 从 srs.chapterQuiz 属性回填（_repr 不再承载题目）
  useEffect(() => {
    let cancelled = false
    setHydrated(false)
    genStartedRef.current = false
    void (async () => {
      try {
        const loaded = await loadChapterQuizState(blockId, initial)
        if (cancelled) return
        setRepr(loaded)
        reprRef.current = loaded
      } catch (error) {
        console.error("[章末小测] 加载状态失败，使用 props 初值:", error)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [blockId, initial])

  const persist = useCallback(async (next: ChapterQuizRepr): Promise<boolean> => {
    // 先更新本地 UI，避免「AI 已出题但保存失败」时界面空白
    setRepr(next)
    reprRef.current = next
    try {
      await saveChapterQuizRepr(blockId, next)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 保存状态失败:", error)
      orca.notify("error", `小测状态保存失败：${message}`, {
        title: "章末小测"
      })
      setLocalError(`状态保存失败：${message}`)
      return false
    }
  }, [blockId])

  const runGeneration = useCallback(async () => {
    const current = reprRef.current
    if (!isAIConfigured(current.pluginName)) {
      await persist({
        ...current,
        phase: "error",
        errorMessage: CHAPTER_QUIZ_COPY.needAi
      })
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setLocalError(null)

    try {
      await persist({
        ...current,
        phase: "generating",
        errorMessage: undefined,
        questions: undefined
      })

      const collected = await collectTopicPlainText(current.topicBlockId)
      if (controller.signal.aborted) return
      if (!collected.text) {
        await persist({
          ...reprRef.current,
          phase: "error",
          errorMessage: CHAPTER_QUIZ_COPY.emptySource
        })
        return
      }

      const result = await generateChapterQuizWithRetries({
        pluginName: current.pluginName,
        sourceText: collected.text,
        questionCount: current.questionCount || CHAPTER_QUIZ_DEFAULT_COUNT,
        truncated: collected.truncated,
        allowedBlockIds: collected.blockIds,
        signal: controller.signal
      })

      if (controller.signal.aborted) return

      if (!result.success) {
        await persist({
          ...reprRef.current,
          phase: "error",
          errorMessage: result.error.message
        })
        return
      }

      await persist({
        ...reprRef.current,
        phase: "quiz",
        questions: result.questions,
        currentIndex: 0,
        answers: {},
        revealed: {},
        cardAdds: {},
        errorMessage: undefined
      })
      setFollowUps([])
      setFollowUpDraft("")
      setClozePreview(null)
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 生成失败:", error)
      await persist({
        ...reprRef.current,
        phase: "error",
        errorMessage: message
      })
    } finally {
      if (abortRef.current === controller) {
        setBusy(false)
      }
    }
  }, [persist])

  // 属性回填完成后再自动出题，避免覆盖已保存进度
  useEffect(() => {
    if (!hydrated) return
    if (genStartedRef.current) return
    if (repr.phase !== "generating") return
    if (repr.questions && repr.questions.length > 0) return
    genStartedRef.current = true
    void runGeneration()
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, hydrated, repr.phase])

  const questions = repr.questions ?? []
  const index = Math.min(
    Math.max(0, repr.currentIndex ?? 0),
    Math.max(0, questions.length - 1)
  )
  const question: ChapterQuizQuestion | undefined = questions[index]
  const selected =
    question && typeof repr.answers?.[question.id] === "number"
      ? repr.answers![question.id]
      : undefined
  const revealed = question ? repr.revealed?.[question.id] === true : false
  const cardAdds = question ? repr.cardAdds?.[question.id] : undefined

  const handleSelect = async (optionIndex: number) => {
    if (!question || revealed || busy) return
    const answers = { ...(repr.answers ?? {}), [question.id]: optionIndex }
    const revealedMap = { ...(repr.revealed ?? {}), [question.id]: true }
    setFollowUps([])
    setFollowUpDraft("")
    setFollowUpError(null)
    setClozePreview(null)
    await persist({
      ...repr,
      answers,
      revealed: revealedMap
    })
  }

  const handleNext = async () => {
    if (!question) return
    if (index >= questions.length - 1) {
      await persist({ ...repr, phase: "done", currentIndex: index })
      return
    }
    const ok = await persist({ ...repr, currentIndex: index + 1 })
    if (!ok) return
    setFollowUps([])
    setFollowUpDraft("")
    setFollowUpError(null)
    setClozePreview(null)
  }

  const handleAddBasic = async () => {
    if (!question || cardAdds?.basicBlockId) return
    setCardBusyId(question.id)
    setLocalError(null)
    try {
      const id = await writeBasicCardFromQuizQuestion({
        pluginName: repr.pluginName,
        parentBlockId: repr.topicBlockId,
        question
      })
      const nextAdds = {
        ...(repr.cardAdds ?? {}),
        [question.id]: {
          ...(repr.cardAdds?.[question.id] ?? {}),
          basicBlockId: id
        }
      }
      const saved = await persist({ ...repr, cardAdds: nextAdds })
      if (!saved) {
        orca.notify(
          "warn",
          "简答卡已创建，但测验状态未保存；请避免重复点击",
          { title: "章末小测" }
        )
        return
      }
      orca.notify("success", CHAPTER_QUIZ_COPY.basicAdded, { title: "章末小测" })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 简答卡失败:", error)
      setLocalError(message)
      orca.notify("error", `加入简答卡失败：${message}`, { title: "章末小测" })
    } finally {
      setCardBusyId(null)
    }
  }

  const handleStartCloze = async () => {
    if (!question || cardAdds?.clozeBlockId) return
    setClozeBusy(true)
    setLocalError(null)
    setClozePreview(null)
    try {
      const result = await rewriteQuestionAsCloze({
        pluginName: repr.pluginName,
        question
      })
      if (!result.success) {
        setLocalError(result.error.message)
        orca.notify("error", result.error.message, { title: "章末小测" })
        return
      }
      setClozePreview({
        text: result.text,
        clozeText: result.clozeText,
        questionId: question.id
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 填空改写失败:", error)
      setLocalError(message)
      orca.notify("error", message, { title: "章末小测" })
    } finally {
      setClozeBusy(false)
    }
  }

  const handleConfirmCloze = async () => {
    if (!clozePreview || !question) return
    if (clozePreview.questionId !== question.id) return
    setCardBusyId(question.id)
    setLocalError(null)
    try {
      const id = await writeClozeCardFromQuizQuestion({
        pluginName: repr.pluginName,
        parentBlockId: repr.topicBlockId,
        text: clozePreview.text,
        clozeText: clozePreview.clozeText
      })
      const nextAdds = {
        ...(repr.cardAdds ?? {}),
        [question.id]: {
          ...(repr.cardAdds?.[question.id] ?? {}),
          clozeBlockId: id
        }
      }
      const saved = await persist({ ...repr, cardAdds: nextAdds })
      setClozePreview(null)
      if (!saved) {
        orca.notify(
          "warn",
          "填空卡已创建，但测验状态未保存；请避免重复点击",
          { title: "章末小测" }
        )
        return
      }
      orca.notify("success", CHAPTER_QUIZ_COPY.clozeAdded, { title: "章末小测" })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 填空卡写入失败:", error)
      setLocalError(message)
      orca.notify("error", `加入填空卡失败：${message}`, { title: "章末小测" })
    } finally {
      setCardBusyId(null)
    }
  }

  const handleFollowUp = async () => {
    if (!question || !followUpDraft.trim() || followUpBusy) return
    const userText = followUpDraft.trim()
    setFollowUpBusy(true)
    setFollowUpError(null)
    setFollowUpDraft("")
    const history = [...followUps]
    setFollowUps([...history, { role: "user", content: userText }])
    try {
      const result = await generateChapterQuizFollowUp({
        pluginName: repr.pluginName,
        question,
        selectedIndex: selected,
        userQuestion: userText,
        history
      })
      if (!result.success) {
        setFollowUpError(result.error.message)
        return
      }
      setFollowUps((prev: FollowUpTurn[]) => [
        ...prev,
        { role: "assistant", content: result.answer }
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 追问失败:", error)
      setFollowUpError(message)
    } finally {
      setFollowUpBusy(false)
    }
  }

  const handleCancelGenerate = () => {
    abortRef.current?.abort()
    setBusy(false)
    void persist({
      ...reprRef.current,
      phase: "error",
      errorMessage: CHAPTER_QUIZ_COPY.cancelled
    })
    orca.notify("info", CHAPTER_QUIZ_COPY.cancelled, { title: "章末小测" })
  }

  const handleDelete = async () => {
    try {
      await deleteChapterQuizBlock(blockId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 删除失败:", error)
      orca.notify("error", `删除测验失败：${message}`, { title: "章末小测" })
    }
  }

  const correctCount = countCorrectAnswers(questions, repr.answers ?? {})

  const handleOpenSidePanel = () => {
    // 右栏小测；左栏保持 srs.ir-session（不 goTo 顶掉渐进阅读）
    openChapterQuizInSidePanel({
      hostPanelId: panelId,
      quizBlockId: blockId,
      topicBlockId: repr.topicBlockId
    })
  }

  const handleJumpToSource = () => {
    if (!question?.sourceBlockId) {
      orca.notify("warn", CHAPTER_QUIZ_COPY.jumpToSourceMissing, {
        title: "章末小测"
      })
      return
    }
    jumpToQuizSourceBlock({
      sourceBlockId: question.sourceBlockId,
      currentPanelId: panelId,
      topicBlockId: repr.topicBlockId
    })
  }

  const main = (
    <div className="chapter-quiz" contentEditable={false}>
      <div className="chapter-quiz__header">
        <div className="chapter-quiz__header-main">
          <span className="chapter-quiz__title">{CHAPTER_QUIZ_COPY.quizTitle}</span>
          {questions.length > 0 && repr.phase === "quiz" ? (
            <span className="chapter-quiz__progress">
              第 {index + 1} / {questions.length} 题
            </span>
          ) : null}
        </div>
        {repr.phase === "quiz" || repr.phase === "generating" ? (
          <Button
            variant="outline"
            className="chapter-quiz__side-btn"
            title={CHAPTER_QUIZ_COPY.openSidePanelTitle}
            onClick={handleOpenSidePanel}
          >
            {CHAPTER_QUIZ_COPY.openSidePanel}
          </Button>
        ) : null}
      </div>

      {repr.phase === "generating" ? (
        <div className="chapter-quiz__panel">
          <div className="chapter-quiz__status">{CHAPTER_QUIZ_COPY.generating}</div>
          <Button variant="outline" onClick={handleCancelGenerate}>
            {CHAPTER_QUIZ_COPY.cancelGenerate}
          </Button>
        </div>
      ) : null}

      {repr.phase === "error" ? (
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
              onClick={() => {
                if (busy) return
                genStartedRef.current = true
                void runGeneration()
              }}
            >
              {CHAPTER_QUIZ_COPY.retry}
            </Button>
          </div>
        </div>
      ) : null}

      {repr.phase === "quiz" && question ? (
        <div className="chapter-quiz__panel">
          <div className="chapter-quiz__stem">{question.text}</div>
          <div className="chapter-quiz__options" role="radiogroup">
            {question.options.map((opt, oi) => {
              const isSelected = selected === oi
              const isCorrect = oi === question.correctIndex
              let stateClass = ""
              if (revealed) {
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
                  disabled={revealed || busy}
                  onClick={() => void handleSelect(oi)}
                >
                  <span className="chapter-quiz__option-letter">
                    {optionLetter(oi)}
                  </span>
                  <span className="chapter-quiz__option-text">{opt}</span>
                </button>
              )
            })}
          </div>

          {/*
            主操作条：紧贴选项 D 下方，不随追问区变高被推走。
            揭晓后：左侧制卡，右侧下一题。
          */}
          <div className="chapter-quiz__primary-bar">
            <div className="chapter-quiz__primary-left">
              {revealed ? (
                <>
                  <Button
                    variant={cardAdds?.basicBlockId ? "outline" : "solid"}
                    className={
                      cardAdds?.basicBlockId || cardBusyId === question.id
                        ? "ir-button--blocked chapter-quiz__chip-btn"
                        : "chapter-quiz__chip-btn"
                    }
                    title={CHAPTER_QUIZ_COPY.rememberPrompt}
                    onClick={() => {
                      if (cardAdds?.basicBlockId || cardBusyId === question.id) return
                      void handleAddBasic()
                    }}
                  >
                    {cardAdds?.basicBlockId
                      ? CHAPTER_QUIZ_COPY.alreadyAdded
                      : CHAPTER_QUIZ_COPY.addBasic}
                  </Button>
                  <Button
                    variant="outline"
                    className={
                      cardAdds?.clozeBlockId ||
                      clozeBusy ||
                      cardBusyId === question.id
                        ? "ir-button--blocked chapter-quiz__chip-btn"
                        : "chapter-quiz__chip-btn"
                    }
                    title={CHAPTER_QUIZ_COPY.rememberPrompt}
                    onClick={() => {
                      if (
                        cardAdds?.clozeBlockId ||
                        clozeBusy ||
                        cardBusyId === question.id
                      ) {
                        return
                      }
                      void handleStartCloze()
                    }}
                  >
                    {cardAdds?.clozeBlockId
                      ? CHAPTER_QUIZ_COPY.alreadyAdded
                      : clozeBusy
                        ? CHAPTER_QUIZ_COPY.clozeGenerating
                        : CHAPTER_QUIZ_COPY.addCloze}
                  </Button>
                </>
              ) : (
                <span className="chapter-quiz__primary-hint">
                  选一项后显示讲解与制卡
                </span>
              )}
            </div>
            <Button
              variant="solid"
              className={
                !revealed
                  ? "ir-button--blocked chapter-quiz__next-btn"
                  : "chapter-quiz__next-btn"
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
          </div>

          {revealed ? (
            <div className="chapter-quiz__reveal">
              <div className="chapter-quiz__verdict-row">
                <div
                  className={
                    typeof selected === "number" &&
                    isAnswerCorrect(question, selected)
                      ? "chapter-quiz__verdict chapter-quiz__verdict--ok"
                      : "chapter-quiz__verdict chapter-quiz__verdict--bad"
                  }
                >
                  {typeof selected === "number" &&
                  isAnswerCorrect(question, selected)
                    ? CHAPTER_QUIZ_COPY.correct
                    : CHAPTER_QUIZ_COPY.incorrect}
                  <span className="chapter-quiz__answer-inline">
                    {" · "}
                    {CHAPTER_QUIZ_COPY.correctAnswerLabel}：
                    {optionLetter(question.correctIndex)}.{" "}
                    {question.options[question.correctIndex]}
                  </span>
                </div>
                {typeof question.sourceBlockId === "number" ? (
                  <Button
                    variant="outline"
                    className="chapter-quiz__jump-btn"
                    title={CHAPTER_QUIZ_COPY.jumpToSourceTitle}
                    onClick={handleJumpToSource}
                  >
                    {CHAPTER_QUIZ_COPY.jumpToSource}
                  </Button>
                ) : null}
              </div>
              <div className="chapter-quiz__explain">{question.explanation}</div>

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
                        void handleConfirmCloze()
                      }}
                    >
                      {CHAPTER_QUIZ_COPY.clozeConfirm}
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* 固定高度追问区：历史在内部滚动，不顶走上方主操作条 */}
              <div className="chapter-quiz__followup">
                <div className="chapter-quiz__remember-label">
                  {CHAPTER_QUIZ_COPY.followUpLabel}
                </div>
                <div className="chapter-quiz__followup-scroll">
                  {followUps.length === 0 && !followUpBusy ? (
                    <div className="chapter-quiz__hint">
                      对这道题有疑问可在此追问，记录会留在此区域滚动查看。
                    </div>
                  ) : null}
                  {followUps.map((turn: FollowUpTurn, i: number) => (
                    <div
                      key={i}
                      className={
                        turn.role === "user"
                          ? "chapter-quiz__fu chapter-quiz__fu--user"
                          : "chapter-quiz__fu chapter-quiz__fu--assistant"
                      }
                    >
                      {turn.content}
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
                        void handleFollowUp()
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
                      void handleFollowUp()
                    }}
                  >
                    {CHAPTER_QUIZ_COPY.followUpSend}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {localError ? (
            <div className="chapter-quiz__status chapter-quiz__status--error">
              {localError}
            </div>
          ) : null}
        </div>
      ) : null}

      {repr.phase === "done" ? (
        <div className="chapter-quiz__panel">
          <div className="chapter-quiz__status">
            {CHAPTER_QUIZ_COPY.doneSummary(correctCount, questions.length)}
          </div>
          <div className="chapter-quiz__hint">{CHAPTER_QUIZ_COPY.doneHint}</div>
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
