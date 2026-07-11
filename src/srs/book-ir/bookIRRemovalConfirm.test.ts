import { describe, expect, it } from "vitest"
import {
  formatBookIRRemovalConfirmText,
  summarizeBookIRRemoval
} from "./bookIRRemovalConfirm"
import type { BookIRPlanV1 } from "../../importers/epub/types"

describe("bookIRRemovalConfirm", () => {
  it("summarizes active/locked/completed/skipped counts", () => {
    const plan: BookIRPlanV1 = {
      version: 1,
      bookBlockId: 10,
      mode: "sequential",
      priority: 50,
      totalDays: 5,
      selectedChapterIds: [1, 2, 3, 4],
      activeChapterId: 2,
      outcomes: {
        "1": "completed",
        "2": "active",
        "3": "pending",
        "4": "skipped"
      }
    }
    const s = summarizeBookIRRemoval(10, plan)
    expect(s.active).toBe(1)
    expect(s.lockedPending).toBe(1)
    expect(s.completed).toBe(1)
    expect(s.skipped).toBe(1)
    expect(s.targets).toBe(4)
    const text = formatBookIRRemovalConfirmText(s)
    expect(text).toMatch(/激活 1/)
    expect(text).toMatch(/锁定\/未开始 1/)
    expect(text).toMatch(/已完成 1/)
    expect(text).toMatch(/已跳过 1/)
    expect(text).toMatch(/本次将处理 4 章/)
  })

  it("handles missing plan", () => {
    const s = summarizeBookIRRemoval(99, null)
    expect(s.hasPlan).toBe(false)
    expect(formatBookIRRemovalConfirmText(s)).toMatch(/#99/)
  })
})
