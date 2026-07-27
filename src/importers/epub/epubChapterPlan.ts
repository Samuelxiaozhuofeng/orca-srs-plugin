/**
 * Chapter planning: multi-fragment expansion vs whole-file chapter+subsection.
 * Pure helpers used by epubParser (auto / toc-fragments / spine).
 */

import { titlesEquivalent } from "./epubHtml"
import type { EpubChapter, EpubChapterGranularity } from "./types"

/** Non-whitespace characters required before the first TOC fragment for "substantive prefix". */
export const SUBSTANTIVE_PREFIX_MIN_CHARS = 40

export interface TocEntry {
  path: string
  fragment: string
  title: string
  source: "nav" | "ncx"
  id: string
  parentId: string | null
  depth: number
  order: number
}

export type HtmlRootResolver = (path: string) => HTMLElement | null

export interface FragmentPlanEntry {
  fragment: string
  title: string
}

export interface MakeChapterKeyFn {
  (href: string, spineIndex: number, usedKeys: Set<string>): string
}

export interface NormalizePathFn {
  (href: string): string
}

export interface FindAnchorFn {
  (root: ParentNode, fragment: string): Element | null
}

/**
 * Prefer nav multi-fragment TOC for a path; NCX only when nav has fewer than 2.
 * Returns hierarchical entries from the chosen source (including whole-file parents).
 */
export function selectPreferredTocEntriesForPath(
  toc: TocEntry[],
  path: string
): TocEntry[] {
  const fromNav = toc.filter((e) => e.source === "nav" && e.path === path)
  if (uniqueFragmentEntries(fromNav).length >= 2) return fromNav
  return toc.filter((e) => e.source === "ncx" && e.path === path)
}

/** Distinct non-empty fragments in TOC order (first title wins per fragment). */
export function uniqueFragmentEntries(
  entries: Array<{ fragment: string; title: string }>
): FragmentPlanEntry[] {
  const seen = new Set<string>()
  const out: FragmentPlanEntry[] = []
  for (const entry of entries) {
    if (!entry.fragment || seen.has(entry.fragment)) continue
    seen.add(entry.fragment)
    out.push({ fragment: entry.fragment, title: entry.title })
  }
  return out
}

export function selectFragmentEntriesForPath(
  toc: TocEntry[],
  path: string
): FragmentPlanEntry[] {
  return uniqueFragmentEntries(selectPreferredTocEntriesForPath(toc, path))
}

/**
 * Historical expand: ≥2 fragments → replace whole-file chapter; drop parent whole-file TOC.
 */
export function expandLogicalFragmentChapters(
  spineChapters: EpubChapter[],
  toc: TocEntry[],
  makeChapterKey: MakeChapterKeyFn,
  normalizePath: NormalizePathFn
): EpubChapter[] {
  const usedKeys = new Set<string>()
  const result: EpubChapter[] = []

  for (const chapter of spineChapters) {
    const path = normalizePath(chapter.href)
    const fileHref = chapter.href.split("#")[0] ?? chapter.href
    const fragmentEntries = selectFragmentEntriesForPath(toc, path)

    if (fragmentEntries.length < 2) {
      usedKeys.add(chapter.key)
      result.push(chapter)
      continue
    }

    pushFragmentChapters(
      result,
      usedKeys,
      chapter,
      fileHref,
      fragmentEntries,
      makeChapterKey
    )
  }

  return result
}

/**
 * Auto plan: whole-file when TOC+DOM show chapter+subsection; else prefix+fragments or expand.
 */
