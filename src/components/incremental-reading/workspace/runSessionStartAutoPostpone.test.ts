/**
 * 会话启动 auto-postpone 编排：当日一次守卫（⑥）、先于装配生效（⑦）、失败可见。
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IRCard } from "../../../srs/incrementalReadingCollector"

const states = new Map<number, any>()
let collected: IRCard[] = []

vi.mock("../../../srs/incrementalReadingStorage", () => ({
  loadIRState: vi.fn(async (id: number) => {
    if (!states.has(id)) {
      states.set(id, {
        priority: 40,
        lastRead: null,
        readCount: 0,
        due: new Date("2026-01-01"),
        intervalDays: 3,
        postponeCount: 0,
        stage: "extract.raw",
        lastAction: "init",
        position: null,
        resumeBlockId: null,
        autoPostponeBatchId: null
      })
    }
    return { ...states.get(id) }
  }),
  saveIRState: vi.fn(async (id: number, state: any) => {
    states.set(id, {
      ...states.get(id),
      ...state,
      autoPostponeBatchId: state.autoPostponeBatchId ?? null
    })
  })
}))

vi.mock("../../../srs/incrementalReadingCollector", () => ({
  collectIRCards: vi.fn(async () => collected)
}))

import { collectIRCards } from "../../../srs/incrementalReadingCollector"
import { isOverdue } from "../../../srs/incremental-reading/irQueuePolicy"
import { clearAutoPostponeBatchesForTests } from "../../../srs/incremental-reading/irOverloadService"
import { runSessionStartAutoPostpone } from "./runSessionStartAutoPostpone"

const now = new Date("2026-01-20T12:00:00")

function card(id: number, priority: number): IRCard {
  return {
    id,
    cardType: "extracts",
    priority,
    position: null,
    due: new Date("2026-01-01"), // 旧积压
    intervalDays: 3,
    postponeCount: 0,
    stage: "extract.raw",
    lastAction: "init",
    lastRead: null,
    readCount: 1,
    isNew: false,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

/** 生成 n 张旧积压、优先级 1..n 的低优先级卡（都 < 80） */
function makeBacklog(n: number): IRCard[] {
  return Array.from({ length: n }, (_, i) => card(200 + i, i + 1))
}

/** 内存 Storage（含 clear/getItem/setItem 等），供 auto-postpone 守卫使用 */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
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

beforeEach(() => {
  vi.clearAllMocks()
  states.clear()
  collected = []
  clearAutoPostponeBatchesForTests()
  ;(globalThis as any).localStorage = memoryStorage()
  ;(globalThis as any).orca = { notify: vi.fn(), state: { repo: "test-repo" } }
})

describe("runSessionStartAutoPostpone", () => {
  it("runs on the first session start of the day and skips the second (daily guard)", async () => {
    collected = makeBacklog(25) // keepTopN 默认 20 → 推迟最低优先级 5 张

    const first = await runSessionStartAutoPostpone({ pluginName: "orca-srs", now })
    expect(first.skipped).toBe(false)
    expect(first.deferredCount).toBe(5)
    expect(first.batchId).not.toBeNull()
    expect(vi.mocked(collectIRCards).mock.calls.length).toBe(1)

    const second = await runSessionStartAutoPostpone({ pluginName: "orca-srs", now })
    expect(second.skipped).toBe(true)
    expect(second.deferredCount).toBe(0)
    // 守卫命中：第二次不再收集，也不再推迟
    expect(vi.mocked(collectIRCards).mock.calls.length).toBe(1)
  })

  it("marks the guard even when nothing is deferred (still once-per-day)", async () => {
    collected = makeBacklog(5) // ≤ keepTopN 20 → 全部保留，0 推迟

    const first = await runSessionStartAutoPostpone({ pluginName: "orca-srs", now })
    expect(first.skipped).toBe(false)
    expect(first.deferredCount).toBe(0)

    const second = await runSessionStartAutoPostpone({ pluginName: "orca-srs", now })
    expect(second.skipped).toBe(true)
    expect(vi.mocked(collectIRCards).mock.calls.length).toBe(1)
  })

  it("persists future due for postponed backlog so they drop out of today's queue", async () => {
    collected = makeBacklog(25)

    const result = await runSessionStartAutoPostpone({ pluginName: "orca-srs", now })
    expect(result.deferredCount).toBe(5)

    // 只有被推迟的卡被写入；它们的 due 都移到未来 → 不再「今日到期」
    const persisted = [...states.values()]
    expect(persisted.length).toBe(result.deferredCount)
    for (const s of persisted) {
      expect(s.due.getTime()).toBeGreaterThan(now.getTime())
      expect(isOverdue({ due: s.due } as unknown as IRCard, now)).toBe(false)
      expect(s.lastAction).toBe("autoPostpone")
    }
  })

  it("skips (visibly) when the daily guard read fails", async () => {
    collected = makeBacklog(25)
    const spy = vi
      .spyOn(globalThis.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("storage read boom")
      })

    const result = await runSessionStartAutoPostpone({ pluginName: "orca-srs", now })
    expect(result.skipped).toBe(true)
    expect(result.deferredCount).toBe(0)
    // 读取失败可见（warn 通知），且未收集/未推迟
    expect(vi.mocked(collectIRCards).mock.calls.length).toBe(0)
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("无法确认今日是否已整理积压"),
      expect.any(Object)
    )
    spy.mockRestore()
  })

  it("still postpones but surfaces a visible warning when the guard write fails", async () => {
    collected = makeBacklog(25)
    const spy = vi
      .spyOn(globalThis.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded")
      })

    const result = await runSessionStartAutoPostpone({ pluginName: "orca-srs", now })
    // 推迟仍发生，不阻断会话
    expect(result.deferredCount).toBe(5)
    // 守卫写入失败不静默：warn 通知
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("当日守卫写入失败"),
      expect.any(Object)
    )
    spy.mockRestore()
  })
})
