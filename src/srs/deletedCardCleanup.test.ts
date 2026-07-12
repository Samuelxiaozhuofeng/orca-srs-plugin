/**
 * FC-04：已删除卡片日志清理（List / 结构化身份 / legacy / unknown 保留）
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../orca.d.ts"
import type { ReviewLogEntry, ReviewLogStorage } from "./types"

const mockBlocks: Record<DbId, Block> = {}
const mockStorage: Record<string, string> = {}
const mockDataKeys: string[] = []

const mockOrca = {
  state: {
    blocks: mockBlocks as Record<DbId, Block>
  },
  invokeBackend: vi.fn(),
  plugins: {
    getData: vi.fn(async (_pluginName: string, key: string) => {
      return mockStorage[key] ?? null
    }),
    setData: vi.fn(async (_pluginName: string, key: string, value: string) => {
      mockStorage[key] = value
      if (!mockDataKeys.includes(key)) mockDataKeys.push(key)
    }),
    getDataKeys: vi.fn(async () => [...mockDataKeys]),
    removeData: vi.fn(async (_pluginName: string, key: string) => {
      delete mockStorage[key]
      const idx = mockDataKeys.indexOf(key)
      if (idx >= 0) mockDataKeys.splice(idx, 1)
    })
  }
}

// @ts-expect-error test global
globalThis.orca = mockOrca

import {
  cleanupDeletedCards,
  evaluateReviewLogRetention,
  isCardBlockExists,
  isLegacyCleanupLog,
  BlockExistenceCache,
  resolveBlockExistence
} from "./deletedCardCleanup"
import {
  clearLogCache,
  getAllReviewLogs,
  flushReviewLogs
} from "./reviewLogStorage"

const PLUGIN = "test-plugin-fc04"
const STORAGE_KEY = "reviewLogs_2026_07"

function makeBlock(partial: Partial<Block> & { id: DbId }): Block {
  return {
    id: partial.id,
    created: partial.created ?? new Date(),
    modified: partial.modified ?? new Date(),
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

function cardRef(type: string) {
  return {
    type: 2 as const,
    id: 1 as DbId,
    blockId: 1 as DbId,
    alias: "card",
    data: [{ name: "type", value: type, type: 1 }]
  }
}

function choiceRef() {
  return {
    type: 2 as const,
    id: 2 as DbId,
    blockId: 2 as DbId,
    alias: "choice",
    data: []
  }
}

function baseLog(overrides: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return {
    id: "log-1",
    cardId: 100,
    deckName: "Deck",
    timestamp: new Date("2026-07-01T12:00:00Z").getTime(),
    grade: "good",
    duration: 1000,
    previousInterval: 1,
    newInterval: 3,
    previousState: "review",
    newState: "review",
    ...overrides
  }
}

function structuredListLog(
  parentId: DbId,
  itemId: DbId,
  overrides: Partial<ReviewLogEntry> = {}
): ReviewLogEntry {
  return baseLog({
    id: `list-${parentId}-${itemId}`,
    cardId: itemId,
    blockId: parentId,
    cardType: "list",
    cardKey: `list:${parentId}:item:${itemId}`,
    listItemId: itemId,
    legacy: false,
    ...overrides
  })
}

function putShard(logs: ReviewLogEntry[], version = 2) {
  const storage: ReviewLogStorage = { version, logs }
  mockStorage[STORAGE_KEY] = JSON.stringify(storage)
  if (!mockDataKeys.includes(STORAGE_KEY)) mockDataKeys.push(STORAGE_KEY)
}

function readShardLogs(): ReviewLogEntry[] {
  const raw = mockStorage[STORAGE_KEY]
  if (!raw) return []
  return (JSON.parse(raw) as ReviewLogStorage).logs || []
}

function seedStateBlocks() {
  // 默认 invokeBackend: get-block 从 mockBlocks 读；null 当 missing
  mockOrca.invokeBackend.mockImplementation(async (name: string, blockId: unknown) => {
    if (name === "get-block") {
      const id = blockId as DbId
      if (id in mockBlocks) return mockBlocks[id]
      return null
    }
    return null
  })
}

beforeEach(() => {
  Object.keys(mockBlocks).forEach(k => delete mockBlocks[k as unknown as DbId])
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  mockDataKeys.length = 0
  clearLogCache()
  vi.clearAllMocks()
  seedStateBlocks()
})

describe("resolveBlockExistence / isCardBlockExists", () => {
  it("state 命中为 exists", async () => {
    mockBlocks[10] = makeBlock({ id: 10, text: "hit" })
    const r = await resolveBlockExistence(10)
    expect(r.status).toBe("exists")
    expect(r.block?.id).toBe(10)
    expect(mockOrca.invokeBackend).not.toHaveBeenCalled()
  })

  it("后端 null 为 missing", async () => {
    const r = await resolveBlockExistence(999)
    expect(r.status).toBe("missing")
  })

  it("后端抛错为 unknown", async () => {
    mockOrca.invokeBackend.mockRejectedValueOnce(new Error("network down"))
    const r = await resolveBlockExistence(50)
    expect(r.status).toBe("unknown")
  })

  it("isCardBlockExists：exists=true, missing=false, unknown 抛错", async () => {
    mockBlocks[1] = makeBlock({ id: 1 })
    await expect(isCardBlockExists(1)).resolves.toBe(true)
    await expect(isCardBlockExists(404)).resolves.toBe(false)
    mockOrca.invokeBackend.mockRejectedValueOnce(new Error("boom"))
    await expect(isCardBlockExists(2)).rejects.toThrow(/无法确认块是否存在/)
  })

  it("同一 cache 不重复调用后端", async () => {
    const cache = new BlockExistenceCache()
    await cache.resolve(7)
    await cache.resolve(7)
    expect(mockOrca.invokeBackend).toHaveBeenCalledTimes(1)
  })
})

describe("FC-04 List 结构化日志清理", () => {
  it("父和子都存在且 child 属于 children → cleanedCount=0", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId
    mockBlocks[parentId] = makeBlock({
      id: parentId,
      children: [itemId, 202 as DbId],
      refs: [cardRef("list")] as any,
      text: "list parent"
    })
    mockBlocks[itemId] = makeBlock({ id: itemId, text: "item1", parent: parentId })

    putShard([structuredListLog(parentId, itemId)])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.retainedUnknownCount).toBe(0)
    expect(report.errors).toEqual([])
    expect(readShardLogs()).toHaveLength(1)
  })

  it("List 子条目 missing → 删除对应日志", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId
    mockBlocks[parentId] = makeBlock({
      id: parentId,
      children: [itemId],
      refs: [cardRef("list")] as any
    })
    // itemId 不在 mockBlocks → get-block 返回 null → missing

    putShard([structuredListLog(parentId, itemId)])
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    expect(readShardLogs()).toHaveLength(0)
    // 分片已空应 removeData
    expect(mockStorage[STORAGE_KEY]).toBeUndefined()
  })

  it("List 子条目存在但已不属于父 children → 删除", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId
    const other = 202 as DbId
    mockBlocks[parentId] = makeBlock({
      id: parentId,
      children: [other], // itemId 已移出
      refs: [cardRef("list")] as any
    })
    mockBlocks[itemId] = makeBlock({ id: itemId, text: "orphan" })

    putShard([structuredListLog(parentId, itemId)])
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    expect(readShardLogs()).toHaveLength(0)
  })

  it("List 父卡 missing → 删除相关日志", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId
    // 父不存在；子即使存在也不应保留
    mockBlocks[itemId] = makeBlock({ id: itemId })

    putShard([structuredListLog(parentId, itemId)])
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    expect(readShardLogs()).toHaveLength(0)
  })

  it("父 get-block 抛错 → 日志保留，retainedUnknownCount/errors 可见", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId

    mockOrca.invokeBackend.mockImplementation(async (name: string, blockId: unknown) => {
      if (name === "get-block" && blockId === parentId) {
        throw new Error("parent read failed")
      }
      return null
    })

    putShard([structuredListLog(parentId, itemId)])
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.retainedUnknownCount).toBe(1)
    expect(report.errors.length).toBeGreaterThan(0)
    expect(report.errors.some(e => e.includes("unknown") || e.includes("parent"))).toBe(true)
    expect(readShardLogs()).toHaveLength(1)
  })

  it("子 get-block 抛错 → 日志保留，retainedUnknownCount/errors 可见", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId
    mockBlocks[parentId] = makeBlock({
      id: parentId,
      children: [itemId],
      refs: [cardRef("list")] as any
    })

    mockOrca.invokeBackend.mockImplementation(async (name: string, blockId: unknown) => {
      if (name === "get-block") {
        if (blockId === parentId) return mockBlocks[parentId]
        if (blockId === itemId) throw new Error("child read failed")
        return null
      }
      return null
    })
    // 确保 parent 不在 state，走后端（避免 state 短路跳过 mock 对 parent 的控制）
    delete mockBlocks[parentId]
    // re-seed parent only via backend return above — put parent back for return value
    const parentBlock = makeBlock({
      id: parentId,
      children: [itemId],
      refs: [cardRef("list")] as any
    })
    mockOrca.invokeBackend.mockImplementation(async (name: string, blockId: unknown) => {
      if (name === "get-block") {
        if (blockId === parentId) return parentBlock
        if (blockId === itemId) throw new Error("child read failed")
        return null
      }
      return null
    })

    putShard([structuredListLog(parentId, itemId)])
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.retainedUnknownCount).toBe(1)
    expect(report.errors.some(e => e.includes(String(itemId)) || e.includes("child"))).toBe(true)
    expect(readShardLogs()).toHaveLength(1)
  })
})

describe("FC-04 legacy 日志", () => {
  it("legacy 只有 cardId：存在保留", async () => {
    mockBlocks[42] = makeBlock({ id: 42, text: "still here" })
    putShard(
      [
        baseLog({
          id: "legacy-keep",
          cardId: 42,
          legacy: true
        })
      ],
      1
    )
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(readShardLogs()).toHaveLength(1)
  })

  it("legacy 只有 cardId：missing 删除", async () => {
    putShard(
      [
        baseLog({
          id: "legacy-del",
          cardId: 404,
          legacy: true
        })
      ],
      1
    )
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    expect(readShardLogs()).toHaveLength(0)
  })

  it("legacy 只有 cardId：读取抛错保留", async () => {
    mockOrca.invokeBackend.mockRejectedValue(new Error("io error"))
    putShard(
      [
        baseLog({
          id: "legacy-unk",
          cardId: 55,
          legacy: true
        })
      ],
      1
    )
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.retainedUnknownCount).toBe(1)
    expect(report.errors.length).toBeGreaterThan(0)
    expect(readShardLogs()).toHaveLength(1)
  })

  it("legacy 不以缺少 #card 标签为由删除", async () => {
    // 存在但无 card 标签的普通块
    mockBlocks[77] = makeBlock({ id: 77, text: "plain block", refs: [] })
    putShard([baseLog({ id: "legacy-plain", cardId: 77 })], 1)
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(readShardLogs()).toHaveLength(1)
  })
})

describe("FC-04 Basic/Choice/Cloze/Direction 规则", () => {
  it("Basic 与 Choice 类型不串：Choice 日志在 basic 块上删除，basic 保留", async () => {
    mockBlocks[100] = makeBlock({
      id: 100,
      refs: [cardRef("basic")] as any,
      text: "basic only"
    })
    const basicLog = baseLog({
      id: "basic-ok",
      cardId: 100,
      blockId: 100,
      cardType: "basic",
      cardKey: "basic:100",
      legacy: false
    })
    const choiceLog = baseLog({
      id: "choice-wrong",
      cardId: 100,
      blockId: 100,
      cardType: "choice",
      cardKey: "choice:100",
      legacy: false
    })
    putShard([basicLog, choiceLog])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    const remaining = readShardLogs()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].cardKey).toBe("basic:100")
  })

  it("Choice 类型匹配则保留", async () => {
    mockBlocks[200] = makeBlock({
      id: 200,
      refs: [choiceRef()] as any,
      text: "choice card"
    })
    putShard([
      baseLog({
        id: "choice-ok",
        cardId: 200,
        blockId: 200,
        cardType: "choice",
        cardKey: "choice:200",
        legacy: false
      })
    ])
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(readShardLogs()).toHaveLength(1)
  })

  it("Cloze：删除 c1 后只清理 c1 日志，c2 保留", async () => {
    const pluginName = PLUGIN
    mockBlocks[300] = makeBlock({
      id: 300,
      refs: [cardRef("cloze")] as any,
      content: [
        { t: "t", v: "before " },
        // 仅剩 c2
        { t: `${pluginName}.cloze`, v: "ans2", clozeNumber: 2 } as any
      ]
    })
    putShard([
      baseLog({
        id: "c1",
        cardId: 300,
        blockId: 300,
        cardType: "cloze",
        cardKey: "cloze:300:c1",
        clozeNumber: 1,
        legacy: false
      }),
      baseLog({
        id: "c2",
        cardId: 300,
        blockId: 300,
        cardType: "cloze",
        cardKey: "cloze:300:c2",
        clozeNumber: 2,
        legacy: false
      })
    ])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    const remaining = readShardLogs()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].cardKey).toBe("cloze:300:c2")
  })

  it("Direction：forward/backward 按当前方向集合判断", async () => {
    // 当前仅为 forward（非 bidirectional）
    mockBlocks[400] = makeBlock({
      id: 400,
      refs: [cardRef("direction")] as any,
      content: [
        { t: "t", v: "left " },
        { t: `${PLUGIN}.direction`, v: "→", direction: "forward" } as any,
        { t: "t", v: " right" }
      ]
    })
    putShard([
      baseLog({
        id: "dir-f",
        cardId: 400,
        blockId: 400,
        cardType: "direction",
        cardKey: "direction:400:forward",
        directionType: "forward",
        legacy: false
      }),
      baseLog({
        id: "dir-b",
        cardId: 400,
        blockId: 400,
        cardType: "direction",
        cardKey: "direction:400:backward",
        directionType: "backward",
        legacy: false
      })
    ])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    const remaining = readShardLogs()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].cardKey).toBe("direction:400:forward")
  })

  it("Direction bidirectional 时 forward 与 backward 均保留", async () => {
    mockBlocks[401] = makeBlock({
      id: 401,
      refs: [cardRef("direction")] as any,
      content: [
        { t: "t", v: "a " },
        { t: `${PLUGIN}.direction`, v: "↔", direction: "bidirectional" } as any,
        { t: "t", v: " b" }
      ]
    })
    putShard([
      baseLog({
        id: "df",
        cardId: 401,
        blockId: 401,
        cardType: "direction",
        cardKey: "direction:401:forward",
        directionType: "forward",
        legacy: false
      }),
      baseLog({
        id: "db",
        cardId: 401,
        blockId: 401,
        cardType: "direction",
        cardKey: "direction:401:backward",
        directionType: "backward",
        legacy: false
      })
    ])
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(readShardLogs()).toHaveLength(2)
  })
})

describe("FC-04 缓存失效与存储错误", () => {
  it("清理写入后 reviewLogStorage 缓存被失效，后续读取不会返回旧日志", async () => {
    const parentId = 100 as DbId
    const deadItem = 201 as DbId
    const liveItem = 202 as DbId

    mockBlocks[parentId] = makeBlock({
      id: parentId,
      children: [liveItem], // deadItem 已不在列表
      refs: [cardRef("list")] as any
    })
    mockBlocks[liveItem] = makeBlock({ id: liveItem })

    const deadLog = structuredListLog(parentId, deadItem)
    const liveLog = structuredListLog(parentId, liveItem, {
      id: "live",
      timestamp: new Date("2026-07-02T12:00:00Z").getTime()
    })
    putShard([deadLog, liveLog])

    // 预热 reviewLogStorage 缓存（加载旧数据）
    await flushReviewLogs(PLUGIN)
    const before = await getAllReviewLogs(PLUGIN)
    expect(before).toHaveLength(2)

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)

    // 清理后再次读取：不得返回已删除日志（缓存已 clearLogCache）
    const after = await getAllReviewLogs(PLUGIN)
    expect(after).toHaveLength(1)
    expect(after[0].listItemId).toBe(liveItem)
  })

  it("存储分片 JSON 损坏时错误可见且不假装清理成功", async () => {
    mockStorage[STORAGE_KEY] = "{not-valid-json"
    mockDataKeys.push(STORAGE_KEY)

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.errors.length).toBeGreaterThan(0)
    expect(report.errors.some(e => e.includes(STORAGE_KEY))).toBe(true)
    // 损坏数据未被覆盖删除
    expect(mockStorage[STORAGE_KEY]).toBe("{not-valid-json")
  })

  it("setData 写入失败时 errors 可见且 cleanedCount 不增加", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId
    mockBlocks[parentId] = makeBlock({
      id: parentId,
      children: [],
      refs: [cardRef("list")] as any
    })
    putShard([
      structuredListLog(parentId, itemId),
      // 再留一条 keep，触发 setData 而非 removeData
      baseLog({
        id: "keep-basic",
        cardId: 900,
        blockId: 900,
        cardType: "basic",
        cardKey: "basic:900",
        legacy: false
      })
    ])
    mockBlocks[900] = makeBlock({
      id: 900,
      refs: [cardRef("basic")] as any
    })

    mockOrca.plugins.setData.mockRejectedValueOnce(new Error("disk full"))

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.errors.some(e => e.includes(STORAGE_KEY) && e.includes("写入"))).toBe(true)
    // 原数据仍在（写入失败未改成功）
    expect(readShardLogs()).toHaveLength(2)
  })

  it("getDataKeys 失败时中止并报告错误", async () => {
    mockOrca.plugins.getDataKeys.mockRejectedValueOnce(new Error("keys unavailable"))
    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.errors.some(e => e.includes("getDataKeys"))).toBe(true)
  })
})

describe("evaluateReviewLogRetention 结构化无效字段", () => {
  it("list 缺 listItemId 且父块存在 → unknown 保留", async () => {
    const cache = new BlockExistenceCache()
    mockBlocks[100] = makeBlock({
      id: 100,
      refs: [cardRef("list")] as any,
      children: [201]
    })
    const log = baseLog({
      id: "bad-list",
      cardId: 100,
      blockId: 100,
      cardType: "list",
      cardKey: "list:100:item:201",
      // 故意缺少 listItemId
      legacy: false
    })
    const result = await evaluateReviewLogRetention(log, PLUGIN, cache)
    expect(result.decision).toBe("unknown")
  })

  it("list 缺 listItemId 且父块 missing → delete", async () => {
    const cache = new BlockExistenceCache()
    const log = baseLog({
      id: "bad-list-missing-parent",
      cardId: 100,
      blockId: 100,
      cardType: "list",
      cardKey: "list:100:item:201",
      legacy: false
    })
    const result = await evaluateReviewLogRetention(log, PLUGIN, cache)
    expect(result.decision).toBe("delete")
  })
})

describe("FC-04 部分结构化不得误判为 legacy", () => {
  it("isLegacyCleanupLog：有结构化痕迹时不为 legacy", () => {
    expect(
      isLegacyCleanupLog({
        cardId: 201,
        blockId: 100,
        cardType: "list",
        listItemId: 201,
        legacy: false
      } as any)
    ).toBe(false)

    expect(
      isLegacyCleanupLog({
        cardId: 100,
        blockId: 100
      } as any)
    ).toBe(false)

    expect(isLegacyCleanupLog({ cardId: 404 } as any)).toBe(true)
    expect(isLegacyCleanupLog({ cardId: 1, legacy: true } as any)).toBe(true)
  })

  it("List 有 blockId/cardType/listItemId/legacy=false 但缺 cardKey，父存在 item missing → unknown 保留（不得按 legacy 删）", async () => {
    const parentId = 100 as DbId
    const itemId = 201 as DbId
    mockBlocks[parentId] = makeBlock({
      id: parentId,
      children: [itemId],
      refs: [cardRef("list")] as any
    })
    // itemId 不在 mockBlocks → missing；若误判 legacy 会因 cardId=itemId missing 而删除

    const partialLog = baseLog({
      id: "partial-list-no-key",
      cardId: itemId, // List 兼容：cardId = listItemId
      blockId: parentId,
      cardType: "list",
      listItemId: itemId,
      legacy: false
      // 故意不写 cardKey
    })
    putShard([partialLog])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.retainedUnknownCount).toBe(1)
    expect(report.errors.length).toBeGreaterThan(0)
    expect(report.errors.some(e => e.includes("partial-list-no-key") || e.includes("cardKey") || e.includes("结构化"))).toBe(
      true
    )
    // 分片未改写：日志仍在
    expect(readShardLogs()).toHaveLength(1)
    expect(readShardLogs()[0].id).toBe("partial-list-no-key")
  })

  it("结构化日志缺 cardType，父可确认存在 → unknown 保留（集成）", async () => {
    mockBlocks[500] = makeBlock({
      id: 500,
      refs: [cardRef("basic")] as any,
      text: "still basic"
    })
    const partial = baseLog({
      id: "partial-no-type",
      cardId: 500,
      blockId: 500,
      cardKey: "basic:500",
      legacy: false
      // 故意缺 cardType
    })
    putShard([partial])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.retainedUnknownCount).toBe(1)
    expect(report.errors.some(e => e.includes("partial-no-type") || e.includes("结构化"))).toBe(true)
    expect(readShardLogs()).toHaveLength(1)
    expect(readShardLogs()[0].id).toBe("partial-no-type")
  })

  it("结构化日志缺 blockId，父无法明确 missing → unknown 保留（集成）", async () => {
    // cardId 指向不存在块；若走 legacy 会 delete；缺 blockId 但有 cardType 必须 unknown
    const partial = baseLog({
      id: "partial-no-blockId",
      cardId: 404,
      cardType: "basic",
      cardKey: "basic:404",
      legacy: false
      // 故意缺 blockId
    })
    putShard([partial])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(0)
    expect(report.retainedUnknownCount).toBe(1)
    expect(report.errors.length).toBeGreaterThan(0)
    expect(readShardLogs()).toHaveLength(1)
    expect(readShardLogs()[0].id).toBe("partial-no-blockId")
  })

  it("完全无结构化字段的 v1 日志仍按 legacy missing 删除（集成）", async () => {
    putShard(
      [
        baseLog({
          id: "pure-v1-gone",
          cardId: 99901
          // 无 blockId/cardType/cardKey/legacy/变体字段
        })
      ],
      1
    )

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    expect(report.retainedUnknownCount).toBe(0)
    expect(readShardLogs()).toHaveLength(0)
  })

  it("部分结构化 + 父块明确 missing → 允许 delete（集成）", async () => {
    // 父 888 missing；有结构化痕迹但字段不完整
    putShard([
      baseLog({
        id: "partial-parent-missing",
        cardId: 888,
        blockId: 888,
        cardType: "list",
        listItemId: 201,
        legacy: false
        // 缺 cardKey
      })
    ])

    const report = await cleanupDeletedCards(PLUGIN)
    expect(report.cleanedCount).toBe(1)
    expect(readShardLogs()).toHaveLength(0)
  })
})
