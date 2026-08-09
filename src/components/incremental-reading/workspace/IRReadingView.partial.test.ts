/**
 * A3：partial collect 在会话顶展示非阻断提示；error 仍走全量失败。
 * 组件依赖宿主 React，用源码契约 + 纯函数断言（与 irSessionSummaryCopy 同风格）。
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildCollectError,
  buildCollectOk,
  getCollectPartialNotice,
  shouldShowLoadError
} from "../../../srs/incremental-reading/irCollectResult"
import type { IRCard } from "../../../srs/incrementalReadingCollector"

function fakeCard(id: number): IRCard {
  return {
    id,
    cardType: "topic",
    priority: 50,
    position: 1,
    due: new Date(),
    intervalDays: 5,
    postponeCount: 0,
    stage: "topic.preview",
    lastAction: "init",
    lastRead: null,
    readCount: 0,
    isNew: true,
    resumeBlockId: null,
    sourceBookId: null,
    sourceBookTitle: null,
    batchId: null,
    batchCreatedAt: null
  }
}

describe("IRReadingView partial collect notice", () => {
  const src = readFileSync(resolve(__dirname, "IRReadingView.tsx"), "utf8")

  it("wires getCollectPartialNotice and retry for partial, loadFailed only for error", () => {
    expect(src).toContain("getCollectPartialNotice")
    expect(src).toContain("ir-reading__banner--partial")
    expect(src).toContain("data-ir-collect-partial")
    expect(src).toContain("重新加载")
    expect(src).toContain("onRetryLoad")
    // 全量失败仍只靠 status === "error"
    expect(src).toContain('collectResult?.status === "error"')
  })

  it("partial: notice present and queue remains usable; error: full failure path", () => {
    const partial = buildCollectOk([fakeCard(7), fakeCard(8)], 3)
    const notice = getCollectPartialNotice(partial)
    expect(notice?.message).toContain("3 条")
    expect(shouldShowLoadError(partial)).toBe(false)
    // sessionReady 路径仍会把 partial.cards 交给 shell
    expect(partial.cards.length).toBe(2)

    const error = buildCollectError(new Error("network"))
    expect(getCollectPartialNotice(error)).toBeNull()
    expect(shouldShowLoadError(error)).toBe(true)
    expect(error.cards).toHaveLength(0)
  })
})
