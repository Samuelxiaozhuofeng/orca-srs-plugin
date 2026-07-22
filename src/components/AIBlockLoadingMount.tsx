/**
 * AI 后台生成：目标块行尾微轻加载图标、内联块“罩层”与预览操作栏。
 * 预览子块支持无写入的多选暂存，用户点「保留所选」后才批量提交。
 */

import {
  aiQuickJobsState,
  dismissBackgroundQuickJob,
  dismissJobsLeftBehindOnPanelLeave,
  keepBackgroundQuickJob,
  keepSelectedBackgroundQuickJob,
  toggleBackgroundQuickJobBlockSelection,
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
      el.classList.remove(
        CHILD_KEEP_CLASS,
        "srs-ai-result-child--selected",
        "srs-ai-result-child--covered"
      )
      el.removeAttribute("data-srs-ai-result-child")
      el.removeAttribute("data-srs-ai-result-selected")
      el.removeAttribute("data-srs-ai-result-covered")
      if (el.style.position === "relative") {
        el.style.position = ""
      }
    })
}

function clearResultChrome(blockEl: HTMLElement): void {
  clearChildKeepChrome(blockEl)
  blockEl.classList.remove(RESULT_BLOCK_CLASS)
  blockEl.removeAttribute("data-srs-ai-result")
  blockEl.removeAttribute("data-srs-ai-has-selection")
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

/** 在预览根下每个子孙块挂候选选择按钮（不含根本身）。 */
function mountChildSelectionActions(
  rootEl: HTMLElement,
  jobId: string,
  rootBlockId: number,
  selectedBlockIds: readonly number[]
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

  const selected = new Set(selectedBlockIds)

  for (const childEl of descendants) {
    const childId = Number(childEl.getAttribute("data-id"))
    if (!Number.isFinite(childId)) continue

    let ancestor = childEl.parentElement?.closest<HTMLElement>(
      `.orca-block[data-id]`
    )
    let covered = false
    while (ancestor && ancestor !== rootEl) {
      const ancestorId = Number(ancestor.getAttribute("data-id"))
      if (selected.has(ancestorId)) {
        covered = true
        break
      }
      ancestor = ancestor.parentElement?.closest<HTMLElement>(
        `.orca-block[data-id]`
      )
    }
    const explicitlySelected = selected.has(childId)

    childEl.classList.add(CHILD_KEEP_CLASS)
    childEl.classList.toggle("srs-ai-result-child--selected", explicitlySelected)
    childEl.classList.toggle("srs-ai-result-child--covered", covered)
    childEl.setAttribute("data-srs-ai-result-child", "true")
    childEl.toggleAttribute("data-srs-ai-result-selected", explicitlySelected)
    childEl.toggleAttribute("data-srs-ai-result-covered", covered)
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
      actionBar.setAttribute("role", "group")
      childEl.appendChild(actionBar)
    }

    actionBar.setAttribute("data-select-block-id", String(childId))
    actionBar.setAttribute("aria-label", covered ? "已随上级选择" : "选择此项")
    actionBar.replaceChildren()

    const selectBtn = document.createElement("button")
    selectBtn.type = "button"
    selectBtn.className = "srs-ai-action-btn srs-ai-action-btn--keep-child"
    selectBtn.disabled = covered
    selectBtn.setAttribute("aria-pressed", explicitlySelected ? "true" : "false")
    if (covered) {
      selectBtn.title = "该项已包含在所选上级中"
      selectBtn.innerHTML = '<i class="ti ti-check"></i>随上级选择'
    } else if (explicitlySelected) {
      selectBtn.title = "点击取消选择"
      selectBtn.innerHTML = '<i class="ti ti-check"></i>已选择'
    } else {
      selectBtn.title = "选择此项及其下级；稍后统一保留"
      selectBtn.innerHTML = '<i class="ti ti-plus"></i>选择'
    }
    selectBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      void toggleBackgroundQuickJobBlockSelection(jobId, childId)
    }
    actionBar.appendChild(selectBtn)
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

    // 挂载罩层 class 与预览操作栏 [ 保留所选 ] [ 保留全部 ] [ 取消 ]
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
      rootEl.toggleAttribute(
        "data-srs-ai-has-selection",
        job.selectedResultBlockIds.length > 0
      )

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
        actionBar = document.createElement("span")
        actionBar.className = PREVIEW_ACTIONS_CLASS
        actionBar.setAttribute("data-job-id", job.id)
        actionBar.setAttribute("role", "group")
        actionBar.setAttribute("aria-label", "AI 预览操作")
        // 直接挂到结果根块：absolute 相对 aiblock 末端定位
        rootEl.appendChild(actionBar)
      }

      actionBar.replaceChildren()
      const selectedCount = job.selectedResultBlockIds.length
      if (selectedCount > 0) {
        const count = document.createElement("span")
        count.className = "srs-ai-preview-actions__count"
        count.textContent = `已选 ${selectedCount} 项`
        actionBar.appendChild(count)

        const keepSelectedBtn = document.createElement("button")
        keepSelectedBtn.type = "button"
        keepSelectedBtn.className =
          "srs-ai-action-btn srs-ai-action-btn--keep-selected"
        keepSelectedBtn.title = "保留已选择的内容，丢弃其余预览"
        keepSelectedBtn.innerHTML = '<i class="ti ti-checks"></i>保留所选'
        keepSelectedBtn.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          void keepSelectedBackgroundQuickJob(job.id)
        }
        actionBar.appendChild(keepSelectedBtn)
      }

      const keepAllBtn = document.createElement("button")
      keepAllBtn.type = "button"
      keepAllBtn.className = "srs-ai-action-btn srs-ai-action-btn--keep"
      keepAllBtn.title = "保留完整 AI 结果"
      keepAllBtn.innerHTML = '<i class="ti ti-check"></i>保留全部'
      keepAllBtn.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        void keepBackgroundQuickJob(job.id)
      }

      const cancelBtn = document.createElement("button")
      cancelBtn.type = "button"
      cancelBtn.className = "srs-ai-action-btn srs-ai-action-btn--cancel"
      cancelBtn.title = "取消并删除此 AI 预览块"
      cancelBtn.innerHTML = '<i class="ti ti-x"></i>取消'
      cancelBtn.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        void dismissBackgroundQuickJob(job.id)
      }

      actionBar.appendChild(keepAllBtn)
      actionBar.appendChild(cancelBtn)

      // 为标题行预留右侧空间，避免正文与按钮重叠
      const shell = findRootBlockShell(rootEl)
      const main = findRootMain(rootEl)
      if (main) {
        main.classList.add("srs-ai-result-main")
      }
      if (shell !== rootEl) {
        shell.classList.add("srs-ai-result-shell")
      }

      // 子块候选选择：不含根；选择父块即包含整棵子树
      mountChildSelectionActions(
        rootEl,
        job.id,
        rootId,
        job.selectedResultBlockIds
      )
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

      const observer = new MutationObserver((records) => {
        const onlyOwnChromeChanged = records.every((record) =>
          (record.target as Element).closest?.(
            `.${CHILD_ACTIONS_CLASS}, .${PREVIEW_ACTIONS_CLASS}`
          )
        )
        if (onlyOwnChromeChanged) return
        const currentJob = (aiQuickJobsState.jobs as QuickBackgroundJob[]).find(
          (candidate) => candidate.id === job.id
        )
        if (!currentJob) return
        mountChildSelectionActions(
          rootEl,
          job.id,
          rootId,
          currentJob.selectedResultBlockIds
        )
      })
      observer.observe(rootEl, { childList: true, subtree: true })
      observers.push(observer)
      // 立即补一次（与 jobs effect 竞态时）
      mountChildSelectionActions(
        rootEl,
        job.id,
        rootId,
        job.selectedResultBlockIds
      )
    }

    return () => {
      for (const o of observers) o.disconnect()
    }
  }, [jobs])

  return null
}
