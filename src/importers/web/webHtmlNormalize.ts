/**
 * Web-only HTML normalization before Orca outline import.
 * - Code: collapse syntax-highlight + line-number chrome into clean <pre><code>
 * - Links: cross-origin descriptive targets as visible text (no href — Orca crash)
 * - Legacy layout: delegated to webLegacyLayout.ts
 */

import { parseHtml } from "../epub/epubHtml"
import { applyLegacyLayoutNormalization } from "./webLegacyLayout"

const MAX_CODE_BLOCKS = 200
const MAX_ANCHORS = 2_000
/** Cap how many cross-origin URLs we append as visible text. */
const MAX_URL_DECORATIONS = 45

function isDangerousUrlLocal(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v.startsWith("javascript:")) return true
  if (v.startsWith("vbscript:")) return true
  if (v.startsWith("data:text/html")) return true
  return false
}

function resolveHttpUrlLocal(src: string, baseUrl: string): string | null {
  const trimmed = src.trim()
  if (!trimmed) return null
  if (/^(data:|blob:|file:)/i.test(trimmed)) return null
  if (isDangerousUrlLocal(trimmed)) return null
  try {
    const absolute = new URL(trimmed, baseUrl)
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
      return null
    }
    return absolute.toString()
  } catch {
    return null
  }
}

/**
 * Normalize web article HTML structure for cleaner outline tokens.
 */
export function normalizeWebArticleHtml(
  html: string,
  baseUrl: string,
  options?: { codeOnly?: boolean }
): string {
  if (!html.trim()) return html
  const doc = parseHtml(`<div id="__web_norm_root">${html}</div>`)
  const root = doc.getElementById("__web_norm_root")
  if (!root) return html

  normalizeCodeBlocks(root)
  if (options?.codeOnly) {
    return root.innerHTML
  }

  applyLegacyLayoutNormalization(root)
  rewriteLinksForSafeDisplay(root, baseUrl)

  return root.innerHTML
}

// ---------------------------------------------------------------------------
// Code blocks
// ---------------------------------------------------------------------------

export function normalizeCodeBlocks(root: ParentNode): void {
  const preNodes = Array.from(root.querySelectorAll("pre")).slice(0, MAX_CODE_BLOCKS)
  for (const pre of preNodes) {
    if (!pre.isConnected) continue
    const text = extractCodeText(pre)
    if (!text.trim()) continue
    replaceWithCleanPre(pre, text)
  }

  const containers = Array.from(
    root.querySelectorAll(
      [
        ".highlight",
        ".highlighter-rouge",
        ".codehilite",
        ".code-block",
        ".codeblock",
        ".code-sample",
        ".highlight-code",
        "[data-language]",
        "[class*='language-']",
        "div.highlight",
        "figure.highlight"
      ].join(",")
    )
  ).slice(0, MAX_CODE_BLOCKS)

  for (const container of containers) {
    if (!container.isConnected) continue
    if (container.querySelector("pre")) {
      stripCodeChrome(container)
      continue
    }
    const text = extractCodeText(container)
    if (!text.trim() || text.length < 2) continue
    if (!looksLikeCodeContainer(container, text)) continue
    replaceWithCleanPre(container, text)
  }
}

function looksLikeCodeContainer(el: Element, text: string): boolean {
  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  if (/\b(highlight|code|language-|hljs|rouge|prism)\b/.test(cls)) return true
  if (el.hasAttribute("data-language") || el.hasAttribute("data-lang")) return true
  const lines = text.split("\n").filter((l) => l.trim())
  if (lines.length >= 3 && lines.every((l) => l.length < 200)) return true
  return false
}

function stripCodeChrome(container: Element): void {
  container
    .querySelectorAll(
      "button, [class*='copy'], [class*='Copy'], .line-numbers, .line-number, .lineno, .gutter, [aria-label*='Copy' i], [aria-label*='copy' i]"
    )
    .forEach((el) => el.remove())
}

