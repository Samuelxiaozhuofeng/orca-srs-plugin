/**
 * EPUB ZIP/container/OPF/nav/NCX parser.
 * Behavior aligned with orca-epub epub-parser.ts, plus stable chapter keys.
 */

import JSZip from "jszip"
import { EpubAssetUploader } from "./epubAssets"
import {
  extractDocumentFallbackTitle,
  extractTopHeadingTitle,
  getHtmlContentRoot,
  parseHtml,
  preferChapterTitle,
  removeMatchingTopHeading,
  rewriteImageSources
} from "./epubHtml"
import {
  assertChapterCount,
  assertEpubCompressedSize,
  assertXhtmlSize,
  assertZipEntryCount,
  DecompressedBudgetTracker,
  isHardEpubControlError,
  throwIfAborted,
  yieldToMain
} from "./epubLimits"
import { sanitizeEpubHtmlForImport } from "./epubSanitize"
import {
  expandLogicalFragmentChapters as expandLogicalFragmentChaptersCore,
  planChapters,
  selectFragmentEntriesForPath,
  sliceChapterPrefixUntilFragment,
  type TocEntry
} from "./epubChapterPlan"
import type {
  EpubChapter,
  EpubChapterGranularity,
  EpubManifestItem,
  EpubMetadata,
  ParsedEpub
} from "./types"
import { computeSha256Hex } from "./fingerprint"

export class EpubParser {
  private zip: JSZip | null = null
  private assetUploader: EpubAssetUploader | null = null
  private opfPath = ""
  private opfDir = ""
  private budget: DecompressedBudgetTracker | null = null
  private compressedBytes = 0
  private signal: AbortSignal | undefined

