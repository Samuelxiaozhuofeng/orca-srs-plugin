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

  const busyClassName = isWorking ? "ir-button--blocked" : undefined

  return (
    <ModalOverlay
      visible={true}
      canClose={!isWorking}
      onClose={() => {
        if (isWorking) return
        onClose()
      }}
    >
      <div className="ir-dialog">
        <div className="ir-dialog__title">
          完成
        </div>
        <div className="ir-dialog__text">
          将退出阅读队列并保留正文与已有卡片。
        </div>
        <div className="ir-dialog__actions">
          <Button
            tabIndex={0}
            variant="outline"
            onClick={() => {
              if (isWorking) return
              onClose()
            }}
            className={busyClassName}
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
            className={busyClassName}
          >
            {isWorking ? "处理中…" : "完成"}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
