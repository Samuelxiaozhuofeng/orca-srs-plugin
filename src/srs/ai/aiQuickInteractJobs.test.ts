import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  aiQuickJobsState,
  cancelAllBackgroundQuickJobs,
  dismissJobsLeftBehindOnPanelLeave,
  keepBackgroundQuickJob,
  keepSelectedBackgroundQuickJob,
  startBackgroundQuickInsertJob,
  toggleBackgroundQuickJobBlockSelection
} from "./aiQuickInteractJobs"

vi.mock("./aiQuickInteract", () => {
  return {
    runToolbarAIPrompt: vi.fn(async () => ({
      success: true,
      text: "AI 解释正文"
    })),
    insertQuickResultAsChild: vi.fn(async () => ({
      success: true,
      blockId: 999
    })),
    keepQuickResult: vi.fn(async () => ({ success: true })),
    toggleQuickResultBlockSelection: vi.fn(async (
      _rootId: number,
      selectedIds: number[],
      blockId: number
    ) => ({
      success: true,
      selectedBlockIds: selectedIds.includes(blockId)
        ? selectedIds.filter((id) => id !== blockId)
        : [...selectedIds, blockId]
    })),
    keepSelectedQuickResultBlocks: vi.fn(async (
      _rootId: number,
      selectedIds: number[]
    ) => ({ success: true, keptCount: selectedIds.length })),
    dismissQuickResult: vi.fn(async () => ({ success: true })),
    promoteQuickResultToChild: vi.fn(async () => ({ success: true }))
  }
})

function installOrcaPanel(viewKey: {
  view: string
  blockId?: number | null
  date?: string | null
}) {
  ;(globalThis as any).orca = {
    notify: vi.fn(),
    state: {
      activePanel: "panel-1",
      panels: {}
    },
    nav: {
      findViewPanel: vi.fn(() => ({
        id: "panel-1",
        view: viewKey.view,
        viewArgs: {
          blockId: viewKey.blockId ?? null,
          date: viewKey.date ?? null
        },
        viewState: {}
      }))
    }
  }
}

