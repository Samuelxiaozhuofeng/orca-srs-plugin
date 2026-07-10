import { describe, expect, it } from "vitest"
import { buildPropertyRestorePlan } from "./irConversionBlockState"

describe("IR conversion block rollback", () => {
  it("restores original SRS/source values and only deletes conversion additions", () => {
    const original = [
      { name: "srs.isCard", value: true, type: 4 },
      { name: "srs.interval", value: 12, type: 3 },
      { name: "ir.sourceTopicId", value: 7, type: 3 }
    ]
    const current = [
      { name: "srs.isCard", value: true, type: 4 },
      { name: "srs.interval", value: 1, type: 3 },
      { name: "srs.c1.due", value: "2026-01-01", type: 5 },
      { name: "ir.sourceTopicId", value: 99, type: 3 },
      { name: "ir.sourceExtractId", value: 10, type: 3 },
      { name: "unrelated", value: "keep", type: 2 }
    ]

    const plan = buildPropertyRestorePlan(original, current)
    expect(plan.deleteNames).toEqual(["srs.c1.due", "ir.sourceExtractId"])
    expect(plan.restore).toEqual(original)
    expect(plan.deleteNames).not.toContain("srs.isCard")
    expect(plan.deleteNames).not.toContain("unrelated")
  })
})
