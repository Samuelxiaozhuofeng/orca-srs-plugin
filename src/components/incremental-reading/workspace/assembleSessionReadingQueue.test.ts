import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { assembleSessionReadingQueue } from "./assembleSessionReadingQueue"

const workspaceDir = dirname(fileURLToPath(import.meta.url))

function card(partial: Partial<IRCard> & Pick<IRCard, "id" | "cardType">): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType,
    priority: partial.priority ?? 50,
    position: partial.position ?? (partial.cardType === "topic" ? 1 : null),
    due: partial.due ?? new Date("2026-07-19T08:00:00"),
    intervalDays: partial.intervalDays ?? 5,
    postponeCount: partial.postponeCount ?? 0,
    stage: partial.cardType === "topic" ? "topic.preview" : "extract.raw",
    lastAction: "init",
    lastRead: partial.lastRead ?? null,
    readCount: partial.readCount ?? 0,
    isNew: partial.isNew ?? false,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("assembleSessionReadingQueue", () => {
  it("returns policy queue unchanged when focus is absent", () => {
    const a = card({ id: 1, cardType: "topic" })
    const b = card({ id: 2, cardType: "extracts" })
    const policyQueue = [a, b]
    const queue = assembleSessionReadingQueue({
      policyQueue,
      focusCard: null,
      dailyLimit: 30
    })
    expect(queue.map((c) => c.id)).toEqual([1, 2])
    expect(queue).toBe(policyQueue) // same reference when no focus
  })

  it("places focus first even when it is not in the policy queue", () => {
    const policy = [
      card({ id: 10, cardType: "extracts" }),
      card({ id: 11, cardType: "extracts" }),
      card({ id: 12, cardType: "topic" })
    ]
    const focus = card({ id: 99, cardType: "topic", priority: 10 })
    const queue = assembleSessionReadingQueue({
      policyQueue: policy,
      focusCard: focus,
      dailyLimit: 30
    })
    expect(queue.map((c) => c.id)).toEqual([99, 10, 11, 12])
    expect(queue[0]).toBe(focus)
  })

  it("dedupes focus already present in the policy queue and moves it first", () => {
    const focus = card({ id: 11, cardType: "extracts" })
    const queue = assembleSessionReadingQueue({
      policyQueue: [
        card({ id: 10, cardType: "topic" }),
        focus,
        card({ id: 12, cardType: "extracts" })
      ],
      focusCard: focus,
      dailyLimit: 30
    })
    expect(queue.map((c) => c.id)).toEqual([11, 10, 12])
  })

  it("truncates to dailyLimit after inserting focus (existing dailyLimit semantics)", () => {
    const policy = [
      card({ id: 1, cardType: "topic" }),
      card({ id: 2, cardType: "extracts" }),
      card({ id: 3, cardType: "extracts" })
    ]
    const focus = card({ id: 99, cardType: "topic" })
    const queue = assembleSessionReadingQueue({
      policyQueue: policy,
      focusCard: focus,
      dailyLimit: 3
    })
    // focus first; then first two policy cards; last policy card dropped by dailyLimit
    expect(queue.map((c) => c.id)).toEqual([99, 1, 2])
    expect(queue).toHaveLength(3)
  })

  it("does not truncate when dailyLimit is 0 (unlimited)", () => {
    const policy = [
      card({ id: 1, cardType: "topic" }),
      card({ id: 2, cardType: "extracts" })
    ]
    const focus = card({ id: 99, cardType: "topic" })
    const queue = assembleSessionReadingQueue({
      policyQueue: policy,
      focusCard: focus,
      dailyLimit: 0
    })
    expect(queue.map((c) => c.id)).toEqual([99, 1, 2])
  })
})

describe("session load module structure (Batch B1)", () => {
  it("does not import auto-postpone write path from session load", () => {
    const sessionSrc = readFileSync(join(workspaceDir, "useIRWorkspaceSession.ts"), "utf8")
    // Structural guarantee: no dependency edge to the overload write service
    expect(sessionSrc).not.toMatch(/from\s+["'][^"']*irOverloadService["']/)
    expect(sessionSrc).not.toMatch(
      /(?:import|require)\s*(?:\{[^}]*\b(?:applyAutoPostpone|formatAutoPostponeSummary|undoAutoPostponeBatch)\b[^}]*\}|\([^)]*\b(?:applyAutoPostpone|formatAutoPostponeSummary|undoAutoPostponeBatch)\b)/
    )
    // No call site to the auto-postpone write entrypoint
    expect(sessionSrc).not.toMatch(/\bapplyAutoPostpone\s*\(/)
    expect(sessionSrc).not.toMatch(/\bundoAutoPostponeBatch\s*\(/)
    // Workspace session must not expose a fake no-op undo handler
    expect(sessionSrc).not.toMatch(/\bhandleUndoAutoPostpone\b/)
  })

  it("production hook calls assembleSessionReadingQueue", () => {
    const sessionSrc = readFileSync(join(workspaceDir, "useIRWorkspaceSession.ts"), "utf8")
    expect(sessionSrc).toMatch(/from ["']\.\/assembleSessionReadingQueue["']/)
    expect(sessionSrc).toMatch(/assembleSessionReadingQueue\s*\(/)
  })

  it("session load passes readOnly:true on detailed, fallback collect, and focus paths", () => {
    const sessionSrc = readFileSync(join(workspaceDir, "useIRWorkspaceSession.ts"), "utf8")
    // Explicit shared options object for all collect entry points
    expect(sessionSrc).toMatch(/readOnly:\s*true/)
    expect(sessionSrc).toMatch(/sessionCollectOpts/)
    // Main detailed + dynamic fallback both use the same opts
    expect(sessionSrc).toMatch(/collectIRCardsDetailed\(\s*name\s*,\s*sessionCollectOpts\s*\)/)
    expect(sessionSrc).toMatch(/collectIRCards\(\s*name\s*,\s*sessionCollectOpts\s*\)/)
    // Focus backend fallback must not call collectAll without readOnly
    expect(sessionSrc).toMatch(
      /collectAllIRCardsFromBlocks\(\s*\[\s*block\s*\]\s*,\s*name\s*,\s*sessionCollectOpts\s*\)/
    )
    // No bare collect calls without the opts on the three session entry paths
    expect(sessionSrc).not.toMatch(/collectIRCardsDetailed\(\s*name\s*\)/)
    expect(sessionSrc).not.toMatch(/collectIRCards\(\s*name\s*\)/)
    expect(sessionSrc).not.toMatch(/collectAllIRCardsFromBlocks\(\s*\[[^\]]+\]\s*,\s*name\s*\)/)
  })
})
