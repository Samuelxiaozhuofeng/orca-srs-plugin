import { describe, expect, it, vi } from "vitest"
import {
  assertResumeSessionIdMatches,
  loadTodayLearningResume,
  parseSessionBlockId,
  parseTodayLearningResumeMarker,
  resumeMarkerHasTrustedTasks,
  writeIrTodayLearningResume,
  writeSrsTodayLearningResume,
  type TodayLearningResumeMarker,
  type TodayLearningResumeStorageApi
} from "./todayLearningResumeStorage"

function memoryStorage(
  initial: Record<string, unknown> = {}
): TodayLearningResumeStorageApi & { store: Record<string, unknown> } {
  const store = { ...initial }
  return {
    store,
    getData: async (_p, key) => store[key] ?? null,
    setData: async (_p, key, value) => {
      store[key] = value
    }
  }
}

describe("parseSessionBlockId", () => {
  it("accepts finite positive integers only", () => {
    expect(parseSessionBlockId(42)).toEqual({ ok: true, blockId: 42 })
    expect(parseSessionBlockId("42").ok).toBe(false)
    expect(parseSessionBlockId(NaN).ok).toBe(false)
    expect(parseSessionBlockId(Infinity).ok).toBe(false)
    expect(parseSessionBlockId(-1).ok).toBe(false)
    expect(parseSessionBlockId(0).ok).toBe(false)
    expect(parseSessionBlockId(1.5).ok).toBe(false)
  })
})

describe("assertResumeSessionIdMatches", () => {
  it("fail-closed on mismatch or empty", () => {
    expect(assertResumeSessionIdMatches("a", "a")).toEqual({ ok: true })
    expect(assertResumeSessionIdMatches("a", "b").ok).toBe(false)
    expect(assertResumeSessionIdMatches("", "b").ok).toBe(false)
  })
})

describe("resumeMarkerHasTrustedTasks", () => {
  const base = {
    version: 1,
    repo: "repo-a",
    pluginName: "orca-srs",
    dateKey: "2026-01-10",
    updatedAt: 1000
  } as const
  const srsMarker: TodayLearningResumeMarker = {
    ...base,
    kind: "srs",
    sessionBlockId: 42,
    sessionId: "session-a"
  }
  const irMarker: TodayLearningResumeMarker = {
    ...base,
    kind: "ir",
    sessionLaunchMode: "mixed"
  }

  it("requires trusted remaining work for the marker kind", () => {
    expect(resumeMarkerHasTrustedTasks(srsMarker, { srs: 1, ir: 0 })).toBe(true)
    expect(resumeMarkerHasTrustedTasks(irMarker, { srs: 0, ir: 1 })).toBe(true)
    expect(resumeMarkerHasTrustedTasks(srsMarker, { srs: 0, ir: 5 })).toBe(false)
    // 统一 ir marker：纯 SRS 剩余也够继续
    expect(resumeMarkerHasTrustedTasks(irMarker, { srs: 5, ir: 0 })).toBe(true)
  })

  it("accepts a single exact positive side on unified ir markers", () => {
    expect(resumeMarkerHasTrustedTasks(irMarker, { ir: 3 })).toBe(true)
    expect(resumeMarkerHasTrustedTasks(irMarker, { srs: 2 })).toBe(true)
    expect(resumeMarkerHasTrustedTasks(irMarker, { ir: 0, srs: 0 })).toBe(false)
  })

  it("rejects missing marker; srs marker still needs trusted srs remaining", () => {
    expect(resumeMarkerHasTrustedTasks(null, { srs: 1, ir: 1 })).toBe(false)
    expect(resumeMarkerHasTrustedTasks(srsMarker, { ir: 1 })).toBe(false)
    expect(resumeMarkerHasTrustedTasks(srsMarker, { srs: 0, ir: 5 })).toBe(false)
  })
})

