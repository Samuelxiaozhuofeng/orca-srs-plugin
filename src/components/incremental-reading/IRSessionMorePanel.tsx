/**
 * 「更多操作」次级面板：推后入口、主题、编辑模式、归档/完成本章等。
 * 重要性主路径在动作栏；推后保留在此 + Shift+Enter。
 */

import type { DbId } from "../../orca.d.ts"
import type { IRReaderTheme } from "./irReaderThemeStorage"

const { Button, ConfirmBox } = orca.components

export type IRSessionMorePanelProps = {
  open: boolean
  isWorking?: boolean
  theme: IRReaderTheme
  viewMode: "reading" | "edit"
  isSequentialActive: boolean
  /** When non-null, archive button prefers「完成本章」label for book-sourced topics. */
  sourceBookId: DbId | null | undefined
  embedded?: boolean
  onPostpone: () => void
  onThemeChange: (theme: IRReaderTheme) => void
  onToggleViewMode: () => void
  onOpenCompleteChapter: () => void
  onArchive: () => void | Promise<void>
  onSkipChapter: () => void | Promise<void>
  onBackToLibrary?: () => void
}

export default function IRSessionMorePanel({
  open,
  isWorking,
  theme,
  viewMode,
  isSequentialActive,
  sourceBookId,
  embedded,
  onPostpone,
  onThemeChange,
  onToggleViewMode,
  onOpenCompleteChapter,
  onArchive,
  onSkipChapter,
  onBackToLibrary
}: IRSessionMorePanelProps) {
  if (!open) return null
  const busyStyle = isWorking ? { opacity: 0.5, pointerEvents: "none" as const } : undefined

  return (
    <div className="ir-reading__more" style={{ padding: "6px 12px" }}>
      <Button
        tabIndex={0}
        variant="plain"
        onClick={() => {
          if (isWorking) return
          onPostpone()
        }}
        style={busyStyle}
        title="推后 Shift+Enter"
      >
        推后…
      </Button>
      <span style={{ fontSize: 12, color: "var(--orca-color-text-3)" }}>
        主题模式
      </span>
      <Button
        tabIndex={0}
        variant={theme === "mint" ? "solid" : "plain"}
        onClick={() => onThemeChange("mint")}
        style={{ gridColumn: "span 1", fontSize: 11, padding: "4px 0" }}
      >
        绿茶
      </Button>
      <Button
        tabIndex={0}
        variant={theme === "sepia" ? "solid" : "plain"}
        onClick={() => onThemeChange("sepia")}
        style={{ gridColumn: "span 1", fontSize: 11, padding: "4px 0" }}
      >
        书卷
      </Button>
      <Button
        tabIndex={0}
        variant={theme === "academic" ? "solid" : "plain"}
        onClick={() => onThemeChange("academic")}
        style={{ gridColumn: "span 1", fontSize: 11, padding: "4px 0" }}
      >
        文献
      </Button>
      <Button
        tabIndex={0}
        variant="plain"
        onClick={onToggleViewMode}
        aria-label={viewMode === "reading" ? "编辑模式" : "阅读模式"}
        title={viewMode === "reading" ? "编辑模式" : "阅读模式"}
      >
        {viewMode === "reading" ? "编辑模式" : "阅读模式"}
      </Button>
      {isSequentialActive ? (
        <Button
          tabIndex={0}
          variant="plain"
          onClick={() => {
            if (isWorking) return
            onOpenCompleteChapter()
          }}
          style={busyStyle}
        >
          完成本章
        </Button>
      ) : (
        <ConfirmBox
          text="确认归档？将清除 IR 身份并保留正文。"
          onConfirm={async (_e: unknown, close: () => void) => {
            await onArchive()
            close()
          }}
        >
          {(open: (e: React.UIEvent, state?: unknown) => void) => (
            <Button tabIndex={0} variant="plain" onClick={open}>
              {sourceBookId != null ? "完成本章" : "归档"}
            </Button>
          )}
        </ConfirmBox>
      )}
      {isSequentialActive ? (
        <ConfirmBox
          text="确认跳过本章并继续？与「完成」结果不同，但同样会解锁下一章并保留笔记。下一章默认安排到今天。"
          onConfirm={async (_e: unknown, close: () => void) => {
            await onSkipChapter()
            close()
          }}
        >
          {(open: (e: React.UIEvent, state?: unknown) => void) => (
            <Button tabIndex={0} variant="plain" onClick={open}>跳过本章并继续</Button>
          )}
        </ConfirmBox>
      ) : null}
      {embedded && onBackToLibrary ? (
        <Button tabIndex={0} variant="plain" onClick={onBackToLibrary}>返回资料库</Button>
      ) : null}
    </div>
  )
}
