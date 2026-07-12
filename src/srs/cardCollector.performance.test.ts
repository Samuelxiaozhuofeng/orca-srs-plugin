/**
 * FC-13：全库收集性能与行为等价
 *
 * - 可复现基准：以后端调用次数 / 并发峰值为准（不依赖墙钟噪声）
 * - 优化前后数据：disableOptimizations 复现优化前路径
 * - 行为等价：card key、顺序、due、isNew、deck、cardType、变体字段
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Block, DbId } from "../orca.d.ts"
import {
  collectReviewCards,
  resetCollectCachesForTests,
  type CollectReviewCardsMetrics
} from "./cardCollector"
import {
  BLOCK_PREFETCH_BATCH_SIZE,
  BLOCK_PREFETCH_CONCURRENCY,
  clearBlockCache,
  hasBlockCacheEntry,
  invalidateBlockCache,
  normalizeBoundedPositiveInt,
  preheatBlockCache,
  prefetchBlocksByIds,
  runBoundedConcurrency
} from "./storage"
import {
  clearDeckNameCache,
  DECK_PREFETCH_BATCH_SIZE,
  DECK_PREFETCH_CONCURRENCY,
  extractDeckName,
  getDeckNameCacheSize,
  prefetchDeckNamesForBlocks
} from "./deckUtils"
import { cardKeyFromReviewCard } from "./cardIdentity"
import type { ReviewCard } from "./types"

const mockBlocks: Record<number, Block> = {}

type BackendCall = {
  method: string
  at: number
}

const backendLog: BackendCall[] = []
/** 每次 get-blocks 请求的 id 数量（用于断言批次 ≤50） */
const getBlocksBatchSizes: number[] = []
let inflight = 0
let concurrencyPeak = 0
/** 可选：模拟 get-blocks 延迟以便观察并发 */
let getBlocksDelayMs = 0