describe("parseTodayLearningResumeMarker", () => {
  it("parses valid srs marker", () => {
    const parsed = parseTodayLearningResumeMarker({
      version: 1,
      repo: "my-repo",
      pluginName: "orca-srs",
      dateKey: "2026-01-10",
      kind: "srs",
      updatedAt: 1000,
      sessionBlockId: 42,
      sessionId: "sess-1"
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.marker.kind).toBe("srs")
      if (parsed.marker.kind === "srs") {
        expect(parsed.marker.sessionBlockId).toBe(42)
      }
    }
  })

  it("rejects corrupt JSON / unknown version / fixed kind", () => {
    expect(parseTodayLearningResumeMarker("{not-json").ok).toBe(false)
    expect(
      parseTodayLearningResumeMarker({
        version: 99,
        repo: "r",
        pluginName: "p",
        dateKey: "2026-01-10",
        kind: "srs",
        updatedAt: 1,
        sessionBlockId: 1,
        sessionId: "x"
      }).ok
    ).toBe(false)
    expect(
      parseTodayLearningResumeMarker({
        version: 1,
        repo: "r",
        pluginName: "p",
        dateKey: "2026-01-10",
        kind: "fixed",
        updatedAt: 1
      }).ok
    ).toBe(false)
  })

  it("ignores a legacy timeBudgetMinutes field on stored IR markers", () => {
    const parsed = parseTodayLearningResumeMarker({
      version: 1,
      repo: "r",
      pluginName: "p",
      dateKey: "2026-01-10",
      kind: "ir",
      updatedAt: 1,
      timeBudgetMinutes: 25,
      sessionLaunchMode: "mixed"
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.marker.kind).toBe("ir")
      expect("timeBudgetMinutes" in parsed.marker).toBe(false)
    }
  })

  it("still rejects an IR marker with a non-mixed launch mode", () => {
    const parsed = parseTodayLearningResumeMarker({
      version: 1,
      repo: "r",
      pluginName: "p",
      dateKey: "2026-01-10",
      kind: "ir",
      updatedAt: 1,
      sessionLaunchMode: "read-only"
    })
    expect(parsed.ok).toBe(false)
  })

  it("rejects string/NaN/Infinity sessionBlockId", () => {
    const base = {
      version: 1 as const,
      repo: "r",
      pluginName: "p",
      dateKey: "2026-01-10",
      kind: "srs" as const,
      updatedAt: 1,
      sessionId: "x"
    }
    expect(
      parseTodayLearningResumeMarker({ ...base, sessionBlockId: "42" }).ok
    ).toBe(false)
    expect(
      parseTodayLearningResumeMarker({ ...base, sessionBlockId: NaN }).ok
    ).toBe(false)
    expect(
      parseTodayLearningResumeMarker({ ...base, sessionBlockId: Infinity }).ok
    ).toBe(false)
  })
})

describe("loadTodayLearningResume", () => {
  const now = new Date(2026, 0, 10, 15, 0, 0)

  it("absent when no data", async () => {
    const storage = memoryStorage()
    const result = await loadTodayLearningResume({
      pluginName: "orca-srs",
      repo: "repo-a",
      now,
      storage
    })
    expect(result).toEqual({ status: "absent" })
  })

  it("ok for same-day valid marker", async () => {
    const storage = memoryStorage()
    await writeSrsTodayLearningResume({
      pluginName: "orca-srs",
      sessionBlockId: 9,
      sessionId: "abc",
      repo: "repo-a",
      now,
      storage
    })
    const result = await loadTodayLearningResume({
      pluginName: "orca-srs",
      repo: "repo-a",
      now,
      storage
    })
    expect(result.status).toBe("ok")
    if (result.status === "ok") {
      expect(result.marker.kind).toBe("srs")
    }
  })

  it("stale across local day (not continue, not deleted)", async () => {
    const storage = memoryStorage()
    await writeIrTodayLearningResume({
      pluginName: "orca-srs",
      repo: "repo-a",
      now: new Date(2026, 0, 9, 12),
      storage
    })
    const result = await loadTodayLearningResume({
      pluginName: "orca-srs",
      repo: "repo-a",
      now,
      storage
    })
    expect(result.status).toBe("stale")
    // 数据仍在
    expect(storage.store["today-learning-resume"]).toBeTruthy()
  })

  it("error on corrupt data — distinct from absent", async () => {
    const storage = memoryStorage({
      "today-learning-resume": "{broken"
    })
    const result = await loadTodayLearningResume({
      pluginName: "orca-srs",
      repo: "repo-a",
      now,
      storage
    })
    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error.message).toMatch(/JSON|解析/)
    }
  })

  it("error when getData fails", async () => {
    const storage: TodayLearningResumeStorageApi = {
      getData: async () => {
        throw new Error("getData down")
      },
      setData: async () => undefined
    }
    const result = await loadTodayLearningResume({
      pluginName: "orca-srs",
      repo: "repo-a",
      now,
      storage
    })
    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error.message).toContain("getData down")
    }
  })

  it("error when setData fails on write", async () => {
    const storage: TodayLearningResumeStorageApi = {
      getData: async () => null,
      setData: async () => {
        throw new Error("setData full")
      }
    }
    const result = await writeSrsTodayLearningResume({
      pluginName: "orca-srs",
      sessionBlockId: 1,
      sessionId: "s",
      repo: "repo-a",
      now,
      storage
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain("setData full")
  })

  it("writeIr stores a mixed marker without any time box", async () => {
    const storage = memoryStorage()
    const result = await writeIrTodayLearningResume({
      pluginName: "orca-srs",
      repo: "repo-a",
      now,
      storage
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.marker.kind).toBe("ir")
      expect("timeBudgetMinutes" in result.marker).toBe(false)
    }
    expect(storage.store["today-learning-resume"]).toBeTruthy()
  })
})
