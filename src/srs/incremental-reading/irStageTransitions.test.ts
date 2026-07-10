import { describe, expect, it } from "vitest"
import { advanceIRStage, initialStageForCardType } from "./irStageTransitions"

describe("irStageTransitions", () => {
  it("advances topic.preview on first next or extract", () => {
    expect(advanceIRStage("topic.preview", "next").nextStage).toBe("topic.work")
    expect(advanceIRStage("topic.preview", "extract").nextStage).toBe("topic.work")
  })

  it("moves extract.raw to refined on edit leave", () => {
    expect(advanceIRStage("extract.raw", "edit_leave").nextStage).toBe("extract.refined")
  })

  it("opens card tools to item_candidate and cancel returns refined", () => {
    expect(advanceIRStage("extract.refined", "open_card_tools").nextStage).toBe("extract.item_candidate")
    expect(advanceIRStage("extract.item_candidate", "cancel_itemize").nextStage).toBe("extract.refined")
  })

  it("clears IR on archive or successful itemize", () => {
    expect(advanceIRStage("topic.work", "archive").clearIR).toBe(true)
    expect(advanceIRStage("extract.item_candidate", "itemize").clearIR).toBe(true)
  })

  it("provides initial stages", () => {
    expect(initialStageForCardType("topic")).toBe("topic.preview")
    expect(initialStageForCardType("extracts")).toBe("extract.raw")
  })
})
