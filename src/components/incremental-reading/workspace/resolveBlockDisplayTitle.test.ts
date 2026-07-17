import { describe, expect, it } from "vitest"
import { resolveBlockDisplayTitle } from "./resolveBlockDisplayTitle"

describe("resolveBlockDisplayTitle", () => {
  it("优先使用 trim 后非空的 alias（页面改名后 text 仍为旧编号）", () => {
    expect(
      resolveBlockDisplayTitle({
        text: "3",
        aliases: ["THE DIRECTIONALITY OF LOGIC"]
      })
    ).toBe("THE DIRECTIONALITY OF LOGIC")
  })

  it("忽略空白 alias，回退到 text", () => {
    expect(
      resolveBlockDisplayTitle({
        text: "3",
        aliases: ["", "  ", "\t"]
      })
    ).toBe("3")
  })

  it("无 alias 时回退到 text", () => {
    expect(
      resolveBlockDisplayTitle({
        text: "Intro chapter",
        aliases: []
      })
    ).toBe("Intro chapter")
  })

  it("aliases 缺失时回退到 text", () => {
    expect(resolveBlockDisplayTitle({ text: "Only text" })).toBe("Only text")
  })

  it("text 仅空白时视为无标题", () => {
    expect(
      resolveBlockDisplayTitle({
        text: "   ",
        aliases: []
      })
    ).toBe("(无标题)")
  })

  it("无 alias 且无 text 时使用默认兜底", () => {
    expect(resolveBlockDisplayTitle({})).toBe("(无标题)")
    expect(resolveBlockDisplayTitle(null)).toBe("(无标题)")
    expect(resolveBlockDisplayTitle(undefined)).toBe("(无标题)")
  })

  it("无有效值时使用自定义兜底", () => {
    expect(resolveBlockDisplayTitle(null, "(#9830)")).toBe("(#9830)")
    expect(resolveBlockDisplayTitle({ text: "", aliases: [] }, "")).toBe("")
  })

  it("取第一个非空 alias（trim 后）", () => {
    expect(
      resolveBlockDisplayTitle({
        text: "old",
        aliases: ["  ", " First Title ", "Second"]
      })
    ).toBe("First Title")
  })
})
