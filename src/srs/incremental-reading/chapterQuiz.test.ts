import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildBasicCardFromQuestion,
  buildInitialQuizRepr,
  buildMinimalQuizReprShell,
  buildQuizCountChoices,
  CHAPTER_QUIZ_COPY,
  CHAPTER_QUIZ_COUNT_PRESETS,
  CHAPTER_QUIZ_LOCATE_EVENT,
  CHAPTER_QUIZ_PANEL_VIEW,
  countAnsweredQuestions,
  countConfidentCorrect,
  countCorrectAnswers,
  createSeededRng,
  estimateQuizDurationSeconds,
  enqueueChapterQuizPersist,
  findPanelNodeById,
  formatQuizDurationEstimate,
  formatQuizGenProgressLabel,
  isAnswerCorrect,
  isQuestionWeak,
  jumpToQuizSourceBlock,
  listWeakQuestions,
  normalizeChapterQuizRepr,
  openChapterQuizInSidePanel,
  parseChapterQuizQuestions,
  parseQuizBlockIdFromViewArgs,
  quizOptionLetter,
  requireQuizCardSourceBlockId,
  resetQuizSourceSidePanelCacheForTests,
  resolveQuizBlockIdForPanel,
  shuffleQuizQuestions,
  toPlainJsonValue,
  type ChapterQuizQuestion
} from "./chapterQuiz"

const sampleQuestions: ChapterQuizQuestion[] = [
  {
    id: "q0",
    text: "什么是渐进阅读？",
    options: ["一次性读完整书", "分次阅读并提炼", "只读标题", "跳过难段"],
    correctIndex: 1,
    explanation: "渐进阅读强调分次加工。"
  },
  {
    id: "q1",
    text: "小测是否进入日常复习队列？",
    options: ["是", "否", "仅错题", "仅对题"],
    correctIndex: 1,
    explanation: "一次性检查，默认不入队。"
  }
]

describe("parseChapterQuizQuestions", () => {
  it("parses valid JSON payload", () => {
    const raw = JSON.stringify({
      questions: [
        {
          id: "a",
          text: "题干",
          options: ["甲", "乙", "丙", "丁"],
          correctIndex: 2,
          explanation: "因为丙对",
          sourceBlockId: 99
        }
      ]
    })
    const result = parseChapterQuizQuestions(raw, 10, [99, 100])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].correctIndex).toBe(2)
    expect(result.questions[0].options).toEqual(["甲", "乙", "丙", "丁"])
    expect(result.questions[0].sourceBlockId).toBe(99)
  })

  it("drops sourceBlockId not in allowed set without failing the quiz", () => {
    const raw = JSON.stringify({
      questions: [
        {
          text: "题干",
          options: ["甲", "乙", "丙"],
          correctIndex: 0,
          explanation: "因为甲",
          sourceBlockId: 999
        }
      ]
    })
    const result = parseChapterQuizQuestions(raw, 1, [1, 2, 3])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0].sourceBlockId).toBeUndefined()
  })

  it("accepts fenced JSON and letter correctOption", () => {
    const raw = [
      "```json",
      JSON.stringify({
        questions: [
          {
            text: "Q",
            options: ["A1", "B1", "C1"],
            correctOption: "B",
            explanation: "B is right"
          }
        ]
      }),
      "```"
    ].join("\n")
    const result = parseChapterQuizQuestions(raw, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0].correctIndex).toBe(1)
    expect(result.questions[0].id).toBe("q0")
  })

  it("rejects too few options", () => {
    const raw = JSON.stringify({
      questions: [
        {
          text: "Q",
          options: ["only", "two"],
          correctIndex: 0,
          explanation: "x"
        }
      ]
    })
    const result = parseChapterQuizQuestions(raw, 1)
    expect(result.ok).toBe(false)
  })

  it("caps to expected count", () => {
    const questions = Array.from({ length: 15 }, (_, i) => ({
      id: `q${i}`,
      text: `T${i}`,
      options: ["a", "b", "c", "d"],
      correctIndex: 0,
      explanation: "e"
    }))
    const result = parseChapterQuizQuestions(JSON.stringify({ questions }), 10)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(10)
  })

  it("rejects missing explanation", () => {
    const raw = JSON.stringify({
      questions: [
        {
          text: "Q",
          options: ["a", "b", "c"],
          correctIndex: 0
        }
      ]
    })
    expect(parseChapterQuizQuestions(raw, 1).ok).toBe(false)
  })

  it("forces unique local ids even when model reuses ids", () => {
    const raw = JSON.stringify({
      questions: [
        {
          id: "q1",
          text: "Q1",
          options: ["a", "b", "c"],
          correctIndex: 0,
          explanation: "e1"
        },
        {
          id: "q1",
          text: "Q2",
          options: ["a", "b", "c"],
          correctIndex: 1,
          explanation: "e2"
        }
      ]
    })
    const result = parseChapterQuizQuestions(raw, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions.map((q) => q.id)).toEqual(["q0", "q1"])
  })

  it("rejects empty option without shifting correctIndex", () => {
    const raw = JSON.stringify({
      questions: [
        {
          text: "Q",
          options: ["", "b", "c", "d"],
          correctIndex: 1,
          explanation: "e"
        }
      ]
    })
    expect(parseChapterQuizQuestions(raw, 1).ok).toBe(false)
  })
})

