/**
 * AI 快捷交互：后台生成并插入为查询块子块的任务队列
 *
 * 与弹窗态（aiQuickInteractState）独立：用户可继续阅读，完成后落盘再操作。
 */

import {
  dismissQuickResult,
  insertQuickResultAsChild,
  keepQuickResult,
  keepSingleQuickResultBlock,
  moveQuickResultAfter,
  runToolbarAIPrompt
} from "./aiQuickInteract"
import { sanitizePublicError } from "../http/redactSecrets"

export type QuickBackgroundJobStatus = "generating" | "ready" | "error"
export type QuickBackgroundJobErrorStage = "generate" | "insert" | null

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
  /** 用于失败重试：插入失败直接重试写入，避免再次调用模型。 */
  errorStage: QuickBackgroundJobErrorStage
  /** 已插入为查询块子块的结果标题块 ID */
  resultRootBlockId: number | null
  createdAt: number
  /**
   * 启动时的面板 id + 视图指纹。
   * 用户离开该面板视图且未点「保留」时，默认按取消处理（删除预览块）。
   */
  panelId: string | null
  panelViewKey: string | null
}

export interface QuickRecentResult {
  id: string
  pluginName: string
  sourceBlockId: number
  selectedText: string
  blockText: string
  promptLabel: string
  promptText: string
  includeBlockContext: boolean
  model: string
  resultText: string
  createdAt: number
  archivedAt: number
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
  jobs: [] as QuickBackgroundJob[],
  /** 仅保存在当前插件会话内，用于找回被取消/离开面板时删除的预览。 */
  recent: [] as QuickRecentResult[]
})

const MAX_RECENT_RESULTS = 10

const abortByJobId = new Map<string, AbortController>()
const regeneratingJobIds = new Set<string>()
const actionPendingJobIds = new Set<string>()
const actionCompletionByJobId = new Map<string, Promise<void>>()
const backgroundJobCompletions = new Set<Promise<string>>()
let lifecycleGeneration = 0
let recentClearGeneration = 0
let deferredLifecycleCleanupErrors: string[] = []
let isShuttingDown = false

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

function claimJobAction(jobId: string): (() => void) | null {
  if (isShuttingDown || actionPendingJobIds.has(jobId)) return null
  actionPendingJobIds.add(jobId)
  let resolve!: () => void
  const completion = new Promise<void>((done) => {
    resolve = done
  })
  actionCompletionByJobId.set(jobId, completion)
  return () => {
    actionPendingJobIds.delete(jobId)
    actionCompletionByJobId.delete(jobId)
    resolve()
  }
}

/** 插件 load/register 时重新开放任务入口；失败清理债务仍保留在 state 供用户处理。 */
export function beginQuickBackgroundJobsSession(): void {
  isShuttingDown = false
  deferredLifecycleCleanupErrors = []
}

function jobToStartOptions(job: QuickBackgroundJob): StartBackgroundQuickInsertOptions {
  return {
    pluginName: job.pluginName,
    sourceBlockId: job.sourceBlockId,
    selectedText: job.selectedText,
    blockText: job.blockText,
    promptLabel: job.promptLabel,
    promptText: job.promptText,
    includeBlockContext: job.includeBlockContext,
    model: job.model
  }
}

function archiveJobResult(job: QuickBackgroundJob): void {
  const text = job.resultText.trim()
  if (!text) return
  const recent: QuickRecentResult = {
    id: `qi-recent-${Date.now()}-${job.id}`,
    pluginName: job.pluginName,
    sourceBlockId: job.sourceBlockId,
    selectedText: job.selectedText,
    blockText: job.blockText,
    promptLabel: job.promptLabel,
    promptText: job.promptText,
    includeBlockContext: job.includeBlockContext,
    model: job.model,
    resultText: text,
    createdAt: job.createdAt,
    archivedAt: Date.now()
  }
  aiQuickJobsState.recent = [
    recent,
    ...(aiQuickJobsState.recent as QuickRecentResult[]).filter(
      (item) => item.id !== recent.id
    )
  ].slice(0, MAX_RECENT_RESULTS)
}

