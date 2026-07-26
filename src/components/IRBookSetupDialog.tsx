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

  const lockedClass = (disabled: boolean) =>
    disabled ? "srs-ui-locked" : undefined

  return (
    <ModalOverlay visible={true} canClose={!isWorking} onClose={onCancel}>
      <div className="srs-import-dialog srs-import-dialog--tall">
        <div className="srs-import-dialog__header">
          <div className="srs-import-dialog__header-text">
            <h2 className="srs-import-dialog__title">📚 创建渐进阅读书籍</h2>
            <div className="srs-import-dialog__subtitle">
              检测到{" "}
              <span className="srs-import-dialog__subtitle-strong">
                {Math.max(0, chapterCount)}
              </span>{" "}
              个章节
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (isWorking) return
              onCancel()
            }}
            className={lockedClass(isWorking)}
          >
            关闭
          </Button>
        </div>

        <div className="srs-import-dialog__tray">
          <div className="srs-import-dialog__label">书名</div>
          <div className="srs-import-dialog__tray-value">
            {bookTitle || "(未命名)"}
          </div>
        </div>

        <IRImportanceSetupField
          valuePriority={priority}
          onChange={setPriority}
          disabled={isWorking}
        />

        <div className="srs-import-dialog__field">
          <div className="srs-import-dialog__label">计划天数</div>
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
            className="srs-import-dialog__input srs-import-dialog__input--number"
          />
          <div className="srs-import-dialog__hint">
            最少 {minDays} 天（每章至少留出 1 天）。重要性影响进队与再推节奏，不改变总天数跨度。
          </div>
        </div>

        <div className="srs-import-dialog__tray srs-import-dialog__tray--dashed">
          <div className="srs-import-dialog__label">推送预览</div>
          <div className="srs-import-dialog__tray-value">{schedulePreview}</div>
        </div>

        <div className="srs-import-dialog__actions">
          <Button
            variant="outline"
            onClick={() => {
              if (isWorking) return
              onCancel()
            }}
            className={lockedClass(isWorking)}
          >
            取消
          </Button>
          <Button
            variant="solid"
            onClick={() => {
              void handleConfirm()
            }}
            className={lockedClass(isWorking)}
          >
            {isWorking ? "创建中..." : "确认创建"}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
