/**
 * Book/chapter block writes and epub.* property persistence.
 * Plain notes only — never writes #card / srs.* / ir.* scheduling.
 */

import type { Block, BlockProperty, DbId } from "../../orca.d.ts"
import { parseEpubManifest, serializeEpubManifest } from "./manifest"
import type {
  EpubBookManifestV1,
  EpubChapter,
  EpubChapterManifestEntry,
  EpubImportStatus,
  EpubMetadata
} from "./types"
import { EPUB_PROP, EpubValidationError } from "./types"
import {
  createBookPage,
  createChapterPage,
  createInlineReference
} from "./orcaBookHelpers"

const PROP_TYPE_STRING = 2
const PROP_TYPE_NUMBER = 3

function getPropValue(block: Block | undefined, name: string): unknown {
  const value = block?.properties?.find((p) => p.name === name)?.value
  // Orca type=2 properties may be returned as a single-element array by get-block.
  // Only unwrap that known transport shape; ambiguous multi-value data must still fail validation.
  return Array.isArray(value) && value.length === 1 ? value[0] : value
}

async function getBlock(blockId: DbId): Promise<Block | undefined> {
  const cached = orca.state.blocks?.[blockId] as Block | undefined
  if (cached) return cached
  return (await orca.invokeBackend("get-block", blockId)) as Block | undefined
}

export async function setBookEpubProperties(
  bookBlockId: DbId,
  fields: {
    fingerprint: string
    sourceAssetPath: string
    importStatus: EpubImportStatus
    manifest: EpubBookManifestV1
  }
): Promise<void> {
  const manifestJson = serializeEpubManifest(fields.manifest)
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [bookBlockId],
    [
      { name: EPUB_PROP.fingerprint, value: fields.fingerprint, type: PROP_TYPE_STRING },
      { name: EPUB_PROP.sourceAssetPath, value: fields.sourceAssetPath, type: PROP_TYPE_STRING },
      { name: EPUB_PROP.importStatus, value: fields.importStatus, type: PROP_TYPE_STRING },
      { name: EPUB_PROP.manifest, value: manifestJson, type: PROP_TYPE_STRING }
    ]
  )
}

export async function persistManifest(
  bookBlockId: DbId,
  manifest: EpubBookManifestV1
): Promise<void> {
  const manifestJson = serializeEpubManifest(manifest)
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [bookBlockId],
    [
      { name: EPUB_PROP.importStatus, value: manifest.status, type: PROP_TYPE_STRING },
      { name: EPUB_PROP.manifest, value: manifestJson, type: PROP_TYPE_STRING }
    ]
  )
}

export async function setChapterEpubProperties(
  chapterBlockId: DbId,
  bookBlockId: DbId,
  chapter: Pick<EpubChapter, "key" | "spineIndex" | "href">
): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [chapterBlockId],
    [
      { name: EPUB_PROP.bookId, value: bookBlockId, type: PROP_TYPE_NUMBER },
      { name: EPUB_PROP.chapterKey, value: chapter.key, type: PROP_TYPE_STRING },
      { name: EPUB_PROP.spineIndex, value: chapter.spineIndex, type: PROP_TYPE_NUMBER },
      { name: EPUB_PROP.href, value: chapter.href, type: PROP_TYPE_STRING }
    ]
  )
}

export async function loadManifestFromBook(
  bookBlockId: DbId
): Promise<EpubBookManifestV1> {
  const block = await getBlock(bookBlockId)
  if (!block) {
    throw new EpubValidationError(
      `Book block #${bookBlockId} not found`,
      "book_missing",
      bookBlockId
    )
  }
  const raw = getPropValue(block, EPUB_PROP.manifest)
  return parseEpubManifest(raw, bookBlockId)
}

/**
 * Exact fingerprint lookup. Returns first matching book block id or null.
 */
export async function findBookByFingerprint(
  fingerprint: string
): Promise<DbId | null> {
  if (!fingerprint) return null

  // Prefer Orca property query when available.
  try {
    const result = await orca.invokeBackend("query", {
      q: {
        kind: 1,
        conditions: [
          {
            kind: 4,
            name: EPUB_PROP.fingerprint,
            value: fingerprint
          }
        ]
      }
    })
    if (Array.isArray(result) && result.length > 0) {
      const first = result[0]
      const id = typeof first === "number" ? first : (first as { id?: number })?.id
      if (typeof id === "number") return id
    }
  } catch {
    // fall through to state scan
  }

  // Fallback: scan loaded blocks
  const blocks = orca.state.blocks ?? {}
  for (const key of Object.keys(blocks)) {
    const block = blocks[key as unknown as number] as Block | undefined
    if (!block) continue
    const fp = getPropValue(block, EPUB_PROP.fingerprint)
    if (fp === fingerprint) {
      return block.id
    }
  }
  return null
}

