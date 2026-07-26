const { Button, ModalOverlay } = orca.components

export default function ReviewSessionEmptyView({
  inSidePanel,
  onClose
}: {
  inSidePanel: boolean
  onClose: () => void
}) {
  const content = (
    <div className="srs-review-empty">
      <h3 className="srs-review-empty__title">今天没有到期或新卡</h3>
      <div className="srs-review-empty__hint">
        请先创建或等待卡片到期，然后再次开始复习
      </div>
      <Button variant="solid" onClick={onClose} className="srs-review-cta">关闭</Button>
    </div>
  )

  if (inSidePanel) {
    return (
      <div className="srs-review-center">
        {content}
      </div>
    )
  }

  return (
    <ModalOverlay visible={true} canClose={true} onClose={onClose}>
      {content}
    </ModalOverlay>
  )
}
