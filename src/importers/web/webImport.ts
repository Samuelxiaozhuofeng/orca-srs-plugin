/**
 * Web article import facade (Firecrawl single-provider MVP).
 *
 * Flow: validate URL → scrape (no Orca write) → optional import page with
 * heading outline, optional Topic IR + "today" due. Atomic rollback deletes
 * only the page created in this attempt.
 *
 * Submodules: types, webUrl, firecrawlClient, webHtml.
 * Public callers should import from this file for a stable surface.
 */

import type { Block, DbId } from "../../orca.d.ts"
import { importHtmlAsOutline } from "../epub/orcaOutlineImporter"
import { navigateToBlock } from "../epub/orcaBookHelpers"
import { createTopicCardByBlockId } from "../../srs/topicCardCreator"
import { advanceDueToToday } from "../../srs/incrementalReadingStorage"
import {
  DEFAULT_FIRECRAWL_SCRAPE_URL,
  getWebImportSettings
} from "../../srs/settings/webImportSettingsSchema"
import {
  PROP_TYPE_TEXT,
  WEB_PROP,
  WebImportError,
  type ImportScrapedArticleRequest,
  type ImportWebArticleResult,
  type ScrapedArticle,
  type ScrapeWebArticleRequest
} from "./types"
import { validateAndNormalizeUrl } from "./webUrl"
import {
  scrapeWithFirecrawl,
  sanitizePublicError
} from "./firecrawlClient"
import {
  buildTitleFromMetadata,
  pickMetadataString,
  plainTextLength,
  sanitizeWebHtml
} from "./webHtml"

// ---------------------------------------------------------------------------
// Re-exports (stable public API)
// ---------------------------------------------------------------------------

export {
  WEB_PROP,
  WebImportError,
  type WebImportErrorCode,
  type ScrapedArticle,
  type ScrapeWebArticleRequest,
  type ImportScrapedArticleRequest,
  type ImportWebArticleResult
} from "./types"

export {
  validateAndNormalizeUrl,
  isBlockedHostname,
  extractEmbeddedIPv4
} from "./webUrl"

export {
  FIRECRAWL_TIMEOUT_MS,
  scrapeWithFirecrawl,
  sanitizePublicError,
  extractApiErrorSummary,
  type FirecrawlScrapeOptions
} from "./firecrawlClient"

export {
  sanitizeWebHtml,
  isDangerousUrl,
  resolveHttpUrl,
  buildTitleFromMetadata,
  plainTextLength
} from "./webHtml"

// ---------------------------------------------------------------------------
// Scrape orchestration (preview — no Orca write)
// ---------------------------------------------------------------------------

/**
 * Scrape + lightweight preview model. Does not write Orca.
 */
export async function scrapeWebArticle(
  request: ScrapeWebArticleRequest
): Promise<ScrapedArticle> {
  const { sourceUrl, canonicalUrl, hostname } = validateAndNormalizeUrl(request.url)
  const settings = getWebImportSettingsSafe(request.pluginName)
  const apiKey = request.apiKey ?? settings.firecrawlApiKey
  const apiUrl = request.apiUrl ?? settings.firecrawlApiUrl

  const { html: rawHtml, metadata } = await scrapeWithFirecrawl({
    url: sourceUrl,
    apiKey,
    apiUrl,
    signal: request.signal,
    timeoutMs: request.timeoutMs,
    fetchImpl: request.fetchImpl
  })

  const title = buildTitleFromMetadata(metadata, hostname)
  const cleanedHtml = sanitizeWebHtml(rawHtml, sourceUrl, title)
  const textLength = plainTextLength(cleanedHtml)

  if (textLength === 0 && !cleanedHtml.trim()) {
    throw new WebImportError(
      "清洗后正文为空，无法导入。该页可能几乎没有正文内容",
      "empty_html"
    )
  }

  const author = pickMetadataString(metadata, ["author", "article:author", "og:article:author"])
  const siteName = pickMetadataString(metadata, ["siteName", "ogSiteName", "og:site_name", "publisher"])
  const published = pickMetadataString(metadata, [
    "publishedTime",
    "published",
    "article:published_time",
    "og:article:published_time"
  ])

  return {
    title,
    sourceUrl,
    canonicalUrl,
    hostname,
    author,
    siteName,
    published,
    html: cleanedHtml,
    textLength: textLength || plainTextLength(cleanedHtml) || cleanedHtml.length
  }
}

