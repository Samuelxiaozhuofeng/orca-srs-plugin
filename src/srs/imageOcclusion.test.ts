import { afterEach, describe, expect, it, vi } from "vitest"
import {
  absolutePathToFileUrl,
  applyIoVariantDeleteToCardList,
  collectImageSources,
  compactIoMaskRegions,
  chooseIoUngroupProgressKeeper,
  createRegionId,
  deleteIoRegionsByIds,
  formatIoGroupConfirmMessage,
  getIoMaskNumbers,
  getVisibleIoMaskRegions,
  groupIoRegionsToMinNumber,
  IO_MODE_PROP,
  IO_HOST_PROPERTY_NAMES,
  normalizeRect,
  parseIoMasksPayload,
  parseIoModeProperty,
  parseIoPendingSrs,
  planIoSrsNumberOps,
  readIoModeFromBlock,
  resizeIoRegionClamped,
  resolveEffectiveIoMode,
  resolveImageDisplayUrl,
  resolveRepoAssetAbsolutePath,
  serializeIoMasksPayload,
  serializeIoPendingSrs,
  translateIoRegionsClamped,
  ungroupIoFocusedGroup,
  type IoMasksPayload,
  type IoRectRegion
} from "./imageOcclusion"
import type { Block } from "../orca.d.ts"
import {
  buildCardKey,
  identityFromReviewCard
} from "./cardIdentity"
import type { ReviewCard } from "./types"
import { parseImageOcclusionMode } from "./settings/reviewSettingsSchema"

function baseSrs() {
  return {
    stability: 1,
    difficulty: 5,
    interval: 1,
    due: new Date("2026-07-13T00:00:00Z"),
    lastReviewed: null,
    reps: 0,
    lapses: 0
  }
}

describe("saveImageOcclusion number diff (pure helpers)", () => {
  it("identifies removed numbers between mask payloads", () => {
    const prev = getIoMaskNumbers({
      version: 1,
      regions: [
        { id: "a", n: 1, shape: "rect", x: 0, y: 0, w: 0.1, h: 0.1 },
        { id: "b", n: 2, shape: "rect", x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
        { id: "c", n: 3, shape: "rect", x: 0.3, y: 0.3, w: 0.1, h: 0.1 }
      ]
    })
    const next = getIoMaskNumbers({
      version: 1,
      regions: [
        { id: "a", n: 1, shape: "rect", x: 0, y: 0, w: 0.1, h: 0.1 },
        { id: "c", n: 3, shape: "rect", x: 0.3, y: 0.3, w: 0.1, h: 0.1 }
      ]
    })
    const removed = prev.filter(n => !next.includes(n))
    expect(removed).toEqual([2])
  })
})

describe("compactIoMaskRegions", () => {
  const rect = (
    id: string,
    n: number,
    x = 0.1
  ): IoRectRegion => ({
    id,
    n,
    shape: "rect",
    x,
    y: 0.1,
    w: 0.2,
    h: 0.2
  })

  it("no-op when already 1..k", () => {
    const regions = [rect("a", 1), rect("b", 2), rect("c", 2)]
    const result = compactIoMaskRegions(regions)
    expect(result.changed).toBe(false)
    expect(result.renames).toEqual([])
    expect(result.regions.map(r => r.n)).toEqual([1, 2, 2])
  })

  it("deleting c1 renumbers c2→c1", () => {
    // 模拟已删 c1 后剩余仅 c2
    const result = compactIoMaskRegions([rect("b", 2)])
    expect(result.changed).toBe(true)
    expect(result.renames).toEqual([{ from: 2, to: 1 }])
    expect(result.regions).toEqual([rect("b", 1)])
  })

  it("deleting c2 renumbers c3→c2, c4→c3", () => {
    const result = compactIoMaskRegions([
      rect("a", 1),
      rect("c", 3),
      rect("d", 4),
      rect("c2", 3) // 同号多区
    ])
    expect(result.renames).toEqual([
      { from: 3, to: 2 },
      { from: 4, to: 3 }
    ])
    expect(result.regions.map(r => ({ id: r.id, n: r.n }))).toEqual([
      { id: "a", n: 1 },
      { id: "c", n: 2 },
      { id: "d", n: 3 },
      { id: "c2", n: 2 }
    ])
    expect(getIoMaskNumbers({ version: 1, regions: result.regions })).toEqual([
      1, 2, 3
    ])
  })
})

describe("planIoSrsNumberOps (region-id progress)", () => {
  const rect = (id: string, n: number): IoRectRegion => ({
    id,
    n,
    shape: "rect",
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.2
  })

  it("delete c1 then compact: move c2→c1, c3→c2; delete 1", () => {
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("a", 1), rect("b", 2), rect("c", 3)]
    }
    // 编辑器已本地 compact：旧 b→1、旧 c→2
    const final = [rect("b", 1), rect("c", 2)]
    const ops = planIoSrsNumberOps(previous, final)
    expect(ops.deleted).toEqual([1])
    expect(ops.moves).toEqual([
      { from: 2, to: 1 },
      { from: 3, to: 2 }
    ])
    expect(ops.keep).toEqual([])
    expect(ops.created).toEqual([])
  })

  it("delete c2 then compact: keep c1, move c3→c2, c4→c3", () => {
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("a", 1), rect("b", 2), rect("c", 3), rect("d", 4)]
    }
    const final = [rect("a", 1), rect("c", 2), rect("d", 3)]
    const ops = planIoSrsNumberOps(previous, final)
    expect(ops.deleted).toEqual([2])
    expect(ops.moves).toEqual([
      { from: 3, to: 2 },
      { from: 4, to: 3 }
    ])
    expect(ops.keep).toEqual([1])
    expect(ops.created).toEqual([])
  })

  it("brand-new region ids are created; unchanged numbers kept", () => {
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("a", 1)]
    }
    const final = [rect("a", 1), rect("new", 2)]
    const ops = planIoSrsNumberOps(previous, final)
    expect(ops.deleted).toEqual([])
    expect(ops.moves).toEqual([])
    expect(ops.keep).toEqual([1])
    expect(ops.created).toEqual([2])
  })
})

