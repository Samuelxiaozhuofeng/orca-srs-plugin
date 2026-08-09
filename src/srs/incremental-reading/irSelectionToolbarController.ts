/**
 * IR 原生选区工具栏紧凑控制器。
 *
 * 宿主 `orca.toolbar` 无可见性/排序 API；通过：
 * 1) 选区 → 最近 `.ir-reading` 且合法 `data-ir-card-type` 判定作用域
 * 2) `html.ir-stb-scope` + `data-ir-stb-card` + `data-ir-stb-current-body`
 * 3) 注入由设置生成的 CSS（插件动作靠唯一 marker class）
 *
 * 无合法卡型（如 mixed-review）fail-closed：不加 scope。
 * 未知按钮无规则 → 默认可见。卸载或离开 IR 选区时对称清理。
 */

import {
  buildIRSelectionToolbarHideCss,
  getIRSelectionToolbarSettings,
  type IRCardToolbarContext
} from "../settings/irSelectionToolbarSettings"

export const IR_STB_SCOPE_CLASS = "ir-stb-scope"
export const IR_STB_DISMISSING_CLASS = "ir-stb-dismissing"
export const IR_STB_CARD_ATTR = "data-ir-stb-card"
export const IR_STB_CURRENT_BODY_ATTR = "data-ir-stb-current-body"
export const IR_STB_STYLE_ELEMENT_ID = "orca-srs-ir-selection-toolbar-css"

const ORCA_TOOLBAR_POPUP_SELECTOR = ".orca-popup.orca-editor-toolbar"
const DISMISS_FALLBACK_MS = 1_500

export type IRSelectionToolbarScope = {
  inIRScope: boolean
  cardType: IRCardToolbarContext | null
  /** 选区 anchor+focus 均在当前卡正文树内 */
  inCurrentCardBody: boolean
  irRoot: Element | null
}

const NO_SCOPE: IRSelectionToolbarScope = {
  inIRScope: false,
  cardType: null,
  inCurrentCardBody: false,
  irRoot: null
}

type ControllerState = {
  pluginName: string
  started: boolean
  styleEl: HTMLStyleElement | null
  onSelectionChange: (() => void) | null
  onFocusIn: (() => void) | null
  onPointerDown: ((event: Event) => void) | null
  onPointerUp: (() => void) | null
  pointerStartedInsideToolbar: boolean
  pointerResetTimer: number
  dismissTimer: number
  raf: number
}

const state: ControllerState = {
  pluginName: "",
  started: false,
  styleEl: null,
  onSelectionChange: null,
  onFocusIn: null,
  onPointerDown: null,
  onPointerUp: null,
  pointerStartedInsideToolbar: false,
  pointerResetTimer: 0,
  dismissTimer: 0,
  raf: 0
}

function nodeToElement(node: Node | null | undefined): Element | null {
  if (!node) return null
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element
  return node.parentElement
}

function readCardType(irRoot: Element): IRCardToolbarContext | null {
  const raw = irRoot.getAttribute("data-ir-card-type")
  if (raw === "topic" || raw === "extract") return raw
  return null
}

/**
 * 选区节点是否落在「当前卡正文」：
 * 最近 `.ir-reading__body` 的 `data-ir-body-block` 等于根 `data-ir-card-id`。
 * 嵌套子块允许；近上下文 / 章节浏览祖先正文不匹配。
 */
export function isSelectionNodeInCurrentCardBody(
  irRoot: Element,
  node: Node | null | undefined
): boolean {
  const cardId = irRoot.getAttribute("data-ir-card-id")
  if (cardId == null || cardId === "") return false

  const el = nodeToElement(node)
  if (!el || !irRoot.contains(el)) return false

  const body = el.closest(".ir-reading__body")
  if (!body || !irRoot.contains(body)) return false

  return body.getAttribute("data-ir-body-block") === cardId
}

/**
 * 从当前 DOM Selection 解析 IR 作用域。
 * - 折叠 / 无 range / `.ir-reading` 外 → 无作用域
 * - 无合法 `data-ir-card-type`（mixed-review 等）→ fail-closed 无作用域
 * - 多面板：focus 必须同属该 irRoot
 */
