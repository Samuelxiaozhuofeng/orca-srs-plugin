/**
 * Heading-aware HTML outline tokenization for Orca outline import.
 *
 * Produces a flat token stream of headings and content blocks. Nesting is
 * reconstructed later by orcaOutlineImporter using a heading-level stack:
 * each content token belongs to the nearest preceding heading of lower level
 * (or the chapter root).
 */

export interface HtmlHeadingToken {
  kind: "heading"
  level: number
  text: string
}

export interface HtmlContentToken {
  kind: "content"
  html: string
}

export type HtmlOutlineToken = HtmlHeadingToken | HtmlContentToken

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6"

/** Elements that carry meaning even without visible text (aligned with EPUB sanitizer allowlist). */
const MEANINGFUL_MEDIA_SELECTOR = "img, picture, table, hr"

/**
 * Layout wrappers that should not become opaque content blobs. Their children
 * are flattened so empty padding containers do not pollute the outline.
 */
const FLATTEN_CONTAINER_TAGS = new Set([
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "NAV",
  "CENTER"
])

const BLOCK_CONTENT_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "CENTER",
  "DIV",
  "DL",
  "FIGURE",
  "FOOTER",
  "FORM",
  "HEADER",
  "HR",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "UL"
])

export function parseHtmlOutlineTokens(html: string): HtmlOutlineToken[] {
  const template = document.createElement("template")
  template.innerHTML = html

  const tokens: HtmlOutlineToken[] = []
  appendOutlineTokens(Array.from(template.content.childNodes), tokens)

  return mergeAdjacentContentTokens(tokens)
}

/**
 * Drop layout-only blank nodes from an HTML fragment before Orca insert.
 * Preserves `<hr>` and media-bearing nodes.
 */
export function stripBlankHtml(html: string): string {
  const template = document.createElement("template")
  template.innerHTML = html
  stripBlankNodes(template.content)
  return template.innerHTML.trim()
}

function appendOutlineTokens(
  nodes: Node[],
  tokens: HtmlOutlineToken[]
): void {
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      if (!isBlankText(text)) {
        tokens.push({ kind: "content", html: escapeHtml(text) })
      }
      continue
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue
    }

    const element = node as HTMLElement
    if (element.tagName === "BR") {
      if (hasInlineContentOnBothSides(element)) {
        tokens.push({ kind: "content", html: element.outerHTML })
      }
      continue
    }

    if (isHeadingElement(element)) {
      const text = normalizeVisibleText(element.textContent ?? "")
      if (text) {
        tokens.push({
          kind: "heading",
          level: getHeadingLevel(element),
          text
        })
      }
      continue
    }

    if (element.querySelector(HEADING_SELECTOR)) {
      // Headings inside layout wrappers must stay outline-aware.
      appendOutlineTokens(Array.from(element.childNodes), tokens)
      continue
    }

    if (shouldFlattenContainer(element)) {
      appendOutlineTokens(Array.from(element.childNodes), tokens)
      continue
    }

    if (isBlankElement(element)) {
      continue
    }

    const cleaned = cleanContentElement(element)
    if (cleaned) {
      tokens.push({ kind: "content", html: cleaned })
    }
  }
}

function shouldFlattenContainer(element: HTMLElement): boolean {
  return FLATTEN_CONTAINER_TAGS.has(element.tagName)
}

function cleanContentElement(element: HTMLElement): string | null {
  const clone = element.cloneNode(true) as HTMLElement
  stripBlankNodes(clone)
  if (isBlankElement(clone)) {
    return null
  }
  return clone.outerHTML
}

function stripBlankNodes(root: ParentNode): void {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (isBlankText(child.textContent ?? "")) {
        child.parentNode?.removeChild(child)
      }
      continue
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.parentNode?.removeChild(child)
      continue
    }

    const element = child as HTMLElement
    if (element.tagName === "BR") {
      if (!hasInlineContentOnBothSides(element)) {
        element.parentNode?.removeChild(element)
      }
      continue
    }

    stripBlankNodes(element)

    if (isBlankElement(element)) {
      element.parentNode?.removeChild(element)
    }
  }
}

function hasInlineContentOnBothSides(element: Element): boolean {
  return Boolean(
    findInlineSibling(element, "previousSibling")
    && findInlineSibling(element, "nextSibling")
  )
}

function findInlineSibling(
  element: Element,
  direction: "previousSibling" | "nextSibling"
): Node | null {
  let sibling = element[direction]
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      if (!isBlankText(sibling.textContent ?? "")) {
        return sibling
      }
    } else if (sibling.nodeType === Node.ELEMENT_NODE) {
      const siblingElement = sibling as Element
      if (siblingElement.tagName !== "BR") {
        return isInlineContentElement(siblingElement) ? sibling : null
      }
    }
    sibling = sibling[direction]
  }
  return null
}

function isInlineContentElement(element: Element): boolean {
  return !BLOCK_CONTENT_TAGS.has(element.tagName) && !isBlankElement(element)
}

function mergeAdjacentContentTokens(
  tokens: HtmlOutlineToken[]
): HtmlOutlineToken[] {
  const merged: HtmlOutlineToken[] = []

  for (const token of tokens) {
    if (token.kind === "content") {
      const cleanedHtml = isBreakToken(token.html)
        ? token.html.trim()
        : stripBlankHtml(token.html)
      if (!cleanedHtml) {
        continue
      }
      const lastToken = merged[merged.length - 1]
      if (lastToken?.kind === "content") {
        lastToken.html += cleanedHtml
        continue
      }
      merged.push({ kind: "content", html: cleanedHtml })
      continue
    }

    merged.push(token)
  }

  return merged
}

function isBreakToken(html: string): boolean {
  return /^<br\s*\/?\s*>$/i.test(html.trim())
}

function isHeadingElement(element: HTMLElement): boolean {
  return /^H[1-6]$/.test(element.tagName)
}

function getHeadingLevel(element: HTMLElement): number {
  return Number(element.tagName.substring(1))
}

/** Visible text after collapsing ordinary space and NBSP family. */
export function normalizeVisibleText(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u202f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function isBlankText(text: string): boolean {
  return normalizeVisibleText(text) === ""
}

/**
 * True when an element has no visible text and no semantic media/separators.
 * Standalone `<br>` and empty padding paragraphs/divs are blank.
 */
export function isBlankElement(element: Element): boolean {
  const tag = element.tagName.toUpperCase()
  if (tag === "HR") {
    return false
  }
  if (/^H[1-6]$/.test(tag)) {
    return false
  }
  if (tag === "BR") {
    return true
  }
  if (matchesMeaningfulMedia(element)) {
    return false
  }
  if (element.querySelector(MEANINGFUL_MEDIA_SELECTOR)) {
    return false
  }
  return isBlankText(element.textContent ?? "")
}

function matchesMeaningfulMedia(element: Element): boolean {
  try {
    return element.matches(MEANINGFUL_MEDIA_SELECTOR)
  } catch {
    // Extremely old DOM implementations; fall back to tag check.
    return /^(IMG|SVG|VIDEO|AUDIO|IFRAME|OBJECT|EMBED|PICTURE|SOURCE|CANVAS|MATH|TABLE|HR|INPUT|TEXTAREA|SELECT|BUTTON)$/.test(
      element.tagName
    )
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
