/**
 * EPUB import orchestration: parse, dedupe, plain import, resume.
 * Never creates #card / srs.* / ir.* scheduling state.
 */

import { loadSourceEpubBuffer, uploadSourceEpub } from "./epubAssets"
import {
  createBookShell,
  ensureChaptersHeading,
  findBookByFingerprint,
  findChapterBlockByIdentity,
  findSuspectedDuplicatesByTitle,
  importOneChapter,
  loadManifestFromBook,
  PartialChapterImportError,
  persistManifest,
  recomputeImportStatus
} from "./epubBookRepository"
import { EpubParser, parseEpub } from "./epubParser"
import { computeSha256Hex } from "./fingerprint"
import type {
  EpubChapter,
  ImportEpubRequest,
  ImportEpubResult,
  ParsedEpub
} from "./types"
import { EpubValidationError } from "./types"
import { navigateToBlock } from "./orcaBookHelpers"
import type { DbId } from "../../orca.d.ts"

export { parseEpub }

export async function importEpub(request: ImportEpubRequest): Promise<ImportEpubResult> {
  const onProgress = request.onProgress
  onProgress?.({ phase: "parsing", message: "正在解析 EPUB…" })

  const fingerprint = await computeSha256Hex(request.buffer)
  const existingId = await findBookByFingerprint(fingerprint)
  if (existingId != null) {
    onProgress?.({ phase: "already_exists", message: "已导入过同一文件，正在打开…" })
    navigateToBlock(existingId)
    // Strict validation: never invent a fake complete manifest.
    const manifest = await loadManifestFromBook(existingId)
    return {
      kind: "already_exists",
      bookBlockId: existingId,
      bookTitle: request.bookTitle,
      fingerprint,
      status: manifest.status,
      manifest,
      importedChapterIds: manifest.chapters
        .filter((c) => c.status === "imported" && c.blockId != null)
        .map((c) => c.blockId as DbId),
      failedChapters: manifest.chapters.filter((c) => c.status === "failed"),
      pendingChapters: manifest.chapters.filter((c) => c.status === "pending")
    }
  }

  const parser = new EpubParser()
  await parser.load(request.buffer)
  const metadata = await parser.getMetadata()
  const allChapters = await parser.getChapters()

  const selectedKeys = new Set(request.selectedChapterKeys)
  const selectedChapters = allChapters.filter((ch) => selectedKeys.has(ch.key))
  if (selectedChapters.length === 0) {
    throw new EpubValidationError("未选择任何章节", "no_chapters")
  }

  const suspected = await findSuspectedDuplicatesByTitle(request.bookTitle, fingerprint)

  onProgress?.({ phase: "uploading_source", message: "正在上传源 EPUB 以便断点续传…" })
  let sourceAssetPath: string
  try {
    sourceAssetPath = await uploadSourceEpub(request.buffer, request.sourceFileName)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new EpubValidationError(
      `源 EPUB 上传失败，未创建笔记: ${message}`,
      "source_upload"
    )
  }

  onProgress?.({ phase: "creating_book", message: "正在创建书籍页…" })
  const { bookBlockId, chaptersHeadingId, manifest } = await createBookShell({
    bookTitle: request.bookTitle,
    metadata,
    fingerprint,
    sourceFileName: request.sourceFileName,
    sourceAssetPath,
    selectedChapters
  })

  const panelId = orca.state.activePanel
  try {
    orca.nav.replace("block", { blockId: bookBlockId }, panelId)
  } catch (error) {
    console.warn("[epub] Failed to switch panel to book page:", error)
  }

  const working = { ...manifest, chapters: manifest.chapters.map((c) => ({ ...c })) }

  for (let i = 0; i < selectedChapters.length; i++) {
    const chapter = selectedChapters[i]
    const entryIndex = working.chapters.findIndex((c) => c.key === chapter.key)
    onProgress?.({
      phase: "importing_chapters",
      message: `导入章节 ${i + 1}/${selectedChapters.length}: ${chapter.title}`,
      chapterIndex: i + 1,
      chapterTotal: selectedChapters.length,
      chapterTitle: chapter.title
    })

    try {
      const chapterHtml = await parser.getChapterContent(chapter.href, chapter.title)
      const chapterPageId = await importOneChapter({
        bookBlockId,
        chaptersHeadingId,
        chapter,
        chapterHtml
      })
      if (entryIndex >= 0) {
        working.chapters[entryIndex] = {
          ...working.chapters[entryIndex],
          blockId: chapterPageId,
          status: "imported",
          error: null
        }
      }
    } catch (error) {
      console.error("[epub] chapter import failed:", chapter.key, error)
      if (entryIndex >= 0) {
        working.chapters[entryIndex] = chapterFailureEntry(
          working.chapters[entryIndex],
          error
        )
      }
    }

    working.status = recomputeImportStatus(working.chapters)
    await persistManifest(bookBlockId, working)
  }

  working.status = recomputeImportStatus(working.chapters)
  await persistManifest(bookBlockId, working)
  navigateToBlock(bookBlockId)

  const result = toResult("created", request.bookTitle, working)
  if (suspected.length > 0) {
    result.suspectedDuplicates = suspected
  }
  onProgress?.({
    phase: working.status === "complete" ? "complete" : "partial",
    message: working.status === "complete" ? "导入完成" : "部分章节失败"
  })
  return result
}

