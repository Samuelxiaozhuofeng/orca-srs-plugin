const { Button, ModalOverlay } = orca.components

export default function ReviewSessionEmptyView({
  inSidePanel,
  onClose
}: {
  inSidePanel: boolean
  onClose: () => void
}) {
  const content = (
    <div style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      maxWidth: "480px",
      width: "100%",
      textAlign: "center",
      boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
    }}>
      <h3 style={{ marginBottom: "12px" }}>今天没有到期或新卡</h3>
      <div style={{ color: "var(--orca-color-text-2)", marginBottom: "20px" }}>
        请先创建或等待卡片到期，然后再次开始复习
      </div>
      <Button variant="solid" onClick={onClose}>关闭</Button>
    </div>
  )

  if (inSidePanel) {
    return (
      <div style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}>
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