/**
 * Suspect duplicates: same title (case-insensitive trim) but different fingerprint.
 */
export async function findSuspectedDuplicatesByTitle(
  title: string,
  fingerprint: string
): Promise<Array<{ bookBlockId: DbId; title: string }>> {
  const normalized = title.trim().toLowerCase()
  if (!normalized) return []

  const hits: Array<{ bookBlockId: DbId; title: string }> = []
  const blocks = orca.state.blocks ?? {}
  for (const key of Object.keys(blocks)) {
    const block = blocks[key as unknown as number] as Block | undefined
    if (!block) continue
    const fp = getPropValue(block, EPUB_PROP.fingerprint)
    if (typeof fp !== "string" || fp.length === 0) continue
    if (fp === fingerprint) continue
    const text = (block.text ?? "").trim().toLowerCase()
    if (text === normalized) {
      hits.push({ bookBlockId: block.id, title: block.text ?? title })
    }
  }
  return hits
}

/** Recover a chapter page created before its manifest checkpoint was saved. */
export async function findChapterBlockByIdentity(
  bookBlockId: DbId,
  chapterKey: string
): Promise<DbId | null> {
  const matchesOwner = (block: Block | undefined): block is Block =>
    Boolean(
      block
      && getPropValue(block, EPUB_PROP.bookId) === bookBlockId
      && getPropValue(block, EPUB_PROP.chapterKey) === chapterKey
    )

  try {
    const result = await orca.invokeBackend("query", {
      q: {
        kind: 1,
        conditions: [{ kind: 4, name: EPUB_PROP.chapterKey, value: chapterKey }]
      }
    })
    if (Array.isArray(result)) {
      for (const hit of result) {
        const candidate = typeof hit === "number"
          ? ((await getBlock(hit)) as Block | undefined)
          : hit as Block | undefined
        if (matchesOwner(candidate)) return candidate.id
      }
    }
  } catch {
    // Fall through to loaded-state recovery.
  }

  const blocks = orca.state.blocks ?? {}
  for (const key of Object.keys(blocks)) {
    const block = blocks[key as unknown as number] as Block | undefined
    if (matchesOwner(block)) return block.id
  }
  return null
}

export async function createBookShell(params: {
  bookTitle: string
  metadata: EpubMetadata
  fingerprint: string
  sourceFileName: string
  sourceAssetPath: string
  selectedChapters: EpubChapter[]
}): Promise<{ bookBlockId: DbId; chaptersHeadingId: DbId; manifest: EpubBookManifestV1 }> {
  const bookBlockId = await createBookPage(params.bookTitle)
  const bookBlock = orca.state.blocks[bookBlockId] as Block | undefined
  if (!bookBlock) {
    throw new Error(`Book block not found after create: ${bookBlockId}`)
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    bookBlock,
    "lastChild",
    [{ t: "t", v: `作者: ${params.metadata.author}` }]
  )

  if (params.metadata.description) {
    await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      orca.state.blocks[bookBlockId],
      "lastChild",
      [{ t: "t", v: params.metadata.description }]
    )
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    orca.state.blocks[bookBlockId],
    "lastChild",
    [{ t: "t", v: "" }]
  )

  const chaptersHeadingId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    orca.state.blocks[bookBlockId],
    "lastChild",
    [{ t: "t", v: "章节:" }],
    { type: "heading", level: 2 }
  )

  const chapterEntries: EpubChapterManifestEntry[] = params.selectedChapters.map((ch) => ({
    key: ch.key,
    spineIndex: ch.spineIndex,
    href: ch.href,
    title: ch.title,
    blockId: null,
    status: "pending" as const,
    error: null
  }))

  const manifest: EpubBookManifestV1 = {
    version: 1,
    fingerprint: params.fingerprint,
    sourceFileName: params.sourceFileName,
    sourceAssetPath: params.sourceAssetPath,
    status: "importing",
    bookBlockId,
    chapters: chapterEntries
  }

  await setBookEpubProperties(bookBlockId, {
    fingerprint: params.fingerprint,
    sourceAssetPath: params.sourceAssetPath,
    importStatus: "importing",
    manifest
  })

  return { bookBlockId, chaptersHeadingId, manifest }
}

