import type { ImportEpubResult } from "../../importers/epub/types"
import { accessibilityLabels, resultSummary } from "./epubImportViewModel"

const { Button } = orca.components

export type EpubImportResultProps = {
  result: ImportEpubResult
  onDone: () => void
  onContinueIR: () => void
  onResume?: () => void
  isWorking?: boolean
}

export default function EpubImportResultView({
  result,
  onDone,
  onContinueIR,
  onResume,
  isWorking
}: EpubImportResultProps) {
  const labels = accessibilityLabels()
  const summary = resultSummary(result)
  const disabledStyle = isWorking ? { opacity: 0.5, pointerEvents: "none" as const } : undefined

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{summary.headline}</div>
        <div style={{ fontSize: 13, color: "var(--orca-color-text-2)", marginTop: 4 }}>
          {summary.detail}
        </div>
      </div>

      {result.failedChapters.length > 0 ? (
        <div
          style={{
            border: "1px solid var(--orca-color-border-1)",
            borderRadius: 8,
            padding: 10,
            maxHeight: 140,
            overflowY: "auto",
            fontSize: 12
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>失败章节</div>
          {result.failedChapters.map((ch) => (
            <div key={ch.key} style={{ marginBottom: 4 }}>
              {ch.title}: {ch.error || "未知错误"}
            </div>
          ))}
        </div>
      ) : null}

      {result.suspectedDuplicates && result.suspectedDuplicates.length > 0 ? (
        <div style={{ fontSize: 12, color: "var(--orca-color-warning-6, #a60)" }}>
          疑似重复（同名不同文件）：
          {result.suspectedDuplicates.map((d) => ` #${d.bookBlockId} ${d.title}`).join("；")}
          。不会自动合并。
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {summary.canResume && onResume ? (
          <Button variant="outline" onClick={onResume} style={disabledStyle} aria-label={labels.resume}>
            {labels.resume}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onDone} style={disabledStyle} aria-label={labels.done}>
          {labels.done}
        </Button>
        {summary.canCreateIR ? (
          <Button
            variant="solid"
            onClick={onContinueIR}
            style={disabledStyle}
            aria-label={labels.continueIR}
          >
            {labels.continueIR}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
