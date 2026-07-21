/**
 * AI 快捷交互：后台生成并插入到查询块下方的任务队列
 *
 * 与弹窗态（aiQuickInteractState）独立：用户可继续阅读，完成后落盘再操作。
 */

import {
  dismissQuickResult,
  insertQuickResultAfter,
  promoteQuickResultToChild,
  runToolbarAIPrompt
} from "./aiQuickInteract"
import { sanitizePublicError } from "../http/redactSecrets"

const { proxy } = window.Valtio

export type QuickBackgroundJobStatus = "generating" | "ready" | "error"

export interface QuickBackgroundJob {
  id: string
  pluginName: string
  sourceBlockId: number
  selectedText: string
  blockText: string
  promptLabel: string
  promptText: string
  includeBlockContext: boolean
  status: QuickBackgroundJobStatus
  resultText: string
  errorMessage: string | null
  /** 已插入到块下方的结果标题块 ID */
  resultRootBlockId: number | null
  createdAt: number
}

export type StartBackgroundQuickInsertOptions = {
  pluginName: string
  sourceBlockId: number
  selectedText: string
  blockText: string
  promptLabel: string
  promptText: string
  includeBlockContext: boolean
}

export const aiQuickJobsState = proxy({
  jobs: [] as QuickBackgroundJob[]
})

const abortByJobId = new Map<string, AbortController>()

let jobSeq = 0

function nextJobId(): string {
  jobSeq += 1
  return `qi-job-${Date.now()}-${jobSeq}`
}

function findJob(jobId: string): QuickBackgroundJob | undefined {
  return (aiQuickJobsState.jobs as QuickBackgroundJob[]).find(
    (j: QuickBackgroundJob) => j.id === jobId
  )
}

function removeJob(jobId: string): void {
  abortByJobId.get(jobId)?.abort()
  abortByJobId.delete(jobId)
  aiQuickJobsState.jobs = (aiQuickJobsState.jobs as QuickBackgroundJob[]).filter(
    (j: QuickBackgroundJob) => j.id !== jobId
  )
}

export function hasActiveQuickBackgroundJobs(): boolean {
  return (aiQuickJobsState.jobs as QuickBackgroundJob[]).some(
    (j: QuickBackgroundJob) =>
      j.status === "generating" || j.status === "ready"
  )
}

/**
 * 启动后台任务：立即请求 AI，成功后插入查询块下方，任务进入 ready 供用户处置。
 */
export async function startBackgroundQuickInsertJob(
  opts: StartBackgroundQuickInsertOptions
): Promise<string> {
  const title = "AI 快捷交互"
  const instruction = opts.promptText.trim()
  if (!instruction) {
    orca.notify("warn", "提示词为空，无法发送", { title })
    throw new Error("提示词为空")
  }
  if (!opts.selectedText.trim()) {
    orca.notify("warn", "选中文本为空，无法发送", { title })
    throw new Error("选中文本为空")
  }

  const id = nextJobId()
  const controller = new AbortController()
  abortByJobId.set(id, controller)

  const job: QuickBackgroundJob = {
    id,
    pluginName: opts.pluginName,
    sourceBlockId: opts.sourceBlockId,
    selectedText: opts.selectedText,
    blockText: opts.blockText,
    promptLabel: opts.promptLabel,
    promptText: instruction,
    includeBlockContext: opts.includeBlockContext,
    status: "generating",
    resultText: "",
    errorMessage: null,
    resultRootBlockId: null,
    createdAt: Date.now()
  }
  aiQuickJobsState.jobs = [...aiQuickJobsState.jobs, job]

  orca.notify(
    "info",
    `「${opts.promptLabel}」已发送，生成后将插入到选中块下方`,
    { title }
  )

  try {
    const result = await runToolbarAIPrompt({
      pluginName: opts.pluginName,
      selectedText: opts.selectedText,
      blockText: opts.blockText,
      includeBlockContext: opts.includeBlockContext,
      userInstruction: instruction,
      signal: controller.signal
    })

    const current = findJob(id)
    if (!current) return id

    if (controller.signal.aborted) {
      removeJob(id)
      return id
    }

    if (!result.success) {
      if (result.error.code === "CANCELLED") {
        removeJob(id)
        orca.notify("info", "已取消生成", { title })
        return id
      }
      const safe = sanitizePublicError(result.error.message)
      current.status = "error"
      current.errorMessage = safe
      current.resultText = ""
      orca.notify("error", safe, { title })
      return id
    }

    const insert = await insertQuickResultAfter(
      opts.sourceBlockId,
      result.text,
      opts.promptLabel
    )

    const afterInsert = findJob(id)
    if (!afterInsert) return id

    if (!insert.success) {
      afterInsert.status = "error"
      afterInsert.errorMessage = insert.error
      afterInsert.resultText = result.text
      orca.notify("error", insert.error, { title })
      return id
    }

    afterInsert.status = "ready"
    afterInsert.resultText = result.text
    afterInsert.resultRootBlockId = insert.blockId
    afterInsert.errorMessage = null
    orca.notify("success", `「${opts.promptLabel}」已插入到块下方`, { title })
    return id
  } catch (error) {
    if (controller.signal.aborted) {
      removeJob(id)
      return id
    }
    const current = findJob(id)
    if (!current) return id
    const message = sanitizePublicError(
      error instanceof Error ? error.message : "生成失败，请重试"
    )
    current.status = "error"
    current.errorMessage = message
    console.error("[AI QuickInteract] 后台任务失败:", error)
    orca.notify("error", message, { title })
    return id
  } finally {
    abortByJobId.delete(id)
  }
}

