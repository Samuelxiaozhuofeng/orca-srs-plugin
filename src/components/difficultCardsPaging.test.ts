import { describe, expect, it } from "vitest"
import {
  applyHardCap,
  DIFFICULT_CARDS_HARD_CAP,
  DIFFICULT_CARDS_PAGE_SIZE,
  pageSlice
} from "./difficultCardsPaging"

describe("Difficult cards list paging (WP-12)", () => {
  it("pages 1000 items with page size without materializing all slots", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    const capped = applyHardCap(items)
    expect(capped.length).toBe(DIFFICULT_CARDS_HARD_CAP)
    const page1 = pageSlice(capped, DIFFICULT_CARDS_PAGE_SIZE)
    expect(page1.length).toBe(DIFFICULT_CARDS_PAGE_SIZE)
    const page2 = pageSlice(capped, DIFFICULT_CARDS_PAGE_SIZE * 2)
    expect(page2.length).toBe(DIFFICULT_CARDS_PAGE_SIZE * 2)
    expect(page2[0].id).toBe(0)
  })

  it("5000-item fixture stays under hard cap for render count", () => {
    const items = Array.from({ length: 5000 }, (_, i) => i)
    const renderable = applyHardCap(items)
    expect(renderable.length).toBe(DIFFICULT_CARDS_HARD_CAP)
    expect(renderable.length).toBeLessThan(items.length)
  })
})
