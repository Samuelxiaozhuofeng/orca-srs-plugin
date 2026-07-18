/**
 * Web Import extraction / chrome-strip / title-dedupe regression tests.
 * Compact offline fixtures (not full Firecrawl payloads).
 */

import { beforeAll, describe, expect, it } from "vitest"
import { ensureTestDom } from "../epub/testDom"
import {
  prepareWebArticleHtml,
  diagnoseContentQuality,
  maxAtomicBlockPlainText,
  plainTextLength
} from "./webHtml"
import { extractMainContent, stripStructuralChrome } from "./webContentExtract"
import { webTitlesEquivalent, stripTrustedSiteSuffix } from "./webTitle"
import { parseHtml } from "../epub/epubHtml"

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
// Title equivalence (conservative)
// ---------------------------------------------------------------------------

describe("webTitlesEquivalent / stripTrustedSiteSuffix", () => {
  it("matches heading vs metadata titles with trusted site suffixes", () => {
    expect(
      webTitlesEquivalent("Introduction", "Introduction - JavaScript | MDN", {
        pageTitle: "Introduction - JavaScript | MDN",
        siteName: "MDN",
        hostname: "developer.mozilla.org"
      })
    ).toBe(true)

    expect(
      webTitlesEquivalent("Spaced repetition", "Spaced repetition - Wikipedia", {
        pageTitle: "Spaced repetition - Wikipedia",
        siteName: "Wikipedia",
        hostname: "en.wikipedia.org"
      })
    ).toBe(true)

    expect(
      webTitlesEquivalent("Hello World", "Hello World - GitHub Docs", {
        pageTitle: "Hello World - GitHub Docs",
        siteName: "GitHub Docs",
        hostname: "docs.github.com"
      })
    ).toBe(true)
  })

  it("does not peel untrusted Part/Chapter suffixes", () => {
    expect(
      webTitlesEquivalent("Guide", "Guide - Part 2", {
        pageTitle: "Guide - Part 2"
      })
    ).toBe(false)

    expect(
      webTitlesEquivalent("Chapter", "Chapter - Part One", {
        pageTitle: "Chapter - Part One"
      })
    ).toBe(false)

    expect(stripTrustedSiteSuffix("Guide - Part 2", { pageTitle: "Guide - Part 2" })).toBe(
      "Guide - Part 2"
    )
    expect(
      stripTrustedSiteSuffix("Chapter - Part One", { pageTitle: "Chapter - Part One" })
    ).toBe("Chapter - Part One")
  })

  it("does not strip leading Guide heading for untrusted Part 2 suffix", () => {
    const html = `
<main>
  <h1>Guide</h1>
  <p>KEEP_BODY Detailed explanation of part two with enough text for extraction quality checks.</p>
  <p>Second paragraph keeps the article body long enough for stable extraction.</p>
</main>`
    const result = prepare(html, "https://example.com/guide-part-2", "Guide - Part 2")
    // Readability may demote h1→h2; the heading text must remain (not title-deduped away)
    expect(result.html).toMatch(/<h[12][^>]*>\s*Guide\s*<\/h[12]>/i)
    expect(result.html).toContain("KEEP_BODY")
  })
})

// ---------------------------------------------------------------------------
// Article-internal header/aside preserved
// ---------------------------------------------------------------------------

describe("article-internal header and aside", () => {
  it("keeps article header h1/dek and callout aside; drops outer site chrome", () => {
    const html = `
<div>
  <header class="site-header" role="banner"><nav>Site Menu KILL_SITE</nav></header>
  <article>
    <header>
      <h1>Black Hole Basics</h1>
      <p class="dek">KEEP_DEK A short deck under the title.</p>
    </header>
    <p>KEEP_BODY Black holes are regions of spacetime with extreme gravity and dense mass.</p>
    <aside class="callout note">
      <p>KEEP_CALLOUT Important note about event horizons for readers.</p>
    </aside>
    <p>More KEEP_MORE prose about accretion disks and jets continues here for length.</p>
  </article>
  <footer class="site-footer" role="contentinfo">© Site KILL_FOOTER</footer>
</div>`
    const result = prepare(
      html,
      "https://science.example.com/black-holes",
      "Black Hole Basics - Example",
      { siteName: "Example", hostname: "science.example.com" }
    )
    expect(result.html).toContain("KEEP_BODY")
    expect(result.html).toContain("KEEP_DEK")
    expect(result.html).toContain("KEEP_CALLOUT")
    expect(result.html).not.toContain("KILL_SITE")
    expect(result.html).not.toContain("KILL_FOOTER")
  })
})

