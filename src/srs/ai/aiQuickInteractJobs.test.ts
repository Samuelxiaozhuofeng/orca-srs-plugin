import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  aiQuickJobsState,
  cancelAllBackgroundQuickJobs,
  cancelGeneratingQuickJobsForSourceBlock,
  dismissBackgroundQuickJob,
  dismissJobsLeftBehindOnPanelLeave,
  keepBackgroundQuickJob,
  keepSelectedBackgroundQuickJob,
  shouldMountChildSelectionActions,
  startBackgroundQuickInsertJob,
  toggleBackgroundQuickJobBlockSelection,
  type QuickBackgroundJob
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
    dismissQuickResult: vi.fn(async () => ({ success: true }))
  }
})

vi.mock("./aiQuickCardJob", () => ({
  keepQuickCardJob: vi.fn(async () => ({ success: true as const })),
  dismissQuickCardJob: vi.fn(async () => ({ success: true as const }))
}))

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

function installReadyCardJob(id = "quick-card-job"): QuickBackgroundJob {
  const job: QuickBackgroundJob = {
    id,
    kind: "card",
    cardBlockIds: [1001, 1002],
    pluginName: "orca-srs",
    sourceBlockId: 10,
    selectedText: "工作记忆",
    blockText: "工作记忆",
    promptLabel: "问答卡",
    promptText: "",
    includeBlockContext: false,
    model: "",
    status: "ready",
    resultText: "2 张问答卡",
    errorMessage: null,
    resultRootBlockId: 999,
    selectedResultBlockIds: [],
    createdAt: Date.now(),
    panelId: "panel-1",
    panelViewKey: null
  }
  aiQuickJobsState.jobs = [job]
  return job
}

