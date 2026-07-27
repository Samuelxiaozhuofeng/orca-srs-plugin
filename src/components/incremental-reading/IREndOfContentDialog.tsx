/**
 * 读到文末的「下一篇」确认门闩。
 * 主推「以后再复习」（仍走现有下一篇），次推「完成，移出队列」（走现有完成主路径，另有二次确认）。
 */

import {
  END_OF_CONTENT_CANCEL_LABEL,
  END_OF_CONTENT_COMPLETE_LABEL,
  END_OF_CONTENT_LATER_LABEL,
  formatEndOfContentCompleteHint,
  formatEndOfContentLaterHint,
  formatEndOfContentTitle
} from "../../srs/incremental-reading/irEndOfContentGate"

const { Button, ModalOverlay } = orca.components

type Props = {
  open: boolean
  isWorking?: boolean
  isSequentialActive?: boolean
  onClose: () => void
  onLater: () => void
  onComplete: () => void
}

export default function IREndOfContentDialog({
  open,
  isWorking,
  isSequentialActive = false,
  onClose,
  onLater,
  onComplete
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
        <div className="ir-dialog__title">{formatEndOfContentTitle()}</div>
        <div className="ir-dialog__text">
          {formatEndOfContentLaterHint(isSequentialActive)}
        </div>
        <div className="ir-dialog__text">
          {formatEndOfContentCompleteHint(isSequentialActive)}
        </div>
        <div className="ir-dialog__actions">
          <Button
            tabIndex={0}
            variant="plain"
            onClick={() => {
              if (isWorking) return
              onClose()
            }}
            className={busyClassName}
          >
            {END_OF_CONTENT_CANCEL_LABEL}
          </Button>
          <Button
            tabIndex={0}
            variant="outline"
            onClick={() => {
              if (isWorking) return
              onComplete()
            }}
            className={busyClassName}
          >
            {END_OF_CONTENT_COMPLETE_LABEL}
          </Button>
          <Button
            tabIndex={0}
            variant="solid"
            onClick={() => {
              if (isWorking) return
              onLater()
            }}
            className={busyClassName}
          >
            {isWorking ? "处理中…" : END_OF_CONTENT_LATER_LABEL}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
