import { describe, expect, it } from "vitest"
import {
  applyImportanceNudge,
  formatImportanceTierCompact,
  formatImportanceTierLabel,
  formatImportanceTierLabelFromPriority,
  importanceFromTier,
  importanceSetupOptions,
  importanceToTier,
  IR_IMPORTANCE_NUDGE_STEP
} from "./irImportance"

describe("irImportance", () => {
  it("maps absolute tiers to 20/50/80", () => {
    expect(importanceFromTier("low")).toBe(20)
    expect(importanceFromTier("medium")).toBe(50)
    expect(importanceFromTier("high")).toBe(80)
  })

  it("nudge step is 15", () => {
    expect(IR_IMPORTANCE_NUDGE_STEP).toBe(15)
  })

  it("nudges down and up by 15 with clamp", () => {
    const down = applyImportanceNudge(50, "down")
    expect(down).toMatchObject({
      nextPriority: 35,
      previousPriority: 50,
      changed: true,
      blockedAtBound: false
    })

    const up = applyImportanceNudge(50, "up")
    expect(up.nextPriority).toBe(65)
    expect(up.changed).toBe(true)
  })

  it("blocks at 0 and 100", () => {
    const floor = applyImportanceNudge(0, "down")
    expect(floor).toMatchObject({
      nextPriority: 0,
      changed: false,
      blockedAtBound: true
    })

    const ceil = applyImportanceNudge(100, "up")
    expect(ceil).toMatchObject({
      nextPriority: 100,
      changed: false,
      blockedAtBound: true
    })
  })

  it("reset sets default 50", () => {
    const reset = applyImportanceNudge(80, "reset")
    expect(reset).toMatchObject({
      nextPriority: 50,
      previousPriority: 80,
      changed: true,
      blockedAtBound: false,
      tier: "medium"
    })

    const same = applyImportanceNudge(50, "reset")
    expect(same.changed).toBe(false)
  })

  it("labels hide raw numbers", () => {
    expect(formatImportanceTierLabel("low")).toBe("想读但不急")
    expect(formatImportanceTierLabel("medium")).toBe("正常")
    expect(formatImportanceTierLabel("high")).toBe("很重要")
    expect(formatImportanceTierCompact("medium")).toBe("中")
    expect(formatImportanceTierLabelFromPriority(35)).toBe("正常")
    expect(importanceToTier(20)).toBe("low")
  })

  it("setup options cover three tiers with recommended medium", () => {
    const opts = importanceSetupOptions()
    expect(opts.map((o) => o.tier)).toEqual(["low", "medium", "high"])
    expect(opts.find((o) => o.recommended)?.tier).toBe("medium")
    expect(opts.every((o) => typeof o.title === "string" && o.title.length > 0)).toBe(true)
  })
})
