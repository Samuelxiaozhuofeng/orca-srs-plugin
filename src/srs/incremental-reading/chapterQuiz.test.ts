import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildBasicCardFromQuestion,
  buildInitialQuizRepr,
  buildMinimalQuizReprShell,
  applyBatchCardAddOutcome,
  buildRepairOptionOrder,
  buildRepairRoundState,
  CHAPTER_QUIZ_LOCATE_EVENT,
  CHAPTER_QUIZ_PANEL_VIEW,
  classifyFirstRoundAnswer,
  countAnsweredQuestions,
  countCorrectAnswers,
  countFirstCategories,
  countRecordedCardAdds,
  countRepairedWeakItems,
  findPanelNodeById,
  formatSelectedWrongChoiceLabel,
  freezeWeakItemsIfNeeded,
  isAnswerCorrect,
  jumpToQuizSourceBlock,
  listUnresolvedWeakItemIds,
  listWeakItemIds,
  listWrongQuestions,
  mapRepairDisplayIndexToOriginal,
  normalizeChapterQuizRepr,
  openChapterQuizInSidePanel,
  parseChapterQuizQuestions,
  parseOptionalQuestionFeedback,
  parseQuizBlockIdFromViewArgs,
  quizOptionLetter,
  requireQuizCardSourceBlockId,
  resetQuizSourceSidePanelCacheForTests,
  resolveDisplayedOptionIndices,
  resolveQuestionFeedbackDisplay,
  resolveQuizBlockIdForPanel,
  resolveQuizKeyboardDecision,
  toPlainJsonValue,
  type ChapterQuizFirstCategory,
  type ChapterQuizQuestion,
  type ChapterQuizRepr
} from "./chapterQuiz"
import { mergeQuestionCardAdds } from "./chapterQuizLive"

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

// ── P1 learning loop: classification / repair / feedback / keyboard ──

const loopQs: ChapterQuizQuestion[] = [
  {
    id: "q0",
    text: "Q0",
    options: ["a", "b", "c", "d"],
    correctIndex: 1,
    explanation: "e0"
  },
  {
    id: "q1",
    text: "Q1",
    options: ["a", "b", "c", "d"],
    correctIndex: 0,
    explanation: "e1"
  },
  {
    id: "q2",
    text: "Q2",
    options: ["a", "b", "c", "d"],
    correctIndex: 2,
    explanation: "e2"
  },
  {
    id: "q3",
    text: "Q3",
    options: ["a", "b", "c", "d"],
    correctIndex: 3,
    explanation: "e3"
  }
]

describe("first-round classification", () => {
  it("classifies certain / uncertain / wrong / skipped as disjoint", () => {
    expect(
      classifyFirstRoundAnswer({ correct: true, uncertain: false, skipped: false })
    ).toBe("certain_correct")
    expect(
      classifyFirstRoundAnswer({ correct: true, uncertain: true, skipped: false })
    ).toBe("uncertain_correct")
    expect(
      classifyFirstRoundAnswer({ correct: false, uncertain: true, skipped: false })
    ).toBe("wrong")
    expect(
      classifyFirstRoundAnswer({ correct: false, uncertain: false, skipped: false })
    ).toBe("wrong")
    expect(
      classifyFirstRoundAnswer({ correct: true, uncertain: false, skipped: true })
    ).toBe("skipped")
  })

  it("lists weak items in original order and freezes Y", () => {
    const firstCategories: Record<string, ChapterQuizFirstCategory> = {
      q0: "certain_correct",
      q1: "uncertain_correct",
      q2: "wrong",
      q3: "skipped"
    }
    const weak = listWeakItemIds(loopQs, firstCategories)
    expect(weak).toEqual(["q1", "q2", "q3"])
    const counts = countFirstCategories(loopQs, firstCategories)
    expect(counts).toEqual({
      certain_correct: 1,
      uncertain_correct: 1,
      wrong: 1,
      skipped: 1
    })
    const frozen = freezeWeakItemsIfNeeded({
      type: "srs.chapter-quiz",
      pluginName: "p",
      topicBlockId: 1,
      phase: "done",
      questionCount: 4,
      questions: loopQs,
      firstCategories,
      answers: { q0: 1, q1: 0, q2: 0 },
      skipped: { q3: true }
    })
    expect(frozen.weakItemIds).toEqual(["q1", "q2", "q3"])
    // second freeze does not change
    expect(freezeWeakItemsIfNeeded(frozen).weakItemIds).toEqual(["q1", "q2", "q3"])
  })
})

