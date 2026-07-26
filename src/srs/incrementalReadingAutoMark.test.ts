import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getIncrementalReadingSettings: vi.fn(() => ({ enableAutoExtractMark: true })),
  extractCardType: vi.fn((_block: unknown): string | null => null),
  loadIRState: vi.fn(async () => ({ priority: 50 })),
  buildCardTagData: vi.fn(async () => ({})),
  upsertIRIndexId: vi.fn(),
  ensureCardSrsState: vi.fn(async () => undefined),
  initializeExtractScheduleAfterCreate: vi.fn(async () => undefined)
}))

vi.mock("./deckUtils", () => ({ extractCardType: mocks.extractCardType }))
vi.mock("./incrementalReadingScheduler", () => ({ DEFAULT_IR_PRIORITY: 50 }))
vi.mock("./incrementalReadingStorage", () => ({ loadIRState: mocks.loadIRState }))
vi.mock("./settings/incrementalReadingSettingsSchema", () => ({
  getIncrementalReadingSettings: mocks.getIncrementalReadingSettings
}))
vi.mock("./cardTagDataBuilder", () => ({ buildCardTagData: mocks.buildCardTagData }))
vi.mock("./incremental-reading/irIndex", () => ({ upsertIRIndexId: mocks.upsertIRIndexId }))
vi.mock("./storage", () => ({ ensureCardSrsState: mocks.ensureCardSrsState }))
vi.mock("./extractUtils", () => ({
  initializeExtractScheduleAfterCreate: mocks.initializeExtractScheduleAfterCreate
}))

const invokeEditorCommand = vi.fn(async () => undefined)
const unsubscribeSpy = vi.fn()
const subscribe = vi.fn(
  (_target: unknown, _cb: (ops?: unknown) => void) => unsubscribeSpy
)

// @ts-expect-error focused Orca mock for auto-mark watcher tests
globalThis.orca = {
  state: { blocks: {} },
  commands: { invokeEditorCommand }
}
;(globalThis as any).window = { Valtio: { subscribe } }

import { startAutoMarkExtract, stopAutoMarkExtract } from "./incrementalReadingAutoMark"

function getWatcherCallback(callIndex = 0): (ops?: unknown) => void {
  const call = subscribe.mock.calls[callIndex]
  if (!call) throw new Error("valtio subscribe was not called")
  return call[1]
}

async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
  }
}

describe("auto-mark extract watcher lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getIncrementalReadingSettings.mockReturnValue({ enableAutoExtractMark: true })
    mocks.extractCardType.mockImplementation(() => null)
    mocks.loadIRState.mockResolvedValue({ priority: 50 })
    ;(orca.state as any).blocks = {}
    vi.useFakeTimers()
  })

  afterEach(() => {
    // 复位模块级状态（unsubscribe / debounce 定时器 / processedBlocks / 世代）
    stopAutoMarkExtract("orca-srs")
    vi.useRealTimers()
  })

  it("ignores duplicate starts and keeps a single valtio subscription", () => {
    startAutoMarkExtract("orca-srs")
    startAutoMarkExtract("orca-srs")
    startAutoMarkExtract("orca-srs")
    expect(subscribe).toHaveBeenCalledTimes(1)

    stopAutoMarkExtract("orca-srs")
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1)

    // stop 后可重新启动（非永久停用）
    startAutoMarkExtract("orca-srs")
    expect(subscribe).toHaveBeenCalledTimes(2)
  })

  it("runs the debounced scan while started (sanity for the zero-scan test)", async () => {
    startAutoMarkExtract("orca-srs")
    const watcherCb = getWatcherCallback()
    const scansBefore = mocks.getIncrementalReadingSettings.mock.calls.length

    watcherCb(undefined)
    await vi.advanceTimersByTimeAsync(600)

    expect(mocks.getIncrementalReadingSettings.mock.calls.length).toBe(scansBefore + 1)
  })

  it("clears the pending debounce timer on stop: zero scans and zero writes afterwards", async () => {
    startAutoMarkExtract("orca-srs")
    const watcherCb = getWatcherCallback()
    const scansBefore = mocks.getIncrementalReadingSettings.mock.calls.length

    watcherCb(undefined) // 调度 500ms 防抖扫描
    stopAutoMarkExtract("orca-srs")
    await vi.advanceTimersByTimeAsync(2000)

    expect(mocks.getIncrementalReadingSettings.mock.calls.length).toBe(scansBefore)
    expect(invokeEditorCommand).not.toHaveBeenCalled()
    expect(mocks.buildCardTagData).not.toHaveBeenCalled()
  })

  it("aborts an in-flight marking before any write when stopped mid-way", async () => {
    const deferred = {
      resolve: (_value: { priority: number }): void => {
        throw new Error("loadIRState resolver not captured")
      }
    }
    mocks.loadIRState.mockImplementation(
      () =>
        new Promise<{ priority: number }>(resolve => {
          deferred.resolve = resolve
        })
    )
    // 块 2 是 Topic，块 1 是其直接子块（待标记）
    mocks.extractCardType.mockImplementation((block: any) =>
      block?.id === 2 ? "topic" : null
    )
    ;(orca.state as any).blocks = {
      1: { id: 1, parent: 2, text: "child" },
      2: { id: 2, text: "topic" }
    }

    // start 的初始扫描同步推进到 loadIRState 的 await 处挂起
    startAutoMarkExtract("orca-srs")
    expect(mocks.loadIRState).toHaveBeenCalledTimes(1)

    stopAutoMarkExtract("orca-srs")
    deferred.resolve({ priority: 40 })
    await flushMicrotasks()

    // stop 后世代已变：写入组（insertTag 等）不得开始
    expect(mocks.buildCardTagData).not.toHaveBeenCalled()
    expect(invokeEditorCommand).not.toHaveBeenCalled()
    expect(mocks.initializeExtractScheduleAfterCreate).not.toHaveBeenCalled()
  })

  it("completes the marking writes when not stopped (control case)", async () => {
    // 标记流程含动态 import（./storage、./extractUtils），需要真实事件循环
    vi.useRealTimers()
    mocks.extractCardType.mockImplementation((block: any) =>
      block?.id === 2 ? "topic" : null
    )
    ;(orca.state as any).blocks = {
      1: { id: 1, parent: 2, text: "child" },
      2: { id: 2, text: "topic" }
    }

    startAutoMarkExtract("orca-srs")
    await vi.waitFor(() => {
      expect(mocks.initializeExtractScheduleAfterCreate).toHaveBeenCalled()
    })

    expect(invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.insertTag",
      null,
      1,
      "card",
      expect.anything()
    )
    expect(mocks.initializeExtractScheduleAfterCreate).toHaveBeenCalledWith({
      extractBlockId: 1,
      sourceTopicId: 2,
      priority: 50
    })
  })
})
