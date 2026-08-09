/**
 * 选择题选项区：未揭晓时按 .orca-tags 容器隐藏标签 chip（真实 DOM 用 data-name）
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// 必须在 import 组件前 stub（模块顶层读 window.React / orca）
;(globalThis as any).window = {
  React: {
    useMemo: (f: () => unknown) => f(),
    useRef: (v: unknown) => ({ current: v }),
    useEffect: () => undefined
  }
}
;(globalThis as any).orca = {
  components: { Block: "block" }
}

const { buildChoiceOptionInjectedCss } = await import("./ChoiceOptionRenderer")

describe("buildChoiceOptionInjectedCss 标签隐藏", () => {
  it("未揭晓时隐藏整个 .orca-tags 容器", () => {
    const css = buildChoiceOptionInjectedCss({
      uniqueId: "choice-opt-1",
      isAnswerRevealed: false
    })
    expect(css).toMatch(
      /\[data-choice-option="choice-opt-1"\]\s+\.orca-tags\s*\{[^}]*display:\s*none\s*!important/
    )
  })

  it("揭晓后不再注入 .orca-tags 隐藏规则", () => {
    const css = buildChoiceOptionInjectedCss({
      uniqueId: "choice-opt-2",
      isAnswerRevealed: true
    })
    expect(css).not.toMatch(/\.orca-tags/)
  })

  it("不再包含任何 data-tag-name 失效选择器", () => {
    for (const revealed of [false, true]) {
      const css = buildChoiceOptionInjectedCss({
        uniqueId: "x",
        isAnswerRevealed: revealed
      })
      expect(css).not.toMatch(/data-tag-name/)
    }
  })

  it("源码实现调用 buildChoiceOptionInjectedCss，不手写 data-tag-name 枚举", () => {
    const src = readFileSync(join(__dirname, "ChoiceOptionRenderer.tsx"), "utf8")
    expect(src).toMatch(/buildChoiceOptionInjectedCss/)
    expect(src).not.toMatch(/data-tag-name/)
  })
})
