/**
 * FC-03：复习日志可靠落盘
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewLogEntry } from "./types"

/** 模拟 Orca 按插件隔离的数据槽 */
function slot(pluginName: string, key: string): string {
  return `${pluginName}::${key}`
}

const mockStorage: Record<string, string> = {}

const mockOrca = {
  plugins: {
    getData: vi.fn(async (pluginName: string, key: string) => {
      return mockStorage[slot(pluginName, key)] ?? null
    }),
    setData: vi.fn(async (pluginName: string, key: string, value: string) => {
      mockStorage[slot(pluginName, key)] = value
    }),
    getDataKeys: vi.fn(async (pluginName: string) => {
      const prefix = `${pluginName}::`
      return Object.keys(mockStorage)
        .filter(k => k.startsWith(prefix))
        .map(k => k.slice(prefix.length))
    }),
    removeData: vi.fn(async (pluginName: string, key: string) => {
      delete mockStorage[slot(pluginName, key)]
    })
  }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

import {
  saveReviewLog,
  saveAndFlushReviewLog,
  flushReviewLogs,
  getAllReviewLogs,
  clearAllReviewLogs,
  clearLogCache,
  createReviewLogId,
  getPendingReviewLogCountForTests,
  getPendingReviewLogIdsForTests,
  resetReviewLogPendingStateForTests
} from "./reviewLogStorage"

const PLUGIN = "test-plugin-reliability"
const PLUGIN_B = "test-plugin-reliability-b"
const PLUGIN_A = "test-plugin-reliability-a"

function makeLog(
  id: string,
  timestamp: number,
  overrides: Partial<ReviewLogEntry> = {}
): ReviewLogEntry {
  return {
    id,
    cardId: 1,
    blockId: 1,
    cardType: "basic",
    cardKey: "basic:1",
    legacy: false,
    deckName: "Deck",
    timestamp,
    grade: "good",
    duration: 1000,
    previousInterval: 0,
    newInterval: 1,
    previousState: "new",
    newState: "learning",
    ...overrides
  }
}

function installDefaultMocks() {
  mockOrca.plugins.getData.mockImplementation(async (pluginName, key) => {
    return mockStorage[slot(pluginName, key)] ?? null
  })
  mockOrca.plugins.setData.mockImplementation(async (pluginName, key, value) => {
    mockStorage[slot(pluginName, key)] = value
  })
  mockOrca.plugins.getDataKeys.mockImplementation(async (pluginName) => {
    const prefix = `${pluginName}::`
    return Object.keys(mockStorage)
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length))
  })
  mockOrca.plugins.removeData.mockImplementation(async (pluginName, key) => {
    delete mockStorage[slot(pluginName, key)]
  })
}

async function resetAll() {
  resetReviewLogPendingStateForTests()
  clearLogCache()
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  await clearAllReviewLogs(PLUGIN)
  await clearAllReviewLogs(PLUGIN_B)
  await clearAllReviewLogs(PLUGIN_A)
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  clearLogCache()
  vi.clearAllMocks()
  installDefaultMocks()
}