describe("answer helpers", () => {
  it("isAnswerCorrect / countCorrectAnswers", () => {
    expect(isAnswerCorrect(sampleQuestions[0], 1)).toBe(true)
    expect(isAnswerCorrect(sampleQuestions[0], 0)).toBe(false)
    expect(
      countCorrectAnswers(sampleQuestions, { q0: 1, q1: 0 })
    ).toBe(1)
    expect(
      countCorrectAnswers(sampleQuestions, { q0: 1, q1: 1 })
    ).toBe(2)
  })

  it("buildBasicCardFromQuestion joins answer + explanation", () => {
    const card = buildBasicCardFromQuestion(sampleQuestions[0])
    expect(card.question).toBe(sampleQuestions[0].text)
    expect(card.answer).toContain("分次阅读并提炼")
    expect(card.answer).toContain("渐进阅读强调分次加工")
  })

  it("requireQuizCardSourceBlockId returns valid sourceBlockId", () => {
    const withSource: ChapterQuizQuestion = {
      ...sampleQuestions[0],
      sourceBlockId: 123
    }
    expect(requireQuizCardSourceBlockId(withSource)).toBe(123)
  })

  it("requireQuizCardSourceBlockId rejects missing/invalid ids", () => {
    const missing: ChapterQuizQuestion = { ...sampleQuestions[0] }
    const zero: ChapterQuizQuestion = { ...sampleQuestions[0], sourceBlockId: 0 }
    const negative: ChapterQuizQuestion = {
      ...sampleQuestions[0],
      sourceBlockId: -5
    }
    expect(() => requireQuizCardSourceBlockId(missing)).toThrow(
      /无法制卡/
    )
    expect(() => requireQuizCardSourceBlockId(zero)).toThrow(/无法制卡/)
    expect(() => requireQuizCardSourceBlockId(negative)).toThrow(/无法制卡/)
  })
})

