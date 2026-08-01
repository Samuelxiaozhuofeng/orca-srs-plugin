import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildBasicCardFromQuestion,
  buildInitialQuizRepr,
  buildMinimalQuizReprShell,
  CHAPTER_QUIZ_PANEL_VIEW,
  countAnsweredQuestions,
  countCorrectAnswers,
  findPanelNodeById,
  isAnswerCorrect,
  listWrongQuestions,
  normalizeChapterQuizRepr,
  openChapterQuizInSidePanel,
  parseChapterQuizQuestions,
  parseQuizBlockIdFromViewArgs,
  quizOptionLetter,
  resolveQuizBlockIdForPanel,
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
    expect(r.phase).toBe("quiz")
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

  it("listWrongQuestions keeps order of wrong items only", () => {
    const wrong = listWrongQuestions(sampleQuestions, { q0: 0, q1: 1 })
    expect(wrong).toHaveLength(1)
    expect(wrong[0].id).toBe("q0")
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
