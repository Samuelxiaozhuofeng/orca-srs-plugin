/**
 * F2-06：复习会话当前卡块加载纯决策
 */
import { describe, expect, it } from "vitest"
import type { Block, DbId } from "../orca.d.ts"
import {
  decidePrefetchBlockOutcome,
  decidePrefetchWhenStateHit,
  decideRequiredBlocksOutcome,
  existenceResult,
  requiredBlocksForCard,
  shouldApplyBlockLoadResult
} from "./reviewSessionBlockLoad"

const parent = 100 as DbId
const item = 201 as DbId
const cardKeyBasic = "basic:100"
const cardKeyList = "list:100:201"

function fakeBlock(id: DbId): Block {
  return { id } as Block
}

describe("requiredBlocksForCard", () => {
  it("普通卡仅父块", () => {
    expect(requiredBlocksForCard({ id: parent })).toEqual([
      { blockId: parent, role: "parent" }
    ])
  })

  it("List 卡包含父块与条目块", () => {
    expect(requiredBlocksForCard({ id: parent, listItemId: item })).toEqual([
      { blockId: parent, role: "parent" },
      { blockId: item, role: "listItem" }
    ])
  })
})

describe("decideRequiredBlocksOutcome — 当前父块", () => {
  it("get-block throw => unknown：保留卡，不 drop，错误可重试语义", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyBasic, [
      existenceResult(parent, "unknown", { error: new Error("network") })
    ])
    expect(outcome.action).toBe("retain_unknown")
    if (outcome.action !== "retain_unknown") return
    expect(outcome.unknownBlockIds).toEqual([parent])
    expect(outcome.userMessage).toMatch(/重试/)
    expect(outcome.userMessage).toMatch(/100/)
    expect(outcome.userMessage).toMatch(cardKeyBasic)
    expect(outcome.diagnostic).toMatch(/network/)
    // 不得表现为 drop
    expect(outcome.action).not.toBe("drop_missing")
  })

  it("明确 null => missing：剔除一次", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyBasic, [
      existenceResult(parent, "missing")
    ])
    expect(outcome.action).toBe("drop_missing")
    if (outcome.action !== "drop_missing") return
    expect(outcome.missingBlockIds).toEqual([parent])
    expect(outcome.userMessage).toMatch(/不存在/)
    expect(outcome.diagnostic).toMatch(cardKeyBasic)
  })

  it("exists => ready", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyBasic, [
      existenceResult(parent, "exists", { block: fakeBlock(parent) })
    ])
    expect(outcome).toEqual({ action: "ready", cardKey: cardKeyBasic })
  })
})

describe("decideRequiredBlocksOutcome — List 父子", () => {
  it("父块 unknown 不剔除", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyList, [
      existenceResult(parent, "unknown", { error: new Error("parent fail") }),
      existenceResult(item, "exists", { block: fakeBlock(item) })
    ])
    expect(outcome.action).toBe("retain_unknown")
    if (outcome.action === "retain_unknown") {
      expect(outcome.unknownBlockIds).toContain(parent)
    }
  })

  it("子块 unknown 不剔除", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyList, [
      existenceResult(parent, "exists", { block: fakeBlock(parent) }),
      existenceResult(item, "unknown", { error: new Error("item fail") })
    ])
    expect(outcome.action).toBe("retain_unknown")
    if (outcome.action === "retain_unknown") {
      expect(outcome.unknownBlockIds).toContain(item)
    }
  })

  it("父块 missing 安全剔除", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyList, [
      existenceResult(parent, "missing"),
      existenceResult(item, "exists", { block: fakeBlock(item) })
    ])
    expect(outcome.action).toBe("drop_missing")
    if (outcome.action === "drop_missing") {
      expect(outcome.missingBlockIds).toContain(parent)
    }
  })

  it("子块 missing 安全剔除", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyList, [
      existenceResult(parent, "exists", { block: fakeBlock(parent) }),
      existenceResult(item, "missing")
    ])
    expect(outcome.action).toBe("drop_missing")
    if (outcome.action === "drop_missing") {
      expect(outcome.missingBlockIds).toContain(item)
    }
  })

  it("父 missing + 子 unknown：优先 retain_unknown，不得误删", () => {
    // 异步顺序下必须等全部结果；汇总时 unknown 优先于 missing
    const outcome = decideRequiredBlocksOutcome(cardKeyList, [
      existenceResult(parent, "missing"),
      existenceResult(item, "unknown", { error: new Error("item boom") })
    ])
    expect(outcome.action).toBe("retain_unknown")
  })

  it("父子均 exists => ready", () => {
    const outcome = decideRequiredBlocksOutcome(cardKeyList, [
      existenceResult(parent, "exists", { block: fakeBlock(parent) }),
      existenceResult(item, "exists", { block: fakeBlock(item) })
    ])
    expect(outcome.action).toBe("ready")
  })
})