describe("startBackgroundQuickInsertJob", () => {
  beforeEach(() => {
    aiQuickJobsState.jobs = []
    installOrcaPanel({ view: "block", blockId: 10 })
  })

  afterEach(async () => {
    await cancelAllBackgroundQuickJobs()
    vi.restoreAllMocks()
    delete (globalThis as any).orca
  })

  it("runs job silently without info/success toast notifications and inserts as child preview", async () => {
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    expect(jobId).toMatch(/^qi-job-/)
    const { runToolbarAIPrompt, insertQuickResultAsChild } = await import(
      "./aiQuickInteract"
    )
    expect(runToolbarAIPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: "orca-srs",
        selectedText: "工作记忆",
        userInstruction: "请举例说明",
        model: ""
      })
    )
    expect(insertQuickResultAsChild).toHaveBeenCalledWith(
      10,
      "AI 解释正文",
      "举例说明",
      "工作记忆"
    )

    // Verify silent execution: no info/success notifications spammed
    expect((globalThis as any).orca.notify).not.toHaveBeenCalledWith(
      "info",
      expect.anything(),
      expect.anything()
    )
    expect((globalThis as any).orca.notify).not.toHaveBeenCalledWith(
      "success",
      expect.anything(),
      expect.anything()
    )

    const job = (
      aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        resultRootBlockId: number | null
        panelId: string | null
        panelViewKey: string | null
      }>
    ).find((j) => j.id === jobId)
    expect(job).toBeDefined()
    expect(job?.status).toBe("ready")
    expect(job?.resultRootBlockId).toBe(999)
    expect(job?.panelId).toBe("panel-1")
    expect(job?.panelViewKey).toContain("block")

    // Test keepBackgroundQuickJob confirms preview block
    await keepBackgroundQuickJob(jobId)
    const { keepQuickResult } = await import("./aiQuickInteract")
    expect(keepQuickResult).toHaveBeenCalledWith(999)
    const remaining = (aiQuickJobsState.jobs as Array<{ id: string }>).find(
      (j) => j.id === jobId
    )
    expect(remaining).toBeUndefined()
  })

  it("still ends preview when keep property write fails", async () => {
    const { keepQuickResult } = await import("./aiQuickInteract")
    vi.mocked(keepQuickResult).mockResolvedValueOnce({
      success: false,
      error: "setProperties failed"
    })

    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    await keepBackgroundQuickJob(jobId)
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeUndefined()
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("setProperties failed"),
      expect.objectContaining({ title: "AI 快捷交互" })
    )
  })

  it("serializes rapid candidate clicks without ending or writing the preview job", async () => {
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    await Promise.all([
      toggleBackgroundQuickJobBlockSelection(jobId, 555),
      toggleBackgroundQuickJobBlockSelection(jobId, 556)
    ])
    const { toggleQuickResultBlockSelection, keepSelectedQuickResultBlocks } =
      await import("./aiQuickInteract")
    expect(toggleQuickResultBlockSelection).toHaveBeenNthCalledWith(
      1,
      999,
      [],
      555
    )
    expect(toggleQuickResultBlockSelection).toHaveBeenNthCalledWith(
      2,
      999,
      [555],
      556
    )
    expect(keepSelectedQuickResultBlocks).not.toHaveBeenCalled()

    const job = (
      aiQuickJobsState.jobs as Array<{
        id: string
        selectedResultBlockIds: number[]
      }>
    ).find((candidate) => candidate.id === jobId)
    expect(job?.selectedResultBlockIds).toEqual([555, 556])
  })

  it("keeps all selected candidates only after confirmation", async () => {
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })
    await toggleBackgroundQuickJobBlockSelection(jobId, 555)
    await toggleBackgroundQuickJobBlockSelection(jobId, 556)
    await keepSelectedBackgroundQuickJob(jobId)

    const { keepSelectedQuickResultBlocks } = await import("./aiQuickInteract")
    expect(keepSelectedQuickResultBlocks).toHaveBeenCalledWith(999, [555, 556])
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeUndefined()
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "success",
      "已保留 2 项",
      expect.objectContaining({ title: "AI 快捷交互" })
    )
  })

  it("keeps selection and job available when batch confirmation fails", async () => {
    const { keepSelectedQuickResultBlocks } = await import("./aiQuickInteract")
    vi.mocked(keepSelectedQuickResultBlocks).mockResolvedValueOnce({
      success: false,
      error: "批量移动失败"
    })

    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })
    await toggleBackgroundQuickJobBlockSelection(jobId, 555)
    await keepSelectedBackgroundQuickJob(jobId)

    const job = (
      aiQuickJobsState.jobs as Array<{
        id: string
        selectedResultBlockIds: number[]
      }>
    ).find((candidate) => candidate.id === jobId)
    expect(job?.selectedResultBlockIds).toEqual([555])
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "error",
      "批量移动失败",
      expect.objectContaining({ title: "AI 快捷交互" })
    )
  })

  it("dismisses ready preview when user leaves the panel view", async () => {
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    // 模拟导航离开当前面板视图
    ;(globalThis as any).orca.nav.findViewPanel = vi.fn(() => ({
      id: "panel-1",
      view: "journal",
      viewArgs: { date: "2026-01-01" },
      viewState: {}
    }))

    await dismissJobsLeftBehindOnPanelLeave()

    const { dismissQuickResult } = await import("./aiQuickInteract")
    expect(dismissQuickResult).toHaveBeenCalledWith(999)
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeUndefined()
  })

  it("cancelAllBackgroundQuickJobs deletes unkept ready previews", async () => {
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).some((j) => j.id === jobId)
    ).toBe(true)

    await cancelAllBackgroundQuickJobs()

    const { dismissQuickResult } = await import("./aiQuickInteract")
    expect(dismissQuickResult).toHaveBeenCalledWith(999)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("throws validation error if promptText or selectedText is empty", async () => {
    await expect(
      startBackgroundQuickInsertJob({
        pluginName: "orca-srs",
        sourceBlockId: 10,
        selectedText: "",
        blockText: "x",
        promptLabel: "x",
        promptText: "p",
        includeBlockContext: true
      })
    ).rejects.toThrow("选中文本为空")
  })

  it("notifies error when AI generation fails", async () => {
    const { runToolbarAIPrompt } = await import("./aiQuickInteract")
    vi.mocked(runToolbarAIPrompt).mockResolvedValueOnce({
      success: false,
      error: { code: "HTTP_401", message: "Invalid API key" }
    })

    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    const job = (
      aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        errorMessage: string | null
      }>
    ).find((j) => j.id === jobId)
    expect(job?.status).toBe("error")
    expect(job?.errorMessage).toBe("Invalid API key")
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "error",
      "Invalid API key",
      expect.objectContaining({ title: "AI 快捷交互" })
    )
  })

  it("notifies error when insert fails after successful generation", async () => {
    const { insertQuickResultAsChild } = await import("./aiQuickInteract")
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: false,
      error: "找不到目标块，无法插入"
    })

    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    const job = (
      aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        errorMessage: string | null
      }>
    ).find((j) => j.id === jobId)
    expect(job?.status).toBe("error")
    expect(job?.errorMessage).toBe("找不到目标块，无法插入")
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "error",
      "找不到目标块，无法插入",
      expect.objectContaining({ title: "AI 快捷交互" })
    )
  })

  it("does not notify error when generation is cancelled", async () => {
    const { runToolbarAIPrompt } = await import("./aiQuickInteract")
    vi.mocked(runToolbarAIPrompt).mockResolvedValueOnce({
      success: false,
      error: { code: "CANCELLED", message: "已取消生成" }
    })

    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeUndefined()
    expect((globalThis as any).orca.notify).not.toHaveBeenCalledWith(
      "error",
      expect.anything(),
      expect.anything()
    )
  })
})
