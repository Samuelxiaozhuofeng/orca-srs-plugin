import { describe, expect, it } from "vitest"
import {
  allocateLocalDraftId,
  extractJsonText,
  isContiguousExcerpt,
  isSourceQuoteGrounded,
  minSourceQuoteLength,
  parseAndValidateDrafts,
  validateEditableDraft
} from "./aiDraftParseValidate"

const SOURCE_ZH =
  "使役形（～させる）表示让某人做某事。加上ない表示不让/不准某人做某事。"

const SOURCE_EN =
  "Photosynthesis converts light energy into chemical energy stored in glucose."

describe("extractJsonText", () => {
  it("accepts pure JSON", () => {
    expect(extractJsonText('{"cards":[]}')).toBe('{"cards":[]}')
  })

  it("accepts a single fenced JSON block", () => {
    const raw = '```json\n{"cards":[]}\n```'
    expect(extractJsonText(raw)).toBe('{"cards":[]}')
  })

  it("rejects non-json prose without a fence", () => {
    expect(extractJsonText("here is no json")).toBeNull()
  })
})

describe("local draft identity", () => {
  it("assigns distinct local IDs when two valid cards share model id c1", () => {
    const quote = "使役形（～させる）表示让某人做某事"
    const raw = JSON.stringify({
      cards: [
        {
          id: "c1",
          type: "basic",
          question: "使役形表示什么？",
          answer: "让某人做某事",
          sourceQuote: quote
        },
        {
          id: "c1",
          type: "basic",
          question: "ない加在使役形后表示什么？",
          answer: "不让/不准某人做某事",
          sourceQuote: "加上ない表示不让/不准某人做某事"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 5)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(2)
    expect(result.cards[0].id).toBe("draft_1")
    expect(result.cards[1].id).toBe("draft_2")
    expect(result.cards[0].id).not.toBe(result.cards[1].id)
    expect(allocateLocalDraftId(0)).toBe("draft_1")
  })
})

describe("parseAndValidateDrafts grounding", () => {
  it("accepts valid Basic Chinese JSON", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "b1",
          type: "basic",
          question: "使役形～させる表示什么？",
          answer: "让某人做某事",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].id).toBe("draft_1")
    expect(result.rejected).toHaveLength(0)
  })

  it("accepts valid Basic English JSON", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "e1",
          type: "basic",
          question: "What does photosynthesis convert light into?",
          answer: "chemical energy stored in glucose",
          sourceQuote:
            "Photosynthesis converts light energy into chemical energy stored in glucose."
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_EN, "basic", 3)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards[0].type).toBe("basic")
  })

  it("accepts valid Cloze JSON when text is a source excerpt", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "c1",
          type: "cloze",
          text: "使役形（～させる）表示让某人做某事。",
          clozeText: "～させる",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "cloze", 3)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards[0]).toMatchObject({
      type: "cloze",
      clozeText: "～させる"
    })
  })

  it("accepts fenced JSON", () => {
    const raw = `\`\`\`json
{
  "cards": [
    {
      "id": "b1",
      "type": "basic",
      "question": "ない加在使役形后表示什么？",
      "answer": "不让/不准某人做某事",
      "sourceQuote": "加上ない表示不让/不准某人做某事"
    }
  ]
}
\`\`\``

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
  })

  it("fails on malformed response", () => {
    const result = parseAndValidateDrafts("not json at all", SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("PARSE_ERROR")
  })

  it("rejects unrelated Basic question/answer with one-character real quote", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "bad",
          type: "basic",
          question: "What is the capital of Mars?",
          answer: "Olympus City",
          sourceQuote: "使"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("NO_VALID_CARDS")
    const reasons = (result.rejected ?? []).map(r => r.reason).join(" ")
    expect(reasons).toMatch(/过短|answer/)
  })

  it("rejects Basic when answer is absent from sourceQuote", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "b1",
          type: "basic",
          question: "使役形表示什么？",
          answer: "完全编造的答案内容",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0]?.reason).toMatch(/answer/)
  })

  it("rejects invented Cloze text even with a real sourceQuote", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "c1",
          type: "cloze",
          text: "火星上的使役形完全是编造的句子",
          clozeText: "使役形",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "cloze", 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0]?.reason).toMatch(/摘录|text/)
  })

  it("rejects sourceQuote not grounded in source", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "b1",
          type: "basic",
          question: "Q",
          answer: "这段话完全不在源文本里",
          sourceQuote: "这段话完全不在源文本里"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0]?.reason).toMatch(/sourceQuote/)
  })

  it("rejects clozeText missing from text", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "c1",
          type: "cloze",
          text: "使役形（～させる）表示让某人做某事。",
          clozeText: "完全不存在的词",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "cloze", 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0]?.reason).toMatch(/clozeText/)
  })

  it("removes duplicate drafts", () => {
    const card = {
      id: "b1",
      type: "basic",
      question: "使役形～させる表示什么？",
      answer: "让某人做某事",
      sourceQuote: "使役形（～させる）表示让某人做某事"
    }
    const raw = JSON.stringify({
      cards: [card, { ...card, id: "b2" }]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 5)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
    expect(result.rejected.some(r => r.reason.includes("重复"))).toBe(true)
  })

  it("enforces max-card limit without putting truncated cards in rejected", () => {
    const cards = [1, 2, 3, 4].map(i => ({
      id: `b${i}`,
      type: "basic",
      question: `问题 ${i}：使役形`,
      answer: "让某人做某事",
      sourceQuote: "使役形（～させる）表示让某人做某事"
    }))
    // Make questions unique so they are not deduped
    cards[1].question = "问题 2：使役形用法"
    cards[2].question = "问题 3：使役形意义"
    cards[3].question = "问题 4：使役形扩展"
    // Answers must be in sourceQuote — use same valid answer/quote
    const raw = JSON.stringify({ cards })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(3)
    expect(result.truncatedCount).toBe(1)
    expect(result.rejected.some(r => r.reason.includes("最大张数"))).toBe(false)
    expect(result.rejected).toHaveLength(0)
  })

  it("keeps valid cards and reports rejected items on partial invalid response", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "ok",
          type: "basic",
          question: "使役形表示什么？",
          answer: "让某人做某事",
          sourceQuote: "使役形（～させる）表示让某人做某事"
        },
        {
          id: "bad",
          type: "basic",
          question: "外来知识？",
          answer: "不在源中",
          sourceQuote: "火星上有水"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 5)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].id).toBe("draft_1")
    expect(result.rejected).toHaveLength(1)
  })

  it("returns a visible failure contract when zero valid cards remain", () => {
    const raw = JSON.stringify({
      cards: [
        {
          id: "bad",
          type: "basic",
          question: "",
          answer: "x",
          sourceQuote: "使役形（～させる）"
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, "basic", 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.code).toBe("NO_VALID_CARDS")
    expect(result.error.message.length).toBeGreaterThan(0)
    expect(result.rejected?.length).toBeGreaterThan(0)
  })
})

describe("grounding helpers", () => {
  it("normalizes whitespace for sourceQuote containment", () => {
    expect(isSourceQuoteGrounded("hello   world", "hello world")).toBe(true)
  })

  it("computes min quote length as min(8, source length)", () => {
    expect(minSourceQuoteLength("abc")).toBe(3)
    expect(minSourceQuoteLength(SOURCE_ZH)).toBe(8)
  })

  it("detects contiguous excerpts", () => {
    expect(isContiguousExcerpt(SOURCE_ZH, "让某人做某事")).toBe(true)
    expect(isContiguousExcerpt(SOURCE_ZH, "编造内容")).toBe(false)
  })
})

describe("validateEditableDraft", () => {
  it("blocks cloze save when clozeText is absent from text", () => {
    const err = validateEditableDraft(
      {
        id: "c1",
        type: "cloze",
        text: "abc",
        clozeText: "zzz",
        sourceQuote: "使役形（～させる）"
      },
      SOURCE_ZH
    )
    expect(err).toMatch(/挖空文本/)
  })

  it("allows user-edited answer not in sourceQuote if structure and quote are ok", () => {
    const err = validateEditableDraft(
      {
        id: "b1",
        type: "basic",
        question: "自定义问题",
        answer: "用户改写的答案",
        sourceQuote: "使役形（～させる）表示让某人做某事"
      },
      SOURCE_ZH
    )
    expect(err).toBeNull()
  })
})
