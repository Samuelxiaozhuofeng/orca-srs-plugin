/**
 * Optional AI summary for Web Import.
 * Uses the user's default model from AI 服务设置 (getAISettings).
 * Output is Orca-friendly Markdown: lead summary + bullet points.
 */

import type { Block, DbId } from "../../orca.d.ts"
import { getAISettings } from "../../srs/ai/aiSettingsSchema"
import { buildChatCompletionsBody } from "../../srs/ai/aiChatRequest"
import {
  AI_MAX_RESPONSE_BYTES,
  GENERATION_TIMEOUT_MS
} from "../../srs/ai/aiDraftTypes"
import {
  classifyAiFetchCatchError,
  readHttpErrorMessage
} from "../../srs/ai/aiHttpErrors"
import { sanitizeAiTextForOrcaInsert } from "../../srs/ai/aiQuickInteractMd"
import { sanitizePublicError } from "../../srs/http/redactSecrets"
import {
  readResponseJsonLimited,
  ResponseTooLargeError
} from "../../srs/http/safeResponse"
import { parseHtml } from "../epub/epubHtml"
import { measurePlainText } from "./webChromeStrip"

/** Cap article text sent to the model (fast + cost-bounded). */
export const WEB_AI_SUMMARY_MAX_INPUT_CHARS = 12_000
export const WEB_AI_SUMMARY_MAX_TOKENS = 900
export const WEB_AI_SUMMARY_HEADING = "AI 总结"

export type WebAiSummaryGenerateResult =
  | { ok: true; markdown: string; model: string }
  | { ok: false; error: string; code: string }

export type WebAiSummaryInsertResult =
  | { ok: true; summaryBlockId: DbId }
  | { ok: false; error: string }

/**
 * Visible plain text from cleaned article HTML (for the model prompt).
 */
export function articleHtmlToPlainText(html: string): string {
  if (!html.trim()) return ""
  try {
    const doc = parseHtml(`<div id="__web_ai_plain">${html}</div>`)
    const root = doc.getElementById("__web_ai_plain") ?? doc.body
    return normalizeSpace(root?.textContent ?? "")
  } catch {
    return normalizeSpace(html.replace(/<[^>]+>/g, " "))
  }
}

