import { DEFAULT_IR_PRIORITY } from "../srs/incremental-reading/irImportance"
import IRImportanceSetupField from "./incremental-reading/IRImportanceSetupField"

const { useState, useMemo, useCallback } = window.React
const { ModalOverlay, Button } = orca.components

type IRBookSetupDialogProps = {
  chapterCount: number
  bookTitle: string
  onConfirm: (priority: number, totalDays: number) => void | Promise<void>
  onCancel: () => void
}

function clampInteger(value: number, min: number): number {
  if (!Number.isFinite(value)) return min
  const rounded = Math.round(value)
  return rounded < min ? min : rounded
}

export default function IRBookSetupDialog({
  chapterCount,
  bookTitle,
  onConfirm,
  onCancel
}: IRBookSetupDialogProps) {
  const minDays = useMemo(() => {
    const normalized = Math.max(1, Math.round(chapterCount))
    return normalized
  }, [chapterCount])

  const [priority, setPriority] = useState<number>(DEFAULT_IR_PRIORITY)
  const [totalDaysInput, setTotalDaysInput] = useState<number>(() => minDays * 2)
  const [isWorking, setIsWorking] = useState(false)

  const totalDays = useMemo(() => clampInteger(totalDaysInput, minDays), [totalDaysInput, minDays])

  const schedulePreview = useMemo(() => {
    const chapters = Math.max(1, Math.round(chapterCount))
    const intervalDays = Math.max(1, Math.round(totalDays / chapters))
    return `每 ${intervalDays} 天推送 1 个章节`
  }, [chapterCount, totalDays])

  const handleConfirm = useCallback(async () => {
    if (isWorking) return

    setIsWorking(true)
    try {
      await onConfirm(priority, totalDays)
    } finally {
      setIsWorking(false)
    }
  }, [isWorking, onConfirm, priority, totalDays])

  const dialogStyle: React.CSSProperties = {
    width: "min(560px, calc(100vw - 32px))",
    maxHeight: "min(80vh, 720px)",
    overflowY: "auto",
    backgroundColor: "var(--orca-color-bg-1)",
    border: "1px solid var(--orca-color-border-1)",
    borderRadius: "12px",
    padding: "20px",
    color: "var(--orca-color-text-1)",
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
    fontWeight: 600,
    letterSpacing: "0.02em"
  }

  const inputBaseStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid var(--orca-color-border-1)",
    backgroundColor: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: "14px",
    outline: "none"
  }

  const actionStyle = (disabled: boolean) => disabled
    ? { opacity: 0.5, pointerEvents: "none" as const }
    : undefined

  return (
    <ModalOverlay visible={true} canClose={!isWorking} onClose={onCancel}>
      <div style={dialogStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--orca-color-text-1)" }}>
              📚 创建渐进阅读书籍
            </h2>
            <div style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>
              检测到 <span style={{ color: "var(--orca-color-primary-6)", fontWeight: 700 }}>{Math.max(0, chapterCount)}</span> 个章节
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (isWorking) return
              onCancel()
            }}
            style={actionStyle(isWorking)}
          >
            关闭
          </Button>
        </div>

        <div style={{
          border: "1px solid var(--orca-color-border-1)",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "12px",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "6px"
        }}>
          <div style={labelStyle}>书名</div>
          <div style={{
            fontSize: "14px",
            color: "var(--orca-color-text-1)",
            fontWeight: 600,
            lineHeight: 1.4,
            wordBreak: "break-word"
          }}>
            {bookTitle || "(未命名)"}
          </div>
        </div>

        <IRImportanceSetupField
          valuePriority={priority}
          onChange={setPriority}
          disabled={isWorking}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={labelStyle}>计划天数</div>
          <input
            type="number"
            min={minDays}
            value={totalDaysInput}
            disabled={isWorking}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const next = Number(event.currentTarget.value)
              if (!Number.isFinite(next)) return
              setTotalDaysInput(next)
            }}
            style={inputBaseStyle}
          />
          <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }}>
            最少 {minDays} 天（每章至少留出 1 天）。重要性影响进队与再推节奏，不改变总天数跨度。
          </div>
        </div>

        <div style={{
          border: "1px dashed var(--orca-color-border-1)",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "12px",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "6px"
        }}>
          <div style={labelStyle}>推送预览</div>
          <div style={{ fontSize: "14px", color: "var(--orca-color-text-1)", fontWeight: 600 }}>
            {schedulePreview}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "4px" }}>
          <Button
            variant="outline"
            onClick={() => {
              if (isWorking) return
              onCancel()
            }}
            style={actionStyle(isWorking)}
          >
            取消
          </Button>
          <Button
            variant="solid"
            onClick={() => {
              void handleConfirm()
            }}
            style={actionStyle(isWorking)}
          >
            {isWorking ? "创建中..." : "确认创建"}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
