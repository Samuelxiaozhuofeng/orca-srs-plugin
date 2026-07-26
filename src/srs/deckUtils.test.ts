/**
 * 低危#21：calculateDeckStats / calculateHomeStats 真实实现回归测试
 *
 * 背景：flashHomeDataLoader.test.ts 用 vi.mock 把这两个统计函数整体替换成桩，
 * 真实实现此前全仓库无任何断言。本文件不 mock 被测函数，只固定时间
 * （vi.useFakeTimers + vi.setSystemTime）并 stub 全局 orca（本组函数实际不触碰 orca，
 * stub 仅为与仓库测试约定一致的防御措施）。
 *
 * 分类口径（deckUtils.ts:456-473 / 524-541，锁定现状）：
 * - isNew 卡只计 newCount，无论 due 是否已过期；
 * - 非新卡：dueTime <= nowTime 视为"已到期"（精确时刻），
 *   其中 due 落在 [今天00:00, 明天00:00) 计今日到期，否则计积压；
 * - dueTime > nowTime（含"今天稍后"）一律 futureCount / 不计入首页统计；
 * - 卡型（basic/cloze/direction/choice/list…）不参与分类，每个 ReviewCard 记 1 张。
 *
 * 暂停（suspend）卡说明：暂停在收集上游（reviewCardFactory.ts:100-101）即被过滤，
 * 不会生成 ReviewCard，因此本层的契约是"对传入的每张卡都计数、不做任何过滤"。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewCard } from "./types"
import { calculateDeckStats, calculateHomeStats } from "./deckUtils"

// 固定本地时间：2026-07-15 12:00:00.000（用本地分量构造，避免时区依赖；
// 7 月中旬无主流时区 DST 切换日）
const FIXED_NOW = new Date(2026, 6, 15, 12, 0, 0, 0)

/** 本地时间构造快捷方式 */
function at(
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  return new Date(2026, 6, day, hour, minute, second, ms)
}

function srs(overrides: Partial<ReviewCard["srs"]> = {}): ReviewCard["srs"] {
  return {
    stability: 1,
    difficulty: 5,
    interval: 1,
    due: at(15, 8),
    lastReviewed: at(14, 8),
    reps: 1,
    lapses: 0,
    ...overrides
  }
}

type CardSeed = Omit<Partial<ReviewCard>, "srs"> & {
  id: number
  due?: Date
  srs?: Partial<ReviewCard["srs"]>
}

function card(partial: CardSeed): ReviewCard {
  const { due, srs: srsOverride, ...rest } = partial
  return {
    front: "Q",
    back: "A",
    isNew: false,
    deck: "Default",
    cardType: "basic",
    ...rest,
    srs: srs({ ...(due != null ? { due } : {}), ...srsOverride })
  }
}

