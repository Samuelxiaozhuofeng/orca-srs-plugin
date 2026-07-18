/**
 * Web-only structural chrome stripping (site nav/search/related rails).
 * Preserves article-internal header/footer/aside unless explicitly chrome-tagged.
 */

import { parseHtml } from "../epub/epubHtml"

/**
 * Remove high-confidence chrome that survives Firecrawl onlyMainContent.
 * Preserves header/footer/aside inside article/main unless explicitly chrome-tagged.
 */
export function stripStructuralChrome(
  html: string,
  pageUrl: string
): { html: string; warnings: string[] } {
  const warnings: string[] = []
  const doc = parseHtmlWithBase(html, pageUrl)
  const root = doc.body ?? doc.documentElement
  if (!root) {
    return { html, warnings: ["无法解析 HTML body"] }
  }

  let removed = 0
  const MAX_REMOVALS = 400
  const rootTextLen = Math.max(1, normalizeSpace(root.textContent ?? "").length)

  const selector = [
    "nav",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    "[role='search']",
    "[role='complementary']",
    "[aria-label='Skip to main content']",
    "[aria-label='Skip to content']",
    // Site-level landmarks only when NOT nested in article content (filtered in loop)
    "header",
    "footer",
    "aside",
    // Known chrome class/id patterns
    ".navbox",
    ".vertical-navbox",
    ".sistersitebox",
    ".sidebar",
    ".side-bar",
    ".toc",
    "#toc",
    ".table-of-contents",
    ".mw-jump-link",
    ".vector-header",
    ".vector-footer",
    ".catlinks",
    ".noprint",
    ".breadcrumb",
    ".breadcrumbs",
    ".skip-link",
    ".skip-links",
    ".skiplink",
    ".site-nav",
    ".site-header",
    ".site-footer",
    ".global-nav",
    ".global-header",
    ".global-navigation",
    "#global-navigation",
    ".related-topics",
    ".related-content",
    ".related-articles",
    ".suggested-searches",
    ".newsletter",
    ".subscribe",
    ".share-buttons",
    ".social-share",
    ".feedback",
    ".article-footer",
    ".article-footer-feedback",
    ".page-footer",
    ".page-header",
    ".prev-next",
    ".pagination",
    ".doc-sidebar",
    ".docs-sidebar",
    ".sidebar-nav",
    ".usa-nav-container",
    ".usa-nav",
    ".usa-megamenu",
    ".latest-news",
    ".navbox-styles",
    // NASA HDS / topic cards / search panels (generic class prefixes)
    "[class*='hds-search']",
    "[class*='hds-global-menu']",
    "[class*='global-nav']",
    "[class*='suggested-search']",
    "[class*='topic-card']",
    "[class*='hds-content-card']",
    "[class*='secondary-navigation']",
    "[class*='keep-exploring']",
    "[class*='discover-more']",
    "#sidebar",
    "#footer",
    "#header",
    "#nav",
    "#navigation",
    "#mw-navigation",
    "#mw-panel",
    "#siteNotice",
    "#p-lang",
    "#catlinks",
    ".mw-editsection"
  ].join(",")

  const candidates = Array.from(root.querySelectorAll(selector))

  for (const el of candidates) {
    if (removed >= MAX_REMOVALS) break
    if (el.matches("article, main, [role='main']")) continue
    if (!el.isConnected) continue
    if (isLikelyMainContentHost(el)) continue

    const tag = el.tagName.toUpperCase()
    // Preserve article-internal header/footer/aside unless explicitly chrome-tagged
    if (
      (tag === "HEADER" || tag === "FOOTER" || tag === "ASIDE")
      && isInsideContentHost(el)
      && !hasExplicitChromeCue(el)
    ) {
      continue
    }

    // complementary role inside article without chrome cue → keep (callouts)
    const role = (el.getAttribute("role") ?? "").toLowerCase()
    if (
      role === "complementary"
      && isInsideContentHost(el)
      && !hasExplicitChromeCue(el)
    ) {
      continue
    }

    const elTextLen = normalizeSpace(el.textContent ?? "").length
    if (elTextLen >= rootTextLen * 0.45 && elTextLen >= 120) continue

    el.remove()
    removed++
  }

  // Phrase-based trailing/leading chrome blocks (Keep Exploring, Discover More Topics)
  removed += removeChromeByHeadingPhrases(root, MAX_REMOVALS - removed)

  removed += removeSkipAndChromeLinks(root, MAX_REMOVALS - removed)

  if (removed > 0) {
    warnings.push(`已移除 ${removed} 处导航/页眉页脚等外围区块`)
  }

  return { html: root.innerHTML, warnings }
}

function isInsideContentHost(el: Element): boolean {
  return Boolean(
    el.closest("article, main, [role='main'], .article-body, .post-content, .entry-content, .markdown-body, .prose")
  )
}

export function hasExplicitChromeCue(el: Element): boolean {
  const id = (el.getAttribute("id") ?? "").toLowerCase()
  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  const role = (el.getAttribute("role") ?? "").toLowerCase()
  if (role === "navigation" || role === "banner" || role === "contentinfo" || role === "search") {
    return true
  }
  if (
    /\b(site-|global-|page-|navbox|sidebar|breadcrumb|footer-nav|header-nav|suggested|related-topic|latest-news|megamenu|hds-search|hds-global|topic-card|content-card)\b/.test(
      `${id} ${cls}`
    )
  ) {
    return true
  }
  if (/^(footer|header|sidebar|nav|navigation|toc)$/i.test(id)) return true
  return false
}

