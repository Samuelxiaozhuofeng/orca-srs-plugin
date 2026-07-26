/**
 * storage.ts 核心持久层直接测试
 *
 * 覆盖（对应 improvements/中危问题.md 第 7 条的测试缺口）：
 * 1. save→load 往返：普通卡（srs.*）、Cloze 卡（srs.cN.*）、方向卡（srs.forward|backward.*）
 *    的属性名与 type code（数字=3、布尔=4、日期=5）与实现精确匹配
 * 2. 保存后 blockCache.delete 的缓存失效语义
 * 3. resetXxx 三个重置：resets 计数保留并递增，其余字段回初始
 * 4. 按前缀删除：deleteClozeCardSrsData 只删对应 srs.cN.* 前缀
 * 5. loadSrsStateInternal 的 parseNumber/parseDate 解析回退
 * 6. ensureClozeSrsState 的"已有不覆盖、缺失写初始"语义
 * 7. srs.state 枚举白名单（improvements/低危问题.md 第 22 条）：脏值回退 State.New 并 warn
 *
 * mock 方式参照 src/srs/listCard.test.ts：invokeEditorCommand 的 setProperties /
 * deleteProperties 真实落盘到 mockBlocks，invokeBackend 的 get-block 从 mockBlocks 读取。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { State } from "ts-fsrs"

import type { Block, DbId } from "../orca.d.ts"
import type { SrsState } from "./types"

const mockBlocks: Record<DbId, Block> = {}

const invokeBackendMock = vi.fn()
const invokeEditorCommandMock = vi.fn()

const mockOrca = {
  state: { blocks: mockBlocks },
  invokeBackend: invokeBackendMock,
  commands: { invokeEditorCommand: invokeEditorCommandMock },
  notify: vi.fn(),
}

// storage.ts 在调用时读取全局 orca，导入提升不影响此赋值生效
;(globalThis as any).orca = mockOrca

import { createInitialSrsState } from "./algorithm"
import {
  clearBlockCache,
  deleteCardSrsData,
  deleteClozeCardSrsData,
  deleteDirectionCardSrsData,
  ensureClozeSrsState,
  hasBlockCacheEntry,
  loadCardSrsState,
  loadClozeSrsState,
  loadDirectionSrsState,
  resetCardSrsState,
  resetClozeSrsState,
  resetDirectionSrsState,
  saveCardSrsState,
  saveClozeSrsState,
  saveDirectionSrsState,
} from "./storage"

// 固定"当前时间"（本地时区正午，避免跨零点/时区边界），保证 initial due 等断言确定性
const FIXED_NOW = new Date(2026, 6, 15, 12, 0, 0, 0)

type StoredProp = { name: string; type: number; value: unknown }

function makeBlock(partial: Partial<Block> & { id: DbId }): Block {
  return {
    id: partial.id,
    created: new Date(),
    modified: new Date(),
    children: partial.children ?? [],
    aliases: [],
    properties: partial.properties ?? [],
    refs: [],
    backRefs: [],
    text: partial.text ?? "",
    content: [],
  } as unknown as Block
}

const getProps = (id: DbId): StoredProp[] =>
  ((mockBlocks[id]?.properties ?? []) as unknown as StoredProp[])

const propNames = (id: DbId): string[] => getProps(id).map((p) => p.name)

/** 最近一次 setProperties 调用（[command, cursor, blockIds, properties]） */
const lastSetPropertiesCall = (): any[] | undefined => {
  const calls = (invokeEditorCommandMock.mock.calls as any[][]).filter(
    (c) => c[0] === "core.editor.setProperties"
  )
  return calls[calls.length - 1]
}

const setPropertiesCallCount = (): number =>
  (invokeEditorCommandMock.mock.calls as any[][]).filter(
    (c) => c[0] === "core.editor.setProperties"
  ).length

const deletePropertiesCalls = (): any[][] =>
  (invokeEditorCommandMock.mock.calls as any[][]).filter(
    (c) => c[0] === "core.editor.deleteProperties"
  )

