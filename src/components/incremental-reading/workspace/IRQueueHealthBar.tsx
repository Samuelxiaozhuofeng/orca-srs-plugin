const { Button, ConfirmBox } = orca.components

type Props = {
  dailyLimit: number
  totalDueCount: number
  overflowCount: number
  actionEnabled: boolean
  isDeferring: boolean
  onDeferOverflow: () => Promise<void>
}

export default function IRQueueHealthBar({
  dailyLimit,
  totalDueCount,
  overflowCount,
  actionEnabled,
  isDeferring,
  onDeferOverflow
}: Props) {
  if (dailyLimit <= 0 || overflowCount <= 0) return null

  return (
    <div className="ir-queue-health" role="status">
      <span>
        今日候选 <strong>{totalDueCount}</strong> · 上限 <strong>{dailyLimit}</strong> ·
        溢出 <strong>{overflowCount}</strong>
      </span>
      {actionEnabled ? (
        <ConfirmBox
          text={`确认把未进入今日队列的 ${overflowCount} 张卡片推后吗？该操作会修改排期。`}
          onConfirm={async (_event: unknown, close: () => void) => {
            await onDeferOverflow()
            close()
          }}
        >
          {(open) => (
            <Button
              variant="plain"
              onClick={open}
              style={isDeferring ? { opacity: 0.6, pointerEvents: "none" as const } : undefined}
            >
              {isDeferring ? "处理中…" : "推后溢出"}
            </Button>
          )}
        </ConfirmBox>
      ) : null}
    </div>
  )
}