describe("repair rounds", () => {
  it("freezes first result vs repair answers; tracks repaired X/Y across rounds", () => {
    const base: ChapterQuizRepr = {
      type: "srs.chapter-quiz",
      pluginName: "p",
      topicBlockId: 1,
      phase: "done",
      questionCount: 4,
      questions: loopQs,
      answers: { q0: 1, q1: 0, q2: 0 },
      revealed: { q0: true, q1: true, q2: true, q3: true },
      firstCategories: {
        q0: "certain_correct",
        q1: "uncertain_correct",
        q2: "wrong",
        q3: "skipped"
      },
      uncertainMarks: { q1: true },
      skipped: { q3: true },
      weakItemIds: ["q1", "q2", "q3"],
      repaired: {}
    }

    const round1 = buildRepairRoundState(base, "seed-r1")
    expect(round1.repairActive).toBe(true)
    expect(round1.repairQueue).toEqual(["q1", "q2", "q3"])
    // first-round answers untouched
    expect(round1.answers).toEqual(base.answers)
    expect(round1.firstCategories).toEqual(base.firstCategories)

    // repair q1 correct, q2 wrong — map via order
    const orderQ1 = round1.repairOptionOrders!.q1
    const displayCorrect1 = orderQ1.indexOf(loopQs[1].correctIndex)
    expect(displayCorrect1).toBeGreaterThanOrEqual(0)
    const origFromDisplay = mapRepairDisplayIndexToOriginal(
      displayCorrect1,
      orderQ1
    )
    expect(origFromDisplay).toBe(loopQs[1].correctIndex)

    const afterR1: ChapterQuizRepr = {
      ...round1,
      repairAnswers: {
        q1: loopQs[1].correctIndex,
        q2: 1, // wrong
        q3: 0 // wrong
      },
      repairRevealed: { q1: true, q2: true, q3: true },
      repaired: { q1: true },
      repairActive: false,
      repairQueue: [],
      repairIndex: 0
    }
    expect(countRepairedWeakItems(afterR1.weakItemIds, afterR1.repaired)).toBe(1)
    expect(listUnresolvedWeakItemIds(afterR1.weakItemIds, afterR1.repaired)).toEqual([
      "q2",
      "q3"
    ])

    const round2 = buildRepairRoundState(afterR1, "seed-r2")
    expect(round2.repairQueue).toEqual(["q2", "q3"])
    // first round still frozen
    expect(round2.answers?.q2).toBe(0)
    expect(round2.firstCategories?.q2).toBe("wrong")
  })

  it("buildRepairOptionOrder is deterministic and maps display→original", () => {
    const a = buildRepairOptionOrder(4, "q2:r1")
    const b = buildRepairOptionOrder(4, "q2:r1")
    expect(a).toEqual(b)
    expect(a).toHaveLength(4)
    expect(new Set(a).size).toBe(4)
    // identity forced away when n>1
    const isIdentity = a.every((v, i) => v === i)
    expect(isIdentity).toBe(false)
    for (let d = 0; d < a.length; d++) {
      expect(mapRepairDisplayIndexToOriginal(d, a)).toBe(a[d])
    }
  })
})

