import { beforeEach, describe, expect, it } from "vitest"
import {
  getIncrementalReadingSettings,
  incrementalReadingSettingsSchema,
  INCREMENTAL_READING_SETTINGS_KEYS
} from "./incrementalReadingSettingsSchema"

describe("incrementalReadingSettingsSchema mixed learning", () => {
  const pluginName = "test-plugin"

  beforeEach(() => {
    ;(globalThis as { orca?: unknown }).orca = {
      state: {
        plugins: {
          [pluginName]: { settings: {} }
        }
      }
    }
  })

  it("defaults mixed learning to disabled", () => {
    const settings = getIncrementalReadingSettings(pluginName)
    expect(settings.mixedLearningEnabled).toBe(false)
  })

  it("ignores the removed mixed ratio setting (无时间盒后不再分时间)", () => {
    ;(orca.state.plugins[pluginName] as { settings: Record<string, unknown> }).settings = {
      mixedLearningReviewRatio: 40
    }
    const settings = getIncrementalReadingSettings(pluginName)
    expect("mixedLearningReviewRatio" in settings).toBe(false)
    expect(
      "mixedLearningReviewRatio" in INCREMENTAL_READING_SETTINGS_KEYS
    ).toBe(false)
  })

  it("exposes schema defaults for restore", () => {
    expect(
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.mixedLearningEnabled].defaultValue
    ).toBe(false)
  })
})