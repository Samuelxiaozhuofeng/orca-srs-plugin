/**
 * 渐进阅读会话组件（兼容入口）
 *
 * 实际 UI 已拆分至 components/incremental-reading/*，
 * 本文件保留导出路径兼容，避免继续膨胀为超大组件。
 */

import type { IRCard } from "../srs/incrementalReadingCollector"
import IRSessionShell from "./incremental-reading/IRSessionShell"

export type IncrementalReadingSessionProps = {
  cards: IRCard[]
  panelId: string
  pluginName?: string
  dailyLimit?: number
  totalDueCount?: number
  overflowCount?: number
  enableOverflowDefer?: boolean
  loadFailed?: boolean
  loadErrorMessage?: string | null
  onRetryLoad?: () => void
  timeBudgetMinutes?: number
  autoPostponeLabel?: string | null
  onUndoAutoPostpone?: () => void
  onDeferOverflow?: () => Promise<number>
  onClose?: () => void
}

export default function IncrementalReadingSessionDemo({
  cards,
  panelId,
  pluginName,
  loadFailed,
  loadErrorMessage,
  onRetryLoad,
  timeBudgetMinutes,
  autoPostponeLabel,
  onUndoAutoPostpone,
  onClose
}: IncrementalReadingSessionProps) {
  return (
    <IRSessionShell
      cards={cards}
      panelId={panelId}
      pluginName={pluginName}
      timeBudgetMinutes={timeBudgetMinutes}
      loadFailed={loadFailed}
      loadErrorMessage={loadErrorMessage}
      onRetryLoad={onRetryLoad}
      autoPostponeLabel={autoPostponeLabel}
      onUndoAutoPostpone={onUndoAutoPostpone}
      onClose={onClose}
    />
  )
}
