import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import { ensureTestDom } from "./testDom"
import { buildMinimalEpub3 } from "./epubFixtures"
import { EPUB_PROP } from "./types"

beforeAll(() => {
  ensureTestDom()
})

const blockMap = new Map<DbId, Block>()
let nextId = 1
let nextRefId = 10000
const uploadedAssets = new Map<string, ArrayBuffer>()

function makeBlock(id: DbId, text = "", props: Block["properties"] = []): Block {
  return {
    id,
    content: [],
    text,
    created: new Date(),
    modified: new Date(),
    parent: undefined,
    left: undefined,
    children: [],
    aliases: [],
    properties: props,
    refs: [],
    backRefs: []
  } as unknown as Block
}

function setProp(block: Block, name: string, value: unknown, type = 2): void {
  const props = block.properties ?? []
  const idx = props.findIndex((p) => p.name === name)
  const prop = { name, value, type } as any
  if (idx >= 0) props[idx] = prop
  else props.push(prop)
  block.properties = props
}

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, ...args: any[]) => {
    if (command === "get-block") {
      return blockMap.get(args[0])
    }
    if (command === "upload-asset-binary") {
      const mime = args[0] as string
      const data = args[1] as ArrayBuffer
      const path = `asset://${mime}/${uploadedAssets.size}`
      uploadedAssets.set(path, data)
      return path
    }
    if (command === "query") {
      return []
    }
    return undefined
  }),
  commands: {
    invokeEditorCommand: vi.fn(async (command: string, ...args: any[]) => {
      if (command === "core.editor.insertBlock") {
        const id = nextId++
        const content = args[3] as Array<{ t: string; v: string }> | undefined
        const text = content?.[0]?.v ?? ""
        const parent = args[1] as Block | null
        const block = makeBlock(id, text)
        blockMap.set(id, block)
        ;(orca.state.blocks as any)[id] = block
        if (parent?.id != null) {
          const p = blockMap.get(parent.id)
          if (p) {
            p.children = [...(p.children ?? []), id]
          }
        }
        return id
      }
      if (command === "core.editor.createAlias") {
        return true
      }
      if (command === "core.editor.createRef") {
        return nextRefId++
      }
      if (command === "core.editor.setProperties") {
        const ids = args[1] as DbId[]
        const props = args[2] as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = blockMap.get(id) ?? (orca.state.blocks as any)[id]
          if (!block) throw new Error(`block ${id} missing`)
          for (const prop of props) {
            setProp(block, prop.name, prop.value, prop.type)
          }
        }
        return true
      }
      if (command === "core.editor.batchInsertHTML") {
        return true
      }
      if (command === "core.editor.insertLink") {
        return true
      }
      if (command === "core.editor.setBlocksContent") {
        const updates = args[1] as Array<{ id: DbId; content: Block["content"] }>
        for (const update of updates) {
          const block = blockMap.get(update.id)
          if (block) block.content = update.content
        }
        return true
      }
      return true
    })
  },
  utils: {
    getAssetPath: (p: string) => p,
    setSelectionFromCursorData: vi.fn(async () => true)
  },
  nav: {
    goTo: vi.fn(),
    replace: vi.fn()
  },
  notify: vi.fn(),
  state: {
    blocks: {} as Record<number, Block>,
    activePanel: "panel-1"
  }
}

// @ts-expect-error test global
globalThis.orca = mockOrca
// @ts-expect-error test fetch
globalThis.fetch = vi.fn(async (url: string) => {
  const data = uploadedAssets.get(url)
  if (!data) {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
  }
  return { ok: true, status: 200, arrayBuffer: async () => data }
})

import { importEpub, resumeEpubImport } from "./epubImportService"
import {
  ensureInlineReference,
  findBookByFingerprint,
  loadManifestFromBook
} from "./epubBookRepository"
import { parseEpub } from "./epubParser"

