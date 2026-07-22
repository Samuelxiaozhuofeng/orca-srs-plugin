/**
 * AI 快捷交互：后台生成并插入到查询块下方的任务队列
 *
 * 与弹窗态（aiQuickInteractState）独立：用户可继续阅读，完成后落盘再操作。
 */

import {
  dismissQuickResult,
  insertQuickResultAsChild,
  keepQuickResult,
  keepSingleQuickResultBlock,
  promoteQuickResultToChild,
  runToolbarAIPrompt
} from "./aiQuickInteract"
import { sanitizePublicError } from "../http/redactSecrets"

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
  /** 覆盖全局 model；空 = 默认 */
  model: string
  status: QuickBackgroundJobStatus
  resultText: string
  errorMessage: string | null
  /** 已插入到块下方的结果标题块 ID */
  resultRootBlockId: number | null
  createdAt: number
  /**
   * 启动时的面板 id + 视图指纹。
   * 用户离开该面板视图且未点「保留」时，默认按取消处理（删除预览块）。
   */
  panelId: string | null
  panelViewKey: string | null
}

/** 读取面板当前视图指纹（view + 稳定 viewArgs） */
export function computePanelViewKey(panelId: string): string | null {
  try {
    if (!panelId || typeof orca?.nav?.findViewPanel !== "function") {
      return null
    }
    const panel = orca.nav.findViewPanel(panelId, orca.state.panels)
    if (!panel) return null
    const args = panel.viewArgs ?? {}
    const dateRaw = args.date
    const date =
      dateRaw instanceof Date
        ? dateRaw.toISOString()
        : typeof dateRaw === "string" || typeof dateRaw === "number"
          ? String(dateRaw)
          : null
    return JSON.stringify({
      view: panel.view,
      blockId: args.blockId ?? null,
      date
    })
  } catch (error) {
    console.warn("[AI QuickInteract] 读取面板视图指纹失败:", error)
    return null
  }
}

/** 启动任务时捕获当前 activePanel 视图，供离开时默认取消 */
export function captureActivePanelViewSnapshot(): {
  panelId: string | null
  panelViewKey: string | null
} {
  try {
    const panelId =
      typeof orca?.state?.activePanel === "string" ? orca.state.activePanel : null
    if (!panelId) {
      return { panelId: null, panelViewKey: null }
    }
    return { panelId, panelViewKey: computePanelViewKey(panelId) }
  } catch (error) {
    console.warn("[AI QuickInteract] 捕获面板快照失败:", error)
    return { panelId: null, panelViewKey: null }
  }
}

/** 任务所属面板视图是否仍在（无指纹时视为仍有效，避免误删） */
export function isJobPanelViewStillActive(job: QuickBackgroundJob): boolean {
  if (!job.panelId || !job.panelViewKey) return true
  const current = computePanelViewKey(job.panelId)
  // 面板已关闭 → null，视为离开
  return current === job.panelViewKey
}

export type StartBackgroundQuickInsertOptions = {
  pluginName: string
  sourceBlockId: number
  selectedText: string
  blockText: string
  promptLabel: string
  promptText: string
  includeBlockContext: boolean
  model?: string
}

function getValtioProxy<T extends object>(target: T): T {
  if (typeof window !== "undefined" && window.Valtio?.proxy) {
    return window.Valtio.proxy(target)
  }
  return target
}