export function expandLogicalFragmentChaptersAuto(
  spineChapters: EpubChapter[],
  toc: TocEntry[],
  getRoot: HtmlRootResolver,
  makeChapterKey: MakeChapterKeyFn,
  normalizePath: NormalizePathFn,
  findAnchor: FindAnchorFn
): EpubChapter[] {
  type SoftSignal = {
    path: string
    hierarchyOk: boolean
    parentHeadingOk: boolean
    childrenDeeperOk: boolean
    hasPrefix: boolean
    parent: TocEntry | null
    fragmentEntries: FragmentPlanEntry[]
    firstAnchor: Element | null
    root: HTMLElement | null
  }

  const signals: SoftSignal[] = []

  for (const chapter of spineChapters) {
    const path = normalizePath(chapter.href)
    const preferred = selectPreferredTocEntriesForPath(toc, path)
    const fragmentEntries = uniqueFragmentEntries(preferred)
    if (fragmentEntries.length < 2) {
      signals.push({
        path,
        hierarchyOk: false,
        parentHeadingOk: false,
        childrenDeeperOk: false,
        hasPrefix: false,
        parent: null,
        fragmentEntries,
        firstAnchor: null,
        root: null
      })
      continue
    }

    const root = getRoot(path)
    if (!root) {
      throw new Error(
        `EPUB chapter plan failed (HTML not loaded): path=${path}`
      )
    }

    const parent = findWholeChapterParent(preferred)
    const hierarchyOk = parent != null

    // Validate anchors in TOC order (hard fail — never silent).
    let prevEl: Element | null = null
    for (const entry of fragmentEntries) {
      const el = findAnchor(root, entry.fragment)
      if (!el) {
        throw new Error(
          `EPUB chapter plan start anchor not found: path=${path} fragment=${entry.fragment}`
        )
      }
      if (prevEl) {
        const position = prevEl.compareDocumentPosition(el)
        if ((position & Node.DOCUMENT_POSITION_FOLLOWING) === 0) {
          throw new Error(
            `EPUB chapter plan fragment order invalid: path=${path} before=${prevEl.id || "?"} after=${entry.fragment}`
          )
        }
      }
      prevEl = el
    }

    const firstAnchor = findAnchor(root, fragmentEntries[0].fragment)!
    const hasPrefix = hasSubstantivePrefix(root, firstAnchor)

    let parentHeadingOk = false
    let childrenDeeperOk = false
    if (parent) {
      const parentHeading = findMatchingParentHeading(
        root,
        firstAnchor,
        parent.title
      )
      parentHeadingOk = parentHeading != null
      if (parentHeading) {
        const parentLevel = headingLevel(parentHeading)
        childrenDeeperOk =
          parentLevel > 0
          && fragmentEntries.every((entry) => {
            const childLevel = fragmentHeadingLevel(
              root,
              entry.fragment,
              findAnchor
            )
            return childLevel > parentLevel
          })
      }
    }

    signals.push({
      path,
      hierarchyOk,
      parentHeadingOk,
      childrenDeeperOk,
      hasPrefix,
      parent,
      fragmentEntries,
      firstAnchor,
      root
    })
  }

  const softWholeCount = signals.filter(
    (s) =>
      s.fragmentEntries.length >= 2
      && s.hierarchyOk
      && s.parentHeadingOk
      && s.childrenDeeperOk
  ).length
  const repeatedStructure = softWholeCount >= 2

  const usedKeys = new Set<string>()
  const result: EpubChapter[] = []

  for (let i = 0; i < spineChapters.length; i++) {
    const chapter = spineChapters[i]
    const signal = signals[i]
    const fileHref = chapter.href.split("#")[0] ?? chapter.href

    if (signal.fragmentEntries.length < 2) {
      usedKeys.add(chapter.key)
      result.push(chapter)
      continue
    }

    const wholeContainer =
      signal.hierarchyOk
      && signal.parentHeadingOk
      && signal.childrenDeeperOk
      && (signal.hasPrefix || repeatedStructure)

    if (wholeContainer) {
      const titled = {
        ...chapter,
        title: signal.parent?.title || chapter.title
      }
      usedKeys.add(titled.key)
      result.push(titled)
      continue
    }

    // Fallback C: document-start prefix chapter + fragment chapters.
    if (signal.parent != null && signal.hasPrefix && signal.firstAnchor) {
      const prefixKey = makeChapterKey(fileHref, chapter.spineIndex, usedKeys)
      result.push({
        id: chapter.id,
        title: signal.parent.title || chapter.title,
        href: fileHref,
        key: prefixKey,
        spineIndex: chapter.spineIndex,
        endFragment: signal.fragmentEntries[0].fragment
      })
      pushFragmentChapters(
        result,
        usedKeys,
        chapter,
        fileHref,
        signal.fragmentEntries,
        makeChapterKey
      )
      continue
    }

    if (signal.hasPrefix && signal.parent == null && signal.firstAnchor) {
      // Has prefix content but no hierarchical parent: still protect lead-in.
      const prefixTitle = chapter.title || signal.fragmentEntries[0]?.title || ""
      const prefixKey = makeChapterKey(fileHref, chapter.spineIndex, usedKeys)
      result.push({
        id: chapter.id,
        title: prefixTitle,
        href: fileHref,
        key: prefixKey,
        spineIndex: chapter.spineIndex,
        endFragment: signal.fragmentEntries[0].fragment
      })
    }

    pushFragmentChapters(
      result,
      usedKeys,
      chapter,
      fileHref,
      signal.fragmentEntries,
      makeChapterKey
    )
  }

  return result
}

