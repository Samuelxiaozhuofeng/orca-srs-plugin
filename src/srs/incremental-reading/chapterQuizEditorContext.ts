/**
 * Custom Panel 制卡所需的编辑器焦点上下文。
 *
 * 真机证据：activePanel 落在 `srs.chapter-quiz-panel` 时，
 * `core.editor.insertBlock` 返回 undefined 且不写入；
 * 短暂 switchFocusTo 同布局左侧可写 ViewPanel 后写入成功。
 *
 * 不做导航/滚动，只切换焦点；不重跑 task；不用 invokeGroup。
 */

import { CHAPTER_QUIZ_PANEL_VIEW } from "./chapterQuiz"

/** 面板树节点（兼容 Row/Column/ViewPanel 与测试 stub） */
export type ChapterQuizPanelTreeNode = {
  id?: string
  view?: string
  viewArgs?: Record<string, unknown>
  direction?: "row" | "column" | string
  children?: ChapterQuizPanelTreeNode[]
}

/** 新建面板的视图源（orca.nav.addTo 的 src 参数） */
export type ChapterQuizPanelAddSrc = {
  view: string
  viewArgs?: Record<string, unknown>
  viewState?: Record<string, unknown>
}

/** 找不到同布局可写 ViewPanel 时，自动在旁边打开一个普通 ViewPanel */
export type ChapterQuizOpenPanelOptions = ChapterQuizPanelAddSrc & {
  /** 相对答题 Custom Panel 的方向；默认 "left" */
  dir?: "top" | "bottom" | "left" | "right"
}

export type ChapterQuizEditorContextDeps = {
  getPanelsRoot?: () => ChapterQuizPanelTreeNode | null | undefined
  getActivePanel?: () => string | null | undefined
  switchFocusTo?: (panelId: string) => void
  /** 可注入：测试避免真实 sleep */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** 等待 activePanel 到位的超时（ms） */
  timeoutMs?: number
  pollIntervalMs?: number
  /** activePanel 到位后留给宿主编辑器服务完成切换的稳定窗口 */
  settleMs?: number
  /**
   * 布局里只剩 Custom Panel（找不到可写 ViewPanel）时，
   * 在 customPanel 旁边自动打开一个普通 ViewPanel（如 block 视图，
   * viewArgs.blockId = 当前题 sourceBlockId）作为写入宿主。
   * 不提供则沿用原「无法定位可写编辑面板」报错。
   */
  openPanel?: ChapterQuizOpenPanelOptions
  /** 可注入：新建面板；默认 orca.nav.addTo */
  addToPanel?: (
    id: string,
    dir: "top" | "bottom" | "left" | "right",
    src: ChapterQuizPanelAddSrc
  ) => string | null
}

const DEFAULT_TIMEOUT_MS = 2000
const DEFAULT_POLL_MS = 16
const DEFAULT_SETTLE_MS = 150

type LocateHit = {
  node: ChapterQuizPanelTreeNode
  parent: ChapterQuizPanelTreeNode | null
  index: number
}

function isViewPanelNode(node: ChapterQuizPanelTreeNode): boolean {
  return typeof node.view === "string" && node.view.length > 0
}

function hasChildren(node: ChapterQuizPanelTreeNode): boolean {
  return Array.isArray(node.children) && node.children.length > 0
}

/**
 * 子树中按文档顺序收集 ViewPanel；嵌套容器递归展开。
 * 容器节点即使带 view 也只扫 children。
 */
export function collectViewPanelsInOrder(
  node: ChapterQuizPanelTreeNode | null | undefined
): ChapterQuizPanelTreeNode[] {
  if (!node) return []
  if (hasChildren(node)) {
    const out: ChapterQuizPanelTreeNode[] = []
    for (const child of node.children!) {
      out.push(...collectViewPanelsInOrder(child))
    }
    return out
  }
  if (isViewPanelNode(node)) return [node]
  return []
}

function isWritableHostView(view: string | undefined): boolean {
  if (!view) return false
  // 禁止把答题 Custom Panel 自己当编辑宿主
  return view !== CHAPTER_QUIZ_PANEL_VIEW
}

/**
 * 子树中「最靠后」的可写 ViewPanel（对左侧 sibling 而言即最靠近 Custom Panel 一侧）。
 */
function lastWritableViewPanelIdInSubtree(
  node: ChapterQuizPanelTreeNode,
  rejectPanelId: string
): string | null {
  const panels = collectViewPanelsInOrder(node)
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i]
    if (!p.id || p.id === rejectPanelId) continue
    if (!isWritableHostView(p.view)) continue
    return p.id
  }
  return null
}