describe("io pending srs + list renumber helpers", () => {
  it("serialize / parse pending round-trip", () => {
    const pending = {
      version: 1 as const,
      deleted: [2],
      moves: [
        { from: 3, to: 2 },
        { from: 4, to: 3 }
      ],
      keep: [1],
      created: [] as number[]
    }
    const parsed = parseIoPendingSrs(serializeIoPendingSrs(pending))
    expect(parsed).toEqual(pending)
  })

  it("parse pending throws on corrupt JSON", () => {
    expect(() => parseIoPendingSrs("{nope")).toThrow(/损坏|JSON/)
  })

  it("applyIoVariantDeleteToCardList maps renames once (no chain)", () => {
    const cards = [
      { id: 1, cardType: "image-occlusion", clozeNumber: 1, label: "a" },
      { id: 1, cardType: "image-occlusion", clozeNumber: 2, label: "b" },
      { id: 1, cardType: "image-occlusion", clozeNumber: 3, label: "c" },
      { id: 1, cardType: "image-occlusion", clozeNumber: 4, label: "d" },
      { id: 9, cardType: "image-occlusion", clozeNumber: 2, label: "other" }
    ]
    const next = applyIoVariantDeleteToCardList(cards, 1, 2, [
      { from: 3, to: 2 },
      { from: 4, to: 3 }
    ])
    expect(next.map(c => ({ id: c.id, n: c.clozeNumber, label: c.label }))).toEqual([
      { id: 1, n: 1, label: "a" },
      { id: 1, n: 2, label: "c" }, // was 3
      { id: 1, n: 3, label: "d" }, // was 4, not 2
      { id: 9, n: 2, label: "other" }
    ])
  })
})

