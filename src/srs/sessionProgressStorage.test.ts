/**
 * FC-09 / FC-14：会话进度 storage 隔离与损坏恢复
 *
 * 纯函数测试：key 模型、StorageLike lifecycle、registry、strict parse。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { serializeProgressState, createInitialProgressState } from "./sessionProgressTracker"
import {
  SESSION_PROGRESS_KEY_PREFIX,
  autoSaveSessionProgress,
  clearRegisteredSessionProgressKeys,
  clearSessionProgressKey,
  createProgressScopeFromDeckFilter,
  createProgressScopeFromFixedSource,
  createSessionProgressDescriptorFromFixedSource,
  createSessionProgressDescriptorFromNormal,
  encodeProgressScopeSegment,
  getRegisteredSessionProgressKeys,
  registerSessionProgressKey,
  resetSessionProgressKeyRegistryForTests,
  safeStorageGetItem,
  safeStorageRemoveItem,
  safeStorageSetItem,
  toSessionProgressStorageKey,
  tryParseSessionProgressJson,
  unregisterSessionProgressKey,
  type StorageLike
} from "./sessionProgressStorage"

/** 内存 StorageLike */
function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Record<string, string>
} {
  const store: Record<string, string> = { ...initial }
  return {
    store,
    getItem(key: string) {
      return key in store ? store[key]! : null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    }
  }
}

