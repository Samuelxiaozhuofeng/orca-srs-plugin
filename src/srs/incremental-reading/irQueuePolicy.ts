/**
 * 纯函数队列策略：时间预算、Topic 最低曝光、新 Extract 配额、稳定随机
 *
 * 公共入口（唯一对外导入路径）。实现拆分：
 * - irQueuePolicyCore.ts — types / constants / helpers（无环底）
 * - irQueuePolicyConstraints.ts — 最终约束与探索
 * - irQueuePolicySelect.ts — 填充与编排
 *
 * 依赖方向（单向）：core ← constraints ← select ← 本入口
 */

export {
  type QueueCostEstimateSeconds,
  type IRQueuePolicyConfig,
  type QueuePolicyDiagnosticCode,
  type QueuePolicyDiagnostic,
  type SelectQueueResult,
  DEFAULT_QUEUE_POLICY,
  MIN_EXPLORATION_QUEUE_LENGTH,
  formatLocalDateKey,
  topicQuotaPercentToMinRatio,
  clampUnitRatio,
  estimateCardCostSeconds,
  budgetSeconds,
  stableUnitRandom,
  isOverdue,
  isHighPriority,
  isNewExtract,
  computeTopicFloor,
  computeNewExtractCap,
  adjustIntervalForPriorityChange,
  priorityToTier,
  tierToPriority
} from "./irQueuePolicyCore"

export { selectQueueWithPolicy } from "./irQueuePolicySelect"