describe("imageOcclusion masks", () => {
  it("normalizeRect clamps and rejects tiny boxes", () => {
    expect(normalizeRect({ x: -0.1, y: 0.2, w: 1.5, h: 0.3 })).toEqual({
      x: 0,
      y: 0.2,
      w: 1,
      h: 0.3
    })
    expect(normalizeRect({ x: 0.5, y: 0.5, w: -0.2, h: -0.1 })).toEqual({
      x: 0.3,
      y: 0.4,
      w: 0.2,
      h: 0.1
    })
    expect(normalizeRect({ x: 0.1, y: 0.1, w: 0.001, h: 0.5 }).w).toBe(0)
  })

  it("parse / serialize round-trip keeps same-number multi regions", () => {
    const payload: IoMasksPayload = {
      version: 1,
      regions: [
        {
          id: "a",
          n: 1,
          shape: "rect",
          x: 0.1,
          y: 0.1,
          w: 0.2,
          h: 0.2
        },
        {
          id: "b",
          n: 1,
          shape: "rect",
          x: 0.5,
          y: 0.5,
          w: 0.1,
          h: 0.1
        },
        {
          id: "c",
          n: 2,
          shape: "rect",
          x: 0.2,
          y: 0.6,
          w: 0.3,
          h: 0.15
        }
      ]
    }
    const json = serializeIoMasksPayload(payload)
    const parsed = parseIoMasksPayload(json)
    expect(parsed?.regions).toHaveLength(3)
    expect(getIoMaskNumbers(parsed)).toEqual([1, 2])
    expect(parsed?.regions.filter(r => r.n === 1)).toHaveLength(2)
  })

  it("parse throws on corrupt JSON", () => {
    expect(() => parseIoMasksPayload("{not-json")).toThrow(/损坏|JSON/)
  })

  it("createRegionId is non-empty", () => {
    expect(createRegionId().length).toBeGreaterThan(4)
  })
})

describe("collectImageSources", () => {
  it("finds block-repr and inline images", () => {
    const block = {
      id: 10,
      content: [
        { t: "t", v: "hello " },
        { t: "i", v: "assets/inline.png" }
      ],
      children: [],
      properties: [],
      refs: [],
      backRefs: [],
      aliases: [],
      created: new Date(),
      modified: new Date(),
      _repr: { type: "image", src: "assets/main.png" }
    } as unknown as Block

    const sources = collectImageSources(block)
    expect(sources.some(s => s.kind === "block-repr" && s.src.includes("main"))).toBe(
      true
    )
    expect(
      sources.some(s => s.kind === "inline-fragment" && s.src.includes("inline"))
    ).toBe(true)
  })
})

describe("image-occlusion card identity", () => {
  it("builds io:blockId:cN and differs from cloze", () => {
    const io = identityFromReviewCard({
      id: 42,
      front: "",
      back: "",
      srs: baseSrs(),
      isNew: true,
      deck: "Default",
      cardType: "image-occlusion",
      clozeNumber: 2
    } as ReviewCard)
    const cloze = identityFromReviewCard({
      id: 42,
      front: "",
      back: "",
      srs: baseSrs(),
      isNew: true,
      deck: "Default",
      cardType: "cloze",
      clozeNumber: 2
    } as ReviewCard)
    expect(buildCardKey(io)).toBe("io:42:c2")
    expect(buildCardKey(cloze)).toBe("cloze:42:c2")
    expect(buildCardKey(io)).not.toBe(buildCardKey(cloze))
  })
})

describe("imageOcclusion mode setting", () => {
  it("parses hideOne / hideAll / hideAllRevealAll and falls back", () => {
    expect(parseImageOcclusionMode("hideOne")).toBe("hideOne")
    expect(parseImageOcclusionMode("hideAll")).toBe("hideAll")
    expect(parseImageOcclusionMode("hideAllRevealAll")).toBe("hideAllRevealAll")
    expect(parseImageOcclusionMode("nope")).toBe("hideOne")
  })

  it("per-image mode prefers block value; illegal warns and falls back to global", () => {
    expect(parseIoModeProperty("hideAllRevealAll")).toBe("hideAllRevealAll")
    expect(parseIoModeProperty(null)).toBe(null)
    expect(parseIoModeProperty("")).toBe(null)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(parseIoModeProperty("bad")).toBe(null)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()

    expect(resolveEffectiveIoMode("hideAll", "hideOne")).toBe("hideAll")
    expect(resolveEffectiveIoMode(null, "hideAllRevealAll")).toBe(
      "hideAllRevealAll"
    )

    const block = {
      properties: [{ name: IO_MODE_PROP, value: "hideAll" }]
    } as unknown as Block
    expect(readIoModeFromBlock(block)).toBe("hideAll")
    expect(readIoModeFromBlock({ properties: [] } as unknown as Block)).toBe(
      null
    )
  })

  it("getVisibleIoMaskRegions covers three modes question/answer", () => {
    const regions: IoRectRegion[] = [
      { id: "a", n: 1, shape: "rect", x: 0, y: 0, w: 0.2, h: 0.2 },
      { id: "b", n: 2, shape: "rect", x: 0.3, y: 0.3, w: 0.2, h: 0.2 },
      { id: "c", n: 1, shape: "rect", x: 0.6, y: 0.6, w: 0.1, h: 0.1 }
    ]
    // hideOne：题面只当前，答案全揭
    expect(
      getVisibleIoMaskRegions(regions, 1, "hideOne", false).map(r => r.id)
    ).toEqual(["a", "c"])
    expect(getVisibleIoMaskRegions(regions, 1, "hideOne", true)).toEqual([])

    // hideAll：题面全遮，答案揭当前
    expect(
      getVisibleIoMaskRegions(regions, 1, "hideAll", false).map(r => r.id)
    ).toEqual(["a", "b", "c"])
    expect(
      getVisibleIoMaskRegions(regions, 1, "hideAll", true).map(r => r.id)
    ).toEqual(["b"])

    // hideAllRevealAll：题面全遮，答案全揭
    expect(
      getVisibleIoMaskRegions(regions, 2, "hideAllRevealAll", false).map(
        r => r.id
      )
    ).toEqual(["a", "b", "c"])
    expect(
      getVisibleIoMaskRegions(regions, 2, "hideAllRevealAll", true)
    ).toEqual([])
  })

  it("IO_HOST_PROPERTY_NAMES includes srs.io.mode for symmetric cleanup", () => {
    expect(IO_HOST_PROPERTY_NAMES).toContain(IO_MODE_PROP)
    expect(IO_HOST_PROPERTY_NAMES).toContain("srs.io.masks")
  })
})

