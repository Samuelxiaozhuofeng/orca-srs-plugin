/**
 * Strict EpubBookManifestV1 parse/serialize. No silent fallback or string patching.
 */

import type { DbId } from "../../orca.d.ts"
import type {
  EpubBookManifestV1,
  EpubChapterImportStatus,
  EpubChapterManifestEntry,
  EpubImportStatus
} from "./types"
import { EpubValidationError } from "./types"

const IMPORT_STATUSES = new Set<EpubImportStatus>(["importing", "partial", "complete"])
const CHAPTER_STATUSES = new Set<EpubChapterImportStatus>(["pending", "imported", "failed"])

export function serializeEpubManifest(manifest: EpubBookManifestV1): string {
  if (manifest.version !== 1) {
    throw new EpubValidationError(
      `Unsupported epub.manifest version: ${String((manifest as { version?: unknown }).version)}`,
      "manifest_version"
    )
  }
  // Round-trip through parse to ensure we only ever persist valid documents.
  const validated = parseEpubManifest(JSON.stringify(manifest))
  return JSON.stringify(validated)
}

export function parseEpubManifest(
  raw: unknown,
  bookBlockId?: DbId
): EpubBookManifestV1 {
  if (raw == null || raw === "") {
    throw new EpubValidationError(
      `Missing epub.manifest${bookBlockId != null ? ` for book #${bookBlockId}` : ""}`,
      "manifest_missing",
      bookBlockId
    )
  }

  let value: unknown = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw)
    } catch {
      throw new EpubValidationError(
        `Malformed epub.manifest JSON${bookBlockId != null ? ` for book #${bookBlockId}` : ""}`,
        "manifest_json",
        bookBlockId
      )
    }
  }

  if (!isRecord(value)) {
    throw new EpubValidationError(
      `epub.manifest must be an object${bookBlockId != null ? ` (book #${bookBlockId})` : ""}`,
      "manifest_shape",
      bookBlockId
    )
  }

  if (value.version !== 1) {
    throw new EpubValidationError(
      `Unsupported epub.manifest version ${String(value.version)}${bookBlockId != null ? ` (book #${bookBlockId})` : ""}. Recovery: re-import or repair the property.`,
      "manifest_version",
      bookBlockId
    )
  }

  if (typeof value.fingerprint !== "string" || value.fingerprint.length === 0) {
    throw new EpubValidationError("epub.manifest.fingerprint must be a non-empty string", "manifest_fingerprint", bookBlockId)
  }
  if (typeof value.sourceFileName !== "string") {
    throw new EpubValidationError("epub.manifest.sourceFileName must be a string", "manifest_sourceFileName", bookBlockId)
  }
  if (typeof value.sourceAssetPath !== "string" || value.sourceAssetPath.length === 0) {
    throw new EpubValidationError("epub.manifest.sourceAssetPath must be a non-empty string", "manifest_sourceAssetPath", bookBlockId)
  }
  if (typeof value.status !== "string" || !IMPORT_STATUSES.has(value.status as EpubImportStatus)) {
    throw new EpubValidationError(
      `epub.manifest.status must be importing|partial|complete, got ${String(value.status)}`,
      "manifest_status",
      bookBlockId
    )
  }
  if (typeof value.bookBlockId !== "number" || !Number.isFinite(value.bookBlockId)) {
    throw new EpubValidationError("epub.manifest.bookBlockId must be a number", "manifest_bookBlockId", bookBlockId)
  }
  if (!Array.isArray(value.chapters)) {
    throw new EpubValidationError("epub.manifest.chapters must be an array", "manifest_chapters", bookBlockId)
  }

  const chapters: EpubChapterManifestEntry[] = value.chapters.map((entry, index) =>
    parseChapterEntry(entry, index, bookBlockId)
  )

  return {
    version: 1,
    fingerprint: value.fingerprint,
    sourceFileName: value.sourceFileName,
    sourceAssetPath: value.sourceAssetPath,
    status: value.status as EpubImportStatus,
    bookBlockId: value.bookBlockId as DbId,
    chapters
  }
}

function parseChapterEntry(
  entry: unknown,
  index: number,
  bookBlockId?: DbId
): EpubChapterManifestEntry {
  if (!isRecord(entry)) {
    throw new EpubValidationError(
      `epub.manifest.chapters[${index}] must be an object`,
      "manifest_chapter",
      bookBlockId
    )
  }
  if (typeof entry.key !== "string" || entry.key.length === 0) {
    throw new EpubValidationError(`chapters[${index}].key must be a non-empty string`, "manifest_chapter_key", bookBlockId)
  }
  if (typeof entry.spineIndex !== "number" || !Number.isFinite(entry.spineIndex)) {
    throw new EpubValidationError(`chapters[${index}].spineIndex must be a number`, "manifest_chapter_spine", bookBlockId)
  }
  if (typeof entry.href !== "string") {
    throw new EpubValidationError(`chapters[${index}].href must be a string`, "manifest_chapter_href", bookBlockId)
  }
  if (typeof entry.title !== "string") {
    throw new EpubValidationError(`chapters[${index}].title must be a string`, "manifest_chapter_title", bookBlockId)
  }
  if (!(entry.blockId === null || (typeof entry.blockId === "number" && Number.isFinite(entry.blockId)))) {
    throw new EpubValidationError(`chapters[${index}].blockId must be number|null`, "manifest_chapter_blockId", bookBlockId)
  }
  if (typeof entry.status !== "string" || !CHAPTER_STATUSES.has(entry.status as EpubChapterImportStatus)) {
    throw new EpubValidationError(
      `chapters[${index}].status must be pending|imported|failed`,
      "manifest_chapter_status",
      bookBlockId
    )
  }
  if (!(entry.error === null || typeof entry.error === "string")) {
    throw new EpubValidationError(`chapters[${index}].error must be string|null`, "manifest_chapter_error", bookBlockId)
  }

  return {
    key: entry.key,
    spineIndex: entry.spineIndex,
    href: entry.href,
    title: entry.title,
    blockId: entry.blockId as DbId | null,
    status: entry.status as EpubChapterImportStatus,
    error: entry.error as string | null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
