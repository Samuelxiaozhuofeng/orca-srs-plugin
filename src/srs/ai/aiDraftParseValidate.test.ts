import { describe, expect, it } from "vitest"
import {
  allocateLocalDraftId,
  extractJsonText,
  isContiguousExcerpt,
  isSourceQuoteGrounded,
  minSourceQuoteLength,
  normalizeForGrounding,
  parseAndValidateDrafts,
  stripMarkdownLinks,
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 5)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_EN, ["basic"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["cloze"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 3)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
  })

  it("fails on malformed response", () => {
    const result = parseAndValidateDrafts("not json at all", SOURCE_ZH, ["basic"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["cloze"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 3)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0]?.reason).toMatch(/sourceQuote/)
  })

  it("accepts plain-text sourceQuote when source uses Markdown links (wiki paste)", () => {
    const SOURCE_MD =
      "Love encompasses a range of strong and positive emotional and [mental states](https://en.wikipedia.org/wiki/Mental_states), from the most sublime [virtue](https://en.wikipedia.org/wiki/Virtue) or good habit, the deepest [interpersonal](https://en.wikipedia.org/wiki/Interpersonal_relationship) [affection](https://en.wikipedia.org/wiki/Affection), to the simplest pleasure.[1] An example of this range of meanings is that the love of a mother differs from the love of a [spouse](https://en.wikipedia.org/wiki/Spouse), which differs from the love for [food](https://en.wikipedia.org/wiki/Food). Most commonly, love refers to a feeling of strong attraction and emotional [attachment](https://en.wikipedia.org/wiki/Attachment_(psychology)).[2]"

    // Model typically returns visible labels without [label](url) and drops [1]/[2]
    const plainQuote =
      "Most commonly, love refers to a feeling of strong attraction and emotional attachment."
    const plainAnswer = "strong attraction and emotional attachment"

    expect(isSourceQuoteGrounded(SOURCE_MD, plainQuote)).toBe(true)
    expect(isContiguousExcerpt(plainQuote, plainAnswer)).toBe(true)

    const raw = JSON.stringify({
      cards: [
        {
          id: "b1",
          type: "basic",
          question: "What does love most commonly refer to?",
          answer: plainAnswer,
          sourceQuote: plainQuote
        }
      ]
    })

    const result = parseAndValidateDrafts(raw, SOURCE_MD, ["basic"], 3)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]).toMatchObject({
      type: "basic",
      answer: plainAnswer,
      sourceQuote: plainQuote
    })
  })

  it("accepts cloze plain excerpt against Markdown-linked source", () => {
    const SOURCE_MD =
      "from the most sublime [virtue](https://en.wikipedia.org/wiki/Virtue) or good habit"
    const raw = JSON.stringify({
      cards: [
        {
          id: "c1",
          type: "cloze",
          text: "from the most sublime virtue or good habit",
          clozeText: "virtue",
          sourceQuote: "from the most sublime virtue or good habit"
        }
      ]
    })
    const result = parseAndValidateDrafts(raw, SOURCE_MD, ["cloze"], 3)
    expect(result.success).toBe(true)
  })

  it("stripMarkdownLinks handles Wikipedia parentheses in URL", () => {
    const s =
      "emotional [attachment](https://en.wikipedia.org/wiki/Attachment_(psychology)).[2]"
    expect(stripMarkdownLinks(s)).toBe("emotional attachment.[2]")
    expect(normalizeForGrounding(s)).toBe("emotional attachment.")
  })

  it("still rejects invented plain text that is not in the source", () => {
    const SOURCE_MD =
      "Love encompasses a range of strong and positive emotional and [mental states](https://en.wikipedia.org/wiki/Mental_states)."
    const raw = JSON.stringify({
      cards: [
        {
          id: "b1",
          type: "basic",
          question: "Q",
          answer: "completely fabricated answer text",
          sourceQuote: "completely fabricated answer text that is long enough"
        }
      ]
    })
    const result = parseAndValidateDrafts(raw, SOURCE_MD, ["basic"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["cloze"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 5)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 3)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 5)
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

    const result = parseAndValidateDrafts(raw, SOURCE_ZH, ["basic"], 3)
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

describe("choice card validation", () => {
  const SOURCE =
    "光合作用发生在叶绿体中，需要光照、二氧化碳和水，产物是葡萄糖和氧气。"

  function choicePayload(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      cards: [
        {
          type: "choice",
          question: "光合作用发生在细胞的哪个结构中？",
          options: [
            { text: "叶绿体", correct: true },
            { text: "线粒体", correct: false },
            { text: "高尔基体", correct: false }
          ],
          sourceQuote: "光合作用发生在叶绿体中",
          ...overrides
        }
      ]
    })
  }

  it("accepts a well-formed choice card", () => {
    const result = parseAndValidateDrafts(
      choicePayload(),
      SOURCE,
      ["choice"],
      5
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    const card = result.cards[0]
    expect(card.type).toBe("choice")
    if (card.type !== "choice") return
    expect(card.options).toHaveLength(3)
    expect(card.options.filter((o) => o.correct)).toHaveLength(1)
    expect(card.id).toBe("draft_1")
  })

  it("allows distractors that are not present in the source", () => {
    // 干扰项由模型合成正是 MCQ 的价值所在；强求逐字摘录会毁掉卡片
    const result = parseAndValidateDrafts(
      choicePayload(),
      SOURCE,
      ["choice"],
      5
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    const card = result.cards[0]
    if (card.type !== "choice") return
    expect(SOURCE).not.toContain("高尔基体")
    expect(card.options.map((o) => o.text)).toContain("高尔基体")
  })

  it("rejects a card with no correct option", () => {
    const result = parseAndValidateDrafts(
      choicePayload({
        options: [
          { text: "叶绿体", correct: false },
          { text: "线粒体", correct: false },
          { text: "高尔基体", correct: false }
        ]
      }),
      SOURCE,
      ["choice"],
      5
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0].reason).toContain("没有标记正确选项")
  })

  it("rejects a card where every option is correct", () => {
    // 全对等于没考点：复习时任选皆对
    const result = parseAndValidateDrafts(
      choicePayload({
        options: [
          { text: "叶绿体", correct: true },
          { text: "线粒体", correct: true },
          { text: "高尔基体", correct: true }
        ]
      }),
      SOURCE,
      ["choice"],
      5
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0].reason).toContain("所有选项都被标为正确")
  })

  it("rejects fewer than three options", () => {
    const result = parseAndValidateDrafts(
      choicePayload({
        options: [
          { text: "叶绿体", correct: true },
          { text: "线粒体", correct: false }
        ]
      }),
      SOURCE,
      ["choice"],
      5
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0].reason).toContain("选项少于 3 项")
  })

  it("rejects duplicate options", () => {
    const result = parseAndValidateDrafts(
      choicePayload({
        options: [
          { text: "叶绿体", correct: true },
          { text: " 叶绿体 ", correct: false },
          { text: "线粒体", correct: false }
        ]
      }),
      SOURCE,
      ["choice"],
      5
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0].reason).toContain("存在重复选项")
  })

  it("still requires a grounded sourceQuote", () => {
    const result = parseAndValidateDrafts(
      choicePayload({ sourceQuote: "这段话根本不在源文本里出现过" }),
      SOURCE,
      ["choice"],
      5
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0].reason).toContain("sourceQuote 未出现在源文本中")
  })

  it("rejects a choice card when the type is not enabled", () => {
    const result = parseAndValidateDrafts(choicePayload(), SOURCE, ["basic"], 5)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0].reason).toContain("未启用选择题卡型")
  })
})

