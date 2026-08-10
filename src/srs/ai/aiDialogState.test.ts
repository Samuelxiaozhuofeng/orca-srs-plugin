import { beforeEach, describe, expect, it, vi } from "vitest"

// aiDialogState 依赖 window.Valtio；提供最小 proxy 实现
;(globalThis as any).window = (globalThis as any).window ?? {}
;(globalThis as any).window.Valtio = { proxy: <T,>(o: T) => o }

const {
  aiDialogState,
  appendGenerationSuccess,
  applyGenerationSuccess,
  draftExclusionSummary,
  openAIDialog,
  setDialogError,
  setGenerating
} = await import("./aiDialogState")

function basic(id: string, question: string) {
  return {
    id,
    type: "basic" as const,
    question,
    answer: "答案",
    sourceQuote: "源文本片段"
  }
}

describe("draftExclusionSummary", () => {
  it("uses the question for basic cards", () => {
    expect(draftExclusionSummary(basic("draft_1", "什么是使役形？"))).toBe(
      "什么是使役形？"
    )
  })

  it("includes context for cloze cards so the target is unambiguous", () => {
    const summary = draftExclusionSummary({
      id: "draft_1",
      type: "cloze",
      text: "使役形表示让某人做某事。",
      clozeText: "让某人做某事",
      sourceQuote: "使役形表示让某人做某事。"
    })
    expect(summary).toContain("让某人做某事")
    expect(summary).toContain("使役形")
  })
})

describe("connection settings error action", () => {
  beforeEach(() => {
    openAIDialog("源文本", 1)
  })

  it("keeps the original error while marking an auth failure", () => {
    setDialogError("Invalid API key", true)

    expect(aiDialogState.errorMessage).toBe("Invalid API key")
    expect(aiDialogState.canOpenConnectionSettings).toBe(true)
  })

  it("clears the auth action for a later ordinary error or retry", () => {
    setDialogError("Invalid API key", true)
    setDialogError("请求超时")
    expect(aiDialogState.canOpenConnectionSettings).toBe(false)

    setDialogError("Invalid API key", true)
    setGenerating(true)
    expect(aiDialogState.canOpenConnectionSettings).toBe(false)
  })
})

describe("appendGenerationSuccess", () => {
  beforeEach(() => {
    openAIDialog("源文本", 1)
    applyGenerationSuccess(
      [basic("draft_1", "问题一"), basic("draft_2", "问题二")],
      [],
      0
    )
  })

  it("re-ids incoming drafts so they cannot collide with the first batch", () => {
    // 模型每批都从 draft_1 开始编号；直接 concat 会撞号导致勾选/编辑串卡
    const result = appendGenerationSuccess(
      [basic("draft_1", "问题三"), basic("draft_2", "问题四")],
      [],
      0
    )

    expect(result.added).toBe(2)
    expect(aiDialogState.drafts.map((d) => d.id)).toEqual([
      "draft_1",
      "draft_2",
      "draft_3",
      "draft_4"
    ])
    expect(new Set(aiDialogState.drafts.map((d) => d.id)).size).toBe(4)
  })

  it("keeps existing drafts and auto-selects only the new ones", () => {
    aiDialogState.selectedIds = ["draft_1"]
    appendGenerationSuccess([basic("draft_1", "问题三")], [], 0)

    expect(aiDialogState.drafts).toHaveLength(3)
    expect(aiDialogState.selectedIds).toEqual(["draft_1", "draft_3"])
  })

  it("drops duplicates of already-shown cards and reports the count", () => {
    const result = appendGenerationSuccess(
      [basic("draft_1", "  问题一  "), basic("draft_2", "问题五")],
      [],
      0
    )

    expect(result).toEqual({ added: 1, duplicates: 1 })
    expect(aiDialogState.drafts).toHaveLength(3)
    expect(aiDialogState.infoMessage).toContain("跳过 1 张与已有重复")
  })

  it("reports when a batch adds nothing at all", () => {
    const result = appendGenerationSuccess([basic("draft_1", "问题一")], [], 0)
    expect(result.added).toBe(0)
    expect(aiDialogState.infoMessage).toContain("没有新增卡片")
  })

  it("accumulates rejected and truncated counts across batches", () => {
    applyGenerationSuccess([basic("draft_1", "问题一")], [{ index: 0, reason: "x" }], 2)
    appendGenerationSuccess([basic("draft_1", "问题九")], [{ index: 1, reason: "y" }], 3)

    expect(aiDialogState.rejected).toHaveLength(2)
    expect(aiDialogState.truncatedCount).toBe(5)
  })
})

describe("appendGenerationSuccess id allocation after removal", () => {
  beforeEach(() => {
    openAIDialog("源文本", 1)
    applyGenerationSuccess(
      [
        basic("draft_1", "问题一"),
        basic("draft_2", "问题二"),
        basic("draft_3", "问题三")
      ],
      [],
      0
    )
  })

  it("does not reuse an id that a surviving draft still holds", () => {
    // 删掉第一张后 existing.length 变成 2，若按长度起编号新卡会拿到 draft_3，
    // 与幸存的 draft_3 撞号 → 编辑串卡、removeDraft 一次删两张
    aiDialogState.drafts = aiDialogState.drafts.filter((d) => d.id !== "draft_1")
    aiDialogState.selectedIds = aiDialogState.selectedIds.filter(
      (id) => id !== "draft_1"
    )

    appendGenerationSuccess([basic("draft_1", "问题四")], [], 0)

    const ids = aiDialogState.drafts.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(["draft_2", "draft_3", "draft_4"])
  })

  it("stays collision-free across repeated remove-then-append cycles", () => {
    for (let round = 0; round < 3; round += 1) {
      aiDialogState.drafts = aiDialogState.drafts.slice(1)
      appendGenerationSuccess([basic("draft_1", `补充${round}`)], [], 0)
      const ids = aiDialogState.drafts.map((d) => d.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})
