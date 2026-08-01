/**
 * 摘录处理建议虚拟块展示模型单测（纯 TS，不渲染 React）。
 */

import { describe, expect, it } from "vitest"
import { canShowExtractCoach, resolveExtractCoachView } from "./irExtractCoachView"

describe("canShowExtractCoach 显示门控", () => {
  it("仅 Extract + extract_focus 显示", () => {
    expect(
      canShowExtractCoach({ cardType: "extracts", mode: "extract_focus" })
    ).toBe(true)
  })

  it("Topic 不显示", () => {
    expect(
      canShowExtractCoach({ cardType: "topic", mode: "extract_focus" })
    ).toBe(false)
  })

  it("章节浏览（chapter_browse）不显示", () => {
    expect(
      canShowExtractCoach({ cardType: "extracts", mode: "chapter_browse" })
    ).toBe(false)
  })

  it("Topic + 章节浏览均不显示", () => {
    expect(
      canShowExtractCoach({ cardType: "topic", mode: "chapter_browse" })
    ).toBe(false)
  })
})

describe("resolveExtractCoachView 视图映射", () => {
  it("空 actions → done（无需加工，可继续阅读）", () => {
    const view = resolveExtractCoachView({ insight: "已足够", actions: [] })
    expect(view.status).toBe("done")
    if (view.status === "done") expect(view.insight).toBe("已足够")
  })

  it("非空 actions → ready，保留建议列表", () => {
    const view = resolveExtractCoachView({
      insight: "核心价值",
      actions: [{ kind: "question", title: "提问", detail: "自问自答" }]
    })
    expect(view.status).toBe("ready")
    if (view.status !== "ready") return
    expect(view.insight).toBe("核心价值")
    expect(view.actions).toHaveLength(1)
    expect(view.actions[0].kind).toBe("question")
  })
})