function locatePanelById(
  root: ChapterQuizPanelTreeNode,
  panelId: string
): LocateHit | null {
  function walk(
    node: ChapterQuizPanelTreeNode,
    parent: ChapterQuizPanelTreeNode | null,
    index: number
  ): LocateHit | null {
    if (node.id === panelId) return { node, parent, index }
    const children = node.children ?? []
    for (let i = 0; i < children.length; i++) {
      const hit = walk(children[i], node, i)
      if (hit) return hit
    }
    return null
  }
  return walk(root, null, -1)
}

function locatePanelByRef(
  root: ChapterQuizPanelTreeNode,
  target: ChapterQuizPanelTreeNode
): LocateHit | null {
  function walk(
    node: ChapterQuizPanelTreeNode,
    parent: ChapterQuizPanelTreeNode | null,
    index: number
  ): LocateHit | null {
    if (node === target) return { node, parent, index }
    const children = node.children ?? []
    for (let i = 0; i < children.length; i++) {
      const hit = walk(children[i], node, i)
      if (hit) return hit
    }
    return null
  }
  return walk(root, null, -1)
}

/**
 * 从 Custom Panel 解析同布局中的左侧/前面可写 ViewPanel。
 * - 走 `orca.state.panels` 树，不依赖 flat-map
 * - 支持嵌套 Row/Column
 * - 优先 Custom Panel 之前最近的可写 ViewPanel
 * - 拒绝 `srs.chapter-quiz-panel` 自身
 */
export function resolveChapterQuizEditorHostPanelId(
  customPanelId: string,
  root: ChapterQuizPanelTreeNode | null | undefined
): string | null {
  if (!customPanelId || !root) return null

  let hit = locatePanelById(root, customPanelId)
  if (!hit) return null

  while (hit.parent) {
    const siblings = hit.parent.children ?? []
    for (let i = hit.index - 1; i >= 0; i--) {
      const hostId = lastWritableViewPanelIdInSubtree(
        siblings[i],
        customPanelId
      )
      if (hostId) return hostId
    }
    // 向上：在祖父层继续找「当前容器」之前的 sibling
    const parentHit = locatePanelByRef(root, hit.parent)
    if (!parentHit || !parentHit.parent) break
    hit = parentHit
  }

  return null
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * 有界等待 activePanel 变为 expectedId；超时抛错（task 不得执行）。
 */
export async function waitForActivePanelId(
  expectedId: string,
  deps: Pick<
    ChapterQuizEditorContextDeps,
    "getActivePanel" | "sleep" | "now" | "timeoutMs" | "pollIntervalMs"
  > = {}
): Promise<void> {
  const getActive =
    deps.getActivePanel ?? (() => orca.state?.activePanel as string | undefined)
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? (() => Date.now())
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS

  if (getActive() === expectedId) return

  const deadline = now() + timeoutMs
  while (now() < deadline) {
    await sleep(pollIntervalMs)
    if (getActive() === expectedId) return
  }

  const actual = getActive()
  throw new Error(
    `切换编辑焦点超时（目标面板 ${expectedId}，当前 ${actual ?? "无"}），无法写入卡片`
  )
}

function defaultGetPanelsRoot(): ChapterQuizPanelTreeNode | null {
  return (orca.state?.panels as ChapterQuizPanelTreeNode | undefined) ?? null
}

/**
 * 有界等待新面板出现在面板树中（addTo 后宿主异步挂载）。
 * 超时抛错（task 不得执行）。
 */
export async function waitForPanelInTree(
  panelId: string,
  getRoot: () => ChapterQuizPanelTreeNode | null | undefined,
  deps: Pick<
    ChapterQuizEditorContextDeps,
    "sleep" | "now" | "timeoutMs" | "pollIntervalMs"
  > = {}
): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? (() => Date.now())
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS

  if (locatePanelById(getRoot() ?? ({} as ChapterQuizPanelTreeNode), panelId)) {
    return
  }

  const deadline = now() + timeoutMs
  while (now() < deadline) {
    await sleep(pollIntervalMs)
    if (
      locatePanelById(getRoot() ?? ({} as ChapterQuizPanelTreeNode), panelId)
    ) {
      return
    }
  }

  throw new Error(
    `等待自动打开的原文面板超时（${panelId}），卡片写入中止`
  )
}

function defaultAddToPanel(
  id: string,
  dir: "top" | "bottom" | "left" | "right",
  src: ChapterQuizPanelAddSrc
): string | null {
  // orca.nav.addTo 的 src 要求 viewArgs/viewState 为必选字段；
  // 构造时用空对象兜底，运行时宿主同样接受省略。
  const target = {
    view: src.view,
    viewArgs: src.viewArgs ?? {},
    viewState: src.viewState ?? {}
  }
  return orca.nav.addTo(id, dir, target) as string | null
}

