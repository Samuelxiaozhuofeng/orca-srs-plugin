import { describe, expect, it } from "vitest"
import {
  GLOBAL_DECK_SCOPE,
  homeStatListTitle,
  homeStatToFilter,
  isGlobalDeckScope,
  resolveCardListTitle
} from "./homeStatNav"

describe("homeStatNav", () => {
  it("maps stats to filters", () => {
    expect(homeStatToFilter("new")).toBe("new")
    expect(homeStatToFilter("today")).toBe("today")
    expect(homeStatToFilter("backlog")).toBe("overdue")
  })

  it("titles for global scope", () => {
    expect(homeStatListTitle("backlog")).toBe("全部 · 积压")
    expect(resolveCardListTitle(GLOBAL_DECK_SCOPE, "overdue")).toBe("全部 · 积压")
    expect(resolveCardListTitle("Default", "new")).toBe("Default")
    expect(isGlobalDeckScope(GLOBAL_DECK_SCOPE)).toBe(true)
    expect(isGlobalDeckScope("Default")).toBe(false)
  })
})
