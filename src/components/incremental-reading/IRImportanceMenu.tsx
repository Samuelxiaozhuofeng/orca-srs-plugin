/**
 * 重要性次级菜单：相对微调（降/升/设回正常）
 */

import type { ImportanceNudgeDirection } from "../../srs/incremental-reading/irImportance"
import { formatImportanceTierLabelFromPriority } from "../../srs/incremental-reading/irImportance"

const { Button } = orca.components

export type IRImportanceMenuProps = {
  open: boolean
  isWorking?: boolean
  currentPriority: number
  onChoose: (direction: ImportanceNudgeDirection) => void
  onClose: () => void
}

const OPTIONS: Array<{ key: ImportanceNudgeDirection; label: string }> = [
  { key: "down", label: "没那么重要了" },
  { key: "up", label: "更重要了" },
  { key: "reset", label: "设回「正常」" }
]

export default function IRImportanceMenu({
  open,
  isWorking,
  currentPriority,
  onChoose,
  onClose
}: IRImportanceMenuProps) {
  if (!open) return null
  const style = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined
  const currentLabel = formatImportanceTierLabelFromPriority(currentPriority)

  return (
    <div className="ir-reading__importance" role="menu" aria-label="调整重要性">
      <span className="ir-reading__importance-current">
        当前：{currentLabel}
      </span>
      {OPTIONS.map(({ key, label }) => (
        <Button
          key={key}
          variant="plain"
          style={style}
          onClick={() => onChoose(key)}
          aria-label={label}
        >
          {label}
        </Button>
      ))}
      <Button variant="outline" onClick={onClose}>取消</Button>
    </div>
  )
}
