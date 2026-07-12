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

  it("defaults mixed learning to disabled with 30% ratio", () => {
    const settings = getIncrementalReadingSettings(pluginName)
    expect(settings.mixedLearningEnabled).toBe(false)
    expect(settings.mixedLearningReviewRatio).toBe(30)
  })

  it("normalizes invalid legacy ratio to 30", () => {
    ;(orca.state.plugins[pluginName] as { settings: Record<string, unknown> }).settings = {
      [INCREMENTAL_READING_SETTINGS_KEYS.mixedLearningReviewRatio]: 25
    }
    const settings = getIncrementalReadingSettings(pluginName)
    expect(settings.mixedLearningReviewRatio).toBe(30)
  })

  it("keeps valid ratio options", () => {
    ;(orca.state.plugins[pluginName] as { settings: Record<string, unknown> }).settings = {
      [INCREMENTAL_READING_SETTINGS_KEYS.mixedLearningReviewRatio]: 40
    }
    expect(getIncrementalReadingSettings(pluginName).mixedLearningReviewRatio).toBe(40)
  })

  it("exposes schema defaults for restore", () => {
    expect(
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.mixedLearningEnabled].defaultValue
    ).toBe(false)
    expect(
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.mixedLearningReviewRatio].defaultValue
    ).toBe(30)
  })
})