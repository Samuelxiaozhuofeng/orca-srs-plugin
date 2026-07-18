/**
 * Web-only main-content extraction for Firecrawl HTML.
 * Uses Mozilla Readability plus conservative chrome cleanup.
 * Does not sanitize for Orca security — caller must still run sanitizeWebHtml.
 */

import { Readability } from "@mozilla/readability"
import { parseHtml } from "../epub/epubHtml"
import {
  stripStructuralChrome,
  hasExplicitChromeCue,
  parseHtmlWithBase,
  measurePlainText
} from "./webChromeStrip"

/** Bound DOM work: skip pathological documents. */
const MAX_ELEMENTS_TO_PARSE = 8_000
const MAX_HTML_CHARS = 2_000_000
const READABILITY_CHAR_THRESHOLD = 120
const MIN_KEEP_RATIO = 0.28
const MIN_EXTRACT_CHARS = 80

/** Readability result treated as a coherent article (prefer over chrome-heavy structural). */
const COHERENT_ARTICLE_MIN_CHARS = 400
const COHERENT_ARTICLE_MIN_PARAS = 3
const COHERENT_ARTICLE_MIN_HEADINGS = 2

export type ContentExtractionMethod =
  | "readability"
  | "structural"
  | "raw_fallback"

export interface ContentExtractionResult {
  html: string
  method: ContentExtractionMethod
  textLength: number
  inputTextLength: number
  warnings: string[]
  title?: string
  byline?: string
  siteName?: string
  excerpt?: string
}

/**
 * Extract article/main content from untrusted Firecrawl HTML.
 * Never silently returns an empty shell when the input had real text.
 */
export function extractMainContent(
  html: string,
  pageUrl: string
): ContentExtractionResult {
  const warnings: string[] = []
  const input = typeof html === "string" ? html : ""
  if (!input.trim()) {
    return {
      html: "",
      method: "raw_fallback",
      textLength: 0,
      inputTextLength: 0,
      warnings: ["抓取 HTML 为空"]
    }
  }

  if (input.length > MAX_HTML_CHARS) {
    warnings.push(
      `HTML 超过 ${MAX_HTML_CHARS} 字符上限，已截断后再提取（原长度 ${input.length}）`
    )
  }
  const bounded = input.length > MAX_HTML_CHARS
    ? input.slice(0, MAX_HTML_CHARS)
    : input

  const inputTextLength = measurePlainText(bounded)
  if (inputTextLength === 0) {
    return {
      html: bounded,
      method: "raw_fallback",
      textLength: 0,
      inputTextLength: 0,
      warnings: ["抓取结果几乎无可见文本"]
    }
  }

  const structural = stripStructuralChrome(bounded, pageUrl)
  const structuralTextLen = measurePlainText(structural.html)
  warnings.push(...structural.warnings)
  const structuralHasChrome = hasStrongChromeSignals(structural.html)

  const readable = tryReadability(structural.html, pageUrl)
  if (readable) {
    // Always run light trailing chrome cleanup on Readability output
    const cleanedReadable = stripStructuralChrome(readable.contentHtml, pageUrl)
    const readableHtml = cleanedReadable.html
    const readableLen = measurePlainText(readableHtml)
    warnings.push(...cleanedReadable.warnings.filter((w) => !structural.warnings.includes(w)))

    const keepRatio =
      structuralTextLen > 0 ? readableLen / structuralTextLen : 1
    const tooSmall =
      readableLen < MIN_EXTRACT_CHARS
      && structuralTextLen >= MIN_EXTRACT_CHARS * 2
    const discardedTooMuch =
      structuralTextLen >= 400 && keepRatio < MIN_KEEP_RATIO
    const lostStructure = readabilityLostRichStructure(
      structural.html,
      readableHtml
    )
    const lostCallout = readabilityLostArticleCallout(
      structural.html,
      readableHtml
    )
    const coherent = isCoherentArticle(readableHtml, readableLen)
    // Residual site chrome often leaves structural text >> readable even after partial strip
    const structuralBloated =
      coherent
      && readableLen >= COHERENT_ARTICLE_MIN_CHARS
      && structuralTextLen > readableLen * 1.75

    if (tooSmall) {
      warnings.push(
        `正文提取不确定（保留约 ${Math.round(keepRatio * 100)}% / ${readableLen} 字符），已回退到结构清洗结果`
      )
      return {
        html: structural.html,
        method: "structural",
        textLength: structuralTextLen,
        inputTextLength,
        warnings,
        title: readable.title,
        byline: readable.byline,
        siteName: readable.siteName,
        excerpt: readable.excerpt
      }
    }

    // Prefer coherent Readability by default (avoids reintroducing residual chrome lists).
    // Only fall back when we lost article callouts/code on a clean structural DOM,
    // or when the extract is incoherent and discarded too much.
    if (lostCallout && !structuralHasChrome && !structuralBloated) {
      warnings.push("提取结果丢失了文内 callout/aside，已回退到结构清洗结果")
      return {
        html: structural.html,
        method: "structural",
        textLength: structuralTextLen,
        inputTextLength,
        warnings,
        title: readable.title,
        byline: readable.byline,
        siteName: readable.siteName,
        excerpt: readable.excerpt
      }
    }

    if (!coherent && (discardedTooMuch || lostStructure)) {
      const reason = lostStructure
        ? "提取结果丢失了列表/表格/代码等结构"
        : `正文提取不确定（保留约 ${Math.round(keepRatio * 100)}% / ${readableLen} 字符）`
      warnings.push(`${reason}，已回退到结构清洗结果`)
      return {
        html: structural.html,
        method: "structural",
        textLength: structuralTextLen,
        inputTextLength,
        warnings,
        title: readable.title,
        byline: readable.byline,
        siteName: readable.siteName,
        excerpt: readable.excerpt
      }
    }

    if (structuralHasChrome || structuralBloated || (keepRatio < 0.55 && structuralTextLen >= 800)) {
      warnings.push(
        structuralHasChrome || structuralBloated
          ? `结构结果仍含站点外围或冗余内容，已采用 Readability 主文（约 ${readableLen} 字符）`
          : `已去除较多外围内容（保留约 ${Math.round(keepRatio * 100)}% 文本）`
      )
    }

    return {
      html: readableHtml,
      method: "readability",
      textLength: readableLen,
      inputTextLength,
      warnings,
      title: readable.title,
      byline: readable.byline,
      siteName: readable.siteName,
      excerpt: readable.excerpt
    }
  }

  warnings.push("Readability 未能识别主文，已使用结构清洗结果")
  return {
    html: structural.html,
    method: "structural",
    textLength: structuralTextLen,
    inputTextLength,
    warnings
  }
}