function isLikelyMainContentHost(el: Element): boolean {
  const tag = el.tagName.toUpperCase()
  if (tag === "ARTICLE" || tag === "MAIN") return true
  const role = (el.getAttribute("role") ?? "").toLowerCase()
  if (role === "main") return true
  const id = (el.getAttribute("id") ?? "").toLowerCase()
  if (id === "content" || id === "main-content" || id === "main" || id === "article") {
    return true
  }
  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  if (/\b(article-body|post-content|entry-content|markdown-body|prose)\b/.test(cls)) {
    return true
  }
  return false
}

const CHROME_HEADING_PHRASES = [
  "suggested searches",
  "discover more topics",
  "keep exploring",
  "related topics",
  "latest news",
  "people also searched",
  "you may also like",
  "more from"
]

function removeChromeByHeadingPhrases(root: Element, budget: number): number {
  if (budget <= 0) return 0
  let removed = 0
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6, p, div"))
  for (const el of headings) {
    if (removed >= budget) break
    if (!el.isConnected) continue
    const text = normalizeSpace(el.textContent ?? "").toLowerCase()
    if (text.length > 80) continue
    const matched = CHROME_HEADING_PHRASES.some(
      (p) => text === p || text.startsWith(p) || text.includes(p)
    )
    if (!matched) continue
    if (!hasChromeCueNearby(el, root) && !isNearDocumentEdge(el, root)) {
      continue
    }
    // Remove the section host: prefer parent that looks like a rail, else self
    let target: Element = el
    const parent = el.parentElement
    if (
      parent
      && parent !== root
      && !isLikelyMainContentHost(parent)
      && !parent.matches("article, main")
    ) {
      const pText = normalizeSpace(parent.textContent ?? "").length
      const rootText = Math.max(1, normalizeSpace(root.textContent ?? "").length)
      // Only lift to parent if it is a small chrome section
      if (pText < rootText * 0.25) {
        target = parent
      }
    }
    if (isInsideContentHost(target) && target.matches("p, h1, h2, h3, h4, h5, h6")) {
      // Remove just the chrome heading/paragraph inside article when it is a trailing related block
      // Prefer removing the parent section if it follows the main prose
      if (parent && parent !== root && !isLikelyMainContentHost(parent)) {
        const siblings = parent.parentElement
        if (siblings && parent === siblings.lastElementChild) {
          target = parent
        }
      }
    }
    if (isLikelyMainContentHost(target)) continue
    target.remove()
    removed++
  }
  return removed
}

function hasChromeCueNearby(el: Element, root: Element): boolean {
  let current: Element | null = el
  for (let depth = 0; current && current !== root && depth < 4; depth++) {
    if (hasExplicitChromeCue(current)) return true
    current = current.parentElement
  }
  return false
}

function isNearDocumentEdge(el: Element, root: Element): boolean {
  const rootText = normalizeSpace(root.textContent ?? "")
  const elText = normalizeSpace(el.textContent ?? "")
  if (!rootText || !elText) return false
  const index = rootText.indexOf(elText)
  if (index < 0) return false
  const end = index + elText.length
  return index <= rootText.length * 0.08 || end >= rootText.length * 0.8
}

function removeSkipAndChromeLinks(root: Element, budget: number): number {
  if (budget <= 0) return 0
  let removed = 0
  const anchors = Array.from(root.querySelectorAll("a"))
  for (const a of anchors) {
    if (removed >= budget) break
    const text = normalizeSpace(a.textContent ?? "").toLowerCase()
    const href = (a.getAttribute("href") ?? "").trim().toLowerCase()
    const isSkip =
      text.startsWith("skip to")
      || text === "skip link"
      || text === "skip navigation"
      || text === "skip to main content"
      || text === "skip to content"
    const isHashOnly = href === "#" || href.startsWith("#")
    if (isSkip && (isHashOnly || href.length < 2)) {
      const parent = a.parentElement
      a.remove()
      removed++
      if (
        parent
        && parent !== root
        && !parent.querySelector("p, h1, h2, h3, h4, h5, h6, pre, table, img, li")
        && normalizeSpace(parent.textContent ?? "").length < 40
      ) {
        parent.remove()
      }
    }
  }
  return removed
}

export function parseHtmlWithBase(html: string, pageUrl: string): Document {
  const doc = parseHtml(html)
  try {
    if (pageUrl && doc.head) {
      const existing = doc.querySelector("base")
      if (!existing) {
        const base = doc.createElement("base")
        base.setAttribute("href", pageUrl)
        doc.head.prepend(base)
      }
    }
  } catch {
    // base is best-effort
  }
  return doc
}

export function measurePlainText(html: string): number {
  if (!html.trim()) return 0
  try {
    const doc = parseHtml(`<div id="__m">${html}</div>`)
    const el = doc.getElementById("__m") ?? doc.body
    const text = el?.textContent ?? ""
    return normalizeSpace(text).length
  } catch {
    return normalizeSpace(html.replace(/<[^>]+>/g, " ")).length
  }
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