export async function resumeEpubImport(bookBlockId: DbId): Promise<ImportEpubResult> {
  const manifest = await loadManifestFromBook(bookBlockId)
  if (!manifest.sourceAssetPath) {
    throw new EpubValidationError(
      `Book #${bookBlockId} 缺少源 EPUB 资源路径，无法继续导入`,
      "resume_no_source",
      bookBlockId
    )
  }

  const buffer = await loadSourceEpubBuffer(manifest.sourceAssetPath)
  const fingerprint = await computeSha256Hex(buffer)
  if (fingerprint !== manifest.fingerprint) {
    throw new EpubValidationError(
      `源 EPUB 指纹不匹配（期望 ${manifest.fingerprint.slice(0, 12)}…，实际 ${fingerprint.slice(0, 12)}…）。已停止，未修改清单。`,
      "resume_fingerprint_mismatch",
      bookBlockId
    )
  }

  const parser = new EpubParser()
  await parser.load(buffer)
  const allChapters = await parser.getChapters()
  const chapterByKey = new Map(allChapters.map((c) => [c.key, c]))

  const chaptersHeadingId = await ensureChaptersHeading(bookBlockId)
  const working = {
    ...manifest,
    chapters: manifest.chapters.map((c) => ({ ...c }))
  }

  const todo = working.chapters.filter((c) => c.status !== "imported")
  for (let i = 0; i < todo.length; i++) {
    const entry = todo[i]
    const chapter: EpubChapter | undefined = chapterByKey.get(entry.key)
    const entryIndex = working.chapters.findIndex((c) => c.key === entry.key)

    if (!chapter) {
      if (entryIndex >= 0) {
        working.chapters[entryIndex] = {
          ...working.chapters[entryIndex],
          status: "failed",
          error: `章节 ${entry.key} 在源 EPUB 中不存在`
        }
      }
      working.status = recomputeImportStatus(working.chapters)
      await persistManifest(bookBlockId, working)
      continue
    }

    try {
      const existingBlockId = entry.blockId
        ?? await findChapterBlockByIdentity(bookBlockId, entry.key)
      // Prefer existing page when a prior run created it but failed later (props/ref).
      // Avoid re-creating HTML content when finishing a partial page.
      const chapterTitle = entry.title || chapter.title
      const chapterHtml =
        existingBlockId != null
          ? ""
          : await parser.getChapterContent(chapter.href, chapterTitle)
      const chapterPageId = await importOneChapter({
        bookBlockId,
        chaptersHeadingId,
        chapter: { ...chapter, title: chapterTitle },
        chapterHtml,
        existingBlockId
      })
      if (entryIndex >= 0) {
        working.chapters[entryIndex] = {
          ...working.chapters[entryIndex],
          blockId: chapterPageId,
          status: "imported",
          error: null
        }
      }
    } catch (error) {
      if (entryIndex >= 0) {
        working.chapters[entryIndex] = chapterFailureEntry(
          working.chapters[entryIndex],
          error
        )
      }
    }

    working.status = recomputeImportStatus(working.chapters)
    await persistManifest(bookBlockId, working)
  }

  working.status = recomputeImportStatus(working.chapters)
  await persistManifest(bookBlockId, working)
  navigateToBlock(bookBlockId)
  return toResult("resumed", "", working)
}

function toResult(
  kind: ImportEpubResult["kind"],
  bookTitle: string,
  manifest: ImportEpubResult["manifest"]
): ImportEpubResult {
  return {
    kind,
    bookBlockId: manifest.bookBlockId,
    bookTitle,
    fingerprint: manifest.fingerprint,
    status: manifest.status,
    manifest,
    importedChapterIds: manifest.chapters
      .filter((c) => c.status === "imported" && typeof c.blockId === "number")
      .map((c) => c.blockId as DbId),
    failedChapters: manifest.chapters.filter((c) => c.status === "failed"),
    pendingChapters: manifest.chapters.filter((c) => c.status === "pending")
  }
}

/**
 * On failure, preserve any page already created so resume does not duplicate it.
 */
function chapterFailureEntry(
  entry: ImportEpubResult["manifest"]["chapters"][number],
  error: unknown
): ImportEpubResult["manifest"]["chapters"][number] {
  const message = error instanceof Error ? error.message : String(error)
  const partialId =
    error instanceof PartialChapterImportError
      ? error.blockId
      : entry.blockId
  return {
    ...entry,
    blockId: partialId ?? null,
    status: "failed",
    error: message
  }
}

export async function previewParse(
  buffer: ArrayBuffer
): Promise<ParsedEpub> {
  return parseEpub(buffer)
}
