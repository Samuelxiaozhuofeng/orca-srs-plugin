/**
 * EPUB import contracts: parser, manifest, and service boundaries.
 */

import type { DbId } from "../../orca.d.ts"

export type EpubImportStatus = "importing" | "partial" | "complete"
export type EpubChapterImportStatus = "pending" | "imported" | "failed"

export interface EpubMetadata {
  title: string
  author: string
  language?: string
  publisher?: string
  description?: string
}

export interface EpubManifestItem {
  id: string
  href: string
  mediaType: string
}

export interface EpubChapter {
  id: string
  title: string
  href: string
  /** Stable identity within one EPUB: normalized href + spine index */
  key: string
  spineIndex: number
}

export interface EpubTocItem {
  title: string
  href: string
  children?: EpubTocItem[]
}

export interface ParsedEpub {
  metadata: EpubMetadata
  chapters: EpubChapter[]
  fingerprint: string
}

export interface EpubChapterManifestEntry {
  key: string
  spineIndex: number
  href: string
  title: string
  blockId: DbId | null
  status: EpubChapterImportStatus
  error: string | null
}

export interface EpubBookManifestV1 {
  version: 1
  fingerprint: string
  sourceFileName: string
  sourceAssetPath: string
  status: EpubImportStatus
  bookBlockId: DbId
  chapters: EpubChapterManifestEntry[]
}

export type ImportEpubPhase =
  | "parsing"
  | "dedupe"
  | "uploading_source"
  | "creating_book"
  | "importing_chapters"
  | "complete"
  | "partial"
  | "already_exists"

export interface ImportEpubProgress {
  phase: ImportEpubPhase
  message: string
  chapterIndex?: number
  chapterTotal?: number
  chapterTitle?: string
}

export interface ImportEpubRequest {
  buffer: ArrayBuffer
  sourceFileName: string
  bookTitle: string
  /** Chapter keys (from parse) selected for import */
  selectedChapterKeys: string[]
  pluginName?: string
  onProgress?: (progress: ImportEpubProgress) => void
}

export interface ImportEpubResult {
  kind: "created" | "resumed" | "already_exists"
  bookBlockId: DbId
  bookTitle: string
  fingerprint: string
  status: EpubImportStatus
  manifest: EpubBookManifestV1
  importedChapterIds: DbId[]
  failedChapters: EpubChapterManifestEntry[]
  pendingChapters: EpubChapterManifestEntry[]
  suspectedDuplicates?: Array<{ bookBlockId: DbId; title: string }>
}

export const EPUB_PROP = {
  fingerprint: "epub.fingerprint",
  sourceAssetPath: "epub.sourceAssetPath",
  importStatus: "epub.importStatus",
  manifest: "epub.manifest",
  bookId: "epub.bookId",
  chapterKey: "epub.chapterKey",
  spineIndex: "epub.spineIndex",
  href: "epub.href"
} as const

export const IR_BOOK_PLAN_PROP = "ir.bookPlan"

export type BookIRMode = "distributed" | "sequential"
export type BookIRChapterOutcome =
  | "pending"
  | "active"
  | "completed"
  | "skipped"
  | "removed"

export interface BookIRPlanV1 {
  version: 1
  bookBlockId: DbId
  mode: BookIRMode
  priority: number
  totalDays: number
  selectedChapterIds: DbId[]
  activeChapterId: DbId | null
  outcomes: Record<string, BookIRChapterOutcome>
  /** Optional last error for sequential next-activation failures */
  lastError?: string | null
}

export interface InitializeBookIRRequest {
  bookBlockId: DbId
  bookTitle: string
  chapterIds: DbId[]
  mode: BookIRMode
  priority: number
  totalDays: number
  pluginName?: string
}

export type BookIRMutationKind =
  | "initialized"
  | "advanced"
  | "removed"
  | "partial"

export interface BookIRItemResult {
  chapterId: DbId
  ok: boolean
  error?: string
}

export interface BookIRMutationResult {
  kind: BookIRMutationKind
  bookBlockId: DbId
  plan: BookIRPlanV1 | null
  success: DbId[]
  failed: BookIRItemResult[]
  message?: string
  /** When sequential active was removed without skip/complete, sequence is paused */
  sequentialPaused?: boolean
}

export interface AdvanceSequentialBookRequest {
  bookBlockId: DbId
  chapterId: DbId
  outcome: "completed" | "skipped"
  pluginName?: string
}

export class EpubValidationError extends Error {
  readonly code: string
  readonly bookBlockId?: DbId

  constructor(message: string, code = "validation", bookBlockId?: DbId) {
    super(message)
    this.name = "EpubValidationError"
    this.code = code
    this.bookBlockId = bookBlockId
  }
}
