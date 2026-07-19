/**
 * 非顺序 / 摘录「完成」确认：退出阅读队列并保留正文与已有卡片。
 */

const { Button, ModalOverlay } = orca.components

type Props = {
  open: boolean
  isWorking?: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function IRArchiveConfirmDialog({
  open,
  isWorking,
  onClose,
  onConfirm
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
          完成
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--orca-color-text-2)" }}>
          将退出阅读队列并保留正文与已有卡片。
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
              onConfirm()
            }}
            style={busyStyle}
          >
            {isWorking ? "处理中…" : "完成"}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
