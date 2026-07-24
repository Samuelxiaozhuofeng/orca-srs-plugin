/**
 * Web-only HTML normalization before Orca outline import.
 * - Code: collapse syntax-highlight + line-number chrome into clean <pre><code>
 * - Links: cross-origin descriptive targets as visible text (no href — Orca crash)
 * - Visual widgets: collapse interactive diagrams (trace ribbons, mermaid, etc.)
 *   so Orca batchInsertHTML does not explode them into hundreds of micro-blocks
 * - Legacy layout: delegated to webLegacyLayout.ts
 */

import { parseHtml } from "../epub/epubHtml"
import { applyLegacyLayoutNormalization } from "./webLegacyLayout"

const MAX_CODE_BLOCKS = 200
const MAX_ANCHORS = 2_000
/** Cap how many cross-origin URLs we append as visible text. */
const MAX_URL_DECORATIONS = 45
/** Per-kind caps so spacing fixes never starve destructive collapses. */
const MAX_STAT_SPACING_FIXES = 80
const MAX_TRACE_COLLAPSES = 40
const MAX_MERMAID_COLLAPSES = 30
const MAX_MISALIGN_COLLAPSES = 20
const MAX_CANVAS_COLLAPSES = 40
/** Minimum micro-step nodes before a trace host is treated as a ribbon UI. */
const MIN_TRACE_STEPS_TO_COLLAPSE = 2

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

  collapseVisualWidgets(root)
  applyLegacyLayoutNormalization(root)
  rewriteLinksForSafeDisplay(root, baseUrl)

  return root.innerHTML
}

/**
 * Standalone visual-widget collapse for the pre-extract phase of prepareWebArticleHtml.
 * Must run while class names still exist (before Readability).
 */
export function collapseVisualWidgetsHtml(html: string): string {
  if (!html.trim()) return html
  const doc = parseHtml(`<div id="__web_vis_root">${html}</div>`)
  const root = doc.getElementById("__web_vis_root")
  if (!root) return html
  collapseVisualWidgets(root)
  return root.innerHTML
}

// ---------------------------------------------------------------------------
// Visual widgets (trace ribbons / mermaid / chart chrome)
// ---------------------------------------------------------------------------

/**
 * Collapse interactive or canvas/SVG-heavy widgets into short captions.
 *
 * Why: Orca `batchInsertHTML` splits nested block elements into separate blocks.
 * Sites like stencil.so embed agent-trace ribbons as hundreds of tiny
 * `.trace-step` divs (`bash`+`opus` → "bashopus" blocks). Those are not
 * readable article structure for progressive reading.
 *
 * Policy (fail-safe):
 * - Require structural signatures (steps / SVG / canvas / label-value rows), not class alone.
 * - Keep human captions/labels; drop diagram chrome only.
 * - Never silently delete unknown structures (no empty-caption wipe).
 * - Never replace containers that still hold semantic content (img/table/p/lists).
 */
export function collapseVisualWidgets(root: ParentNode): void {
  // Destructive collapses first so spacing fixes never starve them.
  collapseTraceFlows(root, MAX_TRACE_COLLAPSES)
  collapseMermaidDiagrams(root, MAX_MERMAID_COLLAPSES)
  collapseMisalignCharts(root, MAX_MISALIGN_COLLAPSES)
  collapseEmptyChartCanvases(root, MAX_CANVAS_COLLAPSES)
  fixInlineStatSpacing(root, MAX_STAT_SPACING_FIXES)
}

/**
 * Adjacent value/label spans often have no whitespace in source HTML
 * (`97%`+`of frontier` → "97%of"). Insert a space only when there is no
 * intervening text; never overwrite real separators (`/`, `:`, `vs.`).
 */
