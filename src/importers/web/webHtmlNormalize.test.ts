/**
 * Web Import normalize: code, links, legacy layout, security sanitize.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { ensureTestDom } from "../epub/testDom"
import { parseHtml, getHtmlContentRoot, sanitizeHtmlForOrca } from "../epub/epubHtml"
import { parseHtmlOutlineTokens } from "../epub/htmlOutline"
import {
  prepareWebArticleHtml,
  sanitizeWebHtml,
  plainTextLength,
  buildExcerpt
} from "./webHtml"
import {
  normalizeCodeBlocks,
  normalizeWebArticleHtml,
  rewriteLinksForSafeDisplay,
  isCitationLikeLabel
} from "./webHtmlNormalize"

beforeAll(() => {
  ensureTestDom()
})

function prepare(
  html: string,
  baseUrl: string,
  pageTitle: string,
  extra?: { siteName?: string; hostname?: string }
) {
  return prepareWebArticleHtml({
    html,
    baseUrl,
    pageTitle,
    siteName: extra?.siteName,
    hostname: extra?.hostname
  })
}

// ---------------------------------------------------------------------------
// Code + mailto
// ---------------------------------------------------------------------------

describe("code gutters and mailto", () => {
  it("normalizes code and drops mailto without reintroducing anchors", () => {
    const html = `
<article>
  <h1>Beta</h1>
  <p>Use the <a href="mailto:client.beta">client.beta</a> namespace.</p>
  <p>Also see <a href="mailto:openai.chat.completions">openai.chat.completions</a>.</p>
  <p>Real contact: <a href="mailto:support@example.com">support@example.com</a>.</p>
  <p>Docs: <a href="https://docs.external.example/openai">API docs</a>.</p>
  <div class="code-block">
    <button type="button">Copy</button>
    <pre class="with-line-numbers"><code>
<span class="line"><span class="line-number" aria-hidden="true">1</span><span class="line-content">import OpenAI from "openai";</span></span>
<span class="line"><span class="line-number">2</span><span class="line-content">const client = new OpenAI();</span></span>
<span class="line"><span class="line-number">3</span><span class="line-content">const out = await client.beta.threads.create();</span></span>
    </code></pre>
  </div>
  <p>KEEP_AFTER_CODE Done with enough surrounding text for extraction.</p>
  <p>Second paragraph ensures coherent article structure for the pipeline.</p>
</article>`
    const result = prepare(
      html,
      "https://platform.openai.com/docs/api-reference/beta",
      "Beta - OpenAI API",
      { siteName: "OpenAI API", hostname: "platform.openai.com" }
    )
    const out = result.html
    expect(out.toLowerCase()).not.toContain("<a ")
    expect(out.toLowerCase()).not.toContain("href=")
    expect(out.toLowerCase()).not.toContain("mailto:")
    expect(out).toContain("client.beta")
    expect(out).toContain("openai.chat.completions")
    expect(out).toContain('import OpenAI from "openai"')
    // cross-origin decoration (same-origin would be label-only)
    expect(out).toMatch(/API docs\s*\(\s*https:\/\/docs\.external\.example\/openai\s*\)/i)
  })
})

// ---------------------------------------------------------------------------
// Links: cross-origin only, citations, cap
// ---------------------------------------------------------------------------

describe("safe link rewriting", () => {
  it("decorates cross-origin descriptive links; same-origin label only", () => {
    const html = `
<article>
  <p>See the <a href="https://other.example.org/docs/a">official docs</a> for details.</p>
  <p>Same origin: <a href="/local/path">local path</a>.</p>
  <p>Hash only: <a href="#section">jump</a>.</p>
  <p>JS: <a href="javascript:alert(1)">xss</a>.</p>
  <p>Cite <a href="https://en.wikipedia.org/wiki/X">[12]</a> and <a href="https://en.wikipedia.org/wiki/Y">1</a>.</p>
  <p>KEEP_PLAIN plain text stays.</p>
</article>`
    const result = prepare(html, "https://example.com/page", "Docs")
    const out = result.html
    expect(out.toLowerCase()).not.toContain("<a ")
    expect(out).toMatch(/official docs\s*\(\s*https:\/\/other\.example\.org\/docs\/a\s*\)/i)
    // same-origin: no URL decoration
    expect(out).toContain("local path")
    expect(out).not.toMatch(/local path\s*\(\s*https:\/\//i)
    expect(out).toContain("jump")
    expect(out).not.toMatch(/jump\s*\(/)
    expect(out).toContain("[12]")
    expect(out).not.toMatch(/\[12\]\s*\(\s*https:\/\//)
    expect(out).toContain("KEEP_PLAIN")
  })

  it("bounds URL decorations on Wikipedia-like many-link pages", () => {
    const cites = Array.from({ length: 80 }, (_, i) =>
      `<p>See <a href="https://refs.example.net/r/${i}">Reference about topic ${i} with a descriptive label</a>.</p>`
    ).join("")
    const html = `<article><h1>Topic</h1><p>KEEP_INTRO Body with substantial wording for extraction to keep this article intact.</p>${cites}<p>End.</p></article>`
    const result = prepare(html, "https://en.wikipedia.org/wiki/Topic", "Topic - Wikipedia", {
      siteName: "Wikipedia",
      hostname: "en.wikipedia.org"
    })
    const urlParens = (result.html.match(/\(https?:\/\//g) ?? []).length
    expect(urlParens).toBeLessThanOrEqual(50)
    expect(result.html).toContain("KEEP_INTRO")
    // Must not balloon with hundreds of URLs
    expect(urlParens).toBeLessThan(80)
  })

  it("isCitationLikeLabel catches numeric and arrow labels", () => {
    expect(isCitationLikeLabel("1")).toBe(true)
    expect(isCitationLikeLabel("[12]")).toBe(true)
    expect(isCitationLikeLabel("↑")).toBe(true)
    expect(isCitationLikeLabel("Go")).toBe(false)
    expect(isCitationLikeLabel("official docs")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Legacy layout
// ---------------------------------------------------------------------------

describe("legacy layout", () => {
  it("unwraps layout tables and splits br/br into paragraphs", () => {
    const html = `
<table width="100%"><tr><td>
<font size="2">
Intro line not important.
<br><br>
KEEP_P1 The way to get startup ideas is not to try to think of startup ideas.
<br><br>
KEEP_P2 It's to look for problems, preferably problems you have yourself every day.
<br><br>
KEEP_P3 Don't worry about people stealing your ideas if they work they copy the company.
</font>
</td></tr></table>`
    const result = prepare(
      html,
      "http://www.paulgraham.com/start.html",
      "How to Start a Startup",
      { hostname: "paulgraham.com" }
    )
    expect(result.html).toContain("KEEP_P1")
    expect(result.html).toContain("KEEP_P2")
    expect(result.html).toContain("KEEP_P3")
    const pCount = (result.html.match(/<p[\s>]/gi) ?? []).length
    expect(pCount).toBeGreaterThanOrEqual(3)
    expect(result.warnings.some((w) => w.code === "huge_single_chunk")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Structure preservation
// ---------------------------------------------------------------------------

describe("structure preservation", () => {
  it("keeps nested lists, blockquotes, data tables, figures", () => {
    const html = `
<article>
  <h1>Guide</h1>
  <p>Intro KEEP_INTRO with substantial wording for the extractor to keep content.</p>
  <ul>
    <li>Outer A<ul><li>Nested KEEP_NEST</li></ul></li>
    <li>Outer B</li>
  </ul>
  <blockquote><p>KEEP_QUOTE memorable line</p></blockquote>
  <table>
    <tr><th>Col</th><th>Val</th></tr>
    <tr><td>KEEP_TABLE</td><td>42</td></tr>
  </table>
  <figure>
    <img src="https://cdn.example.net/a.png" alt="chart" />
    <figcaption>KEEP_FIG</figcaption>
  </figure>
  <p>Inline <code>KEEP_CODE</code> sample continues with more words for length.</p>
</article>`
    const result = prepare(html, "https://example.com/guide", "Guide")
    expect(result.html).toContain("KEEP_INTRO")
    expect(result.html).toContain("KEEP_NEST")
    expect(result.html).toContain("KEEP_QUOTE")
    expect(result.html).toContain("KEEP_TABLE")
    expect(result.html).toContain("KEEP_FIG")
    expect(result.html).toContain("KEEP_CODE")
    expect(result.html).toContain("<table")
  })
})

// ---------------------------------------------------------------------------
// Unit helpers
// ---------------------------------------------------------------------------

describe("normalize helpers", () => {
  it("normalizeCodeBlocks collapses line gutters", () => {
    const doc = parseHtml(`
      <div id="r"><pre><code>
        <span class="line"><span class="line-number">1</span><span class="line-content">const a = 1;</span></span>
        <span class="line"><span class="line-number">2</span><span class="line-content">const b = 2;</span></span>
      </code></pre></div>
    `)
    const root = doc.getElementById("r")!
    normalizeCodeBlocks(root)
    const text = root.textContent ?? ""
    expect(text).toContain("const a = 1")
    expect(text.replace(/\s+/g, " ")).not.toMatch(/\b1\s+2\s+const a/)
  })

  it("rewriteLinksForSafeDisplay is cross-origin aware", () => {
    const doc = parseHtml(`
      <div id="r">
        <a href="mailto:client.beta">client.beta</a>
        <a href="https://other.com/x">link</a>
        <a href="/same">same</a>
        <a href="#top">top</a>
      </div>
    `)
    const root = doc.getElementById("r")!
    rewriteLinksForSafeDisplay(root, "https://ex.com/page")
    expect(root.querySelector("a")).toBeNull()
    expect(root.innerHTML.toLowerCase()).not.toContain("mailto:")
    expect(root.innerHTML).toMatch(/link\s*\(\s*https:\/\/other\.com\/x\s*\)/)
    expect(root.innerHTML).not.toMatch(/same\s*\(\s*https:\/\//)
  })

  it("normalizeWebArticleHtml one pass", () => {
    const out = normalizeWebArticleHtml(
      `<div><a href="https://a.com/path">Alpha docs</a><pre><code><span class="line-number">1</span>x=1</code></pre></div>`,
      "https://example.com"
    )
    expect(out.toLowerCase()).not.toContain("<a ")
    expect(out).toMatch(/Alpha docs\s*\(\s*https:\/\/a\.com\/path\s*\)/)
    expect(out).toContain("x=1")
  })
})

describe("EPUB sanitizeHtmlForOrca contract", () => {
  it("strips anchors without appending URL text", () => {
    const doc = parseHtml('<p><a href="http://x.example/y">link</a></p>')
    const root = getHtmlContentRoot(doc, "")
    sanitizeHtmlForOrca(root as HTMLElement)
    expect(root.querySelector("a")).toBeNull()
    expect(root.querySelector("span")?.textContent).toBe("link")
    expect(root.innerHTML).not.toContain("http://x.example/y")
  })
})

describe("sanitizeWebHtml security", () => {
  it("strips scripts and dangerous urls", () => {
    const out = sanitizeWebHtml(
      `<div><script>alert(1)</script><p onclick="x">Safe</p>
       <a href="javascript:alert(1)">x</a>
       <img src="/a.png"/></div>`,
      "https://example.com/p",
      "Title"
    )
    expect(out.toLowerCase()).not.toContain("script")
    expect(out.toLowerCase()).not.toContain("javascript:")
    expect(out).toContain("https://example.com/a.png")
  })
})

describe("empty / markup-only", () => {
  it("reports zero plain text for markup-only", () => {
    expect(plainTextLength("<div><span></span></div>")).toBe(0)
    expect(buildExcerpt("<div><span></span></div>")).toBe("")
  })
})
