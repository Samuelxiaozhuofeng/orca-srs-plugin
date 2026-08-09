import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, DbId } from "../orca.d.ts"
import type { CardType } from "../srs/types"

const routeState = vi.hoisted(() => ({ cardType: "cloze" as CardType }))

vi.mock("../srs/deckUtils", () => ({
  extractCardType: () => routeState.cardType
}))
vi.mock("../srs/choiceUtils", () => ({
  detectChoiceMode: vi.fn(),
  extractChoiceOptions: vi.fn(() => []),
  shuffleOptions: vi.fn(() => ({ options: [] }))
}))
vi.mock("../srs/choiceAnswerStatistics", () => ({
  createChoiceAnswerHandler: vi.fn()
}))
vi.mock("../srs/tagUtils", () => ({ isOrderedTag: vi.fn(() => false) }))
vi.mock("./review-card/BasicCardReviewRenderer", () => ({ default: "basic-renderer" }))
vi.mock("./ChoiceCardReviewRenderer", () => ({ default: "choice-renderer" }))
vi.mock("./ClozeCardReviewRenderer", () => ({ default: "cloze-renderer" }))
vi.mock("./DirectionCardReviewRenderer", () => ({ default: "direction-renderer" }))
vi.mock("./ListCardReviewRenderer", () => ({ default: "list-renderer" }))
vi.mock("./image-occlusion/ImageOcclusionReviewRenderer", () => ({ default: "io-renderer" }))
vi.mock("./SrsErrorBoundary", () => ({ default: "error-boundary" }))

type ElementLike = {
  type: unknown
  props?: Record<string, unknown>
}

type DemoRenderer = typeof import("./SrsCardDemo").default

let SrsCardDemo: DemoRenderer
const BLOCK_ID = 55 as DbId

function makeBlock(): Block {
  return {
    id: BLOCK_ID,
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: [],
    refs: [],
    backRefs: [],
    text: "card",
    content: [{ t: "t", v: "card" }]
  } as Block
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map(textOf).join("")
  if (!value || typeof value !== "object") return ""
  return textOf((value as ElementLike).props?.children)
}

beforeAll(async () => {
  ;(globalThis as any).window = {
    React: { useMemo: (factory: () => unknown) => factory() },
    Valtio: { useSnapshot: (value: unknown) => value }
  }
  ;(globalThis as any).orca = {
    state: { blocks: { [BLOCK_ID]: makeBlock() } }
  }
  SrsCardDemo = (await import("./SrsCardDemo")).default
})

beforeEach(() => {
  routeState.cardType = "cloze"
  ;(globalThis as any).orca.state.blocks[BLOCK_ID] = makeBlock()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("SrsCardDemo Cloze identity 边界", () => {
  it("已路由为 Cloze 但缺少 clozeNumber 时显示含 blockId 的错误态", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const result = SrsCardDemo({
      blockId: BLOCK_ID,
      front: "front",
      back: "back",
      onGrade: vi.fn()
    }) as ElementLike

    expect(result).not.toBeNull()
    expect(result.props?.className).toContain("srs-review-state--error")
    expect(textOf(result)).toContain(`块 #${BLOCK_ID} 缺少 clozeNumber`)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`blockId=${BLOCK_ID}`)
    )
  })

  it("image-occlusion 在独立类型分支正常路由，不受 Cloze 守卫影响", () => {
    routeState.cardType = "image-occlusion"
    const result = SrsCardDemo({
      blockId: BLOCK_ID,
      clozeNumber: 2,
      front: "front",
      back: "back",
      onGrade: vi.fn()
    }) as ElementLike

    expect(result.type).toBe("error-boundary")
    const child = result.props?.children as ElementLike
    expect(child.type).toBe("io-renderer")
    expect(child.props?.clozeNumber).toBe(2)
  })
})