  async load(data: ArrayBuffer, options?: { signal?: AbortSignal }): Promise<void> {
    throwIfAborted(options?.signal)
    assertEpubCompressedSize(data.byteLength)
    this.compressedBytes = data.byteLength
    this.signal = options?.signal
    this.budget = new DecompressedBudgetTracker(data.byteLength)

    this.zip = await JSZip.loadAsync(data)
    throwIfAborted(this.signal)
    const entryCount = Object.keys(this.zip.files).length
    assertZipEntryCount(entryCount)

    this.assetUploader = new EpubAssetUploader(this.zip, this.budget)

    const containerXml = await this.getFile("META-INF/container.xml")
    const containerDoc = new DOMParser().parseFromString(
      containerXml,
      "text/xml"
    )
    const rootfile = containerDoc.querySelector("rootfile")

    if (!rootfile) {
      throw new Error("Invalid EPUB: No rootfile found in container.xml")
    }

    this.opfPath = rootfile.getAttribute("full-path") || ""
    if (!this.opfPath) {
      throw new Error("Invalid EPUB: empty rootfile full-path")
    }
    this.opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf("/"))
    if (this.opfDir) {
      this.opfDir += "/"
    }
  }

  async getMetadata(): Promise<EpubMetadata> {
    const opfXml = await this.getFile(this.opfPath)
    const doc = new DOMParser().parseFromString(opfXml, "text/xml")

    const getTextContent = (selectors: string[]): string => {
      for (const selector of selectors) {
        const el = doc.querySelector(selector)
        if (el?.textContent) {
          return el.textContent
        }
      }
      return ""
    }

    return {
      title:
        getTextContent(["dc\\:title", "title", "*|title"]) || "Unknown Title",
      author:
        getTextContent(["dc\\:creator", "creator", "*|creator"]) ||
        "Unknown Author",
      language: getTextContent(["dc\\:language", "language", "*|language"]),
      publisher: getTextContent(["dc\\:publisher", "publisher", "*|publisher"]),
      description: getTextContent([
        "dc\\:description",
        "description",
        "*|description"
      ])
    }
  }

  async getChapters(options?: {
    granularity?: EpubChapterGranularity
  }): Promise<EpubChapter[]> {
    const granularity: EpubChapterGranularity = options?.granularity ?? "auto"
    const opfXml = await this.getFile(this.opfPath)
    const doc = new DOMParser().parseFromString(opfXml, "text/xml")

    const manifestItems = new Map<string, EpubManifestItem>()
    doc.querySelectorAll("manifest > item").forEach((item) => {
      const id = item.getAttribute("id") || ""
      manifestItems.set(id, {
        id,
        href: item.getAttribute("href") || "",
        mediaType: item.getAttribute("media-type") || ""
      })
    })

    const spineRefs = doc.querySelectorAll("spine > itemref")
    const spineChapters: EpubChapter[] = []
    const usedKeys = new Set<string>()
    const coverHrefs = collectCoverHrefs(doc)

    spineRefs.forEach((ref, index) => {
      const idref = ref.getAttribute("idref") || ""
      const manifestItem = manifestItems.get(idref)

      if (manifestItem) {
        if (isCoverManifestItem(manifestItem, coverHrefs)) return
        if (
          manifestItem.mediaType.includes("html") ||
          manifestItem.mediaType.includes("xhtml")
        ) {
          const key = makeChapterKey(manifestItem.href, index, usedKeys)
          spineChapters.push({
            id: manifestItem.id,
            title: "",
            href: manifestItem.href,
            key,
            spineIndex: index
          })
        }
      }
    })

    const toc = await this.collectTocEntries(doc, manifestItems)
    applyFileLevelTocTitles(spineChapters, toc)

    const contentByPath = new Map<string, HtmlSourceCache>()
    if (granularity === "auto") {
      await this.preloadMultiFragmentSources(
        spineChapters,
        toc,
        contentByPath
      )
    }

    const chapters = planChapters(
      spineChapters,
      toc,
      granularity,
      (path) => contentByPath.get(this.resolvePath(path))?.root ?? null,
      makeChapterKey,
      (href) => normalizeComparableHref(href),
      findAnchorElement
    )
    assertChapterCount(chapters.length)

    await this.enrichChapterTitlesFromContent(chapters, contentByPath)

    return chapters
  }

  /**
   * Collect nav then NCX TOC entries in document order.
   * Soft parse failures are warned; hard control errors rethrow.
   */
  private async collectTocEntries(
    opfDoc: Document,
    manifestItems: Map<string, EpubManifestItem>
  ): Promise<TocEntry[]> {
    const entries: TocEntry[] = []
    await this.collectNavTocEntries(entries, opfDoc)
    await this.collectNcxTocEntries(entries, opfDoc, manifestItems)
    return entries
  }

  private async collectNavTocEntries(
    entries: TocEntry[],
    opfDoc: Document
  ): Promise<void> {
    const navItem = opfDoc.querySelector('manifest > item[properties*="nav"]')
    if (!navItem) return

    const navHref = navItem.getAttribute("href")
    if (!navHref) return

    try {
      const navContent = await this.getFile(this.resolvePath(navHref))
      const navDoc = new DOMParser().parseFromString(navContent, "text/html")
      const tocNav = navDoc.querySelector('nav[epub\\:type="toc"], nav.toc')
      if (!tocNav) return

      const navDir = hrefDirectory(navHref)
      const order = { n: 0 }
      const topList = firstChildList(tocNav)
      if (topList) {
        walkNavList(topList, null, 0, navDir, entries, order)
      } else {
        // Flat fallback: anchors without list structure (preserve document order).
        tocNav.querySelectorAll("a").forEach((a) => {
          pushNavAnchor(a, null, 0, navDir, entries, order)
        })
      }
    } catch (error) {
      if (isHardEpubControlError(error)) throw error
      // Soft nav failure only: fall through to NCX.
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[epub] Failed to parse navigation document titles", error)
      }
    }
  }

  private async collectNcxTocEntries(
    entries: TocEntry[],
    opfDoc: Document,
    manifestItems: Map<string, EpubManifestItem>
  ): Promise<void> {
    const spine = opfDoc.querySelector("spine")
    const tocId = spine?.getAttribute("toc")
    if (!tocId) return

    const ncxItem = manifestItems.get(tocId)
    if (!ncxItem) return

    try {
      const ncxContent = await this.getFile(this.resolvePath(ncxItem.href))
      const ncxDoc = new DOMParser().parseFromString(ncxContent, "text/xml")
      const ncxDir = hrefDirectory(ncxItem.href)
      const order = { n: 0 }
      const navMap = ncxDoc.querySelector("navMap")
      if (!navMap) return
      for (const child of Array.from(navMap.children)) {
        if (localName(child) === "navpoint") {
          walkNcxNavPoint(child, null, 0, ncxDir, entries, order)
        }
      }
    } catch (error) {
      if (isHardEpubControlError(error)) throw error
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[epub] Failed to parse NCX titles", error)
      }
    }
  }

  private async preloadMultiFragmentSources(
    spineChapters: EpubChapter[],
    toc: TocEntry[],
    contentByPath: Map<string, HtmlSourceCache>
  ): Promise<void> {
    for (const chapter of spineChapters) {
      throwIfAborted(this.signal)
      const path = normalizeComparableHref(chapter.href)
      if (selectFragmentEntriesForPath(toc, path).length < 2) continue
      await this.ensureHtmlSource(chapter.href, contentByPath)
    }
  }

  private async ensureHtmlSource(
    href: string,
    contentByPath: Map<string, HtmlSourceCache>
  ): Promise<HtmlSourceCache> {
    const fullPath = this.resolvePath(href)
    let source = contentByPath.get(fullPath)
    if (source) return source
    const content = await this.getFile(fullPath)
    const doc = parseHtml(content)
    source = {
      content,
      doc,
      root: getHtmlContentRoot(doc, content)
    }
    contentByPath.set(fullPath, source)
    return source
  }

  private async enrichChapterTitlesFromContent(
    chapters: EpubChapter[],
    contentByPath: Map<string, HtmlSourceCache> = new Map()
  ): Promise<void> {
    for (let index = 0; index < chapters.length; index++) {
      throwIfAborted(this.signal)
      const chapter = chapters[index]
      try {
        const source = await this.ensureHtmlSource(chapter.href, contentByPath)

        const startFragment = extractHrefFragment(chapter.href)
        let contentTitle = ""
        if (startFragment) {
          contentTitle = extractFragmentHeadingTitle(
            source.root,
            startFragment,
            chapter.endFragment,
            chapter.href
          )
        } else if (chapter.endFragment) {
          const prefixRoot = sliceChapterPrefixUntilFragment(
            source.root,
            chapter.endFragment,
            chapter.href,
            findAnchorElement
          )
          contentTitle = extractTopHeadingTitle(prefixRoot)
        } else {
          contentTitle = extractTopHeadingTitle(source.root)
        }
        if (contentTitle) {
          chapter.title = preferChapterTitle(chapter.title, contentTitle)
        } else if (!chapter.title) {
          const fallbackRoot = startFragment
            ? sliceChapterByFragments(
              source.root,
              startFragment,
              chapter.endFragment,
              chapter.href
            )
            : chapter.endFragment
              ? sliceChapterPrefixUntilFragment(
                source.root,
                chapter.endFragment,
                chapter.href,
                findAnchorElement
              )
              : source.root
          chapter.title = extractDocumentFallbackTitle(source.doc, fallbackRoot, [
            chapter.id,
            chapter.href
          ])
        }
      } catch (error) {
        if (isHardEpubControlError(error)) throw error
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            `[epub] Failed to extract content title for ${chapter.href}`,
            error
          )
        }
      }
      if (!chapter.title) chapter.title = `未命名章节 ${index + 1}`
      // Macrotask yield so AbortSignal handlers can run (Promise.resolve does not).
      if (index > 0 && index % 20 === 0) {
        await yieldToMain(this.signal)
      }
    }
  }

  async getChapterContent(
    href: string,
    pageTitle: string,
    options?: { endFragment?: string }
  ): Promise<string> {
    throwIfAborted(this.signal)
    const fullPath = this.resolvePath(href)
    const content = await this.getFile(fullPath)

    const doc = parseHtml(content)
    let root = getHtmlContentRoot(doc, content)

    const startFragment = extractHrefFragment(href)
    if (startFragment) {
      root = sliceChapterByFragments(
        root,
        startFragment,
        options?.endFragment,
        href
      )
    } else if (options?.endFragment) {
      root = sliceChapterPrefixUntilFragment(
        root,
        options.endFragment,
        href,
        findAnchorElement
      )
    }

    removeMatchingTopHeading(root, pageTitle)

    await this.rewriteImageSourcesForChapter(root, fullPath)
    // Strict security sanitizer (not the Orca <a href> compatibility helper alone).
    sanitizeEpubHtmlForImport(root as HTMLElement)

    return root.innerHTML
  }

  private async rewriteImageSourcesForChapter(
    root: ParentNode,
    htmlFilePath: string
  ): Promise<void> {
    if (!this.assetUploader) {
      throw new Error("EPUB not loaded. Call load() first.")
    }

    await rewriteImageSources(root, (src) =>
      this.assetUploader?.uploadImage(src, htmlFilePath) ?? Promise.resolve(null)
    )
  }

  private async getFile(path: string): Promise<string> {
    if (!this.zip) {
      throw new Error("EPUB not loaded. Call load() first.")
    }
    throwIfAborted(this.signal)

    const file = this.zip.file(path)
    if (!file) {
      throw new Error(`File not found in EPUB: ${path}`)
    }

    const data = await file.async("arraybuffer")
    throwIfAborted(this.signal)
    this.budget?.add(data.byteLength, path)
    if (/\.(x?html?|xml)$/i.test(path)) {
      assertXhtmlSize(data.byteLength, path)
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(data)
  }

  private resolvePath(href: string): string {
    const pathOnly = href.split("#")[0]
    if (pathOnly.startsWith("/")) {
      return normalizePathSegments(pathOnly.substring(1))
    }

    return normalizePathSegments(this.opfDir + pathOnly)
  }
}