describe("reviewLogStorage reliability (FC-03)", () => {
  beforeEach(async () => {
    await resetAll()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetReviewLogPendingStateForTests()
  })

  it("fake timers: 快速 save 多条，最终一次定时 flush 全部写入", async () => {
    vi.useFakeTimers()
    const base = new Date("2024-05-10T12:00:00Z").getTime()
    const logs = [
      makeLog("a", base),
      makeLog("b", base + 1),
      makeLog("c", base + 2)
    ]

    for (const log of logs) {
      await saveReviewLog(PLUGIN, log)
    }
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(3)
    expect(mockOrca.plugins.setData).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    // 等待 timer 触发的 flush 完成
    await vi.runAllTimersAsync()
    await Promise.resolve()

    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(0)
    const stored = await getAllReviewLogs(PLUGIN)
    expect(stored.map(l => l.id).sort()).toEqual(["a", "b", "c"])
  })

  it("setData 首次失败：flush reject、pending 保留；第二次成功后 pending 清空且无重复", async () => {
    const log = makeLog("fail-once", new Date("2024-05-01").getTime())
    await saveReviewLog(PLUGIN, log)

    mockOrca.plugins.setData.mockRejectedValueOnce(new Error("disk full"))
    await expect(flushReviewLogs(PLUGIN)).rejects.toThrow(/disk full|写入复习记录失败/)
    expect(getPendingReviewLogIdsForTests(PLUGIN)).toEqual(["fail-once"])
    expect(Object.keys(mockStorage)).toHaveLength(0)

    await flushReviewLogs(PLUGIN)
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(0)

    const all = await getAllReviewLogs(PLUGIN)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe("fail-once")
  })

  it("getData 失败：pending 保留，不用 [] 覆盖存储", async () => {
    const key = "reviewLogs_2024_05"
    mockStorage[slot(PLUGIN, key)] = JSON.stringify({
      version: 2,
      logs: [makeLog("existing", new Date("2024-05-05").getTime())]
    })

    const pending = makeLog("new-one", new Date("2024-05-06").getTime())
    await saveReviewLog(PLUGIN, pending)

    mockOrca.plugins.getData.mockRejectedValueOnce(new Error("network"))
    await expect(flushReviewLogs(PLUGIN)).rejects.toThrow(/getData|加载复习记录失败/)
    expect(getPendingReviewLogIdsForTests(PLUGIN)).toContain("new-one")

    // 原存储未被 [] 覆盖
    const raw = JSON.parse(mockStorage[slot(PLUGIN, key)])
    expect(raw.logs).toHaveLength(1)
    expect(raw.logs[0].id).toBe("existing")
  })

  it("JSON parse 失败：pending 保留，不用 [] 覆盖", async () => {
    const key = "reviewLogs_2024_06"
    mockStorage[slot(PLUGIN, key)] = "{not-json"

    await saveReviewLog(PLUGIN, makeLog("p1", new Date("2024-06-02").getTime()))
    clearLogCache()

    await expect(flushReviewLogs(PLUGIN)).rejects.toThrow(/JSON|解析/)
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(1)
    expect(mockStorage[slot(PLUGIN, key)]).toBe("{not-json")
  })

  it("两个并发 flush 不重复写；flush 期间新日志不丢", async () => {
    let setDataCalls = 0
    let releaseSetData: (() => void) | null = null
    const gate = new Promise<void>(resolve => {
      releaseSetData = resolve
    })

    mockOrca.plugins.setData.mockImplementation(async (pluginName, key, value) => {
      setDataCalls++
      await gate
      mockStorage[slot(pluginName, key)] = value
    })

    const t = new Date("2024-07-01").getTime()
    await saveReviewLog(PLUGIN, makeLog("c1", t))

    const flush1 = flushReviewLogs(PLUGIN)
    const flush2 = flushReviewLogs(PLUGIN)

    // 在首次 setData 阻塞期间加入新日志
    await saveReviewLog(PLUGIN, makeLog("c2", t + 1))

    releaseSetData!()
    await Promise.all([flush1, flush2])

    // 链式 drain 应写入两批；同一批不应因双 flush 重复启动无序覆盖
    const all = await getAllReviewLogs(PLUGIN)
    expect(all.map(l => l.id).sort()).toEqual(["c1", "c2"])
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(0)

    // setData 至少调用 1 次（可能 2 次：第一快照 c1，第二快照 c2）
    expect(setDataCalls).toBeGreaterThanOrEqual(1)
    expect(setDataCalls).toBeLessThanOrEqual(3)

    // 最终存储无重复 id
    const raw = Object.values(mockStorage).map(v => JSON.parse(v).logs as ReviewLogEntry[])
    const ids = raw.flat().map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("同 ID 重复 enqueue/重试最终只一条", async () => {
    const ts = new Date("2024-08-01").getTime()
    const log1 = makeLog("same-id", ts, { grade: "hard", duration: 100 })
    const log2 = makeLog("same-id", ts, { grade: "good", duration: 200 })

    await saveReviewLog(PLUGIN, log1)
    await saveReviewLog(PLUGIN, log2)
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(1)

    await flushReviewLogs(PLUGIN)
    await saveReviewLog(PLUGIN, log2)
    await flushReviewLogs(PLUGIN)

    const all = await getAllReviewLogs(PLUGIN)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe("same-id")
    expect(all[0].grade).toBe("good")
    expect(all[0].duration).toBe(200)
  })

  it("timer flush 失败被 console.error 捕获，无 unhandled rejection", async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", onUnhandled)

    mockOrca.plugins.setData.mockRejectedValue(new Error("timer fail"))
    await saveReviewLog(PLUGIN, makeLog("t1", new Date("2024-09-01").getTime()))

    await vi.advanceTimersByTimeAsync(1000)
    await vi.runAllTimersAsync()
    // 给 microtask 一点时间
    await Promise.resolve()
    await Promise.resolve()

    process.off("unhandledRejection", onUnhandled)

    expect(errorSpy).toHaveBeenCalled()
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(1)
    expect(unhandled).toHaveLength(0)

    errorSpy.mockRestore()
  })

  it("不同 pluginName pending 隔离；clear 只清本插件", async () => {
    const ts = new Date("2024-10-01").getTime()
    await saveReviewLog(PLUGIN, makeLog("pa", ts))
    await saveReviewLog(PLUGIN_B, makeLog("pb", ts + 1))

    expect(getPendingReviewLogIdsForTests(PLUGIN)).toEqual(["pa"])
    expect(getPendingReviewLogIdsForTests(PLUGIN_B)).toEqual(["pb"])

    await clearAllReviewLogs(PLUGIN)
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(0)
    expect(getPendingReviewLogIdsForTests(PLUGIN_B)).toEqual(["pb"])

    await flushReviewLogs(PLUGIN_B)
    const bLogs = await getAllReviewLogs(PLUGIN_B)
    expect(bLogs.map(l => l.id)).toEqual(["pb"])
  })

  it("saveAndFlushReviewLog 在确认落盘后 resolve；失败 pending 保留", async () => {
    const log = makeLog(
      createReviewLogId(new Date("2024-11-01").getTime(), "basic:1"),
      new Date("2024-11-01").getTime()
    )

    await saveAndFlushReviewLog(PLUGIN, log)
    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(0)
    expect((await getAllReviewLogs(PLUGIN)).map(l => l.id)).toEqual([log.id])

    mockOrca.plugins.setData.mockRejectedValueOnce(new Error("nope"))
    const log2 = makeLog("sf-fail", new Date("2024-11-02").getTime())
    await expect(saveAndFlushReviewLog(PLUGIN, log2)).rejects.toThrow()
    expect(getPendingReviewLogIdsForTests(PLUGIN)).toContain("sf-fail")
  })

  it("一个分片失败不影响其他分片成功写入；失败分片 ID 保留", async () => {
    // 预置 5 月数据使 load 走 getData；6 月为空
    const mayKey = "reviewLogs_2024_05"
    mockStorage[slot(PLUGIN, mayKey)] = JSON.stringify({ version: 2, logs: [] })

    await saveReviewLog(PLUGIN, makeLog("may", new Date("2024-05-10").getTime()))
    await saveReviewLog(PLUGIN, makeLog("jun", new Date("2024-06-10").getTime()))

    mockOrca.plugins.setData.mockImplementation(async (pluginName, key, value) => {
      if (key === mayKey) {
        throw new Error("may shard fail")
      }
      mockStorage[slot(pluginName, key)] = value
    })

    await expect(flushReviewLogs(PLUGIN)).rejects.toThrow(/may shard fail|写入/)

    expect(getPendingReviewLogIdsForTests(PLUGIN)).toContain("may")
    expect(getPendingReviewLogIdsForTests(PLUGIN)).not.toContain("jun")

    // jun 已落盘
    clearLogCache()
    installDefaultMocks()
    // 手动读取 jun 分片
    const junRaw = mockStorage[slot(PLUGIN, "reviewLogs_2024_06")]
    expect(junRaw).toBeDefined()
    expect(JSON.parse(junRaw!).logs.map((l: ReviewLogEntry) => l.id)).toEqual(["jun"])
  })

  it("plugin A/B 同月分片缓存与存储互不串写", async () => {
    const monthKey = "reviewLogs_2024_12"
    const ts = new Date("2024-12-15T10:00:00Z").getTime()

    // 各自已有不同历史日志（同 storageKey）
    mockStorage[slot(PLUGIN_A, monthKey)] = JSON.stringify({
      version: 2,
      logs: [makeLog("a-existing", ts - 1000, { deckName: "A" })]
    })
    mockStorage[slot(PLUGIN_B, monthKey)] = JSON.stringify({
      version: 2,
      logs: [makeLog("b-existing", ts - 2000, { deckName: "B" })]
    })

    // 交错 get（填充各自缓存）再 flush 新增
    await saveReviewLog(PLUGIN_A, makeLog("a-new", ts, { deckName: "A" }))
    await saveReviewLog(PLUGIN_B, makeLog("b-new", ts + 1, { deckName: "B" }))

    // A 先 flush（会 load 并缓存 A 分片）
    await flushReviewLogs(PLUGIN_A)
    // B flush 不得读到 A 的缓存
    await flushReviewLogs(PLUGIN_B)

    const aLogs = await getAllReviewLogs(PLUGIN_A)
    const bLogs = await getAllReviewLogs(PLUGIN_B)

    expect(aLogs.map(l => l.id).sort()).toEqual(["a-existing", "a-new"])
    expect(bLogs.map(l => l.id).sort()).toEqual(["b-existing", "b-new"])
    expect(aLogs.every(l => l.deckName === "A")).toBe(true)
    expect(bLogs.every(l => l.deckName === "B")).toBe(true)

    // 底层槽位也不混
    const aRaw = JSON.parse(mockStorage[slot(PLUGIN_A, monthKey)])
    const bRaw = JSON.parse(mockStorage[slot(PLUGIN_B, monthKey)])
    expect(aRaw.logs.map((l: ReviewLogEntry) => l.id).sort()).toEqual([
      "a-existing",
      "a-new"
    ])
    expect(bRaw.logs.map((l: ReviewLogEntry) => l.id).sort()).toEqual([
      "b-existing",
      "b-new"
    ])
  })

  it("flush setData 阻塞期间同 ID 更新版本不被快照成功误删", async () => {
    const ts = new Date("2024-03-20T08:00:00Z").getTime()
    let releaseSetData: (() => void) | null = null
    const gate = new Promise<void>(resolve => {
      releaseSetData = resolve
    })
    let setDataCount = 0

    mockOrca.plugins.setData.mockImplementation(async (pluginName, key, value) => {
      setDataCount++
      // 仅阻塞第一轮 setData，后续轮次立即写入
      if (setDataCount === 1) {
        await gate
      }
      mockStorage[slot(pluginName, key)] = value
    })

    const v1 = makeLog("upd-id", ts, { grade: "good", duration: 100 })
    await saveReviewLog(PLUGIN, v1)

    const flushPromise = flushReviewLogs(PLUGIN)

    // setData  defer 期间 enqueue 同 ID 新版本
    await Promise.resolve()
    const v2 = makeLog("upd-id", ts, { grade: "easy", duration: 999 })
    await saveReviewLog(PLUGIN, v2)
    // 阻塞期间 pending 应仍持有（新版本）
    expect(getPendingReviewLogIdsForTests(PLUGIN)).toContain("upd-id")

    releaseSetData!()
    await flushPromise

    expect(getPendingReviewLogCountForTests(PLUGIN)).toBe(0)
    const all = await getAllReviewLogs(PLUGIN)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe("upd-id")
    expect(all[0].grade).toBe("easy")
    expect(all[0].duration).toBe(999)
  })

  it("clearAllReviewLogs(A) 后 B 的缓存与数据读取仍正确", async () => {
    const monthKey = "reviewLogs_2024_04"
    const ts = new Date("2024-04-08").getTime()

    await saveReviewLog(PLUGIN_A, makeLog("only-a", ts, { deckName: "A" }))
    await saveReviewLog(PLUGIN_B, makeLog("only-b", ts + 1, { deckName: "B" }))
    await flushReviewLogs(PLUGIN_A)
    await flushReviewLogs(PLUGIN_B)

    // 预热 B 缓存
    const bBefore = await getAllReviewLogs(PLUGIN_B)
    expect(bBefore.map(l => l.id)).toEqual(["only-b"])

    await clearAllReviewLogs(PLUGIN_A)

    // A 已空
    expect(await getAllReviewLogs(PLUGIN_A)).toEqual([])
    // B 仍可读（缓存未误清 + 存储仍在）
    const bAfter = await getAllReviewLogs(PLUGIN_B)
    expect(bAfter).toHaveLength(1)
    expect(bAfter[0].id).toBe("only-b")
    expect(bAfter[0].deckName).toBe("B")
    expect(mockStorage[slot(PLUGIN_B, monthKey)]).toBeDefined()
    expect(mockStorage[slot(PLUGIN_A, monthKey)]).toBeUndefined()
  })
})
