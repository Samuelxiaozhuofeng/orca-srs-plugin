import { describe, expect, it } from "vitest"
import { createRequestTokenGuard } from "./aiRequestToken"

/**
 * Request-token races in AIDialogMount:
 * - Each generate() calls next() and only writes state when isCurrent(token).
 * - Cancel/retry invalidate() so a late await cannot clear isGenerating or
 *   overwrite info/error of a newer request.
 * Full DOM race coverage is not automated; this unit test locks the ownership
 * contract that Mount relies on.
 */
describe("createRequestTokenGuard", () => {
  it("only the latest token owns writes after next/invalidate", () => {
    const guard = createRequestTokenGuard()
    const t1 = guard.next()
    expect(guard.isCurrent(t1)).toBe(true)

    const t2 = guard.next()
    expect(guard.isCurrent(t1)).toBe(false)
    expect(guard.isCurrent(t2)).toBe(true)

    guard.invalidate()
    expect(guard.isCurrent(t2)).toBe(false)

    const t3 = guard.next()
    expect(guard.isCurrent(t3)).toBe(true)
    expect(guard.current).toBe(t3)
  })

  it("simulates cancel-then-stale-completion should not apply", () => {
    const guard = createRequestTokenGuard()
    const inflight = guard.next()
    // user cancels
    guard.invalidate()
    // stale completion checks ownership
    expect(guard.isCurrent(inflight)).toBe(false)
  })
})