export function truncateForSummaryPrompt(text: string, maxChars: number): string {
  const t = text.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars).trimEnd()}\n\n[…正文已截断以加速分析…]`
}

/**
 * Call the default AI model to produce a short Markdown summary.
 * Failures are returned as { ok:false } — never throw secrets.
 */
export async function generateWebArticleSummary(options: {
  pluginName: string
  title: string
  plainText: string
  signal?: AbortSignal
  /** Test override */
  fetchImpl?: typeof fetch
}): Promise<WebAiSummaryGenerateResult> {
  const settings = getAISettings(options.pluginName)
  if (!settings.apiKey.trim()) {
    return {
      ok: false,
      code: "NO_API_KEY",
      error: "请先在「AI / Firecrawl 服务设置」中配置 API Key"
    }
  }
  if (!settings.model.trim()) {
    return {
      ok: false,
      code: "NO_MODEL",
      error: "请先在「AI / Firecrawl 服务设置」中选择默认模型"
    }
  }

  const plain = truncateForSummaryPrompt(
    options.plainText || "",
    WEB_AI_SUMMARY_MAX_INPUT_CHARS
  )
  if (measurePlainTextLength(plain) < 40) {
    return {
      ok: false,
      code: "EMPTY_BODY",
      error: "正文过短，无法生成 AI 总结"
    }
  }

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    GENERATION_TIMEOUT_MS
  )
  const external = options.signal
  const onExternalAbort = () => timeoutController.abort()
  if (external) {
    if (external.aborted) {
      clearTimeout(timeoutId)
      return { ok: false, code: "CANCELLED", error: "已取消 AI 分析" }
    }
    external.addEventListener("abort", onExternalAbort, { once: true })
  }

  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(settings.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(
        buildChatCompletionsBody({
          settings,
          // Web import summary should not spend tokens on native web_search.
          allowWebSearch: false,
          temperature: 0.3,
          maxTokens: WEB_AI_SUMMARY_MAX_TOKENS,
          messages: [
            { role: "system", content: buildWebSummarySystemPrompt() },
            {
              role: "user",
              content: buildWebSummaryUserPrompt(options.title, plain)
            }
          ]
        })
      ),
      signal: timeoutController.signal
    })

    if (!response.ok) {
      const fallback = `AI 请求失败: ${response.status}`
      const errorMessage = await readHttpErrorMessage(
        response,
        fallback,
        settings.apiKey
      )
      return {
        ok: false,
        code: `HTTP_${response.status}`,
        error: errorMessage
      }
    }

    let data: { choices?: Array<{ message?: { content?: string } }> }
    try {
      data = await readResponseJsonLimited(response, AI_MAX_RESPONSE_BYTES)
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        return {
          ok: false,
          code: "RESPONSE_TOO_LARGE",
          error: sanitizePublicError(
            `AI 响应过大（上限 ${AI_MAX_RESPONSE_BYTES} 字节）`,
            settings.apiKey
          )
        }
      }
      throw error
    }

    const raw = data.choices?.[0]?.message?.content
    if (!raw || typeof raw !== "string" || !raw.trim()) {
      return { ok: false, code: "EMPTY_RESPONSE", error: "AI 返回内容为空" }
    }

    const markdown = normalizeSummaryMarkdown(raw)
    if (!markdown) {
      return {
        ok: false,
        code: "EMPTY_SUMMARY",
        error: "AI 总结解析后为空"
      }
    }

    return { ok: true, markdown, model: settings.model }
  } catch (error) {
    if (isAbortError(error)) {
      const byUser = external?.aborted === true
      return {
        ok: false,
        code: byUser ? "CANCELLED" : "TIMEOUT",
        error: byUser
          ? "已取消 AI 分析"
          : `AI 分析超时（${Math.round(GENERATION_TIMEOUT_MS / 1000)} 秒）`
      }
    }
    const classified = classifyAiFetchCatchError(error)
    return {
      ok: false,
      code: classified.code,
      error: sanitizePublicError(classified.message, settings.apiKey)
    }
  } finally {
    clearTimeout(timeoutId)
    if (external) {
      external.removeEventListener("abort", onExternalAbort)
    }
  }
}

/**
 * Insert AI summary as the first child under the page root.
 *
 * Structure:
 *   page root
 *     └── AI 总结          (first block)
 *           ├── 总括段落
 *           └── - 要点…
 *     └── …article body
 *
 * Fail-soft: on any body write failure, delete the summary heading subtree so
 * the page is not left with a half-written AI block.
 */
export async function insertWebArticleSummary(
  rootBlockId: DbId,
  markdown: string
): Promise<WebAiSummaryInsertResult> {
  const cleaned = sanitizeAiTextForOrcaInsert(markdown).trim()
  if (!cleaned) {
    return { ok: false, error: "总结内容为空，无法插入" }
  }

  const structured = coerceSummaryStructure(cleaned)
  if (!structured.ok) {
    return { ok: false, error: structured.error }
  }

  const root = await resolveBlock(rootBlockId)
  if (!root) {
    return { ok: false, error: `找不到页面根块 #${rootBlockId}` }
  }

  let summaryId: DbId | null = null
  try {
    const id = (await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      root,
      "firstChild",
      [{ t: "t", v: structured.lead }],
      { type: "heading", level: 2 }
    )) as DbId | null

    if (typeof id !== "number" || !Number.isFinite(id)) {
      return {
        ok: false,
        error: `插入总结块失败：insertBlock 未返回有效 ID（${String(id)}）`
      }
    }
    summaryId = id

    const summaryBlock = await resolveBlock(summaryId)
    if (!summaryBlock) {
      await deleteSummarySubtree(summaryId)
      return {
        ok: false,
        error: `总结块 #${summaryId} 创建后无法读取`
      }
    }

    // Single batch write of validated body (prose + bullets). No secondary
    // fallback on the same parent — partial batch + fallback risks duplicates.
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.batchInsertText",
        null,
        summaryBlock,
        "lastChild",
        structured.bodyMarkdown,
        false, // parse Markdown (lists / bold)
        false
      )
    } catch (batchError) {
      console.error(
        "[web-import] batchInsertText 插入 AI 总结失败，清理总结子树:",
        batchError
      )
      await deleteSummarySubtree(summaryId)
      const detail =
        batchError instanceof Error ? batchError.message : String(batchError)
      return {
        ok: false,
        error: sanitizePublicError(`插入 AI 总结正文失败：${detail}`)
      }
    }

    return { ok: true, summaryBlockId: summaryId }
  } catch (error) {
    if (summaryId != null) {
      await deleteSummarySubtree(summaryId)
    }
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: sanitizePublicError(`插入 AI 总结失败：${message}`)
    }
  }
}

async function deleteSummarySubtree(summaryBlockId: DbId): Promise<void> {
  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [summaryBlockId]
    )
  } catch (error) {
    console.error(
      `[web-import] 清理失败的 AI 总结块 #${summaryBlockId} 失败:`,
      error
    )
  }
}

// ---------------------------------------------------------------------------
// Prompt + markdown helpers
// ---------------------------------------------------------------------------