function isCoherentArticle(html: string, textLen: number): boolean {
  if (textLen < COHERENT_ARTICLE_MIN_CHARS) return false
  try {
    const doc = parseHtml(`<div id="__c">${html}</div>`)
    const root = doc.getElementById("__c") ?? doc.body
    if (!root) return false
    const paras = root.querySelectorAll("p").length
    const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6").length
    const lists = root.querySelectorAll("ul, ol").length
    return (
      paras >= COHERENT_ARTICLE_MIN_PARAS
      || (paras >= 2 && headings >= COHERENT_ARTICLE_MIN_HEADINGS)
      || (paras >= 2 && lists >= 1 && textLen >= COHERENT_ARTICLE_MIN_CHARS)
      || (textLen >= 2_000 && paras + headings >= 6)
    )
  } catch {
    return textLen >= COHERENT_ARTICLE_MIN_CHARS
  }
}

/**
 * Structural HTML still looks like a polluted full page (menus, search panels, related rails).
 */
export function hasStrongChromeSignals(html: string): boolean {
  const lower = html.toLowerCase()
  const text = normalizeSpace(html.replace(/<[^>]+>/g, " ")).toLowerCase()
  const chromePhrases = [
    "suggested searches",
    "discover more topics",
    "people also searched",
    "keep exploring",
    "view all topics",
    "related topics",
    "latest news"
  ]
  if (chromePhrases.some((p) => text.includes(p))) return true

  const chromeClassHints = [
    "hds-search",
    "global-nav",
    "usa-nav",
    "suggested-search",
    "topic-card",
    "hds-content-card",
    "site-nav",
    "megamenu",
    "navbox"
  ]
  if (chromeClassHints.some((c) => lower.includes(c))) {
    // Only strong if also heavy on links/headings relative to text
    try {
      const doc = parseHtml(`<div id="__ch">${html}</div>`)
      const root = doc.getElementById("__ch") ?? doc.body
      if (!root) return false
      const textLen = Math.max(1, normalizeSpace(root.textContent ?? "").length)
      const links = root.querySelectorAll("a").length
      const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6").length
      if (links >= 40 && links > textLen / 80) return true
      if (headings >= 30) return true
      if (chromePhrases.some((p) => text.includes(p))) return true
      // Class present + substantial link density
      if (links >= 25 && headings >= 15) return true
    } catch {
      return true
    }
  }
  return false
}

/**
 * True when Readability dropped real article structure (not residual site chrome lists).
 * List/link counts ignore nodes under nav/header/footer/chrome cues.
 */
