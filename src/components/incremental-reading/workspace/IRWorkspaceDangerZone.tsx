const { Button, ConfirmBox } = orca.components

type Props = {
  isResetting: boolean
  onReset: () => Promise<void>
}

export default function IRWorkspaceDangerZone({ isResetting, onReset }: Props) {
  return (
    <div className="ir-drawer__danger">
      <div className="ir-drawer__section-title ir-drawer__section-title--danger">
        危险操作
      </div>
      <div className="ir-drawer__hint">
        清空会移除 Topic/Extract 的 #card 与 srs.* / ir.*，不可撤销。
      </div>
      <ConfirmBox
        text="确认清空所有 Topic/Extracts 的渐进阅读信息吗？（不可撤销）"
        onConfirm={async (_event: unknown, close: () => void) => {
          await onReset()
          close()
        }}
      >
        {(openConfirm) => (
          <Button
            variant="outline"
            onClick={openConfirm}
            style={isResetting ? { opacity: 0.6, pointerEvents: "none" as const } : undefined}
          >
            {isResetting ? "清理中…" : "清空 IR 数据"}
          </Button>
        )}
      </ConfirmBox>
    </div>
  )
}
