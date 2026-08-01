import { describe, expect, it } from "vitest"
import {
  buildBasicCardFromQuestion,
  buildInitialQuizRepr,
  buildMinimalQuizReprShell,
  countCorrectAnswers,
  isAnswerCorrect,
  normalizeChapterQuizRepr,
  parseChapterQuizQuestions,
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
