import { afterEach, describe, expect, it, vi } from "vitest"
import {
  collectViewPanelsInOrder,
  resolveChapterQuizEditorHostPanelId,
  runWithChapterQuizEditorContext,
  waitForActivePanelId,
  waitForPanelInTree,
  type ChapterQuizPanelTreeNode
} from "./chapterQuizEditorContext"
import { CHAPTER_QUIZ_PANEL_VIEW } from "./chapterQuiz"

describe("resolveChapterQuizEditorHostPanelId", () => {
  it("root 两个 ViewPanel 时解析左侧", () => {
    const root: ChapterQuizPanelTreeNode = {
      id: "root",
      direction: "row",
      children: [
        {
          id: "left-1",
          view: "srs.ir-session",
          viewArgs: { blockId: 1 },
          viewState: {}
        } as ChapterQuizPanelTreeNode,
        {
          id: "right-quiz",
          view: CHAPTER_QUIZ_PANEL_VIEW,
          viewArgs: { quizBlockId: 99 }
        }
      ]
    }

    expect(resolveChapterQuizEditorHostPanelId("right-quiz", root)).toBe(
      "left-1"
    )
  })

  it("嵌套 Row/Column 时解析最近的左侧 ViewPanel", () => {
    // root row: [ column[top, mid], nested-row[far, near], quiz ]
    const root: ChapterQuizPanelTreeNode = {
      id: "root",
      direction: "row",
      children: [
        {
          id: "col-left",
          direction: "column",
          children: [
            { id: "vp-top", view: "block", viewArgs: {} },
            { id: "vp-mid", view: "journal", viewArgs: {} }
          ]
        },
        {
          id: "row-mid",
          direction: "row",
          children: [
            { id: "vp-far", view: "block", viewArgs: {} },
            { id: "vp-near", view: "srs.ir-session", viewArgs: {} }
          ]
        },
        {
          id: "quiz-panel",
          view: CHAPTER_QUIZ_PANEL_VIEW,
          viewArgs: { quizBlockId: 1 }
        }
      ]
    }

    // 最近前驱 sibling 是 row-mid，其中最靠后（靠近 quiz）的是 vp-near
    expect(resolveChapterQuizEditorHostPanelId("quiz-panel", root)).toBe(
      "vp-near"
    )
  })

  it("拒绝把 chapter-quiz-panel 自己当 host", () => {
    const root: ChapterQuizPanelTreeNode = {
      id: "root",
      direction: "row",
      children: [
        {
          id: "other-quiz",
          view: CHAPTER_QUIZ_PANEL_VIEW,
          viewArgs: { quizBlockId: 1 }
        },
        {
          id: "quiz-panel",
          view: CHAPTER_QUIZ_PANEL_VIEW,
          viewArgs: { quizBlockId: 2 }
        }
      ]
    }
    expect(resolveChapterQuizEditorHostPanelId("quiz-panel", root)).toBeNull()
  })

  it("找不到 panel 时返回 null", () => {
    const root: ChapterQuizPanelTreeNode = {
      id: "root",
      direction: "row",
      children: [{ id: "only", view: "block", viewArgs: {} }]
    }
    expect(resolveChapterQuizEditorHostPanelId("missing", root)).toBeNull()
  })

  it("collectViewPanelsInOrder 按文档序展开嵌套", () => {
    const root: ChapterQuizPanelTreeNode = {
      id: "root",
      direction: "row",
      children: [
        {
          id: "col",
          direction: "column",
          children: [
            { id: "a", view: "block", viewArgs: {} },
            { id: "b", view: "block", viewArgs: {} }
          ]
        },
        { id: "c", view: "journal", viewArgs: {} }
      ]
    }
    expect(collectViewPanelsInOrder(root).map((n) => n.id)).toEqual([
      "a",
      "b",
      "c"
    ])
  })
})

