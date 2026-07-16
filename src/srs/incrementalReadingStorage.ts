/**
 * 渐进阅读状态存储模块（兼容门面）
 *
 * 使用 Block Properties 存储 ir.* 状态。
 * 实现已按职责拆分到 `src/srs/incremental-reading/`：
 * - irTypes / irPropertyCodec：类型与属性编解码
 * - irBlockCache：backend-first 块缓存
 * - irStatePersistence：load / save / delete / ensure
 * - irSchedulingHelpers / irSchedulingMutations：排期计算与变更
 *
 * 本文件保持全部既有导出名称与行为，供现有 import 路径兼容。
 */

export type {
  IRStage,
  IRLastAction,
  IRReadingBreakpointSelection,
  IRReadingBreakpoint,
  IRState
} from "./incremental-reading/irPropertyCodec"

export { invalidateIrBlockCache } from "./incremental-reading/irBlockCache"

export {
  loadIRState,
  saveIRState,
  deleteIRState,
  deleteIRSchedulingState,
  ensureIRState
} from "./incremental-reading/irStatePersistence"

export {
  markAsRead,
  markAsReadWithPriority,
  updatePriority,
  bulkUpdatePriority,
  updateResumeBlockId,
  updateReadingBreakpoint,
  postpone,
  postponeDaysForChoice,
  advanceDueToToday
} from "./incremental-reading/irSchedulingMutations"
