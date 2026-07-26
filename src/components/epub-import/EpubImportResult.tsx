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
  const lockedClass = isWorking ? "srs-ui-locked" : undefined

  return (
    <div className="srs-import-result">
      <div>
        <div className="srs-import-result__headline">{summary.headline}</div>
        <div className="srs-import-result__detail">{summary.detail}</div>
      </div>

      {result.failedChapters.length > 0 ? (
        <div className="srs-import-result__failures">
          <div className="srs-import-result__failures-title">失败章节</div>
          {result.failedChapters.map((ch) => (
            <div key={ch.key} className="srs-import-result__failure">
              {ch.title}: {ch.error || "未知错误"}
            </div>
          ))}
        </div>
      ) : null}

      {result.suspectedDuplicates && result.suspectedDuplicates.length > 0 ? (
        <div className="srs-import-dialog__warn">
          疑似重复（同名不同文件）：
          {result.suspectedDuplicates.map((d) => ` #${d.bookBlockId} ${d.title}`).join("；")}
          。不会自动合并。
        </div>
      ) : null}

      <div className="srs-import-dialog__actions">
        {summary.canResume && onResume ? (
          <Button
            variant="outline"
            onClick={onResume}
            className={lockedClass}
            aria-label={labels.resume}
          >
            {labels.resume}
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={onDone}
          className={lockedClass}
          aria-label={labels.done}
        >
          {labels.done}
        </Button>
        {summary.canCreateIR ? (
          <Button
            variant="solid"
            onClick={onContinueIR}
            className={lockedClass}
            aria-label={labels.continueIR}
          >
            {labels.continueIR}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