/**
 * 找不到同布局可写 ViewPanel 时，用 openPanel 在 Custom Panel 旁边
 * 自动打开一个普通 ViewPanel（如 block 视图 → 当前题 sourceBlockId），
 * 等待其挂载后作为写入宿主。失败路径全部显式抛错。
 */
async function resolveAutoOpenHostPanelId(
  customPanelId: string,
  getRoot: () => ChapterQuizPanelTreeNode | null | undefined,
  deps: ChapterQuizEditorContextDeps,
  open: ChapterQuizOpenPanelOptions
): Promise<string> {
  const addToPanel = deps.addToPanel ?? defaultAddToPanel
  const dir = open.dir ?? "left"
  const src: ChapterQuizPanelAddSrc = {
    view: open.view,
    ...(open.viewArgs ? { viewArgs: open.viewArgs } : {}),
    ...(open.viewState ? { viewState: open.viewState } : {})
  }

  let newPanelId: string | null = null
  try {
    newPanelId = addToPanel(customPanelId, dir, src)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`创建可写编辑面板失败（${open.view}）：${message}`)
  }
  if (!newPanelId) {
    throw new Error(
      "无法创建可写编辑面板（在答题侧栏旁打开原文视图失败），卡片写入中止"
    )
  }

  await waitForPanelInTree(newPanelId, getRoot, {
    sleep: deps.sleep,
    now: deps.now,
    timeoutMs: deps.timeoutMs,
    pollIntervalMs: deps.pollIntervalMs
  })

  return newPanelId
}

/**
 * 在可写编辑器焦点上下文中执行 task（写卡 + persist cardAdds 等）。
 * - 无 customPanelId：直接执行（块侧/非 Panel 路径）
 * - 已在 host 上：不切换
 * - 否则 switchFocusTo(host) → 等待到位 → 执行一次 task → finally 恢复原焦点
 * - 找不到 host 且提供 openPanel：自动在旁边打开普通 ViewPanel（如 block 视图）再写入
 * - 找不到 host 且未提供 openPanel / 打开失败 / 切换超时：不执行 task，抛可见错误
 * - 恢复失败：console.error，不覆盖 task 错误
 * - 绝不重跑 task
 */
export async function runWithChapterQuizEditorContext<T>(
  customPanelId: string | null | undefined,
  task: () => Promise<T>,
  deps: ChapterQuizEditorContextDeps = {}
): Promise<T> {
  if (!customPanelId) {
    return await task()
  }

  const getActive =
    deps.getActivePanel ?? (() => orca.state?.activePanel as string | undefined)
  const getRoot = deps.getPanelsRoot ?? defaultGetPanelsRoot
  const switchFocus =
    deps.switchFocusTo ??
    ((id: string) => {
      orca.nav.switchFocusTo(id)
    })

  // 捕获切换前的原焦点必须在 addTo 之前：
  // 宿主可能在打开新面板后自动激活它，晚捕获会丢失「恢复右侧」的目标。
  const original = getActive() ?? null

  let hostId = resolveChapterQuizEditorHostPanelId(customPanelId, getRoot())
  if (!hostId) {
    if (!deps.openPanel) {
      throw new Error(
        "无法定位可写编辑面板（与答题侧栏同布局的左侧 ViewPanel），卡片写入中止"
      )
    }
    hostId = await resolveAutoOpenHostPanelId(
      customPanelId,
      getRoot,
      deps,
      deps.openPanel
    )
  }

  if (original === hostId) {
    return await task()
  }

  let didSwitch = false
  try {
    try {
      switchFocus(hostId)
      didSwitch = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`切换到可写编辑面板失败（${hostId}）：${message}`)
    }

    await waitForActivePanelId(hostId, {
      getActivePanel: getActive,
      sleep: deps.sleep,
      now: deps.now,
      timeoutMs: deps.timeoutMs,
      pollIntervalMs: deps.pollIntervalMs
    })

    // 真机诊断中 switchFocusTo 后等待 150ms 才能可靠调用 insertBlock。
    // activePanel 先变化不代表对应编辑器命令上下文已经完成挂载。
    const sleep = deps.sleep ?? defaultSleep
    const settleMs = deps.settleMs ?? DEFAULT_SETTLE_MS
    if (settleMs > 0) {
      await sleep(settleMs)
      if (getActive() !== hostId) {
        throw new Error(
          `编辑器焦点在写入前发生变化（目标面板 ${hostId}，当前 ${getActive() ?? "无"}），卡片写入中止`
        )
      }
    }

    return await task()
  } finally {
    // 只要发起过切焦点，就必须尝试恢复（不因 getActive 误读而跳过）
    if (didSwitch && original) {
      try {
        switchFocus(original)
      } catch (restoreError) {
        console.error(
          `[章末小测] 恢复答题面板焦点失败（原 ${original}）:`,
          restoreError
        )
      }
    }
  }
}