describe("shouldApplyBlockLoadResult — 旧请求作废", () => {
  it("cancelled 后不应用", () => {
    expect(
      shouldApplyBlockLoadResult({
        cancelled: true,
        expectedCardKey: cardKeyBasic,
        currentCardKey: cardKeyBasic
      })
    ).toBe(false)
  })

  it("切卡后旧 cardKey 不应用", () => {
    expect(
      shouldApplyBlockLoadResult({
        cancelled: false,
        expectedCardKey: cardKeyBasic,
        currentCardKey: cardKeyList
      })
    ).toBe(false)
  })

  it("currentCardKey 为空不应用", () => {
    expect(
      shouldApplyBlockLoadResult({
        cancelled: false,
        expectedCardKey: cardKeyBasic,
        currentCardKey: null
      })
    ).toBe(false)
  })

  it("同卡且未取消可应用", () => {
    expect(
      shouldApplyBlockLoadResult({
        cancelled: false,
        expectedCardKey: cardKeyBasic,
        currentCardKey: cardKeyBasic
      })
    ).toBe(true)
  })
})

describe("decidePrefetchBlockOutcome — 下一张预缓存不改队列", () => {
  it("exists 写 cache（决策层）", () => {
    const block = fakeBlock(parent)
    const o = decidePrefetchBlockOutcome(
      existenceResult(parent, "exists", { block })
    )
    expect(o).toEqual({
      action: "write_cache",
      blockId: parent,
      block
    })
  })

  it("明确 null 只 log，无 drop / queue 语义", () => {
    const o = decidePrefetchBlockOutcome(existenceResult(parent, "missing"))
    expect(o.action).toBe("log_null")
    if (o.action === "log_null") {
      expect(o.diagnostic).toMatch(/prefetch|missing|blockId/)
    }
    // 决策联合类型不含 drop / auto-drop
    expect(o).not.toHaveProperty("cardKey")
  })

  it("throw 只 log_throw，不改变队列", () => {
    const err = new Error("prefetch fail")
    const o = decidePrefetchBlockOutcome(
      existenceResult(parent, "unknown", { error: err })
    )
    expect(o.action).toBe("log_throw")
    if (o.action === "log_throw") {
      expect(o.error).toBe(err)
      expect(o.diagnostic).toMatch(/prefetch fail/)
    }
  })

  it("state hit 跳过后端", () => {
    expect(decidePrefetchWhenStateHit(parent, true)).toEqual({
      action: "already_cached",
      blockId: parent
    })
    expect(decidePrefetchWhenStateHit(parent, false)).toBeNull()
  })
})

/**
 * 模拟「检查完全部 required 再决策」的 harness：
 * 证明中间某次 missing 不会在仍有未完成项时单独形成 drop。
 */
describe("harness: 必须全部 resolve 后再 decide", () => {
  it("顺序父 missing、子 unknown → 最终 retain", async () => {
    const steps: Array<"parent" | "item"> = []
    async function resolveAll() {
      const results = []
      steps.push("parent")
      results.push(existenceResult(parent, "missing"))
      // 不得在此处 decide
      steps.push("item")
      results.push(
        existenceResult(item, "unknown", { error: new Error("late") })
      )
      return decideRequiredBlocksOutcome(cardKeyList, results)
    }
    const outcome = await resolveAll()
    expect(steps).toEqual(["parent", "item"])
    expect(outcome.action).toBe("retain_unknown")
  })
})
