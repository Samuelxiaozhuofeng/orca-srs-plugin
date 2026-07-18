/**
 * Web-only legacy HTML layout normalization:
 * layout tables → unwrapped content; br/br essays → paragraph elements.
 */

import { parseHtml } from "../epub/epubHtml"

const MAX_TABLES = 300
const MAX_PARAGRAPH_SPLIT = 400
const TARGET_PARA_CHARS = 1_200
const MAX_PARA_CHARS = 4_000

/** Unwrap layout tables and split br/br prose on a document fragment root. */
export function applyLegacyLayoutNormalization(root: ParentNode): void {
  unwrapLayoutTables(root)
  splitLegacyBrParagraphs(root)
}

/**
 * Unwrap single-cell / nested layout tables that are not real data tables.
 * Preserves tables with multiple columns of non-empty cells or th headers.
 */
export function unwrapLayoutTables(root: ParentNode): void {
  const tables = Array.from(root.querySelectorAll("table")).slice(0, MAX_TABLES)
  tables.sort((a, b) => depth(b) - depth(a))

  for (const table of tables) {
    if (!table.isConnected) continue
    if (!isLayoutTable(table)) continue
    unwrapElement(table)
  }
}

/**
 * Convert long br/br-separated prose into paragraph elements so outline
 * import does not produce a single giant unstructured blob in the source HTML.
 */
export function splitLegacyBrParagraphs(root: ParentNode): void {
  const hosts = Array.from(
    (root as Element).querySelectorAll
      ? (root as Element).querySelectorAll(
          "body, div, td, section, article, main, font, center, p"
        )
      : []
  )
  if (root instanceof Element) {
    hosts.unshift(root)
  }

  let splits = 0
  for (const host of hosts) {
    if (splits >= MAX_PARAGRAPH_SPLIT) break
    if (!host.isConnected) continue
    if (host.querySelector("p, h1, h2, h3, h4, h5, h6, pre, ul, ol, blockquote, table")) {
      if (!hasDoubleBr(host)) continue
    }
    if (!hasDoubleBr(host)) continue
    if (splitHostOnDoubleBr(host)) splits++
  }
}

function depth(el: Element): number {
  let d = 0
  let n: Element | null = el
  while (n) {
    d++
    n = n.parentElement
  }
  return d
}

function isLayoutTable(table: Element): boolean {
  const role = (table.getAttribute("role") ?? "").toLowerCase()
  if (role === "presentation" || role === "none") return true

  const rows = Array.from(table.querySelectorAll(":scope > tbody > tr, :scope > tr"))
  if (rows.length === 0) {
    const allRows = Array.from(table.querySelectorAll("tr"))
    if (allRows.length === 0) return true
    return classifyRowsAsLayout(allRows)
  }
  return classifyRowsAsLayout(rows)
}

function classifyRowsAsLayout(rows: Element[]): boolean {
  let maxCols = 0
  let headerCells = 0
  let multiCellRows = 0
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll(":scope > td, :scope > th"))
    const nonEmpty = cells.filter((c) => normalizeSpace(c.textContent ?? "").length > 0)
    maxCols = Math.max(maxCols, nonEmpty.length)
    if (nonEmpty.length >= 2) multiCellRows++
    headerCells += cells.filter((c) => c.tagName.toUpperCase() === "TH").length
  }
  if (headerCells >= 2 && maxCols >= 2) return false
  if (multiCellRows >= 2 && maxCols >= 2) return false
  if (maxCols <= 1) return true
  if (multiCellRows <= 1 && rows.length <= 3) return true
  return false
}

function unwrapElement(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  const cells = Array.from(el.querySelectorAll(":scope td, :scope th"))
  if (cells.length === 0) {
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el)
    }
    el.remove()
    return
  }
  if (cells.length > 1) {
    let best = cells[0]
    let bestLen = 0
    for (const cell of cells) {
      const len = normalizeSpace(cell.textContent ?? "").length
      if (len > bestLen) {
        best = cell
        bestLen = len
      }
    }
    while (best.firstChild) {
      parent.insertBefore(best.firstChild, el)
    }
    el.remove()
    return
  }
  const cell = cells[0]
  while (cell.firstChild) {
    parent.insertBefore(cell.firstChild, el)
  }
  el.remove()
}

function hasDoubleBr(host: Element): boolean {
  return /<br\s*\/?>\s*<br\s*\/?>/i.test(host.innerHTML)
}

function splitHostOnDoubleBr(host: Element): boolean {
  const children = Array.from(host.childNodes)
  let blockChildren = 0
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName.toUpperCase()
      if (
        ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "PRE", "TABLE", "BLOCKQUOTE", "SECTION", "ARTICLE"].includes(
          tag
        )
      ) {
        blockChildren++
      }
    }
  }
  if (blockChildren >= 3) return false

  const html = host.innerHTML
  const parts = html.split(/<br\s*\/?>\s*<br\s*\/?>/i)
  if (parts.length < 2) return false

  const doc = host.ownerDocument || document
  const frag = doc.createDocumentFragment()
  let made = 0
  for (const part of parts) {
    const trimmed = part.replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/gi, "")
    if (!trimmed) continue
    for (const chunk of splitLongPart(trimmed)) {
      const p = doc.createElement("p")
      p.innerHTML = chunk
      if (!normalizeSpace(p.textContent ?? "") && !p.querySelector("img")) continue
      frag.appendChild(p)
      made++
    }
  }
  if (made < 2) return false
  host.innerHTML = ""
  host.appendChild(frag)
  return true
}

function splitLongPart(html: string): string[] {
  const plainLen = normalizeSpace(html.replace(/<[^>]+>/g, " ")).length
  if (plainLen <= MAX_PARA_CHARS) {
    if (plainLen > TARGET_PARA_CHARS && /<br\s*\/?>/i.test(html)) {
      const lines = html.split(/<br\s*\/?>/i)
      if (lines.length >= 4) {
        const out: string[] = []
        let buf = ""
        for (const line of lines) {
          const next = buf ? `${buf}<br>${line}` : line
          const nextLen = normalizeSpace(next.replace(/<[^>]+>/g, " ")).length
          if (buf && nextLen > TARGET_PARA_CHARS) {
            out.push(buf)
            buf = line
          } else {
            buf = next
          }
        }
        if (buf) out.push(buf)
        return out.length >= 2 ? out : [html]
      }
    }
    return [html]
  }
  const lines = html.split(/<br\s*\/?>/i)
  if (lines.length < 2) return [html]
  const out: string[] = []
  let buf = ""
  for (const line of lines) {
    const next = buf ? `${buf}<br>${line}` : line
    const nextLen = normalizeSpace(next.replace(/<[^>]+>/g, " ")).length
    if (buf && nextLen > TARGET_PARA_CHARS) {
      out.push(buf)
      buf = line
    } else {
      buf = next
    }
  }
  if (buf) out.push(buf)
  return out
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** Convenience for tests: run layout normalize on an HTML string. */
export function normalizeLegacyLayoutHtml(html: string): string {
  if (!html.trim()) return html
  const doc = parseHtml(`<div id="__leg">${html}</div>`)
  const root = doc.getElementById("__leg")
  if (!root) return html
  applyLegacyLayoutNormalization(root)
  return root.innerHTML
}
