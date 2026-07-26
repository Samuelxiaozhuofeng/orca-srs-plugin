/**
 * CardInfoPanel 共享组件回归测试
 *
 * 背景：Cloze/Choice/List/Direction 四个复习渲染器曾各自内联复制卡片信息面板与
 * formatCardState/formatDateTime（全仓 5 份实现，写法已漂移：渲染器版用前置 if
 * 处理 null/undefined，CardInfoPanel 版用 case 穿透）。去重后统一走本组件，
 * 此测试固定两点：
 * 1. formatCardState/formatDateTime 与被删除的渲染器版实现输出逐输入一致；
 * 2. 面板行集合与顺序（含 showSchedulingDetails=false 的选择题卡 5 行变体）。
 */

import { describe, expect, it } from "vitest"
import { State } from "ts-fsrs"
import CardInfoPanel, { formatCardState, formatDateTime } from "./CardInfoPanel"
import type { SrsState } from "../../srs/types"

/** 渲染器中被删除的旧实现（前置 if 写法），用于固定行为等价 */
function legacyFormatCardState(state?: State): string {
  if (state === undefined || state === null) return "新卡"
  switch (state) {
    case State.New: return "新卡"
    case State.Learning: return "学习中"
    case State.Review: return "复习中"
    case State.Relearning: return "重学中"
    default: return "未知"
  }
}

/** 渲染器中被删除的旧实现（变量名/引号风格略异），用于固定行为等价 */
function legacyFormatDateTime(date: Date | null | undefined): string {
  if (!date) return "从未"
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

describe("formatCardState", () => {
  it("覆盖全部 FSRS 状态与空值", () => {
    expect(formatCardState(State.New)).toBe("新卡")
    expect(formatCardState(State.Learning)).toBe("学习中")
    expect(formatCardState(State.Review)).toBe("复习中")
    expect(formatCardState(State.Relearning)).toBe("重学中")
    expect(formatCardState(undefined)).toBe("新卡")
    expect(formatCardState(null as unknown as State)).toBe("新卡")
    expect(formatCardState(99 as State)).toBe("未知")
  })

  it("与旧渲染器版实现（前置 if 写法）逐输入一致", () => {
    const inputs: Array<State | undefined> = [
      State.New,
      State.Learning,
      State.Review,
      State.Relearning,
      undefined,
      null as unknown as State,
      99 as State
    ]
    for (const input of inputs) {
      expect(formatCardState(input), `state=${String(input)}`).toBe(
        legacyFormatCardState(input)
      )
    }
  })
})

describe("formatDateTime", () => {
  it("空值返回“从未”", () => {
    expect(formatDateTime(null)).toBe("从未")
    expect(formatDateTime(undefined)).toBe("从未")
  })

  it("按本地时间输出 yyyy-MM-dd HH:mm 并补零", () => {
    // 用本地时间构造，避免时区影响断言
    expect(formatDateTime(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05 09:07")
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31 23:59")
  })

  it("与旧渲染器版实现逐输入一致", () => {
    const inputs: Array<Date | null | undefined> = [
      null,
      undefined,
      new Date(2026, 0, 5, 9, 7),
      new Date(2025, 6, 15, 0, 0)
    ]
    for (const input of inputs) {
      expect(formatDateTime(input), String(input)).toBe(legacyFormatDateTime(input))
    }
  })
})

// —— 面板行集合（组件无 hooks，可作为纯函数调用检查元素树） ——

type AnyElement = {
  props?: { label?: string; value?: string; color?: string; children?: unknown }
}

/** 递归收集元素树中所有 InfoRow 的 { label, value, color } */
function collectInfoRows(node: unknown): Array<{ label: string; value: string; color?: string }> {
  if (node == null) return []
  if (Array.isArray(node)) return node.flatMap(collectInfoRows)
  const element = node as AnyElement
  if (!element.props) return []
  if (typeof element.props.label === "string" && typeof element.props.value === "string") {
    return [{ label: element.props.label, value: element.props.value, color: element.props.color }]
  }
  return collectInfoRows(element.props.children)
}

const sampleSrsInfo: Partial<SrsState> = {
  lapses: 2,
  reps: 7,
  state: State.Review,
  lastReviewed: new Date(2026, 6, 20, 8, 30),
  due: new Date(2026, 6, 27, 8, 30),
  interval: 7,
  stability: 3.456,
  difficulty: 5.1
}

describe("CardInfoPanel 行集合", () => {
  it("默认显示 8 行且顺序与原内联面板一致", () => {
    const rows = collectInfoRows(CardInfoPanel({ srsInfo: sampleSrsInfo }))
    expect(rows.map((row) => row.label)).toEqual([
      "遗忘次数", "复习次数", "卡片状态", "最后复习", "下次到期", "间隔天数", "稳定性", "难度"
    ])
    expect(rows.map((row) => row.value)).toEqual([
      "2", "7", "复习中", "2026-07-20 08:30", "2026-07-27 08:30", "7 天", "3.46", "5.10"
    ])
  })

  it("showSchedulingDetails=false 时保持选择题卡历史的 5 行输出", () => {
    const rows = collectInfoRows(
      CardInfoPanel({ srsInfo: sampleSrsInfo, showSchedulingDetails: false })
    )
    expect(rows.map((row) => row.label)).toEqual([
      "遗忘次数", "复习次数", "卡片状态", "最后复习", "下次到期"
    ])
  })

  // 断言的是「状态 → 语义令牌」的映射，不是具体色值。
  // 旧断言锁定的 `--orca-color-success/warning/primary`（无数字后缀）在 Orca 中不存在，
  // 等于把「状态色从不生效」这个 bug 固化成了回归契约，故一并更新。
  it("卡片状态配色映射到设计令牌语义色", () => {
    const colorOf = (state?: State) =>
      collectInfoRows(CardInfoPanel({ srsInfo: { ...sampleSrsInfo, state } }))
        .find((row) => row.label === "卡片状态")?.color
    expect(colorOf(State.Review)).toBe("var(--srs-accent-success)")
    expect(colorOf(State.Learning)).toBe("var(--srs-accent-warn)")
    expect(colorOf(State.Relearning)).toBe("var(--srs-accent-warn)")
    expect(colorOf(State.New)).toBe("var(--srs-accent-new)")
    expect(colorOf(undefined)).toBe("var(--srs-accent-new)")
  })

  it("srsInfo 缺省时全部字段落到 0/从未", () => {
    const rows = collectInfoRows(CardInfoPanel({}))
    expect(rows.map((row) => row.value)).toEqual([
      "0", "0", "新卡", "从未", "从未", "0 天", "0.00", "0.00"
    ])
  })
})