function installDefaultBackend() {
  mockOrca.invokeBackend.mockImplementation(async (command: string, ...args: any[]) => {
    if (command === "get-block") {
      return blockMap.get(args[0])
    }
    if (command === "upload-asset-binary") {
      const mime = args[0] as string
      const data = args[1] as ArrayBuffer
      const path = `asset://${mime}/${uploadedAssets.size}`
      uploadedAssets.set(path, data)
      return path
    }
    if (command === "query") {
      // Fall through to state scan for fingerprint lookup
      return []
    }
    return undefined
  })

  mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
    if (command === "core.editor.insertBlock") {
      const id = nextId++
      const content = args[3] as Array<{ t: string; v: string }> | undefined
      const text = content?.[0]?.v ?? ""
      const parent = args[1] as Block | null
      const block = makeBlock(id, text)
      blockMap.set(id, block)
      ;(orca.state.blocks as any)[id] = block
      if (parent?.id != null) {
        const p = blockMap.get(parent.id)
        if (p) {
          p.children = [...(p.children ?? []), id]
        }
      }
      return id
    }
    if (command === "core.editor.createAlias") {
      return true
    }
    if (command === "core.editor.createRef") {
      const from = args[1] as DbId
      const to = args[2] as DbId
      const type = args[3] as number
      const alias = args[4] as string | undefined
      const id = nextRefId++
      const block = blockMap.get(from)
      if (!block) throw new Error(`block ${from} missing`)
      block.refs = [...(block.refs ?? []), { id, from, to, type, alias }]
      return id
    }
    if (command === "core.editor.setProperties") {
      const ids = args[1] as DbId[]
      const props = args[2] as Array<{ name: string; value: unknown; type: number }>
      for (const id of ids) {
        const block = blockMap.get(id) ?? (orca.state.blocks as any)[id]
        if (!block) throw new Error(`block ${id} missing`)
        for (const prop of props) {
          setProp(block, prop.name, prop.value, prop.type)
        }
      }
      return true
    }
    if (command === "core.editor.batchInsertHTML") {
      return true
    }
    if (command === "core.editor.insertLink") {
      return true
    }
    if (command === "core.editor.setBlocksContent") {
      const updates = args[1] as Array<{ id: DbId; content: Block["content"] }>
      for (const update of updates) {
        const block = blockMap.get(update.id)
        if (block) block.content = update.content
      }
      return true
    }
    return true
  })
}

beforeEach(() => {
  blockMap.clear()
  uploadedAssets.clear()
  nextId = 1
  nextRefId = 10000
  mockOrca.state.blocks = {}
  vi.clearAllMocks()
  installDefaultBackend()
})

