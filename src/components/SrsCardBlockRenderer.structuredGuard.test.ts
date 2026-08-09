import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, ContentFragment, DbId } from "../orca.d.ts"

const invokeEditorCommandMock = vi.fn()
const invalidateBlockCacheMock = vi.fn()

vi.mock("../srs/storage", () => ({
  invalidateBlockCache: (...args: unknown[]) => invalidateBlockCacheMock(...args),
  updateSrsState: vi.fn()
}))

vi.mock("../srs/settings/reviewSettingsSchema", () => ({
  getIrItemInitialDueMode: vi.fn(() => "legacy"),
  showNotification: vi.fn()
}))

type ElementLike = {
  type: unknown
  props?: Record<string, unknown>
}

type Renderer = typeof import("./SrsCardBlockRenderer").default

let SrsCardBlockRenderer: Renderer
let stateSlots: unknown[] = []
let stateCursor = 0
let pendingEffects: Array<() => void | (() => void)> = []

function useStateStub<T>(initial: T): [T, (value: T | ((previous: T) => T)) => void] {
  const slot = stateCursor++
  if (slot >= stateSlots.length) stateSlots[slot] = initial
  const setValue = (value: T | ((previous: T) => T)) => {
    const previous = stateSlots[slot] as T
    stateSlots[slot] = typeof value === "function"
      ? (value as (current: T) => T)(previous)
      : value
  }
  return [stateSlots[slot] as T, setValue]
}

function makeBlock(content: ContentFragment[]): Block {
  return {
    id: 42 as DbId,
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: [],
    refs: [],
    backRefs: [],
    text: "原题",
    content
  } as Block
}

function render(block: Block): ElementLike {
  stateCursor = 0
  ;(globalThis as any).orca.state.blocks[block.id] = block
  return SrsCardBlockRenderer({
    panelId: "panel",
    blockId: block.id,
    rndId: "rnd",
    blockLevel: 0,
    indentLevel: 0,
    front: "原题",
    back: "原答案",
    pluginName: "orca-srs"
  }) as ElementLike
}

function visit(value: unknown, result: ElementLike[] = []): ElementLike[] {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, result)
    return result
  }
  if (!value || typeof value !== "object") return result

  const element = value as ElementLike
  if ("type" in element && element.props) {
    result.push(element)
    for (const propValue of Object.values(element.props)) visit(propValue, result)
  }
  return result
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map(textOf).join("")
  if (!value || typeof value !== "object") return ""
  return textOf((value as ElementLike).props?.children)
}

function buttons(root: ElementLike): ElementLike[] {
  return visit(root).filter(element => element.type === "button")
}

function allText(root: ElementLike): string {
  return visit(root).map(textOf).join("")
}

beforeAll(async () => {
  class ComponentStub {
    props: unknown
    state: unknown

    constructor(props: unknown) {
      this.props = props
    }

    setState(value: unknown) {
      this.state = value
    }
  }

  ;(globalThis as any).window = {
    React: {
      Component: ComponentStub,
      useState: useStateStub,
      useMemo: (factory: () => unknown) => factory(),
      useEffect: (effect: () => void | (() => void)) => pendingEffects.push(effect),
      useCallback: (callback: unknown) => callback,
      createElement: vi.fn()
    },
    Valtio: {
      useSnapshot: (value: unknown) => value
    }
  }

  ;(globalThis as any).orca = {
    state: { blocks: {} },
    components: {
      BlockShell: "block-shell",
      BlockChildren: "block-children",
      Button: "button",
      BlockBreadcrumb: "block-breadcrumb"
    },
    commands: { invokeEditorCommand: invokeEditorCommandMock },
    notify: vi.fn(),
    utils: { setSelectionFromCursorData: vi.fn() }
  }

  SrsCardBlockRenderer = (await import("./SrsCardBlockRenderer")).default
})

beforeEach(() => {
  stateSlots = []
  stateCursor = 0
  pendingEffects = []
  invokeEditorCommandMock.mockReset()
  invalidateBlockCacheMock.mockReset()
  ;(globalThis as any).orca.notify.mockReset()
})

describe("SrsCardBlockRenderer 结构化卡编辑保护", () => {
  it("含 cloze fragment 时不暴露编辑入口并显示源块编辑提示", () => {
    const root = render(makeBlock([
      { t: "t", v: "前" },
      { t: "orca-srs.cloze", v: "答案", clozeNumber: 1 }
    ]))

    expect(buttons(root).some(button => textOf(button).includes("编辑"))).toBe(false)
    expect(allText(root)).toContain("该卡含填空/方向结构，请在源块中编辑。")
  })

  it("含 direction fragment 时不暴露编辑入口并显示源块编辑提示", () => {
    const root = render(makeBlock([
      { t: "t", v: "问题" },
      { t: "orca-srs.direction", v: "→", direction: "forward" },
      { t: "t", v: "答案" }
    ]))

    expect(buttons(root).some(button => textOf(button).includes("编辑"))).toBe(false)
    expect(allText(root)).toContain("该卡含填空/方向结构，请在源块中编辑。")
  })

  it("结构检测抛错时保持编辑关闭并发送可见错误通知", () => {
    const content = new Proxy([] as ContentFragment[], {
      get(target, property, receiver) {
        if (property === "length") throw new Error("content read failed")
        return Reflect.get(target, property, receiver)
      }
    })
    const root = render(makeBlock(content))

    expect(buttons(root).some(button => textOf(button).includes("编辑"))).toBe(false)
    expect(allText(root)).toContain("无法确认卡片结构，已停止行内编辑，请在源块中编辑。")
    for (const effect of pendingEffects) effect()
    expect((globalThis as any).orca.notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("content read failed"),
      { title: "SRS 卡片" }
    )
  })

  it("纯 basic 卡仍可编辑题目并通过 setBlocksContent 保存", async () => {
    const block = makeBlock([{ t: "t", v: "原题" }])
    let root = render(block)
    const editButton = buttons(root).find(button => textOf(button).includes("编辑"))
    expect(editButton).toBeDefined()

    ;(editButton!.props!.onClick as () => void)()
    root = render(block)
    const textarea = visit(root).find(element => element.type === "textarea")
    expect(textarea).toBeDefined()
    ;(textarea!.props!.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "新题目" }
    })

    root = render(block)
    const saveButton = buttons(root).find(button => textOf(button) === "保存")
    expect(saveButton).toBeDefined()
    await (saveButton!.props!.onClick as () => Promise<void>)()

    expect(invokeEditorCommandMock).toHaveBeenCalledWith(
      "core.editor.setBlocksContent",
      null,
      [{ id: block.id, content: [{ t: "t", v: "新题目" }] }],
      false
    )
    expect(invalidateBlockCacheMock).toHaveBeenCalledWith(block.id)
  })
})