function fixInlineStatSpacing(root: ParentNode, budget: number): number {
  if (budget <= 0) return 0
  let used = 0
  // Prefer exact tokens; avoid bare [class*='metric'] which hits metric-system, etc.
  const pairs = Array.from(
    root.querySelectorAll(
      ".post-stat, .stat, .stat-item, .metric-item, .metric-card, [class~='metric']"
    )
  ).slice(0, budget * 2)

  for (const host of pairs) {
    if (used >= budget) break
    if (!host.isConnected) continue
    const value = host.querySelector(
      ".post-stat-value, .stat-value, .metric-value, [class~='stat-value'], [class~='metric-value']"
    )
    const label = host.querySelector(
      ".post-stat-label, .stat-label, .metric-label, [class~='stat-label'], [class~='metric-label']"
    )
    if (!value || !label) continue
    if (value.nextElementSibling !== label && value.nextSibling !== label) continue

    const between = value.nextSibling
    if (between === label) {
      const doc = host.ownerDocument || document
      value.after(doc.createTextNode(" "))
      used++
    } else if (
      between
      && between.nodeType === Node.TEXT_NODE
      && (between.textContent ?? "") === ""
    ) {
      // Empty text node between value/label — make it a single space.
      between.textContent = " "
      used++
    }
    // Non-empty text (including `/`, `:`) is left untouched.
  }
  return used
}

/** Exact class token or known full class name — not substring false-positives. */
const TRACE_FLOW_SELECTOR = ".trace-flow, .trace-ribbon"

function collapseTraceFlows(root: ParentNode, budget: number): number {
  if (budget <= 0) return 0
  let used = 0
  const flows = Array.from(root.querySelectorAll(TRACE_FLOW_SELECTOR)).filter(
    (el) => {
      const parentMatch = el.parentElement?.closest(TRACE_FLOW_SELECTOR)
      return !parentMatch || parentMatch === el
    }
  )

  for (const flow of flows) {
    if (used >= budget) break
    if (!flow.isConnected) continue
    if (hasSemanticArticleContent(flow)) continue

    const stepCount = flow.querySelectorAll(
      ".trace-step, .trace-phase-steps > *, [class~='trace-step']"
    ).length
    // Require real ribbon density — class alone is not enough (avoids
    // collapsing prose sections that happen to mention "trace-flow" in prose
    // class names like .trace-flow-explanation if we used substring match).
    if (stepCount < MIN_TRACE_STEPS_TO_COLLAPSE) continue

    const labelText = pickWidgetCaption(flow, [
      ".trace-flow-label",
      ".trace-phase-label",
      "figcaption",
      "[class~='trace-flow-label']"
    ])
    // No caption → still collapse step soup to a short synthetic note rather
    // than leaving hundreds of micro-blocks; never remove with zero replacement.
    const caption =
      labelText
      || (stepCount >= MIN_TRACE_STEPS_TO_COLLAPSE
        ? `[trace diagram · ${stepCount} steps]`
        : "")
    if (!caption) continue

    replaceWithCaptionParagraph(flow, caption)
    used++
  }
  return used
}

const MERMAID_SELECTOR =
  ".st-mermaid, .mermaid, pre.mermaid, [class~='st-mermaid'], [class~='plan-diagram']"

function collapseMermaidDiagrams(root: ParentNode, budget: number): number {
  if (budget <= 0) return 0
  let used = 0
  const nodes = Array.from(root.querySelectorAll(MERMAID_SELECTOR)).filter(
    (el) => {
      const parentMatch = el.parentElement?.closest(MERMAID_SELECTOR)
      return !parentMatch || parentMatch === el
    }
  )

  for (const el of nodes) {
    if (used >= budget) break
    if (!el.isConnected) continue

    // If the matched node (or its figure host) still holds semantic content,
    // only strip visual noise (svg/canvas) — never replace the whole container.
    const figure = el.closest("figure")
    if (hasSemanticArticleContent(el) || (figure && hasSemanticArticleContent(figure) && figure !== el)) {
      stripVisualNoiseOnly(el)
      used++
      continue
    }

    // Diagram-only figure: collapse whole figure to caption when figure has no
    // semantic children beyond the diagram host + caption.
    const host =
      figure && isDiagramOnlyFigure(figure, el) ? figure : el

    if (hasSemanticArticleContent(host)) {
      stripVisualNoiseOnly(el)
      used++
      continue
    }

    // Require visual signature (svg/canvas/pre.mermaid) or known mermaid class
    const looksLikeDiagram =
      Boolean(host.querySelector("svg, canvas"))
      || host.matches("pre.mermaid, .mermaid, .st-mermaid")
      || el.matches("pre.mermaid, .mermaid, .st-mermaid")
      || hasClassToken(el, "st-mermaid")
      || hasClassToken(el, "mermaid")
      || hasClassToken(el, "plan-diagram")
    if (!looksLikeDiagram) continue

    const caption = pickWidgetCaption(host, [
      "figcaption",
      "[class~='caption']"
    ]) || pickAriaCaption(host)
    if (!caption) {
      // Keep structure; only drop pure SVG/canvas noise inside.
      stripVisualNoiseOnly(el)
      used++
      continue
    }

    replaceWithCaptionParagraph(host, caption)
    used++
  }
  return used
}

