import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewCard, ReviewLogEntry } from "./types"
import { gradeReviewCard } from "./reviewCardGrading"
import {
  ensureCardSrsStateWithInitialDue,
  updateSrsState,
  updateClozeSrsState,
  updateDirectionSrsState
} from "./storage"
import { saveAndFlushReviewLog, createReviewLogId } from "./reviewLogStorage"
import { emitCardGraded } from "./srsEvents"
import {
  calculateEffectiveDuration,
  createInitialProgressState,
  recordEffectiveGrade,
  MAX_EFFECTIVE_CARD_DURATION_MS,
} from "./sessionProgressTracker"

vi.mock("./storage", () => ({
  updateSrsState: vi.fn(async () => {
    throw new Error("storage failed")
  }),
  updateClozeSrsState: vi.fn(),
  updateDirectionSrsState: vi.fn(),
  ensureCardSrsStateWithInitialDue: vi.fn(),
  invalidateBlockCache: vi.fn()
}))

vi.mock("./reviewLogStorage", () => ({
  saveReviewLog: vi.fn(),
  saveAndFlushReviewLog: vi.fn(async () => undefined),
  createReviewLogId: vi.fn((timestamp: number, key: number | string) => `${timestamp}_${key}`)
}))

vi.mock("./srsEvents", () => ({
  emitCardGraded: vi.fn(),
  emitCardPostponed: vi.fn(),
  emitCardSuspended: vi.fn()
}))

function sampleCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 1,
    front: "Q",
    back: "A",
    srs: {
      stability: 1,
      difficulty: 5,
      interval: 2,
      due: new Date("2026-01-20T08:00:00"),
      lastReviewed: new Date("2026-01-10T08:00:00"),
      reps: 2,
      lapses: 0
    },
    isNew: false,
    deck: "Default",
    cardType: "basic",
    ...overrides
  }
}

const gradedState = {
  stability: 2,
  difficulty: 5,
  interval: 3,
  due: new Date("2026-01-23T08:00:00"),
  lastReviewed: new Date("2026-01-20T08:00:00"),
  reps: 3,
  lapses: 0
}

function lastSavedLog(): ReviewLogEntry {
  const calls = vi.mocked(saveAndFlushReviewLog).mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][1] as ReviewLogEntry
}

