/**
 * 推后时间选择（次级菜单）
 */

const { Button } = orca.components

export type PostponeChoice = "soon" | "week" | "later"

type Props = {
  open: boolean
  isWorking?: boolean
  onChoose: (choice: PostponeChoice) => void
  onClose: () => void
}

const LABELS: Record<PostponeChoice, string> = {
  soon: "稍后（1–2 天）",
  week: "本周（3–5 天）",
  later: "更久（7–14 天）"
}

export default function IRPostponeMenu({ open, isWorking, onChoose, onClose }: Props) {
  if (!open) return null
  const style = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined

  return (
    <div style={{
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
      padding: "8px",
      border: "1px solid var(--orca-color-border-1)",
      borderRadius: "8px",
      background: "var(--orca-color-bg-2)"
    }}>
      {(Object.keys(LABELS) as PostponeChoice[]).map(key => (
        <Button key={key} variant="plain" style={style} onClick={() => onChoose(key)}>
          {LABELS[key]}
        </Button>
      ))}
      <Button variant="outline" onClick={onClose}>取消</Button>
    </div>
  )
}