function collapseMisalignCharts(root: ParentNode, budget: number): number {
  if (budget <= 0) return 0
  let used = 0
  // Exact class tokens only — bare ".misalign" substring classes are too common.
  const charts = Array.from(
    root.querySelectorAll(".misalign, .misalign-group")
  ).slice(0, budget * 2)

  for (const chart of charts) {
    if (used >= budget) break
    if (!chart.isConnected) continue
    // Prefer outermost .misalign
    if (
      chart.parentElement?.closest(".misalign")
      && chart.parentElement.closest(".misalign") !== chart
    ) {
      continue
    }

    const rows = Array.from(
      chart.querySelectorAll(".misalign-row, [class~='misalign-row']")
    )
    // Structural signature required: real label/value rows. No rows → leave alone
    // (do not delete generic .misalign demo content).
    if (rows.length === 0) continue
    if (hasSemanticArticleContent(chart) && !chart.querySelector(".misalign-row, [class~='misalign-row']")) {
      continue
    }

    const doc = chart.ownerDocument || document
    const lines: string[] = []
    const title = normalizeSpace(
      chart.querySelector(".misalign-title, [class~='misalign-title']")
        ?.textContent ?? ""
    )
    if (title) lines.push(title)

    for (const row of rows) {
      const label = normalizeSpace(
        row.querySelector(".misalign-label, [class~='misalign-label']")
          ?.textContent ?? ""
      )
      const valueEl = row.querySelector(
        ".misalign-value, [class~='misalign-value']"
      )
      const deltaEl = row.querySelector(
        ".misalign-delta, [class~='misalign-delta']"
      )
      // Stencil nests delta inside value (`44%<span class="misalign-delta">163t</span>`).
      // When nested, split value direct text + delta with an explicit space.
      let value = ""
      let delta = ""
      if (valueEl && deltaEl && valueEl.contains(deltaEl)) {
        value = normalizeSpace(directTextContent(valueEl))
        delta = normalizeSpace(deltaEl.textContent ?? "")
      } else {
        value = normalizeSpace(valueEl?.textContent ?? "")
        delta = normalizeSpace(deltaEl?.textContent ?? "")
      }
      const line = normalizeSpace([label, value, delta].filter(Boolean).join(" "))
      if (line) lines.push(line)
    }

    if (lines.length === 0) {
      // Signature matched but no extractable text — leave original (no silent wipe).
      continue
    }

    const wrap = doc.createElement("div")
    for (const line of lines) {
      const p = doc.createElement("p")
      p.textContent = line
      wrap.appendChild(p)
    }
    chart.replaceWith(...Array.from(wrap.childNodes))
    used++
  }
  return used
}

function collapseEmptyChartCanvases(root: ParentNode, budget: number): number {
  if (budget <= 0) return 0
  let used = 0
  // Only remove canvas elements — never remove a figure/container that holds
  // figcaption or other content (`.st-chart` on figure used to wipe the whole tree).
  const canvases = Array.from(
    root.querySelectorAll("canvas.st-chart, canvas[class*='chart'], canvas")
  ).slice(0, budget * 2)

  for (const el of canvases) {
    if (used >= budget) break
    if (!el.isConnected) continue
    if (el.tagName !== "CANVAS") continue
    // Skip canvases that look like interactive apps with nearby form controls
    // (conservative: only remove when aria-hidden or empty/zero-size chart class)
    const ariaHidden = (el.getAttribute("aria-hidden") ?? "").toLowerCase() === "true"
    const cls = (el.getAttribute("class") ?? "").toLowerCase()
    const isChart =
      ariaHidden
      || /\b(st-chart|chart|plot)\b/.test(cls)
    if (!isChart) continue
    el.remove()
    used++
  }
  return used
}

