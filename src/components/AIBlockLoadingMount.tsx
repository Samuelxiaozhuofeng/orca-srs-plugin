/**
 * AI 后台生成：目标块行尾微轻加载图标、内联块“罩层”与“预览/保留/取消”操作栏
 * 预览子块悬停显示「保留此块」（仅保留该子树，去掉 AI 外壳）。
 */

import {
  aiQuickJobsState,
  dismissBackgroundQuickJob,
  dismissJobsLeftBehindOnPanelLeave,
  keepBackgroundQuickJob,
  keepSingleBlockBackgroundQuickJob,
  type QuickBackgroundJob
} from "../srs/ai/aiQuickInteractJobs"

const { Valtio, React } = window
const { useSnapshot } = Valtio
const { useEffect, useRef } = React

const LOADING_CLASS = "srs-ai-target-block-loading"
const RESULT_BLOCK_CLASS = "srs-ai-result-block"
const PREVIEW_ACTIONS_CLASS = "srs-ai-preview-actions"
const CHILD_KEEP_CLASS = "srs-ai-result-child"
const CHILD_ACTIONS_CLASS = "srs-ai-result-child-actions"

/**
 * 定位当前块自身的标题行宿主（不误入子块）。
 * Orca 结构通常为：.orca-block > .orca-repr > .orca-repr-main > .orca-repr-main-content
 */
function findRootBlockShell(blockEl: HTMLElement): HTMLElement {
  return (
    blockEl.querySelector<HTMLElement>(":scope > .orca-repr") ??
    blockEl
  )
}

function findRootMain(blockEl: HTMLElement): HTMLElement | null {
  return (
    blockEl.querySelector<HTMLElement>(
      ":scope > .orca-repr > .orca-repr-main"
    ) ??
    blockEl.querySelector<HTMLElement>(":scope > .orca-repr-main")
  )
}

function findRootTextHost(blockEl: HTMLElement): HTMLElement {
  const main = findRootMain(blockEl)
  if (!main) return blockEl

  // 行尾图标优先贴在可编辑正文容器内（inline）
  const content =
    main.querySelector<HTMLElement>(":scope > .orca-repr-main-content") ??
    main.querySelector<HTMLElement>(".orca-repr-main-content")
  return content ?? main
}

function clearChildKeepChrome(rootEl: HTMLElement): void {
  rootEl
    .querySelectorAll<HTMLElement>(`.${CHILD_ACTIONS_CLASS}`)
    .forEach((el) => el.remove())
  rootEl
    .querySelectorAll<HTMLElement>(`.${CHILD_KEEP_CLASS}`)
    .forEach((el) => {
      el.classList.remove(CHILD_KEEP_CLASS)
      el.removeAttribute("data-srs-ai-result-child")
      if (el.style.position === "relative") {
        el.style.position = ""
      }
    })
}

function clearResultChrome(blockEl: HTMLElement): void {
  clearChildKeepChrome(blockEl)
  blockEl.classList.remove(RESULT_BLOCK_CLASS)
  blockEl.removeAttribute("data-srs-ai-result")
  if (blockEl.style.position === "relative") {
    blockEl.style.position = ""
  }
  blockEl
    .querySelectorAll<HTMLElement>(`.${PREVIEW_ACTIONS_CLASS}`)
    .forEach((el) => el.remove())
  blockEl
    .querySelectorAll<HTMLElement>(".srs-ai-result-main, .srs-ai-result-shell")
    .forEach((el) => {
      el.classList.remove("srs-ai-result-main", "srs-ai-result-shell")
    })
}

/**
 * 在预览根下每个子孙块挂「保留此块」按钮（不含根本身）。
 */
