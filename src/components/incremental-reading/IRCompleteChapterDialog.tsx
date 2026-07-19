/**
 * 顺序解锁「完成本章」对话框：有下一章时选今天/明天；最后一章仅确认完成。
 */

const { Button, ModalOverlay } = orca.components

type Props = {
  open: boolean
  isWorking: boolean
  /** false = 计划中最后一章；默认 true（兼容旧调用） */
  hasNextChapter?: boolean
  onClose: () => void
  onConfirmToday: () => void
  onConfirmTomorrow: () => void
}

export default function IRCompleteChapterDialog({
  open,
  isWorking,
  hasNextChapter = true,
  onClose,
  onConfirmToday,
  onConfirmTomorrow
}: Props) {
  if (!open) return null

  const busyStyle = isWorking ? { opacity: 0.5, pointerEvents: "none" as const } : undefined

  return (
    <ModalOverlay
      visible={true}
      canClose={!isWorking}
      onClose={() => {
        if (isWorking) return
        onClose()
      }}
    >
      <div
        style={{
          minWidth: 320,
          maxWidth: 420,
          padding: "18px 20px",
          borderRadius: 12,
          background: "var(--orca-color-bg-1)",
          border: "1px solid var(--orca-color-border-1)",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--orca-color-text-1)" }}>
          完成本章
        </div>
        {hasNextChapter ? (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--orca-color-text-2)" }}>
              本章会退出阅读队列（笔记保留）。下一章什么时候开始？
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <Button
                tabIndex={0}
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  onClose()
                }}
                style={busyStyle}
              >
                取消
              </Button>
              <Button
                tabIndex={0}
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  onConfirmTomorrow()
                }}
                style={busyStyle}
              >
                {isWorking ? "处理中…" : "明天"}
              </Button>
              <Button
                tabIndex={0}
                variant="solid"
                onClick={() => {
                  if (isWorking) return
                  onConfirmToday()
                }}
                style={busyStyle}
              >
                {isWorking ? "处理中…" : "今天"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--orca-color-text-2)" }}>
              这是计划中的最后一章。完成后，本书不再按顺序解锁。
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <Button
                tabIndex={0}
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  onClose()
                }}
                style={busyStyle}
              >
                取消
              </Button>
              <Button
                tabIndex={0}
                variant="solid"
                onClick={() => {
                  if (isWorking) return
                  onConfirmToday()
                }}
                style={busyStyle}
              >
                {isWorking ? "处理中…" : "完成"}
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  )
}