/**
 * Stable chapter key: normalized href + spine index, with collision handling.
 * Fragments are preserved when present (logical multi-anchor chapters).
 * Fragment-free hrefs keep the historical `spineIndex:path` form.
 */
export function makeChapterKey(
  href: string,
  spineIndex: number,
  usedKeys: Set<string>
): string {
  const target = resolveHrefTarget(href, "")
  const normalized = target.fragment
    ? `${target.path}#${target.fragment}`
    : target.path
  let key = `${spineIndex}:${normalized}`
  if (!usedKeys.has(key)) {
    usedKeys.add(key)
    return key
  }
  let suffix = 1
  while (usedKeys.has(`${key}#${suffix}`)) {
    suffix += 1
  }
  key = `${key}#${suffix}`
  usedKeys.add(key)
  return key
}

/**
 * Normalize an OPF/spine href for identity (fragment stripped, slashes normalized).
 */
export function normalizeHref(href: string): string {
  return normalizeComparableHref(href, "")
}

/**
 * Normalize a nav/NCX/spine href into a comparable path relative to the OPF.
 *
 * - Strips fragment identifiers
 * - Resolves relative to `baseDir` (directory of the nav/NCX file, OPF-relative)
 * - Handles `.`, `..`, leading `/`, and `\`
 * - Best-effort URL decoding; malformed percent-encoding leaves the path unchanged
 */