function mountChildKeepActions(
  rootEl: HTMLElement,
  jobId: string,
  rootBlockId: number
): void {
  const descendants = Array.from(
    rootEl.querySelectorAll<HTMLElement>(".orca-block[data-id]")
  ).filter((el) => {
    if (el === rootEl) return false
    const id = Number(el.getAttribute("data-id"))
    return Number.isFinite(id) && id !== rootBlockId
  })

  // 先清掉已不在树上的旧按钮
  rootEl
    .querySelectorAll<HTMLElement>(`.${CHILD_ACTIONS_CLASS}[data-job-id="${jobId}"]`)
    .forEach((bar) => {
      const host = bar.closest<HTMLElement>(".orca-block[data-id]")
      if (!host || !descendants.includes(host)) {
        bar.remove()
        if (host) {
          host.classList.remove(CHILD_KEEP_CLASS)
          host.removeAttribute("data-srs-ai-result-child")
        }
      }
    })

  for (const childEl of descendants) {
    const childId = Number(childEl.getAttribute("data-id"))
    if (!Number.isFinite(childId)) continue

    childEl.classList.add(CHILD_KEEP_CLASS)
    childEl.setAttribute("data-srs-ai-result-child", "true")
    if (getComputedStyle(childEl).position === "static") {
      childEl.style.position = "relative"
    }

    let actionBar = childEl.querySelector<HTMLElement>(
      `:scope > .${CHILD_ACTIONS_CLASS}[data-job-id="${jobId}"]`
    )
    if (!actionBar) {
      const misplaced = childEl.querySelector<HTMLElement>(
        `.${CHILD_ACTIONS_CLASS}[data-job-id="${jobId}"]`
      )
      misplaced?.remove()

      actionBar = document.createElement("span")
      actionBar.className = CHILD_ACTIONS_CLASS
      actionBar.setAttribute("data-job-id", jobId)
      actionBar.setAttribute("data-keep-block-id", String(childId))
      actionBar.setAttribute("role", "group")
      actionBar.setAttribute("aria-label", "仅保留此块")

      const keepBtn = document.createElement("button")
      keepBtn.type = "button"
      keepBtn.className = "srs-ai-action-btn srs-ai-action-btn--keep-child"
      keepBtn.title = "仅保留此块（含下级），去掉 AI 外壳与其它内容"
      keepBtn.setAttribute("aria-label", "仅保留此块及其下级")
      keepBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>保留此块'
      keepBtn.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        void keepSingleBlockBackgroundQuickJob(jobId, childId)
      }

      actionBar.appendChild(keepBtn)
      childEl.appendChild(actionBar)
    }
  }
}

