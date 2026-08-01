/**
 * In-process coordination for chapter quiz:
 * - shared generation (AbortController + generation id)
 * - live UI state broadcast between block/panel controllers
 * - panel navigation events when viewArgs.quizBlockId changes
 *
 * Pure enough for unit tests; no Orca I/O here.
 */

import type { ChapterQuizCardAdds, ChapterQuizRepr } from "./chapterQuiz"

/** Local parse to avoid runtime cycle with chapterQuiz.ts */
function parsePositiveBlockId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw)
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim())
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

// ── Shared generation ──────────────────────────────────────

export type SharedGenerationEntry = {
  generationId: number
  controller: AbortController
  promise: Promise<void>
  cancelled: boolean
}

export type GenerationRegistry = {
  entries: Map<number, SharedGenerationEntry>
  nextId: number
}

export function createGenerationRegistry(): GenerationRegistry {
  return { entries: new Map(), nextId: 1 }
}

/** Process-wide default registry (controllers share this). */
export const defaultGenerationRegistry: GenerationRegistry =
  createGenerationRegistry()

export function getSharedGeneration(
  reg: GenerationRegistry,
  blockId: number
): SharedGenerationEntry | undefined {
  return reg.entries.get(blockId)
}

/**
 * Whether a generation handle is still the active, non-cancelled run.
 * Late AI results must check this before writing success/error over cancel.
 */
export function isGenerationCurrent(
  reg: GenerationRegistry,
  blockId: number,
  generationId: number
): boolean {
  const entry = reg.entries.get(blockId)
  if (!entry) return false
  if (entry.generationId !== generationId) return false
  if (entry.cancelled) return false
  if (entry.controller.signal.aborted) return false
  return true
}

/**
 * Start (or return existing) shared generation for a quiz block.
 * `work` receives signal + isCurrent; must not write success after !isCurrent().
 */
export function startSharedGeneration(
  reg: GenerationRegistry,
  blockId: number,
  work: (ctx: {
    signal: AbortSignal
    generationId: number
    isCurrent: () => boolean
  }) => Promise<void>
): SharedGenerationEntry {
  const existing = reg.entries.get(blockId)
  if (existing && !existing.cancelled) {
    return existing
  }

  const generationId = reg.nextId++
  const controller = new AbortController()
  const entry: SharedGenerationEntry = {
    generationId,
    controller,
    promise: Promise.resolve(),
    cancelled: false
  }

  reg.entries.set(blockId, entry)
  entry.promise = (async () => {
    try {
      await work({
        signal: controller.signal,
        generationId,
        isCurrent: () => isGenerationCurrent(reg, blockId, generationId)
      })
    } finally {
      const cur = reg.entries.get(blockId)
      if (cur && cur.generationId === generationId) {
        reg.entries.delete(blockId)
      }
    }
  })()
  return entry
}

/**
 * Cancel shared generation for blockId. Returns true if a live entry was aborted.
 * Does not require the calling React instance to own the AbortController.
 */
export function cancelSharedGeneration(
  reg: GenerationRegistry,
  blockId: number
): boolean {
  const entry = reg.entries.get(blockId)
  if (!entry) return false
  entry.cancelled = true
  try {
    entry.controller.abort()
  } catch (error) {
    console.warn("[章末小测] 取消共享生成失败:", error)
  }
  return true
}

// ── Live UI sync (same process, same blockId) ──────────────

export type LiveSyncListener = {
  instanceId: symbol
  onUpdate: (repr: ChapterQuizRepr) => void
}

export type LiveSyncRegistry = {
  byBlock: Map<number, Set<LiveSyncListener>>
}

export function createLiveSyncRegistry(): LiveSyncRegistry {
  return { byBlock: new Map() }
}

export const defaultLiveSyncRegistry: LiveSyncRegistry =
  createLiveSyncRegistry()

export function subscribeQuizLive(
  reg: LiveSyncRegistry,
  blockId: number,
  instanceId: symbol,
  onUpdate: (repr: ChapterQuizRepr) => void
): () => void {
  let set = reg.byBlock.get(blockId)
  if (!set) {
    set = new Set()
    reg.byBlock.set(blockId, set)
  }
  const listener: LiveSyncListener = { instanceId, onUpdate }
  set.add(listener)
  return () => {
    const cur = reg.byBlock.get(blockId)
    if (!cur) return
    cur.delete(listener)
    if (cur.size === 0) reg.byBlock.delete(blockId)
  }
}

/**
 * Broadcast next repr to other mounted controllers for the same blockId.
 * Skips the publisher (`exceptInstanceId`) to avoid echo loops.
 */
export function publishQuizLive(
  reg: LiveSyncRegistry,
  blockId: number,
  repr: ChapterQuizRepr,
  exceptInstanceId: symbol
): void {
  const set = reg.byBlock.get(blockId)
  if (!set) return
  for (const listener of set) {
    if (listener.instanceId === exceptInstanceId) continue
    try {
      listener.onUpdate(repr)
    } catch (error) {
      console.error("[章末小测] live sync 订阅方更新失败:", error)
    }
  }
}

// ── Panel navigation (reuse right panel, new quizBlockId) ──

export const CHAPTER_QUIZ_PANEL_NAV_EVENT = "orca-srs:chapter-quiz-panel-nav"

export type ChapterQuizPanelNavDetail = {
  panelId: string
  quizBlockId: number
}

export function createChapterQuizPanelNavDetail(
  panelId: string,
  quizBlockId: number
): ChapterQuizPanelNavDetail {
  return { panelId, quizBlockId }
}

/** Whether a panel instance should apply this nav event. */
export function shouldApplyChapterQuizPanelNav(
  listenerPanelId: string,
  detail: ChapterQuizPanelNavDetail | null | undefined
): boolean {
  if (!detail || typeof detail.panelId !== "string") return false
  return detail.panelId === listenerPanelId
}

/**
 * Resolve quizBlockId from nav detail (or null if illegal).
 * Pure seam for panel local-state updates.
 */
export function resolveQuizBlockIdFromPanelNav(
  detail: ChapterQuizPanelNavDetail | null | undefined
): number | null {
  if (!detail) return null
  return parsePositiveBlockId(detail.quizBlockId)
}

export function dispatchChapterQuizPanelNav(
  detail: ChapterQuizPanelNavDetail
): void {
  try {
    window.dispatchEvent(
      new CustomEvent(CHAPTER_QUIZ_PANEL_NAV_EVENT, { detail })
    )
  } catch (error) {
    console.error("[章末小测] 派发 panel nav 事件失败:", error)
  }
}

// ── Card adds merge (explicit question id) ─────────────────

export function mergeQuestionCardAdds(
  existing: Record<string, ChapterQuizCardAdds> | undefined,
  questionId: string,
  patch: ChapterQuizCardAdds
): Record<string, ChapterQuizCardAdds> {
  return {
    ...(existing ?? {}),
    [questionId]: {
      ...(existing?.[questionId] ?? {}),
      ...patch
    }
  }
}

// ── Panel register/unregister contract ─────────────────────

export type PanelRegistryApi = {
  registerPanel: (type: string, renderer: unknown) => void
  unregisterPanel: (type: string) => void
}

/**
 * Symmetric panel registration helpers (testable without full plugin load).
 */
export function bindChapterQuizPanelRegistration(
  panels: PanelRegistryApi,
  viewType: string,
  renderer: unknown
): { register: () => void; unregister: () => void } {
  return {
    register: () => {
      panels.registerPanel(viewType, renderer)
    },
    unregister: () => {
      panels.unregisterPanel(viewType)
    }
  }
}