function extractCodeText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone
    .querySelectorAll(
      [
        "button",
        "svg",
        "nav",
        ".line-numbers",
        ".line-number",
        ".lineno",
        ".gutter",
        ".rdmd-code-copy",
        "[class*='copy-button']",
        "[class*='CopyButton']",
        "[data-line-number]",
        "[class*='linenumber']",
        "[class*='lineNumber']"
      ].join(",")
    )
    .forEach((node) => node.remove())

  const tables = Array.from(clone.querySelectorAll("table"))
  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll("tr"))
    if (rows.length === 0) continue
    let numberCol = true
    const codeLines: string[] = []
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td, th"))
      if (cells.length >= 2) {
        const first = (cells[0].textContent ?? "").trim()
        if (first && !/^\d+$/.test(first)) numberCol = false
        codeLines.push(cells[cells.length - 1].textContent ?? "")
      } else if (cells.length === 1) {
        codeLines.push(cells[0].textContent ?? "")
      }
    }
    if (numberCol && codeLines.length > 0) {
      table.replaceWith(clone.ownerDocument!.createTextNode(codeLines.join("\n")))
    }
  }

  const codeEl = clone.querySelector("code")
  if (codeEl && !codeEl.querySelector("table")) {
    codeEl
      .querySelectorAll(
        ".line-number, .lineno, [class*='line-number'], [data-line-number], [data-line], [aria-hidden='true']"
      )
      .forEach((n) => {
        const t = (n.textContent ?? "").trim()
        if (!t || /^\d+$/.test(t)) n.remove()
      })

    const lineNodes = codeEl.querySelectorAll(
      ":scope > .line, :scope > span.line, :scope > div.line"
    )
    if (lineNodes.length >= 2) {
      return Array.from(lineNodes)
        .map((n) => {
          const lineClone = n.cloneNode(true) as Element
          lineClone
            .querySelectorAll(
              ".line-number, .lineno, [class*='line-number'], [data-line-number]"
            )
            .forEach((g) => g.remove())
          const content = lineClone.querySelector(".line-content")
          return stripTrailingNewline(
            content?.textContent ?? lineClone.textContent ?? ""
          )
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd()
    }
    return normalizeCodeText(codeEl.textContent ?? "")
  }

  const directLines = clone.querySelectorAll(
    ":scope > .line, :scope > span.line, :scope > div.line"
  )
  if (directLines.length >= 2) {
    return Array.from(directLines)
      .map((n) => stripTrailingNewline(n.textContent ?? ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd()
  }

  return normalizeCodeText(clone.textContent ?? "")
}

function stripTrailingNewline(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\n$/, "")
}

function normalizeCodeText(text: string): string {
  let lines = text.replace(/\r\n/g, "\n").split("\n")
  const pureNumberLines = lines.filter((l) => /^\s*\d+\s*$/.test(l)).length
  if (pureNumberLines >= 3 && pureNumberLines >= lines.length * 0.4) {
    lines = lines.filter((l) => !/^\s*\d+\s*$/.test(l))
  }
  lines = lines.map((line) => {
    const m = /^(\d{1,4})([ \t]*)(.*)$/.exec(line)
    if (!m) return line
    const rest = m[3]
    if (!rest || /^\s*$/.test(rest)) return line
    if (/^[.)]/.test(rest)) return line
    if (m[2] === "" && /^[A-Za-z_$"'`[{(]/.test(rest)) return rest
    if (
      m[2].length > 0
      && (/[=;{}()[\]<>]|^\s*(const|let|var|function|import|export|class|return|if|for|while)\b/.test(
        rest
      ))
    ) {
      return rest
    }
    return line
  })
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()
}

function replaceWithCleanPre(target: Element, codeText: string): void {
  const doc = target.ownerDocument || document
  const pre = doc.createElement("pre")
  const code = doc.createElement("code")
  code.textContent = codeText
  pre.appendChild(code)
  target.replaceWith(pre)
}

// ---------------------------------------------------------------------------
// Links — Orca-safe visible targets (no href)
// ---------------------------------------------------------------------------

/**
 * Replace anchors with spans. Cross-origin descriptive links may append
 * ` (https://…)` up to MAX_URL_DECORATIONS. Same-origin, hash, mailto, short
 * citation labels keep text only. Never reintroduces href.
 */
export function rewriteLinksForSafeDisplay(
  root: ParentNode,
  baseUrl: string
): void {
  const anchors = Array.from(root.querySelectorAll("a")).slice(0, MAX_ANCHORS)
  let decorations = 0

  for (const anchor of anchors) {
    if (!anchor.isConnected) continue
    const hrefRaw = anchor.getAttribute("href")
    const doc = anchor.ownerDocument || document
    const span = doc.createElement("span")
    span.innerHTML = anchor.innerHTML
    if (anchor.className) span.className = anchor.className
    const id = anchor.getAttribute("id")
    if (id) span.setAttribute("id", id)

    const linkText = span.textContent ?? ""
    const display = chooseLinkDisplay(hrefRaw, baseUrl, linkText, decorations)

    if (display.kind === "text_only") {
      if (!normalizeSpace(span.textContent ?? "") && display.fallbackText) {
        span.textContent = display.fallbackText
      }
    } else if (display.kind === "with_url") {
      decorations++
      const visible = normalizeSpace(span.textContent ?? "")
      if (!visible) {
        span.textContent = display.url
      } else if (!linkTextIncludesUrl(visible, display.url)) {
        span.appendChild(doc.createTextNode(` (${display.url})`))
      }
    }

    anchor.replaceWith(span)
  }
}

type LinkDisplay =
  | { kind: "text_only"; fallbackText?: string }
  | { kind: "with_url"; url: string }

function chooseLinkDisplay(
  hrefRaw: string | null,
  baseUrl: string,
  linkText: string,
  decorationsSoFar: number
): LinkDisplay {
  if (hrefRaw == null || !hrefRaw.trim()) {
    return { kind: "text_only" }
  }
  const href = hrefRaw.trim()
  if (isDangerousUrlLocal(href)) {
    return { kind: "text_only" }
  }
  if (href === "#" || href.startsWith("#")) {
    return { kind: "text_only" }
  }
  const lower = href.toLowerCase()
  if (
    lower.startsWith("mailto:")
    || lower.startsWith("tel:")
    || lower.startsWith("sms:")
    || lower.startsWith("data:")
    || lower.startsWith("blob:")
    || lower.startsWith("file:")
  ) {
    return { kind: "text_only", fallbackText: normalizeSpace(linkText) || undefined }
  }

  const absolute = resolveHttpUrlLocal(href, baseUrl)
  if (!absolute) {
    return { kind: "text_only" }
  }

  // Same-page hash navigation
  try {
    const base = new URL(baseUrl)
    const target = new URL(absolute)
    if (
      target.origin === base.origin
      && target.pathname === base.pathname
      && target.search === base.search
      && target.hash
    ) {
      return { kind: "text_only" }
    }
    // Same-origin / internal: label only (page origin already in web.sourceUrl)
    if (target.origin === base.origin) {
      return { kind: "text_only" }
    }
  } catch {
    // keep going
  }

  // Citation-like / very short labels — never decorate
  if (isCitationLikeLabel(linkText)) {
    return { kind: "text_only" }
  }

  if (decorationsSoFar >= MAX_URL_DECORATIONS) {
    return { kind: "text_only" }
  }

  return { kind: "with_url", url: absolute }
}

/** Numeric citations, bare brackets, arrows — keep label only. */
export function isCitationLikeLabel(text: string): boolean {
  const t = normalizeSpace(text)
  const lower = t.toLowerCase()
  if (!t) return true
  // Single-character non-word labels (arrows, stars) — not short words like "Go"
  if (t.length === 1 && !/[A-Za-z0-9]/.test(t)) return true
  if (/^\[\d+\]$/.test(t)) return true
  if (/^\d{1,4}$/.test(t)) return true
  if (/^[↑↓←→↩︎^†‡*§¶]+$/.test(t)) return true
  if (/^\[\w{1,3}\]$/.test(t)) return true
  if (lower === "edit" || lower === "edit source") return true
  return false
}

function linkTextIncludesUrl(linkText: string, url: string): boolean {
  const t = linkText.toLowerCase()
  const u = url.toLowerCase()
  if (t.includes(u)) return true
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (t === host || t === host.replace(/^www\./, "")) return true
  } catch {
    // ignore
  }
  return false
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

// Re-export legacy helpers for callers/tests that imported from this module
export {
  unwrapLayoutTables,
  splitLegacyBrParagraphs
} from "./webLegacyLayout"
