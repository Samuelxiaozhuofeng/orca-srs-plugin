/**
 * 顺序解锁「完成本章」对话框：选择下一章 today / tomorrow
 */

const { Button, ModalOverlay } = orca.components

type Props = {
  open: boolean
  isWorking: boolean
  onClose: () => void
  onConfirmToday: () => void
  onConfirmTomorrow: () => void
}

export default function IRCompleteChapterDialog({
  open,
  isWorking,
  onClose,
  onConfirmToday,
  onConfirmTomorrow
}: Props) {
  if (!open) return null

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
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--orca-color-text-2)" }}>
          当前章节将标记为<strong>已完成</strong>，并清除其 IR 身份（正文与笔记保留）。
          若还有下一章，请选择如何安排：
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "var(--orca-color-text-2)" }}>
          <li><strong>今天安排下一章</strong>：下一章 due 为今天，立即进入今日 IR 队列。</li>
          <li><strong>明天安排下一章</strong>：下一章写入计划为当前激活章，但 due 从明天起，今日不作为到期卡。</li>
        </ul>
        <div style={{ fontSize: 12, color: "var(--orca-color-text-3)", lineHeight: 1.45 }}>
          取消不会清理当前章节，也不会解锁下一章。若无下一章，完成本章后书籍计划正常结束。
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <Button
            tabIndex={0}
            variant="outline"
            onClick={() => {
              if (isWorking) return
              onClose()
            }}
            style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
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
            style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
          >
            {isWorking ? "处理中…" : "明天安排下一章"}
          </Button>
          <Button
            tabIndex={0}
            variant="solid"
            onClick={() => {
              if (isWorking) return
              onConfirmToday()
            }}
            style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
          >
            {isWorking ? "处理中…" : "今天安排下一章"}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
