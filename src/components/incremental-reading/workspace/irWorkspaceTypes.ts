/**
 * 统一渐进阅读工作区类型
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import type { IRSessionEntry } from "../../../srs/incremental-reading/irMixedQueuePolicy"
import type { IRLibraryFilters } from "./irLibraryFilters"
import type { IRSessionLaunchMode } from "./irSessionLaunchMode"
import type { IRTimeNavKey } from "./irSourceTreeBuilder"

export type { IRSessionLaunchMode }
export type IRWorkspaceMode = "library" | "reading"

export type IRWorkspaceDrawer =
  | null
  | "filters"
  | "settings"
  | "diagnostics"
  | "queue"
  | "details"

export type IRWorkspaceSessionState = {
  ready: boolean
  loading: boolean
  entries: IRSessionEntry[]
  timeBudgetMinutes: number
  collectResult: IRCollectResult | null
  autoPostponeLabel: string | null
  autoBatchId: string | null
  /** 递增以强制重建会话现场（新队列） */
  generation: number
  /**
   * 本次启动的显式模式；null 表示未指定（资料库选卡等），混合开关回退全局设置。
   * 不写回全局 mixedLearningEnabled。
   */
  sessionLaunchMode: IRSessionLaunchMode | null
  /** 混合意图但本快照未混入复习卡时的事实型提示；非混合为 null */
  mixedDegradedNotice: string | null
}

export type IRWorkspaceLibraryState = {
  cards: IRCard[]
  loading: boolean
  errorMessage: string | null
  filters: IRLibraryFilters
  timeNavKey: IRTimeNavKey
  expandedSourceIds: Record<string, boolean>
  expandedChapterIds: Record<string, boolean>
  selectedCardIds: Set<DbId>
  titleMap: Record<string, string>
  detailsCardId: DbId | null
}

export const EMPTY_SESSION_STATE: IRWorkspaceSessionState = {
  ready: false,
  loading: false,
  entries: [],
  timeBudgetMinutes: 20,
  collectResult: null,
  autoPostponeLabel: null,
  autoBatchId: null,
  generation: 0,
  sessionLaunchMode: null,
  mixedDegradedNotice: null
}

export type IRWorkspaceProps = {
  panelId: string
  pluginName?: string
  /** 兼容入口初始模式；进入后用户可自由切换 */
  initialMode?: IRWorkspaceMode
  onClose?: () => void
}