// ---------------------------------------------------------------------------
// NASA-shaped fixture
// ---------------------------------------------------------------------------

const FIXTURE_NASA_SHAPE = `
<div class="wp-singular">
  <div class="hds-search-panel-mobile">
    <div class="hds-search-panel-suggestions">
      <p>Suggested Searches</p>
      <ul class="hds-search-suggestions">
        <li class="hds-search-suggestion">Climate Change</li>
        <li>View All Topics A-Z</li>
      </ul>
    </div>
  </div>
  <div id="global-navigation" class="usa-nav__submenu usa-megamenu">
    <ul class="hds-global-menu-primary">
      <li class="hds-global-menu-item">Home</li>
      <li class="hds-global-menu-item">Missions</li>
      <li>News &amp; Events</li>
    </ul>
    <a class="hds-content-card">NASA Study Finds Asteroid</a>
  </div>
  <article class="topic type-topic" id="post-50452">
    <header>
      <h1>Black Hole Basics</h1>
    </header>
    <p>KEEP_BODY Black holes are among the most fascinating objects in space and extreme gravity wells.</p>
    <p>KEEP_PROSE Matter can fall into a black hole and form an accretion disk that emits X-rays.</p>
    <h2>How they form</h2>
    <p>KEEP_FORM Massive stars collapse when nuclear fuel is exhausted in the core.</p>
    <ul>
      <li>KEEP_LIST Stellar-mass black holes</li>
      <li>KEEP_LIST Supermassive black holes</li>
      <li>KEEP_LIST Intermediate candidates</li>
    </ul>
    <h2>Observation</h2>
    <p>KEEP_OBS Telescopes study jets, shadows, and gravitational waves from mergers.</p>
  </article>
  <section class="latest-news">
    <h2>Latest news</h2>
    <p>KILL_NEWS Unrelated balloon mission press release</p>
  </section>
  <aside class="related-topics">
    <h2>Related topics</h2>
    <a class="hds-content-card topic-card">KILL_TOPIC Galaxy clusters</a>
  </aside>
  <div class="keep-exploring">
    <h2>Keep Exploring</h2>
    <p>Discover More Topics From NASA</p>
  </div>
</div>
`.trim()

describe("NASA-shaped extraction", () => {
  it("prefers readability and drops search/menu/news/discover rails", () => {
    const result = prepare(
      FIXTURE_NASA_SHAPE,
      "https://science.nasa.gov/universe/black-holes/",
      "Black Holes - NASA Science",
      { siteName: "NASA", hostname: "science.nasa.gov" }
    )

    expect(result.extractionMethod).toBe("readability")
    expect(result.html).toContain("KEEP_BODY")
    expect(result.html).toContain("KEEP_LIST")
    expect(result.html).toContain("KEEP_FORM")
    expect(result.html).not.toMatch(/Suggested Searches/i)
    expect(result.html).not.toMatch(/Discover More Topics From NASA/i)
    expect(result.html).not.toContain("KILL_NEWS")
    expect(result.html).not.toContain("KILL_TOPIC")
    expect(result.html).not.toMatch(/View All Topics A-Z/i)
  })
})

// ---------------------------------------------------------------------------
// MDN chrome (smoke)
// ---------------------------------------------------------------------------

