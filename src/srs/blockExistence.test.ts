/**
 * F2-06：块存在性三态 resolver（含 timeout / 身份校验）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block, DbId } from "../orca.d.ts"
import {
  BlockExistenceCache,
  DEFAULT_GET_BLOCK_TIMEOUT_MS,
  formatBlockExistenceError,
  isCardBlockExists,
  resolveBlockExistence,
  resolveGetBlockTimeoutMs,
  validateBackendBlockIdentity,
  writeBlockToOrcaState
} from "./blockExistence"

const mockBlocks: Record<number, Block | undefined> = {}

const mockOrca = {
  state: {
    blocks: mockBlocks as Record<number, Block | undefined>
  },
  invokeBackend: vi.fn()
}

/** 可控 deferred：永不 settle 直到测试显式 resolve/reject */
function deferred<T = unknown>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // 防止测试结束后 unhandled rejection（late reject 路径）
  promise.catch(() => {})
  return { promise, resolve, reject }
}

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
  Object.keys(mockBlocks).forEach(k => delete mockBlocks[Number(k)])
  mockOrca.invokeBackend.mockReset()
  mockOrca.invokeBackend.mockImplementation(async (name: string, blockId: unknown) => {
    if (name === "get-block") {
      const id = Number(blockId)
      // 未放入 mockBlocks → 明确 missing（null）
      if (!(id in mockBlocks)) return null
      return mockBlocks[id] ?? null
    }
    throw new Error(`unexpected backend: ${name}`)
  })
  ;(globalThis as typeof globalThis & { orca: unknown }).orca = mockOrca
})

afterEach(() => {
  // 释放任何悬挂的 short timers（timeout 测试）
  vi.useRealTimers()
})

function makeBlock(partial: { id: number; text?: string }): Block {
  return {
    id: partial.id as DbId,
    text: partial.text ?? "",
    properties: [],
    children: [],
    refs: [],
    aliases: [],
    backRefs: [],
    created: 0,
    modified: 0
  } as unknown as Block
}

describe("resolveGetBlockTimeoutMs", () => {
  it("默认与无效值回退 DEFAULT", () => {
    expect(resolveGetBlockTimeoutMs()).toBe(DEFAULT_GET_BLOCK_TIMEOUT_MS)
    expect(resolveGetBlockTimeoutMs(0)).toBe(DEFAULT_GET_BLOCK_TIMEOUT_MS)
    expect(resolveGetBlockTimeoutMs(-1)).toBe(DEFAULT_GET_BLOCK_TIMEOUT_MS)
    expect(resolveGetBlockTimeoutMs(Number.NaN)).toBe(DEFAULT_GET_BLOCK_TIMEOUT_MS)
    expect(resolveGetBlockTimeoutMs(25.9)).toBe(25)
  })
})

describe("validateBackendBlockIdentity", () => {
  it("有效同 id Block => ok", () => {
    const b = makeBlock({ id: 7 })
    const r = validateBackendBlockIdentity(b, 7 as DbId)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.block.id).toBe(7)
  })

  it("false/string/array/空对象/wrong id => 失败", () => {
    expect(validateBackendBlockIdentity(false, 1 as DbId).ok).toBe(false)
    expect(validateBackendBlockIdentity("x", 1 as DbId).ok).toBe(false)
    expect(validateBackendBlockIdentity([], 1 as DbId).ok).toBe(false)
    expect(validateBackendBlockIdentity({}, 1 as DbId).ok).toBe(false)
    expect(validateBackendBlockIdentity({ id: 999 }, 1 as DbId).ok).toBe(false)
  })
})

