/**
 * 复习界面嵌入块：默认展开 + 答案区无侵入 DOM + 显示答案时单 live 根。
 * 源码/CSS 契约测试（不依赖宿主 DOM）。
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

describe("EmbeddedAnswerBlock non-invasive DOM strategy", () => {
  it("has no MutationObserver, collapse.click, timers, or style rewrites", () => {
    const src = readSrc("EmbeddedReviewBlocks.tsx")
    const answerSection = src.slice(src.indexOf("export function EmbeddedAnswerBlock"))

    expect(answerSection).not.toContain("MutationObserver")
    expect(answerSection).not.toContain("collapse.click")
    expect(answerSection).not.toMatch(/\.click\s*\(/)
    expect(answerSection).not.toContain("setTimeout")
    expect(answerSection).not.toContain("debounceTimer")
    expect(answerSection).not.toContain(".style.")
    expect(answerSection).not.toContain("useEffect")
    expect(answerSection).not.toContain("useRef")
    expect(answerSection).toContain("className=\"srs-answer-block\"")
    expect(answerSection).toContain("initiallyCollapsed={false}")
  })

  it("question block may still use MutationObserver to strip children", () => {
    const src = readSrc("EmbeddedReviewBlocks.tsx")
    const questionSection = src.slice(
      src.indexOf("export function EmbeddedQuestionBlock"),
      src.indexOf("export function EmbeddedAnswerBlock")
    )
    expect(questionSection).toContain("MutationObserver")
    expect(questionSection).toContain("removeChildrenContainers")
  })
})

describe("answer root CSS hides only parent main/handle", () => {
  it("uses direct-child selectors for root main; does not hide all .orca-repr-main", () => {
    const css = readSrc("../../styles/srs-review.css")

    // 精确隐藏卡根父 main
    expect(css).toContain(
      ".srs-answer-block > .orca-block > .orca-repr > .orca-repr-main"
    )
    // 精确隐藏卡根 handle / collapse
    expect(css).toContain(".srs-answer-block > .orca-block > .orca-block-handle")
    expect(css).toContain(
      ".srs-answer-block > .orca-block > .orca-repr > .orca-repr-collapse"
    )
    // 子树容器可见兜底
    expect(css).toContain(".srs-answer-block > .orca-block > .orca-block-children")

    // 禁止用后代选择器把所有 main 藏掉（会误伤答案子块）
    expect(css).not.toMatch(
      /\.srs-answer-block\s+\.orca-repr-main\s*\{[^}]*display\s*:\s*none/s
    )
    expect(css).not.toMatch(
      /\.srs-answer-block\s+\.orca-block\s+\.orca-repr-main\s*\{[^}]*display\s*:\s*none/s
    )
    // 允许的直接子级选择器必须含 `>`
    const hideMainRule =
      /\.srs-answer-block\s*>\s*\.orca-block\s*>\s*\.orca-repr\s*>\s*\.orca-repr-main\s*\{[^}]*display\s*:\s*none/s
    expect(css).toMatch(hideMainRule)
  })
})

describe("Basic showAnswer uses single live card-root Block", () => {
  it("switches question to static front when answer is shown with children", () => {
    const src = readSrc("BasicCardReviewRenderer.tsx")

    expect(src).toContain("srs-question-static")
    expect(src).toContain("showAnswer && totalChildCount > 0")
    // 静态分支渲染 front，不再挂 EmbeddedQuestionBlock
    const staticBranch = src.slice(
      src.indexOf("showAnswer && totalChildCount > 0"),
      src.indexOf("isExcerptCard ?")
    )
    expect(staticBranch).toContain("{front}")
    expect(staticBranch).toContain("EmbeddedQuestionBlock")
    // 静态 true 分支在 EmbeddedQuestionBlock 的 else 之前
    const truePart = staticBranch.slice(0, staticBranch.indexOf("EmbeddedQuestionBlock"))
    expect(truePart).toContain("srs-question-static")
    expect(truePart).not.toContain("<EmbeddedQuestionBlock")
  })

  it("still mounts EmbeddedAnswerBlock only when showAnswer and has children", () => {
    const src = readSrc("BasicCardReviewRenderer.tsx")
    expect(src).toContain("totalChildCount > 0 && showAnswer")
    expect(src).toContain("<EmbeddedAnswerBlock")
  })

  it("does not alter excerpt path dual-block logic", () => {
    const src = readSrc("BasicCardReviewRenderer.tsx")
    const excerptStart = src.indexOf("isExcerptCard ?")
    const excerptSection = src.slice(excerptStart, src.indexOf("totalChildCount === 0 || showAnswer"))
    expect(excerptSection).toContain("摘录")
    expect(excerptSection).not.toContain("srs-question-static")
    expect(excerptSection).not.toContain("EmbeddedAnswerBlock")
  })
})
