/**
 * FC-08 / FC-14：选择题统计存储
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../orca.d.ts"
import type { ChoiceStatisticsEntry } from "./types"

const blockStore = new Map<DbId, Block>()

const mockOrca = {
  invokeBackend: vi.fn(async (method: string, blockId: DbId) => {
    if (method !== "get-block") {
      throw new Error(`unexpected backend method: ${method}`)
    }
    return blockStore.get(blockId)
  }),
  commands: {
    invokeEditorCommand: vi.fn(
      async (
        command: string,
        _panel: null,
        blockIds: DbId[],
        payload: unknown
      ) => {
        if (command === "core.editor.setProperties") {
          const props = payload as Array<{ name: string; value: string; type: number }>
          for (const id of blockIds) {
            const block = blockStore.get(id)
            if (!block) {
              throw new Error(`setProperties: block ${id} missing`)
            }
            const nextProps = [...(block.properties ?? [])]
            for (const p of props) {
              const idx = nextProps.findIndex(x => x.name === p.name)
              if (idx >= 0) nextProps[idx] = { ...nextProps[idx], ...p }
              else nextProps.push({ name: p.name, value: p.value, type: p.type })
            }
            blockStore.set(id, { ...block, properties: nextProps })
          }
          return undefined
        }
        if (command === "core.editor.deleteProperties") {
          const names = payload as string[]
          for (const id of blockIds) {
            const block = blockStore.get(id)
            if (!block?.properties) continue
            blockStore.set(id, {
              ...block,
              properties: block.properties.filter(p => !names.includes(p.name))
            })
          }
          return undefined
        }
        throw new Error(`unexpected command: ${command}`)
      }
    )
  },
  notify: vi.fn()
}

// @ts-expect-error test global
globalThis.orca = mockOrca

import {
  MAX_CHOICE_STATISTICS_ENTRIES,
  CHOICE_STATISTICS_PROPERTY_NAME,
  CHOICE_STATISTICS_STORAGE_VERSION,
  appendChoiceStatisticsEntries,
  calculateOptionFrequency,
  clearChoiceStatistics,
  deserializeStatistics,
  loadChoiceStatistics,
  resetChoiceStatisticsSaveChainsForTests,
  saveChoiceStatistics,
  serializeStatistics
} from "./choiceStatisticsStorage"

function makeBlock(
  id: DbId,
  properties?: Block["properties"]
): Block {
  return {
    id,
    properties: properties ?? [],
    content: [],
    text: "",
    created: 0,
    modified: 0,
    children: [],
    aliases: [],
    parent: null,
    left: null
  } as unknown as Block
}

function entry(
  partial: Partial<ChoiceStatisticsEntry> & {
    selectedBlockIds: DbId[]
    correctBlockIds: DbId[]
  }
): ChoiceStatisticsEntry {
  return {
    timestamp: partial.timestamp ?? Date.now(),
    selectedBlockIds: partial.selectedBlockIds,
    correctBlockIds: partial.correctBlockIds,
    isCorrect: partial.isCorrect ?? false
  }
}

beforeEach(() => {
  blockStore.clear()
  resetChoiceStatisticsSaveChainsForTests()
  mockOrca.invokeBackend.mockClear()
  mockOrca.commands.invokeEditorCommand.mockClear()
  mockOrca.notify.mockClear()
  mockOrca.invokeBackend.mockImplementation(async (method: string, blockId: DbId) => {
    if (method !== "get-block") throw new Error(`unexpected: ${method}`)
    return blockStore.get(blockId)
  })
  mockOrca.commands.invokeEditorCommand.mockImplementation(
    async (command: string, _panel: null, blockIds: DbId[], payload: unknown) => {
      if (command === "core.editor.setProperties") {
        const props = payload as Array<{ name: string; value: string; type: number }>
        for (const id of blockIds) {
          const block = blockStore.get(id)
          if (!block) throw new Error(`setProperties: block ${id} missing`)
          const nextProps = [...(block.properties ?? [])]
          for (const p of props) {
            const idx = nextProps.findIndex(x => x.name === p.name)
            if (idx >= 0) nextProps[idx] = { ...nextProps[idx], ...p }
            else nextProps.push({ name: p.name, value: p.value, type: p.type })
          }
          blockStore.set(id, { ...block, properties: nextProps })
        }
        return undefined
      }
      if (command === "core.editor.deleteProperties") {
        const names = payload as string[]
        for (const id of blockIds) {
          const block = blockStore.get(id)
          if (!block?.properties) continue
          blockStore.set(id, {
            ...block,
            properties: block.properties.filter(p => !names.includes(p.name))
          })
        }
        return undefined
      }
      throw new Error(`unexpected command: ${command}`)
    }
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("serialize / deserialize", () => {
  it("合法数据往返保留全部字段", () => {
    const storage = {
      version: CHOICE_STATISTICS_STORAGE_VERSION,
      entries: [
        entry({
          timestamp: 1000,
          selectedBlockIds: [1, 2],
          correctBlockIds: [1],
          isCorrect: false
        }),
        entry({
          timestamp: 2000,
          selectedBlockIds: [3],
          correctBlockIds: [3],
          isCorrect: true
        })
      ]
    }
    const round = deserializeStatistics(serializeStatistics(storage))
    expect(round).toEqual(storage)
  })

  it("损坏 JSON 抛出", () => {
    expect(() => deserializeStatistics("{not json")).toThrow(/JSON parse failed/)
  })

  it("错误结构抛出（非对象 / 缺 version / entries 非数组）", () => {
    expect(() => deserializeStatistics("null")).toThrow(/not an object/)
    expect(() => deserializeStatistics("[]")).toThrow(/not an object/)
    expect(() => deserializeStatistics(JSON.stringify({ entries: [] }))).toThrow(
      /version/
    )
    expect(() =>
      deserializeStatistics(JSON.stringify({ version: 1, entries: "nope" }))
    ).toThrow(/entries must be an array/)
  })

  it("version 缺失、非整数、不支持版本抛出清晰错误", () => {
    expect(() =>
      deserializeStatistics(JSON.stringify({ entries: [] }))
    ).toThrow(/version/)

    expect(() =>
      deserializeStatistics(JSON.stringify({ version: 1.5, entries: [] }))
    ).toThrow(/integer/)

    expect(() =>
      deserializeStatistics(JSON.stringify({ version: NaN, entries: [] }))
    ).toThrow(/integer|version/)

    expect(() =>
      deserializeStatistics(JSON.stringify({ version: 2, entries: [] }))
    ).toThrow(/unsupported version 2/)

    expect(() =>
      deserializeStatistics(JSON.stringify({ version: 99, entries: [] }))
    ).toThrow(/unsupported version 99/)

    expect(() =>
      deserializeStatistics(
        JSON.stringify({ version: "1", entries: [] })
      )
    ).toThrow(/version/)
  })

  it("错误 ID 数组 / 字段类型抛出，不静默默认化", () => {
    expect(() =>
      deserializeStatistics(
        JSON.stringify({
          version: 1,
          entries: [
            {
              timestamp: 1,
              selectedBlockIds: ["x"],
              correctBlockIds: [1],
              isCorrect: true
            }
          ]
        })
      )
    ).toThrow(/selectedBlockIds/)

    expect(() =>
      deserializeStatistics(
        JSON.stringify({
          version: 1,
          entries: [
            {
              timestamp: "bad",
              selectedBlockIds: [1],
              correctBlockIds: [1],
              isCorrect: true
            }
          ]
        })
      )
    ).toThrow(/timestamp/)

    expect(() =>
      deserializeStatistics(
        JSON.stringify({
          version: 1,
          entries: [
            {
              timestamp: 1,
              selectedBlockIds: [1],
              correctBlockIds: [1]
              // missing isCorrect
            }
          ]
        })
      )
    ).toThrow(/isCorrect/)
  })
})

describe("appendChoiceStatisticsEntries", () => {
  it("超过 200 只留最近 200，顺序正确", () => {
    expect(MAX_CHOICE_STATISTICS_ENTRIES).toBe(200)
    const existing: ChoiceStatisticsEntry[] = []
    for (let i = 0; i < 200; i++) {
      existing.push(
        entry({
          timestamp: i,
          selectedBlockIds: [i],
          correctBlockIds: [i],
          isCorrect: true
        })
      )
    }
    const next = appendChoiceStatisticsEntries(
      existing,
      entry({
        timestamp: 9999,
        selectedBlockIds: [999],
        correctBlockIds: [999],
        isCorrect: true
      })
    )
    expect(next).toHaveLength(200)
    expect(next[0].timestamp).toBe(1)
    expect(next[next.length - 1].timestamp).toBe(9999)
    expect(next[next.length - 1].selectedBlockIds).toEqual([999])
  })
})

describe("loadChoiceStatistics", () => {
  it("属性缺失返回 []", async () => {
    blockStore.set(10, makeBlock(10, [{ name: "other", value: "x", type: 1 }]))
    await expect(loadChoiceStatistics(10)).resolves.toEqual([])
  })

  it("属性空值返回 []", async () => {
    blockStore.set(
      11,
      makeBlock(11, [{ name: CHOICE_STATISTICS_PROPERTY_NAME, value: "", type: 1 }])
    )
    await expect(loadChoiceStatistics(11)).resolves.toEqual([])
  })

  it("无 properties 字段返回 []", async () => {
    const b = makeBlock(12)
    // @ts-expect-error simulate missing properties
    delete b.properties
    blockStore.set(12, b)
    await expect(loadChoiceStatistics(12)).resolves.toEqual([])
  })

  it("get-block throw 向上抛，不返回 []", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockOrca.invokeBackend.mockRejectedValueOnce(new Error("backend down"))
    await expect(loadChoiceStatistics(99)).rejects.toThrow("backend down")
    expect(warn).toHaveBeenCalled()
  })

  it("block undefined 向上抛，不返回 []", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    // not in store → undefined
    await expect(loadChoiceStatistics(404)).rejects.toThrow(/not found/)
    expect(warn).toHaveBeenCalled()
  })

  it("解析损坏向上抛，不返回 []", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    blockStore.set(
      13,
      makeBlock(13, [
        {
          name: CHOICE_STATISTICS_PROPERTY_NAME,
          value: "{broken",
          type: 1
        }
      ])
    )
    await expect(loadChoiceStatistics(13)).rejects.toThrow(/JSON parse failed/)
    expect(warn).toHaveBeenCalled()
  })
})

describe("saveChoiceStatistics", () => {
  it("追加保存并可再 load", async () => {
    blockStore.set(20, makeBlock(20))
    const e1 = entry({
      timestamp: 1,
      selectedBlockIds: [1],
      correctBlockIds: [1],
      isCorrect: true
    })
    await saveChoiceStatistics(20, e1)
    const loaded = await loadChoiceStatistics(20)
    expect(loaded).toEqual([e1])
  })

  it("同 blockId 并发 save 最终保留两条", async () => {
    blockStore.set(21, makeBlock(21))

    // 人为让 setProperties 异步交错：验证串行后两条都在
    let releaseFirstSet: () => void
    const firstSetGate = new Promise<void>(r => {
      releaseFirstSet = r
    })
    let setCount = 0
    const original = mockOrca.commands.invokeEditorCommand.getMockImplementation()!
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (...args) => {
      const command = args[0] as string
      if (command === "core.editor.setProperties") {
        setCount++
        if (setCount === 1) {
          await firstSetGate
        }
      }
      return original(...args)
    })

    const e1 = entry({
      timestamp: 1,
      selectedBlockIds: [1],
      correctBlockIds: [1],
      isCorrect: true
    })
    const e2 = entry({
      timestamp: 2,
      selectedBlockIds: [2],
      correctBlockIds: [1],
      isCorrect: false
    })

    const p1 = saveChoiceStatistics(21, e1)
    const p2 = saveChoiceStatistics(21, e2)
    // 让第一个 set 完成，第二个才能在串行链上 load 到 e1
    releaseFirstSet!()
    await Promise.all([p1, p2])

    const loaded = await loadChoiceStatistics(21)
    expect(loaded).toHaveLength(2)
    expect(loaded.map(e => e.timestamp)).toEqual([1, 2])
  })

  it("不同 block 不互相阻塞", async () => {
    blockStore.set(31, makeBlock(31))
    blockStore.set(32, makeBlock(32))

    let block31SetStarted = false
    let block32SetDone = false
    let release31: () => void
    const gate31 = new Promise<void>(r => {
      release31 = r
    })

    const original = mockOrca.commands.invokeEditorCommand.getMockImplementation()!
    mockOrca.commands.invokeEditorCommand.mockImplementation(async (...args) => {
      const command = args[0] as string
      const blockIds = args[2] as DbId[]
      if (command === "core.editor.setProperties" && blockIds[0] === 31) {
        block31SetStarted = true
        await gate31
      }
      const result = await original(...args)
      if (command === "core.editor.setProperties" && blockIds[0] === 32) {
        block32SetDone = true
      }
      return result
    })

    const p31 = saveChoiceStatistics(
      31,
      entry({
        timestamp: 1,
        selectedBlockIds: [1],
        correctBlockIds: [1],
        isCorrect: true
      })
    )
    // 等 31 进入 set 阻塞
    await vi.waitFor(() => expect(block31SetStarted).toBe(true))

    const p32 = saveChoiceStatistics(
      32,
      entry({
        timestamp: 2,
        selectedBlockIds: [2],
        correctBlockIds: [2],
        isCorrect: true
      })
    )
    // 32 应在 31 仍阻塞时完成
    await p32
    expect(block32SetDone).toBe(true)

    release31!()
    await p31

    expect(await loadChoiceStatistics(31)).toHaveLength(1)
    expect(await loadChoiceStatistics(32)).toHaveLength(1)
  })

  it("setProperties 返回 Error 向调用者抛出", async () => {
    blockStore.set(22, makeBlock(22))
    mockOrca.commands.invokeEditorCommand.mockImplementationOnce(async () => {
      return new Error("setProperties failed") as unknown as undefined
    })
    await expect(
      saveChoiceStatistics(
        22,
        entry({
          timestamp: 1,
          selectedBlockIds: [1],
          correctBlockIds: [1],
          isCorrect: true
        })
      )
    ).rejects.toThrow("setProperties failed")
  })

  it("setProperties reject 向调用者抛出；链可恢复后续 save", async () => {
    blockStore.set(23, makeBlock(23))
    mockOrca.commands.invokeEditorCommand
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(async (...args) => {
        // restore default after first reject — re-install happy path
        const command = args[0] as string
        const blockIds = args[2] as DbId[]
        const payload = args[3]
        if (command === "core.editor.setProperties") {
          const props = payload as Array<{ name: string; value: string; type: number }>
          for (const id of blockIds) {
            const block = blockStore.get(id)!
            const nextProps = [...(block.properties ?? [])]
            for (const p of props) {
              const idx = nextProps.findIndex(x => x.name === p.name)
              if (idx >= 0) nextProps[idx] = { ...nextProps[idx], ...p }
              else nextProps.push({ name: p.name, value: p.value, type: p.type })
            }
            blockStore.set(id, { ...block, properties: nextProps })
          }
        }
        return undefined
      })

    await expect(
      saveChoiceStatistics(
        23,
        entry({
          timestamp: 1,
          selectedBlockIds: [1],
          correctBlockIds: [1],
          isCorrect: true
        })
      )
    ).rejects.toThrow("network")

    await saveChoiceStatistics(
      23,
      entry({
        timestamp: 2,
        selectedBlockIds: [2],
        correctBlockIds: [2],
        isCorrect: true
      })
    )
    const loaded = await loadChoiceStatistics(23)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].timestamp).toBe(2)
  })

  it("超过上限裁剪后只保留最近 200", async () => {
    blockStore.set(24, makeBlock(24))
    for (let i = 0; i < 205; i++) {
      await saveChoiceStatistics(
        24,
        entry({
          timestamp: i,
          selectedBlockIds: [i],
          correctBlockIds: [i],
          isCorrect: true
        })
      )
    }
    const loaded = await loadChoiceStatistics(24)
    expect(loaded).toHaveLength(200)
    expect(loaded[0].timestamp).toBe(5)
    expect(loaded[199].timestamp).toBe(204)
  })
})

describe("calculateOptionFrequency（删除选项过滤）", () => {
  it("旧记录含已删除选项时不报错且过滤掉", () => {
    const entries = [
      entry({
        timestamp: 1,
        selectedBlockIds: [1, 99], // 99 已删除
        correctBlockIds: [1],
        isCorrect: false
      }),
      entry({
        timestamp: 2,
        selectedBlockIds: [2],
        correctBlockIds: [1],
        isCorrect: false
      })
    ]
    const freq = calculateOptionFrequency(entries, [1, 2])
    expect(freq.size).toBe(2)
    expect(freq.get(1)).toEqual({ total: 1, incorrect: 0 })
    expect(freq.get(2)).toEqual({ total: 1, incorrect: 1 })
    expect(freq.has(99)).toBe(false)
  })
})

describe("clearChoiceStatistics", () => {
  it("删除属性", async () => {
    blockStore.set(
      40,
      makeBlock(40, [
        {
          name: CHOICE_STATISTICS_PROPERTY_NAME,
          value: serializeStatistics({
            version: 1,
            entries: [
              entry({
                timestamp: 1,
                selectedBlockIds: [1],
                correctBlockIds: [1],
                isCorrect: true
              })
            ]
          }),
          type: 1
        }
      ])
    )
    await clearChoiceStatistics(40)
    await expect(loadChoiceStatistics(40)).resolves.toEqual([])
  })
})
