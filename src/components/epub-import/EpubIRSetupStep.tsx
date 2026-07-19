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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>创建渐进阅读书籍</div>
      <div style={{ fontSize: 12, color: "var(--orca-color-text-2)" }}>
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
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>
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
        <label style={{ fontSize: 13 }}>
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
      <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
        计划天数
        <input
          type="number"
          min={1}
          value={totalDays}
          disabled={isWorking || mode === "sequential"}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onTotalDaysChange(Math.max(1, Number(e.target.value) || 1))
          }
          style={{ display: "block", width: "100%", maxWidth: 200, padding: 8 }}
        />
      </label>
      <div
        style={{
          border: "1px dashed var(--orca-color-border-1)",
          borderRadius: 8,
          padding: 10,
          fontSize: 13
        }}
      >
        {schedulePreviewText(mode, selectedChapterIds.length, totalDays, priority)}
      </div>
      {failedCount > 0 ? (
        <div role="status" style={{ fontSize: 13, color: "var(--orca-color-warning-6, #a60)" }}>
          成功 {successCount}，失败 {failedCount}。成功章节已写入计划，可重试失败项。
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          variant="outline"
          onClick={
            isWorking
              ? undefined
              : () => (failedCount > 0 ? onDeferFailures() : onBack())
          }
          aria-disabled={isWorking}
          style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
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
            style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
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
            style={
              isWorking || selectedChapterIds.length === 0
                ? { opacity: 0.5, pointerEvents: "none" }
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