/**
 * Error thrown after a chapter page was created but later steps failed.
 * Callers must persist `blockId` so resume can finish without duplicating pages.
 */
export class PartialChapterImportError extends Error {
  readonly blockId: DbId

  constructor(blockId: DbId, message: string) {
    super(message)
    this.name = "PartialChapterImportError"
    this.blockId = blockId
  }
}

/**
 * Import or finish one chapter.
 * - If `existingBlockId` is set (resume after partial failure), skip page creation
 *   and only ensure epub.* properties + catalog reference.
 * - On post-create failure, throws PartialChapterImportError with the page id.
 */
export async function importOneChapter(params: {
  bookBlockId: DbId
  chaptersHeadingId: DbId
  chapter: EpubChapter
  chapterHtml: string
  /** Resume path: already-created chapter page from a prior partial failure */
  existingBlockId?: DbId | null
}): Promise<DbId> {
  let chapterPageId = params.existingBlockId ?? null

  if (chapterPageId == null) {
    chapterPageId = await createChapterPage(params.chapter.title, params.chapterHtml, {
      useOutlineImport: true
    })
  }

  try {
    await setChapterEpubProperties(chapterPageId, params.bookBlockId, params.chapter)
    await ensureInlineReference(
      chapterPageId,
      params.chaptersHeadingId,
      params.chapter.title
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new PartialChapterImportError(chapterPageId, message)
  }

  return chapterPageId
}

/**
 * Create an inline catalog reference only if one for this target is not already present
 * under the chapters heading (avoids duplicate refs on resume).
 */
export async function ensureInlineReference(
  targetBlockId: DbId,
  parentBlockId: DbId,
  displayText: string
): Promise<DbId | null> {
  const parent = await getBlock(parentBlockId)
  if (!parent) {
    throw new Error(`Parent block not found: ${parentBlockId}`)
  }

  const childIds = parent.children ?? []
  let recoverableChildId: DbId | null = null
  for (const childId of childIds) {
    let child = orca.state.blocks?.[childId] as Block | undefined
    if (!child) {
      child = (await orca.invokeBackend("get-block", childId)) as Block | undefined
    }
    const refs = child?.refs ?? []
    const matchingRef = refs.find((ref) => ref.type === 1 && ref.to === targetBlockId)
    if (matchingRef) {
      const contentHasRef = child?.content?.some(
        (fragment) => fragment.t === "r" && fragment.v === matchingRef.id
      )
      if (!contentHasRef) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setBlocksContent",
          null,
          [{ id: childId, content: [{ t: "r", v: matchingRef.id, a: displayText }] }],
          false
        )
      }
      return childId
    }
    if (
      recoverableChildId == null
      && refs.length === 0
      && ((child?.text ?? "").trim() === "" || (child?.text ?? "").trim() === displayText.trim())
    ) {
      recoverableChildId = childId
    }
  }

  return await createInlineReference(
    targetBlockId,
    parentBlockId,
    displayText,
    recoverableChildId ?? undefined
  )
}

/**
 * Find the chapters heading child under a book, or create one.
 */
export async function ensureChaptersHeading(bookBlockId: DbId): Promise<DbId> {
  const book = await getBlock(bookBlockId)
  if (!book) {
    throw new Error(`Book block not found: ${bookBlockId}`)
  }

  const childIds = book.children ?? []
  for (const childId of childIds) {
    let child = orca.state.blocks?.[childId] as Block | undefined
    if (!child) {
      child = (await orca.invokeBackend("get-block", childId)) as Block | undefined
    }
    const text = (child?.text ?? "").trim()
    if (text === "章节:" || text === "Chapters:") {
      return childId
    }
  }

  return await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    orca.state.blocks[bookBlockId] ?? book,
    "lastChild",
    [{ t: "t", v: "章节:" }],
    { type: "heading", level: 2 }
  )
}

export function recomputeImportStatus(
  chapters: EpubChapterManifestEntry[]
): EpubImportStatus {
  if (chapters.length === 0) return "complete"
  const allImported = chapters.every((c) => c.status === "imported")
  if (allImported) return "complete"
  const anyImported = chapters.some((c) => c.status === "imported")
  if (anyImported) return "partial"
  const anyFailed = chapters.some((c) => c.status === "failed")
  return anyFailed ? "partial" : "importing"
}

export function listPropertyNames(props: BlockProperty[] | undefined): string[] {
  return props?.map((p) => p.name) ?? []
}