describe("weak-item semantics（答错 / 不知道 / 猜对）", () => {
  it("isQuestionWeak: wrong / unknown / guessed-correct are weak", () => {
    // 答错
    expect(
      isQuestionWeak(sampleQuestions[0], { answers: { q0: 0 } })
    ).toBe(true)
    // 答对且未标记猜 → 不弱
    expect(
      isQuestionWeak(sampleQuestions[0], { answers: { q0: 1 } })
    ).toBe(false)
    // 猜对 → 弱
    expect(
      isQuestionWeak(sampleQuestions[0], {
        answers: { q0: 1 },
        guessed: { q0: true }
      })
    ).toBe(true)
    // 不知道 → 弱（无 answers 条目）
    expect(
      isQuestionWeak(sampleQuestions[0], { unknowns: { q0: true } })
    ).toBe(true)
    // 未作答 → 不弱
    expect(isQuestionWeak(sampleQuestions[0], {})).toBe(false)
  })

  it("listWeakQuestions keeps question order and covers all weak kinds", () => {
    const weak = listWeakQuestions(sampleQuestions, {
      answers: { q0: 0, q1: 1 },
      guessed: { q1: true },
      unknowns: { q0: true }
    })
    // q0 既答错又标了不知道（防御性只算一道）；q1 猜对
    expect(weak.map((q) => q.id)).toEqual(["q0", "q1"])
  })

  it("listWeakQuestions ignores un-answered questions", () => {
    expect(
      listWeakQuestions(sampleQuestions, { answers: { q0: 1 } }).map(
        (q) => q.id
      )
    ).toEqual([])
  })

  it("countConfidentCorrect excludes unknown and guessed-correct", () => {
    const repr = {
      answers: { q0: 1, q1: 1 },
      unknowns: { q0: true },
      guessed: { q1: true }
    }
    // q0 unknown 不计；q1 猜对不计 → 0 道掌握
    expect(countConfidentCorrect(sampleQuestions, repr)).toBe(0)
  })

  it("countConfidentCorrect counts only confident correct", () => {
    expect(
      countConfidentCorrect(sampleQuestions, { answers: { q0: 1 } })
    ).toBe(1)
    expect(
      countConfidentCorrect(sampleQuestions, {
        answers: { q0: 1, q1: 0 }
      })
    ).toBe(1)
  })
})

describe("count presets + duration estimates", () => {
  it("presets are 5/10/15 with deterministic duration", () => {
    expect(CHAPTER_QUIZ_COUNT_PRESETS).toEqual([5, 10, 15])
    expect(estimateQuizDurationSeconds(5)).toBe(100)
    expect(formatQuizDurationEstimate(5)).toBe("约 2 分钟")
    expect(formatQuizDurationEstimate(10)).toBe("约 3 分钟")
    expect(formatQuizDurationEstimate(15)).toBe("约 5 分钟")
    // 非法输入不抛错，回退到安全值
    expect(formatQuizDurationEstimate(NaN)).toBe("约 3 分钟")
  })

  it("buildQuizCountChoices: presets only when preference is one of them", () => {
    const choices = buildQuizCountChoices(10)
    expect(choices.map((c) => c.count)).toEqual([5, 10, 15])
    expect(choices.find((c) => c.count === 10)?.isPreference).toBe(true)
    expect(choices.find((c) => c.count === 5)?.isPreference).toBe(false)
    expect(choices.every((c) => c.isPreset)).toBe(true)
    expect(choices[0]?.label).toBe("快速 5 题")
    expect(choices[1]?.label).toBe("标准 10 题")
    expect(choices[2]?.label).toBe("深入 15 题")
    expect(choices[0]?.durationLabel).toBe("约 2 分钟")
  })

  it("buildQuizCountChoices: preserves non-preset preference as 按设置 N 题", () => {
    const choices = buildQuizCountChoices(12)
    expect(choices.map((c) => c.count)).toEqual([5, 10, 15, 12])
    const custom = choices[3]
    expect(custom?.label).toBe("按设置 12 题")
    expect(custom?.isPreset).toBe(false)
    expect(custom?.isPreference).toBe(true)
    expect(custom?.durationLabel).toBe("约 4 分钟")
  })
})

describe("stable randomized order", () => {
  const questions: ChapterQuizQuestion[] = sampleQuestions.map((q) => ({
    ...q,
    options: [...q.options],
    sourceBlockId: 100 + Number(q.id.slice(1))
  }))

  it("same seed produces identical output (stable across rerenders/reload)", () => {
    const a = shuffleQuizQuestions(questions, createSeededRng(42))
    const b = shuffleQuizQuestions(questions, createSeededRng(42))
    expect(a).toEqual(b)
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id))
    expect(a.map((q) => q.correctIndex)).toEqual(b.map((q) => q.correctIndex))
  })

  it("keeps the correct option text at the remapped correctIndex", () => {
    const shuffled = shuffleQuizQuestions(questions, createSeededRng(7))
    expect(shuffled).toHaveLength(questions.length)
    for (const q of shuffled) {
      const src = questions.find((s) => s.id === q.id)!
      expect(q.options[q.correctIndex]).toBe(src.options[src.correctIndex])
      // 选项集合不变
      expect([...q.options].sort()).toEqual([...src.options].sort())
      expect(q.sourceBlockId).toBe(src.sourceBlockId)
      expect(q.explanation).toBe(src.explanation)
    }
  })

  it("shuffles at least one of the two questions (order no longer source order)", () => {
    const shuffled = shuffleQuizQuestions(questions, createSeededRng(99))
    const orderChanged =
      shuffled[0]?.id !== questions[0]?.id ||
      shuffled[1]?.id !== questions[1]?.id
    const optionsChanged = shuffled.some(
      (q, i) =>
        q.options.some((opt, oi) => opt !== questions[i]!.options[oi]) ||
        q.correctIndex !== questions[i]!.correctIndex
    )
    expect(orderChanged || optionsChanged).toBe(true)
  })

  it("empty input stays empty", () => {
    expect(shuffleQuizQuestions([], createSeededRng(1))).toEqual([])
  })
})

