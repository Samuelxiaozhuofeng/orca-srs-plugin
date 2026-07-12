/**
 * FC-05：复习日志结构化身份 / v2 存储回归
 *
 * 与 reviewLogStorage.test.ts 分离，避免改动原属性测试文件的换行与历史 diff。
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ReviewLogEntry } from "./types"

const mockStorage: Record<string, string> = {}
const mockDataKeys: string[] = []

const mockOrca = {
  plugins: {
    getData: vi.fn(async (_pluginName: string, key: string) => {
      return mockStorage[key] || null
    }),
    setData: vi.fn(async (_pluginName: string, key: string, value: string) => {
      mockStorage[key] = value
      if (!mockDataKeys.includes(key)) {
        mockDataKeys.push(key)
      }
    }),
    getDataKeys: vi.fn(async () => {
      return [...mockDataKeys]
    }),
    removeData: vi.fn(async (_pluginName: string, key: string) => {
      delete mockStorage[key]
      const index = mockDataKeys.indexOf(key)
      if (index > -1) {
        mockDataKeys.splice(index, 1)
      }
    })
  }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

import {
  saveReviewLog,
  getAllReviewLogs,
  flushReviewLogs,
  clearAllReviewLogs,
  serializeReviewLog,
  deserializeReviewLog,
  createReviewLogId,
  clearLogCache
} from "./reviewLogStorage"

const PLUGIN_NAME = "test-plugin-identity"

async function clearMockStorage() {
  await clearAllReviewLogs(PLUGIN_NAME)
  Object.keys(mockStorage).forEach(key => delete mockStorage[key])
  mockDataKeys.length = 0
  clearLogCache()
}

describe("reviewLogStorage identity (FC-05)", () => {
  beforeEach(async () => {
    await clearMockStorage()
    vi.clearAllMocks()
  })

  describe("createReviewLogId", () => {
    it("supports stable cardKey string (v2 identity)", () => {
      const id = createReviewLogId(1_700_000_000_000, "cloze:100:c1")
      expect(id).toBe("1700000000000_cloze:100:c1")
    })

    it("keeps numeric cardId compatibility", () => {
      expect(createReviewLogId(1000, 42)).toBe("1000_42")
    })
  })

  describe("structured identity fields", () => {
    it("serialization round-trip preserves structured identity fields", () => {
      const log: ReviewLogEntry = {
        id: "1700000000000_cloze:100:c2",
        cardId: 100,
        blockId: 100,
        cardType: "cloze",
        cardKey: "cloze:100:c2",
        clozeNumber: 2,
        legacy: false,
        deckName: "Deck",
        timestamp: 1_700_000_000_000,
        grade: "again",
        duration: 1200,
        previousInterval: 3,
        newInterval: 0,
        previousState: "review",
        newState: "relearning"
      }

      const roundTripped = deserializeReviewLog(serializeReviewLog(log))
      expect(roundTripped.blockId).toBe(100)
      expect(roundTripped.cardType).toBe("cloze")
      expect(roundTripped.cardKey).toBe("cloze:100:c2")
      expect(roundTripped.clozeNumber).toBe(2)
      expect(roundTripped.legacy).toBe(false)
      expect(roundTripped.directionType).toBeUndefined()
      expect(roundTripped.listItemId).toBeUndefined()
    })

    it("FC-10: optional rawDuration round-trips; old logs without it still deserialize", () => {
      const withRaw: ReviewLogEntry = {
        id: "1700000000000_basic:1",
        cardId: 1,
        blockId: 1,
        cardType: "basic",
        cardKey: "basic:1",
        legacy: false,
        deckName: "Deck",
        timestamp: 1_700_000_000_000,
        grade: "good",
        duration: 60_000,
        rawDuration: 125_000,
        previousInterval: 1,
        newInterval: 2,
        previousState: "review",
        newState: "review"
      }
      const rt = deserializeReviewLog(serializeReviewLog(withRaw))
      expect(rt.duration).toBe(60_000)
      expect(rt.rawDuration).toBe(125_000)

      const legacyOnlyDuration = deserializeReviewLog(
        JSON.stringify({
          id: "1",
          cardId: 9,
          deckName: "D",
          timestamp: 1,
          grade: "good",
          duration: 5000,
          previousInterval: 0,
          newInterval: 1,
          previousState: "new",
          newState: "learning"
        })
      )
      expect(legacyOnlyDuration.duration).toBe(5000)
      expect(legacyOnlyDuration.rawDuration).toBeUndefined()
      expect(legacyOnlyDuration.legacy).toBe(true)
    })

    it("reads version 1 / missing-field logs without error and marks legacy", async () => {
      await clearMockStorage()

      const storageKey = "reviewLogs_2024_06"
      mockStorage[storageKey] = JSON.stringify({
        version: 1,
        logs: [
          {
            id: "1",
            cardId: 42,
            deckName: "legacy-deck",
            timestamp: new Date("2024-06-15").getTime(),
            grade: "good",
            duration: 1000,
            previousInterval: 0,
            newInterval: 1,
            previousState: "new",
            newState: "learning"
          }
        ]
      })
      mockDataKeys.push(storageKey)

      const logs = await getAllReviewLogs(PLUGIN_NAME)
      expect(logs).toHaveLength(1)
      expect(logs[0].legacy).toBe(true)
      expect(logs[0].blockId).toBe(42)
      expect(logs[0].cardKey).toBe("legacy:42")
      expect(logs[0].cardId).toBe(42)
    })

    it("persists new structured identity when saving v2 logs", async () => {
      await clearMockStorage()

      const log: ReviewLogEntry = {
        id: createReviewLogId(new Date("2024-07-01").getTime(), "list:10:item:11"),
        cardId: 11,
        blockId: 10,
        cardType: "list",
        cardKey: "list:10:item:11",
        listItemId: 11,
        legacy: false,
        deckName: "Deck",
        timestamp: new Date("2024-07-01").getTime(),
        grade: "hard",
        duration: 800,
        previousInterval: 1,
        newInterval: 1,
        previousState: "learning",
        newState: "learning"
      }

      await saveReviewLog(PLUGIN_NAME, log)
      await flushReviewLogs(PLUGIN_NAME)

      const retrieved = await getAllReviewLogs(PLUGIN_NAME)
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].cardKey).toBe("list:10:item:11")
      expect(retrieved[0].blockId).toBe(10)
      expect(retrieved[0].listItemId).toBe(11)
      expect(retrieved[0].legacy).toBe(false)

      const storedRaw = Object.values(mockStorage).find(v => v.includes("list:10:item:11"))
      expect(storedRaw).toBeDefined()
      const parsed = JSON.parse(storedRaw!)
      expect(parsed.version).toBe(2)
    })
  })
})
