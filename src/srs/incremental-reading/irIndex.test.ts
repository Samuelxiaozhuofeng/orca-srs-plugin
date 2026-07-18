import { beforeEach, describe, expect, it } from "vitest"
import {
  loadIRIndex,
  isIRIndexFresh,
  rebuildIRIndexFromCards,
  removeIRIndexId,
  upsertIRIndexId
} from "./irIndex"

describe("irIndex", () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = new Map<string, string>()
    // @ts-expect-error test polyfill
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) }
    }
    // @ts-expect-error minimal test global
    globalThis.orca = { state: { repo: "repo-a" } }
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

  it("isolates index entries by Orca repository", () => {
    rebuildIRIndexFromCards("orca-srs", [{ id: 1, cardType: "topic" }])

    ;(globalThis as any).orca.state.repo = "repo-b"
    expect(loadIRIndex("orca-srs")).toBeNull()
    rebuildIRIndexFromCards("orca-srs", [{ id: 2, cardType: "topic" }])

    ;(globalThis as any).orca.state.repo = "repo-a"
    expect(loadIRIndex("orca-srs")?.topicIds).toEqual([1])
    expect(Array.from(store.keys()).some(key => key.includes("repo-a"))).toBe(true)
    expect(Array.from(store.keys()).some(key => key.includes("repo-b"))).toBe(true)
  })
})