export function planChapters(
  spineChapters: EpubChapter[],
  toc: TocEntry[],
  granularity: EpubChapterGranularity,
  getRoot: HtmlRootResolver,
  makeChapterKey: MakeChapterKeyFn,
  normalizePath: NormalizePathFn,
  findAnchor: FindAnchorFn
): EpubChapter[] {
  if (granularity === "spine") {
    return spineChapters.map((ch) => ({ ...ch }))
  }
  if (granularity === "toc-fragments") {
    return expandLogicalFragmentChapters(
      spineChapters,
      toc,
      makeChapterKey,
      normalizePath
    )
  }
  return expandLogicalFragmentChaptersAuto(
    spineChapters,
    toc,
    getRoot,
    makeChapterKey,
    normalizePath,
    findAnchor
  )
}

/**
 * True when content before `firstAnchor` has enough body text or rich media.
 * Headings are excluded from the character count.
 */
export function hasSubstantivePrefix(
  root: HTMLElement,
  firstAnchor: Element
): boolean {
  const doc = root.ownerDocument
  if (!doc) return false

  const range = doc.createRange()
  try {
    range.setStart(root, 0)
    range.setEndBefore(firstAnchor)
  } catch {
    return false
  }

  const container = doc.createElement("div")
  container.appendChild(range.cloneContents())

  if (
    container.querySelector(
      "img, table, blockquote, pre, svg, video, audio, figure"
    )
  ) {
    return true
  }

  container.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => el.remove())
  const text = container.textContent ?? ""
  let nonWs = 0
  for (const ch of text) {
    if (!/\s/u.test(ch)) nonWs += 1
    if (nonWs >= SUBSTANTIVE_PREFIX_MIN_CHARS) return true
  }
  return false
}

/**
 * Slice [document start, endFragment) for prefix chapters.
 */
export function sliceChapterPrefixUntilFragment(
  root: HTMLElement,
  endFragment: string,
  hrefForError: string,
  findAnchor: FindAnchorFn
): HTMLElement {
  const endEl = findAnchor(root, endFragment)
  if (!endEl) {
    throw new Error(
      `EPUB chapter end anchor not found: href=${hrefForError} fragment=${endFragment}`
    )
  }
  const doc = root.ownerDocument
  if (!doc) {
    throw new Error(
      `EPUB chapter prefix slice failed (no ownerDocument): href=${hrefForError} fragment=${endFragment}`
    )
  }
  const range = doc.createRange()
  range.setStart(root, 0)
  range.setEndBefore(endEl)
  const cloned = range.cloneContents()
  const container = doc.createElement("div")
  container.appendChild(cloned)
  return container
}

