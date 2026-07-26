import { describe, expect, it } from "vitest"
import {
  HEADBAR_MOUNT_SUFFIXES,
  LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES,
  VISIBLE_HEADBAR_BUTTONS,
  headbarButtonId,
  listUnregisterHeadbarButtonIds,
  listVisibleHeadbarButtonIds
} from "./headbarButtons"

describe("headbarButtons", () => {
  it("registers exactly one visible business entry: 今日学习", () => {
    expect(VISIBLE_HEADBAR_BUTTONS).toHaveLength(1)
    expect(VISIBLE_HEADBAR_BUTTONS[0].title).toBe("今日学习")
    expect(VISIBLE_HEADBAR_BUTTONS[0].idSuffix).toBe("todayLearningButton")
    expect(VISIBLE_HEADBAR_BUTTONS[0].commandSuffix).toBe("openFlashcardHome")
    expect(VISIBLE_HEADBAR_BUTTONS[0].iconClass).toContain("ti-calendar-check")
  })

  it("keeps mount suffixes separate from visible buttons", () => {
    const visible = new Set(VISIBLE_HEADBAR_BUTTONS.map((b) => b.idSuffix))
    for (const m of HEADBAR_MOUNT_SUFFIXES) {
      expect(visible.has(m)).toBe(false)
      expect(m.endsWith("Mount") || m.includes("Mount")).toBe(true)
    }
  })

  it("unregister list is symmetric and includes legacy ids", () => {
    const plugin = "orca-srs"
    const ids = listUnregisterHeadbarButtonIds(plugin)
    expect(listVisibleHeadbarButtonIds(plugin)).toEqual([
      headbarButtonId(plugin, "todayLearningButton")
    ])
    expect(ids).toContain(headbarButtonId(plugin, "todayLearningButton"))
    for (const suffix of LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES) {
      expect(ids).toContain(headbarButtonId(plugin, suffix))
    }
    for (const suffix of HEADBAR_MOUNT_SUFFIXES) {
      expect(ids).toContain(headbarButtonId(plugin, suffix))
    }
    // 无重复
    expect(new Set(ids).size).toBe(ids.length)
  })
})