describe("normalize + targeted feedback compatibility", () => {
  it("loads old repr with only explanation and optional state", () => {
    const r = normalizeChapterQuizRepr(
      {
        type: "srs.chapter-quiz",
        phase: "done",
        pluginName: "orca-srs",
        topicBlockId: 9,
        questionCount: 2,
        questions: sampleQuestions,
        answers: { q0: 0, q1: 1 },
        revealed: { q0: true, q1: true }
      },
      { pluginName: "p", topicBlockId: 1 }
    )
    expect(r.questions).toHaveLength(2)
    expect(r.questions![0].explanation).toBeTruthy()
    expect(r.questions![0].correctReason).toBeUndefined()
    // inferred categories from answers
    expect(r.firstCategories?.q0).toBe("wrong")
    expect(r.firstCategories?.q1).toBe("certain_correct")
    expect(r.weakItemIds).toContain("q0")
  })

  it("drops malformed optional feedback fields without failing", () => {
    const parsed = parseOptionalQuestionFeedback(
      {
        correctReason: "  why right  ",
        optionExplanations: ["w0", "w1"], // wrong length
        confusion: 123,
        sourceExcerpt: "  excerpt  "
      },
      4,
      { allowSourceExcerpt: true }
    )
    expect(parsed.correctReason).toBe("why right")
    expect(parsed.optionExplanations).toBeUndefined()
    expect(parsed.confusion).toBeUndefined()
    expect(parsed.sourceExcerpt).toBe("excerpt")
  })

  it("parseChapterQuizQuestions accepts targeted feedback when aligned", () => {
    const raw = JSON.stringify({
      questions: [
        {
          text: "T",
          options: ["A", "B", "C", "D"],
          correctIndex: 1,
          explanation: "general",
          correctReason: "B is grounded",
          optionExplanations: ["not A", "", "not C", "not D"],
          confusion: "A vs B",
          sourceExcerpt: "from source",
          sourceBlockId: 10
        }
      ]
    })
    const result = parseChapterQuizQuestions(raw, 1, [10])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q = result.questions[0]
    expect(q.correctReason).toBe("B is grounded")
    expect(q.optionExplanations).toEqual(["not A", "", "not C", "not D"])
    const fb = resolveQuestionFeedbackDisplay(q, 0)
    expect(fb.correctReason).toBe("B is grounded")
    expect(fb.selectedWrongReason).toBe("not A")
    expect(fb.confusion).toBe("A vs B")
    expect(fb.sourceExcerpt).toBe("from source")
  })

  it("falls back to explanation when new fields absent", () => {
    const fb = resolveQuestionFeedbackDisplay(sampleQuestions[0], 0)
    expect(fb.correctReason).toBeNull()
    expect(fb.generalExplanation).toContain("渐进阅读")
  })
})

describe("cardAdds accounting + batch merge", () => {
  it("counts actual recorded basic/cloze ids only", () => {
    expect(countRecordedCardAdds(undefined)).toBe(0)
    expect(
      countRecordedCardAdds({
        q0: { basicBlockId: 1 },
        q1: { clozeBlockId: 2 },
        q2: { basicBlockId: 3, clozeBlockId: 4 },
        q3: {}
      })
    ).toBe(4)
  })

  it("mergeQuestionCardAdds does not overwrite earlier cards in a batch", () => {
    let cardAdds = mergeQuestionCardAdds({}, "q1", { basicBlockId: 10 })
    cardAdds = mergeQuestionCardAdds(cardAdds, "q2", { basicBlockId: 20 })
    cardAdds = mergeQuestionCardAdds(cardAdds, "q1", { clozeBlockId: 11 })
    expect(cardAdds.q1).toEqual({ basicBlockId: 10, clozeBlockId: 11 })
    expect(cardAdds.q2).toEqual({ basicBlockId: 20 })
    // failed item never merged
    expect(cardAdds.q3).toBeUndefined()
    expect(countRecordedCardAdds(cardAdds)).toBe(3)
  })
})

describe("quiz keyboard decision helper", () => {
  const base = {
    answeringAllowed: true,
    feedbackRevealed: false,
    optionCount: 4,
    focusInEditable: false,
    isComposing: false,
    hasModifier: false,
    blockAdvance: false,
    focusedOptionIndex: 1
  }

  it("maps 1-6 to select when answering allowed", () => {
    expect(resolveQuizKeyboardDecision("1", base)).toEqual({
      type: "select",
      index: 0
    })
    expect(resolveQuizKeyboardDecision("4", base)).toEqual({
      type: "select",
      index: 3
    })
    expect(resolveQuizKeyboardDecision("5", base)).toEqual({ type: "none" })
  })

  it("Enter advances only after feedback and not when blocked", () => {
    expect(
      resolveQuizKeyboardDecision("Enter", { ...base, feedbackRevealed: true })
    ).toEqual({ type: "advance" })
    expect(
      resolveQuizKeyboardDecision("Enter", {
        ...base,
        feedbackRevealed: true,
        blockAdvance: true
      })
    ).toEqual({ type: "none" })
    expect(resolveQuizKeyboardDecision("Enter", base)).toEqual({ type: "none" })
  })

  it("Arrow keys move focus; ignores editable/IME/modifiers", () => {
    expect(resolveQuizKeyboardDecision("ArrowDown", base)).toEqual({
      type: "focusOption",
      index: 2
    })
    expect(resolveQuizKeyboardDecision("ArrowUp", base)).toEqual({
      type: "focusOption",
      index: 0
    })
    expect(
      resolveQuizKeyboardDecision("1", { ...base, focusInEditable: true })
    ).toEqual({ type: "none" })
    expect(
      resolveQuizKeyboardDecision("1", { ...base, isComposing: true })
    ).toEqual({ type: "none" })
    expect(
      resolveQuizKeyboardDecision("1", { ...base, hasModifier: true })
    ).toEqual({ type: "none" })
  })
})

