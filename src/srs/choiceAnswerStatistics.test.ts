/**
 * FC-08 / FC-14：选择题答题 entry 构造、正确性、保存回调、门闩集成
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DbId } from "../orca.d.ts"
import type { ChoiceStatisticsEntry } from "./types"
import {
  areChoiceAnswerSetsEqual,
  buildChoiceStatisticsEntry,
  CHOICE_STATISTICS_SAVE_FAILURE_MESSAGE,
  createChoiceAnswerHandler,
  extractCorrectBlockIds,
  recordChoiceAnswerStatistics,
  submitChoiceAnswerOnce,
  suggestChoiceGrade
} from "./choiceAnswerStatistics"
import {
  tryBeginMultiSubmit,
  tryBeginSingleSubmit,
  createChoiceSubmitGate
} from "./choiceSubmitGate"

const mockNotify = vi.fn()

// @ts-expect-error test global
globalThis.orca = {
  notify: mockNotify,
  invokeBackend: vi.fn(),
  commands: { invokeEditorCommand: vi.fn() }
}

beforeEach(() => {
  mockNotify.mockClear()
})

describe("areChoiceAnswerSetsEqual / buildChoiceStatisticsEntry", () => {
  it("集合完全相等为 true（顺序无关）", () => {
    expect(areChoiceAnswerSetsEqual([1, 2], [2, 1])).toBe(true)
    expect(
      buildChoiceStatisticsEntry([2, 1], [1, 2], 100).isCorrect
    ).toBe(true)
  })

  it("错选或漏选为 false", () => {
    expect(areChoiceAnswerSetsEqual([1, 3], [1, 2])).toBe(false)
    expect(areChoiceAnswerSetsEqual([1], [1, 2])).toBe(false)
    expect(areChoiceAnswerSetsEqual([1, 2], [1])).toBe(false)
  })

  it("无正确选项：isCorrect 始终 false，suggestChoiceGrade 为 null", () => {
    expect(areChoiceAnswerSetsEqual([], [])).toBe(false)
    expect(areChoiceAnswerSetsEqual([1], [])).toBe(false)
    const entryEmpty = buildChoiceStatisticsEntry([], [], 1)
    expect(entryEmpty.isCorrect).toBe(false)
    const entrySelectedNoCorrect = buildChoiceStatisticsEntry([1], [], 2)
    expect(entrySelectedNoCorrect.isCorrect).toBe(false)
    expect(suggestChoiceGrade([], [], "undefined")).toBeNull()
    expect(suggestChoiceGrade([1], [], "undefined")).toBeNull()
    expect(suggestChoiceGrade([], [], "single")).toBeNull()
    expect(suggestChoiceGrade([1], [], "multiple")).toBeNull()
  })
})

describe("extractCorrectBlockIds", () => {
  it("从选项提取正确 ID，乱序不影响", () => {
    const options = [
      { blockId: 10 as DbId, isCorrect: false },
      { blockId: 20 as DbId, isCorrect: true },
      { blockId: 30 as DbId, isCorrect: true }
    ]
    expect(extractCorrectBlockIds(options)).toEqual([20, 30])
    expect(extractCorrectBlockIds([...options].reverse())).toEqual([30, 20])
  })
})

describe("isCorrect 与自动评分一致", () => {
  it("单选正确 / 错误", () => {
    const correct = [5]
    const right = buildChoiceStatisticsEntry([5], correct, 1)
    const wrong = buildChoiceStatisticsEntry([6], correct, 2)
    expect(right.isCorrect).toBe(true)
    expect(suggestChoiceGrade([5], correct, "single")).toBe("good")
    expect(wrong.isCorrect).toBe(false)
    expect(suggestChoiceGrade([6], correct, "single")).toBe("again")
  })

  it("多选：完全正确 / 漏选 / 错选", () => {
    const correct = [1, 2]
    const full = buildChoiceStatisticsEntry([1, 2], correct, 1)
    const miss = buildChoiceStatisticsEntry([1], correct, 2)
    const wrongPick = buildChoiceStatisticsEntry([1, 3], correct, 3)

    expect(full.isCorrect).toBe(true)
    expect(suggestChoiceGrade([1, 2], correct, "multiple")).toBe("good")

    expect(miss.isCorrect).toBe(false)
    expect(suggestChoiceGrade([1], correct, "multiple")).toBe("hard")

    expect(wrongPick.isCorrect).toBe(false)
    expect(suggestChoiceGrade([1, 3], correct, "multiple")).toBe("again")
  })
})

describe("recordChoiceAnswerStatistics", () => {
  it("成功调用 save 且不 notify", async () => {
    const save = vi.fn(async () => {})
    const result = await recordChoiceAnswerStatistics({
      blockId: 1,
      selectedBlockIds: [1],
      correctBlockIds: [1],
      timestamp: 42,
      save
    })
    expect(result.ok).toBe(true)
    expect(result.entry).toEqual({
      timestamp: 42,
      selectedBlockIds: [1],
      correctBlockIds: [1],
      isCorrect: true
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it("save 失败 catch 后 warn notify，不抛出，评分路径不被阻断", async () => {
    const save = vi.fn(async () => {
      throw new Error("setProperties failed")
    })
    const logError = vi.fn()
    const logWarn = vi.fn()
    const notify = vi.fn()

    // 模拟「评分逻辑」在统计之后仍执行
    let graded = false
    const result = await recordChoiceAnswerStatistics({
      blockId: 7,
      selectedBlockIds: [1],
      correctBlockIds: [2],
      save,
      notify,
      logError,
      logWarn
    })
    graded = true

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(logError).toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      "warn",
      CHOICE_STATISTICS_SAVE_FAILURE_MESSAGE
    )
    expect(graded).toBe(true)
  })
})

describe("createChoiceAnswerHandler", () => {
  it("从 options 提取正确 ID 并调用 save", async () => {
    const save = vi.fn(async () => {})
    const handler = createChoiceAnswerHandler({
      blockId: 9,
      options: [
        { blockId: 1, isCorrect: false },
        { blockId: 2, isCorrect: true }
      ],
      save,
      now: () => 12345
    })
    handler([2])
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith(9, {
      timestamp: 12345,
      selectedBlockIds: [2],
      correctBlockIds: [2],
      isCorrect: true
    })
  })
})

describe("choiceSubmitGate + 统计只写一次", () => {
  it("单选快速重复 begin 只 accepted 一次 → onAnswer/save 一次", async () => {
    let state = createChoiceSubmitGate("choice:1")
    const save = vi.fn(async (_id: DbId, _e: ChoiceStatisticsEntry) => {})
    const onAnswer = vi.fn()
    const correct = [10]

    const first = tryBeginSingleSubmit(state, {
      cardKey: "choice:1",
      readOnly: false
    })
    state = first.state
    expect(first.token).not.toBeNull()

    const second = tryBeginSingleSubmit(state, {
      cardKey: "choice:1",
      readOnly: false
    })
    expect(second.token).toBeNull()

    // 仅第一次 accepted 路径提交
    await submitChoiceAnswerOnce({
      accepted: first.token != null,
      blockId: 1,
      selectedBlockIds: [10],
      correctBlockIds: correct,
      timestamp: 1,
      save,
      onAnswer
    })
    await submitChoiceAnswerOnce({
      accepted: second.token != null,
      blockId: 1,
      selectedBlockIds: [10],
      correctBlockIds: correct,
      timestamp: 2,
      save,
      onAnswer
    })

    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it("多选快速重复 Enter 只 accepted 一次 → save 一次", async () => {
    let state = createChoiceSubmitGate("choice:2")
    const save = vi.fn(async () => {})
    const onAnswer = vi.fn()

    const a = tryBeginMultiSubmit(state, {
      cardKey: "choice:2",
      readOnly: false
    })
    state = a.state
    const b = tryBeginMultiSubmit(state, {
      cardKey: "choice:2",
      readOnly: false
    })
    expect(a.accepted).toBe(true)
    expect(b.accepted).toBe(false)

    await submitChoiceAnswerOnce({
      accepted: a.accepted,
      blockId: 2,
      selectedBlockIds: [1, 2],
      correctBlockIds: [1, 2],
      save,
      onAnswer
    })
    await submitChoiceAnswerOnce({
      accepted: b.accepted,
      blockId: 2,
      selectedBlockIds: [1, 2],
      correctBlockIds: [1, 2],
      save,
      onAnswer
    })

    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it("readOnly 不 accepted → 不写统计", async () => {
    const state = createChoiceSubmitGate("choice:3")
    const save = vi.fn(async () => {})
    const begun = tryBeginMultiSubmit(state, {
      cardKey: "choice:3",
      readOnly: true
    })
    expect(begun.accepted).toBe(false)
    const result = await submitChoiceAnswerOnce({
      accepted: begun.accepted,
      blockId: 3,
      selectedBlockIds: [1],
      correctBlockIds: [1],
      save
    })
    expect(result.recorded).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})