const mockOrca = {
  state: {
    blocks: {} as Record<number, Block | undefined>
  },
  invokeBackend: vi.fn(),
  commands: {
    invokeEditorCommand: vi.fn()
  },
  notify: vi.fn(),
  broadcasts: { broadcast: vi.fn() }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

function makeBlock(partial: Partial<Block> & { id: DbId }): Block {
  return {
    id: partial.id,
    created: partial.created ?? new Date("2020-01-01T00:00:00Z"),
    modified: partial.modified ?? new Date("2020-01-01T00:00:00Z"),
    children: partial.children ?? [],
    aliases: partial.aliases ?? [],
    properties: partial.properties ?? [],
    refs: partial.refs ?? [],
    backRefs: partial.backRefs ?? [],
    parent: partial.parent,
    text: partial.text ?? "",
    content: partial.content ?? []
  } as Block
}

function srsProps(due: Date, reps: number, lastReviewed: Date | null): Block["properties"] {
  return [
    { name: "srs.isCard", value: true, type: 4 },
    { name: "srs.stability", value: 1, type: 3 },
    { name: "srs.difficulty", value: 5, type: 3 },
    { name: "srs.interval", value: 1, type: 3 },
    { name: "srs.due", value: due, type: 5 },
    { name: "srs.lastReviewed", value: lastReviewed, type: 5 },
    { name: "srs.reps", value: reps, type: 3 },
    { name: "srs.lapses", value: 0, type: 3 },
    { name: "srs.state", value: reps === 0 ? 0 : 2, type: 3 },
    { name: "srs.resets", value: 0, type: 3 }
  ] as Block["properties"]
}

/** 构建 N 张 basic mock 卡 + 若干去重牌组目标块 */
function seedBasicLibrary(count: number, options?: { deckCount?: number }) {
  const deckCount = options?.deckCount ?? Math.min(20, Math.max(1, Math.ceil(count / 50)))
  const deckIds: number[] = []
  for (let d = 0; d < deckCount; d++) {
    const deckId = 900_000 + d
    deckIds.push(deckId)
    mockBlocks[deckId] = makeBlock({
      id: deckId as DbId,
      text: `Deck-${d}`
    })
  }

  const cardBlocks: Block[] = []
  const answerBlocks: Record<number, Block> = {}
  const dueBase = new Date("2020-01-01T00:00:00Z")
  for (let i = 0; i < count; i++) {
    const id = 10_000 + i
    const deckId = deckIds[i % deckIds.length]
    // 牌组属性 value 为「引用 id」；refs 中另有条目 id 相同且 to=牌组块
    const cardTagRefId = 50_000 + i
    const deckPropRefId = 70_000 + i
    const isNew = i % 5 === 0
    const block = makeBlock({
      id: id as DbId,
      text: `Q${i}`,
      children: [(200_000 + i) as DbId],
      properties: srsProps(
        new Date(dueBase.getTime() + i * 1000),
        isNew ? 0 : 3,
        isNew ? null : new Date("2019-12-01T00:00:00Z")
      ),
      refs: [
        {
          id: cardTagRefId,
          type: 2,
          alias: "card",
          data: [
            { name: "type", value: "basic" },
            { name: "牌组", value: [deckPropRefId] }
          ]
        } as any,
        {
          id: deckPropRefId,
          type: 1,
          to: deckId
        } as any
      ]
    })
    // 答案子块（resolveFrontBack 走 orca.state.blocks）
    const answer = makeBlock({
      id: (200_000 + i) as DbId,
      text: `A${i}`,
      parent: id as DbId
    })
    mockBlocks[200_000 + i] = answer
    answerBlocks[200_000 + i] = answer
    mockBlocks[id] = block
    cardBlocks.push(block)
  }

  // get-blocks-with-tags 返回完整块（含 properties），模拟正式标签查询
  return { cardBlocks, deckIds, answerBlocks }
}

function countMethods(log: BackendCall[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of log) {
    out[c.method] = (out[c.method] ?? 0) + 1
  }
  return out
}

function fingerprint(cards: ReviewCard[]) {
  return cards.map((c) => ({
    key: cardKeyFromReviewCard(c),
    id: c.id,
    deck: c.deck,
    isNew: c.isNew,
    due: c.srs.due.getTime(),
    cardType: c.cardType,
    clozeNumber: c.clozeNumber,
    directionType: c.directionType,
    listItemId: c.listItemId,
    reps: c.srs.reps
  }))
}

describe("FC-13 collectReviewCards performance", () => {
  beforeEach(() => {
    Object.keys(mockBlocks).forEach((k) => delete mockBlocks[Number(k)])
    mockOrca.state.blocks = {}
    backendLog.length = 0
    getBlocksBatchSizes.length = 0
    inflight = 0
    concurrencyPeak = 0
    getBlocksDelayMs = 0
    vi.clearAllMocks()
    resetCollectCachesForTests()

    mockOrca.invokeBackend.mockImplementation(async (method: string, arg: unknown) => {
      inflight++
      if (inflight > concurrencyPeak) concurrencyPeak = inflight
      backendLog.push({ method, at: Date.now() })
      try {
        if (method === "get-blocks-with-tags") {
          const tag = Array.isArray(arg) ? arg[0] : arg
          if (String(tag).toLowerCase() === "card") {
            return Object.values(mockBlocks).filter((b) =>
              b.refs?.some((r) => r.type === 2 && String(r.alias).toLowerCase() === "card")
            )
          }
          return []
        }
        if (method === "get-block") {
          const id = arg as DbId
          return mockBlocks[id as number]
        }
        if (method === "get-blocks") {
          if (getBlocksDelayMs > 0) {
            await new Promise((r) => setTimeout(r, getBlocksDelayMs))
          }
          const ids = arg as DbId[]
          if (!Array.isArray(ids)) {
            throw new Error("get-blocks expects id array")
          }
          getBlocksBatchSizes.push(ids.length)
          return ids.map((id) => mockBlocks[id as number]).filter(Boolean)
        }
        if (method === "get-all-blocks") {
          return Object.values(mockBlocks)
        }
        return null
      } finally {
        inflight--
      }
    })

    mockOrca.commands.invokeEditorCommand.mockImplementation(
      async (command: string, _c: unknown, blockIds: unknown, propsOrOther: unknown) => {
        if (command !== "core.editor.setProperties") return null
        const ids = blockIds as DbId[]
        const props = propsOrOther as Array<{ name: string; value: unknown; type: number }>
        for (const id of ids) {
          const block = mockBlocks[id as number]
          if (!block) continue
          block.properties = block.properties ?? []
          for (const p of props) {
            const idx = block.properties.findIndex((x) => x.name === p.name)
            if (idx >= 0) block.properties[idx] = { ...block.properties[idx], ...p } as any
            else block.properties.push({ ...p } as any)
          }
        }
        return null
      }
    )
  })

  afterEach(() => {
    resetCollectCachesForTests()
  })

  async function measure(
    count: number,
    disableOptimizations: boolean
  ): Promise<{
    cards: ReviewCard[]
    metrics: CollectReviewCardsMetrics
    methodCounts: Record<string, number>
    totalBackendCalls: number
    concurrencyPeakObserved: number
  }> {
    // 清空上一轮 mock
    Object.keys(mockBlocks).forEach((k) => delete mockBlocks[Number(k)])
    const { answerBlocks } = seedBasicLibrary(count)
    // 仅答案子块进 state（模拟常见：标签查询返回卡块，牌组目标不在 state）
    mockOrca.state.blocks = { ...answerBlocks }
    resetCollectCachesForTests()
    backendLog.length = 0
    concurrencyPeak = 0

    const metricsOut: { current?: CollectReviewCardsMetrics } = {}
    const cards = await collectReviewCards("perf-test", {
      disableOptimizations,
      metricsOut
    })

    const methodCounts = countMethods(backendLog)
    return {
      cards,
      metrics: metricsOut.current!,
      methodCounts,
      totalBackendCalls: backendLog.length,
      concurrencyPeakObserved: concurrencyPeak
    }
  }

  it.each([100, 1000, 5000] as const)(
    "N=%i：优化后 get-block 显著下降，行为与优化前等价",
    async (n) => {
      // 优化前基线
      const before = await measure(n, true)
      // 优化后
      const after = await measure(n, false)

      expect(before.cards.length).toBe(n)
      expect(after.cards.length).toBe(n)
      expect(fingerprint(after.cards)).toEqual(fingerprint(before.cards))

      const beforeGetBlock = before.methodCounts["get-block"] ?? 0
      const afterGetBlock = after.methodCounts["get-block"] ?? 0
      const afterGetBlocks = after.methodCounts["get-blocks"] ?? 0

      // 标签查询返回完整块后，优化路径不应再对每张卡 get-block
      expect(beforeGetBlock).toBeGreaterThanOrEqual(n)
      expect(afterGetBlock).toBe(0)
      // 牌组目标块走批量 get-blocks（去重后远小于 n）
      expect(afterGetBlocks).toBeGreaterThan(0)
      expect(afterGetBlocks).toBeLessThan(n)
      expect(after.totalBackendCalls).toBeLessThan(before.totalBackendCalls)

      // 并发峰值不超过固定上限
      expect(after.concurrencyPeakObserved).toBeLessThanOrEqual(
        Math.max(BLOCK_PREFETCH_CONCURRENCY, DECK_PREFETCH_CONCURRENCY)
      )
      expect(after.metrics.concurrencyPeak).toBeLessThanOrEqual(
        Math.max(BLOCK_PREFETCH_CONCURRENCY, DECK_PREFETCH_CONCURRENCY)
      )
      expect(after.metrics.preheatCount).toBeGreaterThanOrEqual(n)
      expect(after.metrics.optimizationsEnabled).toBe(true)
      expect(before.metrics.optimizationsEnabled).toBe(false)

      // 记录可复现数字（断言驱动稳定性；console 仅便于人工查看）
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          n,
          before: {
            totalBackendCalls: before.totalBackendCalls,
            methods: before.methodCounts,
            totalMs: Math.round(before.metrics.totalMs * 100) / 100,
            slowestStage: before.metrics.slowestStage,
            concurrencyPeak: before.concurrencyPeakObserved
          },
          after: {
            totalBackendCalls: after.totalBackendCalls,
            methods: after.methodCounts,
            totalMs: Math.round(after.metrics.totalMs * 100) / 100,
            slowestStage: after.metrics.slowestStage,
            concurrencyPeak: after.concurrencyPeakObserved,
            preheatCount: after.metrics.preheatCount,
            deckPrefetch: after.metrics.deckPrefetch
          }
        })
      )
    },
    120_000
  )

  it("牌组批量预取：去重 + 批次/并发上限，失败可见", async () => {
    seedBasicLibrary(120, { deckCount: 15 })
    mockOrca.state.blocks = {} // 强制走后端，不从 state 解析牌组名
    clearDeckNameCache()
    backendLog.length = 0
    concurrencyPeak = 0
    getBlocksDelayMs = 5

    const blocks = Object.values(mockBlocks).filter((b) =>
      b.refs?.some((r) => r.type === 2 && String(r.alias).toLowerCase() === "card")
    )
    const result = await prefetchDeckNamesForBlocks(blocks, {
      batchSize: DECK_PREFETCH_BATCH_SIZE,
      concurrency: DECK_PREFETCH_CONCURRENCY
    })

    expect(result.uniqueDeckIds).toBe(15)
    expect(result.getBlocksCalls).toBe(
      Math.ceil(15 / DECK_PREFETCH_BATCH_SIZE)
    )
    expect(result.concurrencyPeak).toBeLessThanOrEqual(DECK_PREFETCH_CONCURRENCY)
    expect(concurrencyPeak).toBeLessThanOrEqual(DECK_PREFETCH_CONCURRENCY)
    expect(backendLog.every((c) => c.method === "get-blocks")).toBe(true)
    expect(backendLog.some((c) => c.method === "get-block")).toBe(false)

    // 单卡解析不再发后端
    backendLog.length = 0
    const name = await extractDeckName(blocks[0])
    expect(name).toMatch(/^Deck-/)
    expect(backendLog.length).toBe(0)

    // 失败可见
    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks") throw new Error("backend deck boom")
      return null
    })
    clearDeckNameCache()
    await expect(prefetchDeckNamesForBlocks(blocks)).rejects.toThrow(/backend deck boom/)
  })

  it("prefetchBlocksByIds 遵守批次/并发上限且失败抛出", async () => {
    for (let i = 0; i < 120; i++) {
      mockBlocks[i] = makeBlock({ id: i as DbId, text: `B${i}` })
    }
    clearBlockCache()
    getBlocksDelayMs = 5
    concurrencyPeak = 0

    const ids = Array.from({ length: 120 }, (_, i) => i as DbId)
    const result = await prefetchBlocksByIds(ids, {
      batchSize: BLOCK_PREFETCH_BATCH_SIZE,
      concurrency: BLOCK_PREFETCH_CONCURRENCY
    })
    expect(result.batchCount).toBe(Math.ceil(120 / BLOCK_PREFETCH_BATCH_SIZE))
    expect(result.concurrencyPeak).toBeLessThanOrEqual(BLOCK_PREFETCH_CONCURRENCY)
    expect(concurrencyPeak).toBeLessThanOrEqual(BLOCK_PREFETCH_CONCURRENCY)
    expect(hasBlockCacheEntry(0 as DbId)).toBe(true)
    expect(Math.max(...getBlocksBatchSizes)).toBeLessThanOrEqual(BLOCK_PREFETCH_BATCH_SIZE)

    mockOrca.invokeBackend.mockImplementation(async (method: string) => {
      if (method === "get-blocks") throw new Error("batch fail")
      return null
    })
    clearBlockCache()
    await expect(prefetchBlocksByIds([1, 2, 3] as DbId[])).rejects.toThrow(/batch fail/)
  })

  describe("批次/并发参数归一化（非法值不得空跑或突破上限）", () => {
    const invalidParams: Array<{ batchSize: unknown; concurrency: unknown; label: string }> = [
      { batchSize: Number.NaN, concurrency: Number.NaN, label: "NaN" },
      { batchSize: Number.POSITIVE_INFINITY, concurrency: Number.POSITIVE_INFINITY, label: "Infinity" },
      { batchSize: Number.NEGATIVE_INFINITY, concurrency: Number.NEGATIVE_INFINITY, label: "-Infinity" },
      { batchSize: 0, concurrency: 0, label: "0" },
      { batchSize: -1, concurrency: -5, label: "负数" },
      { batchSize: 3.9, concurrency: 2.7, label: "小数" },
      { batchSize: 9999, concurrency: 1000, label: "超大值" },
      { batchSize: undefined, concurrency: undefined, label: "undefined→默认" }
    ]

    it.each(invalidParams)(
      "prefetchBlocksByIds：$label → 完成全部请求，batch≤50，并发≤4",
      async ({ batchSize, concurrency }) => {
        const n = 120
        for (let i = 0; i < n; i++) {
          mockBlocks[i] = makeBlock({ id: i as DbId, text: `B${i}` })
        }
        clearBlockCache()
        getBlocksBatchSizes.length = 0
        concurrencyPeak = 0
        getBlocksDelayMs = 5

        const ids = Array.from({ length: n }, (_, i) => i as DbId)
        const result = await prefetchBlocksByIds(ids, {
          batchSize: batchSize as number,
          concurrency: concurrency as number
        })

        // 全部 id 处理完成，不空跑、不挂死
        expect(result.requestedIds).toBe(n)
        expect(result.getBlocksCalls).toBeGreaterThan(0)
        expect(result.batchCount).toBe(result.getBlocksCalls)
        // 批次与并发硬上限
        expect(Math.max(0, ...getBlocksBatchSizes)).toBeLessThanOrEqual(BLOCK_PREFETCH_BATCH_SIZE)
        expect(result.concurrencyPeak).toBeLessThanOrEqual(BLOCK_PREFETCH_CONCURRENCY)
        expect(concurrencyPeak).toBeLessThanOrEqual(BLOCK_PREFETCH_CONCURRENCY)
        for (let i = 0; i < n; i++) {
          expect(hasBlockCacheEntry(i as DbId)).toBe(true)
        }
      }
    )

    it.each(invalidParams)(
      "prefetchDeckNamesForBlocks：$label → 完成全部牌组，batch≤50，并发≤4",
      async ({ batchSize, concurrency }) => {
        // 60 个去重牌组目标，保证多批
        seedBasicLibrary(60, { deckCount: 60 })
        mockOrca.state.blocks = {}
        clearDeckNameCache()
        getBlocksBatchSizes.length = 0
        concurrencyPeak = 0
        getBlocksDelayMs = 5

        const blocks = Object.values(mockBlocks).filter((b) =>
          b.refs?.some((r) => r.type === 2 && String(r.alias).toLowerCase() === "card")
        )
        const result = await prefetchDeckNamesForBlocks(blocks, {
          batchSize: batchSize as number,
          concurrency: concurrency as number
        })

        expect(result.uniqueDeckIds).toBe(60)
        expect(result.getBlocksCalls).toBeGreaterThan(0)
        expect(result.fetchedFromBackend).toBe(60)
        expect(Math.max(0, ...getBlocksBatchSizes)).toBeLessThanOrEqual(DECK_PREFETCH_BATCH_SIZE)
        expect(result.concurrencyPeak).toBeLessThanOrEqual(DECK_PREFETCH_CONCURRENCY)
        expect(concurrencyPeak).toBeLessThanOrEqual(DECK_PREFETCH_CONCURRENCY)
      }
    )

    it("normalizeBoundedPositiveInt 单元边界", () => {
      expect(normalizeBoundedPositiveInt(Number.NaN, 50, 50)).toBe(50)
      expect(normalizeBoundedPositiveInt(Number.POSITIVE_INFINITY, 4, 4)).toBe(4)
      expect(normalizeBoundedPositiveInt(0, 50, 50)).toBe(50)
      expect(normalizeBoundedPositiveInt(-3, 50, 50)).toBe(50)
      expect(normalizeBoundedPositiveInt(3.9, 50, 50)).toBe(3)
      expect(normalizeBoundedPositiveInt(0.9, 50, 50)).toBe(50)
      expect(normalizeBoundedPositiveInt(999, 50, 50)).toBe(50)
      expect(normalizeBoundedPositiveInt(2, 50, 50)).toBe(2)
      expect(normalizeBoundedPositiveInt(undefined, 4, 4)).toBe(4)
    })

    it("runBoundedConcurrency 对非法 concurrency 不创建无界 runner", async () => {
      const seen: number[] = []
      let peak = 0
      let active = 0
      const items = Array.from({ length: 20 }, (_, i) => i)

      await runBoundedConcurrency(
        items,
        Number.NaN,
        async (item) => {
          active++
          peak = Math.max(peak, active)
          await new Promise((r) => setTimeout(r, 2))
          seen.push(item)
          active--
        },
        BLOCK_PREFETCH_CONCURRENCY
      )

      expect(seen.sort((a, b) => a - b)).toEqual(items)
      expect(peak).toBeLessThanOrEqual(BLOCK_PREFETCH_CONCURRENCY)

      seen.length = 0
      peak = 0
      await runBoundedConcurrency(items, 10000, async (item) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 2))
        seen.push(item)
        active--
      })
      expect(seen).toHaveLength(20)
      expect(peak).toBeLessThanOrEqual(BLOCK_PREFETCH_CONCURRENCY)
    })
  })

  it("preheat 后 ensure 路径不发 get-block；invalidate 后重新读取", async () => {
    const block = makeBlock({
      id: 42 as DbId,
      text: "x",
      properties: srsProps(new Date("2020-01-01"), 2, new Date("2019-01-01")),
      refs: [{ type: 2, alias: "card", data: [{ name: "type", value: "basic" }] } as any]
    })
    mockBlocks[42] = block
    clearBlockCache()
    preheatBlockCache([block])
    backendLog.length = 0

    const { ensureCardSrsState } = await import("./storage")
    const srs = await ensureCardSrsState(42 as DbId, new Date("2020-01-02"))
    expect(srs.reps).toBe(2)
    expect(backendLog.filter((c) => c.method === "get-block")).toHaveLength(0)

    // 模拟写入后失效
    mockBlocks[42] = {
      ...block,
      properties: srsProps(new Date("2021-01-01"), 9, new Date("2020-12-01"))
    }
    invalidateBlockCache(42 as DbId)
    backendLog.length = 0
    const srs2 = await ensureCardSrsState(42 as DbId, new Date("2020-01-02"))
    expect(srs2.reps).toBe(9)
    expect(backendLog.some((c) => c.method === "get-block")).toBe(true)
  })

  it("收集结束后牌组缓存被清理（无长期错误缓存）", async () => {
    seedBasicLibrary(10, { deckCount: 3 })
    mockOrca.state.blocks = {}
    const metricsOut: { current?: CollectReviewCardsMetrics } = {}
    await collectReviewCards("perf-test", { metricsOut })
    expect(metricsOut.current?.deckPrefetch?.uniqueDeckIds).toBe(3)
    expect(getDeckNameCacheSize()).toBe(0)
  })

  it("metrics 可注入且生产默认不要求 logMetrics", async () => {
    seedBasicLibrary(5)
    mockOrca.state.blocks = { ...mockBlocks }
    const metricsOut: { current?: CollectReviewCardsMetrics } = {}
    await collectReviewCards("perf-test", { metricsOut })
    expect(metricsOut.current).toBeDefined()
    expect(metricsOut.current!.inputBlocks).toBeGreaterThanOrEqual(5)
    expect(metricsOut.current!.outputCards).toBe(5)
    expect(metricsOut.current!.slowestStage).toBeTruthy()
    expect(metricsOut.current!.stageMs.processCardsMs).toBeGreaterThanOrEqual(0)
  })
})
