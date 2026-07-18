import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DbId } from "../../orca.d.ts"
import {
  listRegisteredSequentialBookIds,
  loadSequentialBookRegistry,
  pruneSequentialBookIds,
  registerSequentialBookId,
  SEQUENTIAL_BOOK_REGISTRY_MAX_IDS,
  unregisterSequentialBookId
} from "./sequentialBookRegistry"

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    }
  })
  // @ts-expect-error test global
  globalThis.orca = { state: { repo: "repo-a" } }
})

describe("sequentialBookRegistry", () => {
  it("registers unique ids and isolates by repo", () => {
    registerSequentialBookId(10)
    registerSequentialBookId(20)
    registerSequentialBookId(10) // move to end, no dup
    expect(listRegisteredSequentialBookIds()).toEqual([20, 10])

    // @ts-expect-error test global
    globalThis.orca = { state: { repo: "repo-b" } }
    expect(listRegisteredSequentialBookIds()).toEqual([])
    registerSequentialBookId(99)
    expect(listRegisteredSequentialBookIds()).toEqual([99])

    // @ts-expect-error test global
    globalThis.orca = { state: { repo: "repo-a" } }
    expect(listRegisteredSequentialBookIds()).toEqual([20, 10])
  })

  it("unregisters only deliberate removals and prunes stale ids", () => {
    registerSequentialBookId(1)
    registerSequentialBookId(2)
    registerSequentialBookId(3)
    unregisterSequentialBookId(2)
    expect(listRegisteredSequentialBookIds()).toEqual([1, 3])

    pruneSequentialBookIds([1, 99] as DbId[])
    expect(listRegisteredSequentialBookIds()).toEqual([3])
  })

  it("bounds registry size by dropping oldest", () => {
    for (let i = 1; i <= SEQUENTIAL_BOOK_REGISTRY_MAX_IDS + 5; i++) {
      registerSequentialBookId(i as DbId)
    }
    const ids = listRegisteredSequentialBookIds()
    expect(ids.length).toBe(SEQUENTIAL_BOOK_REGISTRY_MAX_IDS)
    expect(ids[0]).toBe(6) // 1..5 dropped
    expect(ids[ids.length - 1]).toBe(SEQUENTIAL_BOOK_REGISTRY_MAX_IDS + 5)
    const snap = loadSequentialBookRegistry()
    expect(snap?.version).toBe(1)
  })
})