function pushFragmentChapters(
  result: EpubChapter[],
  usedKeys: Set<string>,
  chapter: EpubChapter,
  fileHref: string,
  fragmentEntries: FragmentPlanEntry[],
  makeChapterKey: MakeChapterKeyFn
): void {
  for (let i = 0; i < fragmentEntries.length; i++) {
    const entry = fragmentEntries[i]
    const href = `${fileHref}#${entry.fragment}`
    const key = makeChapterKey(href, chapter.spineIndex, usedKeys)
    const next = fragmentEntries[i + 1]
    result.push({
      id: `${chapter.id}#${entry.fragment}`,
      title: entry.title,
      href,
      key,
      spineIndex: chapter.spineIndex,
      endFragment: next?.fragment
    })
  }
}

/**
 * Unfragmented parent P such that all path fragments are descendants of P.
 * Prefer the deepest such parent (chapter over outer group).
 */
export function findWholeChapterParent(entries: TocEntry[]): TocEntry | null {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const fragments = entries.filter((e) => e.fragment)
  const uniqueFrags = uniqueFragmentEntries(fragments)
  if (uniqueFrags.length < 2) return null

  const allFragIds = new Set(uniqueFrags.map((f) => f.fragment))
  const parents = entries.filter((e) => !e.fragment)
  let best: TocEntry | null = null

  for (const parent of parents) {
    const descFrags = fragments.filter((f) =>
      isAncestorOf(parent.id, f, byId)
    )
    const descSet = new Set(descFrags.map((f) => f.fragment))
    const coversAll = [...allFragIds].every((frag) => descSet.has(frag))
    if (!coversAll || descSet.size < 2) continue
    if (!best || parent.depth > best.depth || (
      parent.depth === best.depth && parent.order > best.order
    )) {
      best = parent
    }
  }
  return best
}

function isAncestorOf(
  ancestorId: string,
  entry: TocEntry,
  byId: Map<string, TocEntry>
): boolean {
  let pid = entry.parentId
  const guard = new Set<string>()
  while (pid) {
    if (pid === ancestorId) return true
    if (guard.has(pid)) return false
    guard.add(pid)
    pid = byId.get(pid)?.parentId ?? null
  }
  return false
}

function findMatchingParentHeading(
  root: HTMLElement,
  firstAnchor: Element,
  parentTitle: string
): Element | null {
  const headings = Array.from(
    root.querySelectorAll("h1, h2, h3, h4, h5, h6")
  )
  for (const heading of headings) {
    const pos = firstAnchor.compareDocumentPosition(heading)
    // heading precedes firstAnchor
    if ((pos & Node.DOCUMENT_POSITION_PRECEDING) === 0) continue
    if (titlesEquivalent(heading.textContent ?? "", parentTitle)) {
      return heading
    }
  }
  return null
}

function headingLevel(el: Element): number {
  const match = /^H([1-6])$/i.exec(el.tagName)
  return match ? Number(match[1]) : 0
}

function fragmentHeadingLevel(
  root: HTMLElement,
  fragment: string,
  findAnchor: FindAnchorFn
): number {
  const el = findAnchor(root, fragment)
  if (!el) return 0

  let cur: Element | null = el
  while (cur && cur !== root) {
    const level = headingLevel(cur)
    if (level > 0) return level
    cur = cur.parentElement
  }

  // Anchor on non-heading: use first following heading in document order.
  const headings = Array.from(
    root.querySelectorAll("h1, h2, h3, h4, h5, h6")
  )
  for (const heading of headings) {
    if (heading === el || el.contains(heading)) {
      return headingLevel(heading)
    }
    const pos = el.compareDocumentPosition(heading)
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
      return headingLevel(heading)
    }
  }
  return 0
}