describe("generation progress persistence order", () => {
  it("queues consecutive retry writes instead of starting them concurrently", async () => {
    const events: string[] = []
    let releaseFirst!: () => void

    const first = enqueueChapterQuizPersist(null, async () => {
      events.push("first:start")
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      events.push("first:end")
      return true
    })
    const second = enqueueChapterQuizPersist(first, async () => {
      events.push("second:start")
      events.push("second:end")
      return true
    })

    await Promise.resolve()
    expect(events).toEqual(["first:start"])
    releaseFirst()
    await second
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end"
    ])
  })
})

describe("generation progress labels", () => {
  it("maps stages to user-facing copy", () => {
    expect(formatQuizGenProgressLabel("collecting")).toBe("正在读取本章")
    expect(formatQuizGenProgressLabel("generating")).toBe(
      CHAPTER_QUIZ_COPY.generating
    )
    expect(formatQuizGenProgressLabel("polishing")).toBe("正在整理")
    expect(formatQuizGenProgressLabel(undefined, undefined)).toBe("正在生成")
  })

  it("labels the score as an immediate result without long-term mastery copy", () => {
    expect(CHAPTER_QUIZ_COPY.resultTitle).toBe("即时理解结果")
    expect(CHAPTER_QUIZ_COPY.resultSummary(3, 2)).toBe(
      "当前清晰 3 道 · 薄弱 2 道"
    )
    expect(CHAPTER_QUIZ_COPY.resultSummary(3, 2)).not.toContain("掌握")
  })

  it("shows attempt count on automatic retries (total = 1 + retries)", () => {
    expect(formatQuizGenProgressLabel("generating", 1)).toBe("正在生成")
    expect(formatQuizGenProgressLabel("generating", 2)).toBe(
      "正在生成（第 2/4 次尝试）"
    )
    expect(formatQuizGenProgressLabel("generating", 4)).toBe(
      "正在生成（第 4/4 次尝试）"
    )
    // 越界尝试号被钳制到总尝试数内
    expect(formatQuizGenProgressLabel("generating", 9)).toBe(
      "正在生成（第 4/4 次尝试）"
    )
  })
})