function getWebImportSettingsSafe(pluginName: string): {
  firecrawlApiKey: string
  firecrawlApiUrl: string
} {
  try {
    return getWebImportSettings(pluginName)
  } catch {
    return { firecrawlApiKey: "", firecrawlApiUrl: DEFAULT_FIRECRAWL_SCRAPE_URL }
  }
}

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

/**
 * Find an existing page by web.canonicalUrl.
 * Property query first; state scan on query failure only as recovery for *hits*.
 * If query fails and scan finds nothing, throws — never pretends "no duplicate".
 */
export async function findPageByCanonicalUrl(
  canonicalUrl: string
): Promise<DbId | null> {
  if (!canonicalUrl) return null

  let queryFailed = false
  try {
    const result = await orca.invokeBackend("query", {
      q: {
        kind: 1,
        conditions: [
          {
            kind: 4,
            name: WEB_PROP.canonicalUrl,
            value: canonicalUrl
          }
        ]
      }
    })
    if (Array.isArray(result) && result.length > 0) {
      const first = result[0]
      const id = typeof first === "number" ? first : (first as { id?: number })?.id
      if (typeof id === "number") return id
    }
    // Query succeeded with empty → no duplicate
    return null
  } catch (error) {
    queryFailed = true
    console.error("[web-import] property query failed:", error)
  }

  // Degradation: scan loaded blocks for a hit
  const blocks = orca.state.blocks ?? {}
  for (const key of Object.keys(blocks)) {
    const block = blocks[key as unknown as number] as Block | undefined
    if (!block) continue
    const value = block.properties?.find((p) => p.name === WEB_PROP.canonicalUrl)?.value
    if (value === canonicalUrl) {
      return block.id
    }
  }

  if (queryFailed) {
    throw new WebImportError(
      "无法确认该网址是否已导入（属性查询失败）。为避免重复写入，已中止。请稍后重试",
      "dedupe_query_failed"
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Import (write)
// ---------------------------------------------------------------------------

/**
 * Import a previously scraped article into Orca.
 * Dedupes by canonicalUrl. Atomic: rolls back the newly created root on failure.
 */
export async function importScrapedArticle(
  request: ImportScrapedArticleRequest
): Promise<ImportWebArticleResult> {
  const { article, pluginName } = request
  const joinIR = request.joinIncrementalReading !== false
  const scheduleToday = Boolean(request.scheduleToday) && joinIR

  if (!request.skipDedupe) {
    const existing = await findPageByCanonicalUrl(article.canonicalUrl)
    if (existing != null) {
      navigateToBlock(existing)
      return {
        kind: "already_exists",
        pageBlockId: existing,
        title: article.title,
        canonicalUrl: article.canonicalUrl
      }
    }
  }

  let rootBlockId: DbId | null = null

  try {
    rootBlockId = await createWebPage(article.title)
    await setWebPageProperties(rootBlockId, article)

    if (article.html.trim()) {
      await importHtmlAsOutline(rootBlockId, article.html)
    }

    if (joinIR) {
      const topic = await createTopicCardByBlockId(rootBlockId, pluginName)
      if (topic == null) {
        throw new WebImportError(
          "加入渐进阅读失败：未能创建 Topic 卡片",
          "topic_failed"
        )
      }
      if (scheduleToday) {
        await advanceDueToToday(rootBlockId)
      }
    }

    navigateToBlock(rootBlockId)

    return {
      kind: "created",
      pageBlockId: rootBlockId,
      title: article.title,
      canonicalUrl: article.canonicalUrl,
      joinedIR: joinIR,
      scheduledToday: scheduleToday
    }
  } catch (error) {
    const residualFromError =
      error instanceof WebImportError ? error.residualBlockId : undefined
    const toRollback = rootBlockId ?? residualFromError
    if (toRollback != null) {
      await rollbackCreatedPage(toRollback, error)
    }
    if (error instanceof WebImportError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new WebImportError(
      `导入失败：${sanitizePublicError(message)}`,
      "import_failed",
      { cause: error }
    )
  }
}

/**
 * Create page root + alias. Alias failure is fatal (same as EPUB createBookPage).
 * On alias failure after a successful insert, attaches residualBlockId for rollback.
 */
async function createWebPage(title: string): Promise<DbId> {
  const newBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: title }],
    { type: "heading", level: 1 }
  )

  if (typeof newBlockId !== "number" || !Number.isFinite(newBlockId)) {
    throw new WebImportError(
      `创建页面失败：insertBlock 未返回有效块 ID（得到 ${String(newBlockId)}）`,
      "import_failed"
    )
  }

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.createAlias",
      null,
      title,
      newBlockId,
      true
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new WebImportError(
      `创建页面别名失败：${sanitizePublicError(detail)}`,
      "import_failed",
      { residualBlockId: newBlockId as DbId, cause: error }
    )
  }

  return newBlockId as DbId
}

