import { describe, expect, it } from "vitest"
import {
  parseIRReaderTheme,
  readIRReaderTheme,
  writeIRReaderTheme
} from "./irReaderThemeStorage"

describe("irReaderThemeStorage", () => {
  it("parses known themes and defaults", () => {
    expect(parseIRReaderTheme("sepia")).toBe("sepia")
    expect(parseIRReaderTheme("nope")).toBe("mint")
  })

  it("reads and writes without throwing on broken storage", () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      }
    }
    expect(writeIRReaderTheme("academic", storage).ok).toBe(true)
    expect(readIRReaderTheme(storage)).toEqual({ ok: true, theme: "academic" })

    const broken = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      }
    }
    expect(readIRReaderTheme(broken).ok).toBe(false)
    expect(writeIRReaderTheme("mint", broken).ok).toBe(false)
  })
})