describe("repr helpers", () => {
  it("buildInitialQuizRepr defaults", () => {
    const r = buildInitialQuizRepr({
      pluginName: "orca-srs",
      topicBlockId: 42
    })
    expect(r.type).toBe("srs.chapter-quiz")
    expect(r.phase).toBe("generating")
    expect(r.questionCount).toBe(10)
    expect(r.topicBlockId).toBe(42)
  })

  it("normalizeChapterQuizRepr fills safe defaults", () => {
    const r = normalizeChapterQuizRepr(
      { type: "srs.chapter-quiz", phase: "quiz" as const },
      { pluginName: "p", topicBlockId: 9 }
    )
    expect(r.pluginName).toBe("p")
    expect(r.topicBlockId).toBe(9)
    expect(r.answers).toEqual({})
    expect(r.unknowns).toEqual({})
    expect(r.guessed).toEqual({})
    expect(r.phase).toBe("quiz")
  })

  it("normalizeChapterQuizRepr keeps additive fields and legacy maps", () => {
    const r = normalizeChapterQuizRepr(
      {
        type: "srs.chapter-quiz",
        phase: "generating" as const,
        unknowns: { q0: true },
        guessed: { q1: true },
        genStage: "collecting" as const,
        genAttempt: 3
      },
      { pluginName: "p" }
    )
    expect(r.unknowns).toEqual({ q0: true })
    expect(r.guessed).toEqual({ q1: true })
    expect(r.genStage).toBe("collecting")
    expect(r.genAttempt).toBe(3)
  })

  it("normalizeChapterQuizRepr drops illegal genStage/genAttempt", () => {
    const r = normalizeChapterQuizRepr(
      {
        type: "srs.chapter-quiz",
        phase: "generating" as const,
        genStage: "bogus" as never,
        genAttempt: 0
      },
      { pluginName: "p" }
    )
    expect(r.genStage).toBeUndefined()
    expect(r.genAttempt).toBeUndefined()
  })

  it("buildMinimalQuizReprShell omits questions payload", () => {
    const shell = buildMinimalQuizReprShell({
      pluginName: "orca-srs",
      topicBlockId: 1,
      phase: "quiz",
      questionCount: 10,
      sessionContinueNext: true
    })
    expect(shell.type).toBe("srs.chapter-quiz")
    expect(shell).not.toHaveProperty("questions")
    expect(shell).not.toHaveProperty("answers")
  })

  it("toPlainJsonValue strips undefined", () => {
    const plain = toPlainJsonValue({
      a: 1,
      b: undefined as unknown as string,
      c: { d: "x" }
    })
    expect(plain).toEqual({ a: 1, c: { d: "x" } })
  })
})

describe("panel viewArgs + progress helpers", () => {
  it("parseQuizBlockIdFromViewArgs accepts number and numeric string", () => {
    expect(parseQuizBlockIdFromViewArgs({ quizBlockId: 42 })).toBe(42)
    expect(parseQuizBlockIdFromViewArgs({ quizBlockId: "99" })).toBe(99)
    expect(parseQuizBlockIdFromViewArgs({ quizBlockId: 0 })).toBeNull()
    expect(parseQuizBlockIdFromViewArgs({ quizBlockId: -1 })).toBeNull()
    expect(parseQuizBlockIdFromViewArgs({ quizBlockId: "x" })).toBeNull()
    expect(parseQuizBlockIdFromViewArgs(null)).toBeNull()
    expect(parseQuizBlockIdFromViewArgs({})).toBeNull()
  })

  it("quizOptionLetter maps 0→A", () => {
    expect(quizOptionLetter(0)).toBe("A")
    expect(quizOptionLetter(2)).toBe("C")
  })

  it("countAnsweredQuestions counts revealed flags", () => {
    expect(
      countAnsweredQuestions(sampleQuestions, { q0: true, q1: false })
    ).toBe(1)
    expect(countAnsweredQuestions(sampleQuestions, { q0: true, q1: true })).toBe(
      2
    )
  })

  it("listWeakQuestions keeps order of weak items only", () => {
    const weak = listWeakQuestions(sampleQuestions, {
      answers: { q0: 0, q1: 1 }
    })
    expect(weak).toHaveLength(1)
    expect(weak[0].id).toBe("q0")
  })

  it("findPanelNodeById walks nested tree", () => {
    const tree = {
      id: "root",
      children: [
        {
          id: "col",
          children: [
            {
              id: "right-1",
              view: CHAPTER_QUIZ_PANEL_VIEW,
              viewArgs: { quizBlockId: 7 }
            }
          ]
        }
      ]
    }
    const node = findPanelNodeById(tree, "right-1")
    expect(node?.viewArgs?.quizBlockId).toBe(7)
    expect(findPanelNodeById(tree, "missing")).toBeNull()
  })

  it("resolveQuizBlockIdForPanel uses findViewPanel then tree", () => {
    const findViewPanel = vi.fn(() => ({
      id: "p1",
      view: CHAPTER_QUIZ_PANEL_VIEW,
      viewArgs: { quizBlockId: 55 },
      viewState: {}
    }))
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { findViewPanel },
      state: { panels: { id: "root", children: [] } },
      notify: vi.fn()
    }
    expect(resolveQuizBlockIdForPanel("p1")).toBe(55)
    expect(findViewPanel).toHaveBeenCalled()
  })
})

