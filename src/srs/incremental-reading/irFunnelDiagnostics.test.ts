import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import {
  computeFunnelStageDistribution,
  findStaleExtracts,
  findTopicStarvationRisk
} from "./irFunnelDiagnostics"

function card(partial: Partial<IRCard> & Pick<IRCard, "id" | "cardType">): IRCard {
  return {
    id: partial.id,
    cardType: partial.cardType,
    priority: 50,
    position: null,
    due: partial.due ?? new Date("2026-01-20"),
    intervalDays: 3,
    postponeCount: 0,
    stage: partial.stage ?? (partial.cardType === "topic" ? "topic.preview" : "extract.raw"),
    lastAction: "init",
    lastRead: partial.lastRead ?? null,
    readCount: 0,
    isNew: true,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("irFunnelDiagnostics", () => {
  it("counts stages", () => {
    const dist = computeFunnelStageDistribution([
      card({ id: 1, cardType: "topic", stage: "topic.preview" }),
      card({ id: 2, cardType: "extracts", stage: "extract.raw" }),
      card({ id: 3, cardType: "extracts", stage: "extract.refined" })
    ])
    expect(dist["topic.preview"]).toBe(1)
    expect(dist["extract.raw"]).toBe(1)
    expect(dist["extract.refined"]).toBe(1)
  })

  it("detects topic starvation risk under heavy overdue extracts", () => {
    const cards: IRCard[] = []
    for (let i = 0; i < 60; i++) {
      cards.push(card({
        id: 100 + i,
        cardType: "extracts",
        due: new Date("2026-01-01")
      }))
    }
    cards.push(card({ id: 1, cardType: "topic", due: new Date("2026-01-20") }))
    const risk = findTopicStarvationRisk(cards, { now: new Date("2026-01-20") })
    expect(risk.atRisk).toBe(true)
    expect(risk.dueTopics).toBe(1)
  })

  it("finds stale extracts", () => {
    const stale = findStaleExtracts([
      card({
        id: 1,
        cardType: "extracts",
        lastRead: new Date("2025-12-01"),
        stage: "extract.raw"
      }),
      card({
        id: 2,
        cardType: "extracts",
        lastRead: new Date("2026-01-18"),
        stage: "extract.raw"
      })
    ], { now: new Date("2026-01-20"), staleDays: 14 })
    expect(stale.map(c => c.id)).toEqual([1])
  })
})