export function hasActiveQuickBackgroundJobs(): boolean {
  return (aiQuickJobsState.jobs as QuickBackgroundJob[]).some(
    (j: QuickBackgroundJob) =>
      j.status === "generating" || j.status === "ready"
  )
}

/**
 * 启动后台任务：静默请求 AI，成功后直接插入为目标块子块。
 * 任务面板负责提供持续、可重试的状态反馈。
 */
async function startBackgroundQuickInsertJobImpl(
  opts: StartBackgroundQuickInsertOptions
): Promise<string> {
  if (isShuttingDown) {
    throw new Error("Quick AI 正在关闭，无法启动新任务")
  }
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
  const startLifecycle = lifecycleGeneration
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
    errorStage: null,
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
      current.errorStage = "generate"
      current.resultText = ""
      return id
    }

    // 模型调用已经付费完成；即使后续写入失败/取消，也允许会话内恢复正文。
    current.resultText = result.text

    const insert = await insertQuickResultAsChild(
      opts.sourceBlockId,
      result.text,
      opts.promptLabel,
      opts.selectedText
    )

    const afterInsert = findJob(id)
    if (!afterInsert || controller.signal.aborted) {
      // 请求结束后、块写入期间用户可能取消或离开面板。此时任务记录已被移除，
      // 必须补偿删除刚写入的预览，避免出现无主 AI 块。
      if (insert.success) {
        const cleanup = await dismissQuickResult(insert.blockId)
        if (!cleanup.success) {
          const message = `取消后的预览清理失败：${cleanup.error}`
          console.error(
            "[AI QuickInteract] 取消后的预览补偿清理失败:",
            cleanup.error
          )
          orca.notify("error", `已取消，但${message}`, {
            title
          })
          // 非卸载场景保留一个可操作任务，避免遗留块无人管理。
          if (startLifecycle === lifecycleGeneration && findJob(id) == null) {
            job.status = "ready"
            job.resultRootBlockId = insert.blockId
            job.errorMessage = message
            job.errorStage = null
            aiQuickJobsState.jobs = [...aiQuickJobsState.jobs, job]
          } else if (startLifecycle !== lifecycleGeneration) {
            deferredLifecycleCleanupErrors.push(message)
          }
        }
      }
      return id
    }

    if (!insert.success) {
      afterInsert.status = "error"
      afterInsert.errorMessage = insert.error
      afterInsert.errorStage = "insert"
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
    afterInsert.errorStage = null
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
    current.errorStage = "generate"
    console.error("[AI QuickInteract] 后台任务失败:", error)
    orca.notify("error", message, { title })
    return id
  } finally {
    abortByJobId.delete(id)
  }
}

export function startBackgroundQuickInsertJob(
  opts: StartBackgroundQuickInsertOptions
): Promise<string> {
  const completion = startBackgroundQuickInsertJobImpl(opts)
  backgroundJobCompletions.add(completion)
  void completion.then(
    () => backgroundJobCompletions.delete(completion),
    () => backgroundJobCompletions.delete(completion)
  )
  return completion
}