describe("openChapterQuizInSidePanel navigation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function stubWindow() {
    const events: CustomEvent[] = []
    const dispatchEvent = vi.fn((evt: Event) => {
      events.push(evt as CustomEvent)
      return true
    })
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
      dispatchEvent
    })
    return { dispatchEvent, events }
  }

  it("addTo right with custom panel view and quizBlockId", () => {
    const { events } = stubWindow()
    const addTo = vi.fn(() => "right-panel-id")
    const goTo = vi.fn()
    const switchFocusTo = vi.fn()
    const notify = vi.fn()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo, goTo, switchFocusTo },
      state: { panels: {} },
      notify
    }

    const id = openChapterQuizInSidePanel({
      hostPanelId: "left-1",
      quizBlockId: 123
    })

    expect(id).toBe("right-panel-id")
    expect(addTo).toHaveBeenCalledWith("left-1", "right", {
      view: CHAPTER_QUIZ_PANEL_VIEW,
      viewArgs: { quizBlockId: 123 },
      viewState: {}
    })
    expect(goTo).not.toHaveBeenCalled()
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe("orca-srs:chapter-quiz-panel-nav")
    expect(events[0]?.detail).toEqual({
      panelId: "right-panel-id",
      quizBlockId: 123
    })
  })

  it("reuses existing right panel via goTo custom view", () => {
    const { events } = stubWindow()
    const addTo = vi.fn()
    const goTo = vi.fn()
    const switchFocusTo = vi.fn()
    const notify = vi.fn()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo, goTo, switchFocusTo },
      state: {
        panels: {
          "left-1": { id: "left-1" },
          "right-existing": {
            id: "right-existing",
            parentId: "left-1",
            position: "right"
          }
        }
      },
      notify
    }

    const id = openChapterQuizInSidePanel({
      hostPanelId: "left-1",
      quizBlockId: 88
    })

    expect(id).toBe("right-existing")
    expect(addTo).not.toHaveBeenCalled()
    expect(goTo).toHaveBeenCalledWith(
      CHAPTER_QUIZ_PANEL_VIEW,
      { quizBlockId: 88 },
      "right-existing"
    )
    expect(events[0]?.detail).toEqual({
      panelId: "right-existing",
      quizBlockId: 88
    })
  })

  it("reused right panel dispatches new quizBlockId when switching A→B", () => {
    const { events } = stubWindow()
    const goTo = vi.fn()
    const switchFocusTo = vi.fn()
    const notify = vi.fn()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo: vi.fn(), goTo, switchFocusTo },
      state: {
        panels: {
          left: { id: "left" },
          right: { id: "right", parentId: "left", position: "right" }
        }
      },
      notify
    }

    openChapterQuizInSidePanel({ hostPanelId: "left", quizBlockId: 100 })
    openChapterQuizInSidePanel({ hostPanelId: "left", quizBlockId: 200 })

    expect(goTo).toHaveBeenLastCalledWith(
      CHAPTER_QUIZ_PANEL_VIEW,
      { quizBlockId: 200 },
      "right"
    )
    expect(events).toHaveLength(2)
    expect(events[1]?.detail).toEqual({ panelId: "right", quizBlockId: 200 })
  })

  it("rejects invalid quizBlockId without navigating", () => {
    const addTo = vi.fn()
    const notify = vi.fn()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo },
      state: { panels: {} },
      notify
    }
    expect(
      openChapterQuizInSidePanel({ hostPanelId: "x", quizBlockId: 0 })
    ).toBeNull()
    expect(addTo).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalled()
  })
})