describe("waitForActivePanelId", () => {
  it("已到位时立即返回且不 sleep", async () => {
    const sleep = vi.fn(async () => undefined)
    await waitForActivePanelId("p1", {
      getActivePanel: () => "p1",
      sleep,
      now: () => 0,
      timeoutMs: 1000,
      pollIntervalMs: 10
    })
    expect(sleep).not.toHaveBeenCalled()
  })

  it("轮询后到位", async () => {
    let t = 0
    let active = "right"
    const sleep = vi.fn(async (ms: number) => {
      t += ms
      if (t >= 20) active = "left"
    })
    await waitForActivePanelId("left", {
      getActivePanel: () => active,
      sleep,
      now: () => t,
      timeoutMs: 100,
      pollIntervalMs: 10
    })
    expect(active).toBe("left")
    expect(sleep).toHaveBeenCalled()
  })

  it("超时抛可见错误", async () => {
    let t = 0
    const sleep = vi.fn(async (ms: number) => {
      t += ms
    })
    await expect(
      waitForActivePanelId("left", {
        getActivePanel: () => "right",
        sleep,
        now: () => t,
        timeoutMs: 30,
        pollIntervalMs: 10
      })
    ).rejects.toThrow(/切换编辑焦点超时/)
  })
})

describe("runWithChapterQuizEditorContext", () => {
  afterEach(() => {
    delete (globalThis as { orca?: unknown }).orca
  })

  function makeFlatRoot(leftId: string, rightId: string): ChapterQuizPanelTreeNode {
    return {
      id: "root",
      direction: "row",
      children: [
        { id: leftId, view: "srs.ir-session", viewArgs: {} },
        {
          id: rightId,
          view: CHAPTER_QUIZ_PANEL_VIEW,
          viewArgs: { quizBlockId: 1 }
        }
      ]
    }
  }

  it("switch 后 task 执行且 finally 恢复右侧", async () => {
    let active = "right-quiz"
    const switches: string[] = []
    const sleeps: number[] = []
    const task = vi.fn(async () => {
      expect(active).toBe("left-host")
      return 42
    })

    const result = await runWithChapterQuizEditorContext(
      "right-quiz",
      task,
      {
        getPanelsRoot: () => makeFlatRoot("left-host", "right-quiz"),
        getActivePanel: () => active,
        switchFocusTo: (id) => {
          switches.push(id)
          active = id
        },
        sleep: async (ms) => {
          sleeps.push(ms)
        },
        now: () => 0,
        timeoutMs: 100,
        pollIntervalMs: 1,
        settleMs: 150
      }
    )

    expect(result).toBe(42)
    expect(task).toHaveBeenCalledTimes(1)
    expect(switches).toEqual(["left-host", "right-quiz"])
    expect(sleeps).toEqual([150])
    expect(active).toBe("right-quiz")
  })

  it("稳定窗口内焦点离开 host 时不执行 task 并恢复右侧", async () => {
    let active = "right-quiz"
    const switches: string[] = []
    const task = vi.fn(async () => "nope")

    await expect(
      runWithChapterQuizEditorContext("right-quiz", task, {
        getPanelsRoot: () => makeFlatRoot("left-host", "right-quiz"),
        getActivePanel: () => active,
        switchFocusTo: (id) => {
          switches.push(id)
          active = id
        },
        sleep: async () => {
          active = "other-panel"
        },
        settleMs: 150
      })
    ).rejects.toThrow(/编辑器焦点在写入前发生变化/)

    expect(task).not.toHaveBeenCalled()
    expect(switches).toEqual(["left-host", "right-quiz"])
  })

  it("task 抛错仍恢复并原样抛出", async () => {
    let active = "right-quiz"
    const switches: string[] = []
    const err = new Error("write boom")

    await expect(
      runWithChapterQuizEditorContext(
        "right-quiz",
        async () => {
          throw err
        },
        {
          getPanelsRoot: () => makeFlatRoot("left-host", "right-quiz"),
          getActivePanel: () => active,
          switchFocusTo: (id) => {
            switches.push(id)
            active = id
          },
          sleep: async () => undefined,
          now: () => 0,
          timeoutMs: 100,
          pollIntervalMs: 1
        }
      )
    ).rejects.toBe(err)

    expect(switches).toEqual(["left-host", "right-quiz"])
    expect(active).toBe("right-quiz")
  })

  it("切换超时时 task 不执行且错误可见", async () => {
    let t = 0
    const task = vi.fn(async () => "nope")
    const switches: string[] = []

    await expect(
      runWithChapterQuizEditorContext("right-quiz", task, {
        getPanelsRoot: () => makeFlatRoot("left-host", "right-quiz"),
        // switch 后仍停在 right：模拟焦点未到位
        getActivePanel: () => "right-quiz",
        switchFocusTo: (id) => {
          switches.push(id)
        },
        sleep: async (ms) => {
          t += ms
        },
        now: () => t,
        timeoutMs: 25,
        pollIntervalMs: 10
      })
    ).rejects.toThrow(/切换编辑焦点超时/)

    expect(task).not.toHaveBeenCalled()
    // 已 switch 出去（或尝试），finally 仍应尝试恢复
    expect(switches[0]).toBe("left-host")
    expect(switches).toContain("right-quiz")
  })

  it("找不到 host 时不执行写入", async () => {
    const task = vi.fn(async () => 1)
    await expect(
      runWithChapterQuizEditorContext("orphan-quiz", task, {
        getPanelsRoot: () => ({
          id: "root",
          direction: "row",
          children: [
            {
              id: "orphan-quiz",
              view: CHAPTER_QUIZ_PANEL_VIEW,
              viewArgs: {}
            }
          ]
        }),
        getActivePanel: () => "orphan-quiz",
        switchFocusTo: vi.fn(),
        sleep: async () => undefined,
        now: () => 0
      })
    ).rejects.toThrow(/无法定位可写编辑面板/)
    expect(task).not.toHaveBeenCalled()
  })

  it("只剩 Custom Panel 时 openPanel 自动打开 block ViewPanel 后写卡并恢复", async () => {
    let active = "right-quiz"
    const switches: string[] = []
    const addCalls: Array<{
      id: string
      dir: string
      src: Record<string, unknown>
    }> = []
    let root: ChapterQuizPanelTreeNode = {
      id: "root",
      direction: "row",
      children: [
        {
          id: "right-quiz",
          view: CHAPTER_QUIZ_PANEL_VIEW,
          viewArgs: { quizBlockId: 1 }
        }
      ]
    }
    const task = vi.fn(async () => {
      expect(active).toBe("auto-left")
      return "card-ok"
    })

    const result = await runWithChapterQuizEditorContext(
      "right-quiz",
      task,
      {
        getPanelsRoot: () => root,
        getActivePanel: () => active,
        switchFocusTo: (id) => {
          switches.push(id)
          active = id
        },
        addToPanel: (id, dir, src) => {
          addCalls.push({ id, dir, src })
          root = {
            id: "root",
            direction: "row",
            children: [
              { id: "auto-left", view: "block", viewArgs: { blockId: 42 } },
              {
                id: "right-quiz",
                view: CHAPTER_QUIZ_PANEL_VIEW,
                viewArgs: { quizBlockId: 1 }
              }
            ]
          }
          return "auto-left"
        },
        openPanel: { view: "block", viewArgs: { blockId: 42 } },
        sleep: async () => undefined,
        now: () => 0,
        timeoutMs: 100,
        pollIntervalMs: 1,
        settleMs: 150
      }
    )

    expect(result).toBe("card-ok")
    expect(addCalls).toEqual([
      {
        id: "right-quiz",
        dir: "left",
        src: { view: "block", viewArgs: { blockId: 42 } }
      }
    ])
    expect(task).toHaveBeenCalledTimes(1)
    expect(switches).toEqual(["auto-left", "right-quiz"])
    expect(active).toBe("right-quiz")
  })

  it("openPanel 创建失败（addTo 返回 null）时 task 不执行且错误可见", async () => {
    const task = vi.fn(async () => "nope")
    await expect(
      runWithChapterQuizEditorContext("right-quiz", task, {
        getPanelsRoot: () => ({
          id: "root",
          direction: "row",
          children: [
            {
              id: "right-quiz",
              view: CHAPTER_QUIZ_PANEL_VIEW,
              viewArgs: {}
            }
          ]
        }),
        getActivePanel: () => "right-quiz",
        switchFocusTo: vi.fn(),
        addToPanel: () => null,
        openPanel: { view: "block", viewArgs: { blockId: 42 } }
      })
    ).rejects.toThrow(/无法创建可写编辑面板/)
    expect(task).not.toHaveBeenCalled()
  })

  it("openPanel addTo 抛错时错误可见且 task 不执行", async () => {
    const task = vi.fn(async () => "nope")
    await expect(
      runWithChapterQuizEditorContext("right-quiz", task, {
        getPanelsRoot: () => ({
          id: "root",
          direction: "row",
          children: [
            {
              id: "right-quiz",
              view: CHAPTER_QUIZ_PANEL_VIEW,
              viewArgs: {}
            }
          ]
        }),
        getActivePanel: () => "right-quiz",
        switchFocusTo: vi.fn(),
        addToPanel: () => {
          throw new Error("nav boom")
        },
        openPanel: { view: "block", viewArgs: { blockId: 42 } }
      })
    ).rejects.toThrow(/创建可写编辑面板失败/)
    expect(task).not.toHaveBeenCalled()
  })

  it("openPanel 后新面板未挂载时超时且 task 不执行", async () => {
    let t = 0
    const task = vi.fn(async () => "nope")
    await expect(
      runWithChapterQuizEditorContext("right-quiz", task, {
        getPanelsRoot: () => ({
          id: "root",
          direction: "row",
          children: [
            {
              id: "right-quiz",
              view: CHAPTER_QUIZ_PANEL_VIEW,
              viewArgs: {}
            }
          ]
        }),
        getActivePanel: () => "right-quiz",
        switchFocusTo: vi.fn(),
        addToPanel: () => "auto-left",
        openPanel: { view: "block", viewArgs: { blockId: 42 } },
        sleep: async (ms) => {
          t += ms
        },
        now: () => t,
        timeoutMs: 25,
        pollIntervalMs: 10
      })
    ).rejects.toThrow(/等待自动打开的原文面板超时/)
    expect(task).not.toHaveBeenCalled()
  })

  it("waitForPanelInTree 立即命中不 sleep", async () => {
    const sleep = vi.fn(async () => undefined)
    await waitForPanelInTree("p1", () => makeFlatRoot("l", "p1"), {
      sleep,
      now: () => 0,
      timeoutMs: 100,
      pollIntervalMs: 10
    })
    expect(sleep).not.toHaveBeenCalled()
  })

  it("无 customPanelId 时直接执行且不切换", async () => {
    const switchFocusTo = vi.fn()
    const task = vi.fn(async () => "ok")
    const result = await runWithChapterQuizEditorContext(null, task, {
      switchFocusTo,
      getPanelsRoot: () => makeFlatRoot("l", "r")
    })
    expect(result).toBe("ok")
    expect(task).toHaveBeenCalledTimes(1)
    expect(switchFocusTo).not.toHaveBeenCalled()
  })

  it("已在 host 上时不切换", async () => {
    const switchFocusTo = vi.fn()
    const task = vi.fn(async () => "here")
    const result = await runWithChapterQuizEditorContext("right-quiz", task, {
      getPanelsRoot: () => makeFlatRoot("left-host", "right-quiz"),
      getActivePanel: () => "left-host",
      switchFocusTo,
      sleep: async () => undefined
    })
    expect(result).toBe("here")
    expect(switchFocusTo).not.toHaveBeenCalled()
  })
})
