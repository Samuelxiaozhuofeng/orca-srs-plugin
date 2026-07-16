/**
 * Web import unit tests: dedupe, Orca write, IR options, atomic rollback.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ensureTestDom } from "../epub/testDom"
import type { DbId } from "../../orca.d.ts"
import {
  installDefaultEditorMocks,
  installWebImportOrcaMock,
  allocBlockId,
  makeBlock,
  mockBlocks,
  mockOrca,
  resetBlocks
} from "./testHelpers"

beforeAll(() => {
  ensureTestDom()
})

installWebImportOrcaMock()

vi.mock("../../srs/topicCardCreator", () => ({
  createTopicCardByBlockId: vi.fn(async (blockId: DbId) => ({ blockId }))
}))

vi.mock("../../srs/incrementalReadingStorage", () => ({
  advanceDueToToday: vi.fn(async () => ({ due: new Date() }))
}))

// Import after mocks
import {
  findPageByCanonicalUrl,
  importScrapedArticle,
  WEB_PROP,
  WebImportError
} from "./webImport"
import { createTopicCardByBlockId } from "../../srs/topicCardCreator"
import { advanceDueToToday } from "../../srs/incrementalReadingStorage"

beforeEach(() => {
  resetBlocks()
  vi.clearAllMocks()
  installDefaultEditorMocks()
})

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

describe("findPageByCanonicalUrl / import dedupe", () => {
  it("returns existing id from property query and import does not create", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "query") return [42]
      return null
    })
    const id = await findPageByCanonicalUrl("https://example.com/a")
    expect(id).toBe(42)

    const article = {
      title: "T",
      sourceUrl: "https://example.com/a",
      canonicalUrl: "https://example.com/a",
      hostname: "example.com",
      html: "<p>hi</p>",
      textLength: 2
    }
    const result = await importScrapedArticle({
      article,
      pluginName: "orca-srs",
      joinIncrementalReading: true
    })
    expect(result.kind).toBe("already_exists")
    expect(result.pageBlockId).toBe(42)
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.insertBlock",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
    expect(mockOrca.nav.goTo).toHaveBeenCalledWith("block", { blockId: 42 })
  })

  it("throws when query fails and state scan finds nothing", async () => {
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "query") throw new Error("query down")
      return null
    })
    await expect(findPageByCanonicalUrl("https://example.com/z")).rejects.toMatchObject({
      code: "dedupe_query_failed"
    })
  })

  it("uses state scan hit when query fails", async () => {
    mockBlocks[7] = makeBlock(7, {
      text: "Old",
      properties: [
        { name: WEB_PROP.canonicalUrl, value: "https://example.com/old", type: 2 }
      ] as any
    })
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "query") throw new Error("query down")
      return null
    })
    const id = await findPageByCanonicalUrl("https://example.com/old")
    expect(id).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// Import write paths
// ---------------------------------------------------------------------------

describe("importScrapedArticle", () => {
  const sampleArticle = {
    title: "Sample Title",
    sourceUrl: "https://example.com/sample",
    canonicalUrl: "https://example.com/sample",
    hostname: "example.com",
    author: "Author",
    siteName: "Site",
    html: "<h2>Part</h2><p>Hello world content</p>",
    textLength: 20
  }

  it("creates page, sets properties with PropType.Text=1, joins IR by default", async () => {
    const result = await importScrapedArticle({
      article: sampleArticle,
      pluginName: "orca-srs",
      joinIncrementalReading: true,
      scheduleToday: false
    })
    expect(result.kind).toBe("created")
    if (result.kind !== "created") return
    expect(result.joinedIR).toBe(true)
    expect(result.scheduledToday).toBe(false)
    expect(createTopicCardByBlockId).toHaveBeenCalledWith(result.pageBlockId, "orca-srs")
    expect(advanceDueToToday).not.toHaveBeenCalled()
    const block = mockBlocks[result.pageBlockId as number]
    expect(block.properties?.find((p) => p.name === WEB_PROP.provider)?.value).toBe(
      "firecrawl"
    )
    expect(block.properties?.find((p) => p.name === WEB_PROP.canonicalUrl)?.value).toBe(
      sampleArticle.canonicalUrl
    )
    // All web.* string properties must use PropType.Text = 1 (not BlockRefs=2)
    const webProps = (block.properties ?? []).filter((p) =>
      String(p.name).startsWith("web.")
    )
    expect(webProps.length).toBeGreaterThan(0)
    for (const p of webProps) {
      expect(p.type).toBe(1)
    }
    expect(mockOrca.nav.goTo).toHaveBeenCalled()
  })

  it("does not init Topic when IR disabled", async () => {
    const result = await importScrapedArticle({
      article: sampleArticle,
      pluginName: "orca-srs",
      joinIncrementalReading: false
    })
    expect(result.kind).toBe("created")
    if (result.kind === "created") {
      expect(result.joinedIR).toBe(false)
    }
    expect(createTopicCardByBlockId).not.toHaveBeenCalled()
    expect(advanceDueToToday).not.toHaveBeenCalled()
  })

  it("calls advanceDueToToday when scheduleToday and joinIR", async () => {
    const result = await importScrapedArticle({
      article: sampleArticle,
      pluginName: "orca-srs",
      joinIncrementalReading: true,
      scheduleToday: true
    })
    expect(result.kind).toBe("created")
    if (result.kind === "created") {
      expect(result.scheduledToday).toBe(true)
      expect(advanceDueToToday).toHaveBeenCalledWith(result.pageBlockId)
    }
  })

  it("deletes root when Topic init returns null", async () => {
    vi.mocked(createTopicCardByBlockId).mockResolvedValueOnce(null)
    await expect(
      importScrapedArticle({
        article: sampleArticle,
        pluginName: "orca-srs",
        joinIncrementalReading: true
      })
    ).rejects.toMatchObject({ code: "topic_failed" })

    // root should have been deleted
    const remaining = Object.keys(mockBlocks)
    expect(remaining.length).toBe(0)
  })

  it("surfaces residual block id when cleanup fails", async () => {
    vi.mocked(createTopicCardByBlockId).mockResolvedValueOnce(null)
    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, _c: unknown, ...args: unknown[]) => {
        if (command === "core.editor.insertBlock") {
          const id = allocBlockId()
          mockBlocks[id] = makeBlock(id, { text: sampleArticle.title, children: [] })
          return id
        }
        if (command === "core.editor.setProperties") return undefined
        if (command === "core.editor.createAlias") return undefined
        if (command === "core.editor.batchInsertHTML") return undefined
        if (command === "core.editor.deleteBlocks") {
          throw new Error("delete denied")
        }
        return undefined
      }
    )

    try {
      await importScrapedArticle({
        article: sampleArticle,
        pluginName: "orca-srs",
        joinIncrementalReading: true
      })
      expect.unreachable("should throw")
    } catch (e) {
      expect(e).toBeInstanceOf(WebImportError)
      const err = e as WebImportError
      expect(err.code).toBe("cleanup_failed")
      expect(err.message).toMatch(/残留块 ID/)
      expect(err.residualBlockId).toBeTypeOf("number")
    }
  })

  it("rolls back root when createAlias fails and does not report created", async () => {
    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, _c: unknown, ...args: unknown[]) => {
        if (command === "core.editor.insertBlock") {
          const parentArg = args[0] as { id?: number } | null | undefined
          const id = allocBlockId()
          const fragments = args[2] as Array<{ t: string; v: string }> | undefined
          mockBlocks[id] = makeBlock(id, {
            text: fragments?.[0]?.v ?? "",
            children: [],
            parent: parentArg?.id
          })
          if (parentArg?.id != null && mockBlocks[parentArg.id]) {
            mockBlocks[parentArg.id].children = [
              ...(mockBlocks[parentArg.id].children ?? []),
              id as DbId
            ]
          }
          return id
        }
        if (command === "core.editor.createAlias") {
          throw new Error("alias denied")
        }
        if (command === "core.editor.deleteBlocks") {
          const ids = args[0] as number[]
          for (const id of ids) delete mockBlocks[id]
          return undefined
        }
        return undefined
      }
    )

    await expect(
      importScrapedArticle({
        article: sampleArticle,
        pluginName: "orca-srs",
        joinIncrementalReading: false
      })
    ).rejects.toMatchObject({ code: "import_failed" })

    expect(Object.keys(mockBlocks).length).toBe(0)
    expect(createTopicCardByBlockId).not.toHaveBeenCalled()
    // Must not navigate as if created
    expect(mockOrca.nav.goTo).not.toHaveBeenCalled()
  })

  it("fails clearly when insertBlock returns a non-number id", async () => {
    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string) => {
        if (command === "core.editor.insertBlock") {
          return "not-an-id"
        }
        return undefined
      }
    )

    await expect(
      importScrapedArticle({
        article: sampleArticle,
        pluginName: "orca-srs",
        joinIncrementalReading: false
      })
    ).rejects.toMatchObject({ code: "import_failed" })

    await expect(
      importScrapedArticle({
        article: sampleArticle,
        pluginName: "orca-srs",
        joinIncrementalReading: false
      })
    ).rejects.toThrow(/insertBlock|有效块 ID/)

    expect(Object.keys(mockBlocks).length).toBe(0)
    expect(mockOrca.nav.goTo).not.toHaveBeenCalled()
  })
})
