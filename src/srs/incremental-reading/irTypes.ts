/**
 * 渐进阅读领域类型（纯类型，无副作用）
 */

import type { CursorNodeData, DbId } from "../../orca.d.ts"

export type IRCardType = "topic" | "extracts"

export type IRStage =
  | "topic.preview"
  | "topic.work"
  | "extract.raw"
  | "extract.refined"
  | "extract.item_candidate"

export type IRLastAction =
  | "init"
  | "migrate"
  | "read"
  | "priority"
  | "postpone"
  | "autoPostpone"
  | "complete"
  | "extract"
  | "refine"
  | "itemize"
  | "next"

export type IRReadingBreakpointSelection = {
  rootBlockId: DbId
  anchor: CursorNodeData
  focus: CursorNodeData
  isForward: boolean
}

/**
 * 视口锚点：目标块顶相对滚动 owner 顶部的偏移（px）。
 * 负值表示块顶在视口上方（长块内阅读进度）。
 */
export type IRViewportAnchor = {
  rootBlockId: DbId
  blockId: DbId
  topOffsetPx: number
}

export type IRReadingBreakpoint = {
  previewBlockId: DbId | null
  selection: IRReadingBreakpointSelection | null
  updatedAt: Date | null
  /**
   * 进程内保存通道版本（可选）；与 schemaVersion 无关。
   * 注意：历史 parse/serialize 会丢弃该字段。
   */
  version?: number
  /**
   * 断点 JSON schema 版本。缺省/1 = 仅 preview+selection；
   * 2 = 含 viewportAnchor。未知未来版本应保留已知字段。
   */
  schemaVersion?: number
  /** v2：捕获时块顶相对滚动 owner 顶部的偏移，恢复时确定性对齐 */
  viewportAnchor?: IRViewportAnchor | null
}

export type IRState = {
  priority: number
  lastRead: Date | null
  readCount: number
  due: Date
  intervalDays: number
  postponeCount: number
  stage: IRStage
  lastAction: IRLastAction
  position: number | null
  resumeBlockId: DbId | null
  readingBreakpoint?: IRReadingBreakpoint | null
  /** 断点版本（跨属性兼容字段） */
  breakpointVersion?: number
  /** 真正加工时间（区别于被动曝光） */
  lastProcessedAt?: Date | null
  /** Extract 来源 Topic */
  sourceTopicId?: DbId | null
  /** 自动推后批次 ID */
  autoPostponeBatchId?: string | null
  /**
   * Sequential Active Cadence (SAC)：上次「下一篇」时的阅读进度指纹。
   * 由 resumeBlockId + readingBreakpoint 推导，用于判断是否实质进展。
   * 缺省/缺失视为无历史（兼容旧数据，不迁移重写）。
   */
  sacProgressKey?: string | null
  /**
   * SAC：连续无实质进展的「下一篇」次数。缺省视为 0。
   */
  sacStagnantCount?: number
}

export type IRCollectStatus = "ok" | "empty" | "partial" | "error"

export type IRCollectResult = {
  status: IRCollectStatus
  cards: import("../incrementalReadingCollector").IRCard[]
  failedCount: number
  errorMessage?: string
}

export type IRSessionProgress = {
  /** 本次计划条数（会话开始时的队列长度） */
  planned: number
  /** 已完成（已处理离开队列）条数 */
  completed: number
  /** 当前队列剩余 */
  remaining: number
}

export type IRTimeBudgetMinutes = 10 | 20 | 30

export type IRPriorityTier = "low" | "medium" | "high"

export type IRConversionStrategy = "complete_extract" | "keep_extract"

export type IRItemSourceMeta = {
  extractId: DbId
  topicId: DbId | null
  sourceBookId: DbId | null
  sourceBookTitle: string | null
  selectedText: string
}

export type IRAutoPostponeSnapshot = {
  blockId: DbId
  due: Date
  intervalDays: number
  postponeCount: number
  lastAction: IRLastAction
  autoPostponeBatchId: string | null
}

export type IRAutoPostponeBatch = {
  batchId: string
  createdAt: Date
  snapshots: IRAutoPostponeSnapshot[]
}
