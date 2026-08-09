/**
 * 选择题复习题面：未作答时不得挂载块渲染器（会泄露选项与「正确」标记）
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DbId } from "../orca.d.ts"
import type { ChoiceOption } from "../srs/types"

const BLOCK_ID = 77 as DbId
const STEM = "题干：首都是哪里"
const OPTION_TEXTS = ["北京", "上海", "广州", "深圳"]

type ElementLike = {
  type: unknown
  props?: Record<string, unknown>
}

type Renderer = typeof import("./ChoiceCardReviewRenderer").default

let ChoiceCardReviewRenderer: Renderer
let stateSlots: unknown[] = []
let stateCursor = 0

function useStateStub<T>(initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const slot = stateCursor++
  if (slot >= stateSlots.length) stateSlots[slot] = initial
  const setValue = (value: T | ((previous: T) => T)) => {
    const previous = stateSlots[slot] as T
    stateSlots[slot] =
      typeof value === "function" ? (value as (c: T) => T)(previous) : value
  }
  return [stateSlots[slot] as T, setValue]
}

function useRefStub<T>(initial: T): { current: T } {
  return { current: initial }
}

function useMemoStub<T>(factory: () => T): T {
  return factory()
}

function useCallbackStub<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn
}

function useEffectStub(_effect: () => void | (() => void)): void {
  // no-op：本测只断言首帧结构
}

function makeOptions(): ChoiceOption[] {
  return OPTION_TEXTS.map((text, i) => ({
    blockId: (200 + i) as DbId,
    text,
    content: [{ t: "t", v: text }],
    isCorrect: i === 0,
    isAnchor: false
  }))
}

function visit(value: unknown, out: ElementLike[] = []): ElementLike[] {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, out)
    return out
  }
  if (!value || typeof value !== "object") return out
  const el = value as ElementLike
  if ("type" in el) out.push(el)
  if (el.props) {
    for (const child of Object.values(el.props)) visit(child, out)
  }
  return out
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map(textOf).join("")
  if (!value || typeof value !== "object") return ""
  return textOf((value as ElementLike).props?.children)
}

function findByClass(root: ElementLike, classPart: string): ElementLike | null {
  for (const el of visit(root)) {
    const cn = el.props?.className
    if (typeof cn === "string" && cn.includes(classPart)) return el
  }
  return null
}

beforeAll(async () => {
  ;(globalThis as any).window = {
    React: {
      useState: useStateStub,
      useMemo: useMemoStub,
      useCallback: useCallbackStub,
      useRef: useRefStub,
      useEffect: useEffectStub
    },
    Valtio: {
      useSnapshot: (value: unknown) => value
    }
  }
  ;(globalThis as any).orca = {
    components: {
      Button: "button"
    },
    state: {
      plugins: {
        "orca-srs": { settings: {} }
      },
      blocks: {
        [BLOCK_ID]: {
          id: BLOCK_ID,
          text: `${STEM} #card #choice`,
          content: [{ t: "t", v: STEM }]
        }
      }
    }
  }

  ChoiceCardReviewRenderer = (await import("./ChoiceCardReviewRenderer")).default
})

beforeEach(() => {
  stateSlots = []
  stateCursor = 0
})

describe("ChoiceCardReviewRenderer 复习题面不泄答", () => {
  it("源码不引用 SafeBlockPreview（避免挂载 srs.choice-card 块渲染器）", () => {
    const src = readFileSync(
      join(__dirname, "ChoiceCardReviewRenderer.tsx"),
      "utf8"
    )
    expect(src).not.toMatch(/SafeBlockPreview/)
    expect(src).toMatch(/BlockTextPreview/)
    expect(src).toMatch(/data-srs-choice-question-face/)
  })

  it("未作答题面区域不含选项文本与正确性标记", async () => {
    stateSlots = []
    stateCursor = 0
    const tree = ChoiceCardReviewRenderer({
      blockId: BLOCK_ID,
      options: makeOptions(),
      mode: "single",
      onGrade: vi.fn(),
      pluginName: "orca-srs",
      readOnly: false
    }) as ElementLike

    const face = findByClass(tree, "srs-choice-question")
    expect(face).not.toBeNull()
    expect(face?.props?.["data-srs-choice-question-face"]).toBe("true")

    // JSX 只挂载 BlockTextPreview 元素，不内联选项；展开后题干可见、选项与正确标记不在题面
    const faceChildren = visit(face)
    const stemEl = faceChildren.find(
      el =>
        typeof el.type === "function" &&
        (el.type as { name?: string }).name === "BlockTextPreview"
    )
    expect(stemEl).toBeDefined()
    expect(stemEl?.props?.blockId).toBe(BLOCK_ID)

    const BlockTextPreview = stemEl!.type as (props: { blockId: DbId }) => ElementLike
    const stemTree = BlockTextPreview({ blockId: BLOCK_ID })
    const stemText = textOf(stemTree)
    expect(stemText).toContain("首都是哪里")
    for (const opt of OPTION_TEXTS) {
      expect(stemText).not.toContain(opt)
    }
    expect(stemText).not.toContain("正确")

    // 题面子树不得再挂 Block（会触发 ChoiceCardBlockRenderer）
    const faceTypes = faceChildren.map(el => {
      if (typeof el.type === "function") return (el.type as { name?: string }).name ?? "fn"
      return String(el.type)
    })
    expect(faceTypes.join(" ")).not.toMatch(/SafeBlockPreview/i)
    expect(faceTypes.join(" ")).not.toMatch(/ChoiceCardBlockRenderer/i)
    expect(faceTypes).not.toContain("Block")
  })
})