/** 失败任务重新执行；旧错误卡会被新任务替换。 */
export async function retryBackgroundQuickJob(
  jobId: string
): Promise<string | null> {
  const job = findJob(jobId)
  if (isShuttingDown || !job || job.status !== "error") return null
  if (job.errorStage === "insert" && job.resultText.trim()) {
    const release = claimJobAction(jobId)
    if (!release) return null
    const retryLifecycle = lifecycleGeneration
    try {
      job.status = "generating"
      job.errorMessage = null
      job.errorStage = null
      const insert = await insertQuickResultAsChild(
        job.sourceBlockId,
        job.resultText,
        job.promptLabel,
        job.selectedText
      )
      const current = findJob(jobId)
      if (!current) {
        if (insert.success) {
          const cleanup = await dismissQuickResult(insert.blockId)
          if (!cleanup.success) {
            const message = `重试取消后的预览清理失败：${cleanup.error}`
            console.error(`[AI QuickInteract] ${message}`)
            if (retryLifecycle === lifecycleGeneration) {
              job.status = "ready"
              job.resultRootBlockId = insert.blockId
              job.errorMessage = message
              job.errorStage = null
              aiQuickJobsState.jobs = [...aiQuickJobsState.jobs, job]
            } else {
              deferredLifecycleCleanupErrors.push(message)
            }
          }
        }
        return jobId
      }
      if (!insert.success) {
        current.status = "error"
        current.errorMessage = insert.error
        current.errorStage = "insert"
        return jobId
      }
      if (!isJobPanelViewStillActive(current)) {
        current.status = "ready"
        current.resultRootBlockId = insert.blockId
        const cleanup = await dismissQuickResult(insert.blockId)
        if (cleanup.success) {
          archiveJobResult(current)
          removeJob(jobId)
        } else {
          current.errorMessage = `离开页面后的预览清理失败：${cleanup.error}`
          orca.notify("error", current.errorMessage, {
            title: "AI 快捷交互"
          })
        }
        return jobId
      }
      current.status = "ready"
      current.resultRootBlockId = insert.blockId
      current.errorMessage = null
      current.errorStage = null
      return jobId
    } finally {
      release()
    }
  }
  const opts = jobToStartOptions(job)
  removeJob(jobId)
  return startBackgroundQuickInsertJob(opts)
}

/** 保留当前 ready 预览，同时再开一个独立候选供比较。 */
export async function regenerateBackgroundQuickJob(
  jobId: string
): Promise<string | null> {
  const job = findJob(jobId)
  if (
    isShuttingDown ||
    !job ||
    job.status !== "ready" ||
    regeneratingJobIds.has(jobId)
  ) {
    return null
  }
  regeneratingJobIds.add(jobId)
  try {
    return await startBackgroundQuickInsertJob(jobToStartOptions(job))
  } finally {
    regeneratingJobIds.delete(jobId)
  }
}

/** 用现有自定义提示词弹窗继续追问当前结果。 */
export async function followUpBackgroundQuickJob(jobId: string): Promise<void> {
  if (isShuttingDown) return
  const job = findJob(jobId)
  if (!job || job.status !== "ready" || !job.resultText.trim()) return

  const { isAIDialogBusyOrInReview } = await import("./aiDialogState")
  if (isAIDialogBusyOrInReview()) {
    orca.notify("warn", "请先关闭 AI 生成闪卡窗口", {
      title: "AI 快捷交互"
    })
    return
  }
  const { isAIQuickInteractOpen, openAIQuickInteract } = await import(
    "./aiQuickInteractState"
  )
  if (isAIQuickInteractOpen()) {
    orca.notify("warn", "请先关闭当前 AI 快捷交互窗口", {
      title: "AI 快捷交互"
    })
    return
  }
  const [{ isAIPromptManagerOpen }, { isAIServiceSettingsOpen }] =
    await Promise.all([
      import("./aiPromptManagerState"),
      import("./aiServiceSettingsState")
    ])
  if (isAIPromptManagerOpen() || isAIServiceSettingsOpen()) {
    orca.notify("warn", "请先关闭 AI 设置或提示词库窗口", {
      title: "AI 快捷交互"
    })
    return
  }

  openAIQuickInteract({
    pluginName: job.pluginName,
    blockId: job.sourceBlockId,
    selectedText: job.resultText,
    blockText: `原始块：\n${job.blockText}\n\n上一轮 AI 结果：\n${job.resultText}`,
    promptLabel: `追问 · ${job.promptLabel}`,
    promptText: "",
    includeBlockContext: true,
    model: job.model,
    mode: "custom"
  })
}

/** 取消进行中的生成；ready/error 请用 dismiss/acknowledge */
export function cancelBackgroundQuickJob(
  jobId: string,
  opts?: { silent?: boolean }
): void {
  const job = findJob(jobId)
  if (!job) return
  if (job.status !== "generating") return
  if (job.resultText.trim()) archiveJobResult(job)
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
  const release = claimJobAction(jobId)
  if (!release) return
  try {
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
  } finally {
    release()
  }
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
  const release = claimJobAction(jobId)
  if (!release) return

  try {
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
  } finally {
    release()
  }
}

