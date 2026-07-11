import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ensureTestDom } from "./testDom"
import {
  buildEpub2Ncx,
  buildEpub2WithFrontMatter,
  buildInvalidContainerEpub,
  buildMinimalEpub3
} from "./epubFixtures"
import { EpubParser, makeChapterKey, parseEpub } from "./epubParser"
import { parseHtmlOutlineTokens } from "./htmlOutline"
import {
  extractTopHeadingTitle,
  getHtmlContentRoot,
  parseHtml,
  removeMatchingTopHeading,
  sanitizeHtmlForOrca
} from "./epubHtml"
import { computeSha256Hex } from "./fingerprint"
import { parseEpubManifest, serializeEpubManifest } from "./manifest"
import { EpubValidationError } from "./types"

beforeAll(() => {
  ensureTestDom()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("epubParser", () => {
  it("parses EPUB 3 nav titles and stable chapter keys", async () => {
    const buffer = await buildMinimalEpub3()
    const parsed = await parseEpub(buffer)
    expect(parsed.metadata.title).toBe("Test Book")
    expect(parsed.metadata.author).toBe("Test Author")
    expect(parsed.chapters).toHaveLength(2)
    expect(parsed.chapters[0].title).toBe("第一章")
    expect(parsed.chapters[1].title).toBe("第二章")
    expect(parsed.chapters[0].key).toMatch(/^0:/)
    expect(parsed.chapters[1].key).toMatch(/^1:/)
    expect(parsed.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it("parses EPUB 2 NCX titles", async () => {
    const buffer = await buildEpub2Ncx()
    const parsed = await parseEpub(buffer)
    expect(parsed.metadata.title).toBe("EPUB2 Book")
    expect(parsed.chapters[0].title).toBe("NCX Chapter A")
    expect(parsed.chapters[1].title).toBe("NCX Chapter B")
  })

  it("omits cover wrappers and gives readable titles to front matter", async () => {
    const parsed = await parseEpub(await buildEpub2WithFrontMatter())
    expect(parsed.chapters.map((chapter) => chapter.title)).toEqual([
      "书名页",
      "致学习旅途上的种种刺激",
      "第一章 正文"
    ])
    expect(parsed.chapters.every((chapter) => !/^Chapter \d+$/.test(chapter.title))).toBe(true)
  })

  it("rejects invalid container", async () => {
    const buffer = await buildInvalidContainerEpub()
    const parser = new EpubParser()
    await expect(parser.load(buffer)).rejects.toThrow(/rootfile/i)
  })

  it("uses content heading when nav missing title", async () => {
    const buffer = await buildMinimalEpub3({
      chapters: [
        {
          id: "c1",
          href: "only.xhtml",
          title: "ignored",
          body: "<h2>From Content</h2><p>x</p>"
        }
      ]
    })
    // Remove nav influence by building without matching nav — still has nav
    // but content enrichment runs after and overwrites with heading
    const parsed = await parseEpub(buffer)
    expect(parsed.chapters[0].title).toBe("From Content")
  })

  it("fingerprints differ for different files", async () => {
    const a = await buildMinimalEpub3({ title: "A" })
    const b = await buildMinimalEpub3({ title: "B" })
    const fa = await computeSha256Hex(a)
    const fb = await computeSha256Hex(b)
    expect(fa).not.toBe(fb)
  })

  it("computes standard SHA-256 vectors without Web Crypto", async () => {
    vi.stubGlobal("crypto", undefined)
    const bytes = new TextEncoder().encode("abc")
    expect(await computeSha256Hex(bytes.buffer)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })
})

describe("makeChapterKey", () => {
  it("handles collisions deterministically", () => {
    const used = new Set<string>()
    const k1 = makeChapterKey("ch.xhtml", 0, used)
    const k2 = makeChapterKey("ch.xhtml", 0, used)
    expect(k1).toBe("0:ch.xhtml")
    expect(k2).toBe("0:ch.xhtml#1")
  })
})

describe("htmlOutline + sanitize (smoke)", () => {
  it("tokenizes headings and content", () => {
    const tokens = parseHtmlOutlineTokens(
      "<h1>T1</h1><p>para</p><h2>T2</h2><p>more</p>"
    )
    expect(tokens[0]).toEqual({ kind: "heading", level: 1, text: "T1" })
    expect(tokens[1].kind).toBe("content")
    expect(tokens[2]).toEqual({ kind: "heading", level: 2, text: "T2" })
  })

  it("sanitizes anchors for Orca", () => {
    const doc = parseHtml('<p><a href="http://x">link</a></p>')
    const root = getHtmlContentRoot(doc, "")
    sanitizeHtmlForOrca(root)
    expect(root.querySelector("a")).toBeNull()
    expect(root.querySelector("span")?.textContent).toBe("link")
  })

  it("extracts top heading", () => {
    const doc = parseHtml("<h1>Hello</h1><p>x</p>")
    expect(extractTopHeadingTitle(getHtmlContentRoot(doc, ""))).toBe("Hello")
  })

  it("removes only a first h1 that matches the chapter page title", () => {
    const matching = getHtmlContentRoot(
      parseHtml("<h1> Chapter Title </h1><h2>Section</h2>"),
      ""
    )
    removeMatchingTopHeading(matching, "Chapter Title")
    expect(matching.querySelector("h1")).toBeNull()
    expect(matching.querySelector("h2")?.textContent).toBe("Section")

    const different = getHtmlContentRoot(
      parseHtml("<h1>Document Title</h1><p>body</p>"),
      ""
    )
    removeMatchingTopHeading(different, "TOC Title")
    expect(different.querySelector("h1")?.textContent).toBe("Document Title")

    const lowerLevel = getHtmlContentRoot(
      parseHtml("<h2>Section</h2><p>body</p>"),
      ""
    )
    removeMatchingTopHeading(lowerLevel, "Section")
    expect(lowerLevel.querySelector("h2")?.textContent).toBe("Section")
  })
})

describe("manifest parse/serialize", () => {
  const sample = {
    version: 1 as const,
    fingerprint: "abc",
    sourceFileName: "a.epub",
    sourceAssetPath: "assets/a.epub",
    status: "complete" as const,
    bookBlockId: 10,
    chapters: [
      {
        key: "0:c1",
        spineIndex: 0,
        href: "c1.xhtml",
        title: "C1",
        blockId: 11,
        status: "imported" as const,
        error: null
      }
    ]
  }

  it("round-trips valid manifest", () => {
    const json = serializeEpubManifest(sample)
    const parsed = parseEpubManifest(json)
    expect(parsed).toEqual(sample)
  })

  it("rejects unsupported version", () => {
    expect(() => parseEpubManifest(JSON.stringify({ ...sample, version: 2 }))).toThrow(
      EpubValidationError
    )
  })

  it("rejects malformed JSON", () => {
    expect(() => parseEpubManifest("{not-json")).toThrow(EpubValidationError)
  })

  it("rejects missing chapters", () => {
    expect(() =>
      parseEpubManifest(JSON.stringify({ ...sample, chapters: undefined }))
    ).toThrow(EpubValidationError)
  })
})