describe("jumpToQuizSourceBlock (side panel)", () => {
  beforeEach(() => {
    resetQuizSourceSidePanelCacheForTests()
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      }
    })
  })

  afterEach(() => {
    resetQuizSourceSidePanelCacheForTests()
    vi.unstubAllGlobals()
  })

  it("opens a new right block side panel relative to quiz panel", () => {
    const addTo = vi.fn(() => "source-side")
    const goTo = vi.fn()
    const switchFocusTo = vi.fn()
    const notify = vi.fn()
    const findViewPanel = vi.fn(() => null)
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo, goTo, switchFocusTo, findViewPanel },
      state: { panels: { "quiz-p": { id: "quiz-p" } } },
      notify
    }

    const ok = jumpToQuizSourceBlock({
      sourceBlockId: 42,
      currentPanelId: "quiz-p"
    })

    expect(ok).toBe(true)
    expect(addTo).toHaveBeenCalledWith("quiz-p", "right", {
      view: "block",
      viewArgs: { blockId: 42 },
      viewState: {}
    })
    expect(goTo).not.toHaveBeenCalled()
    expect(switchFocusTo).toHaveBeenCalledWith("source-side")
    expect(notify).toHaveBeenCalledWith(
      "success",
      expect.any(String),
      expect.objectContaining({ title: "章末小测" })
    )
  })

  it("reuses cached side panel via goTo on second jump", () => {
    const addTo = vi.fn(() => "source-side")
    const goTo = vi.fn()
    const switchFocusTo = vi.fn()
    const notify = vi.fn()
    // 首次：树中无该块 → addTo；第二次：缓存侧栏仍存活 → goTo 换块
    const findViewPanel = vi.fn((id: string) =>
      id === "source-side" ? { id: "source-side", view: "block" } : null
    )
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo, goTo, switchFocusTo, findViewPanel },
      state: { panels: { "quiz-p": { id: "quiz-p" } } },
      notify
    }

    expect(
      jumpToQuizSourceBlock({ sourceBlockId: 42, currentPanelId: "quiz-p" })
    ).toBe(true)
    expect(addTo).toHaveBeenCalledTimes(1)

    expect(
      jumpToQuizSourceBlock({ sourceBlockId: 99, currentPanelId: "quiz-p" })
    ).toBe(true)
    expect(addTo).toHaveBeenCalledTimes(1)
    expect(goTo).toHaveBeenCalledWith(
      "block",
      { blockId: 99 },
      "source-side"
    )
  })

  it("opens a right side panel when no IR session panel is present", () => {
    const addTo = vi.fn(() => "source-side")
    const goTo = vi.fn()
    const switchFocusTo = vi.fn()
    const notify = vi.fn()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo, goTo, switchFocusTo, findViewPanel: () => null },
      state: {
        panels: {
          id: "root",
          direction: "row",
          children: [
            // 普通笔记 block 面板（非 srs.ir-session）：不算阅读面板
            { id: "note-left", view: "block", viewArgs: { blockId: 5 } },
            { id: "quiz-p", view: "srs.chapter-quiz-panel" }
          ]
        },
        blocks: { 5: { _repr: { type: "srs.card" } } }
      },
      notify
    }

    jumpToQuizSourceBlock({ sourceBlockId: 99, currentPanelId: "quiz-p" })

    expect(addTo).toHaveBeenCalledWith("quiz-p", "right", expect.any(Object))
    // 不得 goTo 改写左侧面板视图
    expect(goTo).not.toHaveBeenCalledWith("block", { blockId: 99 }, "note-left")
  })

  it("rejects missing sourceBlockId", () => {
    const notify = vi.fn()
    const addTo = vi.fn()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo },
      state: { panels: {} },
      notify
    }
    expect(
      jumpToQuizSourceBlock({ sourceBlockId: 0, currentPanelId: "quiz-p" })
    ).toBe(false)
    expect(addTo).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalled()
  })
})

