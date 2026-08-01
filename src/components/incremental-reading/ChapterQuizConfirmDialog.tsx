/**
 * 章末小测确认：读完 / 更多菜单共用。
 */

import { CHAPTER_QUIZ_COPY } from "../../srs/incremental-reading/chapterQuiz"

const { Button, ModalOverlay } = orca.components

type Props = {
  open: boolean
  isWorking?: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function ChapterQuizConfirmDialog({
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
        <div className="ir-dialog__title">{CHAPTER_QUIZ_COPY.confirmTitle}</div>
        <div className="ir-dialog__text ir-dialog__text--preline">
          {CHAPTER_QUIZ_COPY.confirmBody}
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
            {CHAPTER_QUIZ_COPY.confirmCancel}
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
            {isWorking ? "处理中…" : CHAPTER_QUIZ_COPY.confirmStart}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