// ── Codex acceptance fixes ──

describe("partial reload must not freeze weak items early", () => {
  it("phase=quiz with early weak answer does not freeze weakItemIds", () => {
    const r = normalizeChapterQuizRepr(
      {
        type: "srs.chapter-quiz",
        phase: "quiz",
        pluginName: "p",
        topicBlockId: 1,
        questionCount: 4,
        questions: loopQs,
        answers: { q0: 0 }, // wrong
        revealed: { q0: true },
        firstCategories: { q0: "wrong" },
        // buggy mid-quiz freeze must be ignored
        weakItemIds: ["q0"]
      },
      { pluginName: "p", topicBlockId: 1 }
    )
    expect(r.phase).toBe("quiz")
    expect(r.weakItemIds).toEqual([])
  })

  it("after full first round, freeze contains all weak items in order", () => {
    const mid = normalizeChapterQuizRepr(
      {
        type: "srs.chapter-quiz",
        phase: "quiz",
        questions: loopQs,
        answers: { q0: 0 },
        firstCategories: { q0: "wrong" },
        weakItemIds: ["q0"]
      },
      { pluginName: "p", topicBlockId: 1 }
    )
    expect(mid.weakItemIds).toEqual([])

    const done = freezeWeakItemsIfNeeded({
      ...mid,
      phase: "done",
      answers: { q0: 0, q1: 0, q2: 0, q3: 3 },
      firstCategories: {
        q0: "wrong",
        q1: "certain_correct",
        q2: "uncertain_correct",
        q3: "certain_correct"
      },
      uncertainMarks: { q2: true },
      revealed: { q0: true, q1: true, q2: true, q3: true }
    })
    expect(done.weakItemIds).toEqual(["q0", "q2"])
  })
})

describe("malformed repair-state normalization", () => {
  it("clears repairActive with empty/unknown queue and clamps index", () => {
    const r = normalizeChapterQuizRepr(
      {
        type: "srs.chapter-quiz",
        phase: "done",
        questions: loopQs,
        answers: { q0: 0, q1: 1, q2: 0, q3: 0 },
        firstCategories: {
          q0: "wrong",
          q1: "certain_correct",
          q2: "wrong",
          q3: "skipped"
        },
        skipped: { q3: true },
        weakItemIds: ["q0", "q2", "q3"],
        repaired: { q0: true, ghost: true },
        repairActive: true,
        repairQueue: ["missing", "q0", "q0", "q2"],
        repairIndex: 99,
        repairAnswers: { q2: 1, q0: 0, ghost: 1 },
        repairRevealed: { q2: true, ghost: true },
        repairOptionOrders: {
          q2: [0, 0, 1, 2], // duplicate invalid
          q3: [3, 2, 1, 0]
        }
      },
      { pluginName: "p", topicBlockId: 1 }
    )
    // repaired only weak ids; q0 repaired so queue is unresolved only
    expect(r.repaired).toEqual({ q0: true })
    expect(r.repairActive).toBe(true)
    expect(r.repairQueue).toEqual(["q2"]) // q0 repaired filtered; missing dropped; deduped; order from weak
    expect(r.repairIndex).toBe(0)
    expect(r.repairAnswers).toEqual({ q2: 1 })
    expect(r.repairRevealed).toEqual({ q2: true })
    expect(r.repairOptionOrders?.q2).toBeUndefined() // malformed dropped
    expect(r.repairOptionOrders?.q3).toBeUndefined() // not in active queue
  })

  it("repairActive false when queue empty after validation", () => {
    const r = normalizeChapterQuizRepr(
      {
        type: "srs.chapter-quiz",
        phase: "done",
        questions: loopQs,
        firstCategories: { q0: "wrong" },
        weakItemIds: ["q0"],
        repaired: { q0: true },
        repairActive: true,
        repairQueue: ["q0"],
        repairIndex: 0
      },
      { pluginName: "p", topicBlockId: 1 }
    )
    expect(r.repairActive).toBe(false)
    expect(r.repairQueue).toEqual([])
  })
})