/** 把临时子块移动为查询块之后的同级块，并结束预览态。 */
export async function moveBackgroundQuickJobAfter(jobId: string): Promise<void> {
  const job = findJob(jobId)
  if (
    !job ||
    job.status !== "ready" ||
    job.resultRootBlockId == null
  ) return
  const release = claimJobAction(jobId)
  if (!release) return

  try {
    const moved = await moveQuickResultAfter(
      job.sourceBlockId,
      job.resultRootBlockId
    )
    if (!moved.success) {
      orca.notify("error", moved.error, { title: "AI 快捷交互" })
      return
    }
    const kept = await keepQuickResult(job.resultRootBlockId)
    if (!kept.success) {
      orca.notify("warn", `内容已移动，状态标记失败：${kept.error}`, {
        title: "AI 快捷交互"
      })
    }
    removeJob(jobId)
    orca.notify("success", "已移动为当前块之后的同级块", {
      title: "AI 快捷交互"
    })
  } finally {
    release()
  }
}

/**
 * 关闭结果：删除已插入的结果树，并移除任务卡片。
 * 若尚未插入（error 且无块），仅移除卡片。
 */
export async function dismissBackgroundQuickJob(
  jobId: string,
  opts?: { archive?: boolean; silentCancel?: boolean }
): Promise<void> {
  const job = findJob(jobId)
  if (!job) return

  if (job.status === "generating") {
    cancelBackgroundQuickJob(jobId, { silent: opts?.silentCancel })
    return
  }
  const release = claimJobAction(jobId)
  if (!release) return

  try {
    if (job.resultRootBlockId != null) {
      const result = await dismissQuickResult(job.resultRootBlockId)
      if (!result.success) {
        orca.notify("error", result.error, { title: "AI 快捷交互" })
        return
      }
    }

    if (opts?.archive !== false && job.status === "ready") {
      archiveJobResult(job)
    }
    removeJob(jobId)
  } finally {
    release()
  }
}

/** 把最近删除的预览重新插回原查询块，并直接沉淀为普通保留结果。 */
async function restoreRecentQuickResultClaimed(recentId: string): Promise<void> {
  const recent = (aiQuickJobsState.recent as QuickRecentResult[]).find(
    (item) => item.id === recentId
  )
  if (!recent) return
  const restoreLifecycle = lifecycleGeneration
  const restoreClearGeneration = recentClearGeneration
  // 先从列表取走，防止用户双击“恢复”造成重复写入；失败再放回。
  forgetRecentQuickResult(recentId)

  const inserted = await insertQuickResultAsChild(
    recent.sourceBlockId,
    recent.resultText,
    recent.promptLabel,
    recent.selectedText
  )
  if (restoreLifecycle !== lifecycleGeneration) {
    if (inserted.success) {
      const cleanup = await dismissQuickResult(inserted.blockId)
      if (!cleanup.success) {
        const message = `卸载时清理迟到恢复块失败：${cleanup.error}`
        deferredLifecycleCleanupErrors.push(message)
        console.error(`[AI QuickInteract] ${message}`)
      }
    }
    return
  }
  if (!inserted.success) {
    if (restoreClearGeneration === recentClearGeneration) {
      aiQuickJobsState.recent = [
        recent,
        ...(aiQuickJobsState.recent as QuickRecentResult[])
      ].slice(0, MAX_RECENT_RESULTS)
    }
    orca.notify("error", inserted.error, { title: "恢复 Quick AI 结果" })
    return
  }

  const kept = await keepQuickResult(inserted.blockId)
  if (!kept.success) {
    const panel = captureActivePanelViewSnapshot()
    const recoveryJob: QuickBackgroundJob = {
      id: nextJobId(),
      pluginName: recent.pluginName,
      sourceBlockId: recent.sourceBlockId,
      selectedText: recent.selectedText,
      blockText: recent.blockText,
      promptLabel: recent.promptLabel,
      promptText: recent.promptText,
      includeBlockContext: recent.includeBlockContext,
      model: recent.model,
      status: "ready",
      resultText: recent.resultText,
      errorMessage: `恢复后的状态标记失败：${kept.error}`,
      errorStage: null,
      resultRootBlockId: inserted.blockId,
      createdAt: recent.createdAt,
      panelId: panel.panelId,
      panelViewKey: panel.panelViewKey
    }
    aiQuickJobsState.jobs = [...aiQuickJobsState.jobs, recoveryJob]
    orca.notify("warn", `内容已恢复为临时预览，状态标记失败：${kept.error}`, {
      title: "恢复 Quick AI 结果"
    })
  } else {
    orca.notify("success", "已恢复为原块的子块", {
      title: "Quick AI"
    })
  }
}

