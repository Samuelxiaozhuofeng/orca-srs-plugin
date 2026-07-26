import type { ImportEpubProgress } from "../../importers/epub/types"

export type EpubImportProgressProps = {
  progress: ImportEpubProgress | null
  error?: string | null
}

export default function EpubImportProgress({ progress, error }: EpubImportProgressProps) {
  return (
    <div role="status" aria-live="polite" className="srs-import-progress">
      {error ? (
        <div className="srs-import-dialog__error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="srs-import-progress__message">
        {progress?.message || "准备中…"}
      </div>
      {progress?.chapterTotal != null && progress.chapterIndex != null ? (
        <div className="srs-import-progress__detail">
          章节进度 {progress.chapterIndex}/{progress.chapterTotal}
          {progress.chapterTitle ? ` · ${progress.chapterTitle}` : ""}
        </div>
      ) : null}
      <div aria-hidden className="srs-import-progress__track">
        {/* 宽度是运行时动态几何量，保持内联 */}
        <div
          className="srs-import-progress__fill"
          style={{
            width:
              progress?.chapterTotal && progress.chapterIndex
                ? `${Math.round((progress.chapterIndex / progress.chapterTotal) * 100)}%`
                : progress?.phase === "complete"
                  ? "100%"
                  : "30%"
          }}
        />
      </div>
    </div>
  )
}