/** 取消进行中的生成；ready/error 请用 dismiss/acknowledge */
export function cancelBackgroundQuickJob(jobId: string): void {
  const job = findJob(jobId)
  if (!job) return
  if (job.status !== "generating") return
  abortByJobId.get(jobId)?.abort()
  abortByJobId.delete(jobId)
  removeJob(jobId)
  orca.notify("info", "已取消生成", { title: "AI 快捷交互" })
}

/**
 * 将块下方结果提升为查询块的子块，并移除任务卡片。
 */
export async function promoteBackgroundQuickJob(jobId: string): Promise<void> {
  const job = findJob(jobId)
  if (!job) return
  if (job.status !== "ready" || job.resultRootBlockId == null) {
    orca.notify("warn", "当前任务没有可提升的结果块", { title: "AI 快捷交互" })
    return
  }

  const result = await promoteQuickResultToChild(
    job.sourceBlockId,
    job.resultRootBlockId
  )
  if (!result.success) {
    orca.notify("error", result.error, { title: "AI 快捷交互" })
    return
  }
  removeJob(jobId)
  orca.notify("success", "已插入为查询块的子块", { title: "AI 快捷交互" })
}

/**
 * 关闭结果：删除已插入的结果树，并移除任务卡片。
 * 若尚未插入（error 且无块），仅移除卡片。
 */
export async function dismissBackgroundQuickJob(jobId: string): Promise<void> {
  const job = findJob(jobId)
  if (!job) return

  if (job.status === "generating") {
    cancelBackgroundQuickJob(jobId)
    return
  }

  if (job.resultRootBlockId != null) {
    const result = await dismissQuickResult(job.resultRootBlockId)
    if (!result.success) {
      orca.notify("error", result.error, { title: "AI 快捷交互" })
      return
    }
  }

  removeJob(jobId)
}

/** 错误卡片：仅移除，不删块（通常尚未插入） */
export function acknowledgeBackgroundQuickJobError(jobId: string): void {
  const job = findJob(jobId)
  if (!job || job.status !== "error") return
  // 若错误发生在插入之后（极少：有 root id 但仍是 error），保留块、仅关卡片
  removeJob(jobId)
}

/** 插件卸载：中止请求并清空队列（不自动删已写入的结果块，避免丢用户数据） */
export function cancelAllBackgroundQuickJobs(): void {
  for (const [id, controller] of abortByJobId) {
    controller.abort()
    abortByJobId.delete(id)
  }
  aiQuickJobsState.jobs = []
}
