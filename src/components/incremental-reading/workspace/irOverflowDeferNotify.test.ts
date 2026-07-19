import { describe, expect, it } from "vitest"
import { mapOverflowDeferNotify } from "./irOverflowDeferNotify"

describe("mapOverflowDeferNotify", () => {
  it("no candidates → info", () => {
    expect(mapOverflowDeferNotify({ successCount: 0, failedCount: 0 })).toEqual({
      level: "info",
      message: "当前没有需要推后的溢出卡片"
    })
  })

  it("all success → success", () => {
    expect(mapOverflowDeferNotify({ successCount: 3, failedCount: 0 })).toEqual({
      level: "success",
      message: "已推后溢出 3 张"
    })
  })

  it("partial failure → warn (not full success)", () => {
    const n = mapOverflowDeferNotify({ successCount: 2, failedCount: 1 })
    expect(n.level).toBe("warn")
    expect(n.message).toContain("部分成功")
    expect(n.message).toContain("2")
    expect(n.message).toContain("1")
  })

  it("all failed → error", () => {
    expect(mapOverflowDeferNotify({ successCount: 0, failedCount: 4 })).toEqual({
      level: "error",
      message: "溢出推后全部失败（4 张）"
    })
  })
})
