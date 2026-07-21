/**
 * AI 后台生成：目标块行尾微轻加载图标、内联块“罩层”与“预览/保留/取消”操作栏
 */

import {
  aiQuickJobsState,
  dismissBackgroundQuickJob,
  keepBackgroundQuickJob,
  type QuickBackgroundJob
} from "../srs/ai/aiQuickInteractJobs"

const { Valtio, React } = window
const { useSnapshot } = Valtio
const { useEffect } = React

const LOADING_CLASS = "srs-ai-target-block-loading"
const RESULT_BLOCK_CLASS = "srs-ai-result-block"
const PREVIEW_ACTIONS_CLASS = "srs-ai-preview-actions"

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

function clearResultChrome(blockEl: HTMLElement): void {
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

export function AIBlockLoadingMount() {
  const snap = useSnapshot(aiQuickJobsState)
  const jobs = snap.jobs as readonly QuickBackgroundJob[]

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
        actionBar = document.createElement("span")
        actionBar.className = PREVIEW_ACTIONS_CLASS
        actionBar.setAttribute("data-job-id", job.id)
        actionBar.setAttribute("role", "group")
        actionBar.setAttribute("aria-label", "AI 预览操作")

        const keepBtn = document.createElement("button")
        keepBtn.type = "button"
        keepBtn.className = "srs-ai-action-btn srs-ai-action-btn--keep"
        keepBtn.title = "保留并沉淀为笔记子块"
        keepBtn.innerHTML = '<i class="ti ti-check"></i>保留'
        keepBtn.onclick = (e) => {
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
    }
  }, [jobs])

  return null
}
