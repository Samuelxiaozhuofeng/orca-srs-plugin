/**
 * AI 服务设置面板中的「用量与最近请求」区块。
 *
 * 出错时用户此前只能看到一句 toast，只能对着排查文档猜。
 * 这里把链路里已有的信息（状态码、脱敏后的错误正文、耗时、重试次数、token 用量）
 * 直接摊开，省掉「猜配置错在哪」这一步。
 */

import {
  AI_REQUEST_PURPOSE_LABELS,
  clearAiRequestLog,
  getAiRequestLog,
  getAiUsageTotals,
  subscribeAiRequestLog,
  type AiRequestLogEntry
} from "../srs/ai/aiRequestLog"

/** 面板里展开显示的最近条数（全量仍保留在环形缓冲中）。 */
const VISIBLE_ENTRIES = 12

function formatClock(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

function EntryRow({ entry }: { entry: AiRequestLogEntry }) {
  return (
    <li
      className={`ai-request-log__row ai-request-log__row--${
        entry.ok ? "ok" : "error"
      }`}
    >
      <div className="ai-request-log__row-head">
        <span className="ai-request-log__time">{formatClock(entry.startedAt)}</span>
        <span className="ai-request-log__purpose">
          {AI_REQUEST_PURPOSE_LABELS[entry.purpose]}
        </span>
        <span className="ai-request-log__model" title={entry.model}>
          {entry.model}
        </span>
        <span className="ai-request-log__duration">
          {formatDuration(entry.durationMs)}
        </span>
        {entry.attempts > 1 ? (
          <span className="ai-request-log__badge" title="发生过重试">
            ×{entry.attempts}
          </span>
        ) : null}
        <span
          className={`ai-request-log__status ai-request-log__status--${
            entry.ok ? "ok" : "error"
          }`}
        >
          {entry.ok ? entry.httpStatus ?? 200 : entry.errorCode}
        </span>
      </div>
      <div className="ai-request-log__row-meta">
        <span className="ai-request-log__host">{entry.endpointHost}</span>
        {entry.usage ? (
          <span className="ai-request-log__tokens">
            {formatTokens(entry.usage.promptTokens)} in ·{" "}
            {formatTokens(entry.usage.completionTokens)} out
          </span>
        ) : null}
      </div>
      {!entry.ok && entry.errorMessage ? (
        <p className="ai-request-log__error">{entry.errorMessage}</p>
      ) : null}
    </li>
  )
}

export function AiRequestLogSection() {
  const { useState, useEffect } = window.React
  const [, forceTick] = useState(0)

  useEffect(() => {
    return subscribeAiRequestLog(() => forceTick((n: number) => n + 1))
  }, [])

  const totals = getAiUsageTotals()
  const entries = getAiRequestLog(VISIBLE_ENTRIES)

  return (
    <section className="ai-service-settings__section">
      <h3 className="ai-service-settings__section-title">
        <i className="ti ti-activity" aria-hidden="true" />
        用量与最近请求
      </h3>
      <p className="ai-service-settings__section-desc">
        本次会话统计（重启 Orca 后清零，不写入笔记库）。
      </p>

      <div className="ai-request-log__totals">
        <div className="ai-request-log__stat">
          <span className="ai-request-log__stat-value">{totals.requests}</span>
          <span className="ai-request-log__stat-label">请求</span>
        </div>
        <div className="ai-request-log__stat">
          <span className="ai-request-log__stat-value">{totals.failed}</span>
          <span className="ai-request-log__stat-label">失败</span>
        </div>
        <div className="ai-request-log__stat">
          <span className="ai-request-log__stat-value">{totals.retried}</span>
          <span className="ai-request-log__stat-label">重试过</span>
        </div>
        <div className="ai-request-log__stat">
          <span className="ai-request-log__stat-value">
            {formatTokens(totals.totalTokens)}
          </span>
          <span className="ai-request-log__stat-label">token</span>
        </div>
      </div>

      {totals.requests > 0 && totals.totalTokens === 0 ? (
        <p className="ai-service-settings__hint">
          上游未返回 usage 字段，token 数无法统计（部分网关会省略）。
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="ai-service-settings__hint">本次会话还没有 AI 请求。</p>
      ) : (
        <>
          <ul className="ai-request-log__list">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
          <div className="ai-service-settings__row-actions">
            <button
              type="button"
              className="ai-service-settings__btn ai-service-settings__btn--secondary"
              onClick={() => clearAiRequestLog()}
            >
              清空记录
            </button>
          </div>
        </>
      )}
    </section>
  )
}
