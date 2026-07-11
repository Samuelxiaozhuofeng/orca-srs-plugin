import { beforeAll, describe, expect, it } from "vitest"
import { ensureTestDom } from "./testDom"
import {
  isBlankElement,
  isBlankText,
  normalizeVisibleText,
  parseHtmlOutlineTokens,
  stripBlankHtml
} from "./htmlOutline"

beforeAll(() => {
  ensureTestDom()
})

describe("normalizeVisibleText / isBlankText", () => {
  it("treats NBSP and mixed whitespace as blank", () => {
    expect(isBlankText("")).toBe(true)
    expect(isBlankText("   \n\t  ")).toBe(true)
    expect(isBlankText("\u00a0")).toBe(true)
    expect(isBlankText(" \u00a0 \n ")).toBe(true)
    expect(isBlankText("a")).toBe(false)
    expect(normalizeVisibleText("  hello\u00a0world  ")).toBe("hello world")
  })
})

describe("parseHtmlOutlineTokens hierarchy tokens", () => {
  it("tokenizes h1 → h2 → h3 with body under nearest heading", () => {
    const tokens = parseHtmlOutlineTokens(`
      <h1>标题</h1>
      <h2>标题2</h2>
      <p>标题2 内容</p>
      <h2>标题3</h2>
      <p>标题3 内容</p>
    `)

    expect(tokens).toEqual([
      { kind: "heading", level: 1, text: "标题" },
      { kind: "heading", level: 2, text: "标题2" },
      { kind: "content", html: expect.stringContaining("标题2 内容") },
      { kind: "heading", level: 2, text: "标题3" },
      { kind: "content", html: expect.stringContaining("标题3 内容") }
    ])
  })

  it("keeps content between sibling headings separate", () => {
    const tokens = parseHtmlOutlineTokens(
      "<h2>A</h2><p>a1</p><h2>B</h2><p>b1</p>"
    )
    expect(tokens.map((t) => t.kind)).toEqual([
      "heading",
      "content",
      "heading",
      "content"
    ])
    expect(tokens[1]).toMatchObject({ kind: "content" })
    expect((tokens[1] as { html: string }).html).toContain("a1")
    expect((tokens[1] as { html: string }).html).not.toContain("b1")
  })

  it("supports level jumps without synthesizing intermediate headings", () => {
    const tokens = parseHtmlOutlineTokens(
      "<h1>Root</h1><h3>Jumped</h3><p>under h3</p><h2>Mid</h2><p>under h2</p>"
    )
    expect(tokens).toEqual([
      { kind: "heading", level: 1, text: "Root" },
      { kind: "heading", level: 3, text: "Jumped" },
      { kind: "content", html: expect.stringContaining("under h3") },
      { kind: "heading", level: 2, text: "Mid" },
      { kind: "content", html: expect.stringContaining("under h2") }
    ])
  })

  it("unwraps layout containers so headings stay first-class tokens", () => {
    const tokens = parseHtmlOutlineTokens(`
      <div class="conetnt_box">
        <section>
          <h2>Nested</h2>
          <div><p>Body</p></div>
        </section>
      </div>
    `)
    expect(tokens[0]).toEqual({ kind: "heading", level: 2, text: "Nested" })
    expect(tokens[1].kind).toBe("content")
    expect((tokens[1] as { html: string }).html).toContain("Body")
    expect((tokens[1] as { html: string }).html).not.toContain("conetnt_box")
  })
})

describe("blank block cleanup", () => {
  it("drops consecutive empty p, br, NBSP and empty divs between real paragraphs", () => {
    const tokens = parseHtmlOutlineTokens(`
      <p>first</p>
      <p></p>
      <p> </p>
      <p>&nbsp;</p>
      <p><br/></p>
      <p><br><br/></p>
      <div> </div>
      <div><br/></div>
      <p>second</p>
    `)

    expect(tokens).toHaveLength(1)
    expect(tokens[0].kind).toBe("content")
    const html = (tokens[0] as { html: string }).html
    expect(html).toContain("first")
    expect(html).toContain("second")
    // No pure empty paragraph leftovers between them
    expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/i)
    expect(html).not.toMatch(/&nbsp;/i)
  })

  it("preserves hr, images, lists and blockquotes", () => {
    const tokens = parseHtmlOutlineTokens(`
      <p>before</p>
      <hr/>
      <p><img src="a.png" alt="pic"/></p>
      <ul><li>item</li></ul>
      <blockquote><p>quote</p></blockquote>
      <p></p>
      <p>after</p>
    `)

    expect(tokens).toHaveLength(1)
    const html = (tokens[0] as { html: string }).html
    expect(html).toMatch(/<hr\b/i)
    expect(html).toContain("a.png")
    expect(html).toContain("<ul>")
    expect(html).toContain("item")
    expect(html).toContain("<blockquote>")
    expect(html).toContain("quote")
    expect(html).toContain("before")
    expect(html).toContain("after")
  })

  it("preserves meaningful line breaks and inline wrappers", () => {
    const tokens = parseHtmlOutlineTokens(
      'top line<br/>next line<p>first line<br/><br/>second line</p><span id="marker">inline</span><figure><img src="figure.png"/><figcaption>caption</figcaption></figure>'
    )

    expect(tokens).toHaveLength(1)
    const html = (tokens[0] as { html: string }).html
    expect(html).toMatch(/top line<br\s*\/?>next line/i)
    expect(html).toMatch(/first line<br\s*\/?><br\s*\/?>second line/i)
    expect(html).toContain('<span id="marker">inline</span>')
    expect(html).toContain("<figure>")
    expect(html).toContain("<figcaption>caption</figcaption>")
  })

  it("does not drop paragraphs that only look empty but have footnote marks", () => {
    const tokens = parseHtmlOutlineTokens(
      '<p>text<sup>1</sup></p><p><a id="fn1">1</a> note</p>'
    )
    expect(tokens).toHaveLength(1)
    const html = (tokens[0] as { html: string }).html
    expect(html).toContain("sup")
    expect(html).toContain("note")
  })

  it("stripBlankHtml collapses layout empties without removing hr", () => {
    const cleaned = stripBlankHtml(
      '<p>a</p><p>&nbsp;</p><hr/><p><br/></p><p>b</p>'
    )
    expect(cleaned).toContain("a")
    expect(cleaned).toContain("b")
    expect(cleaned).toMatch(/<hr\b/i)
    expect(cleaned).not.toMatch(/&nbsp;/i)
  })

  it("drops standalone layout breaks between block elements", () => {
    const cleaned = stripBlankHtml("<p>a</p><br/><br/><p>b</p>")
    expect(cleaned).toBe("<p>a</p><p>b</p>")
  })

  it("isBlankElement classifies padding vs media", () => {
    const doc = document.implementation.createHTMLDocument("")
    const emptyP = doc.createElement("p")
    emptyP.innerHTML = "&nbsp;<br/>"
    expect(isBlankElement(emptyP)).toBe(true)

    const withImg = doc.createElement("p")
    withImg.innerHTML = '<img src="x.png" alt=""/>'
    expect(isBlankElement(withImg)).toBe(false)

    const hr = doc.createElement("hr")
    expect(isBlankElement(hr)).toBe(false)
  })
})
