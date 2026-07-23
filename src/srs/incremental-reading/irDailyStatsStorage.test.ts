/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest"
import type { IRSessionMetricsSnapshot } from "./irMetrics"
import {
  buildIRDailyStatsStorageKey,
  commitIRSessionToDailyStats,
  createEmptyIRDailyStatsRecord,
  dailyTotalsToMetricsSnapshot,
  effectiveDailyLimitForQueue,
  loadIRDailyStats,
  parseIRDailyStatsRecord,
  resolveEffectiveIRDailyLimit,
  snapshotToDailyTotals
} from "./irDailyStatsStorage"

function makeSnapshot(partial: Partial<IRSessionMetricsSnapshot> = {}): IRSessionMetricsSnapshot {
  return {
    sessionStartedAt: 1,
    sessionEndedAt: 1001,
    durationMs: 1000,
    plannedCount: 3,
    completedCount: 2,
    topicProcessed: 1,
    extractProcessed: 1,
    reviewProcessed: 0,
    itemCreated: 0,
    extractCreated: 1,
    extractSuccess: 1,
    extractFailure: 0,
    itemizeSuccess: 0,
    itemizeFailure: 0,
    postponeCount: 0,
    archiveCount: 0,
    deleteCount: 0,
    breakpointSaveSuccess: 0,
    breakpointSaveFailure: 0,
    breakpointRestoreSuccess: 0,
    breakpointRestoreFailure: 0,
    autoPostponeCount: 0,
    autoPostponeUndoCount: 0,
    queueLoadMs: null,
    queueLoadFailures: 0,
    dwellMsTotal: 0,
    dwellSamples: 0,
    ...partial
  }
}

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    }
  }
}

describe("resolveEffectiveIRDailyLimit", () => {
  it("treats configured 0 or negative as unlimited", () => {
    expect(resolveEffectiveIRDailyLimit(0, 10)).toEqual({
      kind: "unlimited",
      used: 10,
      configured: 0
    })
    expect(resolveEffectiveIRDailyLimit(-1, 3).kind).toBe("unlimited")
    expect(effectiveDailyLimitForQueue(resolveEffectiveIRDailyLimit(0, 5))).toBe(0)
  })

  it("subtracts today's completedCount from configured limit", () => {
    const mid = resolveEffectiveIRDailyLimit(30, 12)
    expect(mid).toEqual({ kind: "limited", remaining: 18, used: 12, configured: 30 })
    expect(effectiveDailyLimitForQueue(mid)).toBe(18)

    const exhausted = resolveEffectiveIRDailyLimit(30, 30)
    expect(exhausted).toEqual({ kind: "limited", remaining: 0, used: 30, configured: 30 })
    expect(effectiveDailyLimitForQueue(exhausted)).toBe(0)

    const over = resolveEffectiveIRDailyLimit(10, 99)
    expect(over.kind).toBe("limited")
    if (over.kind === "limited") expect(over.remaining).toBe(0)
  })

  it("floors non-integer inputs and clamps used to ≥0", () => {
    const r = resolveEffectiveIRDailyLimit(10.9, -3)
    expect(r).toEqual({ kind: "limited", remaining: 10, used: 0, configured: 10 })
  })
})

