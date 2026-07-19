/**
 * 「更多操作」次级面板：只保留推后、主题、编辑模式等；完成已在主栏。
 * 重要性主路径在动作栏；推后保留在此 + Shift+Enter。
 */

import type { IRReaderTheme } from "./irReaderThemeStorage"

const { Button } = orca.components

export type IRSessionMorePanelProps = {
  open: boolean
  isWorking?: boolean
  theme: IRReaderTheme
  viewMode: "reading" | "edit"
  embedded?: boolean
  onPostpone: () => void
  onThemeChange: (theme: IRReaderTheme) => void
  onToggleViewMode: () => void
  onBackToLibrary?: () => void
}

export default function IRSessionMorePanel({
  open,
  isWorking,
  theme,
  viewMode,
  embedded,
  onPostpone,
  onThemeChange,
  onToggleViewMode,
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
      {embedded && onBackToLibrary ? (
        <Button tabIndex={0} variant="plain" onClick={onBackToLibrary}>返回资料库</Button>
      ) : null}
    </div>
  )
}
