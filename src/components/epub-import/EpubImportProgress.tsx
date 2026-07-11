import type { ImportEpubProgress } from "../../importers/epub/types"

export type EpubImportProgressProps = {
  progress: ImportEpubProgress | null
  error?: string | null
}

export default function EpubImportProgress({ progress, error }: EpubImportProgressProps) {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {error ? (
        <div style={{ color: "var(--orca-color-danger-6, #c00)", fontSize: 14 }} role="alert">
          {error}
        </div>
      ) : null}
      <div style={{ fontSize: 14, color: "var(--orca-color-text-1)" }}>
        {progress?.message || "准备中…"}
      </div>
      {progress?.chapterTotal != null && progress.chapterIndex != null ? (
        <div style={{ fontSize: 12, color: "var(--orca-color-text-2)" }}>
          章节进度 {progress.chapterIndex}/{progress.chapterTotal}
          {progress.chapterTitle ? ` · ${progress.chapterTitle}` : ""}
        </div>
      ) : null}
      <div
        aria-hidden
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--orca-color-bg-3, #eee)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            height: "100%",
            width:
              progress?.chapterTotal && progress.chapterIndex
                ? `${Math.round((progress.chapterIndex / progress.chapterTotal) * 100)}%`
                : progress?.phase === "complete"
                  ? "100%"
                  : "30%",
            background: "var(--orca-color-primary-6, #4c8bf5)",
            transition: "width 0.2s ease"
          }}
        />
      </div>
    </div>
  )
}