describe("irDailyStatsStorage", () => {
  it("isolates storage keys by repo, plugin, and date", () => {
    const a = buildIRDailyStatsStorageKey("repo-a", "orca-srs", "2026-07-19")
    const b = buildIRDailyStatsStorageKey("repo-b", "orca-srs", "2026-07-19")
    const c = buildIRDailyStatsStorageKey("repo-a", "other-plugin", "2026-07-19")
    const d = buildIRDailyStatsStorageKey("repo-a", "orca-srs", "2026-07-20")
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(a).not.toBe(d)
  })

  it("loads empty record when no key exists (empty queue path)", () => {
    const storage = memoryStorage()
    const result = loadIRDailyStats({
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fromStorage).toBe(false)
    expect(result.record.totals.completedCount).toBe(0)
    expect(result.record.committedSessionIds).toEqual([])
  })

  it("commits session once and dedupes same sessionId on re-render commit", () => {
    const storage = memoryStorage()
    const snap = makeSnapshot({ completedCount: 2, plannedCount: 3, durationMs: 60000 })
    const first = commitIRSessionToDailyStats({
      sessionId: "sess-1",
      snapshot: snap,
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.committed).toBe(true)
    expect(first.record.totals.completedCount).toBe(2)

    const second = commitIRSessionToDailyStats({
      sessionId: "sess-1",
      snapshot: snap,
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.skippedDuplicate).toBe(true)
    expect(second.committed).toBe(false)
    expect(second.record.totals.completedCount).toBe(2)
  })

  it("accumulates multiple sessions on the same day", () => {
    const storage = memoryStorage()
    commitIRSessionToDailyStats({
      sessionId: "a",
      snapshot: makeSnapshot({ completedCount: 1, plannedCount: 2, durationMs: 1000, topicProcessed: 1 }),
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    const second = commitIRSessionToDailyStats({
      sessionId: "b",
      snapshot: makeSnapshot({
        completedCount: 2,
        plannedCount: 3,
        durationMs: 2000,
        topicProcessed: 0,
        extractProcessed: 2,
        extractCreated: 1
      }),
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.record.totals.completedCount).toBe(3)
    expect(second.record.totals.plannedCount).toBe(5)
    expect(second.record.totals.durationMs).toBe(3000)
    expect(second.record.totals.topicProcessed).toBe(1)
    expect(second.record.totals.extractProcessed).toBe(3) // default 1 + 2
    expect(second.record.totals.extractCreated).toBe(2) // default 1 + 1
    expect(second.record.committedSessionIds).toEqual(["a", "b"])
  })

  it("does not mix stats across repos or dates", () => {
    const storage = memoryStorage()
    commitIRSessionToDailyStats({
      sessionId: "a",
      snapshot: makeSnapshot({ completedCount: 5 }),
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    const otherRepo = loadIRDailyStats({
      repo: "repo-b",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    expect(otherRepo.ok).toBe(true)
    if (!otherRepo.ok) return
    expect(otherRepo.record.totals.completedCount).toBe(0)

    const nextDay = loadIRDailyStats({
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-20",
      storage
    })
    expect(nextDay.ok).toBe(true)
    if (!nextDay.ok) return
    expect(nextDay.record.totals.completedCount).toBe(0)
  })

  it("surfaces parse errors for corrupt stored data", () => {
    const bad = parseIRDailyStatsRecord("{not-json")
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.error.message).toContain("JSON 解析失败")

    const missingField = parseIRDailyStatsRecord(JSON.stringify({
      version: 1,
      repo: "r",
      pluginName: "p",
      dateKey: "2026-07-19",
      totals: { durationMs: 0 },
      committedSessionIds: [],
      updatedAt: 1
    }))
    expect(missingField.ok).toBe(false)
    if (missingField.ok) return
    expect(missingField.error.message).toMatch(/totals\./)

    const key = buildIRDailyStatsStorageKey("repo-a", "orca-srs", "2026-07-19")
    const storage = memoryStorage({ [key]: "not-json" })
    const loaded = loadIRDailyStats({
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.error.message).toContain("JSON 解析失败")
    expect(loaded.record.totals.completedCount).toBe(0)
  })

  it("maps daily totals into summary metrics fields", () => {
    const record = createEmptyIRDailyStatsRecord("r", "p", "2026-07-19")
    record.totals = snapshotToDailyTotals(makeSnapshot({
      completedCount: 4,
      plannedCount: 6,
      reviewProcessed: 1,
      itemCreated: 2,
      durationMs: 120000
    }))
    const snap = dailyTotalsToMetricsSnapshot(record.totals)
    expect(snap.completedCount).toBe(4)
    expect(snap.plannedCount).toBe(6)
    expect(snap.reviewProcessed).toBe(1)
    expect(snap.itemCreated).toBe(2)
    expect(snap.durationMs).toBe(120000)
  })

  it("reports storage write failure without silent success", () => {
    const storage: Storage = {
      ...memoryStorage(),
      setItem() {
        throw new Error("quota exceeded")
      }
    }
    const result = commitIRSessionToDailyStats({
      sessionId: "s",
      snapshot: makeSnapshot(),
      repo: "repo-a",
      pluginName: "orca-srs",
      dateKey: "2026-07-19",
      storage
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain("quota exceeded")
    expect(result.committed).toBe(false)
    // 内存中的 next totals 仍可给 UI 展示当前会话
    expect(result.record.totals.completedCount).toBe(2)
  })
})
