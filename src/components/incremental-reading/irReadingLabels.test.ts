import { describe, expect, it } from "vitest"
import { formatIRReadingSourceLabel } from "./irReadingLabels"

describe("formatIRReadingSourceLabel", () => {
  it("labels a book Topic as a chapter", () => {
    expect(formatIRReadingSourceLabel({
      cardType: "topic",
      sourceBookTitle: "计算机网络"
    })).toBe("计算机网络 · 章节")
  })

  it("labels a non-book Topic as a topic", () => {
    expect(formatIRReadingSourceLabel({
      cardType: "topic",
      sourceBookTitle: null
    })).toBe("主题")
  })

  it("uses the localized extract label", () => {
    expect(formatIRReadingSourceLabel({
      cardType: "extracts",
      sourceBookTitle: "计算机网络"
    })).toBe("计算机网络 · 摘录")
  })
})
