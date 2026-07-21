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
  return null
}