export function normalizeComparableHref(href: string, baseDir = ""): string {
  return resolveHrefTarget(href, baseDir).path
}

/**
 * Resolve path + fragment for a nav/NCX/spine href.
 * Path matching still uses the fragment-stripped comparable path; fragment is
 * best-effort URL-decoded for logical chapter identity and anchor lookup.
 */
export function resolveHrefTarget(
  href: string,
  baseDir = ""
): { path: string; fragment: string } {
  const hashIndex = href.indexOf("#")
  let pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const rawFragment = hashIndex >= 0 ? href.slice(hashIndex + 1) : ""

  pathPart = pathPart.replace(/\\/g, "/")
  pathPart = safeDecodePath(pathPart)

  if (pathPart.startsWith("/")) {
    pathPart = pathPart.replace(/^\/+/, "")
  } else {
    const dir = baseDir.replace(/\\/g, "/")
    const prefix = dir && !dir.endsWith("/") ? `${dir}/` : dir
    pathPart = `${prefix}${pathPart}`
  }

  return {
    path: normalizePathSegments(pathPart),
    fragment: safeDecodeFragment(rawFragment)
  }
}

/** Best-effort fragment extraction + decode from an href (no base resolution). */
export function extractHrefFragment(href: string): string {
  const hashIndex = href.indexOf("#")
  if (hashIndex < 0) return ""
  return safeDecodeFragment(href.slice(hashIndex + 1))
}

