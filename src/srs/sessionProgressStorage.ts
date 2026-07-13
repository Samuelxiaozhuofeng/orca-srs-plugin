/**
 * 会话进度 sessionStorage 隔离（FC-09）
 *
 * 第一阶段产品规则：不支持断点恢复。
 * - 每次真正启动新会话都从零开始
 * - sessionStorage 仅用于当前挂载会话的 scoped 自动保存 / 诊断
 * - 新会话初始化时清理同 scope 旧值
 * - 完成 / 放弃 / 卸载清理已登记 key
 *
 * 纯数据模块：可注入 StorageLike，便于单测。
 */

import type { DbId } from "../orca.d.ts"
import type { SessionProgressState, GradeDistribution } from "./sessionProgressTracker"
import {
  CURRENT_VERSION,
  createInitialProgressState
} from "./sessionProgressTracker"

// ============================================
// Constants
// ============================================

/** 存储键版本前缀（与旧固定键 srs-session-progress 隔离） */
export const SESSION_PROGRESS_KEY_PREFIX = "srs-session-progress:v2:"

// ============================================
// Scope model
// ============================================

/**
 * 会话进度 scope（稳定、可编码为 storage key）
 *
 * - normal/all：普通全部复习
 * - normal/deck：指定牌组
 * - fixed/difficult：困难卡（Home 用 sourceBlockId=0 + children 时识别）
 * - fixed/source：其他专项 / 重复复习
 */
export type SessionProgressScope =
  | { readonly kind: "normal"; readonly mode: "all" }
  | { readonly kind: "normal"; readonly mode: "deck"; readonly deckName: string }
  | { readonly kind: "fixed"; readonly mode: "difficult" }
  | {
      readonly kind: "fixed"
      readonly mode: "source"
      readonly sourceType: string
      readonly sourceBlockId: string
    }

/** 传给 Demo 的进度存储描述（Renderer 冻结，Demo 不得重读全局 filter） */
export type SessionProgressDescriptor = {
  readonly scope: SessionProgressScope
  readonly storageKey: string
}

// ============================================
// StorageLike
// ============================================

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// ============================================
// Key encoding
// ============================================

/**
 * 安全编码 scope 片段，避免冒号 / 斜杠等与路径分隔冲突。
 */
export function encodeProgressScopeSegment(value: string): string {
  return encodeURIComponent(String(value))
}

/**
 * 从 deck filter 构建 normal scope。
 * null/undefined/空 → all；否则 deck。
 */
export function createProgressScopeFromDeckFilter(
  deckFilter: string | null | undefined
): SessionProgressScope {
  if (deckFilter == null || deckFilter === "") {
    return Object.freeze({ kind: "normal" as const, mode: "all" as const })
  }
  return Object.freeze({
    kind: "normal" as const,
    mode: "deck" as const,
    deckName: String(deckFilter)
  })
}

/**
 * 从重复 / 专项会话元数据构建 fixed scope。
 * 困难卡：sourceType=children 且 sourceBlockId 为 0（与 Home 约定一致）。
 */
export function createProgressScopeFromFixedSource(
  sourceType: string,
  sourceBlockId: DbId | string | number
): SessionProgressScope {
  const idStr = String(sourceBlockId)
  const typeStr = String(sourceType)
  if (typeStr === "children" && (idStr === "0" || sourceBlockId === 0)) {
    return Object.freeze({ kind: "fixed" as const, mode: "difficult" as const })
  }
  return Object.freeze({
    kind: "fixed" as const,
    mode: "source" as const,
    sourceType: typeStr,
    sourceBlockId: idStr
  })
}

/**
 * 将 scope 编码为稳定 storage key（含版本前缀）。
 * 同一 scope 始终相同；不同 scope 不碰撞。
 */
