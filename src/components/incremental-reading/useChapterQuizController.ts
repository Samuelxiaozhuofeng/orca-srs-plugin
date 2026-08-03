/**
 * Shared chapter-quiz state controller: load / persist / generate / answer / cards / follow-up.
 * Used by compact block entry (generation) and Custom Panel (focused answering).
 *
 * - Generation: shared AbortController via chapterQuizLive (any instance can cancel)
 * - Live sync: publish/subscribe same quizBlockId after persist (no extra backend)
 * - Card/follow-up: explicit target question APIs (wrong-review safe)
 */

import {
  CHAPTER_QUIZ_COPY,
  CHAPTER_QUIZ_DEFAULT_COUNT,
  collectTopicPlainText,
  deleteChapterQuizBlock,
  enqueueChapterQuizPersist,
  generateChapterQuizFollowUp,
  generateChapterQuizWithRetries,
  loadChapterQuizState,
  normalizeChapterQuizRepr,
  requireQuizCardSourceBlockId,
  rewriteQuestionAsCloze,
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
  reprRef.current = repr
  /** 在途的「重试进度」写入（null = 无在途）：终态落盘前先排空，避免被迟到写入回滚 */
  const retryPersistRef = useRef<Promise<boolean> | null>(null)

  const applyLocalRepr = useCallback((next: ChapterQuizRepr) => {
    setRepr(next)
    reprRef.current = next
  }, [])

  // Live UI sync: other controllers' persist → this instance
  useEffect(() => {
    const unsub = subscribeQuizLive(
      defaultLiveSyncRegistry,
      blockId,
      instanceId,
      (next) => {
        applyLocalRepr(next)
        setBusy(
          next.phase === "generating" &&
            !!getSharedGeneration(defaultGenerationRegistry, blockId)
        )
      }
    )
    return unsub
  }, [applyLocalRepr, blockId, instanceId])

  useEffect(() => {
    let cancelled = false
    setHydrated(false)
    genStartedRef.current = false
    setLocalError(null)
    clearEphemeralLocal()
    void (async () => {
      try {
        const loaded = await loadChapterQuizState(blockId, initial)
        if (cancelled) return
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
  }, [blockId, initial, applyLocalRepr])

  function clearEphemeralLocal() {
    setFollowUps([])
    setFollowUpDraft("")
    setFollowUpError(null)
    setClozePreview(null)
  }

  const clearEphemeralForQuestion = useCallback(() => {
    clearEphemeralLocal()
  }, [])

  const persist = useCallback(
    async (next: ChapterQuizRepr): Promise<boolean> => {
      applyLocalRepr(next)
      // broadcast before/after write so peer UIs stay live; no extra backend write
      publishQuizLive(defaultLiveSyncRegistry, blockId, next, instanceId)
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
    },
    [applyLocalRepr, blockId, instanceId]
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
  }, [applyLocalRepr, blockId, clearEphemeralForQuestion, flushRetryProgress, persist])

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

  const handleSelect = useCallback(
    async (optionIndex: number) => {
      const q = question
      if (!q || revealed || busy) return
      if (repr.phase !== "quiz") return
      const answers = { ...(repr.answers ?? {}), [q.id]: optionIndex }
      const revealedMap = { ...(repr.revealed ?? {}), [q.id]: true }
      clearEphemeralForQuestion()
      await persist({
        ...repr,
        answers,
        revealed: revealedMap
      })
    },
    [busy, clearEphemeralForQuestion, persist, question, revealed, repr]
  )

  /**
   * 选「不知道」：不选选项直接揭示正确答案。
   * 计为已答（revealed）但不算正确，持久化 unknowns 记入弱项。
   */
  const handleUnknown = useCallback(async () => {
    const q = question
    if (!q || revealed || busy) return
    if (repr.phase !== "quiz") return
    const unknowns = { ...(repr.unknowns ?? {}), [q.id]: true }
    const revealedMap = { ...(repr.revealed ?? {}), [q.id]: true }
    clearEphemeralForQuestion()
    await persist({
      ...repr,
      unknowns,
      revealed: revealedMap
    })
  }, [busy, clearEphemeralForQuestion, persist, question, revealed, repr])

  /**
   * 揭晓后标记/取消「这是猜的」。猜对的题不计入掌握、计入弱项；
   * 答错的题本就弱项，标记只作记录，绝不升级结果。
   */
  const handleToggleGuessed = useCallback(
    async (questionId: string) => {
      if (busy) return
      const cur = repr.guessed?.[questionId] === true
      const guessed = { ...(repr.guessed ?? {}), [questionId]: !cur }
      await persist({ ...repr, guessed })
    },
    [busy, persist, repr]
  )

  const handleNext = useCallback(async () => {
    if (!question) return
    if (index >= questions.length - 1) {
      await persist({ ...repr, phase: "done", currentIndex: index })
      return
    }
    const ok = await persist({ ...repr, currentIndex: index + 1 })
    if (!ok) return
    clearEphemeralForQuestion()
  }, [clearEphemeralForQuestion, index, persist, question, questions.length, repr])

  /** Explicit-target: write basic card for a specific question (wrong-review safe). */
  const handleAddBasicFor = useCallback(
    async (target: ChapterQuizQuestion) => {
      const existing = repr.cardAdds?.[target.id]
      if (existing?.basicBlockId) return
      setCardBusyId(target.id)
      setLocalError(null)
      try {
        // 制卡父块必须是当前题 sourceBlockId（与「跳转原文」同一来源）
        const parentBlockId = requireQuizCardSourceBlockId(target)
        // 写卡 + cardAdds persist 同在编辑器焦点上下文内（Custom Panel 需切左侧）
        // 只剩小测 Panel 时自动在旁边打开原文块视图再写入，Custom Panel 不被顶掉
        const saved = await runWithChapterQuizEditorContext(
          writeContextPanelId,
          async () => {
            const id = await writeBasicCardFromQuizQuestion({
              pluginName: repr.pluginName,
              parentBlockId,
              question: target
            })
            const nextAdds = mergeQuestionCardAdds(repr.cardAdds, target.id, {
              basicBlockId: id
            })
            return persist({ ...repr, cardAdds: nextAdds })
          },
          {
            openPanel: {
              view: "block",
              viewArgs: { blockId: parentBlockId }
            }
          }
        )
        if (!saved) {
          orca.notify(
            "warn",
            "简答卡已创建，但测验状态未保存；请避免重复点击",
            { title: "章末小测" }
          )
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
    [persist, repr, writeContextPanelId]
  )

  const handleStartClozeFor = useCallback(
    async (target: ChapterQuizQuestion) => {
      const existing = repr.cardAdds?.[target.id]
      if (existing?.clozeBlockId) return
      setClozeBusy(true)
      setLocalError(null)
      setClozePreview(null)
      try {
        const result = await rewriteQuestionAsCloze({
          pluginName: repr.pluginName,
          question: target
        })
        if (!result.success) {
          setLocalError(result.error.message)
          orca.notify("error", result.error.message, { title: "章末小测" })
          return
        }
        setClozePreview({
          text: result.text,
          clozeText: result.clozeText,
          questionId: target.id
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[章末小测] 填空改写失败:", error)
        setLocalError(message)
        orca.notify("error", message, { title: "章末小测" })
      } finally {
        setClozeBusy(false)
      }
    },
    [repr.cardAdds, repr.pluginName]
  )

  const handleConfirmClozeFor = useCallback(
    async (target: ChapterQuizQuestion) => {
      if (!clozePreview || clozePreview.questionId !== target.id) return
      setCardBusyId(target.id)
      setLocalError(null)
      try {
        const preview = clozePreview
        // 制卡父块必须是当前题 sourceBlockId（与「跳转原文」同一来源）
        const parentBlockId = requireQuizCardSourceBlockId(target)
        const saved = await runWithChapterQuizEditorContext(
          writeContextPanelId,
          async () => {
            const id = await writeClozeCardFromQuizQuestion({
              pluginName: repr.pluginName,
              parentBlockId,
              text: preview.text,
              clozeText: preview.clozeText
            })
            const nextAdds = mergeQuestionCardAdds(repr.cardAdds, target.id, {
              clozeBlockId: id
            })
            return persist({ ...repr, cardAdds: nextAdds })
          },
          {
            openPanel: {
              view: "block",
              viewArgs: { blockId: parentBlockId }
            }
          }
        )
        setClozePreview(null)
        if (!saved) {
          orca.notify(
            "warn",
            "填空卡已创建，但测验状态未保存；请避免重复点击",
            { title: "章末小测" }
          )
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
    [clozePreview, persist, repr, writeContextPanelId]
  )

  /** Explicit-target follow-up: context is the given question + its selectedIndex. */
  const handleFollowUpFor = useCallback(
    async (target: ChapterQuizQuestion, selectedIndex?: number) => {
      if (!followUpDraft.trim() || followUpBusy) return
      const userText = followUpDraft.trim()
      const sel =
        typeof selectedIndex === "number"
          ? selectedIndex
          : typeof repr.answers?.[target.id] === "number"
            ? repr.answers![target.id]
            : undefined
      setFollowUpBusy(true)
      setFollowUpError(null)
      setFollowUpDraft("")
      const history = [...followUps]
      setFollowUps([...history, { role: "user", content: userText }])
      try {
        const result = await generateChapterQuizFollowUp({
          pluginName: repr.pluginName,
          question: target,
          selectedIndex: sel,
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
    handleUnknown,
    handleToggleGuessed,
    handleNext,
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