export async function restoreRecentQuickResult(recentId: string): Promise<void> {
  if (isShuttingDown) return
  const release = claimJobAction(`recent:${recentId}`)
  if (!release) return
  try {
    await restoreRecentQuickResultClaimed(recentId)
  } finally {
    release()
  }
}

export function forgetRecentQuickResult(recentId: string): void {
  aiQuickJobsState.recent = (
    aiQuickJobsState.recent as QuickRecentResult[]
  ).filter((item) => item.id !== recentId)
}

export function clearRecentQuickResults(): void {
  recentClearGeneration += 1
  aiQuickJobsState.recent = []
}

/** 错误卡片：仅移除，不删块（通常尚未插入） */
export function acknowledgeBackgroundQuickJobError(jobId: string): void {
  const job = findJob(jobId)
  if (!job || job.status !== "error") return
  if (job.resultText.trim()) archiveJobResult(job)
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
    await dismissBackgroundQuickJob(job.id, { silentCancel: true })
  }
}

/**
 * 插件卸载 / 全局清理：中止请求；未「保留」的 ready 预览默认删除（不保存）。
 */
export async function cancelAllBackgroundQuickJobs(): Promise<void> {
  isShuttingDown = true
  lifecycleGeneration += 1
  recentClearGeneration += 1
  deferredLifecycleCleanupErrors = []
  regeneratingJobIds.clear()
  for (const [id, controller] of abortByJobId) {
    controller.abort()
    abortByJobId.delete(id)
  }
  await Promise.allSettled(Array.from(backgroundJobCompletions))
  // 等待已经取得 claim 的保留/删除/移动完成，避免卸载清理与用户动作互删。
  await Promise.allSettled(Array.from(actionCompletionByJobId.values()))
  const snapshot = [
    ...(aiQuickJobsState.jobs as QuickBackgroundJob[])
  ]
  aiQuickJobsState.recent = []
  const cleanupFailed: QuickBackgroundJob[] = []
  for (const job of snapshot) {
    if (job.status === "ready" && job.resultRootBlockId != null) {
      try {
        const result = await dismissQuickResult(job.resultRootBlockId)
        if (!result.success) {
          console.error(
            "[AI QuickInteract] 卸载时删除预览块失败:",
            result.error
          )
          // 删除失败时优先保全用户内容并解除 preview；这样 UI 注销后也不会留下孤儿预览。
          const kept = await keepQuickResult(job.resultRootBlockId)
          if (!kept.success) {
            console.error(
              "[AI QuickInteract] 卸载时删除和保留预览均失败:",
              kept.error
            )
            cleanupFailed.push(job)
          } else {
            console.warn(
              "[AI QuickInteract] 卸载时无法删除预览，已降级保留为普通笔记:",
              job.resultRootBlockId
            )
          }
        }
      } catch (error) {
        console.error("[AI QuickInteract] 卸载时删除预览块异常:", error)
        try {
          const kept = await keepQuickResult(job.resultRootBlockId)
          if (!kept.success) cleanupFailed.push(job)
        } catch (keepError) {
          console.error("[AI QuickInteract] 卸载时保留预览也异常:", keepError)
          cleanupFailed.push(job)
        }
      }
    }
  }
  aiQuickJobsState.jobs = cleanupFailed
  if (cleanupFailed.length > 0 || deferredLifecycleCleanupErrors.length > 0) {
    throw new Error(
      `卸载时有 ${cleanupFailed.length + deferredLifecycleCleanupErrors.length} 个 Quick AI 预览未能删除`
    )
  }
}