export function resolveIRSelectionToolbarScope(
  selection: Selection | null
): IRSelectionToolbarScope {
  if (!selection || selection.rangeCount === 0) return { ...NO_SCOPE }
  if (selection.isCollapsed) return { ...NO_SCOPE }

  const anchorEl = nodeToElement(selection.anchorNode)
  if (!anchorEl) return { ...NO_SCOPE }

  const irRoot = anchorEl.closest(".ir-reading")
  if (!irRoot) return { ...NO_SCOPE }

  const focusEl = nodeToElement(selection.focusNode)
  if (focusEl && !irRoot.contains(focusEl)) return { ...NO_SCOPE }

  const cardType = readCardType(irRoot)
  // fail-closed：无 Topic/Extract 卡型标记则不启用紧凑工具栏（含 mixed-review）
  if (!cardType) return { ...NO_SCOPE }

  const inCurrentCardBody =
    isSelectionNodeInCurrentCardBody(irRoot, selection.anchorNode) &&
    isSelectionNodeInCurrentCardBody(irRoot, selection.focusNode)

  return {
    inIRScope: true,
    cardType,
    inCurrentCardBody,
    irRoot
  }
}

function ensureStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(IR_STB_STYLE_ELEMENT_ID)
  if (existing instanceof HTMLStyleElement) {
    state.styleEl = existing
    return existing
  }
  const el = document.createElement("style")
  el.id = IR_STB_STYLE_ELEMENT_ID
  el.setAttribute("data-orca-srs", "ir-selection-toolbar")
  document.head.appendChild(el)
  state.styleEl = el
  return el
}

function removeStyleElement(): void {
  const el =
    state.styleEl ?? document.getElementById(IR_STB_STYLE_ELEMENT_ID)
  if (el?.parentNode) {
    el.parentNode.removeChild(el)
  }
  state.styleEl = null
}

function clearScopeOnHtml(): void {
  const root = document.documentElement
  root.classList.remove(IR_STB_SCOPE_CLASS)
  root.removeAttribute(IR_STB_CARD_ATTR)
  root.removeAttribute(IR_STB_CURRENT_BODY_ATTR)
}

function clearDismissingState(): void {
  if (state.dismissTimer) {
    window.clearTimeout(state.dismissTimer)
    state.dismissTimer = 0
  }
  document.documentElement.classList.remove(IR_STB_DISMISSING_CLASS)
}

function beginDismissingToolbar(): void {
  const root = document.documentElement
  if (!root.classList.contains(IR_STB_SCOPE_CLASS)) return
  if (!document.querySelector(ORCA_TOOLBAR_POPUP_SELECTOR)) return

  root.classList.add(IR_STB_DISMISSING_CLASS)
  if (state.dismissTimer) window.clearTimeout(state.dismissTimer)
  state.dismissTimer = window.setTimeout(() => {
    state.dismissTimer = 0
    root.classList.remove(IR_STB_DISMISSING_CLASS)
  }, DISMISS_FALLBACK_MS)
}

function syncDismissingStateFromSelection(): void {
  let selection: Selection | null = null
  try {
    selection = window.getSelection()
  } catch (error) {
    console.warn("[渐进阅读] 读取选区失败（关闭选区工具栏）:", error)
    return
  }

  if (selection && !selection.isCollapsed) {
    clearDismissingState()
    return
  }
  if (!state.pointerStartedInsideToolbar) {
    beginDismissingToolbar()
  }
}

function applyScopeOnHtml(
  cardType: IRCardToolbarContext,
  inCurrentCardBody: boolean
): void {
  const root = document.documentElement
  root.classList.add(IR_STB_SCOPE_CLASS)
  root.setAttribute(IR_STB_CARD_ATTR, cardType)
  root.setAttribute(IR_STB_CURRENT_BODY_ATTR, inCurrentCardBody ? "1" : "0")
}

export function refreshIRSelectionToolbarCss(pluginName?: string): void {
  const name = pluginName || state.pluginName
  if (!name || !state.started) return
  const settings = getIRSelectionToolbarSettings(name)
  const css = buildIRSelectionToolbarHideCss(settings)
  const el = ensureStyleElement()
  el.textContent = css
}

function syncScopeFromSelection(): void {
  if (!state.started) return
  let selection: Selection | null = null
  try {
    selection = window.getSelection()
  } catch (error) {
    console.warn("[渐进阅读] 读取选区失败（选区工具栏）:", error)
    clearScopeOnHtml()
    return
  }

  const scope = resolveIRSelectionToolbarScope(selection)
  if (!scope.inIRScope || !scope.cardType) {
    clearScopeOnHtml()
    return
  }
  applyScopeOnHtml(scope.cardType, scope.inCurrentCardBody)
}

