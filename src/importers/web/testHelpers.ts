/**
 * Shared mocks/helpers for web import tests.
 * Call installWebImportOrcaMock() before importing modules under test that read `orca`.
 */

import { vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"

export const mockBlocks: Record<number, Block> = {}
let nextId = 1000

export function setNextId(id: number): void {
  nextId = id
}

/** Allocate next mock block id (increments counter). */
export function allocBlockId(): number {
  return nextId++
}

export function makeBlock(id: number, partial: Partial<Block> = {}): Block {
  return {
    id: id as DbId,
    created: new Date(),
    modified: new Date(),
    text: partial.text ?? "",
    content: partial.content ?? null,
    properties: partial.properties ?? [],
    children: partial.children ?? [],
    refs: partial.refs ?? [],
    parent: partial.parent ?? null,
    left: partial.left ?? null,
    ...partial
  } as Block
}

export function resetBlocks(): void {
  for (const k of Object.keys(mockBlocks)) {
    delete mockBlocks[Number(k)]
  }
  nextId = 1000
}

export function getNextId(): number {
  return nextId
}

export const mockOrca = {
  state: {
    blocks: mockBlocks as Record<number, Block>,
    activePanel: "panel-1",
    plugins: {
      "orca-srs": {
        settings: {
          "webImport.firecrawlApiKey": "test-api-key-secret",
          "webImport.firecrawlApiUrl": "https://api.firecrawl.dev/v2/scrape"
        } as Record<string, string>
      }
    }
  },
  commands: {
    invokeEditorCommand: vi.fn()
  },
  invokeBackend: vi.fn(),
  nav: {
    goTo: vi.fn()
  },
  notify: vi.fn()
}

/** Stub global orca once per test file. */
export function installWebImportOrcaMock(): void {
  vi.stubGlobal("orca", mockOrca)
}

export function installDefaultEditorMocks(): void {
  mockOrca.state.plugins["orca-srs"].settings["webImport.firecrawlApiKey"] =
    "test-api-key-secret"

  mockOrca.commands.invokeEditorCommand.mockImplementation(
    async (command: string, _cursor: unknown, ...args: unknown[]) => {
      if (command === "core.editor.insertBlock") {
        const parentArg = args[0] as Block | null | undefined
        const id = allocBlockId()
        const fragments = args[2] as Array<{ t: string; v: string }> | undefined
        const text = fragments?.[0]?.v ?? ""
        mockBlocks[id] = makeBlock(id, {
          text,
          children: [],
          parent: parentArg?.id
        })
        if (parentArg?.id != null && mockBlocks[parentArg.id as number]) {
          const parent = mockBlocks[parentArg.id as number]
          parent.children = [...(parent.children ?? []), id as DbId]
        }
        return id
      }
      if (command === "core.editor.createAlias") {
        return undefined
      }
      if (command === "core.editor.setProperties") {
        const ids = args[0] as number[]
        const props = args[1] as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = mockBlocks[id]
          if (!block) continue
          const existing = [...(block.properties ?? [])]
          for (const p of props) {
            const idx = existing.findIndex((x) => x.name === p.name)
            if (idx >= 0) existing[idx] = p as any
            else existing.push(p as any)
          }
          block.properties = existing
        }
        return undefined
      }
      if (command === "core.editor.batchInsertHTML") {
        return undefined
      }
      if (command === "core.editor.deleteBlocks") {
        const ids = args[0] as number[]
        for (const id of ids) {
          delete mockBlocks[id]
        }
        return undefined
      }
      return undefined
    }
  )

  mockOrca.invokeBackend.mockImplementation(async (method: string, payload?: unknown) => {
    if (method === "query") {
      return []
    }
    if (method === "get-block") {
      return mockBlocks[payload as number]
    }
    return null
  })
}