describe("io region group / ungroup / move / delete (pure)", () => {
  const rect = (
    id: string,
    n: number,
    x = 0.1,
    y = 0.1,
    w = 0.2,
    h = 0.2
  ): IoRectRegion => ({ id, n, shape: "rect", x, y, w, h })

  it("group full absorption of source n; region ids kept", () => {
    // 全选 c2(b,d) 与 c3(c) → c2 目标；c3 全吸收；c1 未参与
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("a", 1), rect("b", 2), rect("c", 3), rect("d", 2)]
    }
    const result = groupIoRegionsToMinNumber(previous.regions, ["b", "c", "d"])
    expect(result.ok).toBe(true)
    expect(result.preCompactTargetN).toBe(2)
    expect(result.targetN).toBe(2)
    expect(result.movedFromNs).toEqual([3])
    expect(result.fullyAbsorbedNs).toEqual([3])
    expect(result.partialSourceNs).toEqual([])
    expect(result.targetHadUnselected).toBe(false)
    const byId = Object.fromEntries(result.regions.map(r => [r.id, r.n]))
    expect(byId).toEqual({ a: 1, b: 2, c: 2, d: 2 })
    expect(result.regions.map(r => r.id).sort()).toEqual(["a", "b", "c", "d"])

    const ops = planIoSrsNumberOps(previous, result.regions)
    expect(ops.deleted).toEqual([3])
    expect(ops.keep).toEqual([1, 2])
    expect(ops.created).toEqual([])
    const msg = formatIoGroupConfirmMessage(result)
    expect(msg).toContain("完整并入的卡 c3")
    expect(msg).not.toMatch(/仅移动了部分区域的卡 c3/)
  })

  it("group partial source: only some regions of a number selected", () => {
    // c2 有 b,d；只选 b + c1 的 a → 目标 c1；c2 部分移动，进度保留
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("a", 1), rect("b", 2), rect("d", 2), rect("e", 3)]
    }
    const result = groupIoRegionsToMinNumber(previous.regions, ["a", "b"])
    expect(result.ok).toBe(true)
    expect(result.preCompactTargetN).toBe(1)
    expect(result.movedFromNs).toEqual([2])
    expect(result.fullyAbsorbedNs).toEqual([])
    expect(result.partialSourceNs).toEqual([2])
    expect(result.targetHadUnselected).toBe(false)
    const byId = Object.fromEntries(result.regions.map(r => [r.id, r.n]))
    expect(byId).toEqual({ a: 1, b: 1, d: 2, e: 3 })
    expect(result.regions.map(r => r.id).sort()).toEqual(["a", "b", "d", "e"])

    const ops = planIoSrsNumberOps(previous, result.regions)
    expect(ops.deleted).toEqual([])
    expect(ops.keep).toEqual([1, 2, 3])
    expect(ops.created).toEqual([])
    const msg = formatIoGroupConfirmMessage(result)
    expect(msg).toContain("仅移动了部分区域的卡 c2")
    expect(msg).not.toMatch(/完整并入的卡 c2/)
    expect(msg).not.toMatch(/c2 及其进度会在保存后移除/)
  })

  it("group with unselected target regions remains on target card", () => {
    // c1 有 a,x；选 x + 全选 c2(b) → 目标 c1；a 未选仍在 c1；c2 全吸收
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("a", 1), rect("x", 1), rect("b", 2)]
    }
    const result = groupIoRegionsToMinNumber(previous.regions, ["x", "b"])
    expect(result.ok).toBe(true)
    expect(result.targetHadUnselected).toBe(true)
    expect(result.fullyAbsorbedNs).toEqual([2])
    expect(result.partialSourceNs).toEqual([])
    const byId = Object.fromEntries(result.regions.map(r => [r.id, r.n]))
    expect(byId).toEqual({ a: 1, x: 1, b: 1 })
    expect(result.regions.map(r => r.id).sort()).toEqual(["a", "b", "x"])

    const ops = planIoSrsNumberOps(previous, result.regions)
    expect(ops.deleted).toEqual([2])
    expect(ops.keep).toEqual([1])
    const msg = formatIoGroupConfirmMessage(result)
    expect(msg).toContain("未选中的区域本来就在该卡中")
    expect(msg).toContain("完整并入的卡 c2")
  })

  it("group refuses single-n selection", () => {
    const regions = [rect("a", 1), rect("b", 1)]
    const result = groupIoRegionsToMinNumber(regions, ["a", "b"])
    expect(result.ok).toBe(false)
  })

  it("ungroup keeps focus n; others get distinct new numbers; ids stable", () => {
    const regions = [rect("a", 1), rect("b", 2), rect("c", 2), rect("d", 2)]
    const result = ungroupIoFocusedGroup(regions, "c")
    expect(result.ok).toBe(true)
    expect(result.keptN).toBe(2)
    expect(result.focusRegionId).toBe("c")
    expect(result.newNumbers).toEqual([3, 4])
    const byId = Object.fromEntries(result.regions.map(r => [r.id, r.n]))
    expect(byId.c).toBe(2)
    expect(byId.a).toBe(1)
    expect(new Set([byId.b, byId.d, byId.c]).size).toBe(3)
    expect(byId.b).not.toBe(2)
    expect(byId.d).not.toBe(2)
    expect(result.regions.map(r => r.id)).toEqual(["a", "b", "c", "d"])
  })

  it("plan after ungroup: focus keeps progress, siblings created", () => {
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("a", 1), rect("b", 2), rect("c", 2)]
    }
    const ungrouped = ungroupIoFocusedGroup(previous.regions, "b")
    expect(ungrouped.ok).toBe(true)
    const ops = planIoSrsNumberOps(previous, ungrouped.regions)
    expect(ops.deleted).toEqual([])
    expect(ops.keep).toContain(1)
    expect(ops.keep).toContain(2)
    expect(ops.created.length).toBe(1)
    expect(ops.moves).toEqual([])
  })

  it("ungroup assigns progress keeper to an existing region when focus is new", () => {
    const previous: IoMasksPayload = {
      version: 1,
      regions: [rect("old-a", 1), rect("old-b", 1)]
    }
    const current = [...previous.regions, rect("new-focus", 1)]
    const keeper = chooseIoUngroupProgressKeeper(
      current,
      "new-focus",
      previous
    )
    expect(keeper.keeperRegionId).toBe("old-a")
    expect(keeper.adjustedFromFocus).toBe(true)
    expect(keeper.previousNumber).toBe(1)

    const ungrouped = ungroupIoFocusedGroup(current, keeper.keeperRegionId)
    const ops = planIoSrsNumberOps(previous, ungrouped.regions)
    expect(ungrouped.regions.find(r => r.id === "old-a")?.n).toBe(1)
    expect(ops.keep).toEqual([1])
    expect(ops.created).toHaveLength(2)
  })

  it("ungroup keeps focus for a wholly new unsaved group", () => {
    const current = [rect("new-a", 1), rect("new-b", 1)]
    expect(
      chooseIoUngroupProgressKeeper(current, "new-b", null)
    ).toEqual({
      keeperRegionId: "new-b",
      adjustedFromFocus: false,
      previousNumber: null
    })
  })

  it("translate clamps multi-select within [0,1] and keeps ids", () => {
    const regions = [
      rect("a", 1, 0.0, 0.1, 0.2, 0.2),
      rect("b", 1, 0.8, 0.1, 0.2, 0.2)
    ]
    const moved = translateIoRegionsClamped(regions, ["a", "b"], 0.5, 0)
    // dx 被右侧 b 限制为 0
    expect(moved.find(r => r.id === "a")?.x).toBe(0)
    expect(moved.find(r => r.id === "b")?.x).toBe(0.8)
    const left = translateIoRegionsClamped(regions, ["a", "b"], -0.5, 0)
    expect(left.find(r => r.id === "a")?.x).toBe(0)
    expect(left.find(r => r.id === "b")?.x).toBe(0.8)
    const up = translateIoRegionsClamped(
      [rect("a", 1, 0.1, 0.1, 0.2, 0.2)],
      ["a"],
      0.05,
      -0.05
    )
    expect(up[0]!.id).toBe("a")
    expect(up[0]!.n).toBe(1)
    expect(up[0]!.x).toBeCloseTo(0.15, 10)
    expect(up[0]!.y).toBeCloseTo(0.05, 10)
  })

  it("resize clamps and never rebuilds id", () => {
    const r = rect("x", 2, 0.1, 0.1, 0.3, 0.3)
    const next = resizeIoRegionClamped(r, "se", 0.8, 0.8)
    expect(next.id).toBe("x")
    expect(next.n).toBe(2)
    expect(next.x + next.w).toBeLessThanOrEqual(1)
    expect(next.y + next.h).toBeLessThanOrEqual(1)
    const tiny = resizeIoRegionClamped(r, "se", -0.299, -0.299)
    // 过小 → 保持原几何
    expect(tiny).toEqual(r)
  })

  it("delete multiple regions compact emptied numbers", () => {
    const regions = [rect("a", 1), rect("b", 2), rect("c", 3)]
    const result = deleteIoRegionsByIds(regions, ["a", "b"])
    expect(result.deletedIds).toEqual(["a", "b"])
    expect(result.emptiedNumbers).toEqual([1, 2])
    expect(result.regions).toEqual([rect("c", 1)])
    expect(result.renames).toEqual([{ from: 3, to: 1 }])
  })
})

