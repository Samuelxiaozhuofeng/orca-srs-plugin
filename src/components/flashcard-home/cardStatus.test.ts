import { describe, expect, it } from "vitest"
import {
  formatDueDate,
  formatInterval,
  formatNextReviewDate,
  getAccentClass,
  getCardDueStatus
} from "./cardStatus"

const now = new Date(2026, 2, 15, 14, 30, 0) // 2026-03-15 local

function card(isNew: boolean, due: Date) {
  return { isNew, srs: { due } }
}

describe("getCardDueStatus", () => {
  it("returns new when isNew regardless of due", () => {
    expect(getCardDueStatus(card(true, new Date(2020, 0, 1)), now)).toBe("new")
    expect(getCardDueStatus(card(true, new Date(2030, 0, 1)), now)).toBe("new")
  })

  it("returns backlog when due before start of today", () => {
    expect(getCardDueStatus(card(false, new Date(2026, 2, 14, 23, 59, 0)), now)).toBe(
      "backlog"
    )
    expect(getCardDueStatus(card(false, new Date(2026, 1, 1)), now)).toBe("backlog")
  })

  it("returns today when due on local calendar day", () => {
    expect(getCardDueStatus(card(false, new Date(2026, 2, 15, 0, 0, 0)), now)).toBe(
      "today"
    )
    expect(getCardDueStatus(card(false, new Date(2026, 2, 15, 23, 59, 0)), now)).toBe(
      "today"
    )
  })

  it("returns future when due on or after tomorrow", () => {
    expect(getCardDueStatus(card(false, new Date(2026, 2, 16, 0, 0, 0)), now)).toBe(
      "future"
    )
    expect(getCardDueStatus(card(false, new Date(2026, 5, 1)), now)).toBe("future")
  })
})

describe("getAccentClass", () => {
  it("maps each status to accent modifier", () => {
    expect(getAccentClass("new")).toBe("srs-card-frame__accent--new")
    expect(getAccentClass("today")).toBe("srs-card-frame__accent--today")
    expect(getAccentClass("backlog")).toBe("srs-card-frame__accent--backlog")
    expect(getAccentClass("future")).toBe("srs-card-frame__accent--future")
  })
})

describe("formatDueDate", () => {
  it("formats backlog, today, and future relative strings", () => {
    // today 边界为 3/15 00:00；3/12 10:00 → floor 差 2 天
    expect(formatDueDate(new Date(2026, 2, 12, 10, 0, 0), now)).toBe("已到期 2 天")
    expect(formatDueDate(new Date(2026, 2, 12, 0, 0, 0), now)).toBe("已到期 3 天")
    expect(formatDueDate(new Date(2026, 2, 15, 9, 0, 0), now)).toBe("今天到期")
    expect(formatDueDate(new Date(2026, 2, 20, 9, 0, 0), now)).toBe("5 天后到期")
  })
})

describe("formatNextReviewDate", () => {
  it("formats month/day in Chinese", () => {
    expect(formatNextReviewDate(new Date(2026, 2, 15))).toBe("3月15日")
    expect(formatNextReviewDate(new Date(2026, 11, 1))).toBe("12月1日")
  })
})

describe("formatInterval", () => {
  it("formats day / month / year buckets", () => {
    expect(formatInterval(0.5)).toBe("< 1天")
    expect(formatInterval(12)).toBe("12天")
    expect(formatInterval(45)).toBe("2月")
    expect(formatInterval(400)).toBe("1.1年")
  })
})
