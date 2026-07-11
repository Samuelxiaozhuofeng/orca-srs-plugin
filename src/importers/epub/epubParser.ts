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
    const chapterByHref = new Map<string, EpubChapter>()
    chapters.forEach((ch) => {
      const baseHref = ch.href.split("#")[0]
      chapterByHref.set(ch.href, ch)
      chapterByHref.set(baseHref, ch)
    })

    // EPUB 3: Navigation Document
    const navItem = opfDoc.querySelector('manifest > item[properties*="nav"]')
    if (navItem) {
      const navHref = navItem.getAttribute("href")
      if (navHref) {
        try {
          const navContent = await this.getFile(this.resolvePath(navHref))
          const navDoc = new DOMParser().parseFromString(
            navContent,
            "text/html"
          )

          const tocNav = navDoc.querySelector('nav[epub\\:type="toc"], nav.toc')
          if (tocNav) {
            tocNav.querySelectorAll("a").forEach((a) => {
              const href = a.getAttribute("href")
              const title = a.textContent?.trim()
              if (href && title) {
                const baseHref = href.split("#")[0]
                const chapter = chapterByHref.get(baseHref)
                if (chapter) {
                  chapter.title = title
                }
              }
            })
            return
          }
        } catch {
          // Fall through to NCX
        }
      }
    }

    // EPUB 2: NCX fallback
    const spine = opfDoc.querySelector("spine")
    const tocId = spine?.getAttribute("toc")
    if (tocId) {
      const ncxItem = manifestItems.get(tocId)
      if (ncxItem) {
        try {
          const ncxContent = await this.getFile(
            this.resolvePath(ncxItem.href)
          )
          const ncxDoc = new DOMParser().parseFromString(ncxContent, "text/xml")

          ncxDoc.querySelectorAll("navPoint").forEach((navPoint) => {
            const label = navPoint.querySelector("navLabel > text")?.textContent?.trim()
            const content = navPoint.querySelector("content")
            const src = content?.getAttribute("src")
            if (label && src) {
              const baseHref = src.split("#")[0]
              const chapter = chapterByHref.get(baseHref)
              if (chapter) {
                chapter.title = label
              }
            }
          })
        } catch {
          // NCX parsing failed
        }
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
        const title = extractTopHeadingTitle(root)
        if (title) {
          chapter.title = title
        } else if (!chapter.title) {
          chapter.title = extractDocumentFallbackTitle(doc, root, [chapter.id, chapter.href])
        }
      } catch {
        // keep previous title
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
      return pathOnly.substring(1)
    }

    const parts = (this.opfDir + pathOnly).split("/")
    const resolved: string[] = []

    for (const part of parts) {
      if (part === "..") {
        resolved.pop()
      } else if (part !== "." && part !== "") {
        resolved.push(part)
      }
    }

    return resolved.join("/")
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

export function normalizeHref(href: string): string {
  return href.split("#")[0].replace(/^\//, "").replace(/\\/g, "/")
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
