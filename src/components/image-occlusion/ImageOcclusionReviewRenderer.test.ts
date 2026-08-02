/**
 * 图片遮罩复习渲染器源码契约：
 * - 评分预览同一卡片生命周期冻结 now
 * - 每图模式 + 共用可见遮罩纯函数
 * 不替代 getVisibleIoMaskRegions 等核心纯逻辑单测。
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

  it("resolves per-block mode and shared visible-mask helper; uses ReviewGradeButtons", () => {
    const source = readFileSync(
      join(dir, "ImageOcclusionReviewRenderer.tsx"),
      "utf8"
    )
    expect(source).toContain("readIoModeFromBlock")
    expect(source).toContain("resolveEffectiveIoMode")
    expect(source).toContain("getVisibleIoMaskRegions")
    expect(source).toContain("ReviewGradeButtons")
    expect(source).not.toContain("mode === \"hideAll\" ? \"全部遮罩\"")
  })
})

describe("ImageOcclusion editor controller save + interaction wiring", () => {
  it("passes reviewMode into saveImageOcclusion; uses group confirm helper", () => {
    const controller = readFileSync(
      join(dir, "useIoEditorController.ts"),
      "utf8"
    )
    const pointer = readFileSync(join(dir, "useIoEditorPointer.ts"), "utf8")
    expect(controller).toContain("reviewMode")
    expect(controller).toContain("saveImageOcclusion({")
    expect(controller).toMatch(/reviewMode\s*[,}]/)
    expect(controller).toContain("formatIoGroupConfirmMessage")
    expect(pointer).toContain("cancelIoEditorInteraction")
    expect(pointer).toContain("commitIoEditorInteraction")
  })
})