describe("displayed option letters after shuffle", () => {
  it("maps original correct/selected to display indices", () => {
    const order = [2, 0, 3, 1] // display 0 shows original 2, …
    const displayOptions = order.map((originalIndex, displayIndex) => ({
      displayIndex,
      originalIndex
    }))
    const r = resolveDisplayedOptionIndices(displayOptions, 1, 0)
    // correct original 1 → display index 3
    expect(r.displayedCorrectIndex).toBe(3)
    // selected original 0 → display index 1
    expect(r.displayedSelectedIndex).toBe(1)
    expect(
      formatSelectedWrongChoiceLabel({
        displayedSelectedIndex: 1,
        selectedOptionText: "optA"
      })
    ).toBe("你的选择（B. optA）")
  })
})

describe("sourceExcerpt grounding boundary", () => {
  it("drops sourceExcerpt when sourceBlockId missing or rejected", () => {
    const noId = parseChapterQuizQuestions(
      JSON.stringify({
        questions: [
          {
            text: "T",
            options: ["a", "b", "c"],
            correctIndex: 0,
            explanation: "e",
            sourceExcerpt: "should drop"
          }
        ]
      }),
      1
    )
    expect(noId.ok).toBe(true)
    if (noId.ok) expect(noId.questions[0].sourceExcerpt).toBeUndefined()

    const rejected = parseChapterQuizQuestions(
      JSON.stringify({
        questions: [
          {
            text: "T",
            options: ["a", "b", "c"],
            correctIndex: 0,
            explanation: "e",
            sourceBlockId: 999,
            sourceExcerpt: "should drop"
          }
        ]
      }),
      1,
      [1, 2, 3]
    )
    expect(rejected.ok).toBe(true)
    if (rejected.ok) {
      expect(rejected.questions[0].sourceBlockId).toBeUndefined()
      expect(rejected.questions[0].sourceExcerpt).toBeUndefined()
    }

    const ok = parseChapterQuizQuestions(
      JSON.stringify({
        questions: [
          {
            text: "T",
            options: ["a", "b", "c"],
            correctIndex: 0,
            explanation: "e",
            sourceBlockId: 2,
            sourceExcerpt: "keep me"
          }
        ]
      }),
      1,
      [2]
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.questions[0].sourceExcerpt).toBe("keep me")
  })

  it("parseOptionalQuestionFeedback requires allowSourceExcerpt", () => {
    expect(
      parseOptionalQuestionFeedback(
        { sourceExcerpt: "x" },
        3
      ).sourceExcerpt
    ).toBeUndefined()
    expect(
      parseOptionalQuestionFeedback(
        { sourceExcerpt: "x" },
        3,
        { allowSourceExcerpt: true }
      ).sourceExcerpt
    ).toBe("x")
  })
})

describe("batch cardAdds failure isolation", () => {
  it("failed item does not erase earlier successes", () => {
    let adds = applyBatchCardAddOutcome(undefined, {
      questionId: "q1",
      kind: "basic",
      ok: true,
      blockId: 10
    })
    adds = applyBatchCardAddOutcome(adds, {
      questionId: "q2",
      kind: "basic",
      ok: true,
      blockId: 20
    })
    // failure must not wipe prior
    adds = applyBatchCardAddOutcome(adds, {
      questionId: "q3",
      kind: "basic",
      ok: false
    })
    expect(adds.q1?.basicBlockId).toBe(10)
    expect(adds.q2?.basicBlockId).toBe(20)
    expect(adds.q3).toBeUndefined()
    // optimistic write then fail-remove for q2
    adds = applyBatchCardAddOutcome(
      { ...adds, q2: { basicBlockId: 20 } },
      { questionId: "q2", kind: "basic", ok: false }
    )
    expect(adds.q1?.basicBlockId).toBe(10)
    expect(adds.q2).toBeUndefined()
  })
})