export function AIBlockLoadingMount() {
  const snap = useSnapshot(aiQuickJobsState)
  const jobs = snap.jobs as readonly QuickBackgroundJob[]
  const panelLeaveInflightRef = useRef(false)

  // 离开所属面板视图：未点保留/取消的预览默认取消（不保存）
  useEffect(() => {
    let disposed = false

    const runCheck = () => {
      if (disposed || panelLeaveInflightRef.current) return
      const hasTracked = (aiQuickJobsState.jobs as QuickBackgroundJob[]).some(
        (j) => j.panelId && j.panelViewKey
      )
      if (!hasTracked) return

      panelLeaveInflightRef.current = true
      void dismissJobsLeftBehindOnPanelLeave()
        .catch((error) => {
          console.error("[AI QuickInteract] 面板离开默认取消失败:", error)
        })
        .finally(() => {
          panelLeaveInflightRef.current = false
        })
    }

    let unsub: (() => void) | undefined
    try {
      if (typeof Valtio?.subscribe === "function" && orca?.state) {
        unsub = Valtio.subscribe(orca.state, runCheck)
      }
    } catch (error) {
      console.warn("[AI QuickInteract] 订阅面板状态失败:", error)
    }

    // 兜底：焦点/可见性变化时再检查一次（导航未必总能触发 subscribe）
    const onVisibility = () => {
      if (document.visibilityState === "hidden") runCheck()
    }
    window.addEventListener("pagehide", runCheck)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      disposed = true
      unsub?.()
      window.removeEventListener("pagehide", runCheck)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  useEffect(() => {
    // 1. 统计处于 generating 状态的目标块及任务数量
    const activeBlockCounts = new Map<number, number>()
    for (const job of jobs) {
      if (job.status === "generating" && job.sourceBlockId) {
        const current = activeBlockCounts.get(job.sourceBlockId) ?? 0
        activeBlockCounts.set(job.sourceBlockId, current + 1)
      }
    }

    // 2. 清理不再处于 generating 状态的旧加载图标
    const existingIcons = Array.from(
      document.querySelectorAll<HTMLElement>(`.${LOADING_CLASS}`)
    )
    for (const iconEl of existingIcons) {
      const rawId = iconEl.getAttribute("data-target-block")
      const blockId = rawId ? Number(rawId) : null
      if (blockId == null || !activeBlockCounts.has(blockId)) {
        iconEl.remove()
      }
    }

    // 3. 给正在生成的 target block DOM 插入/更新行尾微轻加载图标
    for (const [sourceBlockId, count] of activeBlockCounts.entries()) {
      const blockEl = document.querySelector<HTMLElement>(
        `.orca-block[data-id="${sourceBlockId}"]`
      )
      if (!blockEl) continue

      const host = findRootTextHost(blockEl)
      let iconEl = blockEl.querySelector<HTMLElement>(
        `.${LOADING_CLASS}[data-target-block="${sourceBlockId}"]`
      )
      // 若图标挂在了错误宿主，重挂到行尾正文
      if (iconEl && iconEl.parentElement !== host) {
        iconEl.remove()
        iconEl = null
      }
      if (!iconEl) {
        iconEl = document.createElement("span")
        iconEl.className = LOADING_CLASS
        iconEl.setAttribute("data-target-block", String(sourceBlockId))

        const i = document.createElement("i")
        i.className = "ti ti-sparkles srs-ai-spin"
        i.setAttribute("aria-hidden", "true")
        iconEl.appendChild(i)

        host.appendChild(iconEl)
      }

      iconEl.title =
        count > 1 ? `AI 处理中 (${count} 项)…` : "AI 处理中…"
    }

    // 4. 为已生成的 AI 结果根块挂载“罩层”样式与“预览/保留/取消”操作栏
    const activePreviewJobs = jobs.filter(
      (j) => j.status === "ready" && j.resultRootBlockId != null
    )
    const activePreviewRootIds = new Set(
      activePreviewJobs.map((j) => j.resultRootBlockId!)
    )

    // 清理已不在 ready 列表里的旧操作栏 / 罩层
    const existingActionBars = Array.from(
      document.querySelectorAll<HTMLElement>(`.${PREVIEW_ACTIONS_CLASS}`)
    )
    for (const bar of existingActionBars) {
      const rawJobId = bar.getAttribute("data-job-id")
      const matchesActive = activePreviewJobs.some((j) => j.id === rawJobId)
      if (!matchesActive) {
        const hostBlock = bar.closest<HTMLElement>(".orca-block[data-id]")
        bar.remove()
        if (
          hostBlock &&
          !activePreviewRootIds.has(Number(hostBlock.getAttribute("data-id")))
        ) {
          clearResultChrome(hostBlock)
        }
      }
    }

    // 清掉残留罩层 class（操作栏已不在、或任务已结束）
    document
      .querySelectorAll<HTMLElement>(
        `.${RESULT_BLOCK_CLASS}, .orca-block[data-srs-ai-result="true"]`
      )
      .forEach((el) => {
        const id = Number(el.getAttribute("data-id"))
        if (!activePreviewRootIds.has(id)) {
          clearResultChrome(el)
        }
      })

    // 挂载罩层 class 与预览操作栏 [ 保留 ] [ 取消 ]
    // 操作栏挂在结果根 .orca-block 上，绝对定位到首行右侧末端（不塞进 contenteditable）
    for (const job of activePreviewJobs) {
      const rootId = job.resultRootBlockId
      if (rootId == null) continue

      const rootEl = document.querySelector<HTMLElement>(
        `.orca-block[data-id="${rootId}"]`
      )
      if (!rootEl) continue

      rootEl.classList.add(RESULT_BLOCK_CLASS)
      rootEl.setAttribute("data-srs-ai-result", "true")

      // 确保定位上下文在块自身（避免挂到 repr-main 后参与文档流错位）
      if (getComputedStyle(rootEl).position === "static") {
        rootEl.style.position = "relative"
      }

      let actionBar = rootEl.querySelector<HTMLElement>(
        `:scope > .${PREVIEW_ACTIONS_CLASS}[data-job-id="${job.id}"]`
      )

      // 若旧实现把操作栏塞进了 main/content，迁移到根块
      if (!actionBar) {
        const misplaced = rootEl.querySelector<HTMLElement>(
          `.${PREVIEW_ACTIONS_CLASS}[data-job-id="${job.id}"]`
        )
        if (misplaced) {
          misplaced.remove()
        }
      }

      if (!actionBar) {
        actionBar = document.createElement("div")
        actionBar.className = PREVIEW_ACTIONS_CLASS
        actionBar.setAttribute("data-job-id", job.id)
        actionBar.setAttribute("role", "group")
        actionBar.setAttribute("aria-label", "AI 预览操作")

        const notice = document.createElement("span")
        notice.className = "srs-ai-preview-notice"
        notice.textContent = "临时预览 · 离开后删除"
        notice.title = "离开当前页面会删除；删除后可在本次会话的 Quick AI 最近结果中恢复"

        const keepBtn = document.createElement("button")
        keepBtn.type = "button"
        keepBtn.className = "srs-ai-action-btn srs-ai-action-btn--keep"
        keepBtn.title = "保留并沉淀为笔记子块"
        keepBtn.setAttribute("aria-label", "保留全部 AI 预览内容")
        keepBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>保留'
        keepBtn.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          void keepBackgroundQuickJob(job.id)
        }

        const cancelBtn = document.createElement("button")
        cancelBtn.type = "button"
        cancelBtn.className = "srs-ai-action-btn srs-ai-action-btn--cancel"
        cancelBtn.title = "取消并删除此 AI 预览块"
        cancelBtn.setAttribute("aria-label", "取消并删除 AI 预览")
        cancelBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>取消'
        cancelBtn.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          void dismissBackgroundQuickJob(job.id)
        }

        actionBar.appendChild(notice)
        actionBar.appendChild(keepBtn)
        actionBar.appendChild(cancelBtn)

        // 直接挂到结果根块：absolute 相对 aiblock 末端定位
        rootEl.appendChild(actionBar)
      }

      // 为标题行预留右侧空间，避免正文与按钮重叠
      const shell = findRootBlockShell(rootEl)
      const main = findRootMain(rootEl)
      if (main) {
        main.classList.add("srs-ai-result-main")
      }
      if (shell !== rootEl) {
        shell.classList.add("srs-ai-result-shell")
      }

      // 子块「保留此块」：不含根；含整棵子树
      mountChildKeepActions(rootEl, job.id, rootId)
    }
  }, [jobs])

  // 预览树子块可能晚于根块进入 DOM（宿主异步渲染）：监听 ready 根节点变更并补挂按钮
  useEffect(() => {
    const readyJobs = jobs.filter(
      (j) => j.status === "ready" && j.resultRootBlockId != null
    )
    if (readyJobs.length === 0) return

    const observers: MutationObserver[] = []
    for (const job of readyJobs) {
      const rootId = job.resultRootBlockId
      if (rootId == null) continue
      const rootEl = document.querySelector<HTMLElement>(
        `.orca-block[data-id="${rootId}"]`
      )
      if (!rootEl || typeof MutationObserver === "undefined") continue

      const observer = new MutationObserver(() => {
        mountChildKeepActions(rootEl, job.id, rootId)
      })
      observer.observe(rootEl, { childList: true, subtree: true })
      observers.push(observer)
      // 立即补一次（与 jobs effect 竞态时）
      mountChildKeepActions(rootEl, job.id, rootId)
    }

    return () => {
      for (const o of observers) o.disconnect()
    }
  }, [jobs])

  return null
}
