/**
 * 选择题：按 cardKey 冻结洗牌 + 乱序后作答判定仍按 blockId
 */
import { describe, expect, it, vi, afterEach } from "vitest"
import type { ChoiceOption } from "./types"
import {
  calculateAutoGrade,
  resolveFrozenShuffledOptions,
  shuffleOptions
} from "./choiceUtils"
import {
  createChoiceAnswerHandler,
  extractCorrectBlockIds,
  areChoiceAnswerSetsEqual
} from "./choiceAnswerStatistics"
import { buildCardKey } from "./cardIdentity"

function opt(
  blockId: number,
  text: string,
  isCorrect: boolean,
  isAnchor = false
): ChoiceOption {
  return {
    blockId,
    text,
    content: [{ t: "t", v: text }],
    isCorrect,
    isAnchor
  }
}

const RAW: ChoiceOption[] = [
  opt(101, "1", false),
  opt(102, "2", true),
  opt(103, "3", false),
  opt(104, "4", false)
]

describe("resolveFrozenShuffledOptions", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("同一 cardKey 多次调用顺序不变（不重新洗牌）", () => {
    const cardKey = buildCardKey({ blockId: 9, cardType: "choice" })
    // 强制第一次洗成非原序，便于断言冻结
    vi.spyOn(Math, "random").mockReturnValue(0) // 稳定但通常会移动元素

    const first = resolveFrozenShuffledOptions({
      cardKey,
      cache: null,
      rawOptions: RAW,
      ordered: false
    })
    const order1 = first.options.map(o => o.blockId)

    // 换随机源：若未冻结会得到不同顺序
    vi.spyOn(Math, "random").mockReturnValue(0.99)
    const second = resolveFrozenShuffledOptions({
      cardKey,
      cache: first.cache,
      rawOptions: RAW,
      ordered: false
    })
    expect(second.options.map(o => o.blockId)).toEqual(order1)
    expect(second.cache).toBe(first.cache)
  })

  it("换卡（cardKey 变化）后重新洗牌", () => {
    const keyA = buildCardKey({ blockId: 1, cardType: "choice" })
    const keyB = buildCardKey({ blockId: 2, cardType: "choice" })

    let call = 0
    vi.spyOn(Math, "random").mockImplementation(() => {
      call += 1
      // 交替种子，尽量让两次结果不同
      return call % 2 === 0 ? 0.1 : 0.9
    })

    const a = resolveFrozenShuffledOptions({
      cardKey: keyA,
      cache: null,
      rawOptions: RAW,
      ordered: false
    })
    const b = resolveFrozenShuffledOptions({
      cardKey: keyB,
      cache: a.cache,
      rawOptions: RAW,
      ordered: false
    })

    expect(a.cache.cardKey).toBe(keyA)
    expect(b.cache.cardKey).toBe(keyB)
    // 至少验证换 key 会写入新 cache（顺序可能碰巧相同，但 cache 对象必须更新）
    expect(b.cache).not.toBe(a.cache)
  })

  it("ordered 模式不洗牌，始终原序", () => {
    const cardKey = buildCardKey({ blockId: 3, cardType: "choice" })
    vi.spyOn(Math, "random").mockReturnValue(0.42)

    const first = resolveFrozenShuffledOptions({
      cardKey,
      cache: null,
      rawOptions: RAW,
      ordered: true
    })
    expect(first.options.map(o => o.blockId)).toEqual([101, 102, 103, 104])

    const second = resolveFrozenShuffledOptions({
      cardKey,
      cache: first.cache,
      rawOptions: RAW,
      ordered: true
    })
    expect(second.options.map(o => o.blockId)).toEqual([101, 102, 103, 104])
  })

  it("洗牌后作答判定仍按 blockId/isCorrect，与展示下标无关", () => {
    const cardKey = buildCardKey({ blockId: 4, cardType: "choice" })
    // 反复洗直到顺序与原序不同（或直接用 spy 固定一次非原序）
    let shuffled = RAW
    for (let i = 0; i < 20; i++) {
      shuffled = shuffleOptions(RAW, false).options
      if (shuffled.map(o => o.blockId).join() !== RAW.map(o => o.blockId).join()) {
        break
      }
    }

    const frozen = resolveFrozenShuffledOptions({
      cardKey,
      cache: { cardKey, options: shuffled },
      rawOptions: RAW,
      ordered: false
    })
    expect(frozen.options.map(o => o.blockId)).toEqual(shuffled.map(o => o.blockId))

    // 正确项 blockId=102，无论出现在展示的第几位
    const correctIds = extractCorrectBlockIds(RAW)
    expect(correctIds).toEqual([102])
    expect(calculateAutoGrade([102], correctIds, "single")).toBe("good")
    expect(calculateAutoGrade([101], correctIds, "single")).toBe("again")
    expect(areChoiceAnswerSetsEqual([102], correctIds)).toBe(true)

    // createChoiceAnswerHandler 也吃 rawOptions，与展示顺序无关
    const save = vi.fn(
      async (_blockId: number, _entry: { isCorrect: boolean; correctBlockIds: number[] }) =>
        undefined
    )
    const handler = createChoiceAnswerHandler({
      blockId: 4,
      options: RAW,
      save,
      now: () => 1000
    })
    handler([102])
    expect(save).toHaveBeenCalled()
    const entry = save.mock.calls[0]?.[1]
    expect(entry).toBeDefined()
    expect(entry!.isCorrect).toBe(true)
    expect(entry!.correctBlockIds).toEqual([102])
  })
})
