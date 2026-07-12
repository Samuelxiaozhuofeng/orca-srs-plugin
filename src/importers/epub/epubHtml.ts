/**
 * HTML helpers for EPUB chapter content.
 * Behavior aligned with orca-epub epub-html.ts.
 */

export function parseHtml(content: string): Document {
  const parser = new DOMParser()
  const looksLikeXhtmlDocument = /<html\b[^>]*xmlns=/i.test(content)
  if (looksLikeXhtmlDocument) {
    const xhtml = parser.parseFromString(content, "application/xhtml+xml")
    if (!xhtml.querySelector("parsererror")) return xhtml
  }
  return parser.parseFromString(content, "text/html")
}

export function getHtmlContentRoot(doc: Document, fallbackHtml: string): HTMLElement {
  const body = doc.body ?? doc.querySelector("body")
  if (body) return body as HTMLElement

  const container = doc.createElement("div")
  container.innerHTML = fallbackHtml
  return container
}

/**
 * Extract a chapter title from the first heading(s) in the content.
 * Supports consecutive "numbering + semantic title" pairs such as:
 *   <h1>1</h1><h1>WHY LOGIC?</h1>
 *   <h1>PART I</h1><h1>THE POWER OF LOGIC</h1>
 *   <h1>Chapter 1</h1><h1>Introduction</h1>
 * Does not merge later body section headings.
 */
export function extractTopHeadingTitle(root: ParentNode): string {
  const pair = findLeadingChapterHeadingPair(root)
  if (!pair) return ""
  if (pair.second) {
    return normalizeTitle(`${pair.firstText} ${pair.secondText}`)
  }
  return pair.firstText
}

/** Best-effort title for front matter that has no heading and is absent from TOC. */
export function extractDocumentFallbackTitle(
  doc: Document,
  root: ParentNode,
  identityCandidates: string[]
): string {
  const documentTitle = normalizeTitle(doc.querySelector("head > title")?.textContent ?? "")
  if (documentTitle && !isTechnicalTitle(documentTitle, identityCandidates)) {
    return documentTitle
  }

  const candidates = Array.from(root.querySelectorAll("p, li, figcaption"))
  for (const candidate of candidates) {
    const text = normalizeTitle(candidate.textContent ?? "")
    if (text.length >= 2 && text.length <= 120) return text
  }

  const bodyText = normalizeTitle(root.textContent ?? "")
  return bodyText.length >= 2 && bodyText.length <= 120 ? bodyText : ""
}

/**
 * Remove leading heading(s) that duplicate the chapter page title.
 * Safe boundary: only remove when the heading text matches the page title
 * (single h1, or a consecutive numbering + title pair that matches).
 */
export function removeMatchingTopHeading(root: ParentNode, title: string): void {
  const pageTitle = normalizeTitle(title)
  if (!pageTitle) return

  const pair = findLeadingChapterHeadingPair(root)
  if (!pair) return

  if (pair.second) {
    const combined = normalizeTitle(`${pair.firstText} ${pair.secondText}`)
    if (titlesEquivalent(combined, pageTitle)) {
      pair.first.remove()
      pair.second.remove()
      return
    }
    // Combined form did not match — do not remove either heading.
    // Fall through to single-heading match on the first only.
  }

  if (
    pair.first.tagName.toUpperCase() === "H1"
    && titlesEquivalent(pair.firstText, pageTitle)
  ) {
    pair.first.remove()
  }
}

export async function rewriteImageSources(
  root: ParentNode,
  rewriteSrc: (src: string) => Promise<string | null>
): Promise<void> {
  const images = Array.from(root.querySelectorAll("img[src]"))
  for (const image of images) {
    const src = image.getAttribute("src")
    if (!src) continue

    const rewrittenSrc = await rewriteSrc(src)
    if (rewrittenSrc) {
      image.setAttribute("src", rewrittenSrc)
    }
  }
}

/**
 * Workaround for Orca bug: batchInsertHTML crashes on <a> tags with href
 * that cannot resolve to internal block references.
 */
export function sanitizeHtmlForOrca(container: HTMLElement): void {
  const doc = container.ownerDocument || document
  const anchors = container.querySelectorAll("a")
  anchors.forEach((anchor) => {
    const span = doc.createElement("span")
    span.innerHTML = anchor.innerHTML
    if (anchor.className) {
      span.className = anchor.className
    }
    const id = anchor.getAttribute("id")
    if (id) {
      span.setAttribute("id", id)
    }
    anchor.replaceWith(span)
  })

  container.querySelectorAll("[href]").forEach((el) => {
    el.removeAttribute("href")
  })
  container.querySelectorAll("[xlink\\:href]").forEach((el) => {
    el.removeAttribute("xlink:href")
  })

  container.querySelectorAll("script, style").forEach((el) => el.remove())

  container.querySelectorAll("[name]").forEach((el) => {
    const name = el.getAttribute("name")
    if (name && !el.getAttribute("id")) {
      el.setAttribute("id", name)
    }
    el.removeAttribute("name")
  })
}

/**
 * Choose the better chapter title between TOC and content sources.
 * Valid TOC titles are preferred; pure numbering content titles never override them.
 */
