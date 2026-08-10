import { describe, expect, it } from "vitest"
import { createQuestionBoundRequestTracker } from "./useChapterQuizController"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe("chapter quiz question-bound requests", () => {
  it("drops a follow-up answer that resolves after switching questions", async () => {
    const tracker = createQuestionBoundRequestTracker()
    const answer = deferred<string>()
    let activeQuestionId: string | null = "q1"
    let busy = false
    let error: string | null = null
    let turns: string[] = []

    const request = tracker.start("q1")
    tracker.commit(request, activeQuestionId, () => {
      busy = true
      turns = ["user: why?"]
    })
    const pending = answer.promise.then((text) => {
      tracker.commit(request, activeQuestionId, () => {
        turns = [...turns, `assistant: ${text}`]
      })
      tracker.finish(request, activeQuestionId, () => {
        busy = false
      })
    })

    activeQuestionId = "q2"
    tracker.cancel()
    busy = false
    error = null
    turns = []
    answer.resolve("old answer")
    await pending

    expect(request.controller.signal.aborted).toBe(true)
    expect(turns).toEqual([])
    expect(busy).toBe(false)
    expect(error).toBeNull()
  })

  it("drops cloze preview, error, and loading state after switching questions", async () => {
    const tracker = createQuestionBoundRequestTracker()
    const rewrite = deferred<
      | { success: true; text: string; clozeText: string }
      | { success: false; error: string }
    >()
    let activeQuestionId: string | null = "q1"
    let busy = false
    let preview: { questionId: string; text: string } | null = null
    let error: string | null = null

    const request = tracker.start("q1")
    tracker.commit(request, activeQuestionId, () => {
      busy = true
      preview = null
      error = null
    })
    const pending = rewrite.promise.then((result) => {
      tracker.commit(request, activeQuestionId, () => {
        if (result.success) {
          preview = { questionId: "q1", text: result.text }
        } else {
          error = result.error
        }
      })
      tracker.finish(request, activeQuestionId, () => {
        busy = false
      })
    })

    activeQuestionId = "q2"
    tracker.cancel()
    busy = false
    preview = null
    error = null
    rewrite.resolve({ success: true, text: "old preview", clozeText: "old" })
    await pending

    expect(request.controller.signal.aborted).toBe(true)
    expect(preview).toBeNull()
    expect(error).toBeNull()
    expect(busy).toBe(false)
  })

  it("does not surface a late cloze rewrite error on the next question", async () => {
    const tracker = createQuestionBoundRequestTracker()
    const rewrite = deferred<{ success: false; error: string }>()
    let activeQuestionId: string | null = "q1"
    let busy = false
    let error: string | null = null

    const request = tracker.start("q1")
    tracker.commit(request, activeQuestionId, () => {
      busy = true
    })
    const pending = rewrite.promise.then((result) => {
      tracker.commit(request, activeQuestionId, () => {
        error = result.error
      })
      tracker.finish(request, activeQuestionId, () => {
        busy = false
      })
    })

    activeQuestionId = "q2"
    tracker.cancel()
    busy = false
    error = null
    rewrite.resolve({ success: false, error: "old error" })
    await pending

    expect(error).toBeNull()
    expect(busy).toBe(false)
  })

  it("allows fresh follow-up and cloze requests after returning to the original question", async () => {
    const followUpTracker = createQuestionBoundRequestTracker()
    const clozeTracker = createQuestionBoundRequestTracker()
    let activeQuestionId: string | null = "q1"
    let followUpBusy = false
    let clozeBusy = false
    let answer: string | null = null
    let preview: string | null = null

    const cancelledFollowUp = followUpTracker.start("q1")
    const cancelledCloze = clozeTracker.start("q1")
    activeQuestionId = "q2"
    followUpTracker.cancel()
    clozeTracker.cancel()
    activeQuestionId = "q1"

    const freshFollowUp = followUpTracker.start("q1")
    const freshCloze = clozeTracker.start("q1")
    followUpTracker.commit(freshFollowUp, activeQuestionId, () => {
      followUpBusy = true
    })
    clozeTracker.commit(freshCloze, activeQuestionId, () => {
      clozeBusy = true
    })
    await Promise.resolve()
    followUpTracker.commit(freshFollowUp, activeQuestionId, () => {
      answer = "fresh answer"
    })
    clozeTracker.commit(freshCloze, activeQuestionId, () => {
      preview = "fresh preview"
    })
    followUpTracker.finish(freshFollowUp, activeQuestionId, () => {
      followUpBusy = false
    })
    clozeTracker.finish(freshCloze, activeQuestionId, () => {
      clozeBusy = false
    })

    expect(cancelledFollowUp.controller.signal.aborted).toBe(true)
    expect(cancelledCloze.controller.signal.aborted).toBe(true)
    expect(freshFollowUp.seq).toBeGreaterThan(cancelledFollowUp.seq)
    expect(freshCloze.seq).toBeGreaterThan(cancelledCloze.seq)
    expect(answer).toBe("fresh answer")
    expect(preview).toBe("fresh preview")
    expect(followUpBusy).toBe(false)
    expect(clozeBusy).toBe(false)
  })
})