function newCard(partial: CardSeed): ReviewCard {
  return card({
    ...partial,
    isNew: true,
    srs: { lastReviewed: null, reps: 0, ...partial.srs }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  // 被测函数为纯函数、不触碰 orca；stub 仅防御 import 链上的意外访问
  vi.stubGlobal("orca", {
    state: { blocks: {} },
    invokeBackend: vi.fn(async () => {
      throw new Error("deckUtils 统计测试不应触发后端调用")
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("calculateDeckStats", () => {
  it("空输入返回空统计", () => {
    const stats = calculateDeckStats([])
    expect(stats).toEqual({
      decks: [],
      totalCards: 0,
      totalNew: 0,
      totalOverdue: 0
    })
  })

  it("按到期边界分类：积压 / 今日 / 未来（含今天稍后）", () => {
    const cards: ReviewCard[] = [
      // 昨天 23:59:59.999 → 积压（哪怕只早于今天零点 1ms）
      card({ id: 1, due: at(14, 23, 59, 59, 999) }),
      // 前天 → 积压
      card({ id: 2, due: at(13, 8) }),
      // 今天 00:00:00.000（自然日下界，含）→ 今日到期
      card({ id: 3, due: at(15, 0, 0, 0, 0) }),
      // 恰好等于 now（dueTime <= nowTime 含等号）→ 今日到期
      card({ id: 4, due: new Date(FIXED_NOW.getTime()) }),
      // now + 1ms（今天稍后到期）→ futureCount，不计今日到期（锁定现状：
      // deckUtils.ts:465 用精确时刻判定"已到期"，未到点的今天卡归入未来）
      card({ id: 5, due: new Date(FIXED_NOW.getTime() + 1) }),
      // 明天 00:00:00.000 → 未来
      card({ id: 6, due: at(16, 0, 0, 0, 0) })
    ]

    const stats = calculateDeckStats(cards)

    expect(stats.decks).toHaveLength(1)
    expect(stats.decks[0]).toEqual({
      name: "Default",
      totalCount: 6,
      newCount: 0,
      overdueCount: 2,
      todayCount: 2,
      futureCount: 2
    })
    expect(stats.totalCards).toBe(6)
    expect(stats.totalNew).toBe(0)
    // 锁定现状（deckUtils.ts:490-493）：totalOverdue = 所有"已到期"非新卡
    // （dueTime <= nowTime），即 积压(2) + 今日到期(2) = 4。
    // 命名与 per-deck overdueCount（仅积压）语义不一致，属现状锁定，非期望语义。
    expect(stats.totalOverdue).toBe(4)
  })

  it("新卡只计 newCount：即使 due 已过期也不进入 积压/今日/未来 与 totalOverdue", () => {
    const cards: ReviewCard[] = [
      newCard({ id: 1, due: at(10, 8) }), // 过期 due 的新卡
      newCard({ id: 2, due: at(20, 8) }), // 未来 due 的新卡
      card({ id: 3, due: at(13, 8) }) // 对照：普通积压卡
    ]

    const stats = calculateDeckStats(cards)

    expect(stats.decks[0]).toEqual({
      name: "Default",
      totalCount: 3,
      newCount: 2,
      overdueCount: 1,
      todayCount: 0,
      futureCount: 0
    })
    expect(stats.totalNew).toBe(2)
    expect(stats.totalOverdue).toBe(1)
  })

  it("卡型不参与分类：cloze 各编号、direction 各方向均按独立 ReviewCard 计数", () => {
    const overdueDue = at(13, 8)
    const cards: ReviewCard[] = [
      card({ id: 1, cardType: "basic", due: overdueDue }),
      // 同一块的两个 cloze 编号 → 两张卡
      card({ id: 2, cardType: "cloze", clozeNumber: 1, due: overdueDue }),
      card({ id: 2, cardType: "cloze", clozeNumber: 2, due: at(15, 0) }),
      // 同一块的正反两个方向 → 两张卡
      card({
        id: 3,
        cardType: "direction",
        directionType: "forward",
        due: overdueDue
      }),
      card({
        id: 3,
        cardType: "direction",
        directionType: "backward",
        due: at(16, 0)
      }),
      card({ id: 4, cardType: "choice", due: at(15, 0) }),
      newCard({ id: 5, cardType: "list", listItemId: 51, listItemIndex: 1 })
    ]

    const stats = calculateDeckStats(cards)

    expect(stats.decks[0]).toEqual({
      name: "Default",
      totalCount: 7,
      newCount: 1,
      overdueCount: 3,
      todayCount: 2,
      futureCount: 1
    })
    expect(stats.totalCards).toBe(7)
  })

  it("多牌组独立计数，Default 置顶，其余按 localeCompare 排序", () => {
    const cards: ReviewCard[] = [
      card({ id: 1, deck: "Beta", due: at(13, 8) }),
      card({ id: 2, deck: "alpha", due: at(15, 0) }),
      newCard({ id: 3, deck: "alpha" }),
      card({ id: 4, deck: "Default", due: at(20, 8) })
    ]

    const stats = calculateDeckStats(cards)

    // localeCompare：基字母 a < b，故 "alpha" 排在 "Beta" 前
    // （码点序会把 "Beta" 排前，此断言锁定 locale 感知排序）
    expect(stats.decks.map((d) => d.name)).toEqual([
      "Default",
      "alpha",
      "Beta"
    ])
    expect(stats.decks.find((d) => d.name === "alpha")).toEqual({
      name: "alpha",
      totalCount: 2,
      newCount: 1,
      overdueCount: 0,
      todayCount: 1,
      futureCount: 0
    })
    expect(stats.decks.find((d) => d.name === "Beta")).toEqual({
      name: "Beta",
      totalCount: 1,
      newCount: 0,
      overdueCount: 1,
      todayCount: 0,
      futureCount: 0
    })
    expect(stats.decks.find((d) => d.name === "Default")).toEqual({
      name: "Default",
      totalCount: 1,
      newCount: 0,
      overdueCount: 0,
      todayCount: 0,
      futureCount: 1
    })
  })

  it("无 Default 牌组时按 localeCompare 纯排序", () => {
    const cards: ReviewCard[] = [
      card({ id: 1, deck: "语文", due: at(13, 8) }),
      card({ id: 2, deck: "Math", due: at(13, 8) }),
      card({ id: 3, deck: "english", due: at(13, 8) })
    ]
    const names = calculateDeckStats(cards).decks.map((d) => d.name)
    expect(names).toEqual(["english", "Math", "语文"])
  })

  it("午夜刚过：昨晚到期的卡立即从今日变为积压（自然日边界）", () => {
    // now = 2026-07-15 00:30，昨天 23:59 到期的卡仅过期 31 分钟
    vi.setSystemTime(at(15, 0, 30))
    const cards: ReviewCard[] = [
      card({ id: 1, due: at(14, 23, 59) }), // 昨晚 → 积压
      card({ id: 2, due: at(15, 0, 10) }), // 今天 00:10（已过）→ 今日
      card({ id: 3, due: at(15, 8) }) // 今天 08:00（未到点）→ 未来
    ]

    const stats = calculateDeckStats(cards)

    expect(stats.decks[0]).toEqual({
      name: "Default",
      totalCount: 3,
      newCount: 0,
      overdueCount: 1,
      todayCount: 1,
      futureCount: 1
    })
  })

  it("isAuxiliaryPreview 卡照常计入统计（锁定现状）", () => {
    // 注意：types.ts:103 注释称辅助预览卡"不计入统计"，但过滤发生在会话层
    // （pendingDueRequeue.ts:152 等），本函数不做过滤。生产收集路径
    // collectReviewCards 不产生此类卡，故无现实展示偏差；此断言仅锁定
    // "本层对输入不做任何过滤" 的现状。
    const cards: ReviewCard[] = [
      card({ id: 1, cardType: "list", isAuxiliaryPreview: true, due: at(13, 8) })
    ]
    const stats = calculateDeckStats(cards)
    expect(stats.totalCards).toBe(1)
    expect(stats.decks[0].overdueCount).toBe(1)
  })
})

describe("calculateHomeStats", () => {
  it("空输入返回全 0", () => {
    expect(calculateHomeStats([])).toEqual({
      todayCount: 0,
      newCount: 0,
      pendingCount: 0,
      totalCount: 0
    })
  })

  it("到期边界组合：pending 含积压与今日，today 仅今日，未来卡只计 totalCount", () => {
    const cards: ReviewCard[] = [
      // 积压：计 pending，不计 today
      card({ id: 1, due: at(14, 23, 59, 59, 999) }),
      // 今天 00:00（含下界）：pending + today
      card({ id: 2, due: at(15, 0, 0, 0, 0) }),
      // 恰好 now：pending + today
      card({ id: 3, due: new Date(FIXED_NOW.getTime()) }),
      // now + 1ms（今天稍后）：不计 pending/today（锁定现状：
      // deckUtils.ts:531 精确时刻判定，"今天 18:00 到期"在 18:00 前不算今日到期）
      card({ id: 4, due: new Date(FIXED_NOW.getTime() + 1) }),
      // 明天零点：不计
      card({ id: 5, due: at(16, 0, 0, 0, 0) }),
      // 新卡（due 已过期也只计 newCount）
      newCard({ id: 6, due: at(10, 8) })
    ]

    expect(calculateHomeStats(cards)).toEqual({
      todayCount: 2,
      newCount: 1,
      pendingCount: 3,
      totalCount: 6
    })
  })

  it("午夜刚过：昨晚到期卡计入 pending 但不计入 today（差值即积压）", () => {
    vi.setSystemTime(at(15, 0, 30))
    const cards: ReviewCard[] = [
      card({ id: 1, due: at(14, 23, 59) }), // 昨晚 → pending only
      card({ id: 2, due: at(15, 0, 10) }) // 今天已过 → pending + today
    ]

    expect(calculateHomeStats(cards)).toEqual({
      todayCount: 1,
      newCount: 0,
      pendingCount: 2,
      totalCount: 2
    })
  })

  it("卡型不参与分类：cloze/direction 每张 ReviewCard 独立计数", () => {
    const cards: ReviewCard[] = [
      card({ id: 1, cardType: "cloze", clozeNumber: 1, due: at(13, 8) }),
      card({ id: 1, cardType: "cloze", clozeNumber: 2, due: at(15, 0) }),
      card({
        id: 2,
        cardType: "direction",
        directionType: "forward",
        due: at(15, 0)
      }),
      card({
        id: 2,
        cardType: "direction",
        directionType: "backward",
        due: at(16, 0)
      })
    ]

    expect(calculateHomeStats(cards)).toEqual({
      todayCount: 2,
      newCount: 0,
      pendingCount: 3,
      totalCount: 4
    })
  })

  it("与 calculateDeckStats 的口径一致性：pendingCount == totalOverdue（同一输入）", () => {
    const cards: ReviewCard[] = [
      card({ id: 1, due: at(13, 8) }),
      card({ id: 2, due: at(15, 0) }),
      card({ id: 3, due: at(16, 0) }),
      newCard({ id: 4 })
    ]
    const home = calculateHomeStats(cards)
    const deck = calculateDeckStats(cards)
    // 两函数对"已到期非新卡"的判定同为 dueTime <= nowTime；
    // totalOverdue 实为"全部已到期"而非仅积压（见上方 totalOverdue 锁定用例）
    expect(home.pendingCount).toBe(deck.totalOverdue)
    expect(home.totalCount).toBe(deck.totalCards)
    expect(home.newCount).toBe(deck.totalNew)
  })
})
