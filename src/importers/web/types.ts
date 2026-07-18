/**
 * Shared types and errors for web article import.
 */

import type { DbId } from "../../orca.d.ts"

/** Root-block property names for web imports */
export const WEB_PROP = {
  sourceUrl: "web.sourceUrl",
  canonicalUrl: "web.canonicalUrl",
  importedAt: "web.importedAt",
  provider: "web.provider",
  importStatus: "web.importStatus",
  author: "web.author",
  siteName: "web.siteName",
  published: "web.published"
} as const

/** PropType.Text per plugin-docs/constants/db.md (1 = Text, 2 = BlockRefs). */
export const PROP_TYPE_TEXT = 1

export type WebImportErrorCode =
  | "invalid_url"
  | "private_url"
  | "missing_api_key"
  | "http_401"
  | "http_402"
  | "http_429"
  | "http_error"
  | "api_error"
  | "empty_html"
  | "timeout"
  | "aborted"
  | "network"
  | "dedupe_query_failed"
  | "import_failed"
  | "topic_failed"
  | "cleanup_failed"

export class WebImportError extends Error {
  readonly code: WebImportErrorCode
  readonly residualBlockId?: DbId

  constructor(
    message: string,
    code: WebImportErrorCode,
    options?: { residualBlockId?: DbId; cause?: unknown }
  ) {
    super(message)
    this.name = "WebImportError"
    this.code = code
    this.residualBlockId = options?.residualBlockId
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

/** Compact quality warning for scrape preview (no write). */
export interface ScrapedArticleWarning {
  code: string
  message: string
}

export interface ScrapedArticle {
  title: string
  sourceUrl: string
  canonicalUrl: string
  hostname: string
  author?: string
  siteName?: string
  published?: string
  html: string
  /** Visible plain-text length after cleaning (not markup length). */
  textLength: number
  /** Short plain-text excerpt for preview. */
  excerpt?: string
  /** Quality / extraction diagnostics shown before import. */
  warnings?: ScrapedArticleWarning[]
  /** How main content was chosen (debug / diagnostics). */
  extractionMethod?: "readability" | "structural" | "raw_fallback"
}

export interface ScrapeWebArticleRequest {
  url: string
  pluginName: string
  signal?: AbortSignal
  /** Override settings (tests). */
  apiKey?: string
  apiUrl?: string
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface ImportScrapedArticleRequest {
  article: ScrapedArticle
  pluginName: string
  joinIncrementalReading?: boolean
  scheduleToday?: boolean
  /** Skip dedupe (tests only). */
  skipDedupe?: boolean
}

export type ImportWebArticleResult =
  | {
      kind: "created"
      pageBlockId: DbId
      title: string
      canonicalUrl: string
      joinedIR: boolean
      scheduledToday: boolean
    }
  | {
      kind: "already_exists"
      pageBlockId: DbId
      title: string
      canonicalUrl: string
    }