describe("mixed card types", () => {
  const SOURCE =
    "光合作用发生在叶绿体中，需要光照、二氧化碳和水，产物是葡萄糖和氧气。"

  it("routes each card by its declared type", () => {
    const payload = JSON.stringify({
      cards: [
        {
          type: "basic",
          question: "光合作用发生在哪里？",
          answer: "叶绿体",
          sourceQuote: "光合作用发生在叶绿体中"
        },
        {
          type: "choice",
          question: "下列哪项是光合作用的产物？",
          options: [
            { text: "葡萄糖", correct: true },
            { text: "乳酸", correct: false },
            { text: "尿素", correct: false }
          ],
          sourceQuote: "产物是葡萄糖和氧气"
        }
      ]
    })
    const result = parseAndValidateDrafts(
      payload,
      SOURCE,
      ["basic", "cloze", "choice"],
      5
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards.map((c) => c.type)).toEqual(["basic", "choice"])
  })

  it("rejects an untyped card when several types are allowed", () => {
    // 缺 type 时全部默认成 basic 会把 cloze/choice 悄悄误判成问答卡
    const payload = JSON.stringify({
      cards: [{ question: "无类型", answer: "叶绿体", sourceQuote: "叶绿体中" }]
    })
    const result = parseAndValidateDrafts(payload, SOURCE, ["basic", "choice"], 5)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.rejected?.[0].reason).toContain("缺少 type 字段")
  })

  it("infers the type when only one is allowed", () => {
    const payload = JSON.stringify({
      cards: [
        {
          question: "光合作用发生在哪里？",
          answer: "叶绿体",
          sourceQuote: "光合作用发生在叶绿体中"
        }
      ]
    })
    const result = parseAndValidateDrafts(payload, SOURCE, ["basic"], 5)
    expect(result.success).toBe(true)
  })

  it("treats two choice cards with the same question as duplicates", () => {
    const one = {
      type: "choice",
      question: "光合作用发生在哪里？",
      options: [
        { text: "叶绿体", correct: true },
        { text: "线粒体", correct: false },
        { text: "核糖体", correct: false }
      ],
      sourceQuote: "光合作用发生在叶绿体中"
    }
    const payload = JSON.stringify({
      cards: [
        one,
        {
          ...one,
          options: [
            { text: "叶绿体", correct: true },
            { text: "细胞核", correct: false },
            { text: "液泡", correct: false }
          ]
        }
      ]
    })
    const result = parseAndValidateDrafts(payload, SOURCE, ["choice"], 5)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.cards).toHaveLength(1)
    expect(result.rejected[0].reason).toContain("与已接受草稿重复")
  })
})