/** Directory portion of an OPF-relative href, including trailing `/` when non-empty. */
export function hrefDirectory(href: string): string {
  const path = (href.split("#")[0] ?? "").replace(/\\/g, "/")
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(0, idx + 1) : ""
}

interface HtmlSourceCache {
  content: string
  doc: Document
  root: HTMLElement
}

/**
 * Apply file-level TOC titles to spine chapters.
 * Nav entries are listed before NCX; first title for a path wins (nav priority).
 * Fragment-only parent grouping entries still contribute a title when unmatched later.
 */
function applyFileLevelTocTitles(
  chapters: EpubChapter[],
  toc: TocEntry[]
): void {
  const chapterByHref = buildChapterHrefIndex(chapters)
  for (const entry of toc) {
    const chapter = chapterByHref.get(entry.path)
    if (chapter && !chapter.title) {
      chapter.title = entry.title
    }
  }
}

/**
 * Historical multi-fragment expand (toc-fragments). Kept for direct unit tests.
 * Whole-file parent TOC entries are not kept when ≥2 fragments exist.
 */
export function expandLogicalFragmentChapters(
  spineChapters: EpubChapter[],
  toc: TocEntry[]
): EpubChapter[] {
  return expandLogicalFragmentChaptersCore(
    spineChapters,
    toc,
    makeChapterKey,
    (href) => normalizeComparableHref(href)
  )
}

function buildChapterHrefIndex(chapters: EpubChapter[]): Map<string, EpubChapter> {
  const chapterByHref = new Map<string, EpubChapter>()
  for (const ch of chapters) {
    const key = normalizeComparableHref(ch.href)
    chapterByHref.set(key, ch)
  }
  return chapterByHref
}

function localName(el: Element): string {
  return (el.localName || el.tagName || "").toLowerCase()
}

function walkNcxNavPoint(
  navPoint: Element,
  parentId: string | null,
  depth: number,
  ncxDir: string,
  entries: TocEntry[],
  order: { n: number }
): void {
  const rawId = navPoint.getAttribute("id") || `ncx-gen-${order.n}`
  let label = ""
  let src = ""
  for (const child of Array.from(navPoint.children)) {
    const name = localName(child)
    if (name === "navlabel") {
      const textEl =
        Array.from(child.children).find((c) => localName(c) === "text")
        ?? child.querySelector("text")
      label = textEl?.textContent?.trim() || ""
    } else if (name === "content") {
      src = child.getAttribute("src") || ""
    }
  }

  let entryId: string | null = null
  if (label && src) {
    const target = resolveHrefTarget(src, ncxDir)
    if (target.path) {
      entryId = `ncx:${rawId}`
      entries.push({
        path: target.path,
        fragment: target.fragment,
        title: label,
        source: "ncx",
        id: entryId,
        parentId,
        depth,
        order: order.n++
      })
    }
  }

  const childParent = entryId ?? parentId
  const childDepth = entryId ? depth + 1 : depth
  for (const child of Array.from(navPoint.children)) {
    if (localName(child) === "navpoint") {
      walkNcxNavPoint(child, childParent, childDepth, ncxDir, entries, order)
    }
  }
}

function firstChildList(container: Element): Element | null {
  for (const child of Array.from(container.children)) {
    const name = localName(child)
    if (name === "ol" || name === "ul") return child
  }
  return null
}

