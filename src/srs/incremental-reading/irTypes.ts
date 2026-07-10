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

export type IRReadingBreakpoint = {
  previewBlockId: DbId | null
  selection: IRReadingBreakpointSelection | null
  updatedAt: Date | null
  /** 防止旧断点响应覆盖新断点 */
  version?: number
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
