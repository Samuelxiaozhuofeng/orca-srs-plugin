import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { IR_SESSION_COMPLETE_TITLE } from "./irSessionSummaryCopy"

describe("IR session summary copy", () => {
  it("uses 今日学习完毕 as the completion title constant", () => {
    expect(IR_SESSION_COMPLETE_TITLE).toBe("今日学习完毕")
  })

  it("IRSessionSummary renders the new title and no legacy subtitle", () => {
    const src = readFileSync(
      resolve(__dirname, "IRSessionSummary.tsx"),
      "utf8"
    )
    expect(src).toContain("IR_SESSION_COMPLETE_TITLE")
    expect(src).not.toContain("专注阅读结束")
    expect(src).not.toContain("本次渐进阅读会话已顺利完成")
    expect(src).not.toContain("ir-session-summary__subtitle")
  })

  it("IRReadingPane passes initiallyCollapsed=false in reading mode", () => {
    const src = readFileSync(
      resolve(__dirname, "IRReadingPane.tsx"),
      "utf8"
    )
    expect(src).toContain("initiallyCollapsed={viewMode === \"reading\" ? false : undefined}")
  })

  it("IRSessionShell settles session.end in an effect, not during summary render", () => {
    const src = readFileSync(
      resolve(__dirname, "IRSessionShell.tsx"),
      "utf8"
    )
    expect(src).toContain("finalizeSessionMetricsOnce")
    expect(src).toContain("commitIRSessionToDailyStats")
    // 完成页 render 不得直接 record session.end
    const summaryBranch = src.slice(src.indexOf("if (showSummary || queue.length === 0)"))
    const summaryRender = summaryBranch.slice(0, summaryBranch.indexOf("if (!currentEntry)"))
    expect(summaryRender).not.toContain('record("session.end"')
  })
})
