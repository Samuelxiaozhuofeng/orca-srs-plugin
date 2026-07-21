import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  aiQuickJobsState,
  cancelAllBackgroundQuickJobs,
  keepBackgroundQuickJob,
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
    dismissQuickResult: vi.fn(async () => ({ success: true })),
    promoteQuickResultToChild: vi.fn(async () => ({ success: true }))
  }
})

describe("startBackgroundQuickInsertJob", () => {
  beforeEach(() => {
    aiQuickJobsState.jobs = []
    ;(globalThis as any).orca = {
      notify: vi.fn()
    }
  })

  afterEach(() => {
    cancelAllBackgroundQuickJobs()
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
        userInstruction: "请举例说明"
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
      }>
    ).find((j) => j.id === jobId)
    expect(job).toBeDefined()
    expect(job?.status).toBe("ready")
    expect(job?.resultRootBlockId).toBe(999)

    // Test keepBackgroundQuickJob confirms preview block
    await keepBackgroundQuickJob(jobId)
    const { keepQuickResult } = await import("./aiQuickInteract")
    expect(keepQuickResult).toHaveBeenCalledWith(999)
    const remaining = (aiQuickJobsState.jobs as Array<{ id: string }>).find(
      (j) => j.id === jobId
    )
    expect(remaining).toBeUndefined()
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
