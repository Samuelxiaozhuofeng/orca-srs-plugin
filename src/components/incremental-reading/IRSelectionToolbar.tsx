/**
 * 选区浮动工具栏：摘录 / Cloze / Q&A 入口
 */

const { Button } = orca.components

type Props = {
  visible: boolean
  isTopic: boolean
  isWorking?: boolean
  onExtract: () => void
  onCloze: () => void
  onQA?: () => void
}

export default function IRSelectionToolbar({
  visible,
  isTopic,
  isWorking,
  onExtract,
  onCloze,
  onQA
}: Props) {
  if (!visible) return null
  const style = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined

  return (
    <div style={{
      display: "flex",
      gap: "6px",
      padding: "6px 8px",
      borderRadius: "8px",
      border: "1px solid var(--orca-color-border-1)",
      background: "var(--orca-color-bg-2)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
    }}>
      {isTopic ? (
        <Button variant="solid" style={style} onClick={onExtract}>摘录 Alt+X</Button>
      ) : null}
      <Button variant="plain" style={style} onClick={onCloze}>Cloze Alt+Z</Button>
      {onQA ? (
        <Button variant="plain" style={style} onClick={onQA}>Q&A</Button>
      ) : null}
    </div>
  )
}
