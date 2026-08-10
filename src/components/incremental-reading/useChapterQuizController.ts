/**
 * Shared chapter-quiz state controller: load / persist / generate / answer / cards / follow-up.
 * Used by compact block entry (generation) and Custom Panel (focused answering).
 *
 * - Generation: shared AbortController via chapterQuizLive (any instance can cancel)
 * - Live sync: publish/subscribe same quizBlockId after persist (no extra backend)
 * - Card/follow-up: explicit target question APIs (wrong-review safe)
 */

import {
  buildRepairRoundState,
  CHAPTER_QUIZ_COPY,
  CHAPTER_QUIZ_DEFAULT_COUNT,
  classifyFirstRoundAnswer,
  collectTopicPlainText,
  deleteChapterQuizBlock,
  enqueueChapterQuizPersist,
  ensureRepairOptionOrder,
  freezeWeakItemsIfNeeded,
  generateChapterQuizFollowUp,
  generateChapterQuizWithRetries,
  isAnswerCorrect,
  listUnresolvedWeakItemIds,
  loadChapterQuizState,
  mapRepairDisplayIndexToOriginal,
  normalizeChapterQuizRepr,
  requireQuizCardSourceBlockId,
  rewriteQuestionAsCloze,
  rollbackCreatedQuizCardBlock,
  saveChapterQuizRepr,
  shuffleQuizQuestions,
  writeBasicCardFromQuizQuestion,
  writeClozeCardFromQuizQuestion,
  type ChapterQuizQuestion,
  type ChapterQuizRepr
} from "../../srs/incremental-reading/chapterQuiz"
import {
  cancelSharedGeneration,
  defaultGenerationRegistry,
  defaultLiveSyncRegistry,
  getSharedGeneration,
  mergeQuestionCardAdds,
  publishQuizLive,
  startSharedGeneration,
  subscribeQuizLive
} from "../../srs/incremental-reading/chapterQuizLive"
import { runWithChapterQuizEditorContext } from "../../srs/incremental-reading/chapterQuizEditorContext"
import { isAIConfigured } from "../../srs/ai/aiSettingsSchema"

export type FollowUpTurn = { role: "user" | "assistant"; content: string }

export type ClozePreview = {
  text: string
  clozeText: string
  questionId: string
}

export type QuestionBoundRequest = {
  questionId: string
  seq: number
  controller: AbortController
}

export type QuestionBoundRequestTracker = {
  start: (questionId: string) => QuestionBoundRequest
  commit: (
    request: QuestionBoundRequest,
    activeQuestionId: string | null,
    apply: () => void
  ) => boolean
  finish: (
    request: QuestionBoundRequest,
    activeQuestionId: string | null,
    apply: () => void
  ) => boolean
  cancel: () => void
}

export function createQuestionBoundRequestTracker(): QuestionBoundRequestTracker {
  let seq = 0
  let current: QuestionBoundRequest | null = null

  const isCurrent = (
    request: QuestionBoundRequest,
    activeQuestionId: string | null
  ) =>
    current === request &&
    request.seq === seq &&
    !request.controller.signal.aborted &&
    activeQuestionId === request.questionId

  return {
    start(questionId) {
      current?.controller.abort()
      const request = {
        questionId,
        seq: ++seq,
        controller: new AbortController()
      }
      current = request
      return request
    },
    commit(request, activeQuestionId, apply) {
      if (!isCurrent(request, activeQuestionId)) return false
      apply()
      return true
    },
    finish(request, activeQuestionId, apply) {
      if (!isCurrent(request, activeQuestionId)) return false
      current = null
      apply()
      return true
    },
    cancel() {
      seq += 1
      current?.controller.abort()
      current = null
    }
  }
}

