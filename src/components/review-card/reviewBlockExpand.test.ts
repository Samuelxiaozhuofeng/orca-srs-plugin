/**
 * 复习界面嵌入块默认展开：原笔记折叠时题目仍须可见。
 * 与 IR 阅读模式 initiallyCollapsed 回归测试同策略（源码契约，不依赖宿主 DOM）。
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const dir = dirname(fileURLToPath(import.meta.url))

function readSrc(relativePath: string): string {
  return readFileSync(join(dir, relativePath), "utf8")
}

describe("review embedded blocks default expand", () => {
  it("EmbeddedQuestionBlock forces initiallyCollapsed=false", () => {
    const src = readSrc("EmbeddedReviewBlocks.tsx")
    expect(src).toContain("className=\"srs-question-block\"")
    // 题目区与答案区都必须强制面板局部展开
    const questionSection = src.slice(
      src.indexOf("export function EmbeddedQuestionBlock"),
      src.indexOf("export function EmbeddedAnswerBlock")
    )
    expect(questionSection).toContain("initiallyCollapsed={false}")
  })

  it("EmbeddedAnswerBlock still forces initiallyCollapsed=false", () => {
    const src = readSrc("EmbeddedReviewBlocks.tsx")
    const answerSection = src.slice(src.indexOf("export function EmbeddedAnswerBlock"))
    expect(answerSection).toContain("initiallyCollapsed={false}")
  })

  it("BasicCardReviewRenderer excerpt path expands root block", () => {
    const src = readSrc("BasicCardReviewRenderer.tsx")
    expect(src).toContain("initiallyCollapsed={false}")
  })

  it("ClozeReviewBlockContent expands root block", () => {
    const src = readSrc("../ClozeReviewBlockContent.tsx")
    expect(src).toContain("initiallyCollapsed={false}")
  })
})
