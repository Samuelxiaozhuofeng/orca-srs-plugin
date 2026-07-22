/**
 * 后台 AI 快捷交互任务面板（非模态）
 * 让生成、失败、临时预览与最近删除结果始终可见、可恢复。
 */

import type { QuickBackgroundJob } from "../srs/ai/aiQuickInteractJobs"
import {
  acknowledgeBackgroundQuickJobError,
  aiQuickJobsState,
  cancelBackgroundQuickJob,
  clearRecentQuickResults,
  dismissBackgroundQuickJob,
  followUpBackgroundQuickJob,
  forgetRecentQuickResult,
  keepBackgroundQuickJob,
  moveBackgroundQuickJobAfter,
  regenerateBackgroundQuickJob,
  restoreRecentQuickResult,
  retryBackgroundQuickJob,
  type QuickRecentResult
} from "../srs/ai/aiQuickInteractJobs"

const { Valtio } = window
const { useSnapshot } = Valtio
const { useState } = window.React

function statusLabel(job: QuickBackgroundJob): string {
  if (job.status === "generating") {
    return job.resultText.trim() ? "正在写入预览…" : "生成中…"
  }
  if (job.status === "ready") return "临时子块预览"
  return "失败"
}

function excerpt(text: string, max = 72): string {
  const compact = text.replace(/\s+/g, " ").trim()
  return compact.length > max ? `${compact.slice(0, max)}…` : compact
}

async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.left = "-9999px"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      textarea.remove()
    }
    orca.notify("success", "已复制结果", { title: "Quick AI" })
  } catch (error) {
    console.error("[AI QuickInteract] 复制失败:", error)
    orca.notify("error", "复制失败，请重试", { title: "Quick AI" })
  }
}

function RecentItem({ item }: { item: QuickRecentResult }) {
  return (
    <li className="ai-quick-jobs__recent-item">
      <div className="ai-quick-jobs__job-main">
        <strong>{item.promptLabel}</strong>
        <span title={item.resultText}>{excerpt(item.resultText)}</span>
      </div>
      <div className="ai-quick-jobs__actions">
        <button
          type="button"
          onClick={() => void restoreRecentQuickResult(item.id)}
        >
          恢复并保留
        </button>
        <button type="button" onClick={() => forgetRecentQuickResult(item.id)}>
          忘记
        </button>
      </div>
    </li>
  )
}

export function AIQuickJobsPanel() {
  const snap = useSnapshot(aiQuickJobsState)
  const [collapsed, setCollapsed] = useState(false)
  const jobs = snap.jobs as readonly QuickBackgroundJob[]
  const recent = snap.recent as readonly QuickRecentResult[]

  if (jobs.length === 0 && recent.length === 0) return null

  return (
    <aside
      className="ai-quick-jobs"
      aria-label="Quick AI 任务"
    >
      <header className="ai-quick-jobs__header">
        <span>
          <i className="ti ti-sparkles" aria-hidden="true" /> Quick AI
        </span>
        <span className="ai-quick-jobs__header-actions">
          <small>{jobs.length > 0 ? `${jobs.length} 项任务` : "最近结果"}</small>
          <button
            type="button"
            className="ai-quick-jobs__collapse"
            onClick={() => setCollapsed((value: boolean) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "展开 Quick AI 任务" : "收起 Quick AI 任务"}
            title={collapsed ? "展开" : "收起"}
          >
            <i
              className={`ti ${collapsed ? "ti-chevron-up" : "ti-chevron-down"}`}
              aria-hidden="true"
            />
          </button>
        </span>
      </header>

      {!collapsed && jobs.length > 0 ? (
        <ul className="ai-quick-jobs__list">
          {jobs.map((job) => (
            <li
              key={job.id}
              className={`ai-quick-jobs__job ai-quick-jobs__job--${job.status}`}
            >
              <div className="ai-quick-jobs__job-main">
                <strong>{job.promptLabel}</strong>
                <span className="ai-quick-jobs__status" aria-live="polite">
                  {statusLabel(job)}
                </span>
                {job.status === "error" || job.errorMessage ? (
                  <span className="ai-quick-jobs__error" role="alert">
                    {job.errorMessage || "生成失败，请重试"}
                  </span>
                ) : (
                  <span title={job.selectedText}>{excerpt(job.selectedText)}</span>
                )}
              </div>
              <div className="ai-quick-jobs__actions">
                {job.status === "generating" ? (
                  <button
                    type="button"
                    onClick={() => cancelBackgroundQuickJob(job.id)}
                  >
                    取消
                  </button>
                ) : null}
                {job.status === "error" ? (
                  <>
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => void retryBackgroundQuickJob(job.id)}
                    >
                      重试
                    </button>
                    <button
                      type="button"
                      onClick={() => acknowledgeBackgroundQuickJobError(job.id)}
                    >
                      关闭
                    </button>
                  </>
                ) : null}
                {job.status === "ready" ? (
                  <>
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => void keepBackgroundQuickJob(job.id)}
                    >
                      保留
                    </button>
                    <button
                      type="button"
                      onClick={() => void followUpBackgroundQuickJob(job.id)}
                    >
                      追问
                    </button>
                    <button
                      type="button"
                      onClick={() => void regenerateBackgroundQuickJob(job.id)}
                      title="保留当前临时预览供比较；离开页面仍会删除"
                    >
                      再生成
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(job.resultText)}
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveBackgroundQuickJobAfter(job.id)}
                    >
                      移为同级
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismissBackgroundQuickJob(job.id)}
                    >
                      删除
                    </button>
                  </>
                ) : null}
              </div>
              {job.status === "ready" ? (
                <small className="ai-quick-jobs__temporary-note">
                  临时结果；离开当前页面会删除，可在本次会话的“最近删除”中恢复。
                </small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!collapsed && recent.length > 0 ? (
        <section className="ai-quick-jobs__recent">
          <div className="ai-quick-jobs__recent-header">
            <span>最近删除</span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("清空全部 Quick AI 最近删除结果？")) {
                  clearRecentQuickResults()
                }
              }}
            >
              清空
            </button>
          </div>
          <ul>
            {recent.map((item) => (
              <RecentItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}
