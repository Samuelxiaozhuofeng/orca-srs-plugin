/**
 * 后台 AI 快捷交互任务面板（非模态）
 * generating / ready / error 卡片：取消、插入为子块、关闭
 */

import type { QuickBackgroundJob } from "../srs/ai/aiQuickInteractJobs"
import {
  acknowledgeBackgroundQuickJobError,
  aiQuickJobsState,
  cancelBackgroundQuickJob,
  dismissBackgroundQuickJob,
  promoteBackgroundQuickJob
} from "../srs/ai/aiQuickInteractJobs"

const { Valtio } = window
const { useSnapshot } = Valtio

function statusLabel(job: QuickBackgroundJob): string {
  if (job.status === "generating") return "生成中…"
  if (job.status === "ready") return "已插入到块下方"
  return "失败"
}

export function AIQuickJobsPanel() {
  const snap = useSnapshot(aiQuickJobsState)
  const jobs = snap.jobs as readonly QuickBackgroundJob[]
  if (jobs.length === 0) return null

  return (
    <div className="ai-quick-jobs" role="region" aria-label="AI 后台任务">
      {jobs.map((job: QuickBackgroundJob) => (
        <article key={job.id} className={`ai-quick-jobs__card ai-quick-jobs__card--${job.status}`}>
          <header className="ai-quick-jobs__card-header">
            <div className="ai-quick-jobs__card-title">
              <i className="ti ti-sparkles" aria-hidden="true" />
              <span>{job.promptLabel || "AI 快捷交互"}</span>
            </div>
            <span className="ai-quick-jobs__card-status">{statusLabel(job)}</span>
          </header>

          {job.selectedText ? (
            <p className="ai-quick-jobs__selection" title={job.selectedText}>
              选区：{job.selectedText.length > 80
                ? `${job.selectedText.slice(0, 80)}…`
                : job.selectedText}
            </p>
          ) : null}

          {job.status === "generating" ? (
            <div className="ai-quick-jobs__status-line" aria-live="polite">
              <i className="ti ti-loader-2 ai-quick-jobs__spin" aria-hidden="true" />
              <span>正在生成，可继续阅读…</span>
            </div>
          ) : null}

          {job.status === "error" && job.errorMessage ? (
            <div className="ai-quick-jobs__error" role="alert">
              {job.errorMessage}
            </div>
          ) : null}

          {job.status === "ready" ? (
            <p className="ai-quick-jobs__hint">
              结果已写在查询块下方。阅读后可插入为子块，或关闭删除该结果。
            </p>
          ) : null}

          <footer className="ai-quick-jobs__actions">
            {job.status === "generating" ? (
              <button
                type="button"
                className="ai-quick-jobs__btn ai-quick-jobs__btn--secondary"
                onClick={() => cancelBackgroundQuickJob(job.id)}
              >
                取消生成
              </button>
            ) : null}

            {job.status === "ready" ? (
              <>
                <button
                  type="button"
                  className="ai-quick-jobs__btn ai-quick-jobs__btn--primary"
                  onClick={() => {
                    void promoteBackgroundQuickJob(job.id)
                  }}
                >
                  插入为子块
                </button>
                <button
                  type="button"
                  className="ai-quick-jobs__btn ai-quick-jobs__btn--ghost"
                  onClick={() => {
                    void dismissBackgroundQuickJob(job.id)
                  }}
                >
                  关闭
                </button>
              </>
            ) : null}

            {job.status === "error" ? (
              <button
                type="button"
                className="ai-quick-jobs__btn ai-quick-jobs__btn--ghost"
                onClick={() => acknowledgeBackgroundQuickJobError(job.id)}
              >
                知道了
              </button>
            ) : null}
          </footer>
        </article>
      ))}
    </div>
  )
}