describe("jumpToQuizSourceBlock (IR session panel first)", () => {
  beforeEach(() => {
    resetQuizSourceSidePanelCacheForTests()
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      }
    })
  })

  afterEach(() => {
    resetQuizSourceSidePanelCacheForTests()
    vi.unstubAllGlobals()
  })

  /** 构造左侧含 srs.ir-session 阅读面板的面板树（真实树结构） */
  function stubOrcaWithIRSessionPanel(
    sessionBlock: Record<string, unknown> = { _repr: { type: "srs.ir-session" } }
  ) {
    const addTo = vi.fn(() => "source-side")
    const goTo = vi.fn()
    const switchFocusTo = vi.fn()
    const notify = vi.fn()
    ;(globalThis as unknown as { orca: unknown }).orca = {
      nav: { addTo, goTo, switchFocusTo, findViewPanel: () => null },
      state: {
        panels: {
          id: "root",
          direction: "row",
          children: [
            { id: "ir-left", view: "block", viewArgs: { blockId: 1 } },
            { id: "quiz-p", view: "srs.chapter-quiz-panel" }
          ]
        },
        blocks: { 1: sessionBlock }
      },
      notify
    }
    return { addTo, goTo, switchFocusTo, notify }
  }

  it("locates inside the left IR session panel instead of opening a side panel", () => {
    const events: CustomEvent[] = []
    const dispatchEvent = vi.fn((evt: Event) => {
      const ce = evt as CustomEvent
      events.push(ce)
      if (ce.type === CHAPTER_QUIZ_LOCATE_EVENT) {
        // 模拟左侧 IR 会话面板（IRSessionShell.onLocate）同步接管定位
        ;(ce.detail as { claimed?: boolean }).claimed = true
      }
      return true
    })
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
      dispatchEvent
    })
    const { addTo, goTo } = stubOrcaWithIRSessionPanel()

    const ok = jumpToQuizSourceBlock({
      sourceBlockId: 99,
      currentPanelId: "quiz-p",
      topicBlockId: 7
    })

    expect(ok).toBe(true)
    expect(events).toHaveLength(1)
    const evt = events[0]
    expect(evt.type).toBe(CHAPTER_QUIZ_LOCATE_EVENT)
    expect(evt.detail).toMatchObject({
      sourceBlockId: 99,
      topicBlockId: 7,
      targetPanelId: "ir-left",
      claimed: true
    })
    // 已有 IR 阅读面板：不开新侧栏，也不 goTo 改写左侧面板
    expect(addTo).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalledWith("block", { blockId: 99 }, "ir-left")
  })

  it("detects IR session via properties._repr when live _repr is missing (host reality)", () => {
    // 真机：block._repr 常为 undefined，类型只在 properties._repr / ir.isSessionBlock
    const events: CustomEvent[] = []
    const dispatchEvent = vi.fn((evt: Event) => {
      const ce = evt as CustomEvent
      events.push(ce)
      if (ce.type === CHAPTER_QUIZ_LOCATE_EVENT) {
        ;(ce.detail as { claimed?: boolean }).claimed = true
      }
      return true
    })
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
      dispatchEvent
    })
    const { addTo, goTo } = stubOrcaWithIRSessionPanel({
      properties: [
        { name: "_repr", value: { type: "srs.ir-session" }, type: 1 },
        { name: "ir.isSessionBlock", value: true, type: 4 }
      ]
    })

    const ok = jumpToQuizSourceBlock({
      sourceBlockId: 99,
      currentPanelId: "quiz-p"
    })

    expect(ok).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0].detail).toMatchObject({
      targetPanelId: "ir-left",
      claimed: true
    })
    expect(addTo).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalled()
  })

  it("detects IR session via ir.isSessionBlock alone", () => {
    const events: CustomEvent[] = []
    const dispatchEvent = vi.fn((evt: Event) => {
      const ce = evt as CustomEvent
      events.push(ce)
      if (ce.type === CHAPTER_QUIZ_LOCATE_EVENT) {
        ;(ce.detail as { claimed?: boolean }).claimed = true
      }
      return true
    })
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
      dispatchEvent
    })
    const { addTo } = stubOrcaWithIRSessionPanel({
      properties: [{ name: "ir.isSessionBlock", value: true, type: 4 }]
    })

    expect(
      jumpToQuizSourceBlock({ sourceBlockId: 99, currentPanelId: "quiz-p" })
    ).toBe(true)
    expect(events).toHaveLength(1)
    expect(addTo).not.toHaveBeenCalled()
  })

  it("does not open a side panel when IR panel exists but does not claim", () => {
    const dispatchEvent = vi.fn(() => true)
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
      dispatchEvent
    })
    const { addTo, notify } = stubOrcaWithIRSessionPanel()

    const ok = jumpToQuizSourceBlock({
      sourceBlockId: 99,
      currentPanelId: "quiz-p"
    })

    // 已确认左侧阅读面板：禁止叠出第三块出处侧栏
    expect(ok).toBe(false)
    expect(addTo).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalled()
  })
})
