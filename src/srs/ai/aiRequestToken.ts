/**
 * Monotonic request-token guard for in-flight AI generation.
 * Pure / DOM-free so cancel/retry races can be unit-tested without a UI harness.
 */

export interface RequestTokenGuard {
  /** Begin a new generation request; returns the token that owns subsequent writes. */
  next(): number
  /** Invalidate current ownership (cancel or supersede). */
  invalidate(): number
  /** Whether `token` still owns the latest generation slot. */
  isCurrent(token: number): boolean
  /** Current token value (0 = none started). */
  readonly current: number
}

export function createRequestTokenGuard(): RequestTokenGuard {
  let current = 0
  return {
    next() {
      current += 1
      return current
    },
    invalidate() {
      current += 1
      return current
    },
    isCurrent(token: number) {
      return token === current
    },
    get current() {
      return current
    }
  }
}
