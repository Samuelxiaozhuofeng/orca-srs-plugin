/**
 * 统一渐进阅读工作区类型
 */

import type { IRCard } from "../../../srs/incrementalReadingCollector"
import type { IRCollectResult } from "../../../srs/incremental-reading/irTypes"
import type { IRDateGroupKey } from "../../../srs/incrementalReadingManagerUtils"
import type { IRLibraryFilters } from "./irLibraryFilters"

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
  cards: IRCard[]
  timeBudgetMinutes: number
  collectResult: IRCollectResult | null
  autoPostponeLabel: string | null
  autoBatchId: string | null
  /** 递增以强制重建会话现场（新队列） */
  generation: number
}

export type IRWorkspaceLibraryState = {
  cards: IRCard[]
  loading: boolean
  errorMessage: string | null
  filters: IRLibraryFilters
  expandedGroups: Record<IRDateGroupKey, boolean>
  selectedCardIds: Set<import("../../../orca.d.ts").DbId>
  titleMap: Record<string, string>
  detailsCardId: import("../../../orca.d.ts").DbId | null
}

export const EMPTY_SESSION_STATE: IRWorkspaceSessionState = {
  ready: false,
  loading: false,
  cards: [],
  timeBudgetMinutes: 20,
  collectResult: null,
  autoPostponeLabel: null,
  autoBatchId: null,
  generation: 0
}

export type IRWorkspaceProps = {
  panelId: string
  pluginName?: string
  /** 兼容入口初始模式；进入后用户可自由切换 */
  initialMode?: IRWorkspaceMode
  onClose?: () => void
}
