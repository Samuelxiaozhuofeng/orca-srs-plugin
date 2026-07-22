import { afterEach, describe, expect, it } from "vitest"
import {
  clearCompatibleModelsCache,
  getCompatibleModelsCache,
  setCompatibleModelsCache
} from "./aiModelsCache"

const PLUGIN = "orca-srs"

describe("aiModelsCache", () => {
  afterEach(() => {
    clearCompatibleModelsCache()
  })

  it("stores unique sorted models", () => {
    setCompatibleModelsCache(
      PLUGIN,
      [" z-model ", "a-model", "a-model", ""],
      "https://example.test/v1/chat/completions"
    )
    expect(getCompatibleModelsCache(PLUGIN)).toEqual(["a-model", "z-model"])
  })

  it("returns null when apiUrl does not match cache", () => {
    setCompatibleModelsCache(
      PLUGIN,
      ["m1"],
      "https://a.test/v1/chat/completions"
    )
    expect(
      getCompatibleModelsCache(PLUGIN, "https://b.test/v1/chat/completions")
    ).toBeNull()
    expect(
      getCompatibleModelsCache(PLUGIN, "https://a.test/v1/chat/completions")
    ).toEqual(["m1"])
  })
})