describe("resolveBlockExistence", () => {
  it("state 命中为 exists，不发后端", async () => {
    mockBlocks[10] = makeBlock({ id: 10, text: "hit" })
    const r = await resolveBlockExistence(10)
    expect(r.status).toBe("exists")
    expect(r.block?.id).toBe(10)
    expect(r.blockId).toBe(10)
    expect(mockOrca.invokeBackend).not.toHaveBeenCalled()
  })

  it("后端明确 null 为 missing", async () => {
    const r = await resolveBlockExistence(999)
    expect(r.status).toBe("missing")
    expect(r.blockId).toBe(999)
    expect(mockOrca.invokeBackend).toHaveBeenCalledWith("get-block", 999)
  })

  it("后端明确 undefined 为 missing", async () => {
    mockOrca.invokeBackend.mockResolvedValueOnce(undefined)
    const r = await resolveBlockExistence(8)
    expect(r.status).toBe("missing")
  })

  it("后端 throw 为 unknown，保留原始 error", async () => {
    const boom = new Error("network down")
    mockOrca.invokeBackend.mockRejectedValueOnce(boom)
    const r = await resolveBlockExistence(50)
    expect(r.status).toBe("unknown")
    expect(r.error).toBe(boom)
    expect(r.blockId).toBe(50)
  })

  it("writeToState：exists 时写入 orca.state.blocks", async () => {
    const block = makeBlock({ id: 42, text: "from backend" })
    mockOrca.invokeBackend.mockResolvedValueOnce(block)
    const r = await resolveBlockExistence(42, { writeToState: true })
    expect(r.status).toBe("exists")
    expect(mockBlocks[42]).toBe(block)
  })

  it("writeToState：missing 不写 state", async () => {
    await resolveBlockExistence(77, { writeToState: true })
    expect(mockBlocks[77]).toBeUndefined()
  })

  it("兼容旧签名 resolveBlockExistence(id, cache)", async () => {
    const cache = new BlockExistenceCache()
    mockBlocks[3] = makeBlock({ id: 3 })
    const r = await resolveBlockExistence(3 as DbId, cache)
    expect(r.status).toBe("exists")
  })

  it("有效同 id Block => exists", async () => {
    const block = makeBlock({ id: 11, text: "ok" })
    mockOrca.invokeBackend.mockResolvedValueOnce(block)
    const r = await resolveBlockExistence(11)
    expect(r.status).toBe("exists")
    expect(r.block).toBe(block)
  })
})

describe("resolveBlockExistence — 不可判定返回值 => unknown 且不写 state", () => {
  const cases: Array<{ label: string; value: unknown }> = [
    { label: "false", value: false },
    { label: "string", value: "not-a-block" },
    { label: "array", value: [{ id: 1 }] },
    { label: "empty object", value: {} },
    { label: "wrong id", value: { id: 999, text: "other" } }
  ]

  for (const c of cases) {
    it(`${c.label} => unknown，不写 state`, async () => {
      mockOrca.invokeBackend.mockResolvedValueOnce(c.value)
      const r = await resolveBlockExistence(5 as DbId, { writeToState: true })
      expect(r.status).toBe("unknown")
      expect(r.error).toBeInstanceOf(Error)
      expect(String((r.error as Error).message)).toMatch(/blockId=5|non-block|id mismatch|finite number id/)
      expect(mockBlocks[5]).toBeUndefined()
    })
  }
})