/** True if element still holds import-worthy article content beyond chrome. */
function hasSemanticArticleContent(el: Element): boolean {
  return Boolean(
    el.querySelector(
      "img, picture, table, ul, ol, blockquote, pre:not(.mermaid), h1, h2, h3, h4, h5, h6"
    )
    || Array.from(el.querySelectorAll("p")).some((p) => {
      // Ignore short caption-like paragraphs inside figcaption
      if (p.closest("figcaption")) return false
      return normalizeSpace(p.textContent ?? "").length >= 40
    })
  )
}

function isDiagramOnlyFigure(figure: Element, diagramEl: Element): boolean {
  for (const child of Array.from(figure.children)) {
    if (child === diagramEl) continue
    if (child.contains(diagramEl)) continue
    const tag = child.tagName.toUpperCase()
    if (tag === "FIGCAPTION") continue
    if (tag === "SVG" || tag === "CANVAS") continue
    // Any other structural child → not diagram-only
    if (hasSemanticArticleContent(child) || normalizeSpace(child.textContent ?? "").length > 0) {
      // Empty wrappers ok; content-bearing siblings block whole-figure collapse
      if (normalizeSpace(child.textContent ?? "").length > 0 || child.querySelector("img, table, p, ul, ol")) {
        return false
      }
    }
  }
  return true
}

function stripVisualNoiseOnly(el: Element): void {
  el.querySelectorAll("svg, canvas").forEach((n) => n.remove())
}

function hasClassToken(el: Element, token: string): boolean {
  const cls = el.getAttribute("class") ?? ""
  return cls.split(/\s+/).includes(token)
}

function directTextContent(el: Element): string {
  let out = ""
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ""
    }
  }
  return out
}

function pickWidgetCaption(host: Element, selectors: string[]): string {
  for (const sel of selectors) {
    const hit = host.querySelector(sel)
    if (!hit) continue
    const text = normalizeSpace(hit.textContent ?? "")
    if (text && text.length <= 280) return text
  }
  // Direct child label-like nodes only (not recursive step soup)
  for (const child of Array.from(host.children)) {
    const cls = (child.getAttribute("class") ?? "").toLowerCase()
    if (/(^|\s)(label|caption|title|eyebrow)(\s|$)/.test(cls) || /trace-flow-label|figcaption/.test(cls)) {
      const text = normalizeSpace(child.textContent ?? "")
      if (
        text
        && text.length <= 280
        && !child.querySelector(".trace-step, [class~='trace-step']")
      ) {
        return text
      }
    }
  }
  const aria = pickAriaCaption(host)
  if (aria) return aria
  return ""
}

function pickAriaCaption(host: Element): string {
  for (const attr of ["aria-label", "title"]) {
    const v = normalizeSpace(host.getAttribute(attr) ?? "")
    if (v && v.length <= 280) return v
  }
  const labelledBy = host.getAttribute("aria-labelledby")
  if (labelledBy && host.ownerDocument) {
    const parts = labelledBy.split(/\s+/).filter(Boolean)
    const texts = parts
      .map((id) => host.ownerDocument!.getElementById(id)?.textContent ?? "")
      .map((t) => normalizeSpace(t))
      .filter(Boolean)
    const joined = normalizeSpace(texts.join(" "))
    if (joined && joined.length <= 280) return joined
  }
  return ""
}

function replaceWithCaptionParagraph(el: Element, caption: string): void {
  const doc = el.ownerDocument || document
  const text = normalizeSpace(caption)
  if (!text) {
    // Fail-safe: never silently delete. Caller should not pass empty.
    return
  }
  const p = doc.createElement("p")
  p.textContent = text
  el.replaceWith(p)
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
