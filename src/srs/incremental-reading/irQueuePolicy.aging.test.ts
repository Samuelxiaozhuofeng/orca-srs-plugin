import { describe, expect, it } from "vitest"
import type { IRCard } from "../incrementalReadingCollector"
import {
  IR_AGING_CAP,
  IR_AGING_RATE,
  agingBonus,
  cardValue,
  overdueDays,
  selectQueueWithPolicy
} from "./irQueuePolicy"
import { baseConfig, card, now } from "./irQueuePolicyTestUtils"

/**
 * 老化（aging）排序 + 探索真随机采样回归。
 *
 * 老化用例（①②）刻意选**夏季**墙钟窗口，跨度内无 DST 切换，
 * 保证 overdueDays 精确等于日历天数（floor(ms/天) 不受 ±1h 影响）。
 */
describe("irQueuePolicy aging (P0 低压排期)", () => {
  const nowSummer = new Date(2026, 6, 20, 12, 0, 0) // 2026-07-20 本地正午
  // 相对 nowSummer 的到期日（本地日；负 day 由 Date 归一化，落在 5 月）。
  const dueDaysAgo = (n: number): Date => new Date(2026, 6, 20 - n, 8, 0, 0)

  it("① 饥饿回归：逾期低优先级卡凭老化胜过新到期高优先级卡", () => {
    const aged60 = card({
      id: 1,
      cardType: "extracts",
      priority: 50,
      due: dueDaysAgo(60),
      isNew: false,
      readCount: 3
    })
    const aged10 = card({
      id: 2,
      cardType: "extracts",
      priority: 50,
      due: dueDaysAgo(10),
      isNew: false,
      readCount: 3
    })
    const fresh70 = card({
      id: 3,
      cardType: "extracts",
      priority: 70,
      due: dueDaysAgo(0), // 今天到期 → agingBonus 0
      isNew: false,
      readCount: 3
    })

    // 逾期天数与价值
    expect(overdueDays(aged60, nowSummer)).toBe(60)
    expect(cardValue(aged60, nowSummer)).toBe(75) // 50 + min(25, 60×0.5=30) = 75
    expect(overdueDays(aged10, nowSummer)).toBe(10)
    expect(cardValue(aged10, nowSummer)).toBe(55) // 50 + 10×0.5 = 55
    expect(overdueDays(fresh70, nowSummer)).toBe(0)
    expect(cardValue(fresh70, nowSummer)).toBe(70) // 无老化

    // 排序语义：逾期 60 天 p50（75）> 新到期 p70（70）；逾期 10 天 p50（55）< p70（70）
    expect(cardValue(aged60, nowSummer)).toBeGreaterThan(cardValue(fresh70, nowSummer))
    expect(cardValue(aged10, nowSummer)).toBeLessThan(cardValue(fresh70, nowSummer))

    // 队列层面：aged60 应排在 fresh70 之前、fresh70 排在 aged10 之前
    const result = selectQueueWithPolicy(
      [fresh70, aged10, aged60],
      baseConfig({
        timeBudgetMinutes: 30,
        dailyLimit: 20,
        topicMinRatio: 0,
        topicMinCount: 0,
        explorationRatio: 0
      }),
      nowSummer
    )
    const ids = result.queue.map(c => c.id)
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(3)) // aged60 先于 fresh70
    expect(ids.indexOf(3)).toBeLessThan(ids.indexOf(2)) // fresh70 先于 aged10
  })

  it("② 未到期卡 agingBonus = 0（含当天到期）", () => {
    const future = card({
      id: 1,
      cardType: "extracts",
      priority: 50,
      due: dueDaysAgo(-5), // 5 天后到期
      isNew: false,
      readCount: 3
    })
    const dueToday = card({
      id: 2,
      cardType: "extracts",
      priority: 50,
      due: dueDaysAgo(0),
      isNew: false,
      readCount: 3
    })

    expect(overdueDays(future, nowSummer)).toBe(0)
    expect(agingBonus(future, nowSummer)).toBe(0)
    expect(cardValue(future, nowSummer)).toBe(50)

    expect(overdueDays(dueToday, nowSummer)).toBe(0)
    expect(agingBonus(dueToday, nowSummer)).toBe(0)
    expect(cardValue(dueToday, nowSummer)).toBe(50)
  })

  it("老化封顶：满 cap 需 50 天，且封顶后仍在 80 硬保护线之下", () => {
    expect(IR_AGING_RATE).toBe(0.5)
    expect(IR_AGING_CAP).toBe(25)
    const capped = card({
      id: 1,
      cardType: "extracts",
      priority: 50,
      due: dueDaysAgo(50),
      isNew: false,
      readCount: 3
    })
    const wayOverdue = card({
      id: 2,
      cardType: "extracts",
      priority: 50,
      due: dueDaysAgo(200),
      isNew: false,
      readCount: 3
    })
    expect(agingBonus(capped, nowSummer)).toBe(25) // 50×0.5 = 25 = cap
    expect(agingBonus(wayOverdue, nowSummer)).toBe(25) // 封顶不再增长
    // p=50 老化到极限也只有 75 < 80，绝不越过高优先级硬保护线
    expect(cardValue(wayOverdue, nowSummer)).toBe(75)
    expect(cardValue(wayOverdue, nowSummer)).toBeLessThan(80)
  })

  it("③ 当日确定性：同 seed 两次计算结果全等（含探索）", () => {
    const cards: IRCard[] = []
    for (let i = 0; i < 12; i++) {
      cards.push(
        card({
          id: 100 + i,
          cardType: "extracts",
          priority: 40 + (i % 8),
          due: new Date("2026-01-10T08:00:00"),
          isNew: false,
          readCount: 2
        })
      )
    }
    const cfg = baseConfig({
      timeBudgetMinutes: 30,
      dailyLimit: 8,
      topicMinRatio: 0,
      topicMinCount: 0,
      newExtractMaxRatio: 1,
      explorationRatio: 0.05
    })
    const a = selectQueueWithPolicy(cards, cfg, now)
    const b = selectQueueWithPolicy(cards, cfg, now)
    expect(a.queue.map(c => c.id)).toEqual(b.queue.map(c => c.id))
    expect(a.diagnostics).toEqual(b.diagnostics)
  })

  it("④ 探索均匀采样：换入候选池深处的卡，而非未入选中价值最高的那张", () => {
    // 6 张 filler（p60，占满 dailyLimit=6）+ 5 张未入选候选（p55..p51）。
    // 旧"截断线附近价值最高"会换入 p55（id 201）；新均匀采样（seed 2026-01-20）
    // 的探索顺序为 205,204,203,202,201 → 首个换入者是 id 205（p51，池最深处）。
    const cards: IRCard[] = []
    for (let i = 0; i < 6; i++) {
      cards.push(
        card({
          id: 101 + i,
          cardType: "extracts",
          priority: 60,
          due: new Date("2026-01-25T08:00:00"), // 未到期，不逾期
          isNew: false,
          readCount: 2
        })
      )
    }
    const poolPriorities: Record<number, number> = {
      201: 55,
      202: 54,
      203: 53,
      204: 52,
      205: 51
    }
    for (const idStr of Object.keys(poolPriorities)) {
      const id = Number(idStr)
      cards.push(
        card({
          id,
          cardType: "extracts",
          priority: poolPriorities[id],
          due: new Date("2026-01-25T08:00:00"),
          isNew: false,
          readCount: 2
        })
      )
    }

    const result = selectQueueWithPolicy(
      cards,
      baseConfig({
        timeBudgetMinutes: 30,
        dailyLimit: 6,
        topicMinRatio: 0,
        topicMinCount: 0,
        newExtractMaxRatio: 0.2,
        explorationRatio: 0.05
        // seed 默认 "2026-01-20"
      }),
      now
    )

    const ids = result.queue.map(c => c.id)
    expect(result.queue.length).toBe(6)
    // 换入了池最深处的 id 205（p51），而**不是**价值最高的未入选 id 201（p55）
    expect(ids).toContain(205)
    expect(ids).not.toContain(201)
    // 其余候选（p52..p54）也未被换入——只有一个探索槽
    expect(ids).not.toContain(202)
    expect(ids).not.toContain(203)
    expect(ids).not.toContain(204)

    const diag = result.diagnostics.find(d => d.code === "exploration_applied")
    expect(diag).toBeDefined()
    expect(diag?.reason).toBe("uniform_random_sampling")
    expect(diag?.detail?.sampleSwapInId).toBe(205)
    expect(diag?.detail?.appliedSwaps).toBe(1)
  })
})
