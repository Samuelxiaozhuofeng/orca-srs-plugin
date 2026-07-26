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
          完成本章
        </div>
        {hasNextChapter ? (
          <>
            <div className="ir-dialog__text">
              本章会退出阅读队列（笔记保留）。下一章什么时候开始？
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
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  onConfirmTomorrow()
                }}
                className={busyClassName}
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
                className={busyClassName}
              >
                {isWorking ? "处理中…" : "今天"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="ir-dialog__text">
              这是计划中的最后一章。完成后，本书不再按顺序解锁。
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
                  onConfirmToday()
                }}
                className={busyClassName}
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
