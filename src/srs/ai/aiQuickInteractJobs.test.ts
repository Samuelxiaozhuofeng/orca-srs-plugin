import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  aiQuickJobsState,
  cancelAllBackgroundQuickJobs,
  dismissJobsLeftBehindOnPanelLeave,
  keepBackgroundQuickJob,
  keepSingleBlockBackgroundQuickJob,
  startBackgroundQuickInsertJob
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
    keepSingleQuickResultBlock: vi.fn(async () => ({ success: true })),
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

  it("keepSingleBlockBackgroundQuickJob keeps one block then removes job", async () => {
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    await keepSingleBlockBackgroundQuickJob(jobId, 555)
    const { keepSingleQuickResultBlock } = await import("./aiQuickInteract")
    expect(keepSingleQuickResultBlock).toHaveBeenCalledWith(999, 555)
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeUndefined()
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "success",
      "已保留该块",
      expect.objectContaining({ title: "AI 快捷交互" })
    )
  })

  it("keepSingleBlockBackgroundQuickJob keeps job when single-keep fails", async () => {
    const { keepSingleQuickResultBlock } = await import("./aiQuickInteract")
    vi.mocked(keepSingleQuickResultBlock).mockResolvedValueOnce({
      success: false,
      error: "该块不属于当前 AI 预览结果"
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

    await keepSingleBlockBackgroundQuickJob(jobId, 1)
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeDefined()
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "error",
      "该块不属于当前 AI 预览结果",
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
})
