/**
 * 图片遮罩评分预览必须在同一卡片生命周期内保持稳定。
 * 源码契约测试避免依赖 Orca 的 React/Valtio 宿主运行时。
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const dir = dirname(fileURLToPath(import.meta.url))

describe("ImageOcclusionReviewRenderer grade preview", () => {
  it("uses one frozen now value for intervals and due dates", () => {
    const source = readFileSync(
      join(dir, "ImageOcclusionReviewRenderer.tsx"),
      "utf8"
    )
    const previewStart = source.indexOf("const preview = useMemo")
    const previewEnd = source.indexOf("const n = clozeNumber", previewStart)
    const previewSection = source.slice(previewStart, previewEnd)

    expect(previewStart).toBeGreaterThan(-1)
    expect(previewEnd).toBeGreaterThan(previewStart)
    expect(previewSection).toContain("const previewNow = new Date()")
    expect(previewSection).toContain(
      "previewIntervals(fullState, previewNow, pluginName)"
    )
    expect(previewSection).toContain(
      "previewDueDates(fullState, previewNow, pluginName)"
    )
    expect(previewSection).toContain("[currentKey, srsInfo, pluginName]")
    expect(previewSection).not.toContain("previewIntervals(fullState, undefined")
    expect(previewSection).not.toContain("previewDueDates(fullState, undefined")
  })
})
