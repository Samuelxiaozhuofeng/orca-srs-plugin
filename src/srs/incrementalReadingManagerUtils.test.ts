import { afterEach, describe, expect, it, vi } from "vitest"
import type { IRCard } from "./incrementalReadingCollector"
import { calculateIRStats, getIRDateGroup, groupIRCardsByDate, openIRManager } from "./incrementalReadingManagerUtils"

function createCard(id: number, due: Date, isNew: boolean): IRCard {
  return {
    id,
    cardType: "extracts",
    priority: 50,
    position: null,
    due,
    intervalDays: 2,
    postponeCount: 0,
    stage: "extract.raw",
    lastAction: "init",
    lastRead: isNew ? null : new Date(due.getTime() - 3600),
    readCount: isNew ? 0 : 1,
    isNew,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("incrementalReadingManagerUtils", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete (globalThis as any).orca
  })
  it("should group cards by date with expected order", () => {
    const now = new Date("2026-01-19T14:30:00")
    const cards: IRCard[] = [
      createCard(1, new Date("2026-01-18T08:00:00"), false),
      createCard(2, new Date("2026-01-19T08:00:00"), false),
      createCard(3, new Date("2026-01-20T10:00:00"), false),
      createCard(4, new Date("2026-01-25T15:00:00"), false),
      createCard(5, new Date("2026-01-21T00:00:00"), true),
      createCard(6, new Date("2026-02-01T12:00:00"), false)
    ]

    const groups = groupIRCardsByDate(cards, now)
    const groupKeys = groups.map(group => group.key)

    expect(groupKeys).toEqual(["已逾期", "今天", "明天", "未来7天", "新卡", "7天后"])
    expect(getIRDateGroup(cards[0], now)).toBe("已逾期")
    expect(getIRDateGroup(cards[1], now)).toBe("今天")
    expect(getIRDateGroup(cards[2], now)).toBe("明天")
    expect(getIRDateGroup(cards[3], now)).toBe("未来7天")
    expect(getIRDateGroup(cards[4], now)).toBe("新卡")
    expect(getIRDateGroup(cards[5], now)).toBe("7天后")
  })

  it("should calculate stats for due and upcoming cards", () => {
    const now = new Date("2026-01-19T14:30:00")
    const cards: IRCard[] = [
      createCard(1, new Date("2026-01-18T08:00:00"), false),
      createCard(2, new Date("2026-01-19T08:00:00"), false),
      createCard(3, new Date("2026-01-20T10:00:00"), false),
      createCard(4, new Date("2026-01-25T15:00:00"), false),
      createCard(5, new Date("2026-01-21T00:00:00"), true),
      createCard(6, new Date("2026-02-01T12:00:00"), false)
    ]

    const stats = calculateIRStats(cards, now)

    expect(stats.total).toBe(6)
    expect(stats.newCount).toBe(1)
    expect(stats.overdueCount).toBe(1)
    expect(stats.todayCount).toBe(1)
    expect(stats.upcoming7Count).toBe(2)
  })

  it("should navigate to srs.ir-workspace custom panel when openIRManager is called", async () => {
    const notifyCalls: any[] = []
    const goToCalls: any[] = []

    function handleGoTo(view: string, viewArgs: any, panelId: string) {
      goToCalls.push({ view, viewArgs, panelId })
    }
    function handleNotify(level: string, message: string, opts?: any) {
      notifyCalls.push({ level, message, opts })
    }

    (globalThis as any).orca = {
      state: {
        activePanel: "panel-main",
        panels: { id: "root", direction: "row", children: [], height: 800 }
      },
      nav: {
        goTo: handleGoTo
      },
      notify: handleNotify
    } as any

    await openIRManager("test-plugin")

    expect(goToCalls).toHaveLength(1)
    expect(goToCalls[0]).toEqual({
      view: "srs.ir-workspace",
      viewArgs: { mode: "library", pluginName: "test-plugin" },
      panelId: "panel-main"
    })
    expect(notifyCalls).toContainEqual({
      level: "success",
      message: "渐进阅读管理面板已打开",
      opts: { title: "渐进阅读" }
    })
  })

  it("should switch focus and dispatch library mode when srs.ir-workspace panel already exists", async () => {
    const switchFocusCalls: string[] = []
    vi.stubGlobal("window", { dispatchEvent: vi.fn() })
    vi.stubGlobal("CustomEvent", class {
      detail: unknown
      constructor(_type: string, init: { detail: unknown }) {
        this.detail = init.detail
      }
    })

    function handleSwitchFocus(panelId: string) {
      switchFocusCalls.push(panelId)
    }

    (globalThis as any).orca = {
      state: {
        activePanel: "panel-main",
        panels: {
          id: "root",
          direction: "row",
          height: 800,
          children: [{
            id: "panel-existing",
            view: "srs.ir-workspace",
            viewArgs: { mode: "reading", pluginName: "test-plugin" },
            viewState: {}
          }]
        }
      },
      nav: {
        switchFocusTo: handleSwitchFocus
      },
      notify: () => {}
    } as any

    await openIRManager("test-plugin")

    expect(switchFocusCalls).toEqual(["panel-existing"])
  })
})