function scheduleSync(): void {
  if (!state.started) return
  if (state.raf) return
  state.raf = window.requestAnimationFrame(() => {
    state.raf = 0
    syncScopeFromSelection()
  })
}

/**
 * 启动控制器：注入 CSS、监听 selectionchange / focusin。
 * 可重复调用（同 plugin 幂等；换 pluginName 会先 stop 再 start）。
 */
export function startIRSelectionToolbarController(pluginName: string): void {
  if (!pluginName) {
    console.error("[渐进阅读] startIRSelectionToolbarController: pluginName 为空")
    return
  }
  if (state.started && state.pluginName === pluginName) {
    refreshIRSelectionToolbarCss(pluginName)
    scheduleSync()
    return
  }
  if (state.started) {
    stopIRSelectionToolbarController()
  }

  state.pluginName = pluginName
  state.started = true

  refreshIRSelectionToolbarCss(pluginName)

  const onSelectionChange = () => {
    syncDismissingStateFromSelection()
    scheduleSync()
  }
  const onFocusIn = () => scheduleSync()
  const onPointerDown = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null
    state.pointerStartedInsideToolbar = Boolean(
      target?.closest(ORCA_TOOLBAR_POPUP_SELECTOR)
    )
    if (!state.pointerStartedInsideToolbar) {
      beginDismissingToolbar()
    }
  }
  const onPointerUp = () => {
    if (state.pointerResetTimer) window.clearTimeout(state.pointerResetTimer)
    state.pointerResetTimer = window.setTimeout(() => {
      state.pointerResetTimer = 0
      state.pointerStartedInsideToolbar = false
    }, 0)
  }
  state.onSelectionChange = onSelectionChange
  state.onFocusIn = onFocusIn
  state.onPointerDown = onPointerDown
  state.onPointerUp = onPointerUp

  document.addEventListener("selectionchange", onSelectionChange)
  document.addEventListener("focusin", onFocusIn)
  document.addEventListener("pointerdown", onPointerDown, true)
  document.addEventListener("pointerup", onPointerUp, true)

  scheduleSync()
}

/** 对称清理：监听器、rAF、style、html class。 */
export function stopIRSelectionToolbarController(): void {
  if (state.raf) {
    window.cancelAnimationFrame(state.raf)
    state.raf = 0
  }
  if (state.onSelectionChange) {
    document.removeEventListener("selectionchange", state.onSelectionChange)
    state.onSelectionChange = null
  }
  if (state.onFocusIn) {
    document.removeEventListener("focusin", state.onFocusIn)
    state.onFocusIn = null
  }
  if (state.onPointerDown) {
    document.removeEventListener("pointerdown", state.onPointerDown, true)
    state.onPointerDown = null
  }
  if (state.onPointerUp) {
    document.removeEventListener("pointerup", state.onPointerUp, true)
    state.onPointerUp = null
  }
  if (state.pointerResetTimer) {
    window.clearTimeout(state.pointerResetTimer)
    state.pointerResetTimer = 0
  }
  state.pointerStartedInsideToolbar = false
  clearDismissingState()
  clearScopeOnHtml()
  removeStyleElement()
  state.started = false
  state.pluginName = ""
}

/**
 * 保存设置后立即刷新 CSS 规则并重同步作用域。
 * 失败向上抛出，由调用方可见提示（不得静默当「已立即生效」）。
 */
export function notifyIRSelectionToolbarSettingsChanged(
  pluginName: string
): void {
  if (!state.started) {
    // 控制器尚未 start：缓存已由 save 更新；start 时会读缓存生成 CSS
    return
  }
  if (state.pluginName && state.pluginName !== pluginName) {
    console.warn(
      `[渐进阅读] 选区工具栏设置变更 plugin 不一致: active=${state.pluginName}, event=${pluginName}`
    )
  }
  refreshIRSelectionToolbarCss(pluginName)
  scheduleSync()
}

/** 测试/诊断用 */
export function isIRSelectionToolbarControllerStarted(): boolean {
  return state.started
}

export function getIRSelectionToolbarControllerPluginName(): string {
  return state.pluginName
}
