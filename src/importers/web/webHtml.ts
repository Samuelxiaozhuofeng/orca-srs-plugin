/**
 * Web HTML sanitization and prepare pipeline orchestration.
 * Stricter than EPUB helpers: untrusted remote HTML.
 *
 * Pipeline (web-only):
 *   code normalize → extractMainContent → full normalize → security sanitize
 *   → title-aware heading dedupe → sanitizeHtmlForOrca
 */

import {
  getHtmlContentRoot,
  parseHtml,
  removeMatchingTopHeading,
  sanitizeHtmlForOrca
} from "../epub/epubHtml"
import {
  extractMainContent,
  measurePlainText,
  type ContentExtractionMethod
} from "./webContentExtract"
import {
  collapseVisualWidgetsHtml,
  normalizeWebArticleHtml
} from "./webHtmlNormalize"
import {
  removeMatchingTopHeadingWeb,
  type TitleDedupeContext
} from "./webTitle"

export type { TitleDedupeContext } from "./webTitle"
export { webTitlesEquivalent, stripTrustedSiteSuffix } from "./webTitle"

const REMOVE_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "meta",
  "link",
  "base",
  "svg",
  "canvas",
  "video",
  "audio",
  "source",
  "track",
  "applet",
  "frame",
  "frameset"
] as const

export type WebImportWarningCode =
  | "extraction_uncertain"
  | "extraction_fallback"
  | "high_chrome_removed"
  | "no_paragraphs"
  | "no_headings"
  | "huge_single_chunk"
  | "excessive_headings"
  | "excessive_images"
  | "empty_body"
  | "markup_only"

export interface WebImportWarning {
  code: WebImportWarningCode
  message: string
}

export interface PrepareWebArticleHtmlOptions {
  html: string
  baseUrl: string
  pageTitle: string
  siteName?: string
  hostname?: string
}

export interface PreparedWebArticleHtml {
  html: string
  textLength: number
  excerpt: string
  warnings: WebImportWarning[]
  extractionMethod: ContentExtractionMethod
  extractedTitle?: string
  extractedByline?: string
  extractedSiteName?: string
}

/**
 * Full web-article prepare pipeline used by scrapeWebArticle.
 */
export function prepareWebArticleHtml(
  options: PrepareWebArticleHtmlOptions
): PreparedWebArticleHtml {
  const { html: rawHtml, baseUrl, pageTitle } = options
  const warnings: WebImportWarning[] = []

  const preNormalized = normalizeWebArticleHtml(rawHtml, baseUrl, {
    codeOnly: true
  })

  // Collapse class-tagged visual widgets BEFORE main-content extraction.
  // Mozilla Readability strips class/id attributes; post-extract selectors would miss
  // trace-flow ribbons and mermaid hosts (Stencil-like pages).
  const preCollapsed = collapseVisualWidgetsHtml(preNormalized)

  const extracted = extractMainContent(preCollapsed, baseUrl)
  for (const note of extracted.warnings) {
    if (/不确定|回退|丢失/.test(note)) {
      warnings.push({ code: "extraction_uncertain", message: note })
    } else if (/未能识别|结构清洗|fallback/i.test(note)) {
      warnings.push({ code: "extraction_fallback", message: note })
    } else if (/外围|导航|页眉|页脚/.test(note)) {
      warnings.push({ code: "high_chrome_removed", message: note })
    } else {
      warnings.push({ code: "extraction_fallback", message: note })
    }
  }

  const working = normalizeWebArticleHtml(extracted.html, baseUrl)

  const titleContext: TitleDedupeContext = {
    pageTitle,
    siteName: options.siteName || extracted.siteName,
    hostname: options.hostname
  }
  const cleanedHtml = sanitizeWebHtml(working, baseUrl, pageTitle, titleContext)
  const textLength = plainTextLength(cleanedHtml)

  if (textLength === 0) {
    warnings.push({
      code: cleanedHtml.trim() ? "markup_only" : "empty_body",
      message: cleanedHtml.trim()
        ? "清洗后几乎无可见正文（可能仅有空标签或装饰性标记）"
        : "清洗后正文为空"
    })
  }

  warnings.push(...diagnoseContentQuality(cleanedHtml, textLength))

  const excerpt =
    buildExcerpt(cleanedHtml, 280)
    || (extracted.excerpt ? extracted.excerpt.slice(0, 280) : "")

  return {
    html: cleanedHtml,
    textLength,
    excerpt,
    warnings: dedupeWarnings(warnings),
    extractionMethod: extracted.method,
    extractedTitle: extracted.title,
    extractedByline: extracted.byline,
    extractedSiteName: extracted.siteName
  }
}

