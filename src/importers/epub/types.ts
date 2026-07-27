/**
 * EPUB import contracts: parser, manifest, and service boundaries.
 */

import type { DbId } from "../../orca.d.ts"

export type EpubImportStatus = "importing" | "partial" | "complete"
export type EpubChapterImportStatus = "pending" | "imported" | "failed"

/**
 * How a selected TOC item is written into the book notes.
 * - page: standalone chapter page + catalog ref (default; eligible for Book IR)
 * - marker: plain structural block under「章节:」(not a separate page; not IR-eligible)
 */
export type EpubChapterImportRole = "page" | "marker"

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

/**
 * How multi-fragment TOC entries map to import chapters.
 * - auto: keep whole-file chapters when TOC+DOM show chapter+subsection nesting;
 *   otherwise expand fragments (with optional document-start prefix chapter).
 * - spine: one chapter per spine XHTML (ignore multi-fragment expansion).
 * - toc-fragments: historical expand-only behavior (parent whole-file TOC dropped).
 */
export type EpubChapterGranularity = "auto" | "spine" | "toc-fragments"

export interface EpubChapterPlanV1 {
  version: 1
  granularity: EpubChapterGranularity
}

export interface EpubChapter {
  id: string
  title: string
  href: string
  /** Stable identity within one EPUB: normalized href + spine index */
  key: string
  spineIndex: number
  /**
   * End exclusive fragment for multi-fragment logical chapters in one spine file.
   * Also used for document-start prefix chapters (href has no fragment; slice [0, endFragment)).
   * Runtime-only (rebuilt by re-parse); not part of the persisted manifest schema.
   */
  endFragment?: string
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
  /**
   * Import write shape. Absent on pre-role manifests → treat as `page`.
   */
  role?: EpubChapterImportRole
}

export interface EpubBookManifestV1 {
  version: 1
  fingerprint: string
  sourceFileName: string
  sourceAssetPath: string
  status: EpubImportStatus
  bookBlockId: DbId
  chapters: EpubChapterManifestEntry[]
  /**
   * Chapter-planning policy used when this book was (first) imported.
   * Absent on pre-policy manifests → resume must use `toc-fragments` so keys stay stable.
   */
  chapterPlan?: EpubChapterPlanV1
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
  /**
   * Per-key write role for selected chapters. Missing key → `page`.
   * Keys not in selectedChapterKeys are ignored.
   */
  chapterRoles?: Record<string, EpubChapterImportRole>
  pluginName?: string
  onProgress?: (progress: ImportEpubProgress) => void
  /**
   * Chapter planning mode; must match the keys from preview/parse.
   * Default `auto`. Persisted on manifest as chapterPlan for resume.
   */
  chapterGranularity?: EpubChapterGranularity
}

export interface EpubChapterPreview {
  /** Truncated plain text for UI (may end with …) */
  previewText: string
  /** Full body character count (whitespace collapsed to single spaces, then length) */
  charCount: number
  /** Suggested write role from length/title heuristics */
  suggestedRole: EpubChapterImportRole
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
  /**
   * Sequential advance only: current chapter no longer has IR identity (strip succeeded).
   * Session UI must keep the card visible when this is false after a partial result.
   */
  currentChapterRemoved?: boolean
  /**
   * Sequential advance only: intended plan state was successfully written to the backend.
   * False when plan save (or repair checkpoint) failed — state is retryable, not “persisted success”.
   */
  planPersisted?: boolean
}

/**
 * 顺序解锁完成本章后，下一章 due 安排策略（显式参数，禁止隐式全局状态）。
 * - today: 下一章 due 为今天 00:00，立即进入今日 IR 队列
 * - tomorrow: 下一章 due 为明天 00:00，plan 仍记为 active，但今日不作为到期卡
 */
export type NextChapterSchedule = "today" | "tomorrow"

export interface AdvanceSequentialBookRequest {
  bookBlockId: DbId
  chapterId: DbId
  outcome: "completed" | "skipped"
  pluginName?: string
  /**
   * 激活下一章时的 due 安排。省略时默认 `today`（兼容跳过/重试路径）。
   * 仅影响下一章 `ir.due`；当前章 outcome / plan 写入语义不变。
   */
  nextChapterSchedule?: NextChapterSchedule
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
