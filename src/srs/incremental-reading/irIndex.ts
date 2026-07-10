/**
 * IR 卡片 ID 索引：避免每次会话遍历全部 #card
 *
 * 索引保存在 localStorage，失败时回退到全量收集。
 */

import type { DbId } from "../../orca.d.ts"

const STORAGE_PREFIX = "orca-srs:ir-index:"
export const IR_INDEX_MAX_AGE_MS = 10 * 60 * 1000

export type IRIndexSnapshot = {
  updatedAt: number
  /** 最近一次全量扫描时间；增量 upsert/remove 不刷新。 */
  verifiedAt?: number
  topicIds: DbId[]
  extractIds: DbId[]
}

export function isIRIndexFresh(
  snapshot: IRIndexSnapshot,
  now = Date.now(),
  maxAgeMs = IR_INDEX_MAX_AGE_MS
): boolean {
  const verifiedAt = snapshot.verifiedAt
  return typeof verifiedAt === "number"
    && Number.isFinite(verifiedAt)
    && verifiedAt > 0
    && now - verifiedAt >= 0
    && now - verifiedAt <= maxAgeMs
}

export function loadIRIndex(pluginName: string): IRIndexSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + pluginName)
    if (!raw) return null
    const parsed = JSON.parse(raw) as IRIndexSnapshot
    if (!parsed || !Array.isArray(parsed.topicIds) || !Array.isArray(parsed.extractIds)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveIRIndex(pluginName: string, snapshot: IRIndexSnapshot): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + pluginName, JSON.stringify(snapshot))
  } catch (error) {
    console.warn(`[${pluginName}] 保存 IR 索引失败:`, error)
  }
}

export function upsertIRIndexId(
  pluginName: string,
  id: DbId,
  cardType: "topic" | "extracts"
): void {
  const prev = loadIRIndex(pluginName) ?? {
    updatedAt: 0,
    topicIds: [],
    extractIds: []
  }
  const topicIds = new Set(prev.topicIds)
  const extractIds = new Set(prev.extractIds)
  if (cardType === "topic") {
    topicIds.add(id)
    extractIds.delete(id)
  } else {
    extractIds.add(id)
    topicIds.delete(id)
  }
  saveIRIndex(pluginName, {
    updatedAt: Date.now(),
    verifiedAt: prev.verifiedAt,
    topicIds: Array.from(topicIds),
    extractIds: Array.from(extractIds)
  })
}

export function removeIRIndexId(pluginName: string, id: DbId): void {
  const prev = loadIRIndex(pluginName)
  if (!prev) return
  saveIRIndex(pluginName, {
    updatedAt: Date.now(),
    verifiedAt: prev.verifiedAt,
    topicIds: prev.topicIds.filter(x => x !== id),
    extractIds: prev.extractIds.filter(x => x !== id)
  })
}

export function rebuildIRIndexFromCards(
  pluginName: string,
  cards: Array<{ id: DbId; cardType: "topic" | "extracts" }>
): IRIndexSnapshot {
  const topicIds: DbId[] = []
  const extractIds: DbId[] = []
  for (const card of cards) {
    if (card.cardType === "topic") topicIds.push(card.id)
    else extractIds.push(card.id)
  }
  const now = Date.now()
  const snapshot = { updatedAt: now, verifiedAt: now, topicIds, extractIds }
  saveIRIndex(pluginName, snapshot)
  return snapshot
}