describe("sourceQuote 省略号拼接", () => {
  const SOURCE =
    "我小时候每天都看着妈妈在灶上创造奇迹。我们没什么钱，她能够把最糟糕的食材变成可口的饭菜。" +
    "后来我去了英国教书，那是另一段故事。" +
    "我喜欢做饭，因为烹饪是创造。我意识到，在厨房里做的事情和写作很像。"

  it("accepts two real passages joined by a Chinese ellipsis", () => {
    // 模型高频行为；两段各自都出自原文，接地依据成立，
    // 一律判为「未出现在源文本中」会把好卡整批打掉
    expect(
      isSourceQuoteGrounded(
        SOURCE,
        "我小时候每天都看着妈妈在灶上创造奇迹。……我喜欢做饭，因为烹饪是创造。"
      )
    ).toBe(true)
  })

  it("accepts western ellipsis forms too", () => {
    expect(
      isSourceQuoteGrounded(SOURCE, "我喜欢做饭，因为烹饪是创造。...我们没什么钱")
    ).toBe(true)
    expect(
      isSourceQuoteGrounded(SOURCE, "我喜欢做饭，因为烹饪是创造。…我们没什么钱")
    ).toBe(true)
  })

  it("still rejects when any segment is not from the source", () => {
    expect(
      isSourceQuoteGrounded(SOURCE, "我喜欢做饭，因为烹饪是创造。……他其实从不下厨。")
    ).toBe(false)
  })

  it("rejects fragment soup stitched out of a few characters", () => {
    // 放宽不能变成「用几个词拼一个假引用」
    expect(isSourceQuoteGrounded(SOURCE, "我……做……饭")).toBe(false)
  })

  it("keeps rejecting a single ungrounded span", () => {
    expect(isSourceQuoteGrounded(SOURCE, "这段话完全不在原文里出现过")).toBe(false)
  })

  it("still accepts an ordinary continuous excerpt", () => {
    expect(isSourceQuoteGrounded(SOURCE, "烹饪是创造")).toBe(true)
  })

  it("accepts a basic card whose quote is ellipsis-joined", () => {
    const payload = JSON.stringify({
      cards: [
        {
          type: "basic",
          question: "鲍曼把烹饪比作什么？",
          answer: "烹饪是创造",
          sourceQuote:
            "我小时候每天都看着妈妈在灶上创造奇迹。……我喜欢做饭，因为烹饪是创造。"
        }
      ]
    })
    const result = parseAndValidateDrafts(payload, SOURCE, ["basic"], 5)
    expect(result.success).toBe(true)
  })
})
