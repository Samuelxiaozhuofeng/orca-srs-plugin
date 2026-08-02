/**
 * Flash Home 批量 TTS 控制条（仅 Basic）。
 */

import type { TtsBatchItem, TtsBatchProgress } from "../../srs/tts/ttsBatch"
import type { filterBasicCardsForTtsBatch } from "../../srs/tts/ttsBatch"

const { Button } = orca.components

type BasicFilter = ReturnType<typeof filterBasicCardsForTtsBatch>

export type TtsBatchBarProps = {
  cardsTotal: number
  basicFilter: BasicFilter
  selectedCount: number
  batchRunning: boolean
  skipExisting: boolean
  onSkipExistingChange: (value: boolean) => void
  liveProgress: TtsBatchProgress | null
  onSelectAll: () => void
  onClearSelection: () => void
  onStart: () => void
  onCancel: () => void
  onRetryFailed: () => void
}

export default function TtsBatchBar(props: TtsBatchBarProps) {
  const {
    cardsTotal,
    basicFilter,
    selectedCount,
    batchRunning,
    skipExisting,
    onSkipExistingChange,
    liveProgress,
    onSelectAll,
    onClearSelection,
    onStart,
    onCancel,
    onRetryFailed
  } = props

  const showProgress =
    !!liveProgress &&
    (batchRunning ||
      liveProgress.success +
        liveProgress.failed +
        liveProgress.skipped +
        liveProgress.cancelled >
        0)

  return (
    <div className="srs-tts-batch-bar" role="region" aria-label="批量语音">
      <div className="srs-tts-batch-bar__stats">
        当前筛选 {cardsTotal} 张 · Basic 可选 {basicFilter.eligible.length}
        {basicFilter.skippedNonBasic > 0
          ? ` · 非 Basic 跳过 ${basicFilter.skippedNonBasic}`
          : ""}
        {basicFilter.skippedEmptyFront > 0
          ? ` · 空正面 ${basicFilter.skippedEmptyFront}`
          : ""}
        {" · 已选 "}
        {selectedCount}
      </div>
      <div className="srs-tts-batch-bar__actions">
        <Button
          variant="plain"
          onClick={
            batchRunning || basicFilter.eligible.length === 0
              ? undefined
              : onSelectAll
          }
        >
          全选 Basic
        </Button>
        <Button
          variant="plain"
          onClick={
            batchRunning || selectedCount === 0 ? undefined : onClearSelection
          }
        >
          清空
        </Button>
        <label className="srs-tts-batch-bar__mode">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e: { target: { checked: boolean } }) =>
              onSkipExistingChange(e.target.checked)
            }
            disabled={batchRunning}
          />
          跳过已有（相同文本+音色）
        </label>
        {!batchRunning ? (
          <Button
            variant="solid"
            onClick={selectedCount === 0 ? undefined : onStart}
          >
            开始生成
          </Button>
        ) : (
          <Button variant="outline" onClick={onCancel}>
            取消未开始
          </Button>
        )}
        {liveProgress && liveProgress.failed > 0 && !batchRunning && (
          <Button variant="outline" onClick={onRetryFailed}>
            重试失败 ({liveProgress.failed})
          </Button>
        )}
      </div>
      {showProgress && liveProgress && (
        <div className="srs-tts-batch-bar__progress" role="status">
          进度：共 {liveProgress.total} · 成功 {liveProgress.success} · 跳过{" "}
          {liveProgress.skipped} · 失败 {liveProgress.failed}
          {liveProgress.cancelled > 0
            ? ` · 取消 ${liveProgress.cancelled}`
            : ""}
          {liveProgress.remaining > 0
            ? ` · 剩余 ${liveProgress.remaining}`
            : ""}
        </div>
      )}
      {liveProgress &&
        liveProgress.items.some(
          (i: TtsBatchItem) => i.status === "failed"
        ) && (
          <ul className="srs-tts-batch-bar__errors">
            {liveProgress.items
              .filter((i: TtsBatchItem) => i.status === "failed")
              .slice(0, 8)
              .map((i: TtsBatchItem) => (
                <li key={i.cardKey}>
                  {i.front.slice(0, 40)}
                  {i.front.length > 40 ? "…" : ""}: {i.error}
                </li>
              ))}
          </ul>
        )}
      <p className="srs-tts-batch-bar__hint">
        仅 Basic 卡；来源为卡片正面（front）。非 Basic / 空正面不可选。音频插在卡片后并写入{" "}
        <code>srs.tts.manifest</code>。
      </p>
    </div>
  )
}
