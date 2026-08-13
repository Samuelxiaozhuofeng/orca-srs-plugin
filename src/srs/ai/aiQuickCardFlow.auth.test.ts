import { afterEach, describe, expect, it, vi } from "vitest"
import type { CursorData } from "../../orca.d.ts"
import { clearAISettingsCache } from "./aiSettingsSchema"

vi.mock("./aiService", () => ({
  generateFlashcardDrafts: vi.fn()
}))

describe("startQuickCardJob authorization errors", () => {
  afterEach(async () => {
    const { aiQuickJobsState, cancelAllBackgroundQuickJobs } = await import(
      "./aiQuickInteractJobs"
    )
    await cancelAllBackgroundQuickJobs()
    aiQuickJobsState.jobs = []
    clearAISettingsCache()
    vi.clearAllMocks()
    delete (globalThis as any).orca
  })

  async function runFailure(code: string, message: string) {
    const { generateFlashcardDrafts } = await import("./aiService")
    vi.mocked(generateFlashcardDrafts).mockResolvedValueOnce({
      success: false,
      error: { code, message }
    })
    ;(globalThis as any).orca = {
      notify: vi.fn(),
      state: {
        activePanel: null,
        blocks: {
          7: {
            id: 7,
            text: "测试文本",
            content: [{ t: "t", v: "测试文本" }]
          }
        },
        plugins: {
          "orca-srs": { settings: { "ai.apiKey": "configured-key" } }
        }
      }
    }
    clearAISettingsCache()
    const { startQuickCardJob } = await import("./aiQuickCardFlow")
    const { aiQuickJobsState } = await import("./aiQuickInteractJobs")
    const jobId = await startQuickCardJob({
      pluginName: "orca-srs",
      cursor: {
        anchor: { blockId: 7, isInline: true, index: 0, offset: 0 },
        focus: { blockId: 7, isInline: true, index: 0, offset: 0 },
        isForward: true
      } as CursorData,
      cardTypes: ["basic"]
    })
    return (aiQuickJobsState.jobs as Array<{
      id: string
      errorMessage: string | null
      canOpenConnectionSettings?: boolean
    }>).find((job) => job.id === jobId)
  }

  it("preserves 403 details and offers connection settings", async () => {
    const job = await runFailure("HTTP_403", "Account is forbidden")
    expect(job?.errorMessage).toBe("Account is forbidden")
    expect(job?.canOpenConnectionSettings).toBe(true)
  })

  it("does not offer connection settings for an unrelated HTTP failure", async () => {
    const job = await runFailure("HTTP_429", "Too many requests")
    expect(job?.errorMessage).toBe("Too many requests")
    expect(job?.canOpenConnectionSettings).toBe(false)
  })
})