describe("sessionProgressStorage (FC-09)", () => {
  beforeEach(() => {
    resetSessionProgressKeyRegistryForTests()
  })

  afterEach(() => {
    resetSessionProgressKeyRegistryForTests()
    vi.restoreAllMocks()
  })

  // ------------------------------------------
  // Key 生成：稳定且互异
  // ------------------------------------------
  describe("toSessionProgressStorageKey", () => {
    it("normal/all 稳定", () => {
      const scope = createProgressScopeFromDeckFilter(null)
      const key = toSessionProgressStorageKey(scope)
      expect(key).toBe(`${SESSION_PROGRESS_KEY_PREFIX}normal/all`)
      expect(toSessionProgressStorageKey(createProgressScopeFromDeckFilter(""))).toBe(key)
      expect(toSessionProgressStorageKey(createProgressScopeFromDeckFilter(undefined))).toBe(key)
    })

    it("normal/deck 含特殊字符安全编码且稳定", () => {
      const deck = "日语:N1/核心"
      const scope = createProgressScopeFromDeckFilter(deck)
      const key = toSessionProgressStorageKey(scope)
      expect(key).toBe(
        `${SESSION_PROGRESS_KEY_PREFIX}normal/deck/${encodeProgressScopeSegment(deck)}`
      )
      expect(key).toContain("normal/deck/")
      expect(key).not.toContain("日语:N1/核心") // 已编码
      // 稳定性
      expect(toSessionProgressStorageKey(createProgressScopeFromDeckFilter(deck))).toBe(key)
    })

    it("difficult 识别 sourceBlockId=0 children", () => {
      const scope = createProgressScopeFromFixedSource("children", 0)
      const key = toSessionProgressStorageKey(scope)
      expect(key).toBe(`${SESSION_PROGRESS_KEY_PREFIX}fixed/difficult`)
      expect(
        toSessionProgressStorageKey(createProgressScopeFromFixedSource("children", "0"))
      ).toBe(key)
    })

    it("fixed source 与 difficult / 其他 source 互异", () => {
      const all = toSessionProgressStorageKey(createProgressScopeFromDeckFilter(null))
      const deckA = toSessionProgressStorageKey(createProgressScopeFromDeckFilter("A"))
      const deckB = toSessionProgressStorageKey(createProgressScopeFromDeckFilter("B"))
      const difficult = toSessionProgressStorageKey(
        createProgressScopeFromFixedSource("children", 0)
      )
      const query100 = toSessionProgressStorageKey(
        createProgressScopeFromFixedSource("query", 100)
      )
      const children200 = toSessionProgressStorageKey(
        createProgressScopeFromFixedSource("children", 200)
      )
      // children + 非 0 不得误判为 difficult
      const childrenNonZero = toSessionProgressStorageKey(
        createProgressScopeFromFixedSource("children", 1)
      )

      const keys = [all, deckA, deckB, difficult, query100, children200, childrenNonZero]
      expect(new Set(keys).size).toBe(keys.length)
      expect(childrenNonZero).not.toBe(difficult)
      expect(childrenNonZero).toContain("fixed/")
      expect(childrenNonZero).toContain(encodeProgressScopeSegment("children"))
    })

    it("descriptor 与 scope 一致", () => {
      const d1 = createSessionProgressDescriptorFromNormal("Deck:X")
      expect(d1.storageKey).toBe(toSessionProgressStorageKey(d1.scope))
      const d2 = createSessionProgressDescriptorFromFixedSource("query", 42)
      expect(d2.storageKey).toBe(toSessionProgressStorageKey(d2.scope))
      expect(d1.storageKey).not.toBe(d2.storageKey)
    })
  })

  // ------------------------------------------
  // 新会话：清理旧同 scope，不恢复
  // ------------------------------------------
  describe("new session lifecycle (no restore)", () => {
    it("预置旧同 scope 数据后 clear，再 autoSave 使用 scoped key", () => {
      const key = toSessionProgressStorageKey(createProgressScopeFromDeckFilter(null))
      const oldSerialized = serializeProgressState({
        ...createInitialProgressState(),
        totalGradedCards: 99,
        gradeDistribution: { again: 1, hard: 2, good: 3, easy: 4 }
      })
      const storage = createMemoryStorage({ [key]: oldSerialized })

      // 新会话初始化：删除旧值
      expect(clearSessionProgressKey(storage, key)).toBe(true)
      expect(storage.getItem(key)).toBeNull()

      // 从 0 开始 autoSave
      const fresh = createInitialProgressState()
      expect(fresh.totalGradedCards).toBe(0)
      const written = serializeProgressState(fresh)
      expect(autoSaveSessionProgress(storage, key, written)).toBe(true)
      expect(storage.getItem(key)).toBe(written)

      const parsed = tryParseSessionProgressJson(storage.getItem(key)!)
      expect(parsed).not.toBeNull()
      expect(parsed!.totalGradedCards).toBe(0)
    })

    it("deck A/B 与 normal/fixed 相互隔离", () => {
      const keyA = toSessionProgressStorageKey(createProgressScopeFromDeckFilter("A"))
      const keyB = toSessionProgressStorageKey(createProgressScopeFromDeckFilter("B"))
      const keyAll = toSessionProgressStorageKey(createProgressScopeFromDeckFilter(null))
      const keyDiff = toSessionProgressStorageKey(
        createProgressScopeFromFixedSource("children", 0)
      )

      const storage = createMemoryStorage()
      autoSaveSessionProgress(storage, keyA, "data-A")
      autoSaveSessionProgress(storage, keyB, "data-B")
      autoSaveSessionProgress(storage, keyAll, "data-all")
      autoSaveSessionProgress(storage, keyDiff, "data-diff")

      clearSessionProgressKey(storage, keyA)
      expect(storage.getItem(keyA)).toBeNull()
      expect(storage.getItem(keyB)).toBe("data-B")
      expect(storage.getItem(keyAll)).toBe("data-all")
      expect(storage.getItem(keyDiff)).toBe("data-diff")
    })
  })

  // ------------------------------------------
  // 损坏 JSON / storage 抛错
  // ------------------------------------------
  describe("strict parse and storage errors", () => {
    it("损坏 JSON 显式 restore 失败并 warn", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      expect(tryParseSessionProgressJson("not-json")).toBeNull()
      expect(tryParseSessionProgressJson("{}")).toBeNull()
      expect(tryParseSessionProgressJson(JSON.stringify({ version: 1 }))).toBeNull()
      expect(
        tryParseSessionProgressJson(
          JSON.stringify({ version: 999, data: createInitialProgressState() })
        )
      ).toBeNull()
      expect(
        tryParseSessionProgressJson(
          JSON.stringify({
            version: 1,
            data: { version: 1, totalGradedCards: "bad" }
          })
        )
      ).toBeNull()
      expect(warn).toHaveBeenCalled()
    })

    it("合法 JSON 严格解析成功", () => {
      const state = createInitialProgressState()
      state.totalGradedCards = 3
      state.gradeDistribution.good = 3
      const json = serializeProgressState(state)
      const parsed = tryParseSessionProgressJson(json)
      expect(parsed).not.toBeNull()
      expect(parsed!.totalGradedCards).toBe(3)
      expect(parsed!.gradeDistribution.good).toBe(3)
    })

    it("storage get/set/remove 抛错均 warn 且主流程继续", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const throwing: StorageLike = {
        getItem() {
          throw new Error("get fail")
        },
        setItem() {
          throw new Error("set fail")
        },
        removeItem() {
          throw new Error("remove fail")
        }
      }

      expect(safeStorageGetItem(throwing, "k")).toBeNull()
      expect(safeStorageSetItem(throwing, "k", "v")).toBe(false)
      expect(safeStorageRemoveItem(throwing, "k")).toBe(false)
      expect(clearSessionProgressKey(throwing, "k")).toBe(false)
      expect(autoSaveSessionProgress(throwing, "k", "v")).toBe(false)
      expect(warn.mock.calls.length).toBeGreaterThanOrEqual(3)
    })
  })

  // ------------------------------------------
  // finish / abandon 清理正确 key
  // ------------------------------------------
  describe("finish/abandon clear correct key only", () => {
    it("清理指定 key 不误删其他 key", () => {
      const keyTarget = toSessionProgressStorageKey(
        createProgressScopeFromDeckFilter("Target")
      )
      const keyOther = toSessionProgressStorageKey(
        createProgressScopeFromDeckFilter("Other")
      )
      const legacy = "srs-session-progress"
      const foreign = "other-plugin-data"

      const storage = createMemoryStorage({
        [keyTarget]: "t",
        [keyOther]: "o",
        [legacy]: "legacy",
        [foreign]: "foreign"
      })

      clearSessionProgressKey(storage, keyTarget)
      expect(storage.getItem(keyTarget)).toBeNull()
      expect(storage.getItem(keyOther)).toBe("o")
      expect(storage.getItem(legacy)).toBe("legacy")
      expect(storage.getItem(foreign)).toBe("foreign")
    })
  })

  // ------------------------------------------
  // round reset 语义：归零状态序列化
  // ------------------------------------------
  describe("round reset zeros stats", () => {
    it("重置后序列化为 0 统计并覆盖 scoped key", () => {
      const key = toSessionProgressStorageKey(
        createProgressScopeFromFixedSource("query", 10)
      )
      const storage = createMemoryStorage()
      const graded = {
        ...createInitialProgressState(),
        totalGradedCards: 5,
        gradeDistribution: { again: 1, hard: 1, good: 2, easy: 1 },
        effectiveReviewTime: 1000,
        cardDurations: [200, 200, 200, 200, 200]
      }
      autoSaveSessionProgress(storage, key, serializeProgressState(graded))

      // round reset：归零 + 覆盖
      const zero = createInitialProgressState()
      autoSaveSessionProgress(storage, key, serializeProgressState(zero))
      const parsed = tryParseSessionProgressJson(storage.getItem(key)!)
      expect(parsed!.totalGradedCards).toBe(0)
      expect(parsed!.gradeDistribution).toEqual({
        again: 0,
        hard: 0,
        good: 0,
        easy: 0
      })
      // 同一 fixed scope key 不变
      expect(key).toBe(
        toSessionProgressStorageKey(createProgressScopeFromFixedSource("query", 10))
      )
    })
  })

  // ------------------------------------------
  // unload registry
  // ------------------------------------------
  describe("registered key cleanup (unload)", () => {
    it("仅清理已登记 keys，不删无关 key；单项失败 warn 且继续", () => {
      const key1 = toSessionProgressStorageKey(createProgressScopeFromDeckFilter("A"))
      const key2 = toSessionProgressStorageKey(createProgressScopeFromDeckFilter("B"))
      const foreign = "unrelated-key"
      const storage = createMemoryStorage({
        [key1]: "1",
        [key2]: "2",
        [foreign]: "keep"
      })

      registerSessionProgressKey(key1)
      registerSessionProgressKey(key2)
      expect(getRegisteredSessionProgressKeys()).toEqual(
        expect.arrayContaining([key1, key2])
      )

      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      // 让 key1 remove 失败，key2 成功
      const originalRemove = storage.removeItem.bind(storage)
      storage.removeItem = (key: string) => {
        if (key === key1) throw new Error("boom")
        originalRemove(key)
      }

      const result = clearRegisteredSessionProgressKeys(storage)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.key).toBe(key1)
      expect(result.cleared).toContain(key2)
      expect(storage.getItem(key2)).toBeNull()
      expect(storage.getItem(foreign)).toBe("keep")
      expect(warn).toHaveBeenCalled()

      // 失败的 key1 仍在 registry（未成功 delete）
      expect(getRegisteredSessionProgressKeys()).toContain(key1)
      expect(getRegisteredSessionProgressKeys()).not.toContain(key2)
    })

    it("unregister 后 unload 不再删除该 key", () => {
      const key = toSessionProgressStorageKey(createProgressScopeFromDeckFilter(null))
      const storage = createMemoryStorage({ [key]: "x" })
      registerSessionProgressKey(key)
      unregisterSessionProgressKey(key)
      const result = clearRegisteredSessionProgressKeys(storage)
      expect(result.cleared).toHaveLength(0)
      expect(storage.getItem(key)).toBe("x")
    })
  })
})