/**
 * Sanitize untrusted web HTML for Orca import (security + title dedupe).
 */
export function sanitizeWebHtml(
  html: string,
  baseUrl: string,
  pageTitle: string,
  titleContext?: TitleDedupeContext
): string {
  const doc = parseHtml(html)
  const root = getHtmlContentRoot(doc, html)

  for (const tag of REMOVE_TAGS) {
    root.querySelectorAll(tag).forEach((el) => el.remove())
  }

  const all = root.querySelectorAll("*")
  all.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on") || name === "style" || name === "srcdoc") {
        el.removeAttribute(attr.name)
      }
    }

    for (const attrName of ["href", "src", "xlink:href", "action", "formaction", "poster"]) {
      const val = el.getAttribute(attrName)
      if (val == null) continue
      if (isDangerousUrl(val)) {
        el.removeAttribute(attrName)
      }
    }
  })

  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src")
    if (!src) {
      img.remove()
      return
    }
    const absolute = resolveHttpUrl(src, baseUrl)
    if (!absolute) {
      img.remove()
      return
    }
    img.setAttribute("src", absolute)
    img.removeAttribute("srcset")
  })

  root.querySelectorAll("[src]").forEach((el) => {
    const src = el.getAttribute("src") ?? ""
    if (/^(data:|blob:|file:)/i.test(src.trim())) {
      el.remove()
    }
  })

  removeMatchingTopHeadingWeb(root, titleContext ?? { pageTitle })
  removeMatchingTopHeading(root, pageTitle)
  sanitizeHtmlForOrca(root as HTMLElement)

  return root.innerHTML
}

export function isDangerousUrl(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v.startsWith("javascript:")) return true
  if (v.startsWith("vbscript:")) return true
  if (v.startsWith("data:text/html")) return true
  return false
}

export function resolveHttpUrl(src: string, baseUrl: string): string | null {
  const trimmed = src.trim()
  if (!trimmed) return null
  if (/^(data:|blob:|file:)/i.test(trimmed)) return null
  if (isDangerousUrl(trimmed)) return null
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

export function pickMetadataString(
  metadata: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = metadata[key]
    if (typeof v === "string" && v.trim()) return v.trim()
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) {
      return v[0].trim()
    }
  }
  return undefined
}

export function buildTitleFromMetadata(
  metadata: Record<string, unknown>,
  hostname: string
): string {
  return (
    pickMetadataString(metadata, ["title", "ogTitle", "og:title"])
    || hostname
    || "未命名网页"
  )
}

export function plainTextLength(html: string): number {
  return measurePlainText(html)
}

export function buildExcerpt(html: string, maxChars = 280): string {
  if (!html.trim()) return ""
  try {
    const doc = parseHtml(`<div id="__ex">${html}</div>`)
    const root = doc.getElementById("__ex") ?? doc.body
    if (!root) return ""
    const blocks = root.querySelectorAll("p, li, h2, h3, blockquote, pre")
    const parts: string[] = []
    for (const el of Array.from(blocks)) {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      if (t.length < 8) continue
      if (/^[\d\s]+$/.test(t)) continue
      parts.push(t)
      if (parts.join(" ").length >= maxChars) break
    }
    let text = parts.join(" ").replace(/\s+/g, " ").trim()
    if (!text) {
      text = (root.textContent ?? "").replace(/\s+/g, " ").trim()
    }
    if (text.length <= maxChars) return text
    return `${text.slice(0, maxChars - 1).trim()}…`
  } catch {
    const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    if (stripped.length <= maxChars) return stripped
    return `${stripped.slice(0, maxChars - 1).trim()}…`
  }
}