describe("importEpub plain import", () => {
  it("creates book + chapters without any card/ir properties", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    const result = await importEpub({
      buffer,
      sourceFileName: "test.epub",
      bookTitle: "My Book",
      selectedChapterKeys: parsed.chapters.map((c) => c.key)
    })

    expect(result.kind).toBe("created")
    expect(result.status).toBe("complete")
    expect(result.importedChapterIds).toHaveLength(2)

    const book = blockMap.get(result.bookBlockId)!
    expect(getProp(book, EPUB_PROP.fingerprint)).toBe(result.fingerprint)
    expect(getProp(book, EPUB_PROP.importStatus)).toBe("complete")
    expect(typeof getProp(book, EPUB_PROP.manifest)).toBe("string")

    // No SRS/IR state on book or chapters
    for (const block of blockMap.values()) {
      const names = (block.properties ?? []).map((p) => p.name)
      expect(names.some((n) => n.startsWith("ir."))).toBe(false)
      expect(names.some((n) => n.startsWith("srs."))).toBe(false)
      expect(block.refs?.some((r) => r.type === 2)).toBeFalsy()
    }

    for (const chapterId of result.importedChapterIds) {
      const ch = blockMap.get(chapterId)!
      expect(getProp(ch, EPUB_PROP.bookId)).toBe(result.bookBlockId)
      expect(getProp(ch, EPUB_PROP.chapterKey)).toBeTruthy()
    }

    const chaptersHeading = (book.children ?? [])
      .map((id) => blockMap.get(id))
      .find((block) => block?.text === "章节:")!
    expect(chaptersHeading.children).toHaveLength(2)
    for (const refBlockId of chaptersHeading.children ?? []) {
      const refBlock = blockMap.get(refBlockId)!
      expect(refBlock.refs?.some((ref) => ref.type === 1)).toBe(true)
      expect(refBlock.content?.[0]).toMatchObject({ t: "r" })
      expect(typeof refBlock.content?.[0]?.v).toBe("number")
    }
  })

  it("loads epub.manifest when get-block returns a single-element string array", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    const result = await importEpub({
      buffer,
      sourceFileName: "array-wrapper.epub",
      bookTitle: "Array Wrapper Book",
      selectedChapterKeys: parsed.chapters.map((c) => c.key)
    })

    const book = blockMap.get(result.bookBlockId)!
    const manifestJson = getProp(book, EPUB_PROP.manifest)
    setProp(book, EPUB_PROP.manifest, [manifestJson], 2)
    delete mockOrca.state.blocks[result.bookBlockId]

    const manifest = await loadManifestFromBook(result.bookBlockId)

    expect(manifest.bookBlockId).toBe(result.bookBlockId)
    expect(manifest.status).toBe("complete")
    expect(manifest.chapters).toHaveLength(result.manifest.chapters.length)
  })

  it("stops with no book when source upload fails", async () => {
    mockOrca.invokeBackend.mockImplementation(async (command: string) => {
      if (command === "upload-asset-binary") {
        throw new Error("upload denied")
      }
      if (command === "query") return []
      return undefined
    })

    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    await expect(
      importEpub({
        buffer,
        sourceFileName: "x.epub",
        bookTitle: "X",
        selectedChapterKeys: [parsed.chapters[0].key]
      })
    ).rejects.toThrow(/源 EPUB 上传失败/)

    expect(blockMap.size).toBe(0)
  })

  it("exact fingerprint opens existing book without writes", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    const first = await importEpub({
      buffer,
      sourceFileName: "test.epub",
      bookTitle: "My Book",
      selectedChapterKeys: parsed.chapters.map((c) => c.key)
    })
    const sizeAfterFirst = blockMap.size

    const second = await importEpub({
      buffer,
      sourceFileName: "test.epub",
      bookTitle: "My Book Copy Name",
      selectedChapterKeys: parsed.chapters.map((c) => c.key)
    })

    expect(second.kind).toBe("already_exists")
    expect(second.bookBlockId).toBe(first.bookBlockId)
    expect(blockMap.size).toBe(sizeAfterFirst)
    expect(mockOrca.nav.goTo).toHaveBeenCalled()
  })

  it("partial failure keeps successes and resume imports remaining", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    let chapterInserts = 0

    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.insertBlock") {
        const content = args[3] as Array<{ t: string; v: string }> | undefined
        const text = content?.[0]?.v ?? ""
        // Fail second chapter page creation (level 1 heading titled 第二章)
        if (text === "第二章") {
          chapterInserts += 1
          if (chapterInserts === 1) {
            throw new Error("simulated chapter failure")
          }
        }
        const id = nextId++
        const parent = args[1] as Block | null
        const block = makeBlock(id, text)
        blockMap.set(id, block)
        ;(orca.state.blocks as any)[id] = block
        if (parent?.id != null) {
          const p = blockMap.get(parent.id)
          if (p) p.children = [...(p.children ?? []), id]
        }
        return id
      }
      if (command === "core.editor.setProperties") {
        const ids = args[1] as DbId[]
        const props = args[2] as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = blockMap.get(id) ?? (orca.state.blocks as any)[id]
          if (!block) throw new Error(`block ${id} missing`)
          for (const prop of props) setProp(block, prop.name, prop.value, prop.type)
        }
        return true
      }
      if (command === "core.editor.createAlias") return true
      if (command === "core.editor.createRef") return nextRefId++
      if (command === "core.editor.batchInsertHTML") return true
      if (command === "core.editor.insertLink") return true
      if (command === "core.editor.setBlocksContent") return true
      return true
    })

    // restore upload backend
    mockOrca.invokeBackend.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "get-block") return blockMap.get(args[0])
      if (command === "upload-asset-binary") {
        const mime = args[0] as string
        const data = args[1] as ArrayBuffer
        const path = `asset://${mime}/${uploadedAssets.size}`
        uploadedAssets.set(path, data)
        return path
      }
      if (command === "query") return []
      return undefined
    })

    const first = await importEpub({
      buffer,
      sourceFileName: "partial.epub",
      bookTitle: "Partial Book",
      selectedChapterKeys: parsed.chapters.map((c) => c.key)
    })

    expect(first.status).toBe("partial")
    expect(first.importedChapterIds.length).toBe(1)
    expect(first.failedChapters.length).toBe(1)

    const resumed = await resumeEpubImport(first.bookBlockId)
    expect(resumed.status).toBe("complete")
    expect(resumed.importedChapterIds.length).toBe(2)
    // no duplicate chapter keys as imported
    const keys = resumed.manifest.chapters.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("property write failure keeps blockId so resume does not duplicate pages", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    let propFailOnce = true
    const rootHeadingCreates: string[] = []

    mockOrca.commands.invokeEditorCommand.mockImplementation(async (command: string, ...args: any[]) => {
      if (command === "core.editor.insertBlock") {
        const content = args[3] as Array<{ t: string; v: string }> | undefined
        const text = content?.[0]?.v ?? ""
        const parent = args[1] as Block | null
        // Track root-level chapter pages (parent null)
        if (parent == null && text) {
          rootHeadingCreates.push(text)
        }
        const id = nextId++
        const block = makeBlock(id, text)
        blockMap.set(id, block)
        ;(orca.state.blocks as any)[id] = block
        if (parent?.id != null) {
          const p = blockMap.get(parent.id)
          if (p) p.children = [...(p.children ?? []), id]
        }
        return id
      }
      if (command === "core.editor.setProperties") {
        const ids = args[1] as DbId[]
        const props = args[2] as Array<{ name: string; value: unknown; type: number }>
        // Fail first chapter epub.* write once
        if (
          propFailOnce
          && props.some((p) => p.name === "epub.chapterKey")
        ) {
          propFailOnce = false
          throw new Error("simulated property write failure")
        }
        for (const id of ids) {
          const block = blockMap.get(id) ?? (orca.state.blocks as any)[id]
          if (!block) throw new Error(`block ${id} missing`)
          for (const prop of props) setProp(block, prop.name, prop.value, prop.type)
        }
        return true
      }
      if (command === "core.editor.createAlias") return true
      if (command === "core.editor.createRef") return nextRefId++
      if (command === "core.editor.batchInsertHTML") return true
      if (command === "core.editor.insertLink") return true
      if (command === "core.editor.setBlocksContent") return true
      return true
    })

    const first = await importEpub({
      buffer,
      sourceFileName: "props-fail.epub",
      bookTitle: "Props Fail Book",
      selectedChapterKeys: [parsed.chapters[0].key]
    })

    expect(first.status).toBe("partial")
    expect(first.failedChapters).toHaveLength(1)
    expect(first.failedChapters[0].blockId).not.toBeNull()
    const partialBlockId = first.failedChapters[0].blockId
    const createsBeforeResume = rootHeadingCreates.filter((t) => t === "第一章").length
    expect(createsBeforeResume).toBe(1)

    const resumed = await resumeEpubImport(first.bookBlockId)
    expect(resumed.status).toBe("complete")
    expect(resumed.importedChapterIds).toContain(partialBlockId)
    const createsAfterResume = rootHeadingCreates.filter((t) => t === "第一章").length
    expect(createsAfterResume).toBe(1)
  })

  it("resume recovers a chapter page whose manifest checkpoint was not saved", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    const first = await importEpub({
      buffer,
      sourceFileName: "checkpoint.epub",
      bookTitle: "Checkpoint Book",
      selectedChapterKeys: [parsed.chapters[0].key]
    })
    const chapterId = first.importedChapterIds[0]
    const book = blockMap.get(first.bookBlockId)!
    const manifest = JSON.parse(String(getProp(book, EPUB_PROP.manifest)))
    manifest.status = "importing"
    manifest.chapters[0].blockId = null
    manifest.chapters[0].status = "pending"
    setProp(book, EPUB_PROP.manifest, JSON.stringify(manifest), 2)
    setProp(book, EPUB_PROP.importStatus, "importing", 2)
    const rootPagesBefore = Array.from(blockMap.values()).filter(
      (block) => block.parent == null && block.text === "第一章"
    ).length

    const resumed = await resumeEpubImport(first.bookBlockId)

    expect(resumed.status).toBe("complete")
    expect(resumed.importedChapterIds).toEqual([chapterId])
    const rootPagesAfter = Array.from(blockMap.values()).filter(
      (block) => block.parent == null && block.text === "第一章"
    ).length
    expect(rootPagesAfter).toBe(rootPagesBefore)
  })

  it("exact fingerprint with malformed manifest fails visibly", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    const first = await importEpub({
      buffer,
      sourceFileName: "test.epub",
      bookTitle: "My Book",
      selectedChapterKeys: [parsed.chapters[0].key]
    })
    const book = blockMap.get(first.bookBlockId)!
    setProp(book, EPUB_PROP.manifest, "{not-json", 2)

    await expect(
      importEpub({
        buffer,
        sourceFileName: "test.epub",
        bookTitle: "My Book",
        selectedChapterKeys: [parsed.chapters[0].key]
      })
    ).rejects.toThrow(/manifest|Malformed|JSON/i)
  })
})