export function toSessionProgressStorageKey(scope: SessionProgressScope): string {
  switch (scope.kind) {
    case "normal":
      if (scope.mode === "all") {
        return `${SESSION_PROGRESS_KEY_PREFIX}normal/all`
      }
      return `${SESSION_PROGRESS_KEY_PREFIX}normal/deck/${encodeProgressScopeSegment(scope.deckName)}`
    case "fixed":
      if (scope.mode === "difficult") {
        return `${SESSION_PROGRESS_KEY_PREFIX}fixed/difficult`
      }
      return (
        `${SESSION_PROGRESS_KEY_PREFIX}fixed/` +
        `${encodeProgressScopeSegment(scope.sourceType)}/` +
        `${encodeProgressScopeSegment(scope.sourceBlockId)}`
      )
    default: {
      const _exhaustive: never = scope
      return _exhaustive
    }
  }
}

/**
 * 从 deck filter 或 fixed 来源一次性构建 descriptor（Renderer 冻结后传入 Demo）。
 */
export function createSessionProgressDescriptorFromNormal(
  deckFilter: string | null | undefined
): SessionProgressDescriptor {
  const scope = createProgressScopeFromDeckFilter(deckFilter)
  return Object.freeze({
    scope,
    storageKey: toSessionProgressStorageKey(scope)
  })
}

export function createSessionProgressDescriptorFromFixedSource(
  sourceType: string,
  sourceBlockId: DbId | string | number
): SessionProgressDescriptor {
  const scope = createProgressScopeFromFixedSource(sourceType, sourceBlockId)
  return Object.freeze({
    scope,
    storageKey: toSessionProgressStorageKey(scope)
  })
}

// ============================================
// Safe storage ops（失败 console.warn，不抛到主流程）
// ============================================

export function safeStorageGetItem(
  storage: StorageLike,
  key: string
): string | null {
  try {
    return storage.getItem(key)
  } catch (error) {
    console.warn(`[sessionProgress] getItem 失败 (${key}):`, error)
    return null
  }
}

export function safeStorageSetItem(
  storage: StorageLike,
  key: string,
  value: string
): boolean {
  try {
    storage.setItem(key, value)
    return true
  } catch (error) {
    console.warn(`[sessionProgress] setItem 失败 (${key}):`, error)
    return false
  }
}

export function safeStorageRemoveItem(storage: StorageLike, key: string): boolean {
  try {
    storage.removeItem(key)
    return true
  } catch (error) {
    console.warn(`[sessionProgress] removeItem 失败 (${key}):`, error)
    return false
  }
}

/**
 * 新会话启动：清理同 scope 旧值（不恢复）。
 * 成功与否均返回 boolean；失败仅 warn。
 */
export function clearSessionProgressKey(
  storage: StorageLike,
  key: string
): boolean {
  return safeStorageRemoveItem(storage, key)
}

/**
 * 自动保存当前序列化状态到 scoped key。
 */
export function autoSaveSessionProgress(
  storage: StorageLike,
  key: string,
  serialized: string
): boolean {
  return safeStorageSetItem(storage, key, serialized)
}

/**
 * F2-04：同一会话在「过早 finish 后」因短期重学重新进入进行中时，
 * 重新登记 key 并写回当前进度快照。**不清零** progress 内容。
 *
 * 调用方须同步把本地 autosave gate（如 storageActiveRef）设回 true。
 * 这不是 F2-09 跨重启断点恢复；仅恢复当前挂载会话的 sessionStorage 写入。
 */
export function resumeSessionProgressAutosave(
  storage: StorageLike | null,
  key: string,
  serializedProgress: string
): boolean {
  if (typeof key !== "string" || key.length === 0) {
    return false
  }
  registerSessionProgressKey(key)
  if (!storage) {
    return true
  }
  return autoSaveSessionProgress(storage, key, serializedProgress)
}

// ============================================
// Strict deserialize / restore（显式 API，本阶段不自动恢复）
// ============================================

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function isValidGradeDistribution(v: unknown): v is GradeDistribution {
  if (v == null || typeof v !== "object") return false
  const d = v as Record<string, unknown>
  return (
    isFiniteNumber(d.again) &&
    isFiniteNumber(d.hard) &&
    isFiniteNumber(d.good) &&
    isFiniteNumber(d.easy)
  )
}