export function preferChapterTitle(tocTitle: string, contentTitle: string): string {
  const toc = normalizeTitle(tocTitle)
  const content = normalizeTitle(contentTitle)

  if (!toc) return content
  if (!content) return toc

  // Never let pure number / pure numbering overwrite a meaningful TOC title.
  if (isNumberingOnlyTitle(content) && !isNumberingOnlyTitle(toc)) {
    return toc
  }

  // Content may upgrade a numbering-only TOC entry.
  if (isNumberingOnlyTitle(toc) && !isNumberingOnlyTitle(content)) {
    return content
  }

  // Content is more complete when it clearly extends the TOC title.
  if (isMoreCompleteTitle(content, toc)) {
    return content
  }

  return toc
}

/** True when the title is only a chapter/part number without semantic words. */
export function isNumberingOnlyTitle(text: string): boolean {
  const t = normalizeTitle(text)
  if (!t) return true
  if (/^\d+$/.test(t)) return true
  if (isRomanNumeralToken(t)) return true
  if (/^(chapter|part|section|book|unit|lesson)\s+[\divxlcdm]+\.?$/i.test(t)) return true
  if (/^parts?\s+[\divxlcdm]+$/i.test(t)) return true
  if (/^第\s*[\d一二三四五六七八九十百千零〇ivxlcdm]+\s*[章节部篇回卷]$/i.test(t)) return true
  return false
}

export function titlesEquivalent(a: string, b: string): boolean {
  return normalizeTitleKey(a) === normalizeTitleKey(b)
}

function findLeadingChapterHeadingPair(root: ParentNode): {
  first: Element
  firstText: string
  second: Element | null
  secondText: string
} | null {
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))
  if (headings.length === 0) return null

  const first = headings[0]
  const firstText = normalizeTitle(first.textContent ?? "")
  if (!firstText) return null

  if (
    isNumberingOnlyTitle(firstText)
    && headings.length >= 2
    && isImmediateLeadingHeadingPair(first, headings[1])
  ) {
    const second = headings[1]
    const secondText = normalizeTitle(second.textContent ?? "")
    if (secondText && !isNumberingOnlyTitle(secondText)) {
      return { first, firstText, second, secondText }
    }
  }

  return { first, firstText, second: null, secondText: "" }
}

/**
 * Only merge when the second heading is the next heading and no real body
 * content sits between them (avoids eating later section titles).
 */
function isImmediateLeadingHeadingPair(first: Element, second: Element): boolean {
  const firstLevel = headingLevel(first)
  const secondLevel = headingLevel(second)
  if (firstLevel === 0 || secondLevel === 0) return false
  // Numbering + title are usually same level (both h1) or title one step deeper.
  if (secondLevel > firstLevel + 1) return false

  let node: Node | null = first.nextSibling
  while (node && node !== second) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim()) return false
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      const tag = el.tagName.toUpperCase()
      if (/^H[1-6]$/.test(tag)) {
        // Another heading before `second` — not a simple pair.
        return false
      }
      // Allow empty wrappers / decorative breaks between the two headings.
      if (!isIgnorableBetweenHeadings(el)) return false
    }
    node = node.nextSibling
  }
  return node === second
}

function isIgnorableBetweenHeadings(el: Element): boolean {
  const tag = el.tagName.toUpperCase()
  if (tag === "BR" || tag === "HR" || tag === "WBR") return true
  if (tag === "SCRIPT" || tag === "STYLE") return true
  // Empty layout wrappers.
  if (["DIV", "SPAN", "SECTION", "HEADER", "P"].includes(tag)) {
    const text = normalizeTitle(el.textContent ?? "")
    if (text) return false
    // Reject wrappers that contain nested headings (would be non-trivial structure).
    if (el.querySelector("h1, h2, h3, h4, h5, h6")) return false
    return true
  }
  return false
}

function headingLevel(el: Element): number {
  const match = /^H([1-6])$/i.exec(el.tagName)
  return match ? Number(match[1]) : 0
}

function isMoreCompleteTitle(candidate: string, baseline: string): boolean {
  const c = normalizeTitleKey(candidate)
  const b = normalizeTitleKey(baseline)
  if (!c || !b) return false
  if (c === b) return false
  // Candidate clearly extends baseline (e.g. "1" → "1 why logic").
  if (c.includes(b) && c.length > b.length + 1) return true
  return false
}

function isRomanNumeralToken(text: string): boolean {
  const t = text.trim()
  if (!/^[ivxlcdm]+$/i.test(t)) return false
  // Basic roman pattern (not exhaustive, good enough for chapter labels).
  return /^(?=[ivxlcdm])m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(t)
}

function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function normalizeTitleKey(text: string): string {
  return normalizeTitle(text).toLowerCase()
}

function isTechnicalTitle(title: string, identityCandidates: string[]): boolean {
  const normalized = normalizeIdentity(title)
  if (!normalized || /^(cover|untitled|chapter\d*)$/.test(normalized)) return true
  return identityCandidates.some((candidate) => normalizeIdentity(candidate) === normalized)
}

function normalizeIdentity(value: string): string {
  const base = value.split("/").pop()?.replace(/\.[^.]+$/, "") ?? value
  return base.toLowerCase().replace(/[^a-z0-9\p{L}\p{N}]+/gu, "")
}
