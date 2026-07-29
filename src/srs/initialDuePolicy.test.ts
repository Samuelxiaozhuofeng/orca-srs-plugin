import { describe, expect, it } from "vitest"
import type { CardIdentity } from "./cardIdentity"
import { buildCardKey } from "./cardIdentity"
import {
  IR_ITEM_DISPERSED_MAX_DAYS,
  IR_ITEM_DISPERSED_MIN_DAYS,
  computeDispersedDelayDays,
  computeLegacyDueFromDaysOffset,
  formatInitialDueHint,
  isIrItemSourceCardType,
  resolveInitialDue,
  shouldUseIrItemInitialDue,
  stableHash01
} from "./initialDuePolicy"

const createdAt = new Date(2026, 6, 29, 15, 30, 0)

function clozeId(blockId: number, n: number): CardIdentity {
  return { blockId, cardType: "cloze", clozeNumber: n }
}

describe("shouldUseIrItemInitialDue", () => {
  it("matches topic and extracts", () => {
    expect(isIrItemSourceCardType("topic")).toBe(true)
    expect(isIrItemSourceCardType("extracts")).toBe(true)
    expect(isIrItemSourceCardType("basic")).toBe(false)
    expect(shouldUseIrItemInitialDue("topic", false)).toBe(true)
    expect(shouldUseIrItemInitialDue("extracts", false)).toBe(true)
    expect(shouldUseIrItemInitialDue("basic", false)).toBe(false)
    expect(shouldUseIrItemInitialDue("cloze", true)).toBe(true)
    expect(shouldUseIrItemInitialDue("cloze", false)).toBe(false)
  })
})

describe("resolveInitialDue standard/legacy", () => {
  it("always returns legacyDue for standard origin", () => {
    const legacyDue = computeLegacyDueFromDaysOffset(createdAt, 2)
    const r = resolveInitialDue({
      origin: "standard",
      mode: "dispersed",
      identity: clozeId(1, 3),
      createdAt,
      legacyDue,
      priority: 0
    })
    expect(r.effectiveMode).toBe("legacy")
    expect(r.due.getTime()).toBe(legacyDue.getTime())
  })
})

describe("resolveInitialDue ir_item modes", () => {
  it("today / tomorrow", () => {
    const legacyDue = computeLegacyDueFromDaysOffset(createdAt, 0)
    const today = resolveInitialDue({
      origin: "ir_item",
      mode: "today",
      identity: clozeId(9, 1),
      createdAt,
      legacyDue,
      priority: 50
    })
    expect(today.effectiveMode).toBe("today")
    expect(today.delayDays).toBe(0)
    expect(today.due.getHours()).toBe(0)

    const tomorrow = resolveInitialDue({
      origin: "ir_item",
      mode: "tomorrow",
      identity: clozeId(9, 1),
      createdAt,
      legacyDue,
      priority: 50
    })
    expect(tomorrow.effectiveMode).toBe("tomorrow")
    expect(tomorrow.delayDays).toBe(1)
  })

  it("dispersed: priority 100 is ~1 day and never same-day", () => {
    const r = resolveInitialDue({
      origin: "ir_item",
      mode: "dispersed",
      identity: clozeId(42, 1),
      createdAt,
      legacyDue: computeLegacyDueFromDaysOffset(createdAt, 0),
      priority: 100
    })
    expect(r.effectiveMode).toBe("dispersed")
    expect(r.delayDays).toBeGreaterThanOrEqual(IR_ITEM_DISPERSED_MIN_DAYS)
    expect(r.delayDays).toBeLessThanOrEqual(IR_ITEM_DISPERSED_MIN_DAYS + 0.01)
    expect(r.due.getTime()).toBeGreaterThan(createdAt.getTime())
  })

  it("dispersed: priority 0 stays within 1..14", () => {
    for (let n = 1; n <= 20; n++) {
      const r = resolveInitialDue({
        origin: "ir_item",
        mode: "dispersed",
        identity: clozeId(1000 + n, n),
        createdAt,
        legacyDue: computeLegacyDueFromDaysOffset(createdAt, 0),
        priority: 0
      })
      expect(r.delayDays).toBeGreaterThanOrEqual(IR_ITEM_DISPERSED_MIN_DAYS)
      expect(r.delayDays).toBeLessThanOrEqual(IR_ITEM_DISPERSED_MAX_DAYS)
    }
  })

  it("dispersed is stable for same identity + day", () => {
    const input = {
      origin: "ir_item" as const,
      mode: "dispersed" as const,
      identity: clozeId(7, 2),
      createdAt,
      legacyDue: computeLegacyDueFromDaysOffset(createdAt, 1),
      priority: 50
    }
    const a = resolveInitialDue(input)
    const b = resolveInitialDue(input)
    expect(a.due.getTime()).toBe(b.due.getTime())
    expect(a.delayDays).toBe(b.delayDays)
  })

  it("different cardKeys get independent delays", () => {
    const a = resolveInitialDue({
      origin: "ir_item",
      mode: "dispersed",
      identity: clozeId(1, 1),
      createdAt,
      legacyDue: computeLegacyDueFromDaysOffset(createdAt, 0),
      priority: 30
    })
    const b = resolveInitialDue({
      origin: "ir_item",
      mode: "dispersed",
      identity: clozeId(1, 2),
      createdAt,
      legacyDue: computeLegacyDueFromDaysOffset(createdAt, 0),
      priority: 30
    })
    // 极低概率相同；用 cardKey 不同保证 seed 输入不同
    expect(buildCardKey(clozeId(1, 1))).not.toBe(buildCardKey(clozeId(1, 2)))
    expect(stableHash01(`x|${buildCardKey(clozeId(1, 1))}`)).not.toBe(
      stableHash01(`x|${buildCardKey(clozeId(1, 2))}`)
    )
    // 不强制 due 不同（哈希可能碰撞），但公式可复现
    expect(
      computeDispersedDelayDays({
        priority: 30,
        cardKey: buildCardKey(clozeId(1, 1)),
        createdAt
      })
    ).toBe(a.delayDays)
    expect(
      computeDispersedDelayDays({
        priority: 30,
        cardKey: buildCardKey(clozeId(1, 2)),
        createdAt
      })
    ).toBe(b.delayDays)
  })
})

describe("formatInitialDueHint", () => {
  it("describes dispersed delay", () => {
    const hint = formatInitialDueHint({
      effectiveMode: "dispersed",
      delayDays: 5.2,
      due: new Date(2026, 7, 3)
    })
    expect(hint).toContain("5")
    expect(hint).toContain("8月3日")
  })
})
