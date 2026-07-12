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
  rewriteImageSources,
  sanitizeHtmlForOrca
} from "./epubHtml"
import type {
  EpubChapter,
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

  async load(data: ArrayBuffer): Promise<void> {
    this.zip = await JSZip.loadAsync(data)
    this.assetUploader = new EpubAssetUploader(this.zip)

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

  async getChapters(): Promise<EpubChapter[]> {
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
    const chapters: EpubChapter[] = []
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
          chapters.push({
            id: manifestItem.id,
            title: "",
            href: manifestItem.href,
            key,
            spineIndex: index
          })
        }
      }
    })

    await this.enrichChapterTitles(chapters, doc, manifestItems)
    await this.enrichChapterTitlesFromContent(chapters)

    return chapters
  }

  private async enrichChapterTitles(
    chapters: EpubChapter[],
    opfDoc: Document,
    manifestItems: Map<string, EpubManifestItem>
  ): Promise<void> {
    const chapterByHref = buildChapterHrefIndex(chapters)

    // EPUB 3: Navigation Document — apply matches; do not return early.
    // Zero matches or partial matches still allow NCX to fill gaps.
    await this.applyNavTitles(chapterByHref, opfDoc)

    // EPUB 2 NCX (or dual-nav books): only fill chapters still without a title.
    await this.applyNcxTitles(chapterByHref, opfDoc, manifestItems)
  }

  private async applyNavTitles(
    chapterByHref: Map<string, EpubChapter>,
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
      tocNav.querySelectorAll("a").forEach((a) => {
        const href = a.getAttribute("href")
        const title = a.textContent?.trim()
        if (!href || !title) return

        const key = normalizeComparableHref(href, navDir)
        const chapter = chapterByHref.get(key)
        if (chapter && !chapter.title) {
          chapter.title = title
        }
      })
    } catch (error) {
      // Fall through to NCX; keep prior behavior of not failing the whole parse.
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[epub] Failed to parse navigation document titles", error)
      }
    }
  }

  private async applyNcxTitles(
    chapterByHref: Map<string, EpubChapter>,
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

      ncxDoc.querySelectorAll("navPoint").forEach((navPoint) => {
        const label = navPoint.querySelector("navLabel > text")?.textContent?.trim()
        const content = navPoint.querySelector("content")
        const src = content?.getAttribute("src")
        if (!label || !src) return

        const key = normalizeComparableHref(src, ncxDir)
        const chapter = chapterByHref.get(key)
        // Only fill gaps — never overwrite a title already set by nav.
        if (chapter && !chapter.title) {
          chapter.title = label
        }
      })
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[epub] Failed to parse NCX titles", error)
      }
    }
  }

  private async enrichChapterTitlesFromContent(
    chapters: EpubChapter[]
  ): Promise<void> {
    for (let index = 0; index < chapters.length; index++) {
      const chapter = chapters[index]
      try {
        const content = await this.getFile(this.resolvePath(chapter.href))
        const doc = parseHtml(content)
        const root = getHtmlContentRoot(doc, content)
        const contentTitle = extractTopHeadingTitle(root)
        if (contentTitle) {
          chapter.title = preferChapterTitle(chapter.title, contentTitle)
        } else if (!chapter.title) {
          chapter.title = extractDocumentFallbackTitle(doc, root, [
            chapter.id,
            chapter.href
          ])
        }
      } catch (error) {
        // Keep previous title; do not fail remaining chapters.
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            `[epub] Failed to extract content title for ${chapter.href}`,
            error
          )
        }
      }
      if (!chapter.title) chapter.title = `未命名章节 ${index + 1}`
    }
  }

  async getChapterContent(href: string, pageTitle: string): Promise<string> {
    const fullPath = this.resolvePath(href)
    const content = await this.getFile(fullPath)

    const doc = parseHtml(content)
    const root = getHtmlContentRoot(doc, content)
    removeMatchingTopHeading(root, pageTitle)

    await this.rewriteImageSourcesForChapter(root, fullPath)
    sanitizeHtmlForOrca(root)

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

    const file = this.zip.file(path)
    if (!file) {
      throw new Error(`File not found in EPUB: ${path}`)
    }

    return await file.async("string")
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
 */
export function makeChapterKey(
  href: string,
  spineIndex: number,
  usedKeys: Set<string>
): string {
  const normalized = normalizeHref(href)
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
  let path = href.split("#")[0] ?? ""
  path = path.replace(/\\/g, "/")
  path = safeDecodePath(path)

  if (path.startsWith("/")) {
    path = path.replace(/^\/+/, "")
  } else {
    const dir = baseDir.replace(/\\/g, "/")
    const prefix = dir && !dir.endsWith("/") ? `${dir}/` : dir
    path = `${prefix}${path}`
  }

  return normalizePathSegments(path)
}

/** Directory portion of an OPF-relative href, including trailing `/` when non-empty. */
export function hrefDirectory(href: string): string {
  const path = (href.split("#")[0] ?? "").replace(/\\/g, "/")
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(0, idx + 1) : ""
}

function buildChapterHrefIndex(chapters: EpubChapter[]): Map<string, EpubChapter> {
  const chapterByHref = new Map<string, EpubChapter>()
  for (const ch of chapters) {
    const key = normalizeComparableHref(ch.href)
    chapterByHref.set(key, ch)
  }
  return chapterByHref
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

/**
 * Parse an EPUB buffer into metadata + ordered chapters + fingerprint.
 * Does not write to Orca.
 */
export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedEpub> {
  const fingerprint = await computeSha256Hex(buffer)
  const parser = new EpubParser()
  await parser.load(buffer)
  const metadata = await parser.getMetadata()
  const chapters = await parser.getChapters()
  return { metadata, chapters, fingerprint }
}

export { computeSha256Hex }