async function setWebPageProperties(
  blockId: DbId,
  article: ScrapedArticle
): Promise<void> {
  const props: Array<{ name: string; value: string; type: number }> = [
    { name: WEB_PROP.sourceUrl, value: article.sourceUrl, type: PROP_TYPE_TEXT },
    { name: WEB_PROP.canonicalUrl, value: article.canonicalUrl, type: PROP_TYPE_TEXT },
    {
      name: WEB_PROP.importedAt,
      value: new Date().toISOString(),
      type: PROP_TYPE_TEXT
    },
    { name: WEB_PROP.provider, value: "firecrawl", type: PROP_TYPE_TEXT },
    { name: WEB_PROP.importStatus, value: "complete", type: PROP_TYPE_TEXT }
  ]

  if (article.author) {
    props.push({ name: WEB_PROP.author, value: article.author, type: PROP_TYPE_TEXT })
  }
  if (article.siteName) {
    props.push({ name: WEB_PROP.siteName, value: article.siteName, type: PROP_TYPE_TEXT })
  }
  if (article.published) {
    props.push({ name: WEB_PROP.published, value: article.published, type: PROP_TYPE_TEXT })
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    props
  )
}

/**
 * Delete the page created in this attempt (root + best-effort children).
 * On cleanup failure, log + rethrow enriched error with residual id.
 */
export async function rollbackCreatedPage(
  rootBlockId: DbId,
  originalError: unknown
): Promise<never> {
  try {
    const childIds = await collectDescendantIds(rootBlockId)
    const toDelete = [...childIds, rootBlockId]
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      toDelete
    )
  } catch (cleanupError) {
    console.error(
      `[web-import] 导入失败后清理残留块失败。残留根块 ID: #${rootBlockId}`,
      cleanupError
    )
    const originalMsg =
      originalError instanceof Error
        ? originalError.message
        : String(originalError)
    throw new WebImportError(
      `${sanitizePublicError(originalMsg)}。此外，清理未完成页面失败，残留块 ID：#${rootBlockId}（可手动删除）`,
      "cleanup_failed",
      { residualBlockId: rootBlockId, cause: cleanupError }
    )
  }

  if (originalError instanceof WebImportError) {
    throw originalError
  }
  const message =
    originalError instanceof Error
      ? originalError.message
      : String(originalError)
  throw new WebImportError(
    `导入失败（已尝试删除未完成页面）：${sanitizePublicError(message)}`,
    "import_failed",
    { cause: originalError }
  )
}

async function collectDescendantIds(rootBlockId: DbId): Promise<DbId[]> {
  const result: DbId[] = []
  const queue: DbId[] = [rootBlockId]
  const seen = new Set<DbId>()

  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)

    let block =
      (orca.state.blocks?.[id] as Block | undefined)
      || ((await orca.invokeBackend("get-block", id)) as Block | undefined)
    if (!block) continue

    const children = (block.children ?? []) as DbId[]
    for (const childId of children) {
      if (!seen.has(childId)) {
        result.push(childId)
        queue.push(childId)
      }
    }
  }

  return result
}

/**
 * End-to-end convenience for callers that scrape then import in one step.
 * Dialog uses scrape + import separately so preview never writes Orca.
 */
export async function importWebArticle(options: {
  url: string
  pluginName: string
  joinIncrementalReading?: boolean
  scheduleToday?: boolean
  signal?: AbortSignal
  apiKey?: string
  apiUrl?: string
  fetchImpl?: typeof fetch
}): Promise<ImportWebArticleResult> {
  const article = await scrapeWebArticle({
    url: options.url,
    pluginName: options.pluginName,
    signal: options.signal,
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    fetchImpl: options.fetchImpl
  })
  return importScrapedArticle({
    article,
    pluginName: options.pluginName,
    joinIncrementalReading: options.joinIncrementalReading,
    scheduleToday: options.scheduleToday
  })
}