/** 与实现一致的字段→type code 期望（storage.ts saveSrsStateInternal / saveDirectionSrsState） */
const NUMERIC_FIELDS = [
  "stability",
  "difficulty",
  "interval",
  "reps",
  "lapses",
  "resets",
  "state",
] as const
const DATE_FIELDS = ["due", "lastReviewed"] as const

const makeState = (overrides: Partial<SrsState> = {}): SrsState => ({
  stability: 12.5,
  difficulty: 6.3,
  interval: 42,
  due: new Date("2026-08-01T10:00:00.000Z"),
  lastReviewed: new Date("2026-07-20T09:00:00.000Z"),
  reps: 7,
  lapses: 2,
  state: State.Review,
  resets: 1,
  ...overrides,
})

const expectStateEquals = (actual: SrsState, expected: SrsState): void => {
  expect(actual.stability).toBe(expected.stability)
  expect(actual.difficulty).toBe(expected.difficulty)
  expect(actual.interval).toBe(expected.interval)
  expect(actual.due.getTime()).toBe(expected.due.getTime())
  if (expected.lastReviewed === null) {
    expect(actual.lastReviewed).toBeNull()
  } else {
    expect(actual.lastReviewed?.getTime()).toBe(expected.lastReviewed.getTime())
  }
  expect(actual.reps).toBe(expected.reps)
  expect(actual.lapses).toBe(expected.lapses)
  expect(actual.state).toBe(expected.state)
  expect(actual.resets).toBe(expected.resets ?? 0)
}