function readabilityLostRichStructure(
  structuralHtml: string,
  readableHtml: string
): boolean {
  const rich = (html: string) => {
    try {
      const doc = parseHtml(`<div id="__s">${html}</div>`)
      const root = doc.getElementById("__s") ?? doc.body
      if (!root) {
        return { lists: 0, tables: 0, pres: 0, quotes: 0, paragraphs: 0, links: 0 }
      }
      const articleLists = countArticleLists(root)
      return {
        lists: articleLists,
        tables: countOutsideChrome(root, "table"),
        pres: countOutsideChrome(root, "pre"),
        quotes: countOutsideChrome(root, "blockquote"),
        paragraphs: countOutsideChrome(root, "p"),
        links: countOutsideChrome(root, "a[href]")
      }
    } catch {
      return { lists: 0, tables: 0, pres: 0, quotes: 0, paragraphs: 0, links: 0 }
    }
  }
  const before = rich(structuralHtml)
  const after = rich(readableHtml)
  const beforeTotal =
    before.lists + before.tables + before.pres + before.quotes
  const afterTotal = after.lists + after.tables + after.pres + after.quotes

  // Completely empty of rich blocks only matters when prose also collapsed
  if (beforeTotal >= 2 && afterTotal === 0 && after.paragraphs < 3) return true
  if (
    before.lists >= 1
    && after.lists === 0
    && before.tables >= 1
    && after.tables === 0
    && after.paragraphs < 3
  ) {
    return true
  }
  // Lost code blocks (high signal) even if prose remains
  if (before.pres >= 1 && after.pres === 0 && before.pres + before.tables >= 2) return true
  if (before.paragraphs >= 3 && after.paragraphs <= 1 && before.paragraphs - after.paragraphs >= 2) {
    return true
  }
  if (before.links >= 3 && after.links === 0 && before.paragraphs >= 2 && after.paragraphs <= 1) {
    return true
  }

  if (readabilityLostArticleCallout(structuralHtml, readableHtml)) return true
  return false
}

/** True when Readability dropped in-article callout/aside prose present in structural HTML. */
function readabilityLostArticleCallout(
  structuralHtml: string,
  readableHtml: string
): boolean {
  try {
    const sDoc = parseHtml(`<div id="__as">${structuralHtml}</div>`)
    const rDoc = parseHtml(`<div id="__ar">${readableHtml}</div>`)
    const sRoot = sDoc.getElementById("__as")
    const rRoot = rDoc.getElementById("__ar")
    if (!sRoot || !rRoot) return false
    const sAsides = Array.from(
      sRoot.querySelectorAll(
        "article aside, main aside, [role='main'] aside, aside.callout, aside.note"
      )
    ).filter((a) => !hasExplicitChromeCue(a))
    const sAsideText = sAsides
      .map((a) => normalizeSpace(a.textContent ?? ""))
      .filter((t) => t.length >= 20)
      .join(" ")
    if (sAsideText.length < 20) return false
    const rText = normalizeSpace(rRoot.textContent ?? "")
    const sample = sAsideText.slice(0, 40)
    return Boolean(sample && !rText.includes(sample.slice(0, 24)))
  } catch {
    return false
  }
}

function isUnderChromeContainer(el: Element): boolean {
  let n: Element | null = el
  while (n) {
    const tag = n.tagName.toUpperCase()
    if (tag === "NAV") return true
    if (hasExplicitChromeCue(n)) return true
    const role = (n.getAttribute("role") ?? "").toLowerCase()
    if (role === "navigation" || role === "banner" || role === "contentinfo" || role === "search") {
      return true
    }
    n = n.parentElement
  }
  return false
}

function countOutsideChrome(root: Element, selector: string): number {
  return Array.from(root.querySelectorAll(selector)).filter((el) => !isUnderChromeContainer(el))
    .length
}

function countArticleLists(root: Element): number {
  const inArticle = root.querySelectorAll(
    "article ul, article ol, main ul, main ol, [role='main'] ul, [role='main'] ol"
  )
  if (inArticle.length > 0) {
    return Array.from(inArticle).filter((el) => !isUnderChromeContainer(el)).length
  }
  return countOutsideChrome(root, "ul, ol")
}

interface ReadableParse {
  contentHtml: string
  textLength: number
  title?: string
  byline?: string
  siteName?: string
  excerpt?: string
}

function tryReadability(html: string, pageUrl: string): ReadableParse | null {
  try {
    const doc = parseHtmlWithBase(html, pageUrl)
    const clone = doc.cloneNode(true) as Document
    const article = new Readability(clone, {
      charThreshold: READABILITY_CHAR_THRESHOLD,
      maxElemsToParse: MAX_ELEMENTS_TO_PARSE
    }).parse()

    if (!article?.content || !String(article.content).trim()) {
      return null
    }

    const contentHtml = String(article.content)
    const textLength =
      typeof article.length === "number" && article.length > 0
        ? article.length
        : measurePlainText(contentHtml)

    if (textLength === 0) return null

    return {
      contentHtml,
      textLength,
      title: article.title?.trim() || undefined,
      byline: article.byline?.trim() || undefined,
      siteName: article.siteName?.trim() || undefined,
      excerpt: article.excerpt?.trim() || undefined
    }
  } catch (error) {
    console.error("[web-import] Readability extraction failed:", error)
    return null
  }
}


function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export { stripStructuralChrome, parseHtmlWithBase, measurePlainText } from "./webChromeStrip"