export const aiQuickJobsState = getValtioProxy({
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
 * 启动后台任务：静默请求 AI，成功后直接插入到目标块下方作为子块，过程无右下角 Toast 弹窗打扰。
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

  const model =
    typeof opts.model === "string" ? opts.model.trim() : ""

  const panelSnap = captureActivePanelViewSnapshot()

  const job: QuickBackgroundJob = {
    id,
    pluginName: opts.pluginName,
    sourceBlockId: opts.sourceBlockId,
    selectedText: opts.selectedText,
    blockText: opts.blockText,
    promptLabel: opts.promptLabel,
    promptText: instruction,
    includeBlockContext: opts.includeBlockContext,
    model,
    status: "generating",
    resultText: "",
    errorMessage: null,
    resultRootBlockId: null,
    createdAt: Date.now(),
    panelId: panelSnap.panelId,
    panelViewKey: panelSnap.panelViewKey
  }
  aiQuickJobsState.jobs = [...aiQuickJobsState.jobs, job]

  try {
    const result = await runToolbarAIPrompt({
      pluginName: opts.pluginName,
      selectedText: opts.selectedText,
      blockText: opts.blockText,
      includeBlockContext: opts.includeBlockContext,
      model,
      userInstruction: instruction,
      signal: controller.signal
    })

    const current = findJob(id)
    if (!current) return id

    if (controller.signal.aborted) {
      removeJob(id)
      return id
    }

    // 生成期间用户已离开面板：默认取消，不写入预览块
    if (!isJobPanelViewStillActive(current)) {
      removeJob(id)
      return id
    }

    if (!result.success) {
      if (result.error.code === "CANCELLED") {
        removeJob(id)
        return id
      }
      const safe = sanitizePublicError(result.error.message)
      current.status = "error"
      current.errorMessage = safe
      current.resultText = ""
      return id
    }

    const insert = await insertQuickResultAsChild(
      opts.sourceBlockId,
      result.text,
      opts.promptLabel,
      opts.selectedText
    )

    const afterInsert = findJob(id)
    if (!afterInsert) return id

    if (!insert.success) {
      afterInsert.status = "error"
      afterInsert.errorMessage = insert.error
      afterInsert.resultText = result.text
      return id
    }

    // 插入后再次检查：若已离开面板，默认取消（删掉刚写入的预览树）
    if (!isJobPanelViewStillActive(afterInsert)) {
      afterInsert.status = "ready"
      afterInsert.resultText = result.text
      afterInsert.resultRootBlockId = insert.blockId
      afterInsert.errorMessage = null
      await dismissBackgroundQuickJob(id)
      return id
    }

    afterInsert.status = "ready"
    afterInsert.resultText = result.text
    afterInsert.resultRootBlockId = insert.blockId
    afterInsert.errorMessage = null
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
export function cancelBackgroundQuickJob(
  jobId: string,
  opts?: { silent?: boolean }
): void {
  const job = findJob(jobId)
  if (!job) return
  if (job.status !== "generating") return
  abortByJobId.get(jobId)?.abort()
  abortByJobId.delete(jobId)
  removeJob(jobId)
  if (!opts?.silent) {
    orca.notify("info", "已取消生成", { title: "AI 快捷交互" })
  }
}

/**
 * 保留预览结果：更新结果块属性为 kept（沉淀为笔记），并结束预览态（卸罩层/按钮）。
 *
 * 内容已在笔记中：即使状态属性写入失败，也卸掉预览 UI，避免「点了保留没反应」。
 */
export async function keepBackgroundQuickJob(jobId: string): Promise<void> {
  const job = findJob(jobId)
  if (!job) return
  if (job.resultRootBlockId != null) {
    const result = await keepQuickResult(job.resultRootBlockId)
    if (!result.success) {
      console.error("[AI QuickInteract] 保留结果块失败:", result.error)
      orca.notify("warn", `内容已保留，状态标记失败：${result.error}`, {
        title: "AI 快捷交互"
      })
    }
  }
  // 无论属性是否写成功，都结束预览任务（块内容保留）
  removeJob(jobId)
}

/**
 * 仅保留预览树中的某一块（含其子树）：去掉 AI 外壳与其它兄弟，并结束预览任务。
 * 失败时保留任务与预览树，便于重试。
 */
export async function keepSingleBlockBackgroundQuickJob(
  jobId: string,
  keepBlockId: number
): Promise<void> {
  const job = findJob(jobId)
  if (!job) return
  if (job.status !== "ready" || job.resultRootBlockId == null) {
    orca.notify("warn", "当前任务没有可保留的预览块", { title: "AI 快捷交互" })
    return
  }
  if (!Number.isFinite(keepBlockId)) {
    orca.notify("error", "无效的块 ID", { title: "AI 快捷交互" })
    return
  }

  const result = await keepSingleQuickResultBlock(
    job.resultRootBlockId,
    keepBlockId
  )
  if (!result.success) {
    console.error("[AI QuickInteract] 仅保留单块失败:", result.error)
    orca.notify("error", result.error, { title: "AI 快捷交互" })
    return
  }
  removeJob(jobId)
  orca.notify("success", "已保留该块", { title: "AI 快捷交互" })
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

/**
 * 离开所属面板视图时：默认取消未保留的预览。
 * - generating：静默中止
 * - ready：删除预览树
 * - error：仅移除任务卡
 */
export async function dismissJobsLeftBehindOnPanelLeave(): Promise<void> {
  const snapshot = [
    ...(aiQuickJobsState.jobs as QuickBackgroundJob[])
  ]
  for (const job of snapshot) {
    if (isJobPanelViewStillActive(job)) continue
    if (job.status === "generating") {
      cancelBackgroundQuickJob(job.id, { silent: true })
      continue
    }
    if (job.status === "error") {
      acknowledgeBackgroundQuickJobError(job.id)
      continue
    }
    // ready：等同用户点「取消」
    await dismissBackgroundQuickJob(job.id)
  }
}

/**
 * 插件卸载 / 全局清理：中止请求；未「保留」的 ready 预览默认删除（不保存）。
 */
export async function cancelAllBackgroundQuickJobs(): Promise<void> {
  for (const [id, controller] of abortByJobId) {
    controller.abort()
    abortByJobId.delete(id)
  }
  const snapshot = [
    ...(aiQuickJobsState.jobs as QuickBackgroundJob[])
  ]
  aiQuickJobsState.jobs = []
  for (const job of snapshot) {
    if (job.status === "ready" && job.resultRootBlockId != null) {
      try {
        const result = await dismissQuickResult(job.resultRootBlockId)
        if (!result.success) {
          console.error(
            "[AI QuickInteract] 卸载时删除预览块失败:",
            result.error
          )
        }
      } catch (error) {
        console.error("[AI QuickInteract] 卸载时删除预览块异常:", error)
      }
    }
  }
}
