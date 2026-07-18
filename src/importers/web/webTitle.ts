/**
 * Web-only title equivalence and leading-h1 dedupe against site-suffixed metadata titles.
 */

import { titlesEquivalent } from "../epub/epubHtml"

export interface TitleDedupeContext {
  pageTitle: string
  siteName?: string
  hostname?: string
}

/**
 * Remove a leading article h1 when it matches the page title after stripping
 * trusted site suffixes (` - Wikipedia`, ` | MDN`, hostname, siteName).
 * Does not remove legitimate first section headings that are not the article title.
 */
export function removeMatchingTopHeadingWeb(
  root: ParentNode,
  ctx: TitleDedupeContext
): void {
  const pageTitle = normalizeTitle(ctx.pageTitle)
  if (!pageTitle) return

  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))
  if (headings.length === 0) return
  const first = headings[0]
  if (first.tagName.toUpperCase() !== "H1") return

  const h1Text = normalizeTitle(first.textContent ?? "")
  if (!h1Text) return

  if (titlesEquivalent(h1Text, pageTitle)) {
    first.remove()
    return
  }

  if (webTitlesEquivalent(h1Text, pageTitle, ctx)) {
    first.remove()
  }
}

/**
 * True when h1 is the article title and pageTitle only adds a trusted site/brand suffix.
 */
export function webTitlesEquivalent(
  headingText: string,
  pageTitle: string,
  ctx: TitleDedupeContext
): boolean {
  const h = normalizeTitle(headingText)
  const p = normalizeTitle(pageTitle)
  if (!h || !p) return false
  if (titlesEquivalent(h, p)) return true

  const stripped = stripTrustedSiteSuffix(p, ctx)
  if (stripped && titlesEquivalent(h, stripped)) return true

  // Heading is a prefix of page title with a trusted site-like suffix remaining
  if (p.toLowerCase().startsWith(h.toLowerCase())) {
    const rest = p.slice(h.length).trim()
    if (isTrustedSiteSuffix(rest, ctx)) return true
  }

  return false
}

/**
 * Peel trusted site/brand suffixes from a browser tab title.
 * Only peels intermediate category pieces AFTER a trusted terminal brand matched.
 * Without a trusted suffix, returns the title unchanged (no blind " - Part 2" peel).
 */
export function stripTrustedSiteSuffix(
  pageTitle: string,
  ctx: TitleDedupeContext
): string {
  const t = normalizeTitle(pageTitle)
  if (!t) return t

  const seps = [" | ", " - ", " — ", " – ", " · ", " • "] as const

  // Find last separator segment; require trusted terminal brand
  for (const sep of seps) {
    const idx = t.lastIndexOf(sep)
    if (idx <= 0) continue
    const left = t.slice(0, idx).trim()
    const right = t.slice(idx + sep.length).trim()
    if (!left || !right) continue

    if (isTrustedBrandToken(right, ctx)) {
      // After trusted brand peel, may peel one intermediate product/category
      // e.g. "Introduction - JavaScript | MDN" → "Introduction - JavaScript" → "Introduction"
      // only when the intermediate is short and non-prose, not "Part 2" alone without brand.
      const mid = peelOneShortCategory(left)
      return mid ?? left
    }

    // Multi-token right side ending in brand: "JavaScript | MDN" as full rest after first peel attempt
    if (right.includes("|") || / - /.test(right)) {
      const parts = right.split(/\s*[|]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean)
      const last = parts[parts.length - 1] ?? ""
      if (isTrustedBrandToken(last, ctx)) {
        return left
      }
    }
  }

  // Direct siteName / hostname at end after separator
  for (const sep of seps) {
    const idx = t.lastIndexOf(sep)
    if (idx <= 0) continue
    const left = t.slice(0, idx).trim()
    const right = t.slice(idx + sep.length).trim()
    if (left && right && matchesSiteIdentity(right, ctx)) {
      const mid = peelOneShortCategory(left)
      return mid ?? left
    }
  }

  return t
}

/**
 * Peel one intermediate short category only when the outer title already had a trusted brand
 * removed by the caller (left still contains "Title - Category").
 * Refuses Part/Chapter numbering patterns.
 */
function peelOneShortCategory(title: string): string | null {
  for (const sep of [" | ", " - ", " — ", " – "]) {
    const idx = title.lastIndexOf(sep)
    if (idx <= 0) continue
    const left = title.slice(0, idx).trim()
    const right = title.slice(idx + sep.length).trim()
    if (!left || !right) continue
    // Do not peel "Part 2", "Chapter One", etc.
    if (/^(part|chapter|section|volume|book)\b/i.test(right)) return null
    if (/^\d+$/.test(right)) return null
    // Intermediate product/category: short, not prose
    if (right.length <= 40 && !/\s{2,}/.test(right) && right.split(/\s+/).length <= 4) {
      return left
    }
  }
  return null
}

function isTrustedSiteSuffix(rest: string, ctx: TitleDedupeContext): boolean {
  const body = rest.replace(/^[\s|\-—–·•]+/, "").trim()
  if (!body || body.length > 64) return false
  if (isTrustedBrandToken(body, ctx)) return true
  // "JavaScript | MDN" style remainder
  if (body.includes("|") || / - /.test(body)) {
    const last = body.split(/\s*[|]\s*|\s+-\s+/).pop()?.trim() ?? ""
    if (isTrustedBrandToken(last, ctx)) return true
  }
  return matchesSiteIdentity(body, ctx)
}

function isTrustedBrandToken(token: string, ctx: TitleDedupeContext): boolean {
  const body = token.trim()
  if (!body || body.length > 48) return false
  if (matchesSiteIdentity(body, ctx)) return true
  // Conservative known brands / product doc titles (terminal only)
  if (
    /^(wikipedia|mdn|mdn web docs|github|github docs|mozilla|openai|openai api|nasa|medium|substack)$/i.test(
      body
    )
  ) {
    return true
  }
  return false
}

function matchesSiteIdentity(token: string, ctx: TitleDedupeContext): boolean {
  const b = token.trim().toLowerCase()
  if (!b) return false
  if (ctx.siteName) {
    const site = ctx.siteName.trim().toLowerCase()
    if (site && (b === site || site.includes(b) || b.includes(site))) {
      // Avoid weak short matches like "a" / "to"
      if (b.length >= 3) return true
    }
  }
  if (ctx.hostname) {
    const host = ctx.hostname.replace(/^www\./i, "").toLowerCase()
    if (b === host || b === ctx.hostname.toLowerCase()) return true
    const firstLabel = host.split(".")[0] ?? ""
    // e.g. "nasa" from science.nasa.gov only when token is that label
    if (firstLabel.length >= 3 && b === firstLabel) return true
  }
  return false
}

function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