function isValidProgressState(v: unknown): v is SessionProgressState {
  if (v == null || typeof v !== "object") return false
  const s = v as Record<string, unknown>
  return (
    s.version === CURRENT_VERSION &&
    isFiniteNumber(s.sessionStartTime) &&
    isValidGradeDistribution(s.gradeDistribution) &&
    isFiniteNumber(s.totalGradedCards) &&
    isFiniteNumber(s.effectiveReviewTime) &&
    Array.isArray(s.cardDurations) &&
    s.cardDurations.every(isFiniteNumber)
  )
}

/**
 * 严格解析会话进度 JSON。
 * 结构 / version 不合法时返回 null 并 warn（不把损坏数据当成功）。
 */
export function tryParseSessionProgressJson(
  json: string
): SessionProgressState | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed == null || typeof parsed !== "object") {
      console.warn("[sessionProgress] 显式 restore 失败: 根节点不是对象")
      return null
    }
    const root = parsed as Record<string, unknown>
    if (root.version !== CURRENT_VERSION) {
      console.warn(
        `[sessionProgress] 显式 restore 失败: version 不匹配 expected=${CURRENT_VERSION} got=${String(root.version)}`
      )
      return null
    }
    if (!isValidProgressState(root.data)) {
      console.warn("[sessionProgress] 显式 restore 失败: data 结构无效")
      return null
    }
    // 返回浅拷贝，避免调用方改写缓存引用
    const data = root.data
    return {
      version: data.version,
      sessionStartTime: data.sessionStartTime,
      gradeDistribution: { ...data.gradeDistribution },
      totalGradedCards: data.totalGradedCards,
      effectiveReviewTime: data.effectiveReviewTime,
      cardDurations: [...data.cardDurations]
    }
  } catch (error) {
    console.warn("[sessionProgress] 显式 restore 失败: JSON 解析错误", error)
    return null
  }
}

/**
 * 兼容旧 deserialize 形态：失败时 warn 并返回全新初始状态（不宣称恢复成功）。
 * 显式 restore 请用 tryParseSessionProgressJson。
 */
export function deserializeProgressStateOrInitial(json: string): SessionProgressState {
  const parsed = tryParseSessionProgressJson(json)
  if (parsed) return parsed
  return createInitialProgressState()
}

// ============================================
// In-process key registry（卸载时只清已登记 key）
// ============================================

/** 本进程内已登记的 scoped progress keys（模块级，不扫 sessionStorage 全局） */
const registeredProgressKeys = new Set<string>()

export function registerSessionProgressKey(key: string): void {
  if (typeof key === "string" && key.length > 0) {
    registeredProgressKeys.add(key)
  }
}

export function unregisterSessionProgressKey(key: string): void {
  registeredProgressKeys.delete(key)
}

export function getRegisteredSessionProgressKeys(): readonly string[] {
  return Object.freeze([...registeredProgressKeys])
}

/** 测试用：清空 registry（不碰 storage） */
export function resetSessionProgressKeyRegistryForTests(): void {
  registeredProgressKeys.clear()
}

export type ClearRegisteredProgressKeysResult = {
  cleared: string[]
  errors: Array<{ key: string; error: unknown }>
}

/**
 * 卸载 / 清理：仅删除本进程已登记的 progress keys。
 * 单项失败 console.warn 并继续；不扫描、不删除其他插件或无关 key。
 */
export function clearRegisteredSessionProgressKeys(
  storage: StorageLike
): ClearRegisteredProgressKeysResult {
  const cleared: string[] = []
  const errors: Array<{ key: string; error: unknown }> = []
  const keys = [...registeredProgressKeys]

  for (const key of keys) {
    try {
      storage.removeItem(key)
      registeredProgressKeys.delete(key)
      cleared.push(key)
    } catch (error) {
      console.warn(
        `[sessionProgress] 卸载清理 progress key 失败 (${key}):`,
        error
      )
      errors.push({ key, error })
    }
  }

  return { cleared, errors }
}

/**
 * 便捷：使用全局 sessionStorage（浏览器环境）。
 * 不可用时返回 null。
 */
export function getDefaultSessionStorage(): StorageLike | null {
  try {
    if (typeof sessionStorage === "undefined") return null
    return sessionStorage
  } catch (error) {
    console.warn("[sessionProgress] sessionStorage 不可用:", error)
    return null
  }
}
