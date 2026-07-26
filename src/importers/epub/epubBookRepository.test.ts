import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import type { EpubBookManifestV1 } from "./types"
import { EPUB_PROP } from "./types"

const blockMap = new Map<DbId, Block>()

function makeBlock(id: DbId, text = ""): Block {
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
    properties: [],
    refs: [],
    backRefs: []
  } as unknown as Block
}

function setProp(block: Block, name: string, value: unknown, type = 2): void {
  const props = block.properties ?? []
  const idx = props.findIndex((p) => p.name === name)
  const prop = { name, value, type } as Block["properties"][number]
  if (idx >= 0) props[idx] = prop
  else props.push(prop)
  block.properties = props
}

const mockOrca = {
  invokeBackend: vi.fn(async (command: string, id: DbId) => {
    if (command === "get-block") return blockMap.get(id)
    return undefined
  }),
  commands: {
    invokeEditorCommand: vi.fn(async () => true)
  },
  state: {
    blocks: {} as Record<number, Block>
  }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

import { loadManifestFromBook } from "./epubBookRepository"

function makeManifest(
  overrides: Partial<EpubBookManifestV1> = {}
): EpubBookManifestV1 {
  return {
    version: 1,
    fingerprint: "fp-1",
    sourceFileName: "book.epub",
    sourceAssetPath: "asset://book.epub",
    status: "importing",
    bookBlockId: 100,
    chapters: [
      {
        key: "ch-1",
        spineIndex: 0,
        href: "ch1.xhtml",
        title: "Chapter 1",
        blockId: null,
        status: "pending",
        error: null
      }
    ],
    ...overrides
  }
}

beforeEach(() => {
  blockMap.clear()
  mockOrca.state.blocks = {}
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("epubBookRepository getBlock (via loadManifestFromBook)", () => {
  it("prefers backend get-block over a stale orca.state.blocks snapshot after persistManifest", async () => {
    // Backend has the post-persistManifest truth: chapter imported, status partial.
    const freshManifest = makeManifest({
      status: "partial",
      chapters: [
        {
          key: "ch-1",
          spineIndex: 0,
          href: "ch1.xhtml",
          title: "Chapter 1",
          blockId: 201,
          status: "imported",
          error: null
        }
      ]
    })
    const backendBlock = makeBlock(100)
    setProp(backendBlock, EPUB_PROP.manifest, JSON.stringify(freshManifest))
    blockMap.set(100, backendBlock)

    // orca.state still holds the pre-write snapshot: chapter pending, no blockId.
    const staleStateBlock = makeBlock(100)
    setProp(staleStateBlock, EPUB_PROP.manifest, JSON.stringify(makeManifest()))
    mockOrca.state.blocks[100] = staleStateBlock

    const loaded = await loadManifestFromBook(100)

    expect(mockOrca.invokeBackend).toHaveBeenCalledWith("get-block", 100)
    expect(loaded.status).toBe("partial")
    expect(loaded.chapters[0].blockId).toBe(201)
    expect(loaded.chapters[0].status).toBe("imported")
  })

  it("falls back to orca.state with a visible warning when backend get-block throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockOrca.invokeBackend.mockRejectedValueOnce(new Error("backend down"))

    const stateManifest = makeManifest({ status: "complete" })
    const stateBlock = makeBlock(100)
    setProp(stateBlock, EPUB_PROP.manifest, JSON.stringify(stateManifest))
    mockOrca.state.blocks[100] = stateBlock

    const loaded = await loadManifestFromBook(100)

    expect(loaded.status).toBe("complete")
    expect(loaded.fingerprint).toBe("fp-1")
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain("get-block #100 failed")
  })

  it("falls back to orca.state when the backend misses, and still fails visibly when both miss", async () => {
    // Backend miss (returns undefined), state hit: state value is used, no warning.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const stateBlock = makeBlock(100)
    setProp(stateBlock, EPUB_PROP.manifest, JSON.stringify(makeManifest()))
    mockOrca.state.blocks[100] = stateBlock

    const loaded = await loadManifestFromBook(100)
    expect(loaded.bookBlockId).toBe(100)
    expect(warnSpy).not.toHaveBeenCalled()

    // Both backend and state miss: loadManifestFromBook must throw, not return silently.
    delete mockOrca.state.blocks[100]
    await expect(loadManifestFromBook(100)).rejects.toThrow(/not found/)
  })
})
