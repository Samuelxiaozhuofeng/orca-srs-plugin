/**
 * 选区浮动工具栏：定位在选区附近，不占据文档流
 */

const { useEffect, useState } = window.React
const { Button } = orca.components

type Props = {
  visible: boolean
  isTopic: boolean
  isWorking?: boolean
  onExtract: () => void
  onCloze: () => void
  onQA?: () => void
  /** 限制定位参考容器；未传时相对视口 */
  containerRef?: { current: HTMLElement | null }
}

type ToolbarPos = { top: number; left: number }

function computePosition(container?: HTMLElement | null): ToolbarPos | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (container && !container.contains(range.commonAncestorContainer)) return null
  const rect = range.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) return null

  const toolbarWidth = 220
  const toolbarHeight = 40
  let top = rect.top - toolbarHeight - 8
  let left = rect.left + rect.width / 2 - toolbarWidth / 2

  if (top < 8) top = rect.bottom + 8
  left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8))
  top = Math.max(8, Math.min(top, window.innerHeight - toolbarHeight - 8))

  return { top, left }
}

export default function IRSelectionToolbar({
  visible,
  isTopic,
  isWorking,
  onExtract,
  onCloze,
  onQA,
  containerRef
}: Props) {
  const [pos, setPos] = useState<ToolbarPos | null>(null)

  useEffect(() => {
    if (!visible) {
      setPos(null)
      return
    }
    const update = () => setPos(computePosition(containerRef?.current ?? null))
    update()
    document.addEventListener("selectionchange", update)
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      document.removeEventListener("selectionchange", update)
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [visible, containerRef])

  if (!visible || !pos) return null
  const style = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined

  return (
    <div
      className="ir-selection-toolbar"
      role="toolbar"
      aria-label="选区操作"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(event: React.MouseEvent) => event.preventDefault()}
    >
      {isTopic ? (
        <Button variant="solid" style={style} onClick={onExtract} title="创建摘录">
          摘录 Alt+X
        </Button>
      ) : null}
      <Button variant="plain" style={style} onClick={onCloze} title="制成 Cloze">
        Cloze Alt+Z
      </Button>
      {onQA ? (
        <Button variant="plain" style={style} onClick={onQA} title="制成问答">
          Q&A
        </Button>
      ) : null}
    </div>
  )
}
