import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  aiQuickJobsState,
  beginQuickBackgroundJobsSession,
  cancelBackgroundQuickJob,
  cancelAllBackgroundQuickJobs,
  dismissBackgroundQuickJob,
  dismissJobsLeftBehindOnPanelLeave,
  keepBackgroundQuickJob,
  keepSingleBlockBackgroundQuickJob,
  moveBackgroundQuickJobAfter,
  regenerateBackgroundQuickJob,
  restoreRecentQuickResult,
  retryBackgroundQuickJob,
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
    moveQuickResultAfter: vi.fn(async () => ({ success: true })),
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

function quickJobOptions() {
  return {
    pluginName: "orca-srs",
    sourceBlockId: 10,
    selectedText: "工作记忆",
    blockText: "整块正文",
    promptLabel: "举例说明",
    promptText: "请举例说明",
    includeBlockContext: true,
    model: "gpt-test"
  }
}

/** 可控异步结果，用于锁定取消/导航离开的竞态。 */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  promise.catch(() => {})
  return { promise, resolve, reject }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe("startBackgroundQuickInsertJob", () => {
  beforeEach(() => {
    beginQuickBackgroundJobsSession()
    vi.clearAllMocks()
    aiQuickJobsState.jobs = []
    aiQuickJobsState.recent = []
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

  it("rejects new work after plugin cleanup starts", async () => {
    await cancelAllBackgroundQuickJobs()

    await expect(
      startBackgroundQuickInsertJob(quickJobOptions())
    ).rejects.toThrow(/正在关闭/)
  })

  it("keeps an ordinary AI failure visible with a sanitized retryable error", async () => {
    const { runToolbarAIPrompt, insertQuickResultAsChild } = await import(
      "./aiQuickInteract"
    )
    vi.mocked(runToolbarAIPrompt).mockResolvedValueOnce({
      success: false,
      error: {
        code: "HTTP_ERROR",
        message: "Authorization: Bearer sk-test-secret 请求超时"
      }
    })

    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())

    const job = (
      aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        errorMessage: string | null
        resultRootBlockId: number | null
      }>
    ).find((item) => item.id === jobId)
    expect(job).toMatchObject({
      id: jobId,
      status: "error",
      resultRootBlockId: null
    })
    expect(job?.errorMessage).toContain("请求超时")
    expect(job?.errorMessage).not.toContain("sk-test-secret")
    expect(insertQuickResultAsChild).not.toHaveBeenCalled()
  })

  it("replaces an error card with a retry job and preserves its original request context", async () => {
    const { runToolbarAIPrompt, insertQuickResultAsChild } = await import(
      "./aiQuickInteract"
    )
    vi.mocked(runToolbarAIPrompt)
      .mockResolvedValueOnce({
        success: false,
        error: { code: "HTTP_ERROR", message: "网络超时" }
      })
      .mockResolvedValueOnce({ success: true, text: "重试后的解释" })
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: true,
      blockId: 1001
    })

    const options = quickJobOptions()
    const jobId = await startBackgroundQuickInsertJob(options)
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string; status: string }>).find(
        (item) => item.id === jobId
      )?.status
    ).toBe("error")

    const retryJobId = await retryBackgroundQuickJob(jobId)

    const job = (
      aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        errorMessage: string | null
        resultText: string
        resultRootBlockId: number | null
      }>
    ).find((item) => item.id === retryJobId)
    expect(retryJobId).not.toBe(jobId)
    expect(job).toMatchObject({
      id: retryJobId,
      status: "ready",
      errorMessage: null,
      resultText: "重试后的解释",
      resultRootBlockId: 1001
    })
    expect(aiQuickJobsState.jobs).toHaveLength(1)
    expect(runToolbarAIPrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pluginName: options.pluginName,
        selectedText: options.selectedText,
        blockText: options.blockText,
        includeBlockContext: options.includeBlockContext,
        model: options.model,
        userInstruction: options.promptText
      })
    )
  })

  it("exposes generating state immediately while retry is pending", async () => {
    const { runToolbarAIPrompt } = await import("./aiQuickInteract")
    vi.mocked(runToolbarAIPrompt).mockResolvedValueOnce({
      success: false,
      error: { code: "HTTP_ERROR", message: "网络超时" }
    })
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())

    const retryResult = deferred<{
      success: true
      text: string
    }>()
    vi.mocked(runToolbarAIPrompt).mockReturnValueOnce(retryResult.promise)
    const retryPromise = retryBackgroundQuickJob(jobId)

    expect(aiQuickJobsState.jobs).toHaveLength(1)
    const retryingJob = (aiQuickJobsState.jobs as Array<{
      id: string
      status: string
      errorMessage: string | null
    }>)[0]
    expect(retryingJob.id).not.toBe(jobId)
    expect(retryingJob).toMatchObject({
      status: "generating",
      errorMessage: null
    })

    retryResult.resolve({ success: true, text: "恢复成功" })
    await retryPromise
  })

  it("retries an insertion failure without paying for another model call", async () => {
    const { runToolbarAIPrompt, insertQuickResultAsChild } = await import(
      "./aiQuickInteract"
    )
    vi.mocked(insertQuickResultAsChild)
      .mockResolvedValueOnce({ success: false, error: "写入失败" })
      .mockResolvedValueOnce({ success: true, blockId: 1002 })

    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    expect(
      (aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        errorStage: string | null
      }>).find((item) => item.id === jobId)
    ).toMatchObject({ status: "error", errorStage: "insert" })

    const retryJobId = await retryBackgroundQuickJob(jobId)

    expect(retryJobId).toBe(jobId)
    expect(runToolbarAIPrompt).toHaveBeenCalledTimes(1)
    expect(insertQuickResultAsChild).toHaveBeenCalledTimes(2)
    expect(
      (aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        resultRootBlockId: number | null
      }>).find((item) => item.id === jobId)
    ).toMatchObject({ status: "ready", resultRootBlockId: 1002 })
  })

  it("regenerates a ready preview as an independent comparable job", async () => {
    const { runToolbarAIPrompt, insertQuickResultAsChild, dismissQuickResult } =
      await import("./aiQuickInteract")
    const options = quickJobOptions()
    vi.mocked(insertQuickResultAsChild)
      .mockResolvedValueOnce({ success: true, blockId: 1101 })
      .mockResolvedValueOnce({ success: true, blockId: 1102 })

    const originalJobId = await startBackgroundQuickInsertJob(options)
    vi.mocked(runToolbarAIPrompt).mockResolvedValueOnce({
      success: true,
      text: "另一版解释"
    })

    const regeneratedJobId = await regenerateBackgroundQuickJob(originalJobId)

    expect(regeneratedJobId).not.toBe(originalJobId)
    expect(aiQuickJobsState.jobs).toHaveLength(2)
    expect(
      (aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        resultRootBlockId: number | null
      }>).find((item) => item.id === originalJobId)
    ).toMatchObject({ status: "ready", resultRootBlockId: 1101 })
    expect(
      (aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        resultText: string
        resultRootBlockId: number | null
      }>).find((item) => item.id === regeneratedJobId)
    ).toMatchObject({
      status: "ready",
      resultText: "另一版解释",
      resultRootBlockId: 1102
    })
    expect(dismissQuickResult).not.toHaveBeenCalledWith(1101)
    expect(runToolbarAIPrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedText: options.selectedText,
        blockText: options.blockText,
        model: options.model,
        userInstruction: options.promptText
      })
    )
  })

  it("moves a ready preview after its source and marks it kept", async () => {
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    const { moveQuickResultAfter, keepQuickResult } = await import(
      "./aiQuickInteract"
    )

    await moveBackgroundQuickJobAfter(jobId)

    expect(moveQuickResultAfter).toHaveBeenCalledWith(10, 999)
    expect(keepQuickResult).toHaveBeenCalledWith(999)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("archives a dismissed ready preview as a session recent result", async () => {
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())

    await dismissBackgroundQuickJob(jobId)

    expect(aiQuickJobsState.jobs).toEqual([])
    expect(aiQuickJobsState.recent).toHaveLength(1)
    expect(aiQuickJobsState.recent[0]).toMatchObject({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      promptLabel: "举例说明",
      resultText: "AI 解释正文"
    })
    expect(aiQuickJobsState.recent[0].id).toMatch(/^qi-recent-/)
  })

  it("keeps a ready job retryable when deleting its preview fails", async () => {
    const { dismissQuickResult } = await import("./aiQuickInteract")
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    vi.mocked(dismissQuickResult).mockResolvedValueOnce({
      success: false,
      error: "删除失败"
    })

    await dismissBackgroundQuickJob(jobId)

    expect(
      (aiQuickJobsState.jobs as Array<{ id: string; status: string }>).find(
        (item) => item.id === jobId
      )
    ).toMatchObject({ status: "ready" })
    expect(aiQuickJobsState.recent).toEqual([])
  })

  it("restores a recent result to its original source as a kept child", async () => {
    const { insertQuickResultAsChild, keepQuickResult } = await import(
      "./aiQuickInteract"
    )
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    await dismissBackgroundQuickJob(jobId)
    const recentId = aiQuickJobsState.recent[0]?.id
    expect(recentId).toBeTruthy()
    vi.clearAllMocks()
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: true,
      blockId: 3001
    })

    await restoreRecentQuickResult(recentId)

    expect(insertQuickResultAsChild).toHaveBeenCalledWith(
      10,
      "AI 解释正文",
      "举例说明",
      "工作记忆"
    )
    expect(keepQuickResult).toHaveBeenCalledWith(3001)
    expect(aiQuickJobsState.recent).toEqual([])
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "success",
      "已恢复为原块的子块",
      expect.objectContaining({ title: "Quick AI" })
    )
  })

  it("keeps a recent result retryable when restoration insertion fails", async () => {
    const { insertQuickResultAsChild, keepQuickResult } = await import(
      "./aiQuickInteract"
    )
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    await dismissBackgroundQuickJob(jobId)
    const recentId = aiQuickJobsState.recent[0]?.id
    expect(recentId).toBeTruthy()
    vi.clearAllMocks()
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: false,
      error: "源块不存在"
    })

    await restoreRecentQuickResult(recentId)

    expect(keepQuickResult).not.toHaveBeenCalled()
    expect(aiQuickJobsState.recent).toHaveLength(1)
    expect(aiQuickJobsState.recent[0]?.id).toBe(recentId)
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "error",
      "源块不存在",
      expect.objectContaining({ title: "恢复 Quick AI 结果" })
    )
  })

  it("archives paid model text when preview insertion fails and the error is closed", async () => {
    const { insertQuickResultAsChild } = await import("./aiQuickInteract")
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: false,
      error: "写入失败"
    })
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())

    const { acknowledgeBackgroundQuickJobError } = await import(
      "./aiQuickInteractJobs"
    )
    acknowledgeBackgroundQuickJobError(jobId)

    expect(aiQuickJobsState.jobs).toEqual([])
    expect(aiQuickJobsState.recent[0]).toMatchObject({
      resultText: "AI 解释正文",
      sourceBlockId: 10
    })
  })

  it("compensates a late successful insert after the user cancels", async () => {
    const { insertQuickResultAsChild, dismissQuickResult } = await import(
      "./aiQuickInteract"
    )
    const insertResult = deferred<{
      success: true
      blockId: number
    }>()
    vi.mocked(insertQuickResultAsChild).mockReturnValueOnce(insertResult.promise)

    const startPromise = startBackgroundQuickInsertJob(quickJobOptions())
    await flushMicrotasks()
    const jobId = (aiQuickJobsState.jobs as Array<{ id: string }>)[0]?.id
    expect(jobId).toBeTruthy()

    cancelBackgroundQuickJob(jobId)
    insertResult.resolve({ success: true, blockId: 2001 })
    await startPromise

    expect(dismissQuickResult).toHaveBeenCalledWith(2001)
    expect(aiQuickJobsState.jobs).toEqual([])
    expect(aiQuickJobsState.recent[0]).toMatchObject({
      resultText: "AI 解释正文"
    })
  })

  it("compensates a late successful insert after navigation leaves the panel", async () => {
    const { insertQuickResultAsChild, dismissQuickResult } = await import(
      "./aiQuickInteract"
    )
    const insertResult = deferred<{
      success: true
      blockId: number
    }>()
    vi.mocked(insertQuickResultAsChild).mockReturnValueOnce(insertResult.promise)

    const startPromise = startBackgroundQuickInsertJob(quickJobOptions())
    await flushMicrotasks()
    expect(aiQuickJobsState.jobs).toHaveLength(1)
    ;(globalThis as any).orca.nav.findViewPanel = vi.fn(() => ({
      id: "panel-1",
      view: "journal",
      viewArgs: { date: "2026-01-01" },
      viewState: {}
    }))

    await dismissJobsLeftBehindOnPanelLeave()
    insertResult.resolve({ success: true, blockId: 2002 })
    await startPromise

    expect(dismissQuickResult).toHaveBeenCalledWith(2002)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("waits for and compensates a late insert during plugin cleanup", async () => {
    const { insertQuickResultAsChild, dismissQuickResult } = await import(
      "./aiQuickInteract"
    )
    const insertResult = deferred<{ success: true; blockId: number }>()
    vi.mocked(insertQuickResultAsChild).mockReturnValueOnce(insertResult.promise)

    const startPromise = startBackgroundQuickInsertJob(quickJobOptions())
    await flushMicrotasks()
    const cleanupPromise = cancelAllBackgroundQuickJobs()
    insertResult.resolve({ success: true, blockId: 2003 })
    await Promise.all([startPromise, cleanupPromise])

    expect(dismissQuickResult).toHaveBeenCalledWith(2003)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("does not delete a preview while a keep action owns the job", async () => {
    const { keepQuickResult, dismissQuickResult } = await import(
      "./aiQuickInteract"
    )
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    const keepResult = deferred<{ success: true }>()
    vi.mocked(keepQuickResult).mockReturnValueOnce(keepResult.promise)

    const keepPromise = keepBackgroundQuickJob(jobId)
    await dismissBackgroundQuickJob(jobId)
    keepResult.resolve({ success: true })
    await keepPromise

    expect(dismissQuickResult).not.toHaveBeenCalledWith(999)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("compensates a restore that finishes after plugin cleanup starts", async () => {
    const { insertQuickResultAsChild, dismissQuickResult, keepQuickResult } =
      await import("./aiQuickInteract")
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    await dismissBackgroundQuickJob(jobId)
    const recentId = aiQuickJobsState.recent[0]?.id
    const insertResult = deferred<{ success: true; blockId: number }>()
    vi.mocked(insertQuickResultAsChild).mockReturnValueOnce(insertResult.promise)

    const restorePromise = restoreRecentQuickResult(recentId)
    const cleanupPromise = cancelAllBackgroundQuickJobs()
    insertResult.resolve({ success: true, blockId: 4001 })
    await Promise.all([restorePromise, cleanupPromise])

    expect(dismissQuickResult).toHaveBeenCalledWith(4001)
    expect(keepQuickResult).not.toHaveBeenCalledWith(4001)
    expect(aiQuickJobsState.jobs).toEqual([])
    expect(aiQuickJobsState.recent).toEqual([])
  })

  it("falls back to keeping a preview when unload deletion fails", async () => {
    const { dismissQuickResult, keepQuickResult } = await import(
      "./aiQuickInteract"
    )
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    vi.mocked(dismissQuickResult).mockResolvedValueOnce({
      success: false,
      error: "卸载删除失败"
    })

    await expect(cancelAllBackgroundQuickJobs()).resolves.toBeUndefined()

    expect(keepQuickResult).toHaveBeenCalledWith(999)
    expect(aiQuickJobsState.jobs).toEqual([])
    expect(jobId).toBeTruthy()
  })

  it("surfaces unload cleanup failure when delete and keep both fail", async () => {
    const { dismissQuickResult, keepQuickResult } = await import(
      "./aiQuickInteract"
    )
    const jobId = await startBackgroundQuickInsertJob(quickJobOptions())
    vi.mocked(dismissQuickResult).mockResolvedValueOnce({
      success: false,
      error: "卸载删除失败"
    })
    vi.mocked(keepQuickResult).mockResolvedValueOnce({
      success: false,
      error: "保留标记失败"
    })

    await expect(cancelAllBackgroundQuickJobs()).rejects.toThrow(/1 个/)
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).map((item) => item.id)
    ).toEqual([jobId])
  })
})
