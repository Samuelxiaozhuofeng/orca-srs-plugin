/**
 * Bounded, repo-scoped registry of sequential Book IR book block IDs.
 *
 * Purpose: discover sequential plans in the IR library even when the book has
 * zero live IR cards (completed book, paused after removal, or mid-recovery).
 *
 * - Storage: localStorage, keyed by orca.state.repo (same isolation pattern as irIndex)
 * - Not canonical truth: always re-validate with loadBookIRPlan
 * - Register on sequential plan save; unregister only on deliberate plan clear
 * - Bound: max IDs + drop oldest on overflow; never scan get-all-blocks
 */

import type { DbId } from "../../orca.d.ts"

const STORAGE_PREFIX = "orca-srs:sequential-book-registry:"
/** Hard cap to keep library loads O(known books), not O(vault). */
export const SEQUENTIAL_BOOK_REGISTRY_MAX_IDS = 500

export type SequentialBookRegistrySnapshot = {
  version: 1
  bookIds: DbId[]
  updatedAt: number
}

function getStorageKey(pluginName = "orca-srs"): string {
  const currentOrca = (globalThis as unknown as {
    orca?: { state?: { repo?: unknown } }
  }).orca
  const repo = currentOrca?.state?.repo
  const repoKey = typeof repo === "string" && repo.trim()
    ? encodeURIComponent(repo.trim())
    : "unknown-repo"
  return `${STORAGE_PREFIX}${repoKey}:${pluginName}`
}

function normalizeIds(ids: unknown): DbId[] {
  if (!Array.isArray(ids)) return []
  const seen = new Set<DbId>()
  const result: DbId[] = []
  for (const raw of ids) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue
    const id = raw as DbId
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
    if (result.length >= SEQUENTIAL_BOOK_REGISTRY_MAX_IDS) break
  }
  return result
}

export function loadSequentialBookRegistry(
  pluginName = "orca-srs"
): SequentialBookRegistrySnapshot | null {
  try {
    const raw = localStorage.getItem(getStorageKey(pluginName))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SequentialBookRegistrySnapshot
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.bookIds)) {
      return null
    }
    return {
      version: 1,
      bookIds: normalizeIds(parsed.bookIds),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0
    }
  } catch (error) {
    console.warn(`[${pluginName}] 读取顺序书注册表失败:`, error)
    return null
  }
}

export function saveSequentialBookRegistry(
  snapshot: SequentialBookRegistrySnapshot,
  pluginName = "orca-srs"
): void {
  try {
    const payload: SequentialBookRegistrySnapshot = {
      version: 1,
      bookIds: normalizeIds(snapshot.bookIds),
      updatedAt: snapshot.updatedAt
    }
    localStorage.setItem(getStorageKey(pluginName), JSON.stringify(payload))
  } catch (error) {
    console.warn(`[${pluginName}] 保存顺序书注册表失败:`, error)
  }
}

export function listRegisteredSequentialBookIds(pluginName = "orca-srs"): DbId[] {
  return loadSequentialBookRegistry(pluginName)?.bookIds ?? []
}

/**
 * Upsert a sequential book id (move to end = most recently registered).
 * Failures are logged; callers must not treat registry write as plan success.
 */
export function registerSequentialBookId(
  bookBlockId: DbId,
  pluginName = "orca-srs"
): void {
  if (typeof bookBlockId !== "number" || !Number.isFinite(bookBlockId)) return
  const prev = loadSequentialBookRegistry(pluginName)
  const without = (prev?.bookIds ?? []).filter((id) => id !== bookBlockId)
  without.push(bookBlockId)
  // Overflow: drop oldest (front)
  const bookIds =
    without.length > SEQUENTIAL_BOOK_REGISTRY_MAX_IDS
      ? without.slice(without.length - SEQUENTIAL_BOOK_REGISTRY_MAX_IDS)
      : without
  saveSequentialBookRegistry(
    { version: 1, bookIds, updatedAt: Date.now() },
    pluginName
  )
}

/**
 * Remove a book id after deliberate plan clear / full IR removal.
 */
export function unregisterSequentialBookId(
  bookBlockId: DbId,
  pluginName = "orca-srs"
): void {
  const prev = loadSequentialBookRegistry(pluginName)
  if (!prev) return
  const bookIds = prev.bookIds.filter((id) => id !== bookBlockId)
  if (bookIds.length === prev.bookIds.length) return
  saveSequentialBookRegistry(
    { version: 1, bookIds, updatedAt: Date.now() },
    pluginName
  )
}

/**
 * Drop IDs confirmed to have no sequential plan (stale registry entries).
 * Does not remove on transient read failures — caller keeps those for retry.
 */
export function pruneSequentialBookIds(
  idsToRemove: ReadonlyArray<DbId>,
  pluginName = "orca-srs"
): void {
  if (idsToRemove.length === 0) return
  const removeSet = new Set(idsToRemove)
  const prev = loadSequentialBookRegistry(pluginName)
  if (!prev) return
  const bookIds = prev.bookIds.filter((id) => !removeSet.has(id))
  if (bookIds.length === prev.bookIds.length) return
  saveSequentialBookRegistry(
    { version: 1, bookIds, updatedAt: Date.now() },
    pluginName
  )
}
