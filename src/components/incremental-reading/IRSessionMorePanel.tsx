/**
 * 「更多操作」次级面板：只保留推后、主题、正文宽度、编辑模式等；完成已在主栏。
 * 重要性主路径在动作栏；推后保留在此 + Shift+Enter。
 */

import type { IRReaderTheme } from "./irReaderThemeStorage"
import {
  IR_READER_WIDTH_MAX,
  IR_READER_WIDTH_MIN,
  IR_READER_WIDTH_PRESETS,
  parseIRReaderWidthDraft
} from "./irReaderWidthStorage"

const { useEffect, useState } = window.React
const { Button } = orca.components

export type IRSessionMorePanelProps = {
  open: boolean
  isWorking?: boolean
  /** Extract 会话时显示问答/方向转化 */
  isTopic?: boolean
  theme: IRReaderTheme
  contentWidth: number
  viewMode: "reading" | "edit"
  embedded?: boolean
  onPostpone: () => void
  onConvertToQA?: () => void
  onConvertToDirection?: () => void
  onThemeChange: (theme: IRReaderTheme) => void
  onContentWidthChange: (width: number) => void
  onToggleViewMode: () => void
  onBackToLibrary?: () => void
}

export default function IRSessionMorePanel({
  open,
  isWorking,
  isTopic = false,
  theme,
  contentWidth,
  viewMode,
  embedded,
  onPostpone,
  onConvertToQA,
  onConvertToDirection,
  onThemeChange,
  onContentWidthChange,
  onToggleViewMode,
  onBackToLibrary
}: IRSessionMorePanelProps) {
  const [draftWidth, setDraftWidth] = useState(String(contentWidth))

  useEffect(() => {
    setDraftWidth(String(contentWidth))
  }, [contentWidth, open])

  if (!open) return null
  const busyStyle = isWorking ? { opacity: 0.5, pointerEvents: "none" as const } : undefined

  const commitDraft = () => {
    if (isWorking) return
    // Number("") === 0 → would wrongly clamp to 480; blank/invalid restores current
    const next = parseIRReaderWidthDraft(draftWidth)
    if (next == null) {
      setDraftWidth(String(contentWidth))
      return
    }
    setDraftWidth(String(next))
    if (next !== contentWidth) onContentWidthChange(next)
  }

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
      {!isTopic && onConvertToQA ? (
        <Button
          tabIndex={0}
          variant="plain"
          onClick={() => {
            if (isWorking) return
            onConvertToQA()
          }}
          style={busyStyle}
          title="将摘录转为问答卡（正文为题、首个子块为答案）"
          aria-label="转为问答卡"
        >
          问答
        </Button>
      ) : null}
      {!isTopic && onConvertToDirection ? (
        <Button
          tabIndex={0}
          variant="plain"
          onClick={() => {
            if (isWorking) return
            onConvertToDirection()
          }}
          style={busyStyle}
          title="在光标处分隔，转为正向方向卡"
          aria-label="转为方向卡"
        >
          方向
        </Button>
      ) : null}
      <span className="ir-reading__more-label">主题模式</span>
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
      <span className="ir-reading__more-label">正文宽度</span>
      {IR_READER_WIDTH_PRESETS.map((px) => (
        <Button
          key={px}
          tabIndex={0}
          variant={contentWidth === px ? "solid" : "plain"}
          onClick={() => {
            if (isWorking) return
            setDraftWidth(String(px))
            onContentWidthChange(px)
          }}
          style={{ gridColumn: "span 1", fontSize: 11, padding: "4px 0", ...busyStyle }}
          title={`正文最大宽度 ${px}px`}
          aria-label={`正文宽度 ${px}`}
          aria-pressed={contentWidth === px}
        >
          {px}
        </Button>
      ))}
      <div className="ir-reading__more-width-custom" style={busyStyle}>
        <input
          type="number"
          min={IR_READER_WIDTH_MIN}
          max={IR_READER_WIDTH_MAX}
          step={10}
          value={draftWidth}
          disabled={!!isWorking}
          aria-disabled={isWorking ? true : undefined}
          aria-label="自定义正文宽度"
          title={`自定义宽度 ${IR_READER_WIDTH_MIN}–${IR_READER_WIDTH_MAX}px`}
          onChange={(e) => setDraftWidth(e.currentTarget.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commitDraft()
              ;(e.currentTarget as HTMLInputElement).blur()
            }
          }}
        />
        <span>px</span>
      </div>
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
