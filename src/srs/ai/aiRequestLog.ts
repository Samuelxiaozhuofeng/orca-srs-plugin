/**
 * AI 请求日志与用量统计（会话内存，不落库）。
 *
 * 动机：出错时用户此前只能看到一句 toast——`AI_API_404错误排查指南.md` 写了
 * 181 行排查步骤，正说明「看不到实际发生了什么」是真实痛点。
 * 这里保留最近若干次请求的可诊断信息（已脱敏），供设置面板展示。
 *
 * 用量同理：上游返回的 usage 此前被整体丢弃，用户接自己的 Key 却看不到消耗。
 *
 * 刻意不持久化：每次请求都写 plugin data 会造成写放大，
 * 且这些数据的价值集中在「刚出错的这一会儿」。UI 明确标注为本次会话统计。
 */

import type { ChatUsage } from "./aiChatClient"

/** 保留的最近请求条数。 */
export const AI_REQUEST_LOG_MAX = 50

export type AiRequestPurpose =
  | "card"
  | "quick"
  | "explain"
  | "web-summary"
  | "connection-test"
  | "other"

export const AI_REQUEST_PURPOSE_LABELS: Record<AiRequestPurpose, string> = {
  card: "AI 制卡",
  quick: "快捷交互",
  explain: "块解释",
  "web-summary": "网页总结",
  "connection-test": "连接测试",
  other: "其它"
}

export type AiRequestLogEntry = {
  id: string
  /** epoch ms */
  startedAt: number
  durationMs: number
  purpose: AiRequestPurpose
  /** 请求体里发出的 model（非上游回报值）。 */
  model: string
  /** 仅主机名：避免把 path/query 里可能的标识写进日志。 */
  endpointHost: string
  ok: boolean
  httpStatus?: number
  errorCode?: string
  /** 已经过 sanitizePublicError 的文本。 */
  errorMessage?: string
  usage?: ChatUsage
  /** 实际发出的请求次数；> 1 表示发生过重试。 */
  attempts: number
}

export type AiUsageTotals = {
  requests: number
  failed: number
  retried: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

let entries: AiRequestLogEntry[] = []
let seq = 0
let totals: AiUsageTotals = {
  requests: 0,
  failed: 0,
  retried: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.warn("[AI 请求日志] 订阅者回调失败:", error)
    }
  }
}

export function subscribeAiRequestLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 从完整 URL 取主机名；解析失败时返回原串截断，不静默丢信息。 */
export function extractEndpointHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.slice(0, 64)
  }
}

export function recordAiRequest(
  entry: Omit<AiRequestLogEntry, "id">
): AiRequestLogEntry {
  seq += 1
  const record: AiRequestLogEntry = { ...entry, id: `airq_${seq}` }

  entries.unshift(record)
  if (entries.length > AI_REQUEST_LOG_MAX) {
    entries.length = AI_REQUEST_LOG_MAX
  }

  totals = {
    requests: totals.requests + 1,
    failed: totals.failed + (record.ok ? 0 : 1),
    retried: totals.retried + (record.attempts > 1 ? 1 : 0),
    promptTokens: totals.promptTokens + (record.usage?.promptTokens ?? 0),
    completionTokens:
      totals.completionTokens + (record.usage?.completionTokens ?? 0),
    totalTokens: totals.totalTokens + (record.usage?.totalTokens ?? 0)
  }

  emit()
  return record
}

/** 最近的请求在前。 */
export function getAiRequestLog(limit = AI_REQUEST_LOG_MAX): AiRequestLogEntry[] {
  return entries.slice(0, Math.max(0, limit))
}

export function getAiUsageTotals(): AiUsageTotals {
  return { ...totals }
}

export function clearAiRequestLog(): void {
  entries = []
  totals = {
    requests: 0,
    failed: 0,
    retried: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  }
  emit()
}