describe("resolveImageDisplayUrl (repo assets)", () => {
  const g = globalThis as any
  const prevOrca = g.orca

  afterEach(() => {
    g.orca = prevOrca
  })

  it("maps ./image-xxx.png to file://{repoDir}/assets/image-xxx.png", () => {
    g.orca = {
      state: {
        repoDir: "/Users/samdagreat/Documents/orca/repos/9sxqm7gos9b9k"
      },
      utils: { getAssetPath: (p: string) => p }
    }
    const url = resolveImageDisplayUrl("./image-gjw2g1xap9i0g.png")
    expect(url).toBe(
      "file:///Users/samdagreat/Documents/orca/repos/9sxqm7gos9b9k/assets/image-gjw2g1xap9i0g.png"
    )
  })

  it("resolveRepoAssetAbsolutePath strips ./ and assets/ prefix", () => {
    g.orca = {
      state: { repoDir: "/repo" },
      utils: { getAssetPath: (p: string) => p }
    }
    expect(resolveRepoAssetAbsolutePath("./image-a.png")).toBe(
      "/repo/assets/image-a.png"
    )
    expect(resolveRepoAssetAbsolutePath("assets/image-a.png")).toBe(
      "/repo/assets/image-a.png"
    )
  })

  it("absolutePathToFileUrl encodes path segments", () => {
    expect(absolutePathToFileUrl("/tmp/foo bar.png")).toBe(
      "file:///tmp/foo%20bar.png"
    )
  })

  it("keeps https urls case-insensitively", () => {
    expect(resolveImageDisplayUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png"
    )
    expect(resolveImageDisplayUrl("HTTPS://example.com/a.png")).toBe(
      "HTTPS://example.com/a.png"
    )
  })

  it("wraps absolute filesystem paths as file://", () => {
    g.orca = { state: {}, utils: { getAssetPath: (p: string) => p } }
    expect(
      resolveImageDisplayUrl("/Users/samdagreat/Downloads/pic.png")
    ).toBe("file:///Users/samdagreat/Downloads/pic.png")
  })

  it("throws when repoDir missing for relative asset (no fake file URL)", () => {
    g.orca = { state: {}, utils: { getAssetPath: (p: string) => p } }
    expect(() => resolveImageDisplayUrl("./image-x.png")).toThrow(/repoDir|assets/)
  })
})
