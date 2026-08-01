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

describe("answer root renders child blocks, no card-root hiding CSS", () => {
  it("EmbeddedAnswerBlock renders the card root's child blocks, not the root itself", () => {
    const src = readSrc("EmbeddedReviewBlocks.tsx")
    const answerSection = src.slice(src.indexOf("export function EmbeddedAnswerBlock"))

    // 每个子块一个 live Block：题目区与答案区各自只渲染一份 blockId，无同 panelId 双实例
    expect(answerSection).toContain("childIds.map")
    expect(answerSection).toContain("blockId={childId}")
    expect(answerSection).not.toContain("blockId={blockId}")
  })

  it("CSS no longer hides a card root inside .srs-answer-block", () => {
    const css = readSrc("../../styles/srs-review.css")

    // 答案区不再渲染卡根整树，隐藏根 main/handle 的选择器已移除
    // （同时拦截后代选择器 `.srs-answer-block .orca-block` 形式的误伤）
    expect(css).not.toMatch(/\.srs-answer-block[\s>]*\.orca-block/)
    // 基础容器与文本选中能力保留
    expect(css).toContain(".srs-answer-block")
    expect(css).toContain(".srs-answer-block[data-orca-block-root]")
  })
})

describe("Basic showAnswer keeps single live card-root Block", () => {
  it("keeps the question live (EmbeddedQuestionBlock) when answer is shown", () => {
    const src = readSrc("BasicCardReviewRenderer.tsx")

    // 题面不再降级为静态 front 纯文本：宿主 inline 渲染（字体/页面引用/标签）始终保留
    expect(src).not.toContain("srs-question-static")
    expect(src).toContain("<EmbeddedQuestionBlock")
    // 答案区只在有子块且显示答案时挂载，与题面 live 根不冲突
    expect(src).toContain("totalChildCount > 0 && showAnswer")
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
