import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ensureTestDom } from "./testDom"
import {
  buildEpub2Ncx,
  buildEpub2WithFrontMatter,
  buildEpub3NavRelativePaths,
  buildEpubChapterWithSubsections,
  buildEpubMultiFragmentChapters,
  buildEpubMultiFragmentDualTocNavWins,
  buildEpubMultiFragmentNumberingTocWithSliceHeadings,
  buildEpubNavZeroMatchNcxFallback,
  buildEpubPrefixPlusFragments,
  buildEpubSingleFragmentToc,
  buildInvalidContainerEpub,
  buildMinimalEpub3
} from "./epubFixtures"
import {
  EpubParser,
  extractHrefFragment,
  hrefDirectory,
  makeChapterKey,
  normalizeComparableHref,
  parseEpub,
  resolveHrefTarget,
  SUBSTANTIVE_PREFIX_MIN_CHARS,
  hasSubstantivePrefix
} from "./epubParser"
import { parseHtmlOutlineTokens } from "./htmlOutline"
import {
  extractTopHeadingTitle,
  getHtmlContentRoot,
  parseHtml,
  preferChapterTitle,
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
          title: "",
          body: "<h2>From Content</h2><p>x</p>"
        }
      ]
    })
    // Empty nav label is ignored; content enrichment supplies the title.
    const parsed = await parseEpub(buffer)
    expect(parsed.chapters[0].title).toBe("From Content")
  })

  it("matches nav links with ../ relative to Text/nav.xhtml", async () => {
    const parsed = await parseEpub(await buildEpub3NavRelativePaths())
    expect(parsed.chapters).toHaveLength(2)
    expect(parsed.chapters[0].title).toBe("1 Why logic?")
    expect(parsed.chapters[1].title).toBe("2 What is logic?")
  })

  it("falls back to NCX when nav exists but matches zero spine chapters", async () => {
    const parsed = await parseEpub(await buildEpubNavZeroMatchNcxFallback())
    expect(parsed.chapters.map((c) => c.title)).toEqual([
      "NCX Fallback A",
      "NCX Fallback B"
    ])
  })

  it.each(["ncx", "nav"] as const)(
    "expands multi-fragment logical chapters from same XHTML (%s)",
    async (format) => {
      const buffer = await buildEpubMultiFragmentChapters(format)
      const parsed = await parseEpub(buffer)

      expect(parsed.chapters.map((c) => c.title)).toEqual([
        "前言",
        "一章",
        "二章",
        "三章"
      ])
      // Front matter stays whole-file; part expands to 3 logical chapters.
      expect(parsed.chapters[0].href).toBe("Text/front.xhtml")
      expect(parsed.chapters[0].key).toBe("0:Text/front.xhtml")
      expect(parsed.chapters[0].key.includes("#")).toBe(false)

      expect(parsed.chapters.slice(1).map((c) => c.href)).toEqual([
        "Text/part.xhtml#ch1",
        "Text/part.xhtml#ch2",
        "Text/part.xhtml#ch3"
      ])
      expect(parsed.chapters.slice(1).map((c) => c.key)).toEqual([
        "1:Text/part.xhtml#ch1",
        "1:Text/part.xhtml#ch2",
        "1:Text/part.xhtml#ch3"
      ])
      expect(parsed.chapters[1].spineIndex).toBe(1)
      expect(parsed.chapters[2].spineIndex).toBe(1)
      expect(parsed.chapters[3].spineIndex).toBe(1)
      expect(parsed.chapters[1].endFragment).toBe("ch2")
      expect(parsed.chapters[2].endFragment).toBe("ch3")
      expect(parsed.chapters[3].endFragment).toBeUndefined()

      // Parent whole-file TOC entry must not appear as a chapter (would duplicate body).
      expect(parsed.chapters.some((c) => c.title === "正文部分")).toBe(false)
      expect(parsed.chapters.some((c) => c.href === "Text/part.xhtml")).toBe(false)

      const parser = new EpubParser()
      await parser.load(buffer)
      const html1 = await parser.getChapterContent(
        parsed.chapters[1].href,
        parsed.chapters[1].title,
        { endFragment: parsed.chapters[1].endFragment }
      )
      const html2 = await parser.getChapterContent(
        parsed.chapters[2].href,
        parsed.chapters[2].title,
        { endFragment: parsed.chapters[2].endFragment }
      )
      const html3 = await parser.getChapterContent(
        parsed.chapters[3].href,
        parsed.chapters[3].title,
        { endFragment: parsed.chapters[3].endFragment }
      )

      expect(html1).toContain("一章")
      expect(html1).toContain("Body of chapter one.")
      expect(html1).not.toContain("二章")
      expect(html1).not.toContain("Body of chapter two.")

      expect(html2).toContain("二章")
      expect(html2).toContain("Body of chapter two.")
      expect(html2).not.toContain("一章")
      expect(html2).not.toContain("三章")

      expect(html3).toContain("三章")
      expect(html3).toContain("Body of chapter three last.")
      expect(html3).not.toContain("一章")
      expect(html3).not.toContain("Body of chapter two.")
    }
  )

  it("prefers nav multi-fragment titles over NCX and does not duplicate chapters", async () => {
    const parsed = await parseEpub(await buildEpubMultiFragmentDualTocNavWins())
    expect(parsed.chapters).toHaveLength(2)
    expect(parsed.chapters.map((c) => c.title)).toEqual(["Nav A", "Nav B"])
    expect(parsed.chapters.map((c) => c.href)).toEqual([
      "part.xhtml#a",
      "part.xhtml#b"
    ])
  })

  it("does not expand a single fragment TOC entry (legacy whole-file key)", async () => {
    const parsed = await parseEpub(await buildEpubSingleFragmentToc())
    expect(parsed.chapters).toHaveLength(1)
    expect(parsed.chapters[0].title).toBe("Only Chapter")
    expect(parsed.chapters[0].href).toBe("chapter.xhtml")
    expect(parsed.chapters[0].key).toBe("0:chapter.xhtml")
    expect(parsed.chapters[0].endFragment).toBeUndefined()
  })

  it.each(["ncx", "nav"] as const)(
    "auto keeps whole-file chapter for nested subsection TOC (%s)",
    async (format) => {
      const buffer = await buildEpubChapterWithSubsections(format)
      const parsed = await parseEpub(buffer)
      expect(parsed.chapters).toHaveLength(1)
      expect(parsed.chapters[0].title).toBe("第一章 信息是什么？")
      expect(parsed.chapters[0].href).toBe("Text/chapter.xhtml")
      expect(parsed.chapters[0].key).toBe("0:Text/chapter.xhtml")
      expect(parsed.chapters[0].key.includes("#")).toBe(false)
      expect(parsed.chapters[0].endFragment).toBeUndefined()

      const parser = new EpubParser()
      await parser.load(buffer)
      const html = await parser.getChapterContent(
        parsed.chapters[0].href,
        parsed.chapters[0].title
      )
      expect(html).toContain("最基本的概念")
      expect(html).toContain("真相究竟是什么")
      expect(html).toContain("信息有何作用")
      expect(html).toContain("人类历史的信息")
    }
  )

  it("toc-fragments still expands subsection TOC (legacy resume identity)", async () => {
    const buffer = await buildEpubChapterWithSubsections("ncx")
    const parsed = await parseEpub(buffer, { granularity: "toc-fragments" })
    expect(parsed.chapters.map((c) => c.title)).toEqual([
      "真相究竟是什么？",
      "信息有何作用？",
      "人类历史的信息"
    ])
    expect(parsed.chapters.every((c) => c.href.includes("#"))).toBe(true)
  })

  it("spine mode ignores multi-fragment expansion", async () => {
    const buffer = await buildEpubMultiFragmentChapters("ncx")
    const parsed = await parseEpub(buffer, { granularity: "spine" })
    expect(parsed.chapters.map((c) => c.href)).toEqual([
      "Text/front.xhtml",
      "Text/part.xhtml"
    ])
    expect(parsed.chapters.every((c) => !c.href.includes("#"))).toBe(true)
  })

  it("auto emits prefix chapter when lead-in exists but parent title is not a body heading", async () => {
    const buffer = await buildEpubPrefixPlusFragments()
    const parsed = await parseEpub(buffer)
    expect(parsed.chapters.map((c) => c.title)).toEqual([
      "Group Label Not In Body",
      "Alpha",
      "Beta"
    ])
    expect(parsed.chapters[0].href).toBe("Text/part.xhtml")
    expect(parsed.chapters[0].key).toBe("0:Text/part.xhtml")
    expect(parsed.chapters[0].endFragment).toBe("a")
    expect(parsed.chapters[1].href).toBe("Text/part.xhtml#a")
    expect(parsed.chapters[2].href).toBe("Text/part.xhtml#b")

    const parser = new EpubParser()
    await parser.load(buffer)
    const prefixHtml = await parser.getChapterContent(
      parsed.chapters[0].href,
      parsed.chapters[0].title,
      { endFragment: parsed.chapters[0].endFragment }
    )
    expect(prefixHtml).toContain("Lead-in prose")
    expect(prefixHtml).not.toContain("Alpha body")
    const alphaHtml = await parser.getChapterContent(
      parsed.chapters[1].href,
      parsed.chapters[1].title,
      { endFragment: parsed.chapters[1].endFragment }
    )
    expect(alphaHtml).toContain("Alpha body")
    expect(alphaHtml).not.toContain("Lead-in prose")
  })

  it("hasSubstantivePrefix uses the 40-char threshold boundary", () => {
    const makeRoot = (body: string) =>
      getHtmlContentRoot(parseHtml(`<body>${body}<h3 id="x">X</h3></body>`), "")
    const short = "a".repeat(SUBSTANTIVE_PREFIX_MIN_CHARS - 1)
    const exact = "a".repeat(SUBSTANTIVE_PREFIX_MIN_CHARS)
    const shortRoot = makeRoot(`<p>${short}</p>`)
    const exactRoot = makeRoot(`<p>${exact}</p>`)
    const shortAnchor = shortRoot.querySelector("#x")!
    const exactAnchor = exactRoot.querySelector("#x")!
    expect(hasSubstantivePrefix(shortRoot, shortAnchor)).toBe(false)
    expect(hasSubstantivePrefix(exactRoot, exactAnchor)).toBe(true)
  })

  it("enriches multi-fragment titles from each slice, not the first heading of the whole file", async () => {
    const parsed = await parseEpub(
      await buildEpubMultiFragmentNumberingTocWithSliceHeadings()
    )
    expect(parsed.chapters).toHaveLength(3)
    expect(parsed.chapters.map((c) => c.href)).toEqual([
      "part.xhtml#s1",
      "part.xhtml#s2",
      "part.xhtml#s3"
    ])
    // Numbering-only TOC ("1"/"2"/"3") must be upgraded by each slice's own h1.
    // A whole-file title pass would wrongly give all chapters "Alpha Reasons".
    expect(parsed.chapters.map((c) => c.title)).toEqual([
      "Alpha Reasons",
      "Beta Methods",
      "Gamma Results"
    ])
  })

  it("throws a clear error when a logical chapter start anchor is missing", async () => {
    const buffer = await buildEpubMultiFragmentChapters("ncx")
    const parser = new EpubParser()
    await parser.load(buffer)
    await expect(
      parser.getChapterContent("Text/part.xhtml#missing-start", "Ghost", {
        endFragment: "ch2"
      })
    ).rejects.toThrow(/start anchor not found.*fragment=missing-start/i)
  })

  it("throws a clear error when a declared end anchor is missing", async () => {
    const buffer = await buildEpubMultiFragmentChapters("ncx")
    const parser = new EpubParser()
    await parser.load(buffer)
    await expect(
      parser.getChapterContent("Text/part.xhtml#ch1", "一章", {
        endFragment: "missing-end"
      })
    ).rejects.toThrow(/end anchor not found.*fragment=missing-end/i)
  })

  it("does not let pure-number content headings overwrite TOC titles", async () => {
    const buffer = await buildMinimalEpub3({
      chapters: [
        {
          id: "c1",
          href: "chapter1.xhtml",
          title: "1 Why logic?",
          body: '<h1 class="chapter-number">1</h1><p>Only a number heading at top.</p>'
        }
      ]
    })
    const parsed = await parseEpub(buffer)
    expect(parsed.chapters[0].title).toBe("1 Why logic?")
  })

  it("combines leading number + title headings when TOC is absent", async () => {
    const buffer = await buildMinimalEpub3({
      chapters: [
        {
          id: "c1",
          href: "chapter1.xhtml",
          title: "",
          body:
            '<h1 class="chapter-number">1</h1><h1 class="chapter-title">WHY LOGIC?</h1><p>x</p>'
        }
      ]
    })
    const parsed = await parseEpub(buffer)
    expect(parsed.chapters[0].title).toBe("1 WHY LOGIC?")
    expect(parsed.chapters[0].title).not.toBe("1")
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

describe("normalizeComparableHref", () => {
  it("resolves ../ relative to nav directory and strips fragments", () => {
    const navDir = hrefDirectory("Text/nav.xhtml")
    expect(navDir).toBe("Text/")
    expect(normalizeComparableHref("../Text/chapter001.xhtml", navDir)).toBe(
      "Text/chapter001.xhtml"
    )
    expect(normalizeComparableHref("Text/chapter001.xhtml")).toBe(
      "Text/chapter001.xhtml"
    )
    expect(normalizeComparableHref("Text/ch.xhtml#frag")).toBe("Text/ch.xhtml")
    expect(normalizeComparableHref("/Text/ch.xhtml")).toBe("Text/ch.xhtml")
    expect(normalizeComparableHref("Text\\ch.xhtml")).toBe("Text/ch.xhtml")
  })

  it("decodes percent-encoding and tolerates malformed sequences", () => {
    expect(normalizeComparableHref("Text/ch%20apter.xhtml")).toBe(
      "Text/ch apter.xhtml"
    )
    // Malformed % sequence must not throw.
    expect(normalizeComparableHref("Text/ch%2.xhtml")).toBe("Text/ch%2.xhtml")
  })
})

describe("resolveHrefTarget / extractHrefFragment", () => {
  it("keeps path comparable and decodes fragment best-effort", () => {
    const navDir = hrefDirectory("Text/nav.xhtml")
    expect(resolveHrefTarget("../Text/part.xhtml#mllj1", navDir)).toEqual({
      path: "Text/part.xhtml",
      fragment: "mllj1"
    })
    expect(extractHrefFragment("Text/part.xhtml#mllj%202")).toBe("mllj 2")
    expect(extractHrefFragment("Text/part.xhtml")).toBe("")
    // Malformed fragment encoding must not throw.
    expect(extractHrefFragment("Text/part.xhtml#%E0%A4%A")).toBe("%E0%A4%A")
  })

  it("includes fragment in makeChapterKey while preserving legacy keys", () => {
    const used = new Set<string>()
    expect(makeChapterKey("Text/part.xhtml", 1, used)).toBe("1:Text/part.xhtml")
    expect(makeChapterKey("Text/part.xhtml#ch1", 1, used)).toBe(
      "1:Text/part.xhtml#ch1"
    )
    expect(makeChapterKey("Text/part.xhtml#ch2", 1, used)).toBe(
      "1:Text/part.xhtml#ch2"
    )
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

  it("combines leading chapter-number + chapter-title headings", () => {
    const root = getHtmlContentRoot(
      parseHtml(
        '<h1 class="chapter-number">1</h1><h1 class="chapter-title">WHY LOGIC?</h1><p>x</p><h2>Later section</h2>'
      ),
      ""
    )
    expect(extractTopHeadingTitle(root)).toBe("1 WHY LOGIC?")
  })

  it("combines PART / Chapter numbering with following title", () => {
    expect(
      extractTopHeadingTitle(
        getHtmlContentRoot(
          parseHtml("<h1>PART I</h1><h1>THE POWER OF LOGIC</h1><p>x</p>"),
          ""
        )
      )
    ).toBe("PART I THE POWER OF LOGIC")

    expect(
      extractTopHeadingTitle(
        getHtmlContentRoot(
          parseHtml("<h1>Chapter 1</h1><h1>Introduction</h1><p>x</p>"),
          ""
        )
      )
    ).toBe("Chapter 1 Introduction")
  })

  it("does not merge later body section headings into the chapter title", () => {
    const root = getHtmlContentRoot(
      parseHtml("<h1>Real Title</h1><p>intro</p><h2>Section A</h2><p>body</p>"),
      ""
    )
    expect(extractTopHeadingTitle(root)).toBe("Real Title")
  })

  it("preferChapterTitle keeps TOC over pure-number content", () => {
    expect(preferChapterTitle("1 Why logic?", "1")).toBe("1 Why logic?")
    expect(preferChapterTitle("", "1 WHY LOGIC?")).toBe("1 WHY LOGIC?")
    expect(preferChapterTitle("1", "Why logic?")).toBe("Why logic?")
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

  it("removes matching numbering + title heading pair, keeps non-matching pair", () => {
    const matching = getHtmlContentRoot(
      parseHtml(
        '<h1 class="chapter-number">1</h1><h1 class="chapter-title">WHY LOGIC?</h1><p>body</p><h2>Section</h2>'
      ),
      ""
    )
    removeMatchingTopHeading(matching, "1 Why logic?")
    expect(matching.querySelectorAll("h1")).toHaveLength(0)
    expect(matching.querySelector("h2")?.textContent).toBe("Section")
    expect(matching.querySelector("p")?.textContent).toBe("body")

    const nonMatching = getHtmlContentRoot(
      parseHtml(
        '<h1 class="chapter-number">1</h1><h1 class="chapter-title">OTHER TITLE</h1><p>body</p>'
      ),
      ""
    )
    removeMatchingTopHeading(nonMatching, "1 Why logic?")
    expect(nonMatching.querySelectorAll("h1")).toHaveLength(2)
    expect(nonMatching.querySelector(".chapter-number")?.textContent).toBe("1")
    expect(nonMatching.querySelector(".chapter-title")?.textContent).toBe(
      "OTHER TITLE"
    )
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

  it("round-trips optional chapterPlan", () => {
    const withPlan = {
      ...sample,
      chapterPlan: { version: 1 as const, granularity: "auto" as const }
    }
    const parsed = parseEpubManifest(serializeEpubManifest(withPlan))
    expect(parsed.chapterPlan).toEqual({ version: 1, granularity: "auto" })
  })

  it("allows missing chapterPlan (legacy resume → toc-fragments)", () => {
    const parsed = parseEpubManifest(JSON.stringify(sample))
    expect(parsed.chapterPlan).toBeUndefined()
  })

  it("rejects invalid chapterPlan.granularity", () => {
    expect(() =>
      parseEpubManifest(
        JSON.stringify({
          ...sample,
          chapterPlan: { version: 1, granularity: "bogus" }
        })
      )
    ).toThrow(EpubValidationError)
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
