import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import type { DbId } from "../orca.d.ts"
import { buildCardKey, type CardIdentity } from "../srs/cardIdentity"

function sourceOf(fileName: string): string {
  return readFileSync(join(__dirname, fileName), "utf8")
}

function expectStableAndDistinct(
  fileName: string,
  cardTypeSource: string,
  first: CardIdentity,
  next: CardIdentity
): void {
  const source = sourceOf(fileName)
  expect(source).toContain("const currentCardKey = buildCardKey({")
  expect(source).toContain(cardTypeSource)

  const firstRenderKey = buildCardKey(first)
  expect(buildCardKey(first)).toBe(firstRenderKey)
  expect(buildCardKey(next)).not.toBe(firstRenderKey)
}

describe("复习渲染器统一 cardIdentity", () => {
  it("Cloze：同一填空 key 稳定，相邻填空 key 不同", () => {
    expectStableAndDistinct(
      "ClozeCardReviewRenderer.tsx",
      'cardType: "cloze"',
      { blockId: 10 as DbId, cardType: "cloze", clozeNumber: 1 },
      { blockId: 10 as DbId, cardType: "cloze", clozeNumber: 2 }
    )
  })

  it("Direction：同一方向 key 稳定，相邻方向 key 不同", () => {
    expectStableAndDistinct(
      "DirectionCardReviewRenderer.tsx",
      'cardType: "direction"',
      { blockId: 20 as DbId, cardType: "direction", directionType: "forward" },
      { blockId: 20 as DbId, cardType: "direction", directionType: "backward" }
    )
  })

  it("List：同一条目 key 稳定，相邻条目 key 不同", () => {
    expectStableAndDistinct(
      "ListCardReviewRenderer.tsx",
      'cardType: "list"',
      { blockId: 30 as DbId, cardType: "list", listItemId: 301 as DbId },
      { blockId: 30 as DbId, cardType: "list", listItemId: 302 as DbId }
    )
  })

  it("Choice：同一块 key 稳定，相邻块 key 不同", () => {
    expectStableAndDistinct(
      "ChoiceCardReviewRenderer.tsx",
      'cardType: "choice"',
      { blockId: 40 as DbId, cardType: "choice" },
      { blockId: 41 as DbId, cardType: "choice" }
    )
  })
})
