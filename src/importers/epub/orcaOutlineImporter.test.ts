import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../../orca.d.ts"
import { ensureTestDom } from "./testDom"
import { findHeadingParent, importHtmlAsOutline } from "./orcaOutlineImporter"

beforeAll(() => {
  ensureTestDom()
})

interface TestBlock extends Block {
  id: DbId
  text: string
  parent?: DbId
  children: DbId[]
  blockType?: string
  headingLevel?: number
  html?: string
}

const blockMap = new Map<DbId, TestBlock>()
let nextId = 1
const insertCalls: Array<{
  command: string
  parentId: DbId | null
  text?: string
  type?: string
  level?: number
  html?: string
}> = []

function makeBlock(
  id: DbId,
  text = "",
  extras: Partial<TestBlock> = {}
): TestBlock {
  return {
    id,
    content: [],
    text,
    created: new Date(),
    modified: new Date(),
    parent: extras.parent,
    left: undefined,
    children: extras.children ?? [],
    aliases: [],
    properties: [],
    refs: [],
    backRefs: [],
    blockType: extras.blockType,
    headingLevel: extras.headingLevel,
    html: extras.html
  } as TestBlock
}

const mockOrca = {
  commands: {
    invokeEditorCommand: vi.fn(async (command: string, ...args: any[]) => {
      if (command === "core.editor.insertBlock") {
        const parent = args[1] as Block | null
        const content = args[3] as Array<{ t: string; v: string }> | undefined
        const repr = args[4] as { type?: string; level?: number } | undefined
        const text = content?.[0]?.v ?? ""
        const id = nextId++
        const block = makeBlock(id, text, {
          parent: parent?.id,
          blockType: repr?.type,
          headingLevel: repr?.level
        })
        blockMap.set(id, block)
        ;(orca.state.blocks as any)[id] = block
        if (parent?.id != null) {
          const p = blockMap.get(parent.id)
          if (p) p.children = [...p.children, id]
        }
        insertCalls.push({
          command,
          parentId: parent?.id ?? null,
          text,
          type: repr?.type,
          level: repr?.level
        })
        return id
      }

      if (command === "core.editor.batchInsertHTML") {
        const parent = args[1] as Block
        const html = String(args[3] ?? "")
        // Approximate Orca: each top-level element becomes a child block.
        const template = document.createElement("template")
        template.innerHTML = html
        const tops = Array.from(template.content.childNodes).filter(
          (n) =>
            n.nodeType === Node.ELEMENT_NODE ||
            (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim())
        )
        for (const node of tops) {
          const id = nextId++
          const text =
            node.nodeType === Node.TEXT_NODE
              ? (node.textContent ?? "").trim()
              : ((node as HTMLElement).textContent ?? "").replace(/\s+/g, " ").trim()
          const outer =
            node.nodeType === Node.ELEMENT_NODE
              ? (node as HTMLElement).outerHTML
              : text
          const block = makeBlock(id, text, {
            parent: parent.id,
            html: outer
          })
          blockMap.set(id, block)
          ;(orca.state.blocks as any)[id] = block
          const p = blockMap.get(parent.id)
          if (p) p.children = [...p.children, id]
          insertCalls.push({
            command,
            parentId: parent.id,
            text,
            html: outer
          })
        }
        return true
      }

      return true
    })
  },
  state: {
    blocks: {} as Record<number, Block>
  }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

beforeEach(() => {
  blockMap.clear()
  insertCalls.length = 0
  nextId = 1
  mockOrca.state.blocks = {}
  vi.clearAllMocks()
})

function seedRoot(text = "Chapter"): DbId {
  const id = nextId++
  const root = makeBlock(id, text, { blockType: "heading", headingLevel: 1 })
  blockMap.set(id, root)
  ;(orca.state.blocks as any)[id] = root
  return id
}

function childTexts(parentId: DbId): string[] {
  const parent = blockMap.get(parentId)!
  return parent.children.map((id) => blockMap.get(id)!.text)
}

function childIds(parentId: DbId): DbId[] {
  return [...(blockMap.get(parentId)?.children ?? [])]
}

describe("findHeadingParent", () => {
  it("pops equal and deeper headings, keeps shallower parent", () => {
    const stack = [
      { level: 0, blockId: 1 },
      { level: 1, blockId: 2 },
      { level: 2, blockId: 3 },
      { level: 3, blockId: 4 }
    ]
    expect(findHeadingParent(stack, 2).blockId).toBe(2)
    expect(stack.map((s) => s.level)).toEqual([0, 1])
  })

  it("attaches jumped levels to nearest shallower ancestor", () => {
    const stack = [
      { level: 0, blockId: 1 },
      { level: 1, blockId: 2 }
    ]
    expect(findHeadingParent(stack, 3).blockId).toBe(2)
  })
})

describe("importHtmlAsOutline insertBlock hierarchy", () => {
  it("builds h1 → h2 → content tree with sibling h2 sections", async () => {
    const rootId = seedRoot("Page")
    await importHtmlAsOutline(
      rootId,
      `
      <h1>标题</h1>
      <h2>标题2</h2>
      <p>标题2 内容</p>
      <h2>标题3</h2>
      <p>标题3 内容</p>
      `
    )

    // Root children: only h1
    const h1Id = childIds(rootId)[0]
    expect(blockMap.get(h1Id)?.text).toBe("标题")
    expect(blockMap.get(h1Id)?.headingLevel).toBe(1)

    // h1 children: two h2 headings
    const h2Ids = childIds(h1Id)
    expect(h2Ids).toHaveLength(2)
    expect(blockMap.get(h2Ids[0])?.text).toBe("标题2")
    expect(blockMap.get(h2Ids[1])?.text).toBe("标题3")

    // Each h2 owns its paragraph content
    expect(childTexts(h2Ids[0])).toEqual(["标题2 内容"])
    expect(childTexts(h2Ids[1])).toEqual(["标题3 内容"])

    // Content is not a direct child of the chapter root
    expect(childTexts(rootId)).toEqual(["标题"])
  })

  it("nests h3 under h2 under remaining structure after page-title h1 is absent", async () => {
    // Simulates getChapterContent removing the matching page-title h1.
    const rootId = seedRoot("第一部分 人的行为")
    await importHtmlAsOutline(
      rootId,
      `
      <h2>第一章 精神</h2>
      <h3>一、概念</h3>
      <p>概念正文</p>
      <h3>二、功能</h3>
      <p>功能正文</p>
      `
    )

    const h2Id = childIds(rootId)[0]
    expect(blockMap.get(h2Id)?.text).toBe("第一章 精神")
    const h3Ids = childIds(h2Id)
    expect(h3Ids.map((id) => blockMap.get(id)!.text)).toEqual([
      "一、概念",
      "二、功能"
    ])
    expect(childTexts(h3Ids[0])).toEqual(["概念正文"])
    expect(childTexts(h3Ids[1])).toEqual(["功能正文"])
  })

  it("handles h1 → h3 jump then h2 sibling under h1", async () => {
    const rootId = seedRoot("Chapter")
    await importHtmlAsOutline(
      rootId,
      `
      <h1>Root</h1>
      <h3>Jumped</h3>
      <p>deep</p>
      <h2>Mid</h2>
      <p>mid body</p>
      `
    )

    const h1Id = childIds(rootId)[0]
    const underH1 = childIds(h1Id)
    expect(underH1.map((id) => blockMap.get(id)!.text)).toEqual([
      "Jumped",
      "Mid"
    ])
    expect(childTexts(underH1[0])).toEqual(["deep"])
    expect(childTexts(underH1[1])).toEqual(["mid body"])
  })

  it("does not create empty blocks for consecutive blank paragraphs", async () => {
    const rootId = seedRoot("Chapter")
    await importHtmlAsOutline(
      rootId,
      `
      <p>first</p>
      <p></p>
      <p>&nbsp;</p>
      <p><br/></p>
      <div> </div>
      <p>second</p>
      `
    )

    const texts = childTexts(rootId)
    expect(texts).toEqual(["first", "second"])
    expect(texts.every((t) => t.length > 0)).toBe(true)
  })

  it("keeps hr, image, list and quote content blocks", async () => {
    const rootId = seedRoot("Chapter")
    await importHtmlAsOutline(
      rootId,
      `
      <p>before</p>
      <hr/>
      <p><img src="dot.png" alt="dot"/></p>
      <ul><li>one</li></ul>
      <blockquote><p>quoted</p></blockquote>
      <p>after</p>
      `
    )

    const children = childIds(rootId).map((id) => blockMap.get(id)!)
    const htmlJoined = children.map((c) => c.html ?? c.text).join("\n")
    expect(htmlJoined).toMatch(/<hr\b/i)
    expect(htmlJoined).toContain("dot.png")
    expect(htmlJoined).toContain("<ul>")
    expect(htmlJoined).toContain("quoted")
    expect(children.some((c) => c.text.includes("before"))).toBe(true)
    expect(children.some((c) => c.text.includes("after"))).toBe(true)
  })

  it("assigns pre-heading lead-in content to the chapter root", async () => {
    const rootId = seedRoot("Chapter")
    await importHtmlAsOutline(
      rootId,
      `<p>lead-in</p><h2>Section</h2><p>body</p>`
    )
    const rootChildren = childIds(rootId)
    expect(blockMap.get(rootChildren[0])?.text).toContain("lead-in")
    expect(blockMap.get(rootChildren[1])?.text).toBe("Section")
    expect(childTexts(rootChildren[1])).toEqual(["body"])
  })

  it("records insertBlock parents for headings only (not flat under root)", async () => {
    const rootId = seedRoot("Chapter")
    await importHtmlAsOutline(
      rootId,
      `<h1>A</h1><h2>B</h2><p>c</p>`
    )

    const headingInserts = insertCalls.filter(
      (c) => c.command === "core.editor.insertBlock"
    )
    expect(headingInserts).toEqual([
      expect.objectContaining({ parentId: rootId, text: "A", level: 1 }),
      expect.objectContaining({ text: "B", level: 2 })
    ])
    // B's parent must be A's block id, not the chapter root
    const aId = headingInserts[0].parentId === rootId
      ? // find A block id from map
        childIds(rootId)[0]
      : null
    expect(headingInserts[1].parentId).toBe(aId)
    expect(headingInserts[1].parentId).not.toBe(rootId)
  })
})