function walkNavList(
  listEl: Element,
  parentId: string | null,
  depth: number,
  navDir: string,
  entries: TocEntry[],
  order: { n: number }
): void {
  for (const item of Array.from(listEl.children)) {
    if (localName(item) !== "li") continue
    let anchor: Element | null = null
    let nestedList: Element | null = null
    for (const child of Array.from(item.children)) {
      const name = localName(child)
      if (name === "a" && !anchor) anchor = child
      else if ((name === "ol" || name === "ul") && !nestedList) nestedList = child
    }
    // Some EPUBs wrap <a> in <span>.
    if (!anchor) {
      anchor = item.querySelector("a")
    }
    let entryId: string | null = null
    if (anchor) {
      entryId = pushNavAnchor(anchor, parentId, depth, navDir, entries, order)
    }
    if (nestedList) {
      walkNavList(
        nestedList,
        entryId ?? parentId,
        entryId ? depth + 1 : depth,
        navDir,
        entries,
        order
      )
    }
  }
}

function pushNavAnchor(
  anchor: Element,
  parentId: string | null,
  depth: number,
  navDir: string,
  entries: TocEntry[],
  order: { n: number }
): string | null {
  const href = anchor.getAttribute("href")
  const title = anchor.textContent?.trim()
  if (!href || !title) return null
  const target = resolveHrefTarget(href, navDir)
  if (!target.path) return null
  const id = `nav:${order.n}`
  entries.push({
    path: target.path,
    fragment: target.fragment,
    title,
    source: "nav",
    id,
    parentId,
    depth,
    order: order.n++
  })
  return id
}

/**
 * Slice chapter body from start fragment (inclusive) to end fragment (exclusive)
 * using structured DOM Range APIs. Missing anchors throw — never fall back to whole file.
 */
export function sliceChapterByFragments(
  root: HTMLElement,
  startFragment: string,
  endFragment: string | undefined,
  hrefForError: string
): HTMLElement {
  const { startEl, endEl } = resolveFragmentBounds(
    root,
    startFragment,
    endFragment,
    hrefForError
  )

  const doc = root.ownerDocument
  if (!doc) {
    throw new Error(
      `EPUB chapter slice failed (no ownerDocument): href=${hrefForError} fragment=${startFragment}`
    )
  }

  const range = doc.createRange()
  range.setStartBefore(startEl)
  if (endEl) {
    range.setEndBefore(endEl)
  } else {
    range.setEnd(root, root.childNodes.length)
  }

  const cloned = range.cloneContents()
  const container = doc.createElement("div")
  container.appendChild(cloned)
  return container
}

function extractFragmentHeadingTitle(
  root: HTMLElement,
  startFragment: string,
  endFragment: string | undefined,
  hrefForError: string
): string {
  const { startEl, endEl } = resolveFragmentBounds(
    root,
    startFragment,
    endFragment,
    hrefForError
  )
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))
  const firstHeading = headings.find((heading) => {
    const startsInHeading = heading === startEl || heading.contains(startEl)
    const followsStart = Boolean(
      startEl.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    )
    if (!startsInHeading && !followsStart) return false
    if (!endEl) return true
    if (heading === endEl || heading.contains(endEl)) return false
    return Boolean(
      heading.compareDocumentPosition(endEl) & Node.DOCUMENT_POSITION_FOLLOWING
    )
  })
  if (!firstHeading) return ""

  const container = root.ownerDocument.createElement("div")
  container.appendChild(firstHeading.cloneNode(true))
  return extractTopHeadingTitle(container)
}

function resolveFragmentBounds(
  root: ParentNode,
  startFragment: string,
  endFragment: string | undefined,
  hrefForError: string
): { startEl: Element; endEl: Element | null } {
  const startEl = findAnchorElement(root, startFragment)
  if (!startEl) {
    throw new Error(
      `EPUB chapter start anchor not found: href=${hrefForError} fragment=${startFragment}`
    )
  }

  if (!endFragment) return { startEl, endEl: null }

  const endEl = findAnchorElement(root, endFragment)
  if (!endEl) {
    throw new Error(
      `EPUB chapter end anchor not found: href=${hrefForError} fragment=${endFragment}`
    )
  }
  const position = startEl.compareDocumentPosition(endEl)
  if ((position & Node.DOCUMENT_POSITION_FOLLOWING) === 0) {
    throw new Error(
      `EPUB chapter fragment order invalid: href=${hrefForError} start=${startFragment} end=${endFragment}`
    )
  }
  return { startEl, endEl }
}

