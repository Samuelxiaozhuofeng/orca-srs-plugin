import { beforeEach, describe, expect, it } from "vitest"
import {
  loadIRIndex,
  isIRIndexFresh,
  rebuildIRIndexFromCards,
  removeIRIndexId,
  upsertIRIndexId
} from "./irIndex"

describe("irIndex", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    // @ts-expect-error test polyfill
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) }
    }
  })

  it("rebuilds and updates index entries", () => {
    rebuildIRIndexFromCards("orca-srs", [
      { id: 1, cardType: "topic" },
      { id: 2, cardType: "extracts" }
    ])
    let snap = loadIRIndex("orca-srs")
    expect(snap?.topicIds).toEqual([1])
    expect(snap?.extractIds).toEqual([2])

    upsertIRIndexId("orca-srs", 3, "extracts")
    snap = loadIRIndex("orca-srs")
    expect(snap?.extractIds).toContain(3)

    removeIRIndexId("orca-srs", 2)
    snap = loadIRIndex("orca-srs")
    expect(snap?.extractIds).not.toContain(2)
  })

  it("expires an index so externally-created cards cannot stay hidden indefinitely", () => {
    const now = 1_000_000
    expect(isIRIndexFresh({ updatedAt: now, verifiedAt: now - 10, topicIds: [1], extractIds: [] }, now, 100)).toBe(true)
    expect(isIRIndexFresh({ updatedAt: now, verifiedAt: now - 101, topicIds: [1], extractIds: [] }, now, 100)).toBe(false)
    expect(isIRIndexFresh({ updatedAt: now, topicIds: [1], extractIds: [] }, now, 100)).toBe(false)
  })
})