describe("MDN-style chrome extraction", () => {
  it("strips chrome and dedupes titled h1", () => {
    const html = `
<article>
  <a class="skip-link" href="#content">Skip to main content</a>
  <header class="page-header" role="banner"><nav>MDN Home</nav></header>
  <aside class="sidebar"><h2>Related topics</h2><ul><li>KILL_SIDEBAR</li></ul></aside>
  <main id="content">
    <h1>Introduction</h1>
    <p>KEEP_BODY JavaScript is a multi-paradigm language used for interactive pages.</p>
    <h2>First concepts</h2>
    <p>KEEP_SECTION Values, types, and operators form the foundation of programs.</p>
  </main>
  <footer role="contentinfo">KILL_FOOTER</footer>
</article>`
    const result = prepare(
      html,
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction",
      "Introduction - JavaScript | MDN",
      { siteName: "MDN", hostname: "developer.mozilla.org" }
    )
    expect(result.html).toContain("KEEP_BODY")
    expect(result.html).not.toContain("KILL_SIDEBAR")
    expect(result.html).not.toContain("KILL_FOOTER")
    expect(result.html).not.toMatch(/<h1[^>]*>\s*Introduction\s*<\/h1>/i)
  })
})

// ---------------------------------------------------------------------------
// Diagnostics: no false huge_single_chunk
// ---------------------------------------------------------------------------

describe("diagnoseContentQuality atomic blocks", () => {
  it("does not warn huge_single_chunk for many paragraphs", () => {
    const paras = Array.from({ length: 40 }, (_, i) =>
      `<p>Paragraph ${i} with enough characters to look like real essay content about startups and ideas.</p>`
    ).join("")
    const warnings = diagnoseContentQuality(`<div>${paras}</div>`, 4000)
    expect(warnings.some((w) => w.code === "huge_single_chunk")).toBe(false)
  })

  it("warns for true unstructured 12k+ blob", () => {
    const blob = "Word ".repeat(3_000)
    const html = `<div>${blob}</div>`
    const len = plainTextLength(html)
    expect(len).toBeGreaterThan(12_000)
    const doc = parseHtml(`<div id="r">${html}</div>`)
    const root = doc.getElementById("r")!
    expect(maxAtomicBlockPlainText(root)).toBeGreaterThan(12_000)
    const warnings = diagnoseContentQuality(html, len)
    expect(warnings.some((w) => w.code === "huge_single_chunk")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// extractMainContent unit
// ---------------------------------------------------------------------------

describe("extractMainContent", () => {
  it("returns readability or structural with article text", () => {
    const html = `
      <html><body>
        <nav>Home About</nav>
        <article>
          <h1>Real Article Title About Testing Extraction Paths</h1>
          <p>${"Word ".repeat(80)}KEEP_ARTICLE end.</p>
          <p>${"More ".repeat(40)}content continues here for length and coherence.</p>
          <p>Third paragraph keeps structure rich enough for the extractor.</p>
          <p>Fourth paragraph ensures coherent article thresholds are met.</p>
        </article>
        <footer>© site</footer>
      </body></html>
    `
    const result = extractMainContent(html, "https://example.com/a")
    expect(result.textLength).toBeGreaterThan(50)
    expect(result.html).toContain("KEEP_ARTICLE")
    expect(["readability", "structural", "raw_fallback"]).toContain(result.method)
  })

  it("stripStructuralChrome keeps article header when not chrome-tagged", () => {
    const { html } = stripStructuralChrome(
      `<article><header><h1>Title</h1><p>Dek text here</p></header><p>Body</p></article>
       <header class="site-header" role="banner">KILL</header>`,
      "https://ex.com"
    )
    expect(html).toContain("Title")
    expect(html).toContain("Dek text")
    expect(html).not.toContain("KILL")
  })

  it("keeps a legitimate related-topics heading in the middle of an article", () => {
    const { html } = stripStructuralChrome(
      `<article>
        <p>${"Opening context ".repeat(20)}</p>
        <h2>Related topics in cognitive science</h2>
        <p>KEEP_RELATED This section compares memory, attention, and learning.</p>
        <p>${"Closing analysis ".repeat(20)}</p>
      </article>`,
      "https://example.com/cognition"
    )
    expect(html).toContain("Related topics in cognitive science")
    expect(html).toContain("KEEP_RELATED")
  })
})
