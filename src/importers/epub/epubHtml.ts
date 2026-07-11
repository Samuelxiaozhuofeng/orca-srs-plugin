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

export function extractTopHeadingTitle(root: ParentNode): string {
  const heading = root.querySelector("h1, h2, h3, h4, h5, h6")
  return normalizeTitle(heading?.textContent ?? "")
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

export function removeMatchingTopHeading(root: ParentNode, title: string): void {
  const heading = root.querySelector("h1, h2, h3, h4, h5, h6")
  if (
    heading?.tagName.toUpperCase() === "H1"
    && normalizeTitle(heading.textContent ?? "") === normalizeTitle(title)
  ) {
    heading.remove()
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

function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim()
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