describe("findBookByFingerprint", () => {
  it("finds book from state scan", async () => {
    const id = 42
    const block = makeBlock(id, "Book")
    setProp(block, EPUB_PROP.fingerprint, "deadbeef")
    blockMap.set(id, block)
    ;(orca.state.blocks as any)[id] = block
    expect(await findBookByFingerprint("deadbeef")).toBe(42)
    expect(await findBookByFingerprint("other")).toBeNull()
  })
})

describe("catalog reference recovery", () => {
  it("reuses a prior fallback text row instead of adding a duplicate", async () => {
    const heading = makeBlock(50, "章节:")
    const fallbackRow = makeBlock(51, "第一章")
    heading.children = [51]
    blockMap.set(50, heading)
    blockMap.set(51, fallbackRow)
    mockOrca.state.blocks[50] = heading
    mockOrca.state.blocks[51] = fallbackRow

    const result = await ensureInlineReference(60, 50, "第一章")

    expect(result).toBe(51)
    expect(mockOrca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setBlocksContent",
      null,
      [{ id: 51, content: [{ t: "t", v: "" }] }],
      false
    )
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalledWith(
      "core.editor.insertLink",
      expect.anything()
    )
    expect(mockOrca.utils.setSelectionFromCursorData).not.toHaveBeenCalled()
  })
})

function getProp(block: Block, name: string): unknown {
  return block.properties?.find((p) => p.name === name)?.value
}
