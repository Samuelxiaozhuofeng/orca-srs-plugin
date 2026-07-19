import { describe, expect, it } from "vitest"
import type { Block } from "../../orca.d.ts"
import {
  blockHasLiveIRScheduling,
  isConvertExtractTarget,
  resolveIRCardType
} from "./irHybridExtract"

function block(
  type: string,
  props: Array<{ name: string; value?: unknown }> = []
): Block {
  return {
    id: 1,
    content: [],
    text: "",
    created: new Date(),
    modified: new Date(),
    children: [],
    aliases: [],
    properties: props.map((p) => ({ name: p.name, type: 1, value: p.value })),
    refs: [
      {
        id: 1,
        from: 1,
        to: 1,
        type: 2,
        alias: "card",
        data: [{ name: "type", type: 2, value: type }]
      }
    ],
    backRefs: []
  } as Block
}

describe("irHybridExtract", () => {
  it("detects live IR via ir.due", () => {
    expect(blockHasLiveIRScheduling(block("cloze", [{ name: "ir.due", value: new Date() }]))).toBe(true)
    expect(blockHasLiveIRScheduling(block("cloze", []))).toBe(false)
  })

  it("allows convert target for extracts and hybrid cloze", () => {
    expect(isConvertExtractTarget("extracts", false)).toBe(true)
    expect(isConvertExtractTarget("cloze", true)).toBe(true)
    expect(isConvertExtractTarget("cloze", false)).toBe(false)
    expect(isConvertExtractTarget("topic", true)).toBe(false)
  })

  it("resolves hybrid cloze as extracts for IR queue", () => {
    expect(resolveIRCardType(block("extracts", [{ name: "ir.due" }]))).toBe("extracts")
    expect(resolveIRCardType(block("cloze", [{ name: "ir.due" }]))).toBe("extracts")
    expect(resolveIRCardType(block("cloze", []))).toBeNull()
    expect(resolveIRCardType(block("topic", [{ name: "ir.due" }]))).toBe("topic")
  })
})
