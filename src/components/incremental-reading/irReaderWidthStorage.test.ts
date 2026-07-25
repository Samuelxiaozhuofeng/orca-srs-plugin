import { describe, expect, it } from "vitest"
import {
  IR_READER_WIDTH_DEFAULT,
  clampIRReaderWidth,
  parseIRReaderWidth,
  parseIRReaderWidthDraft,
  readIRReaderWidth,
  writeIRReaderWidth
} from "./irReaderWidthStorage"

describe("irReaderWidthStorage", () => {
  it("parses and clamps widths", () => {
    expect(parseIRReaderWidth(null)).toBe(IR_READER_WIDTH_DEFAULT)
    expect(parseIRReaderWidth("960")).toBe(960)
    expect(parseIRReaderWidth("nope")).toBe(IR_READER_WIDTH_DEFAULT)
    expect(clampIRReaderWidth(100)).toBe(480)
    expect(clampIRReaderWidth(2000)).toBe(1400)
    expect(clampIRReaderWidth(825.4)).toBe(825)
  })

  it("treats blank custom draft as invalid (not Number('') → 0 → 480)", () => {
    expect(parseIRReaderWidthDraft("")).toBeNull()
    expect(parseIRReaderWidthDraft("   ")).toBeNull()
    expect(parseIRReaderWidthDraft("abc")).toBeNull()
    expect(parseIRReaderWidthDraft("960")).toBe(960)
    expect(parseIRReaderWidthDraft("100")).toBe(480)
    expect(parseIRReaderWidthDraft("2000")).toBe(1400)
  })

  it("reads and writes without throwing on broken storage", () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      }
    }
    expect(writeIRReaderWidth(1080, storage).ok).toBe(true)
    expect(readIRReaderWidth(storage)).toEqual({ ok: true, width: 1080 })

    const broken = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      }
    }
    expect(readIRReaderWidth(broken).ok).toBe(false)
    expect(writeIRReaderWidth(820, broken).ok).toBe(false)
  })

  it("accepts null storage without throwing", () => {
    expect(readIRReaderWidth(null)).toMatchObject({ ok: false, width: IR_READER_WIDTH_DEFAULT })
    expect(writeIRReaderWidth(900, null)).toMatchObject({ ok: false, width: 900 })
  })
})
