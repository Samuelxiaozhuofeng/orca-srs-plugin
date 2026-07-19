import { describe, expect, it } from "vitest"
import {
  IR_CHAPTER_EXTRACT_PAGE_SIZE,
  nextExtractDisplayCount,
  pageExtracts
} from "./irExtractPaging"

describe("irExtractPaging", () => {
  it("slices extracts and advances display count", () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    expect(pageExtracts(items, IR_CHAPTER_EXTRACT_PAGE_SIZE)).toHaveLength(
      IR_CHAPTER_EXTRACT_PAGE_SIZE
    )
    expect(nextExtractDisplayCount(30, 100)).toBe(60)
    expect(nextExtractDisplayCount(90, 100)).toBe(100)
  })
})