export function buildWebSummarySystemPrompt(): string {
  return [
    "你是网页文章速读助手。根据用户提供的正文，用中文输出简洁总结。",
    "必须使用 Orca Note 可解析的 Markdown（不要 HTML，不要代码围栏 ```）。",
    "输出格式严格如下：",
    "1) 第一行：固定标题「AI 总结」（不要其它装饰）",
    "2) 空一行后：1 段总括（2～4 句，抓住主旨与结论）",
    "3) 空一行后：3～7 条无序列表要点，每行以 `- ` 开头",
    "要求：信息准确、不编造文中没有的事实；可保留关键专有名词与数字；",
    "不要输出「以下是总结」之类元话语；不要引用编号角标。"
  ].join("\n")
}

export function buildWebSummaryUserPrompt(title: string, plainText: string): string {
  return [
    `标题：${title.trim() || "（无标题）"}`,
    "",
    "-----BEGIN ARTICLE-----",
    plainText,
    "-----END ARTICLE-----"
  ].join("\n")
}

/**
 * Strip common model wrappers (code fences, leading chatter).
 */
export function normalizeSummaryMarkdown(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").trim()
  // Drop a single surrounding fenced block if the whole answer is fenced
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(t)
  if (fence) t = fence[1].trim()
  t = sanitizeAiTextForOrcaInsert(t).trim()
  return t
}

/**
 * First non-empty line becomes the summary heading block text when it is
 * "AI 总结" (or similar); remaining Markdown is inserted as children.
 * If the model skipped the heading, use default heading and keep full body.
 */
export function splitSummaryLeadAndRest(markdown: string): {
  lead: string
  restMarkdown: string
} {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (i >= lines.length) {
    return { lead: WEB_AI_SUMMARY_HEADING, restMarkdown: "" }
  }

  const first = lines[i].trim()
  // "# AI 总结" / "**AI 总结**" / "AI 总结"
  const headingLike = first
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .trim()

  if (/^AI\s*总结$/i.test(headingLike) || /^总结$/i.test(headingLike)) {
    const rest = lines.slice(i + 1).join("\n").trim()
    return { lead: WEB_AI_SUMMARY_HEADING, restMarkdown: rest }
  }

  // Model put the lead paragraph first — keep default heading, full text as body
  return { lead: WEB_AI_SUMMARY_HEADING, restMarkdown: markdown.trim() }
}

/**
 * Require a short prose lead + at least 3 bullet points so imports match the
 * product shape (首块总结标题 → 总括 → 要点列表). Soft-normalize list markers.
 */
export function coerceSummaryStructure(markdown: string):
  | { ok: true; lead: string; bodyMarkdown: string }
  | { ok: false; error: string } {
  const { lead, restMarkdown } = splitSummaryLeadAndRest(markdown)
  const lines = restMarkdown.replace(/\r\n/g, "\n").split("\n")

  const proseParts: string[] = []
  const bullets: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    // Skip repeated headings the model might re-emit
    const headingLike = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\*\*(.+)\*\*$/, "$1")
      .trim()
    if (/^AI\s*总结$/i.test(headingLike) || /^总结$/i.test(headingLike)) {
      continue
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line) || /^\d+\.\s+(.+)$/.exec(line)
    if (bullet) {
      const item = bullet[1].trim()
      if (item) bullets.push(item)
      continue
    }
    // Non-list content before/between bullets → prose (only before bullets count)
    if (bullets.length === 0) {
      proseParts.push(line)
    }
  }

  const prose = normalizeSpace(proseParts.join(" "))
  if (prose.length < 12) {
    return {
      ok: false,
      error: "AI 总结缺少总括段落（至少约一句话）"
    }
  }
  if (bullets.length < 3) {
    return {
      ok: false,
      error: `AI 总结要点不足（需要至少 3 条，实际 ${bullets.length} 条）`
    }
  }

  const capped = bullets.slice(0, 7)
  const bodyMarkdown = [prose, "", ...capped.map((b) => `- ${b}`)].join("\n")
  return {
    ok: true,
    lead: lead || WEB_AI_SUMMARY_HEADING,
    bodyMarkdown
  }
}

async function resolveBlock(blockId: DbId): Promise<Block | null> {
  const fromState = orca.state.blocks[blockId] as Block | undefined
  if (fromState) return fromState
  try {
    const fromBackend = (await orca.invokeBackend("get-block", blockId)) as
      | Block
      | null
      | undefined
    return fromBackend ?? null
  } catch (error) {
    console.error("[web-import] get-block for AI summary failed:", error)
    return null
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = (error as { name?: string }).name
  const message = error instanceof Error ? error.message : String(error)
  return name === "AbortError" || /abort/i.test(message)
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function measurePlainTextLength(text: string): number {
  return normalizeSpace(text).length
}

/** Re-export for tests that compare against measurePlainText of HTML. */
export { measurePlainText }