describe("storage 核心持久层", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockBlocks)) {
      delete mockBlocks[Number(key)]
    }
    vi.clearAllMocks()
    // blockCache 是模块级 Map，必须在用例间清空，避免跨用例串缓存
    clearBlockCache()

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(FIXED_NOW)

    invokeBackendMock.mockImplementation(async (name: string, args: any) => {
      if (name === "get-block") {
        return mockBlocks[args as DbId]
      }
      if (name === "get-blocks") {
        const ids = args as DbId[]
        if (!Array.isArray(ids)) return []
        return ids.map((id) => mockBlocks[id]).filter(Boolean)
      }
      return null
    })

    invokeEditorCommandMock.mockImplementation(
      async (command: string, _cursor: any, blockIds: DbId[], payload: any) => {
        if (command === "core.editor.setProperties") {
          const props = payload as StoredProp[]
          for (const id of blockIds) {
            let block = mockBlocks[id]
            if (!block) {
              block = makeBlock({ id })
              mockBlocks[id] = block
            }
            const stored = (block.properties ?? []) as unknown as StoredProp[]
            for (const p of props) {
              const idx = stored.findIndex((x) => x.name === p.name)
              if (idx >= 0) stored[idx] = { ...stored[idx], ...p }
              else stored.push({ ...p })
            }
            ;(block as any).properties = stored
          }
          return null
        }
        if (command === "core.editor.deleteProperties") {
          const names = payload as string[]
          for (const id of blockIds) {
            const block = mockBlocks[id]
            if (!block) continue
            ;(block as any).properties = (
              (block.properties ?? []) as unknown as StoredProp[]
            ).filter((p) => !names.includes(p.name))
          }
          return null
        }
        return null
      }
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ==========================================================================
  // 1. save→load 往返：属性名与 type code
  // ==========================================================================

  describe("save→load 往返与属性命名/type code", () => {
    it("普通卡：写出全部 srs.* 属性（数字=3、日期=5、isCard=4），load 完整还原", async () => {
      const id = 100 as DbId
      mockBlocks[id] = makeBlock({ id })
      const state = makeState()

      await saveCardSrsState(id, state)

      const call = lastSetPropertiesCall()
      expect(call).toBeDefined()
      // 调用形态：cursor=null，blockIds=[id]
      expect(call![1]).toBeNull()
      expect(call![2]).toEqual([id])

      const props = call![3] as StoredProp[]
      const byName = new Map(props.map((p) => [p.name, p]))
      // 9 个状态字段 + srs.isCard 标记，且不多不少
      expect(props).toHaveLength(10)
      expect(byName.get("srs.isCard")).toMatchObject({ value: true, type: 4 })
      for (const field of NUMERIC_FIELDS) {
        expect(byName.get(`srs.${field}`)?.type).toBe(3)
      }
      for (const field of DATE_FIELDS) {
        expect(byName.get(`srs.${field}`)?.type).toBe(5)
      }
      // 值精确落盘
      expect(byName.get("srs.stability")?.value).toBe(12.5)
      expect(byName.get("srs.difficulty")?.value).toBe(6.3)
      expect(byName.get("srs.interval")?.value).toBe(42)
      expect(byName.get("srs.reps")?.value).toBe(7)
      expect(byName.get("srs.lapses")?.value).toBe(2)
      expect(byName.get("srs.resets")?.value).toBe(1)
      expect(byName.get("srs.state")?.value).toBe(State.Review)
      expect((byName.get("srs.due")?.value as Date).getTime()).toBe(
        state.due.getTime()
      )
      expect((byName.get("srs.lastReviewed")?.value as Date).getTime()).toBe(
        state.lastReviewed!.getTime()
      )

      const loaded = await loadCardSrsState(id)
      expectStateEquals(loaded, state)
    })

    it("普通卡：lastReviewed 为 null 时以 null 落盘（type 5），load 还原为 null", async () => {
      const id = 101 as DbId
      mockBlocks[id] = makeBlock({ id })
      const state = makeState({ lastReviewed: null })

      await saveCardSrsState(id, state)

      const props = lastSetPropertiesCall()![3] as StoredProp[]
      const lastReviewed = props.find((p) => p.name === "srs.lastReviewed")
      expect(lastReviewed).toMatchObject({ value: null, type: 5 })

      const loaded = await loadCardSrsState(id)
      expect(loaded.lastReviewed).toBeNull()
    })

    it("cloze 卡：全部属性带 srs.cN. 前缀、不写 srs.isCard，load 还原；未写编号仍为初始态", async () => {
      const id = 110 as DbId
      mockBlocks[id] = makeBlock({ id })
      const state = makeState({ stability: 3.3, reps: 4, resets: 2 })

      await saveClozeSrsState(id, 2, state)

      const props = lastSetPropertiesCall()![3] as StoredProp[]
      expect(props).toHaveLength(9)
      expect(props.every((p) => p.name.startsWith("srs.c2."))).toBe(true)
      expect(props.some((p) => p.name === "srs.isCard")).toBe(false)
      const byName = new Map(props.map((p) => [p.name, p]))
      for (const field of NUMERIC_FIELDS) {
        expect(byName.get(`srs.c2.${field}`)?.type).toBe(3)
      }
      for (const field of DATE_FIELDS) {
        expect(byName.get(`srs.c2.${field}`)?.type).toBe(5)
      }

      const loaded = await loadClozeSrsState(id, 2)
      expectStateEquals(loaded, state)

      // 只写了 c2：c1 读取应回退到初始状态（fake Date 下 due=now）
      const c1 = await loadClozeSrsState(id, 1)
      expect(c1.reps).toBe(0)
      expect(c1.lapses).toBe(0)
      expect(c1.stability).toBe(0)
      expect(c1.state).toBe(State.New)
      expect(c1.resets).toBe(0)
      expect(c1.due.getTime()).toBe(FIXED_NOW.getTime())
    })

    it("方向卡：forward/backward 各自写 srs.<dir>.* 前缀且互不串扰，type code 正确", async () => {
      const id = 120 as DbId
      mockBlocks[id] = makeBlock({ id })
      const forwardState = makeState({ reps: 3, stability: 5.5 })
      const backwardState = makeState({ reps: 9, stability: 8.8, lapses: 4 })

      await saveDirectionSrsState(id, "forward", forwardState)
      const forwardProps = lastSetPropertiesCall()![3] as StoredProp[]
      expect(forwardProps).toHaveLength(9)
      expect(forwardProps.every((p) => p.name.startsWith("srs.forward."))).toBe(true)
      expect(forwardProps.some((p) => p.name === "srs.isCard")).toBe(false)
      const byName = new Map(forwardProps.map((p) => [p.name, p]))
      for (const field of NUMERIC_FIELDS) {
        expect(byName.get(`srs.forward.${field}`)?.type).toBe(3)
      }
      for (const field of DATE_FIELDS) {
        expect(byName.get(`srs.forward.${field}`)?.type).toBe(5)
      }

      await saveDirectionSrsState(id, "backward", backwardState)
      const backwardProps = lastSetPropertiesCall()![3] as StoredProp[]
      expect(backwardProps.every((p) => p.name.startsWith("srs.backward."))).toBe(true)

      const loadedForward = await loadDirectionSrsState(id, "forward")
      const loadedBackward = await loadDirectionSrsState(id, "backward")
      expectStateEquals(loadedForward, forwardState)
      expectStateEquals(loadedBackward, backwardState)
    })
  })

  // ==========================================================================
  // 2. 缓存失效语义（保存后 blockCache.delete）
  // ==========================================================================

  describe("缓存失效语义", () => {
    it("load 会缓存块；外部直改属性不失效则读到旧值；save 后缓存条目被删除且读到新值", async () => {
      const id = 200 as DbId
      mockBlocks[id] = makeBlock({
        id,
        properties: [{ name: "srs.reps", type: 3, value: 5 }] as any,
      })

      const first = await loadCardSrsState(id)
      expect(first.reps).toBe(5)
      expect(hasBlockCacheEntry(id)).toBe(true)

      // 绕过失效直接替换后端块对象：再次 load 命中缓存（持有旧对象引用），仍是旧值
      mockBlocks[id] = makeBlock({
        id,
        properties: [{ name: "srs.reps", type: 3, value: 9 }] as any,
      })
      const stale = await loadCardSrsState(id)
      expect(stale.reps).toBe(5)

      // save 后缓存条目被 delete，随后 load 走后端拿到新值
      await saveCardSrsState(id, makeState({ reps: 9 }))
      expect(hasBlockCacheEntry(id)).toBe(false)
      const fresh = await loadCardSrsState(id)
      expect(fresh.reps).toBe(9)
    })

    it("saveClozeSrsState / saveDirectionSrsState 同样删除缓存条目", async () => {
      const id = 201 as DbId
      mockBlocks[id] = makeBlock({ id })

      await loadClozeSrsState(id, 1)
      expect(hasBlockCacheEntry(id)).toBe(true)
      await saveClozeSrsState(id, 1, makeState())
      expect(hasBlockCacheEntry(id)).toBe(false)

      await loadDirectionSrsState(id, "forward")
      expect(hasBlockCacheEntry(id)).toBe(true)
      await saveDirectionSrsState(id, "forward", makeState())
      expect(hasBlockCacheEntry(id)).toBe(false)
    })
  })

  // ==========================================================================
  // 3. resetXxx：resets 保留并递增，其余回初始
  // ==========================================================================

  describe("resetXxx 重置", () => {
    it("resetCardSrsState：resets 2→3，其余字段回初始并持久化", async () => {
      const id = 300 as DbId
      mockBlocks[id] = makeBlock({ id })
      await saveCardSrsState(id, makeState({ resets: 2 }))

      const result = await resetCardSrsState(id)
      const initial = createInitialSrsState(new Date())

      expect(result.resets).toBe(3)
      expect(result.reps).toBe(0)
      expect(result.lapses).toBe(0)
      expect(result.interval).toBe(0)
      expect(result.stability).toBe(initial.stability)
      expect(result.difficulty).toBe(initial.difficulty)
      expect(result.state).toBe(State.New)
      expect(result.lastReviewed).toBeNull()
      expect(result.due.getTime()).toBe(FIXED_NOW.getTime())

      const persisted = await loadCardSrsState(id)
      expect(persisted.resets).toBe(3)
      expect(persisted.reps).toBe(0)
      expect(persisted.due.getTime()).toBe(FIXED_NOW.getTime())
    })

    it("resetClozeSrsState：只重置对应编号；无先前 resets 时从 0 递增到 1", async () => {
      const id = 301 as DbId
      mockBlocks[id] = makeBlock({ id })
      await saveClozeSrsState(id, 1, makeState({ resets: 0 }))
      await saveClozeSrsState(id, 2, makeState({ reps: 11, resets: 5 }))

      const result = await resetClozeSrsState(id, 1)
      expect(result.resets).toBe(1)
      expect(result.reps).toBe(0)

      const persistedC1 = await loadClozeSrsState(id, 1)
      expect(persistedC1.resets).toBe(1)
      expect(persistedC1.reps).toBe(0)

      // c2 不受影响
      const persistedC2 = await loadClozeSrsState(id, 2)
      expect(persistedC2.reps).toBe(11)
      expect(persistedC2.resets).toBe(5)
    })

    it("resetDirectionSrsState：只重置对应方向，另一方向不动", async () => {
      const id = 302 as DbId
      mockBlocks[id] = makeBlock({ id })
      await saveDirectionSrsState(id, "forward", makeState({ reps: 6, resets: 1 }))
      await saveDirectionSrsState(id, "backward", makeState({ reps: 8, resets: 4 }))

      const result = await resetDirectionSrsState(id, "backward")
      expect(result.resets).toBe(5)
      expect(result.reps).toBe(0)

      const backward = await loadDirectionSrsState(id, "backward")
      expect(backward.resets).toBe(5)
      expect(backward.reps).toBe(0)

      const forward = await loadDirectionSrsState(id, "forward")
      expect(forward.reps).toBe(6)
      expect(forward.resets).toBe(1)
    })
  })

  // ==========================================================================
  // 4. 按前缀删除
  // ==========================================================================

  describe("按前缀删除", () => {
    const seedMixedProps = (id: DbId): void => {
      mockBlocks[id] = makeBlock({
        id,
        properties: [
          { name: "srs.c1.due", type: 5, value: new Date("2026-07-01T00:00:00Z") },
          { name: "srs.c1.stability", type: 3, value: 1.1 },
          { name: "srs.c2.due", type: 5, value: new Date("2026-07-02T00:00:00Z") },
          // 前缀含结尾点号：srs.c10.* 不得被 c1 的删除误删
          { name: "srs.c10.due", type: 5, value: new Date("2026-07-03T00:00:00Z") },
          { name: "srs.forward.due", type: 5, value: new Date("2026-07-04T00:00:00Z") },
          { name: "srs.due", type: 5, value: new Date("2026-07-05T00:00:00Z") },
          { name: "srs.isCard", type: 4, value: true },
          { name: "unrelated", type: 1, value: "keep" },
        ] as any,
      })
    }

    it("deleteClozeCardSrsData(id, 1) 只删 srs.c1.*，不动 srs.c2.*/srs.c10.*/srs.forward.*/srs.*", async () => {
      const id = 400 as DbId
      seedMixedProps(id)

      await deleteClozeCardSrsData(id, 1)

      const calls = deletePropertiesCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0][2]).toEqual([id])
      expect([...(calls[0][3] as string[])].sort()).toEqual(
        ["srs.c1.due", "srs.c1.stability"].sort()
      )

      const remaining = propNames(id)
      expect(remaining).toContain("srs.c2.due")
      expect(remaining).toContain("srs.c10.due")
      expect(remaining).toContain("srs.forward.due")
      expect(remaining).toContain("srs.due")
      expect(remaining).toContain("srs.isCard")
      expect(remaining).toContain("unrelated")
      expect(remaining).not.toContain("srs.c1.due")
      expect(remaining).not.toContain("srs.c1.stability")

      // 删除后缓存条目被清
      expect(hasBlockCacheEntry(id)).toBe(false)
    })

    it("deleteDirectionCardSrsData(id, 'forward') 只删 srs.forward.*", async () => {
      const id = 401 as DbId
      seedMixedProps(id)

      await deleteDirectionCardSrsData(id, "forward")

      const calls = deletePropertiesCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0][3]).toEqual(["srs.forward.due"])

      const remaining = propNames(id)
      expect(remaining).not.toContain("srs.forward.due")
      expect(remaining).toContain("srs.c1.due")
      expect(remaining).toContain("srs.due")
      expect(hasBlockCacheEntry(id)).toBe(false)
    })

    it("deleteCardSrsData 删除全部 srs. 前缀属性（现状：包含 cloze/direction 子前缀），保留非 srs 属性", async () => {
      const id = 402 as DbId
      seedMixedProps(id)

      await deleteCardSrsData(id)

      // 现状行为：前缀为 "srs."，因此 srs.cN.* / srs.forward.* 一并删除。
      // 与变体级删除的配合问题见 improvements/中危问题.md 的相关审计条目，此处只锁定现状。
      const remaining = propNames(id)
      expect(remaining).toEqual(["unrelated"])
      expect(hasBlockCacheEntry(id)).toBe(false)
    })

    it("块上无匹配前缀属性时早退，不调用 deleteProperties", async () => {
      const id = 403 as DbId
      mockBlocks[id] = makeBlock({
        id,
        properties: [{ name: "unrelated", type: 1, value: "keep" }] as any,
      })

      await deleteClozeCardSrsData(id, 7)
      await deleteDirectionCardSrsData(id, "backward")
      await deleteCardSrsData(id)

      expect(deletePropertiesCalls()).toHaveLength(0)
      expect(propNames(id)).toEqual(["unrelated"])
    })
  })

  // ==========================================================================
  // 5. 解析回退（parseNumber / parseDate）
  // ==========================================================================

  describe("解析回退", () => {
    it("字符串数字可解析：'3.5'→3.5、'7'→7", async () => {
      const id = 500 as DbId
      mockBlocks[id] = makeBlock({
        id,
        properties: [
          { name: "srs.stability", type: 3, value: "3.5" },
          { name: "srs.reps", type: 3, value: "7" },
        ] as any,
      })

      const loaded = await loadCardSrsState(id)
      expect(loaded.stability).toBe(3.5)
      expect(loaded.reps).toBe(7)
    })

    it("非法数字（'abc'、boolean）回退初始值；现状：空字符串经 Number('')===0 解析为 0", async () => {
      const id = 501 as DbId
      mockBlocks[id] = makeBlock({
        id,
        properties: [
          { name: "srs.stability", type: 3, value: "abc" },
          { name: "srs.difficulty", type: 3, value: true },
          // parseNumber 现状：Number("") === 0 为有限数，返回 0 而非回退值
          { name: "srs.reps", type: 3, value: "" },
        ] as any,
      })

      const initial = createInitialSrsState(new Date())
      const loaded = await loadCardSrsState(id)
      expect(loaded.stability).toBe(initial.stability)
      expect(loaded.difficulty).toBe(initial.difficulty)
      expect(loaded.reps).toBe(0)
    })

    it("非法日期回退：due 回退到 load 时的 now，lastReviewed 回退 null；合法 ISO 字符串正常解析", async () => {
      const id = 502 as DbId
      mockBlocks[id] = makeBlock({
        id,
        properties: [
          { name: "srs.due", type: 5, value: "not-a-date" },
          { name: "srs.lastReviewed", type: 5, value: "also-not-a-date" },
        ] as any,
      })

      const loaded = await loadCardSrsState(id)
      expect(loaded.due.getTime()).toBe(FIXED_NOW.getTime())
      expect(loaded.lastReviewed).toBeNull()

      const id2 = 503 as DbId
      mockBlocks[id2] = makeBlock({
        id: id2,
        properties: [
          { name: "srs.due", type: 5, value: "2026-09-01T08:00:00.000Z" },
          { name: "srs.lastReviewed", type: 5, value: "2026-08-30T08:00:00.000Z" },
        ] as any,
      })

      const loaded2 = await loadCardSrsState(id2)
      expect(loaded2.due.getTime()).toBe(
        new Date("2026-09-01T08:00:00.000Z").getTime()
      )
      expect(loaded2.lastReviewed?.getTime()).toBe(
        new Date("2026-08-30T08:00:00.000Z").getTime()
      )
    })

    it("属性缺失或块不存在时返回完整初始态（due=now、lastReviewed=null、计数为 0）", async () => {
      // 属性缺失
      const id = 504 as DbId
      mockBlocks[id] = makeBlock({ id, properties: [] })
      const loaded = await loadCardSrsState(id)
      expect(loaded.due.getTime()).toBe(FIXED_NOW.getTime())
      expect(loaded.lastReviewed).toBeNull()
      expect(loaded.reps).toBe(0)
      expect(loaded.lapses).toBe(0)
      expect(loaded.stability).toBe(0)
      expect(loaded.state).toBe(State.New)
      expect(loaded.resets).toBe(0)

      // 块不存在（get-block 返回 undefined）
      const missing = await loadCardSrsState(999 as DbId)
      expect(missing.due.getTime()).toBe(FIXED_NOW.getTime())
      expect(missing.reps).toBe(0)
      expect(missing.lastReviewed).toBeNull()
    })

    it("srs.state 脏值（越界 7 / 'abc' / 非整数 2.5）回退 State.New 并 warn（含块 id、属性名、脏值）", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        // 越界数字：ts-fsrs State 枚举只有 0-3
        const id = 505 as DbId
        mockBlocks[id] = makeBlock({
          id,
          properties: [{ name: "srs.state", type: 3, value: 7 }] as any,
        })
        const outOfRange = await loadCardSrsState(id)
        expect(outOfRange.state).toBe(State.New)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy.mock.calls[0][0]).toContain("505")
        expect(warnSpy.mock.calls[0][0]).toContain("srs.state")
        expect(warnSpy.mock.calls[0][0]).toContain("7")

        // 非数字字符串
        const id2 = 506 as DbId
        mockBlocks[id2] = makeBlock({
          id: id2,
          properties: [{ name: "srs.state", type: 3, value: "abc" }] as any,
        })
        const nonNumeric = await loadCardSrsState(id2)
        expect(nonNumeric.state).toBe(State.New)
        expect(warnSpy).toHaveBeenCalledTimes(2)
        expect(warnSpy.mock.calls[1][0]).toContain("abc")

        // 非整数
        const id3 = 507 as DbId
        mockBlocks[id3] = makeBlock({
          id: id3,
          properties: [{ name: "srs.state", type: 3, value: 2.5 }] as any,
        })
        const nonInteger = await loadCardSrsState(id3)
        expect(nonInteger.state).toBe(State.New)
        expect(warnSpy).toHaveBeenCalledTimes(3)
      } finally {
        warnSpy.mockRestore()
      }
    })

    it("srs.state 合法值透传：数字 3 → Relearning、字符串 '2' → Review；缺失静默回退 New，均不 warn", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        const id = 508 as DbId
        mockBlocks[id] = makeBlock({
          id,
          properties: [{ name: "srs.state", type: 3, value: 3 }] as any,
        })
        expect((await loadCardSrsState(id)).state).toBe(State.Relearning)

        // 维持 parseNumber 既有的字符串数字容忍
        const id2 = 509 as DbId
        mockBlocks[id2] = makeBlock({
          id: id2,
          properties: [{ name: "srs.state", type: 3, value: "2" }] as any,
        })
        expect((await loadCardSrsState(id2)).state).toBe(State.Review)

        // 属性缺失：未初始化，静默回退 State.New
        const id3 = 510 as DbId
        mockBlocks[id3] = makeBlock({ id: id3, properties: [] })
        expect((await loadCardSrsState(id3)).state).toBe(State.New)

        expect(warnSpy).not.toHaveBeenCalled()
      } finally {
        warnSpy.mockRestore()
      }
    })

    it("cloze / 方向卡的 state 脏值同样回退 State.New，warn 中带各自的属性名前缀", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        const id = 511 as DbId
        mockBlocks[id] = makeBlock({
          id,
          properties: [
            { name: "srs.c1.state", type: 3, value: 42 },
            { name: "srs.forward.state", type: 3, value: -1 },
          ] as any,
        })

        const cloze = await loadClozeSrsState(id, 1)
        expect(cloze.state).toBe(State.New)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy.mock.calls[0][0]).toContain("srs.c1.state")
        expect(warnSpy.mock.calls[0][0]).toContain("42")

        const forward = await loadDirectionSrsState(id, "forward")
        expect(forward.state).toBe(State.New)
        expect(warnSpy).toHaveBeenCalledTimes(2)
        expect(warnSpy.mock.calls[1][0]).toContain("srs.forward.state")
        expect(warnSpy.mock.calls[1][0]).toContain("-1")
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  // ==========================================================================
  // 6. ensureClozeSrsState
  // ==========================================================================

  describe("ensureClozeSrsState", () => {
    it("已有 srs.cN.* 前缀属性时不覆盖：不再调用 setProperties，返回已存状态", async () => {
      const id = 600 as DbId
      mockBlocks[id] = makeBlock({ id })
      const saved = makeState({ reps: 4, resets: 2 })
      await saveClozeSrsState(id, 3, saved)
      const writesBefore = setPropertiesCallCount()

      const ensured = await ensureClozeSrsState(id, 3)

      expect(setPropertiesCallCount()).toBe(writesBefore)
      expectStateEquals(ensured, saved)
    })

    it("无该编号前缀时写入初始状态：due=今天+daysOffset 的零点；其他编号属性不动", async () => {
      const id = 601 as DbId
      mockBlocks[id] = makeBlock({
        id,
        // 已有 c1 前缀，但 ensure 的是 c2 → 仍应写入 c2 初始
        properties: [{ name: "srs.c1.reps", type: 3, value: 5 }] as any,
      })

      const ensured = await ensureClozeSrsState(id, 2, 1)

      const expectedDue = new Date(FIXED_NOW)
      expectedDue.setDate(expectedDue.getDate() + 1)
      expectedDue.setHours(0, 0, 0, 0)

      expect(ensured.due.getTime()).toBe(expectedDue.getTime())
      expect(ensured.reps).toBe(0)
      expect(ensured.resets).toBe(0)
      expect(ensured.state).toBe(State.New)

      // 已真实落盘为 srs.c2.* 属性
      const names = propNames(id)
      expect(names).toContain("srs.c2.due")
      expect(names).toContain("srs.c2.stability")
      // c1 原属性未被改动
      expect(getProps(id).find((p) => p.name === "srs.c1.reps")?.value).toBe(5)

      // 落盘后 load 与返回值一致
      const persisted = await loadClozeSrsState(id, 2)
      expect(persisted.due.getTime()).toBe(expectedDue.getTime())
      expect(persisted.reps).toBe(0)
    })

    it("daysOffset 默认 0：写入 due=今天零点", async () => {
      const id = 602 as DbId
      mockBlocks[id] = makeBlock({ id, properties: [] })

      const ensured = await ensureClozeSrsState(id, 1)

      const expectedDue = new Date(FIXED_NOW)
      expectedDue.setHours(0, 0, 0, 0)
      expect(ensured.due.getTime()).toBe(expectedDue.getTime())
    })
  })
})
