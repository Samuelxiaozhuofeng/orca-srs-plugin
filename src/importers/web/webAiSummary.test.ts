/**
 * Web Import AI summary: prompt helpers, generate, insert structure.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ensureTestDom } from "../epub/testDom"
import {
  installDefaultEditorMocks,
  installWebImportOrcaMock,
  makeBlock,
  mockBlocks,
  mockOrca,
  resetBlocks,
  allocBlockId
} from "./testHelpers"
import {
  clearAISettingsCache,
  saveAISettings
} from "../../srs/ai/aiSettingsSchema"

beforeAll(() => {
  ensureTestDom()
})

installWebImportOrcaMock()

import {
  articleHtmlToPlainText,
  buildWebSummarySystemPrompt,
  generateWebArticleSummary,
  insertWebArticleSummary,
  normalizeSummaryMarkdown,
  splitSummaryLeadAndRest,
  WEB_AI_SUMMARY_HEADING
} from "./webAiSummary"
import { importScrapedArticle } from "./webImport"

beforeEach(async () => {
  resetBlocks()
  vi.clearAllMocks()
  installDefaultEditorMocks()
  clearAISettingsCache()
  // saveAISettings uses orca.plugins.setData — attach on global mock
  Object.assign(mockOrca, {
    plugins: {
      setData: vi.fn(async () => undefined),
      getData: vi.fn(async () => null)
    }
  })
  // Seed legacy settings fallback used by getAISettings before hydrate
  mockOrca.state.plugins["orca-srs"].settings["ai.apiKey"] = "sk-test-key"
  mockOrca.state.plugins["orca-srs"].settings["ai.apiUrl"] =
    "https://api.example.com/v1/chat/completions"
  mockOrca.state.plugins["orca-srs"].settings["ai.model"] = "gpt-test"
  try {
    await saveAISettings("orca-srs", {
      apiKey: "sk-test-key",
      apiUrl: "https://api.example.com/v1/chat/completions",
      model: "gpt-test",
      enableNativeWebSearch: false,
      reasoningEffort: "default"
    })
  } catch {
    // Settings keys alone are enough for getAISettings fallback
  }
})

describe("summary markdown helpers", () => {
  it("strips fenced wrappers and keeps bullets", () => {
    const raw = "```markdown\nAI 总结\n\n主旨一句话。\n\n- a\n- b\n```"
    const md = normalizeSummaryMarkdown(raw)
    expect(md).toContain("主旨一句话")
    expect(md).toContain("- a")
  })

  it("splitSummaryLeadAndRest recognizes AI 总结 heading", () => {
    const { lead, restMarkdown } = splitSummaryLeadAndRest(
      "AI 总结\n\n本文讨论 prewalk。\n\n- 要点一\n- 要点二"
    )
    expect(lead).toBe(WEB_AI_SUMMARY_HEADING)
    expect(restMarkdown).toContain("本文讨论")
    expect(restMarkdown).toContain("- 要点一")
  })

  it("coerceSummaryStructure rejects missing bullets and accepts valid shape", async () => {
    const { coerceSummaryStructure } = await import("./webAiSummary")
    const bad = coerceSummaryStructure("AI 总结\n\n只有一句话没有列表。")
    expect(bad.ok).toBe(false)

    const good = coerceSummaryStructure(
      "AI 总结\n\n这是足够长的总括句子用来通过校验。\n\n- a\n- b\n- c\n- d"
    )
    expect(good.ok).toBe(true)
    if (good.ok) {
      expect(good.bodyMarkdown).toMatch(/^- a/m)
      expect(good.bodyMarkdown.split("\n").filter((l) => l.startsWith("- ")).length).toBe(4)
    }
  })

  it("articleHtmlToPlainText drops tags", () => {
    const plain = articleHtmlToPlainText("<p>Hello <b>world</b></p>")
    expect(plain).toBe("Hello world")
  })

  it("system prompt requires Orca markdown shape", () => {
    const p = buildWebSummarySystemPrompt()
    expect(p).toMatch(/AI 总结/)
    expect(p).toMatch(/- /)
    expect(p).toMatch(/不要代码围栏/)
    expect(p).toMatch(/Markdown/)
  })
})

describe("generateWebArticleSummary", () => {
  it("returns NO_API_KEY when key missing", async () => {
    clearAISettingsCache()
    mockOrca.state.plugins["orca-srs"].settings["ai.apiKey"] = ""
    delete mockOrca.state.plugins["orca-srs"].settings["ai.apiKey"]
    // Clear cache with empty save path — force empty key via settings
    mockOrca.state.plugins["orca-srs"].settings = {
      "webImport.firecrawlApiKey": "x"
    } as any

    const result = await generateWebArticleSummary({
      pluginName: "orca-srs",
      title: "T",
      plainText: "Word ".repeat(50)
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("NO_API_KEY")
    }
  })

  it("parses chat completions content", async () => {
    // Re-seed AI settings after previous test wiped them
    mockOrca.state.plugins["orca-srs"].settings["ai.apiKey"] = "sk-test-key"
    mockOrca.state.plugins["orca-srs"].settings["ai.apiUrl"] =
      "https://api.example.com/v1/chat/completions"
    mockOrca.state.plugins["orca-srs"].settings["ai.model"] = "gpt-test"
    clearAISettingsCache()

    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "AI 总结\n\n这是一篇关于 prewalk 的文章。\n\n- 要点 A\n- 要点 B\n- 要点 C"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    })

    const result = await generateWebArticleSummary({
      pluginName: "orca-srs",
      title: "Prewalk",
      plainText: "Word ".repeat(80) + " prewalk keeps cost down.",
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.model).toBe("gpt-test")
      expect(result.markdown).toMatch(/prewalk/i)
      expect(result.markdown).toMatch(/- 要点/)
    }
    expect(fetchImpl).toHaveBeenCalled()
    const callArgs = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit | undefined
    ]
    const body = JSON.parse(String(callArgs[1]?.body ?? "{}"))
    expect(body.model).toBe("gpt-test")
    expect(body.stream).toBe(false)
    expect(body.tools).toBeUndefined()
  })
})

describe("insertWebArticleSummary", () => {
  it("inserts heading as firstChild before existing body children", async () => {
    const rootId = allocBlockId()
    const bodyA = allocBlockId()
    const bodyB = allocBlockId()
    mockBlocks[rootId] = makeBlock(rootId, {
      text: "Page",
      children: [bodyA as any, bodyB as any]
    })
    mockBlocks[bodyA] = makeBlock(bodyA, { text: "body A", parent: rootId as any })
    mockBlocks[bodyB] = makeBlock(bodyB, { text: "body B", parent: rootId as any })

    const result = await insertWebArticleSummary(
      rootId,
      "AI 总结\n\n总括段落在这里写满一点字足够校验。\n\n- 点一内容\n- 点二内容\n- 点三内容"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const root = mockBlocks[rootId]
    expect(root.children?.[0]).toBe(result.summaryBlockId)
    expect(root.children?.slice(1)).toEqual([bodyA, bodyB])
    const summary = mockBlocks[result.summaryBlockId as number]
    expect(summary.text).toBe(WEB_AI_SUMMARY_HEADING)
    expect((summary.children ?? []).length).toBeGreaterThan(0)
  })

  it("deletes summary heading if body insert fails", async () => {
    const rootId = allocBlockId()
    mockBlocks[rootId] = makeBlock(rootId, { text: "Page", children: [] })

    const orig = mockOrca.commands.invokeEditorCommand.getMockImplementation()
    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, _c: unknown, ...args: unknown[]) => {
        if (command === "core.editor.batchInsertText") {
          throw new Error("batch boom")
        }
        if (command === "core.editor.insertBlock") {
          const parentArg = args[0] as { id?: number } | null
          const position = args[1] as string
          const id = allocBlockId()
          const fragments = args[2] as Array<{ t: string; v: string }>
          mockBlocks[id] = makeBlock(id, {
            text: fragments?.[0]?.v ?? "",
            children: [],
            parent: parentArg?.id
          })
          if (parentArg?.id != null && mockBlocks[parentArg.id]) {
            const parent = mockBlocks[parentArg.id]
            if (position === "firstChild") {
              parent.children = [id as any, ...(parent.children ?? [])]
            } else {
              parent.children = [...(parent.children ?? []), id as any]
            }
          }
          return id
        }
        if (command === "core.editor.deleteBlocks") {
          const ids = args[0] as number[]
          for (const id of ids) {
            const block = mockBlocks[id]
            if (block?.parent != null && mockBlocks[block.parent as number]) {
              const p = mockBlocks[block.parent as number]
              p.children = (p.children ?? []).filter((c) => c !== id)
            }
            delete mockBlocks[id]
          }
          return undefined
        }
        return undefined
      }
    )

    const result = await insertWebArticleSummary(
      rootId,
      "AI 总结\n\n总括段落在这里写满一点字足够校验。\n\n- 点一内容\n- 点二内容\n- 点三内容"
    )
    expect(result.ok).toBe(false)
    expect(mockBlocks[rootId].children ?? []).toEqual([])

    if (orig) {
      mockOrca.commands.invokeEditorCommand.mockImplementation(orig)
    } else {
      installDefaultEditorMocks()
    }
  })
})

describe("importScrapedArticle with AI summary", () => {
  const sampleArticle = {
    title: "Sample Title",
    sourceUrl: "https://example.com/sample-ai",
    canonicalUrl: "https://example.com/sample-ai",
    hostname: "example.com",
    html: "<p>" + "Interesting article body content. ".repeat(20) + "</p>",
    textLength: 400
  }

  it("skips AI when disabled and still creates page", async () => {
    const result = await importScrapedArticle({
      article: sampleArticle,
      pluginName: "orca-srs",
      joinIncrementalReading: false,
      enableAiSummary: false
    })
    expect(result.kind).toBe("created")
    if (result.kind === "created") {
      expect(result.aiSummary.status).toBe("skipped")
    }
  })

  it("inserts AI summary without rolling back on AI HTTP failure", async () => {
    mockOrca.state.plugins["orca-srs"].settings["ai.apiKey"] = "sk-test-key"
    mockOrca.state.plugins["orca-srs"].settings["ai.model"] = "gpt-test"
    mockOrca.state.plugins["orca-srs"].settings["ai.apiUrl"] =
      "https://api.example.com/v1/chat/completions"
    clearAISettingsCache()

    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "boom" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    })

    const result = await importScrapedArticle({
      article: sampleArticle,
      pluginName: "orca-srs",
      joinIncrementalReading: false,
      enableAiSummary: true,
      aiFetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.kind).toBe("created")
    if (result.kind === "created") {
      expect(result.aiSummary.status).toBe("failed")
      // Page root still exists
      expect(mockBlocks[result.pageBlockId as number]).toBeTruthy()
    }
  })

  it("writes summary first when AI succeeds", async () => {
    mockOrca.state.plugins["orca-srs"].settings["ai.apiKey"] = "sk-test-key"
    mockOrca.state.plugins["orca-srs"].settings["ai.model"] = "gpt-test"
    mockOrca.state.plugins["orca-srs"].settings["ai.apiUrl"] =
      "https://api.example.com/v1/chat/completions"
    clearAISettingsCache()

    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "AI 总结\n\n这是足够长的总括句子用于测试写入路径。\n\n- 要点一详细说明\n- 要点二详细说明\n- 要点三详细说明"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    })

    const result = await importScrapedArticle({
      article: sampleArticle,
      pluginName: "orca-srs",
      joinIncrementalReading: false,
      enableAiSummary: true,
      aiFetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.kind).toBe("created")
    if (result.kind !== "created") return
    expect(result.aiSummary.status).toBe("inserted")
    if (result.aiSummary.status === "inserted") {
      const root = mockBlocks[result.pageBlockId as number]
      expect(root.children?.[0]).toBe(result.aiSummary.summaryBlockId)
      expect(mockBlocks[result.aiSummary.summaryBlockId as number]?.text).toBe(
        WEB_AI_SUMMARY_HEADING
      )
    }
  })
})