describe("startBackgroundQuickInsertJob", () => {
  beforeEach(() => {
    aiQuickJobsState.jobs = []
    installOrcaPanel({ view: "block", blockId: 10 })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cancelAllBackgroundQuickJobs()
    vi.restoreAllMocks()
    delete (globalThis as any).orca
  })

  it("aborts an inline-cancelled request and ignores a late successful response", async () => {
    const { runToolbarAIPrompt, insertQuickResultAsChild } = await import(
      "./aiQuickInteract"
    )
    let capturedSignal: AbortSignal | undefined
    let resolveRequest!: (value: { success: true; text: string }) => void
    vi.mocked(runToolbarAIPrompt).mockImplementationOnce(
      async ({ signal }) =>
        new Promise((resolve) => {
          capturedSignal = signal
          resolveRequest = resolve
        })
    )

    const pendingJob = startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "工作记忆",
      blockText: "整块正文",
      promptLabel: "举例说明",
      promptText: "请举例说明",
      includeBlockContext: true
    })

    await vi.waitFor(() => {
      expect(aiQuickJobsState.jobs).toHaveLength(1)
      expect(capturedSignal).toBeDefined()
    })

    expect(cancelGeneratingQuickJobsForSourceBlock(10)).toBe(1)
    expect(capturedSignal?.aborted).toBe(true)
    expect(aiQuickJobsState.jobs).toEqual([])
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "info",
      "已取消此项 AI 生成",
      { title: "AI 快捷交互" }
    )

    resolveRequest({ success: true, text: "迟到的 AI 结果" })
    await pendingJob

    expect(insertQuickResultAsChild).not.toHaveBeenCalled()
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("cancels all generating jobs for one source block and keeps other sources", async () => {
    const { runToolbarAIPrompt } = await import("./aiQuickInteract")
    const signals: AbortSignal[] = []
    const resolvers: Array<(value: { success: true; text: string }) => void> = []
    for (let index = 0; index < 3; index += 1) {
      vi.mocked(runToolbarAIPrompt).mockImplementationOnce(
        async ({ signal }) =>
          new Promise((resolve) => {
            signals.push(signal as AbortSignal)
            resolvers.push(resolve)
          })
      )
    }
    const makeJob = (sourceBlockId: number, selectedText: string) =>
      startBackgroundQuickInsertJob({
        pluginName: "orca-srs",
        sourceBlockId,
        selectedText,
        blockText: "整块正文",
        promptLabel: "举例说明",
        promptText: "请举例说明",
        includeBlockContext: true
      })

    const pendingJobs = [
      makeJob(10, "任务一"),
      makeJob(10, "任务二"),
      makeJob(20, "其它源块任务")
    ]
    await vi.waitFor(() => {
      expect(aiQuickJobsState.jobs).toHaveLength(3)
      expect(signals).toHaveLength(3)
    })

    expect(cancelGeneratingQuickJobsForSourceBlock(10)).toBe(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(true)
    expect(signals[2]?.aborted).toBe(false)
    expect(aiQuickJobsState.jobs).toHaveLength(1)
    expect(aiQuickJobsState.jobs[0]?.sourceBlockId).toBe(20)
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "info",
      "已取消此块的全部 2 项 AI 生成",
      { title: "AI 快捷交互" }
    )

    for (const resolve of resolvers) {
      resolve({ success: true, text: "完成" })
    }
    await Promise.all(pendingJobs)
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
      "工作记忆",
      {
        status: "preview",
        tags: [],
        reuseSameResultBlock: false
      }
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
  })

  it("passes tags and reuseSameResultBlock to insert", async () => {
    await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "trade-offs",
      blockText: "context",
      promptLabel: "英语闪卡",
      promptText: "解释词义",
      includeBlockContext: true,
      commitMode: "direct",
      tags: ["英语", "词汇"],
      reuseSameResultBlock: true
    })
    const { insertQuickResultAsChild } = await import("./aiQuickInteract")
    expect(insertQuickResultAsChild).toHaveBeenCalledWith(
      10,
      "AI 解释正文",
      "英语闪卡",
      "trade-offs",
      {
        status: "kept",
        tags: ["英语", "词汇"],
        reuseSameResultBlock: true
      }
    )
  })

  it("skips preview job when insert reuses an existing result root", async () => {
    const { insertQuickResultAsChild } = await import("./aiQuickInteract")
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: true,
      blockId: 888,
      reused: true
    })
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "word",
      blockText: "ctx",
      promptLabel: "英语闪卡",
      promptText: "解释",
      includeBlockContext: true,
      commitMode: "preview",
      reuseSameResultBlock: true
    })
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeUndefined()
  })

  it("detaches prior ready jobs on the same root when a later insert reuses it", async () => {
    const { insertQuickResultAsChild, dismissQuickResult } = await import(
      "./aiQuickInteract"
    )
    // 模拟第一次预览：真实走 job 队列留下 ready 根 888
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: true,
      blockId: 888,
      reused: false
    })
    const firstId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "a",
      blockText: "ctx",
      promptLabel: "英语闪卡",
      promptText: "解释",
      includeBlockContext: true,
      commitMode: "preview",
      reuseSameResultBlock: true
    })
    const first = (
      aiQuickJobsState.jobs as Array<{
        id: string
        status: string
        resultRootBlockId: number | null
      }>
    ).find((j) => j.id === firstId)
    expect(first?.status).toBe("ready")
    expect(first?.resultRootBlockId).toBe(888)

    // 第二次合并复用同一根
    vi.mocked(insertQuickResultAsChild).mockResolvedValueOnce({
      success: true,
      blockId: 888,
      reused: true
    })
    const secondId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "b",
      blockText: "ctx",
      promptLabel: "英语闪卡",
      promptText: "解释",
      includeBlockContext: true,
      commitMode: "preview",
      reuseSameResultBlock: true
    })

    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === firstId)
    ).toBeUndefined()
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === secondId)
    ).toBeUndefined()
    // 不得 delete 结果树
    expect(dismissQuickResult).not.toHaveBeenCalled()
  })

  it("direct commit inserts as kept and removes job without preview UI", async () => {
    const jobId = await startBackgroundQuickInsertJob({
      pluginName: "orca-srs",
      sourceBlockId: 10,
      selectedText: "apple",
      blockText: "I like apple pie",
      promptLabel: "查词",
      promptText: "解释词义",
      includeBlockContext: true,
      commitMode: "direct"
    })

    expect(jobId).toMatch(/^qi-job-/)
    const { insertQuickResultAsChild, keepQuickResult } = await import(
      "./aiQuickInteract"
    )
    expect(insertQuickResultAsChild).toHaveBeenCalledWith(
      10,
      "AI 解释正文",
      "查词",
      "apple",
      {
        status: "kept",
        tags: [],
        reuseSameResultBlock: false
      }
    )
    expect(keepQuickResult).not.toHaveBeenCalled()
    // 直接写入不保留 ready 任务
    expect(
      (aiQuickJobsState.jobs as Array<{ id: string }>).find((j) => j.id === jobId)
    ).toBeUndefined()
    expect((globalThis as any).orca.notify).not.toHaveBeenCalledWith(
      "success",
      expect.anything(),
      expect.anything()
    )
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

  it("keeps a failed quick-card job and preview available for retry", async () => {
    const { keepQuickCardJob } = await import("./aiQuickCardJob")
    vi.mocked(keepQuickCardJob)
      .mockResolvedValueOnce({ success: false, error: "移出卡片失败：moveBlocks failed" })
      .mockResolvedValueOnce({ success: true })
    const job = installReadyCardJob()

    await keepBackgroundQuickJob(job.id)

    expect(keepQuickCardJob).toHaveBeenCalledTimes(1)
    expect(aiQuickJobsState.jobs).toHaveLength(1)
    expect(aiQuickJobsState.jobs[0]).toMatchObject({
      id: job.id,
      status: "ready",
      resultRootBlockId: 999,
      cardBlockIds: [1001, 1002],
      terminalActionPending: false
    })
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("可再次点击保留重试"),
      expect.objectContaining({ title: "AI 快捷制卡" })
    )

    await keepBackgroundQuickJob(job.id)

    expect(keepQuickCardJob).toHaveBeenCalledTimes(2)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("runs only the first of two concurrent quick-card keep actions", async () => {
    const { keepQuickCardJob } = await import("./aiQuickCardJob")
    let resolveKeep!: (value: { success: true }) => void
    const pendingKeep = new Promise<{ success: true }>((resolve) => {
      resolveKeep = resolve
    })
    vi.mocked(keepQuickCardJob).mockReturnValueOnce(pendingKeep)
    const job = installReadyCardJob()

    const first = keepBackgroundQuickJob(job.id)
    const second = keepBackgroundQuickJob(job.id)

    expect(aiQuickJobsState.jobs[0]?.terminalActionPending).toBe(true)
    await vi.waitFor(() => {
      expect(keepQuickCardJob).toHaveBeenCalledTimes(1)
    })
    resolveKeep({ success: true })
    await Promise.all([first, second])

    expect(keepQuickCardJob).toHaveBeenCalledTimes(1)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("makes dismiss a no-op while quick-card keep is running", async () => {
    const { dismissQuickCardJob, keepQuickCardJob } = await import(
      "./aiQuickCardJob"
    )
    let resolveKeep!: (value: { success: true }) => void
    const pendingKeep = new Promise<{ success: true }>((resolve) => {
      resolveKeep = resolve
    })
    vi.mocked(keepQuickCardJob).mockReturnValueOnce(pendingKeep)
    const job = installReadyCardJob()

    const keep = keepBackgroundQuickJob(job.id)
    const dismiss = dismissBackgroundQuickJob(job.id)

    await vi.waitFor(() => {
      expect(keepQuickCardJob).toHaveBeenCalledTimes(1)
    })
    expect(dismissQuickCardJob).not.toHaveBeenCalled()
    resolveKeep({ success: true })
    await Promise.all([keep, dismiss])

    expect(dismissQuickCardJob).not.toHaveBeenCalled()
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it("removes a quick-card job after keep succeeds", async () => {
    const { keepQuickCardJob } = await import("./aiQuickCardJob")
    const job = installReadyCardJob()

    await keepBackgroundQuickJob(job.id)

    expect(keepQuickCardJob).toHaveBeenCalledTimes(1)
    expect(aiQuickJobsState.jobs).toEqual([])
  })

  it.each(["问答卡", "填空卡", "选择题"])(
    "%s card preview does not mount child selection",
    (promptLabel) => {
      const job = installReadyCardJob(`quick-card-${promptLabel}`)
      job.promptLabel = promptLabel

      expect(shouldMountChildSelectionActions(job)).toBe(false)
    }
  )

  it("keeps child selection enabled for text quick-interaction previews", () => {
    expect(shouldMountChildSelectionActions({ kind: "quick" })).toBe(true)
    expect(shouldMountChildSelectionActions({})).toBe(true)
  })

  it("rejects keep-selected for card jobs without moving or removing cards", async () => {
    const { keepSelectedQuickResultBlocks } = await import("./aiQuickInteract")
    const job = installReadyCardJob()
    job.selectedResultBlockIds = [1001]

    await keepSelectedBackgroundQuickJob(job.id)

    expect(keepSelectedQuickResultBlocks).not.toHaveBeenCalled()
    expect(aiQuickJobsState.jobs).toHaveLength(1)
    expect(aiQuickJobsState.jobs[0]).toMatchObject({
      id: job.id,
      selectedResultBlockIds: [1001],
      terminalActionPending: false
    })
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "warn",
      "快捷制卡只能整张保留或整张取消",
      { title: "AI 快捷制卡" }
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
