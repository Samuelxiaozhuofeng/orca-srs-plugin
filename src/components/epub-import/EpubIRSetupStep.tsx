/**
 * IR book setup step after EPUB import (chapter subset, mode, importance, days).
 */

import type { DbId } from "../../orca.d.ts"
import {
  accessibilityLabels,
  schedulePreviewText
} from "./epubImportViewModel"
import EpubChapterSelector from "./EpubChapterSelector"
import IRImportanceSetupField from "../incremental-reading/IRImportanceSetupField"

const { Button } = orca.components

export type EpubIRSetupChapterOption = {
  key: string
  title: string
  spineIndex: number
}

export type EpubIRSetupStepProps = {
  chapterOptions: EpubIRSetupChapterOption[]
  selectedChapterIds: DbId[]
  onSelectedChapterIdsChange: (ids: DbId[]) => void
  mode: "distributed" | "sequential"
  onModeChange: (mode: "distributed" | "sequential") => void
  priority: number
  onPriorityChange: (priority: number) => void
  totalDays: number
  onTotalDaysChange: (days: number) => void
  isWorking: boolean
  failedCount: number
  successCount: number
  onBack: () => void
  onConfirm: () => void
  onRetry: () => void
  onDeferFailures: () => void
}

export default function EpubIRSetupStep({
  chapterOptions,
  selectedChapterIds,
  onSelectedChapterIdsChange,
  mode,
  onModeChange,
  priority,
  onPriorityChange,
  totalDays,
  onTotalDaysChange,
  isWorking,
  failedCount,
  successCount,
  onBack,
  onConfirm,
  onRetry,
  onDeferFailures
}: EpubIRSetupStepProps) {
  const labels = accessibilityLabels()

  return (
    <div className="srs-import-dialog__step">
      <div className="srs-import-result__headline">创建渐进阅读书籍</div>
      <div className="srs-import-dialog__hint">
        默认全选已成功导入章节；取消的章节保持普通笔记，之后可再加入。
      </div>
      <EpubChapterSelector
        chapters={chapterOptions}
        selectedKeys={selectedChapterIds.map(String)}
        onChange={(keys) =>
          onSelectedChapterIdsChange(keys.map(Number).filter(Number.isFinite))
        }
        disabled={isWorking}
        label="渐进阅读章节"
      />
      <div className="srs-import-dialog__radio-row">
        <label className="srs-import-dialog__radio">
          <input
            type="radio"
            name="ir-mode"
            checked={mode === "distributed"}
            onChange={() => onModeChange("distributed")}
            disabled={isWorking}
            aria-label={labels.modeDistributed}
          />{" "}
          {labels.modeDistributed}
        </label>
        <label className="srs-import-dialog__radio">
          <input
            type="radio"
            name="ir-mode"
            checked={mode === "sequential"}
            onChange={() => onModeChange("sequential")}
            disabled={isWorking}
            aria-label={labels.modeSequential}
          />{" "}
          {labels.modeSequential}
        </label>
      </div>
      <IRImportanceSetupField
        valuePriority={priority}
        onChange={onPriorityChange}
        disabled={isWorking}
      />
      <label className="srs-import-dialog__field">
        <span className="srs-import-dialog__label">计划天数</span>
        <input
          type="number"
          min={1}
          value={totalDays}
          disabled={isWorking || mode === "sequential"}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onTotalDaysChange(Math.max(1, Number(e.target.value) || 1))
          }
          className="srs-import-dialog__input srs-import-dialog__input--number srs-import-dialog__input--narrow"
        />
      </label>
      <div className="srs-import-dialog__tray srs-import-dialog__tray--dashed">
        <div className="srs-import-dialog__tray-body">
          {schedulePreviewText(mode, selectedChapterIds.length, totalDays, priority)}
        </div>
      </div>
      {failedCount > 0 ? (
        <div role="status" className="srs-import-dialog__warn">
          成功 {successCount}，失败 {failedCount}。成功章节已写入计划，可重试失败项。
        </div>
      ) : null}
      <div className="srs-import-dialog__actions">
        <Button
          variant="outline"
          onClick={
            isWorking
              ? undefined
              : () => (failedCount > 0 ? onDeferFailures() : onBack())
          }
          aria-disabled={isWorking}
          className={isWorking ? "srs-ui-locked" : undefined}
        >
          {failedCount > 0 ? "稍后" : "返回"}
        </Button>
        {failedCount > 0 ? (
          <Button
            variant="solid"
            onClick={() => {
              if (isWorking) return
              onRetry()
            }}
            aria-disabled={isWorking}
            className={isWorking ? "srs-ui-locked" : undefined}
          >
            {isWorking ? "重试中…" : "重试失败项"}
          </Button>
        ) : (
          <Button
            variant="solid"
            onClick={() => {
              if (isWorking || selectedChapterIds.length === 0) return
              onConfirm()
            }}
            aria-disabled={isWorking || selectedChapterIds.length === 0}
            className={
              isWorking || selectedChapterIds.length === 0
                ? "srs-ui-locked"
                : undefined
            }
          >
            {isWorking ? "创建中…" : "确认创建"}
          </Button>
        )}
      </div>
    </div>
  )
}
