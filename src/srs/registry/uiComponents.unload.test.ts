/**
 * 低危#17：unregisterUIComponents 必须等待 AI 后台任务取消完成（有界超时），
 * 使 unload 序列 await 到确定的卸载时序；失败/超时保持可见。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { cancelAllBackgroundQuickJobs } = vi.hoisted(() => ({
  cancelAllBackgroundQuickJobs: vi.fn<() => Promise<void>>()
}))

// 仅隔离深层组件依赖（模块顶层读取 window.React / window.Valtio / orca），
// 被测逻辑（注销 + AI 取消等待）全部真实执行
vi.mock("../ai/aiQuickInteractJobs", () => ({ cancelAllBackgroundQuickJobs }))
vi.mock("../../components/AIDialogMount", () => ({ AIDialogMount: () => null }))
vi.mock("../../components/AIQuickInteractMount", () => ({
  AIQuickInteractMount: () => null
}))
vi.mock("../../components/AIPromptManagerMount", () => ({
  AIPromptManagerMount: () => null
}))
vi.mock("../../components/AIServiceSettingsMount", () => ({
  AIServiceSettingsMount: () => null
}))
vi.mock("../../components/IRBookDialogMount", () => ({
  IRBookDialogMount: () => null
}))
vi.mock("../../components/epub-import/EpubImportDialogMount", () => ({
  EpubImportDialogMount: () => null
}))
vi.mock("../../components/web-import/WebImportDialogMount", () => ({
  WebImportDialogMount: () => null
}))
vi.mock("../../components/SrsErrorBoundary", () => ({
  default: () => null
}))
vi.mock("../ai/aiToolbarPromptStore", () => ({
  getToolbarAIPrompts: () => []
}))

type OrcaMock = {
  headbar: { unregisterHeadbarButton: ReturnType<typeof vi.fn> }
  toolbar: { unregisterToolbarButton: ReturnType<typeof vi.fn> }
  slashCommands: { unregisterSlashCommand: ReturnType<typeof vi.fn> }
}

function installGlobals(): OrcaMock {
  vi.stubGlobal("window", { React: {} })
  const orcaMock: OrcaMock = {
    headbar: { unregisterHeadbarButton: vi.fn() },
    toolbar: { unregisterToolbarButton: vi.fn() },
    slashCommands: { unregisterSlashCommand: vi.fn() }
  }
  vi.stubGlobal("orca", orcaMock)
  return orcaMock
}

async function loadModule() {
  return import("./uiComponents")
}

describe("unregisterUIComponents（低危#17）", () => {
  let orcaMock: OrcaMock

  beforeEach(() => {
    cancelAllBackgroundQuickJobs.mockReset()
    orcaMock = installGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("await 到 AI 后台任务取消完成才返回；同步注销不被取消阻塞", async () => {
    let resolveCancel!: () => void
    cancelAllBackgroundQuickJobs.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCancel = resolve
      })
    )
    const { unregisterUIComponents } = await loadModule()

    let settled = false
    const pending = unregisterUIComponents("orca-srs").then(() => {
      settled = true
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    // 同步注销已完成，但整体仍在等待 AI 取消
    expect(orcaMock.slashCommands.unregisterSlashCommand).toHaveBeenCalled()
    expect(orcaMock.headbar.unregisterHeadbarButton).toHaveBeenCalled()
    expect(orcaMock.toolbar.unregisterToolbarButton).toHaveBeenCalled()
    expect(settled).toBe(false)

    resolveCancel()
    await pending
    expect(settled).toBe(true)
    expect(cancelAllBackgroundQuickJobs).toHaveBeenCalledTimes(1)
  })

  it("取消失败时错误向上抛出（进入 unload 序列 cleanupErrors），不吞错", async () => {
    cancelAllBackgroundQuickJobs.mockRejectedValue(new Error("cancel boom"))
    const { unregisterUIComponents } = await loadModule()

    await expect(unregisterUIComponents("orca-srs")).rejects.toThrow(
      "cancel boom"
    )
    // 失败不阻断同步注销（注销先于等待执行）
    expect(orcaMock.slashCommands.unregisterSlashCommand).toHaveBeenCalled()
  })

  it("取消悬挂时按有界超时抛错，卸载时序保持确定", async () => {
    cancelAllBackgroundQuickJobs.mockReturnValue(new Promise<void>(() => {}))
    const { unregisterUIComponents } = await loadModule()

    await expect(
      unregisterUIComponents("orca-srs", { aiCancelTimeoutMs: 10 })
    ).rejects.toThrow(/超时/)
  })

  it("超时放弃等待后取消才失败：仍打印可见日志，不静默", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    let rejectCancel!: (error: Error) => void
    cancelAllBackgroundQuickJobs.mockReturnValue(
      new Promise<void>((_, reject) => {
        rejectCancel = reject
      })
    )
    const { unregisterUIComponents } = await loadModule()

    await expect(
      unregisterUIComponents("orca-srs", { aiCancelTimeoutMs: 10 })
    ).rejects.toThrow(/超时/)

    rejectCancel(new Error("late boom"))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("AI 后台任务取消在卸载超时放弃等待后失败")
      )
    ).toBe(true)
    errorSpy.mockRestore()
  })
})
