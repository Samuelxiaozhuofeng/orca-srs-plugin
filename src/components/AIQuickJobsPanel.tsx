/**
 * 后台 AI 快捷交互任务面板（非模态）
 * generating / ready / error 卡片：取消、插入为子块、关闭
 */

import type { QuickBackgroundJob } from "../srs/ai/aiQuickInteractJobs"
import {
  acknowledgeBackgroundQuickJobError,
  aiQuickJobsState
} from "../srs/ai/aiQuickInteractJobs"
import { openAIServiceSettings } from "../srs/ai/aiServiceSettingsState"

const { Valtio } = window
const { useSnapshot } = Valtio

export function AIQuickJobsPanel() {
  const snap = useSnapshot(aiQuickJobsState)
  const jobs = (snap.jobs as readonly QuickBackgroundJob[]).filter(
    (job) =>
      job.status === "error" && job.canOpenConnectionSettings === true
  )
  if (jobs.length === 0) return null

  return (
    <div className="ai-quick-jobs" role="region" aria-label="AI 后台任务错误">
      {jobs.map((job) => (
        <article
          key={job.id}
          className="ai-quick-jobs__card ai-quick-jobs__card--error"
        >
          <header className="ai-quick-jobs__card-header">
            <div className="ai-quick-jobs__card-title">
              <i className="ti ti-sparkles" aria-hidden="true" />
              <span>{job.promptLabel || "AI 快捷交互"}</span>
            </div>
            <span className="ai-quick-jobs__card-status">失败</span>
          </header>
          <div className="ai-quick-jobs__error" role="alert">
            {job.errorMessage}
          </div>
          <footer className="ai-quick-jobs__actions">
            <button
              type="button"
              className="ai-quick-jobs__btn ai-quick-jobs__btn--primary"
              onClick={() => {
                void openAIServiceSettings(job.pluginName).catch((error) => {
                  console.error("[AI 后台任务] 打开连接设置失败:", error)
                  orca.notify(
                    "error",
                    "打开连接设置失败，请从插件设置中重试",
                    { title: "AI 后台任务" }
                  )
                })
              }}
            >
              打开连接设置
            </button>
            <button
              type="button"
              className="ai-quick-jobs__btn ai-quick-jobs__btn--ghost"
              onClick={() => acknowledgeBackgroundQuickJobError(job.id)}
            >
              知道了
            </button>
          </footer>
        </article>
      ))}
    </div>
  )
}
