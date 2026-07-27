/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from "vitest"
import { resetViewportScrollTop } from "./viewportScrollReset"

function mockScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number }
) {
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight
  })
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight
  })
  if (metrics.scrollTop != null) el.scrollTop = metrics.scrollTop
}

/**
 * 运行时确认形态：内部滚动节点随内容撑开（无本地滚动范围），
 * host `.orca-block-editor` 祖先才是真实纵向滚动容器。
 */
function buildHostScrollShape() {
  const host = document.createElement("div")
  host.className = "orca-block-editor"
  host.style.overflowY = "scroll"

  const inner = document.createElement("div")
  inner.className = "ir-reading__scroll"
  inner.style.overflow = "auto"

  host.appendChild(inner)
  document.body.appendChild(host)

  mockScrollMetrics(inner, { scrollHeight: 6140, clientHeight: 6140, scrollTop: 0 })
  mockScrollMetrics(host, { scrollHeight: 6958, clientHeight: 768, scrollTop: 3961 })

  return { host, inner }
}

describe("resetViewportScrollTop", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("resets the host ancestor when the inner node has no scroll range", () => {
    const { host, inner } = buildHostScrollShape()

    const owner = resetViewportScrollTop(inner)

    expect(owner).toBe(host)
    expect(host.scrollTop).toBe(0)
  })

  it("resets the inner node itself when it owns the scroll range", () => {
    const host = document.createElement("div")
    host.style.overflowY = "visible"
    const inner = document.createElement("div")
    inner.style.overflow = "auto"
    host.appendChild(inner)
    document.body.appendChild(host)
    mockScrollMetrics(inner, { scrollHeight: 4000, clientHeight: 600, scrollTop: 1800 })
    mockScrollMetrics(host, { scrollHeight: 600, clientHeight: 600, scrollTop: 0 })

    const owner = resetViewportScrollTop(inner)

    expect(owner).toBe(inner)
    expect(inner.scrollTop).toBe(0)
  })

  it("resolves the owner from a non-scrolling view root (summary page)", () => {
    const { host } = buildHostScrollShape()
    // 完成页：内部滚动节点已卸载，只剩一屏高的摘要根
    const summaryRoot = document.createElement("div")
    summaryRoot.className = "ir-reading"
    host.replaceChildren(summaryRoot)
    mockScrollMetrics(summaryRoot, { scrollHeight: 420, clientHeight: 420 })

    const owner = resetViewportScrollTop(summaryRoot)

    expect(owner).toBe(host)
    expect(host.scrollTop).toBe(0)
  })

  it("never touches an ancestor owner when allowAncestorOwner is false", () => {
    const { host, inner } = buildHostScrollShape()
    inner.scrollTop = 40

    const owner = resetViewportScrollTop(inner, { allowAncestorOwner: false })

    expect(owner).toBeNull()
    // 自己的滚动节点仍归零，外层宿主（Journal / 查询嵌入）保持不动
    expect(inner.scrollTop).toBe(0)
    expect(host.scrollTop).toBe(3961)
  })

  it("returns null for a missing start node", () => {
    expect(resetViewportScrollTop(null)).toBeNull()
    expect(resetViewportScrollTop(undefined)).toBeNull()
  })

  it("does not write scrollTop when already at top", () => {
    const { host, inner } = buildHostScrollShape()
    host.scrollTop = 0
    let writes = 0
    Object.defineProperty(host, "scrollTop", {
      configurable: true,
      get: () => 0,
      set: () => {
        writes += 1
      }
    })

    expect(resetViewportScrollTop(inner)).toBe(host)
    expect(writes).toBe(0)
  })
})