describe("resolveBlockExistence — timeout", () => {
  it("永不 settle => timeout unknown（非 missing），含 blockId 与 timeout", async () => {
    const d = deferred()
    mockOrca.invokeBackend.mockReturnValueOnce(d.promise)
    const r = await resolveBlockExistence(88 as DbId, {
      timeoutMs: 25,
      writeToState: true
    })
    expect(r.status).toBe("unknown")
    expect(r.status).not.toBe("missing")
    const msg = r.error instanceof Error ? r.error.message : String(r.error)
    expect(msg).toMatch(/timeout/i)
    expect(msg).toMatch(/blockId=88/)
    expect(msg).toMatch(/25ms/)
    expect(mockBlocks[88]).toBeUndefined()
  })

  it("timeout 后 late resolve 不写 state / 不改已返回结论", async () => {
    const d = deferred<Block>()
    mockOrca.invokeBackend.mockReturnValueOnce(d.promise)
    const r = await resolveBlockExistence(66 as DbId, {
      timeoutMs: 20,
      writeToState: true
    })
    expect(r.status).toBe("unknown")

    d.resolve(makeBlock({ id: 66, text: "late" }))
    await flushMicrotasks()
    await flushMicrotasks()

    expect(mockBlocks[66]).toBeUndefined()
    // 再次读取（无 cache）会再请求；此处只断言晚到未写 state
  })

  it("timeout 后 late resolve 不污染 cache", async () => {
    const cache = new BlockExistenceCache()
    const d = deferred<Block>()
    mockOrca.invokeBackend.mockReturnValueOnce(d.promise)
    const r = await resolveBlockExistence(55 as DbId, {
      cache,
      timeoutMs: 20,
      writeToState: true
    })
    expect(r.status).toBe("unknown")
    expect(cache.peek(55 as DbId)?.status).toBe("unknown")

    d.resolve(makeBlock({ id: 55, text: "late-cache" }))
    await flushMicrotasks()
    await flushMicrotasks()

    expect(cache.peek(55 as DbId)?.status).toBe("unknown")
    expect(mockBlocks[55]).toBeUndefined()
  })

  it("重试 timeout 后可成功（bypassCache）", async () => {
    const cache = new BlockExistenceCache()
    const d = deferred<Block>()
    mockOrca.invokeBackend.mockReturnValueOnce(d.promise)
    const first = await resolveBlockExistence(21 as DbId, {
      cache,
      timeoutMs: 20
    })
    expect(first.status).toBe("unknown")

    const okBlock = makeBlock({ id: 21, text: "retry-ok" })
    mockOrca.invokeBackend.mockResolvedValueOnce(okBlock)
    const second = await resolveBlockExistence(21 as DbId, {
      cache,
      bypassCache: true,
      timeoutMs: 50,
      writeToState: true
    })
    expect(second.status).toBe("exists")
    expect(second.block).toBe(okBlock)
    expect(mockBlocks[21]).toBe(okBlock)

    // 清理悬挂 deferred，避免噪音
    d.resolve(makeBlock({ id: 21 }))
  })
})

describe("BlockExistenceCache", () => {
  it("同一 cache 不重复调用后端", async () => {
    const cache = new BlockExistenceCache()
    await cache.resolve(7)
    await cache.resolve(7)
    expect(mockOrca.invokeBackend).toHaveBeenCalledTimes(1)
  })

  it("bypassCache 可对 unknown 真实重试", async () => {
    const cache = new BlockExistenceCache()
    mockOrca.invokeBackend.mockRejectedValueOnce(new Error("temp"))
    const u1 = await cache.resolve(9)
    expect(u1.status).toBe("unknown")

    mockBlocks[9] = makeBlock({ id: 9 })
    // 不 bypass 仍用缓存 unknown
    const stillUnknown = await cache.resolve(9)
    expect(stillUnknown.status).toBe("unknown")
    expect(mockOrca.invokeBackend).toHaveBeenCalledTimes(1)

    const ok = await cache.resolve(9, { bypassCache: true })
    expect(ok.status).toBe("exists")
  })
})

describe("isCardBlockExists", () => {
  it("exists=true, missing=false, unknown 抛错", async () => {
    mockBlocks[1] = makeBlock({ id: 1 })
    await expect(isCardBlockExists(1)).resolves.toBe(true)
    await expect(isCardBlockExists(404)).resolves.toBe(false)
    mockOrca.invokeBackend.mockRejectedValueOnce(new Error("boom"))
    await expect(isCardBlockExists(2)).rejects.toThrow(/无法确认块是否存在/)
  })
})

describe("writeBlockToOrcaState / formatBlockExistenceError", () => {
  it("writeBlockToOrcaState 写入 blocks", () => {
    const b = makeBlock({ id: 55, text: "w" })
    writeBlockToOrcaState(b)
    expect(mockBlocks[55]).toBe(b)
  })

  it("format 含 blockId / cardKey / 原始消息", () => {
    const msg = formatBlockExistenceError(
      { blockId: 1 as DbId, status: "unknown", error: new Error("timeout") },
      { cardKey: "basic:1", role: "parent" }
    )
    expect(msg).toMatch(/blockId=1/)
    expect(msg).toMatch(/cardKey=basic:1/)
    expect(msg).toMatch(/timeout/)
  })
})
