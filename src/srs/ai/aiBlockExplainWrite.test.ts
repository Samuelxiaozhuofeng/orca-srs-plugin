import { describe, it, expect } from "vitest"
import { formatTermChildText, normalizeChildText } from "./aiBlockExplainWrite"

describe("aiBlockExplainWrite helpers", () => {
  it("normalizes whitespace", () => {
    expect(normalizeChildText("  a\n\nb  ")).toBe("a b")
  })

  it("formats term lines", () => {
    expect(formatTermChildText("工作记忆", "短时缓冲")).toBe("工作记忆 — 短时缓冲")
  })
})