/**
 * Diagnose quality issues. Uses block-like elements (p/li/pre/…) lengths,
 * not merged outline content tokens (which intentionally merge for one batchInsertHTML).
 */
export function diagnoseContentQuality(
  html: string,
  textLength: number
): WebImportWarning[] {
  const out: WebImportWarning[] = []
  if (!html.trim() || textLength === 0) return out

  try {
    const doc = parseHtml(`<div id="__q">${html}</div>`)
    const root = doc.getElementById("__q") ?? doc.body
    if (!root) return out

    const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6").length
    const paragraphs = root.querySelectorAll("p").length
    const images = root.querySelectorAll("img").length
    const maxAtomic = maxAtomicBlockPlainText(root)

    if (paragraphs === 0 && textLength > 400 && headings === 0) {
      out.push({
        code: "no_paragraphs",
        message: "正文缺少段落结构，可能仍是整页或遗留排版"
      })
    }
    if (headings === 0 && textLength > 2_000) {
      out.push({
        code: "no_headings",
        message: "长文没有标题层级，大纲将较扁平"
      })
    }
    if (maxAtomic >= 12_000) {
      out.push({
        code: "huge_single_chunk",
        message: `存在约 ${maxAtomic} 字符的超大未分段内容块，阅读大纲可能不便`
      })
    }
    if (headings >= 40 && textLength > 0 && headings > textLength / 80) {
      out.push({
        code: "excessive_headings",
        message: `标题数量偏多（${headings}），可能仍含导航/目录`
      })
    }
    if (images >= 25 && images > headings + paragraphs) {
      out.push({
        code: "excessive_images",
        message: `图片数量偏多（${images}），可能含站点装饰图`
      })
    }
  } catch (error) {
    console.error("[web-import] content quality diagnosis failed:", error)
  }

  return out
}

/**
 * Largest plain-text size among elements that typically become separate Orca
 * blocks via batchInsertHTML (p, li, pre, blockquote, table) or a truly
 * unstructured root with no block children.
 */
export function maxAtomicBlockPlainText(root: Element): number {
  const selectors = "p, li, pre, blockquote, table, h1, h2, h3, h4, h5, h6"
  const blocks = Array.from(root.querySelectorAll(selectors))
  let max = 0
  for (const el of blocks) {
    // Skip containers that only wrap other block elements (table with cells measured separately)
    if (el.tagName.toUpperCase() === "TABLE") {
      const t = normalizeSpace(el.textContent ?? "").length
      max = Math.max(max, t)
      continue
    }
    const t = normalizeSpace(el.textContent ?? "").length
    max = Math.max(max, t)
  }

  // Unstructured blob: root (or top-level div) with lots of text and few block children
  if (blocks.length === 0) {
    max = Math.max(max, normalizeSpace(root.textContent ?? "").length)
  } else if (paragraphsAndLists(root) === 0 && blocks.filter((b) => /^H[1-6]$/i.test(b.tagName)).length === 0) {
    // Only media/etc. — check direct text-heavy divs without p children
    for (const div of Array.from(root.querySelectorAll("div"))) {
      if (div.querySelector(selectors)) continue
      const t = normalizeSpace(div.textContent ?? "").length
      max = Math.max(max, t)
    }
  }

  return max
}

function paragraphsAndLists(root: Element): number {
  return root.querySelectorAll("p, li").length
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function dedupeWarnings(warnings: WebImportWarning[]): WebImportWarning[] {
  const seen = new Set<string>()
  const out: WebImportWarning[] = []
  for (const w of warnings) {
    const key = `${w.code}::${w.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}
