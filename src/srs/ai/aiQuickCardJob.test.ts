import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { QuickBackgroundJob } from "./aiQuickInteractJobs"

const activatePendingCards = vi.fn(async (..._args: unknown[]) => ({
  activated: [] as number[],
  failed: [] as Array<{ blockId: number; error: string }>
}))
const resolveBlockBackendFirst = vi.fn(async (..._args: unknown[]) => ({ id: 999, parent: 10 } as { id: number; parent: number } | null))

vi.mock("../cardStatusUtils", () => ({
  activatePendingCards: (...args: unknown[]) => activatePendingCards(...args)
}))
vi.mock("./aiCardWriter", () => ({
  resolveBlockBackendFirst: (...args: unknown[]) => resolveBlockBackendFirst(...args)
}))

import { keepSelectedQuickCardJob } from "./aiQuickCardJob"

function installOrca(overrides: Record<string, unknown> = {}) {
  const invokeEditorCommand = vi.fn(async () => undefined)
  const invokeGroup = vi.fn(async (fn: () => Promise<void>) => fn())
  ;(globalThis as any).orca = {
    notify: vi.fn(),
    invokeBackend: vi.fn(),
    commands: { invokeEditorCommand, invokeGroup },
    ...overrides
  }
  return { invokeEditorCommand, invokeGroup }
}

function makeJob(partial: Partial<QuickBackgroundJob> = {}): QuickBackgroundJob {
  return {
    id: "card-job",
    kind: "card",
    cardBlockIds: [1001, 1002, 1003],
    pluginName: "orca-srs",
    sourceBlockId: 10,
    selectedText: "工作记忆",
    blockText: "工作记忆",
    promptLabel: "问答卡",
    promptText: "",
    includeBlockContext: false,
    model: "",
    status: "ready",
    resultText: "3 张问答卡",
    errorMessage: null,
    resultRootBlockId: 999,
    selectedResultBlockIds: [1001, 1003],
    createdAt: Date.now(),
    panelId: "panel-1",
    panelViewKey: null,
    ...partial
  }
}

describe("keepSelectedQuickCardJob", () => {
  beforeEach(() => {
    activatePendingCards.mockReset()
    activatePendingCards.mockResolvedValue({ activated: [], failed: [] })
    resolveBlockBackendFirst.mockReset()
    resolveBlockBackendFirst.mockResolvedValue({ id: 999, parent: 10 })
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete (globalThis as any).orca
  })

  it("moves only the selected cards out, activates them, and deletes the wrapper", async () => {
    const { invokeEditorCommand } = installOrca()
    activatePendingCards.mockResolvedValue({
      activated: [1001, 1003],
      failed: []
    })

    const result = await keepSelectedQuickCardJob(makeJob())

    expect(result).toEqual({ success: true, keptCount: 2 })
    // 移出所选
    expect(invokeEditorCommand).toHaveBeenNthCalledWith(
      1,
      "core.editor.moveBlocks",
      null,
      [1001, 1003],
      999,
      "after"
    )
    // 删包装块（含未选 1002）
    expect(invokeEditorCommand).toHaveBeenNthCalledWith(
      2,
      "core.editor.deleteBlocks",
      null,
      [999]
    )
    expect(activatePendingCards).toHaveBeenCalledWith([1001, 1003])
  })

  it("returns failure and does not delete the wrapper when the move fails", async () => {
    const { invokeEditorCommand } = installOrca()
    invokeEditorCommand.mockRejectedValueOnce(new Error("moveBlocks failed"))

    const result = await keepSelectedQuickCardJob(makeJob())

    expect(result.success).toBe(false)
    expect((result as { error: string }).error).toContain("移出所选卡片失败")
    expect(activatePendingCards).not.toHaveBeenCalled()
    // 只有 move 调用，没有 delete 调用
    expect(invokeEditorCommand).toHaveBeenCalledTimes(1)
  })

  it("returns failure when nothing is selected", async () => {
    installOrca()
    const result = await keepSelectedQuickCardJob(
      makeJob({ selectedResultBlockIds: [] })
    )
    expect(result).toEqual({ success: false, error: "请先选择要保留的卡片" })
  })

  it("returns failure when the wrapper block is gone", async () => {
    installOrca()
    resolveBlockBackendFirst.mockResolvedValue(null)
    const result = await keepSelectedQuickCardJob(makeJob())
    expect(result.success).toBe(false)
  })

  it("still deletes the wrapper and warns when activation partially fails", async () => {
    const { invokeEditorCommand } = installOrca()
    activatePendingCards.mockResolvedValue({
      activated: [1001],
      failed: [{ blockId: 1003, error: "没有 #card 标签" }]
    })

    const result = await keepSelectedQuickCardJob(makeJob())

    expect(result.success).toBe(true)
    expect(invokeEditorCommand).toHaveBeenNthCalledWith(
      2,
      "core.editor.deleteBlocks",
      null,
      [999]
    )
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("未能激活"),
      { title: "AI 快捷制卡" }
    )
  })

  it("filters selected ids to those that are actually card blocks", async () => {
    const { invokeEditorCommand } = installOrca()
    activatePendingCards.mockResolvedValue({
      activated: [1001],
      failed: []
    })

    // 混入一个非卡块 id，应被过滤，只保留真实卡块
    const result = await keepSelectedQuickCardJob(
      makeJob({ selectedResultBlockIds: [1001, 4242] })
    )

    expect(result).toEqual({ success: true, keptCount: 1 })
    expect(invokeEditorCommand).toHaveBeenNthCalledWith(
      1,
      "core.editor.moveBlocks",
      null,
      [1001],
      999,
      "after"
    )
  })

  it("moves selected cards in preview order, not click order", async () => {
    const { invokeEditorCommand } = installOrca()
    activatePendingCards.mockResolvedValue({
      activated: [1001, 1002, 1003],
      failed: []
    })

    const result = await keepSelectedQuickCardJob(
      makeJob({ selectedResultBlockIds: [1003, 1002, 1001] })
    )

    expect(result).toEqual({ success: true, keptCount: 3 })
    expect(invokeEditorCommand).toHaveBeenNthCalledWith(
      1,
      "core.editor.moveBlocks",
      null,
      [1001, 1002, 1003],
      999,
      "after"
    )
    expect(activatePendingCards).toHaveBeenCalledWith([1001, 1002, 1003])
  })
})