describe("reviewCardGrading", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { orca: unknown }).orca = {
      commands: {
        invokeEditorCommand: vi.fn(async () => undefined)
      }
    }
  })

  it("returns failure without throwing when grading fails", async () => {
    const result = await gradeReviewCard(sampleCard(), "good", "orca-srs", Date.now())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(String(result.error)).toContain("storage failed")
    }
  })

  it("unlocks the next list item without appending it to the current snapshot", async () => {
    const nextState = {
      ...sampleCard().srs,
      due: new Date("2026-01-21T00:00:00")
    }
    vi.mocked(updateSrsState).mockResolvedValueOnce({ state: nextState, log: {} } as never)
    vi.mocked(ensureCardSrsStateWithInitialDue).mockResolvedValueOnce(nextState)

    const card: ReviewCard = {
      ...sampleCard(),
      id: 10,
      cardType: "list",
      listItemId: 11,
      listItemIndex: 1,
      listItemIds: [11, 12]
    }
    const result = await gradeReviewCard(card, "good", "orca-srs", Date.now())

    expect(result.ok).toBe(true)
    expect(ensureCardSrsStateWithInitialDue).toHaveBeenCalledWith(12, expect.any(Date))
    expect(orca.commands.invokeEditorCommand).toHaveBeenCalledWith(
      "core.editor.setProperties",
      null,
      [12],
      [{ name: "srs.due", type: 5, value: expect.any(Date) }]
    )
  })

  it("keeps a successful grade when list progression fails", async () => {
    const nextState = {
      ...sampleCard().srs,
      due: new Date("2026-01-21T00:00:00")
    }
    vi.mocked(updateSrsState).mockResolvedValueOnce({ state: nextState, log: {} } as never)
    vi.mocked(ensureCardSrsStateWithInitialDue).mockRejectedValueOnce(new Error("list progression failed"))

    const result = await gradeReviewCard({
      ...sampleCard(),
      id: 10,
      cardType: "list",
      listItemId: 11,
      listItemIndex: 1,
      listItemIds: [11, 12]
    }, "good", "orca-srs", Date.now())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.warning).toContain("list progression failed")
    }
  })

  describe("FC-05 日志结构化身份", () => {
    it("Basic 写入正确身份", async () => {
      vi.mocked(updateSrsState).mockResolvedValueOnce({ state: gradedState, log: {} } as never)
      const result = await gradeReviewCard(
        sampleCard({ cardType: "basic" }),
        "good",
        "orca-srs",
        Date.now() - 500
      )
      expect(result.ok).toBe(true)
      const log = lastSavedLog()
      expect(log.cardId).toBe(1)
      expect(log.blockId).toBe(1)
      expect(log.cardType).toBe("basic")
      expect(log.cardKey).toBe("basic:1")
      expect(log.legacy).toBe(false)
      expect(createReviewLogId).toHaveBeenCalledWith(expect.any(Number), "basic:1")
      expect(emitCardGraded).toHaveBeenCalledWith(
        1,
        "good",
        expect.objectContaining({
          cardKey: "basic:1",
          identity: expect.objectContaining({ blockId: 1, cardType: "basic" })
        })
      )
    })

    it("Cloze 写入 clozeNumber 与 cardKey", async () => {
      vi.mocked(updateClozeSrsState).mockResolvedValueOnce({ state: gradedState, log: {} } as never)
      const result = await gradeReviewCard(
        sampleCard({ cardType: "cloze", clozeNumber: 2 }),
        "hard",
        "orca-srs",
        Date.now() - 500
      )
      expect(result.ok).toBe(true)
      const log = lastSavedLog()
      expect(log.cardType).toBe("cloze")
      expect(log.clozeNumber).toBe(2)
      expect(log.cardKey).toBe("cloze:1:c2")
      expect(log.blockId).toBe(1)
      expect(log.cardId).toBe(1)
      expect(log.legacy).toBe(false)
    })

    it("Direction 写入 directionType 与 cardKey", async () => {
      vi.mocked(updateDirectionSrsState).mockResolvedValueOnce({ state: gradedState, log: {} } as never)
      const result = await gradeReviewCard(
        sampleCard({ cardType: "direction", directionType: "backward" }),
        "easy",
        "orca-srs",
        Date.now() - 500
      )
      expect(result.ok).toBe(true)
      const log = lastSavedLog()
      expect(log.cardType).toBe("direction")
      expect(log.directionType).toBe("backward")
      expect(log.cardKey).toBe("direction:1:backward")
      expect(log.legacy).toBe(false)
    })

    it("List 使用 listItemId 作为兼容 cardId，并写入 list 身份", async () => {
      vi.mocked(updateSrsState).mockResolvedValueOnce({ state: gradedState, log: {} } as never)
      vi.mocked(ensureCardSrsStateWithInitialDue).mockResolvedValueOnce(gradedState)

      const result = await gradeReviewCard(
        sampleCard({
          id: 10,
          cardType: "list",
          listItemId: 11,
          listItemIndex: 1,
          listItemIds: [11, 12]
        }),
        "good",
        "orca-srs",
        Date.now() - 500
      )
      expect(result.ok).toBe(true)
      const log = lastSavedLog()
      expect(log.cardId).toBe(11)
      expect(log.blockId).toBe(10)
      expect(log.cardType).toBe("list")
      expect(log.listItemId).toBe(11)
      expect(log.cardKey).toBe("list:10:item:11")
      expect(log.legacy).toBe(false)
    })

    it("Choice 与 Basic 身份可区分", async () => {
      vi.mocked(updateSrsState).mockResolvedValueOnce({ state: gradedState, log: {} } as never)
      const result = await gradeReviewCard(
        sampleCard({ cardType: "choice", id: 9 }),
        "good",
        "orca-srs",
        Date.now() - 500
      )
      expect(result.ok).toBe(true)
      const log = lastSavedLog()
      expect(log.cardType).toBe("choice")
      expect(log.cardKey).toBe("choice:9")
      expect(log.cardKey).not.toBe("basic:9")
      expect(log.legacy).toBe(false)
    })
  })

  describe("FC-03 日志落盘与评分语义", () => {
    it("状态更新成功、日志落盘失败时 ok=true 且含明确 warning", async () => {
      vi.mocked(updateSrsState).mockResolvedValueOnce({ state: gradedState, log: {} } as never)
      vi.mocked(saveAndFlushReviewLog).mockRejectedValueOnce(new Error("setData failed"))
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await gradeReviewCard(
        sampleCard({ cardType: "basic" }),
        "good",
        "orca-srs",
        Date.now() - 500
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.updatedCard.srs.interval).toBe(gradedState.interval)
        expect(result.warning).toContain("评分已保存，但统计日志保存失败")
        // FC-10：日志失败仍返回 timing，会话可继续记有效时长
        expect(result.timing).toBeDefined()
        expect(Number.isFinite(result.timing.effectiveDuration)).toBe(true)
      }
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it("日志成功落盘时不含统计日志失败 warning", async () => {
      vi.mocked(updateSrsState).mockResolvedValueOnce({ state: gradedState, log: {} } as never)
      vi.mocked(saveAndFlushReviewLog).mockResolvedValueOnce(undefined)

      const result = await gradeReviewCard(
        sampleCard({ cardType: "basic" }),
        "good",
        "orca-srs",
        Date.now() - 500
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.warning).toBeUndefined()
      }
      expect(saveAndFlushReviewLog).toHaveBeenCalledTimes(1)
    })
  })

  describe("FC-10 复习时长统一", () => {
    beforeEach(() => {
      vi.mocked(updateSrsState).mockResolvedValue({ state: gradedState, log: {} } as never)
    })

    it("<60s: log.duration / return effective / session delta 完全相同", async () => {
      const startedAt = 1_700_000_000_000
      const now = startedAt + 20_000
      const result = await gradeReviewCard(
        sampleCard(),
        "good",
        "orca-srs",
        startedAt,
        { now }
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const log = lastSavedLog()
      expect(log.duration).toBe(20_000)
      expect(log.rawDuration).toBe(20_000)
      expect(result.timing.effectiveDuration).toBe(20_000)
      expect(result.timing.rawDuration).toBe(20_000)
      expect(result.timing.timestamp).toBe(now)
      expect(log.timestamp).toBe(now)

      const session = recordEffectiveGrade(
        createInitialProgressState(),
        "good",
        result.timing.effectiveDuration
      )
      expect(session.effectiveReviewTime).toBe(20_000)
      expect(session.cardDurations[0]).toBe(log.duration)
      expect(session.cardDurations[0]).toBe(result.timing.effectiveDuration)
    })

    it(">60s: 三者均为 60000，rawDuration 保留原值", async () => {
      const startedAt = 1_700_000_000_000
      const now = startedAt + 120_000
      const result = await gradeReviewCard(
        sampleCard(),
        "hard",
        "orca-srs",
        startedAt,
        { now }
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const log = lastSavedLog()
      expect(log.duration).toBe(MAX_EFFECTIVE_CARD_DURATION_MS)
      expect(log.rawDuration).toBe(120_000)
      expect(result.timing.effectiveDuration).toBe(60_000)
      expect(result.timing.rawDuration).toBe(120_000)

      const session = recordEffectiveGrade(
        createInitialProgressState(),
        "hard",
        result.timing.effectiveDuration
      )
      expect(session.effectiveReviewTime).toBe(60_000)
      expect(session.cardDurations[0]).toBe(log.duration)
    })

    it("负值/回拨：effective=0，raw=0", async () => {
      const startedAt = 1_700_000_000_000
      const now = startedAt - 5_000
      const result = await gradeReviewCard(
        sampleCard(),
        "again",
        "orca-srs",
        startedAt,
        { now }
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const log = lastSavedLog()
      expect(log.duration).toBe(0)
      expect(log.rawDuration).toBe(0)
      expect(result.timing.effectiveDuration).toBe(0)
      expect(result.timing.rawDuration).toBe(0)
    })

    it("options.now 固定值：timestamp 与 duration 同源且只使用该值", async () => {
      const startedAt = 5_000
      const fixedNow = 35_000
      const result = await gradeReviewCard(
        sampleCard(),
        "easy",
        "orca-srs",
        startedAt,
        { now: fixedNow }
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const log = lastSavedLog()
      expect(log.timestamp).toBe(fixedNow)
      expect(result.timing.timestamp).toBe(fixedNow)
      expect(log.duration).toBe(30_000)
      expect(createReviewLogId).toHaveBeenCalledWith(fixedNow, "basic:1")
    })

    it("options.now 为函数时只调用一次", async () => {
      const startedAt = 10_000
      const nowFn = vi.fn(() => 40_000)
      const result = await gradeReviewCard(
        sampleCard(),
        "good",
        "orca-srs",
        startedAt,
        { now: nowFn }
      )
      expect(result.ok).toBe(true)
      expect(nowFn).toHaveBeenCalledTimes(1)
      if (!result.ok) return
      expect(result.timing.effectiveDuration).toBe(30_000)
      expect(lastSavedLog().timestamp).toBe(40_000)
    })

    it("日志失败时仍可把 timing.effectiveDuration 写入会话进度", async () => {
      vi.mocked(saveAndFlushReviewLog).mockRejectedValueOnce(new Error("flush failed"))
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const startedAt = 0
      const now = 18_000
      const result = await gradeReviewCard(
        sampleCard(),
        "good",
        "orca-srs",
        startedAt,
        { now }
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.warning).toContain("评分已保存，但统计日志保存失败")
      const session = recordEffectiveGrade(
        createInitialProgressState(),
        "good",
        result.timing.effectiveDuration
      )
      expect(session.effectiveReviewTime).toBe(18_000)
      errorSpy.mockRestore()
    })

    it("返回 effective 与 calculateEffectiveDuration 规则一致", async () => {
      for (const wall of [0, 1, 59_999, 60_000, 90_000, 200_000]) {
        vi.mocked(saveAndFlushReviewLog).mockClear()
        const startedAt = 0
        const result = await gradeReviewCard(
          sampleCard(),
          "good",
          "orca-srs",
          startedAt,
          { now: wall }
        )
        expect(result.ok).toBe(true)
        if (!result.ok) continue
        expect(result.timing.effectiveDuration).toBe(calculateEffectiveDuration(wall))
        expect(lastSavedLog().duration).toBe(result.timing.effectiveDuration)
      }
    })
  })
})