/** Resolve an HTML anchor by id or name within a content root. */
export function findAnchorElement(
  root: ParentNode,
  fragment: string
): Element | null {
  if (!fragment) return null
  const escaped = cssEscapeAttr(fragment)

  const byId = queryWithin(root, `[id="${escaped}"]`)
  if (byId) return byId

  const byName = queryWithin(root, `[name="${escaped}"]`)
  if (byName) return byName

  return null
}

function queryWithin(root: ParentNode, selector: string): Element | null {
  if (typeof Element !== "undefined" && root instanceof Element) {
    if (root.matches?.(selector)) return root
  }
  return (root as ParentNode & { querySelector?: (s: string) => Element | null })
    .querySelector?.(selector) ?? null
}

function cssEscapeAttr(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  // Minimal attribute-value escape when CSS.escape is unavailable.
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")
}

function safeDecodeFragment(raw: string): string {
  if (!raw) return ""
  try {
    return decodeURIComponent(raw)
  } catch {
    // Best-effort: keep raw fragment when percent-encoding is malformed.
    return raw
  }
}

function normalizePathSegments(path: string): string {
  const resolved: string[] = []
  for (const part of path.split("/")) {
    if (part === "..") {
      resolved.pop()
    } else if (part !== "." && part !== "") {
      resolved.push(part)
    }
  }
  return resolved.join("/")
}

/**
 * Decode percent-encoded path segments without throwing on malformed sequences.
 * Intentional fallback (not silent error swallowing): keep original on failure.
 */
function safeDecodePath(path: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(path) && !/%/.test(path)) {
    return path
  }
  try {
    return path
      .split("/")
      .map((segment) => {
        try {
          return decodeURIComponent(segment)
        } catch {
          // Malformed encoding in this segment — keep raw segment.
          return segment
        }
      })
      .join("/")
  } catch {
    return path
  }
}

function collectCoverHrefs(opfDoc: Document): Set<string> {
  const hrefs = new Set<string>()
  opfDoc.querySelectorAll("guide > reference").forEach((reference) => {
    if ((reference.getAttribute("type") ?? "").toLowerCase() !== "cover") return
    const href = reference.getAttribute("href")
    if (href) hrefs.add(normalizeHref(href).toLowerCase())
  })
  return hrefs
}

function isCoverManifestItem(
  item: EpubManifestItem,
  coverHrefs: Set<string>
): boolean {
  const href = normalizeHref(item.href).toLowerCase()
  if (coverHrefs.has(href)) return true
  const semanticName = `${item.id} ${href}`.toLowerCase()
  return /(^|[^a-z0-9])cover(?:[_-]?page)?([^a-z0-9]|$)/.test(semanticName)
}

export interface ParseEpubOptions {
  signal?: AbortSignal
  /** Chapter planning mode; default `auto` (new imports / preview). */
  granularity?: EpubChapterGranularity
}

/**
 * Parse an EPUB buffer into metadata + ordered chapters + fingerprint.
 * Does not write to Orca. Enforces resource budgets before any backend call.
 */
export async function parseEpub(
  buffer: ArrayBuffer,
  options?: ParseEpubOptions
): Promise<ParsedEpub> {
  throwIfAborted(options?.signal)
  assertEpubCompressedSize(buffer.byteLength)
  const fingerprint = await computeSha256Hex(buffer)
  const parser = new EpubParser()
  await parser.load(buffer, { signal: options?.signal })
  const metadata = await parser.getMetadata()
  const chapters = await parser.getChapters({
    granularity: options?.granularity ?? "auto"
  })
  return { metadata, chapters, fingerprint }
}

export {
  SUBSTANTIVE_PREFIX_MIN_CHARS,
  hasSubstantivePrefix,
  sliceChapterPrefixUntilFragment
} from "./epubChapterPlan"

export { computeSha256Hex }
