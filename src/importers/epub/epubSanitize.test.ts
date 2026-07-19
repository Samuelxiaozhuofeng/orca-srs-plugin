/**
 * Strict EPUB sanitizer + budget pure-logic tests (WP-07).
 */

import { describe, expect, it } from "vitest"
import { JSDOM } from "jsdom"
import { sanitizeEpubHtmlString, isRejectedImageSrc } from "./epubSanitize"
import {
  EPUB_LIMITS,
  assertEpubCompressedSize,
  assertChapterCount,
  assertZipEntryCount,
  DecompressedBudgetTracker,
  EpubBudgetError
} from "./epubLimits"
import { resolveImageUploadMime, sniffImageMime } from "./epubMime"
import { rewriteImageSources } from "./epubHtml"

function withDom<T>(fn: () => T): T {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>")
  const g = globalThis as any
  const prevWindow = g.window
  const prevDocument = g.document
  const prevDOMParser = g.DOMParser
  g.window = dom.window
  g.document = dom.window.document
  g.DOMParser = dom.window.DOMParser
  try {
    return fn()
  } finally {
    g.window = prevWindow
    g.document = prevDocument
    g.DOMParser = prevDOMParser
  }
}

describe("sanitizeEpubHtmlForImport", () => {
  it("strips script, iframe, on*, style, and dangerous protocols", () => {
    withDom(() => {
      const html = `
        <p onclick="alert(1)" style="color:red">Hello</p>
        <script>evil()</script>
        <iframe src="https://evil.test"></iframe>
        <a href="javascript:alert(1)">x</a>
        <img src="https://evil.test/x.png" onerror="alert(1)"/>
        <img src="data:image/png;base64,aaaa"/>
        <svg><script>evil()</script></svg>
        <table><tr><td>ok</td></tr></table>
      `
      const out = sanitizeEpubHtmlString(html)
      expect(out).toContain("Hello")
      expect(out).toContain("<table")
      expect(out.toLowerCase()).not.toContain("script")
      expect(out.toLowerCase()).not.toContain("iframe")
      expect(out.toLowerCase()).not.toContain("onclick")
      expect(out.toLowerCase()).not.toContain("onerror")
      expect(out.toLowerCase()).not.toContain("style=")
      expect(out.toLowerCase()).not.toContain("javascript:")
      expect(out.toLowerCase()).not.toContain("https://evil")
      expect(out.toLowerCase()).not.toContain("data:image")
      expect(out.toLowerCase()).not.toContain("<svg")
    })
  })

  it("rejects external image src helper", () => {
    expect(isRejectedImageSrc("https://x.test/a.png")).toBe(true)
    expect(isRejectedImageSrc("data:image/png;base64,xx")).toBe(true)
    expect(isRejectedImageSrc("blob:http://x")).toBe(true)
    expect(isRejectedImageSrc("file:///tmp/a.png")).toBe(true)
    expect(isRejectedImageSrc("images/a.png")).toBe(false)
  })
})

describe("rewriteImageSources security", () => {
  it("removes img when rewrite returns null", async () => {
    await withDom(async () => {
      const root = document.createElement("div")
      root.innerHTML = `<p><img src="https://evil.test/a.png"/><img src="images/ok.png"/></p>`
      await rewriteImageSources(root, async (src) =>
        src.startsWith("images/") ? "asset://local/ok.png" : null
      )
      const imgs = root.querySelectorAll("img")
      expect(imgs.length).toBe(1)
      expect(imgs[0].getAttribute("src")).toBe("asset://local/ok.png")
    })
  })
})

describe("EPUB budgets", () => {
  it("rejects oversized compressed file", () => {
    expect(() => assertEpubCompressedSize(EPUB_LIMITS.maxCompressedBytes + 1)).toThrow(
      EpubBudgetError
    )
  })

  it("rejects too many zip entries / chapters", () => {
    expect(() => assertZipEntryCount(EPUB_LIMITS.maxZipEntries + 1)).toThrow(EpubBudgetError)
    expect(() => assertChapterCount(EPUB_LIMITS.maxChapters + 1)).toThrow(EpubBudgetError)
  })

  it("tracks decompressed total and compression ratio", () => {
    const tracker = new DecompressedBudgetTracker(100)
    tracker.add(50)
    expect(tracker.totalBytes).toBe(50)
    expect(() => tracker.add(10_000)).toThrow(/压缩比|超限|budget/i)
  })
})

describe("MIME magic", () => {
  it("sniffs PNG and rejects SVG by extension policy", () => {
    // minimal PNG signature
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0
    ]).buffer
    expect(sniffImageMime(png)).toBe("image/png")
    const ok = resolveImageUploadMime("OEBPS/images/a.png", png)
    expect(ok).toEqual({ mime: "image/png" })
    const svg = resolveImageUploadMime("OEBPS/images/a.svg", png)
    expect(svg).toEqual({ reject: "svg_rejected" })
  })
})