function resolveActiveQuestionId(repr: ChapterQuizRepr): string | null {
  const questions = repr.questions ?? []
  if (repr.repairActive) {
    const repairQueue = repr.repairQueue ?? []
    const repairIndex = Math.min(
      Math.max(0, repr.repairIndex ?? 0),
      Math.max(0, repairQueue.length - 1)
    )
    const repairQuestionId = repairQueue[repairIndex]
    return questions.some((item) => item.id === repairQuestionId)
      ? repairQuestionId
      : null
  }
  const index = Math.min(
    Math.max(0, repr.currentIndex ?? 0),
    Math.max(0, questions.length - 1)
  )
  return questions[index]?.id ?? null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

export type UseChapterQuizControllerOptions = {
  blockId: number
  /** Seed for first paint before property hydration */
  initialSeed?: Partial<ChapterQuizRepr>
  /**
   * When true, auto-start generation after hydrate if phase is generating
   * and no questions yet (block entry path).
   */
  autoGenerate?: boolean
  /**
   * Custom Panel 的 panelId：制卡时短暂切到同布局左侧可写 ViewPanel，
   * 使 insertBlock / setProperties 获得编辑器上下文。块侧入口勿传。
   */
  writeContextPanelId?: string
}

export function useChapterQuizController(options: UseChapterQuizControllerOptions) {
  const { blockId, autoGenerate = false, writeContextPanelId } = options
  const {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
  } = window.React

  const instanceIdRef = useRef(Symbol(`chapter-quiz-${blockId}`))
  // new symbol when blockId changes so unsub/resub is clean
  const instanceId = useMemo(() => {
    instanceIdRef.current = Symbol(`chapter-quiz-${blockId}`)
    return instanceIdRef.current
  }, [blockId])

  const initial = useMemo(
    () =>
      normalizeChapterQuizRepr(options.initialSeed ?? null, {
        pluginName: options.initialSeed?.pluginName || "orca-srs",
        topicBlockId: options.initialSeed?.topicBlockId
      }),
    // hydrate once per blockId
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

  const genStartedRef = useRef(false)
  const reprRef = useRef(repr)
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const followUpRequestRef = useRef(createQuestionBoundRequestTracker())
  const clozeRequestRef = useRef(createQuestionBoundRequestTracker())
  const activeQuestionId = resolveActiveQuestionId(repr)
  const activeQuestionIdRef = useRef<string | null>(activeQuestionId)
  const previousActiveQuestionIdRef = useRef<string | null>(activeQuestionId)
  reprRef.current = repr
  activeQuestionIdRef.current = activeQuestionId
  /** 在途的「重试进度」写入（null = 无在途）：终态落盘前先排空，避免被迟到写入回滚 */
  const retryPersistRef = useRef<Promise<boolean> | null>(null)

  const applyLocalRepr = useCallback((next: ChapterQuizRepr) => {
    setRepr(next)
    reprRef.current = next
  }, [])

  const clearEphemeralForQuestion = useCallback(() => {
    followUpRequestRef.current.cancel()
    clozeRequestRef.current.cancel()
    setFollowUps([])
    setFollowUpDraft("")
    setFollowUpError(null)
    setFollowUpBusy(false)
    setClozePreview(null)
    setClozeBusy(false)
    setLocalError(null)
  }, [])

  const clearForQuestionTransition = useCallback(
    (next: ChapterQuizRepr) => {
      const nextQuestionId = resolveActiveQuestionId(next)
      if (activeQuestionIdRef.current === nextQuestionId) return
      activeQuestionIdRef.current = nextQuestionId
      previousActiveQuestionIdRef.current = nextQuestionId
      clearEphemeralForQuestion()
    },
    [clearEphemeralForQuestion]
  )

  useEffect(() => {
    if (previousActiveQuestionIdRef.current === activeQuestionId) return
    previousActiveQuestionIdRef.current = activeQuestionId
    clearEphemeralForQuestion()
  }, [activeQuestionId, clearEphemeralForQuestion])

  useEffect(
    () => () => {
      followUpRequestRef.current.cancel()
      clozeRequestRef.current.cancel()
    },
    []
  )

  // Live UI sync: other controllers' persist → this instance
  useEffect(() => {
    const unsub = subscribeQuizLive(
      defaultLiveSyncRegistry,
      blockId,
      instanceId,
      (next) => {
        clearForQuestionTransition(next)
        applyLocalRepr(next)
        setBusy(
          next.phase === "generating" &&
            !!getSharedGeneration(defaultGenerationRegistry, blockId)
        )
      }
    )
    return unsub
  }, [applyLocalRepr, blockId, clearForQuestionTransition, instanceId])

  useEffect(() => {
    let cancelled = false
    setHydrated(false)
    genStartedRef.current = false
    setLocalError(null)
    clearEphemeralForQuestion()
    void (async () => {
      try {
        const loaded = await loadChapterQuizState(blockId, initial)
        if (cancelled) return
        clearForQuestionTransition(loaded)
        applyLocalRepr(loaded)
      } catch (error) {
        console.error("[章末小测] 加载状态失败，使用初值:", error)
        setLocalError(
          error instanceof Error ? error.message : String(error)
        )
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
      // 卸载不取消共享生成：另一实例可能仍在显示/等待
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    blockId,
    initial,
    applyLocalRepr,
    clearEphemeralForQuestion,
    clearForQuestionTransition
  ])

  const persist = useCallback(
    async (next: ChapterQuizRepr): Promise<boolean> => {
      const previous = reprRef.current
      clearForQuestionTransition(next)
      applyLocalRepr(next)
      // broadcast before/after write so peer UIs stay live; no extra backend write
      publishQuizLive(defaultLiveSyncRegistry, blockId, next, instanceId)
      const queuedSave = persistQueueRef.current.then(() =>
        saveChapterQuizRepr(blockId, next)
      )
      // A failed save must not poison later writes in the same controller.
      persistQueueRef.current = queuedSave.catch(() => undefined)
      try {
        await queuedSave
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[章末小测] 保存状态失败:", error)
        // 仅当仍停留在本次乐观值时回滚，避免覆盖更新的 live 状态
        if (reprRef.current === next) {
          clearForQuestionTransition(previous)
          applyLocalRepr(previous)
          publishQuizLive(
            defaultLiveSyncRegistry,
            blockId,
            previous,
            instanceId
          )
        }
        orca.notify("error", `小测状态保存失败：${message}`, {
          title: "章末小测"
        })
        setLocalError(`状态保存失败：${message}`)
        return false
      }
    },
    [applyLocalRepr, blockId, clearForQuestionTransition, instanceId]
  )

  /**
   * 排空在途的「重试进度」写入并复位 ref。
   * persist 契约返回 Promise<boolean> 且内部已保证错误可见（notify + localError），
   * 此处仅做防御性捕获，绝不阻断终态写入。
   */
  const flushRetryProgress = useCallback(async () => {
    const pending = retryPersistRef.current
    retryPersistRef.current = null
    if (!pending) return
    try {
      await pending
    } catch (error) {
      console.error("[章末小测] 重试进度写入异常:", error)
    }
  }, [])

  const runGeneration = useCallback(async () => {
    const existing = getSharedGeneration(defaultGenerationRegistry, blockId)
    if (existing && !existing.cancelled) {
      setBusy(true)
      try {
        await existing.promise
        // final state should already be live-synced by owner; reload if not
        if (reprRef.current.phase === "generating") {
          try {
            const loaded = await loadChapterQuizState(blockId, reprRef.current)
            clearForQuestionTransition(loaded)
            applyLocalRepr(loaded)
          } catch (error) {
            console.error("[章末小测] 等待共享生成后刷新失败:", error)
          }
        }
      } finally {
        setBusy(false)
      }
      return
    }

    const current = reprRef.current
    // 新 generation 起点：排空上一轮在途的重试进度写入并复位，
    // 避免残留写入把新状态（含 needAi 终态）回滚
    await flushRetryProgress()
    if (!isAIConfigured(current.pluginName)) {
      await persist({
        ...current,
        phase: "error",
        errorMessage: CHAPTER_QUIZ_COPY.needAi,
        genStage: undefined,
        genAttempt: undefined
      })
      return
    }

    setBusy(true)
    setLocalError(null)

    const entry = startSharedGeneration(
      defaultGenerationRegistry,
      blockId,
      async ({ signal, isCurrent }) => {
        try {
          if (!isCurrent()) return
          // 新 generation 起点（双保险）：ref 已由 runGeneration 复位，此处再确认
          await flushRetryProgress()
          // 阶段 1：读取本章
          await persist({
            ...current,
            phase: "generating",
            errorMessage: undefined,
            questions: undefined,
            genStage: "collecting",
            genAttempt: 1
          })

          const collected = await collectTopicPlainText(current.topicBlockId)
          if (!isCurrent() || signal.aborted) return
          if (!collected.text) {
            if (!isCurrent()) return
            await flushRetryProgress()
            await persist({
              ...reprRef.current,
              phase: "error",
              errorMessage: CHAPTER_QUIZ_COPY.emptySource,
              genStage: undefined,
              genAttempt: undefined
            })
            return
          }

          // 阶段 2：AI 出题（自动重试时更新尝试序号，block/panel 同步可见）
          if (!isCurrent() || signal.aborted) return
          await persist({ ...reprRef.current, genStage: "generating" })

          const result = await generateChapterQuizWithRetries({
            pluginName: current.pluginName,
            sourceText: collected.text,
            questionCount: current.questionCount || CHAPTER_QUIZ_DEFAULT_COUNT,
            truncated: collected.truncated,
            allowedBlockIds: collected.blockIds,
            signal,
            onRetryAttempt: (nextAttempt) => {
              if (!isCurrent() || signal.aborted) return
              // 串行追加进度写入：连续重试时不能只记住最后一个 Promise，
              // 否则更早的慢写入仍可能在终态之后落盘。
              retryPersistRef.current = enqueueChapterQuizPersist(
                retryPersistRef.current,
                () =>
                  persist({
                    ...reprRef.current,
                    genAttempt: nextAttempt
                  })
              )
            }
          })

          // 取消后禁止迟到结果覆盖
          if (!isCurrent() || signal.aborted) return

          if (!result.success) {
            await flushRetryProgress()
            await persist({
              ...reprRef.current,
              phase: "error",
              errorMessage: result.error.message,
              genStage: undefined,
              genAttempt: undefined
            })
            return
          }

          // 阶段 3：整理 —— 打乱题目与选项顺序（仅此一次，随 repr 持久化，
          // 整轮稳定；渲染路径不重打乱），随后进入答题态
          if (!isCurrent() || signal.aborted) return
          await flushRetryProgress()
          await persist({ ...reprRef.current, genStage: "polishing" })
          const shuffled = shuffleQuizQuestions(result.questions)

          // 成功终态前排空重试进度写入，保证落盘顺序
          await flushRetryProgress()
          await persist({
            ...reprRef.current,
            phase: "quiz",
            questions: shuffled,
            currentIndex: 0,
            answers: {},
            revealed: {},
            unknowns: {},
            guessed: {},
            cardAdds: {},
            genStage: undefined,
            genAttempt: undefined,
            uncertainMarks: {},
            skipped: {},
            firstCategories: {},
            weakItemIds: [],
            repaired: {},
            repairActive: false,
            repairQueue: [],
            repairIndex: 0,
            repairAnswers: {},
            repairRevealed: {},
            repairOptionOrders: {},
            errorMessage: undefined
          })
          clearEphemeralForQuestion()
        } catch (error) {
          if (!isCurrent() || signal.aborted) return
          const message = error instanceof Error ? error.message : String(error)
          console.error("[章末小测] 生成失败:", error)
          await flushRetryProgress()
          await persist({
            ...reprRef.current,
            phase: "error",
            errorMessage: message,
            genStage: undefined,
            genAttempt: undefined
          })
        }
      }
    )

    try {
      await entry.promise
    } finally {
      setBusy(false)
    }
  }, [
    applyLocalRepr,
    blockId,
    clearEphemeralForQuestion,
    clearForQuestionTransition,
    flushRetryProgress,
    persist
  ])

  useEffect(() => {
    if (!autoGenerate) return
    if (!hydrated) return
    if (genStartedRef.current) return
    if (repr.phase !== "generating") return
    if (repr.questions && repr.questions.length > 0) return
    genStartedRef.current = true
    void runGeneration()
    // 卸载不 abort 共享生成
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, hydrated, repr.phase, autoGenerate])

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

  const handleToggleUncertain = useCallback(async () => {
    const current = reprRef.current
    const currentQuestions = current.questions ?? []
    const currentIndex = Math.min(
      Math.max(0, current.currentIndex ?? 0),
      Math.max(0, currentQuestions.length - 1)
    )
    const q = currentQuestions[currentIndex]
    if (!q || current.revealed?.[q.id] === true || busy) return
    if (current.phase !== "quiz" || current.repairActive) return
    const marks = { ...(current.uncertainMarks ?? {}) }
    if (marks[q.id]) delete marks[q.id]
    else marks[q.id] = true
    await persist({ ...current, uncertainMarks: marks })
  }, [busy, persist])

  const handleSelect = useCallback(
    async (optionIndex: number) => {
      const current = reprRef.current
      const currentQuestions = current.questions ?? []
      const currentIndex = Math.min(
        Math.max(0, current.currentIndex ?? 0),
        Math.max(0, currentQuestions.length - 1)
      )
      const q = currentQuestions[currentIndex]
      if (!q || current.revealed?.[q.id] === true || busy) return
      if (current.phase !== "quiz" || current.repairActive) return
      if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= q.options.length
      ) {
        return
      }
      const uncertain = current.uncertainMarks?.[q.id] === true
      const category = classifyFirstRoundAnswer({
        correct: isAnswerCorrect(q, optionIndex),
        uncertain,
        skipped: false
      })
      const answers = { ...(current.answers ?? {}), [q.id]: optionIndex }
      const revealedMap = { ...(current.revealed ?? {}), [q.id]: true }
      const skipped = { ...(current.skipped ?? {}) }
      delete skipped[q.id]
      const firstCategories = {
        ...(current.firstCategories ?? {}),
        [q.id]: category
      }
      clearEphemeralForQuestion()
      await persist({
        ...current,
        answers,
        revealed: revealedMap,
        skipped,
        firstCategories
      })
    },
    [busy, clearEphemeralForQuestion, persist]
  )

  const handleSkip = useCallback(async () => {
    const current = reprRef.current
    const currentQuestions = current.questions ?? []
    const currentIndex = Math.min(
      Math.max(0, current.currentIndex ?? 0),
      Math.max(0, currentQuestions.length - 1)
    )
    const q = currentQuestions[currentIndex]
    if (!q || current.revealed?.[q.id] === true || busy) return
    if (current.phase !== "quiz" || current.repairActive) return
    const revealedMap = { ...(current.revealed ?? {}), [q.id]: true }
    const skipped = { ...(current.skipped ?? {}), [q.id]: true }
    const answers = { ...(current.answers ?? {}) }
    delete answers[q.id]
    const firstCategories = {
      ...(current.firstCategories ?? {}),
      [q.id]: "skipped" as const
    }
    clearEphemeralForQuestion()
    // 跳过：记入弱项并直接前进（首轮不揭晓）
    if (currentIndex >= currentQuestions.length - 1) {
      const done = freezeWeakItemsIfNeeded({
        ...current,
        answers,
        revealed: revealedMap,
        skipped,
        firstCategories,
        phase: "done",
        currentIndex,
        repairActive: false
      })
      await persist(done)
      return
    }
    await persist({
      ...current,
      answers,
      revealed: revealedMap,
      skipped,
      firstCategories,
      currentIndex: currentIndex + 1
    })
  }, [busy, clearEphemeralForQuestion, persist])

  const handleNext = useCallback(async () => {
    const current = reprRef.current
    const currentQuestions = current.questions ?? []
    const currentIndex = Math.min(
      Math.max(0, current.currentIndex ?? 0),
      Math.max(0, currentQuestions.length - 1)
    )
    const currentQuestion = currentQuestions[currentIndex]
    if (!currentQuestion || current.revealed?.[currentQuestion.id] !== true) return
    if (current.repairActive) return
    if (currentIndex >= currentQuestions.length - 1) {
      const done = freezeWeakItemsIfNeeded({
        ...current,
        phase: "done",
        currentIndex,
        repairActive: false
      })
      await persist(done)
      return
    }
    const ok = await persist({ ...current, currentIndex: currentIndex + 1 })
    if (!ok) return
    clearEphemeralForQuestion()
  }, [clearEphemeralForQuestion, persist])

  /** 开始 / 继续修复：未解决弱项各答一次 */
  const handleStartRepair = useCallback(
    async (roundSeed?: string) => {
      if (busy) return
      const current = reprRef.current
      const unresolved = listUnresolvedWeakItemIds(
        current.weakItemIds?.length
          ? current.weakItemIds
          : freezeWeakItemsIfNeeded(current).weakItemIds,
        current.repaired
      )
      if (unresolved.length === 0) {
        orca.notify("info", "没有待修复的薄弱点", { title: "章末小测" })
        return
      }
      clearEphemeralForQuestion()
      await persist(buildRepairRoundState(current, roundSeed))
    },
    [busy, clearEphemeralForQuestion, persist]
  )

  const handleRepairSelect = useCallback(
    async (displayIndex: number) => {
      const current = reprRef.current
      if (!current.repairActive || busy) return
      const queue = current.repairQueue ?? []
      const ri = Math.min(
        Math.max(0, current.repairIndex ?? 0),
        Math.max(0, queue.length - 1)
      )
      const qid = queue[ri]
      if (!qid) return
      if (current.repairRevealed?.[qid] === true) return
      const q = (current.questions ?? []).find(
        (x: ChapterQuizQuestion) => x.id === qid
      )
      if (!q) return
      const order = ensureRepairOptionOrder(
        current.repairOptionOrders?.[qid],
        q.options.length,
        `repair:${qid}`
      )
      const originalIndex = mapRepairDisplayIndexToOriginal(displayIndex, order)
      if (originalIndex < 0 || originalIndex >= q.options.length) return

      const repairAnswers = {
        ...(current.repairAnswers ?? {}),
        [qid]: originalIndex
      }
      const repairRevealed = {
        ...(current.repairRevealed ?? {}),
        [qid]: true
      }
      const repaired = { ...(current.repaired ?? {}) }
      if (isAnswerCorrect(q, originalIndex)) {
        repaired[qid] = true
      }
      const repairOptionOrders = {
        ...(current.repairOptionOrders ?? {}),
        [qid]: order
      }
      clearEphemeralForQuestion()
      await persist({
        ...current,
        repairAnswers,
        repairRevealed,
        repaired,
        repairOptionOrders
      })
    },
    [busy, clearEphemeralForQuestion, persist]
  )

  const handleRepairNext = useCallback(async () => {
    const current = reprRef.current
    if (!current.repairActive) return
    const queue = current.repairQueue ?? []
    const ri = current.repairIndex ?? 0
    const qid = queue[ri]
    if (qid && current.repairRevealed?.[qid] !== true) return

    if (ri >= queue.length - 1) {
      // 本轮结束 → 回到结果小结，保留 repaired / firstCategories
      clearEphemeralForQuestion()
      await persist({
        ...current,
        phase: "done",
        repairActive: false,
        repairQueue: [],
        repairIndex: 0,
        repairAnswers: {},
        repairRevealed: {},
        repairOptionOrders: {}
      })
      return
    }
    const ok = await persist({
      ...current,
      repairIndex: ri + 1
    })
    if (!ok) return
    clearEphemeralForQuestion()
  }, [clearEphemeralForQuestion, persist])

  /**
   * 批量制卡：顺序执行，每成功一项立即 merge cardAdds（用 reprRef 避免覆盖）。
   * 失败项不记入 cardAdds，可重试。
   */
  const handleBatchCreateCards = useCallback(
    async (
      items: Array<{
        question: ChapterQuizQuestion
        kind: "basic" | "cloze"
        clozePreview?: { text: string; clozeText: string }
      }>,
      onItemResult?: (
        questionId: string,
        result: { ok: true; blockId: number } | { ok: false; error: string }
      ) => void
    ): Promise<{ succeeded: number; failed: number }> => {
      let succeeded = 0
      let failed = 0
      for (const item of items) {
        const target = item.question
        const existing = reprRef.current.cardAdds?.[target.id]
        if (item.kind === "basic" && existing?.basicBlockId) {
          onItemResult?.(target.id, {
            ok: true,
            blockId: existing.basicBlockId
          })
          succeeded += 1
          continue
        }
        if (item.kind === "cloze" && existing?.clozeBlockId) {
          onItemResult?.(target.id, {
            ok: true,
            blockId: existing.clozeBlockId
          })
          succeeded += 1
          continue
        }
        setCardBusyId(target.id)
        try {
          const parentBlockId = requireQuizCardSourceBlockId(target)
          const saved = await runWithChapterQuizEditorContext(
            writeContextPanelId,
            async () => {
              const latest = reprRef.current
              if (item.kind === "basic") {
                const id = await writeBasicCardFromQuizQuestion({
                  pluginName: latest.pluginName,
                  parentBlockId,
                  question: target
                })
                const nextAdds = mergeQuestionCardAdds(
                  latest.cardAdds,
                  target.id,
                  { basicBlockId: id }
                )
                const ok = await persist({ ...latest, cardAdds: nextAdds })
                if (!ok) {
                  try {
                    await rollbackCreatedQuizCardBlock(id)
                  } catch (rollbackError) {
                    const rb =
                      rollbackError instanceof Error
                        ? rollbackError.message
                        : String(rollbackError)
                    console.error("[章末小测] 批量简答卡回滚失败:", rb)
                    return {
                      ok: false as const,
                      blockId: id,
                      error: `状态未保存且回滚失败：${rb}`
                    }
                  }
                  return {
                    ok: false as const,
                    blockId: id,
                    error: "卡片已创建但测验状态未保存；已回滚新块"
                  }
                }
                return { ok: true as const, blockId: id }
              }
              if (!item.clozePreview) {
                throw new Error(CHAPTER_QUIZ_COPY.organizerClozeNeedPreview)
              }
              const id = await writeClozeCardFromQuizQuestion({
                pluginName: latest.pluginName,
                parentBlockId,
                text: item.clozePreview.text,
                clozeText: item.clozePreview.clozeText
              })
              const nextAdds = mergeQuestionCardAdds(
                latest.cardAdds,
                target.id,
                { clozeBlockId: id }
              )
              const ok = await persist({ ...latest, cardAdds: nextAdds })
              if (!ok) {
                try {
                  await rollbackCreatedQuizCardBlock(id)
                } catch (rollbackError) {
                  const rb =
                    rollbackError instanceof Error
                      ? rollbackError.message
                      : String(rollbackError)
                  console.error("[章末小测] 批量填空卡回滚失败:", rb)
                  return {
                    ok: false as const,
                    blockId: id,
                    error: `状态未保存且回滚失败：${rb}`
                  }
                }
                return {
                  ok: false as const,
                  blockId: id,
                  error: "卡片已创建但测验状态未保存；已回滚新块"
                }
              }
              return { ok: true as const, blockId: id }
            },
            {
              openPanel: {
                view: "block",
                viewArgs: { blockId: parentBlockId }
              }
            }
          )
          if (!saved.ok) {
            failed += 1
            onItemResult?.(target.id, {
              ok: false,
              error: saved.error || "制卡状态未保存"
            })
            continue
          }
          succeeded += 1
          onItemResult?.(target.id, { ok: true, blockId: saved.blockId })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          console.error("[章末小测] 批量制卡失败:", target.id, error)
          failed += 1
          onItemResult?.(target.id, { ok: false, error: message })
        } finally {
          setCardBusyId(null)
        }
      }
      return { succeeded, failed }
    },
    [persist, writeContextPanelId]
  )

  // Fix single-card handlers to use reprRef for cardAdds merge (avoid stale overwrites)
  const handleAddBasicFor = useCallback(
    async (target: ChapterQuizQuestion) => {
      const existing = reprRef.current.cardAdds?.[target.id]
      if (existing?.basicBlockId) return
      setCardBusyId(target.id)
      setLocalError(null)
      try {
        const parentBlockId = requireQuizCardSourceBlockId(target)
        const result = await runWithChapterQuizEditorContext(
          writeContextPanelId,
          async () => {
            const latest = reprRef.current
            const id = await writeBasicCardFromQuizQuestion({
              pluginName: latest.pluginName,
              parentBlockId,
              question: target
            })
            const nextAdds = mergeQuestionCardAdds(latest.cardAdds, target.id, {
              basicBlockId: id
            })
            const ok = await persist({ ...latest, cardAdds: nextAdds })
            if (!ok) {
              try {
                await rollbackCreatedQuizCardBlock(id)
              } catch (rollbackError) {
                const rb =
                  rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError)
                console.error("[章末小测] 简答卡回滚失败:", rb)
                return { ok: false as const, error: rb }
              }
              return {
                ok: false as const,
                error: "简答卡已创建但状态未保存；已回滚新块，可重试"
              }
            }
            return { ok: true as const }
          },
          {
            openPanel: {
              view: "block",
              viewArgs: { blockId: parentBlockId }
            }
          }
        )
        if (!result.ok) {
          setLocalError(result.error)
          orca.notify("error", result.error, { title: "章末小测" })
          return
        }
        orca.notify("success", CHAPTER_QUIZ_COPY.basicAdded, {
          title: "章末小测"
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[章末小测] 简答卡失败:", error)
        setLocalError(message)
        orca.notify("error", `加入简答卡失败：${message}`, { title: "章末小测" })
      } finally {
        setCardBusyId(null)
      }
    },
    [persist, writeContextPanelId]
  )

  const handleStartClozeFor = useCallback(
    async (target: ChapterQuizQuestion) => {
      const existing = reprRef.current.cardAdds?.[target.id]
      if (existing?.clozeBlockId) return
      const tracker = clozeRequestRef.current
      const request = tracker.start(target.id)
      if (
        !tracker.commit(request, activeQuestionIdRef.current, () => {
          setClozeBusy(true)
          setLocalError(null)
          setClozePreview(null)
        })
      ) {
        tracker.cancel()
        return
      }
      try {
        const result = await rewriteQuestionAsCloze({
          pluginName: reprRef.current.pluginName,
          question: target,
          signal: request.controller.signal
        })
        if (request.controller.signal.aborted) return
        if (!result.success) {
          if (result.error.code === "CANCELLED") return
          tracker.commit(request, activeQuestionIdRef.current, () => {
            setLocalError(result.error.message)
            orca.notify("error", result.error.message, { title: "章末小测" })
          })
          return
        }
        tracker.commit(request, activeQuestionIdRef.current, () => {
          setClozePreview({
            text: result.text,
            clozeText: result.clozeText,
            questionId: target.id
          })
        })
      } catch (error) {
        if (request.controller.signal.aborted || isAbortError(error)) return
        const message = error instanceof Error ? error.message : String(error)
        tracker.commit(request, activeQuestionIdRef.current, () => {
          console.error("[章末小测] 填空改写失败:", error)
          setLocalError(message)
          orca.notify("error", message, { title: "章末小测" })
        })
      } finally {
        tracker.finish(request, activeQuestionIdRef.current, () => {
          setClozeBusy(false)
        })
      }
    },
    []
  )

  const handleConfirmClozeFor = useCallback(
    async (target: ChapterQuizQuestion) => {
      if (!clozePreview || clozePreview.questionId !== target.id) return
      setCardBusyId(target.id)
      setLocalError(null)
      try {
        const preview = clozePreview
        const parentBlockId = requireQuizCardSourceBlockId(target)
        const result = await runWithChapterQuizEditorContext(
          writeContextPanelId,
          async () => {
            const latest = reprRef.current
            const id = await writeClozeCardFromQuizQuestion({
              pluginName: latest.pluginName,
              parentBlockId,
              text: preview.text,
              clozeText: preview.clozeText
            })
            const nextAdds = mergeQuestionCardAdds(latest.cardAdds, target.id, {
              clozeBlockId: id
            })
            const ok = await persist({ ...latest, cardAdds: nextAdds })
            if (!ok) {
              try {
                await rollbackCreatedQuizCardBlock(id)
              } catch (rollbackError) {
                const rb =
                  rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError)
                console.error("[章末小测] 填空卡回滚失败:", rb)
                return { ok: false as const, error: rb }
              }
              return {
                ok: false as const,
                error: "填空卡已创建但状态未保存；已回滚新块，可重试"
              }
            }
            return { ok: true as const }
          },
          {
            openPanel: {
              view: "block",
              viewArgs: { blockId: parentBlockId }
            }
          }
        )
        setClozePreview(null)
        if (!result.ok) {
          setLocalError(result.error)
          orca.notify("error", result.error, { title: "章末小测" })
          return
        }
        orca.notify("success", CHAPTER_QUIZ_COPY.clozeAdded, {
          title: "章末小测"
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[章末小测] 填空卡写入失败:", error)
        setLocalError(message)
        orca.notify("error", `加入填空卡失败：${message}`, {
          title: "章末小测"
        })
      } finally {
        setCardBusyId(null)
      }
    },
    [clozePreview, persist, writeContextPanelId]
  )

  /** Explicit-target follow-up: context is the given question + its selectedIndex. */
  const handleFollowUpFor = useCallback(
    async (target: ChapterQuizQuestion, selectedIndex?: number) => {
      if (!followUpDraft.trim() || followUpBusy) return
      const tracker = followUpRequestRef.current
      const request = tracker.start(target.id)
      const userText = followUpDraft.trim()
      const sel =
        typeof selectedIndex === "number"
          ? selectedIndex
          : typeof repr.answers?.[target.id] === "number"
            ? repr.answers![target.id]
            : undefined
      const history = [...followUps]
      const userTurn = { role: "user" as const, content: userText }
      if (
        !tracker.commit(request, activeQuestionIdRef.current, () => {
          setFollowUpBusy(true)
          setFollowUpError(null)
          setFollowUpDraft("")
          setFollowUps([...history, userTurn])
        })
      ) {
        tracker.cancel()
        return
      }
      try {
        const result = await generateChapterQuizFollowUp({
          pluginName: repr.pluginName,
          question: target,
          selectedIndex: sel,
          userQuestion: userText,
          history,
          signal: request.controller.signal
        })
        if (request.controller.signal.aborted) return
        if (!result.success) {
          if (result.error.code === "CANCELLED") return
          tracker.commit(request, activeQuestionIdRef.current, () => {
            setFollowUpError(result.error.message)
          })
          return
        }
        tracker.commit(request, activeQuestionIdRef.current, () => {
          setFollowUps([
            ...history,
            userTurn,
            { role: "assistant", content: result.answer }
          ])
        })
      } catch (error) {
        if (request.controller.signal.aborted || isAbortError(error)) return
        const message = error instanceof Error ? error.message : String(error)
        tracker.commit(request, activeQuestionIdRef.current, () => {
          console.error("[章末小测] 追问失败:", error)
          setFollowUpError(message)
        })
      } finally {
        tracker.finish(request, activeQuestionIdRef.current, () => {
          setFollowUpBusy(false)
        })
      }
    },
    [followUpBusy, followUpDraft, followUps, repr.answers, repr.pluginName]
  )

  // Convenience wrappers for live currentIndex question
  const handleAddBasic = useCallback(async () => {
    if (!question) return
    await handleAddBasicFor(question)
  }, [handleAddBasicFor, question])

  const handleStartCloze = useCallback(async () => {
    if (!question) return
    await handleStartClozeFor(question)
  }, [handleStartClozeFor, question])

  const handleConfirmCloze = useCallback(async () => {
    if (!question) return
    await handleConfirmClozeFor(question)
  }, [handleConfirmClozeFor, question])

  const handleFollowUp = useCallback(async () => {
    if (!question) return
    await handleFollowUpFor(question, selected)
  }, [handleFollowUpFor, question, selected])

  const handleCancelGenerate = useCallback(() => {
    const didCancel = cancelSharedGeneration(
      defaultGenerationRegistry,
      blockId
    )
    setBusy(false)
    // 先排空在途的重试进度写入，再落盘取消终态（含清理陈旧进度字段），
    // 防止迟到进度写回滚 phase: "error"
    void (async () => {
      await flushRetryProgress()
      await persist({
        ...reprRef.current,
        phase: "error",
        errorMessage: CHAPTER_QUIZ_COPY.cancelled,
        genStage: undefined,
        genAttempt: undefined
      })
    })()
    if (didCancel) {
      orca.notify("info", CHAPTER_QUIZ_COPY.cancelled, { title: "章末小测" })
    } else {
      // 无在途生成时仍展示取消/错误态（用户可见）
      orca.notify("info", CHAPTER_QUIZ_COPY.cancelled, { title: "章末小测" })
    }
  }, [blockId, flushRetryProgress, persist])

  const handleRetryGenerate = useCallback(() => {
    if (busy) return
    genStartedRef.current = true
    void runGeneration()
  }, [busy, runGeneration])

  const handleDelete = useCallback(async () => {
    try {
      await deleteChapterQuizBlock(blockId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 删除失败:", error)
      orca.notify("error", `删除测验失败：${message}`, { title: "章末小测" })
    }
  }, [blockId])

  return {
    blockId,
    repr,
    hydrated,
    busy,
    questions,
    index,
    question,
    selected,
    revealed,
    cardAdds,
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
    setLocalError,
    persist,
    handleSelect,
    handleSkip,
    handleToggleUncertain,
    handleNext,
    handleStartRepair,
    handleRepairSelect,
    handleRepairNext,
    handleBatchCreateCards,
    handleAddBasic,
    handleStartCloze,
    handleConfirmCloze,
    handleFollowUp,
    handleAddBasicFor,
    handleStartClozeFor,
    handleConfirmClozeFor,
    handleFollowUpFor,
    handleCancelGenerate,
    handleRetryGenerate,
    handleDelete,
    clearEphemeralForQuestion
  }
}
