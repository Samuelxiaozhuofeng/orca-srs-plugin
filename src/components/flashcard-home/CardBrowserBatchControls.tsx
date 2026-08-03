/** 卡片浏览器批量管理条、确认文案、选择提示与结果告警。 */

const { Button, ConfirmBox } = orca.components

export type CardManageBatchBarProps = {
  selectedCount: number
  uniqueBlockCount: number
  filteredCount: number
  batchBusy: boolean
  deckTargetDraft: string
  onDeckTargetChange: (value: string) => void
  /** 改牌组目标：全库已有牌组（含 Default） */
  changeDeckOptions: string[]
  suspendConfirmText: string
  resetConfirmText: string
  changeDeckConfirmText: string
  onSelectAll: () => void
  onClearSelection: () => void
  onSuspend: () => void
  onActivate: () => void
  onReset: () => void
  onChangeDeck: () => void
}

export function CardManageBatchBar(props: CardManageBatchBarProps) {
  const {
    selectedCount,
    uniqueBlockCount,
    filteredCount,
    batchBusy,
    deckTargetDraft,
    onDeckTargetChange,
    changeDeckOptions,
    suspendConfirmText,
    resetConfirmText,
    changeDeckConfirmText,
    onSelectAll,
    onClearSelection,
    onSuspend,
    onActivate,
    onReset,
    onChangeDeck
  } = props

  if (selectedCount === 0) return null

  return (
    <div className="srs-card-manage-bar" role="region" aria-label="批量管理">
      <div className="srs-card-manage-bar__stats">
        已选 {selectedCount} 张
        {uniqueBlockCount !== selectedCount
          ? `（${uniqueBlockCount} 个块）`
          : ""}
        {" · 当前筛选 "}
        {filteredCount} 张
      </div>
      <div className="srs-card-manage-bar__actions">
        <Button variant="plain" onClick={batchBusy ? undefined : onSelectAll}>
          全选筛选结果
        </Button>
        <Button variant="plain" onClick={batchBusy ? undefined : onClearSelection}>
          清空
        </Button>

        <ConfirmBox
          text={suspendConfirmText}
          onConfirm={(_e: unknown, close: () => void) => {
            close()
            onSuspend()
          }}
        >
          {(open) => (
            <Button
              variant="outline"
              onClick={(e: React.MouseEvent) => {
                if (batchBusy) return
                open(e)
              }}
              className={batchBusy ? "srs-btn-disabled" : undefined}
            >
              <i className="ti ti-player-pause" aria-hidden="true" /> 暂停
            </Button>
          )}
        </ConfirmBox>

        <Button
          variant="outline"
          onClick={batchBusy ? undefined : onActivate}
          className={batchBusy ? "srs-btn-disabled" : undefined}
        >
          <i className="ti ti-player-play" aria-hidden="true" /> 激活
        </Button>

        <ConfirmBox
          text={resetConfirmText}
          onConfirm={(_e: unknown, close: () => void) => {
            close()
            onReset()
          }}
        >
          {(open) => (
            <Button
              variant="outline"
              onClick={(e: React.MouseEvent) => {
                if (batchBusy) return
                open(e)
              }}
              className={`srs-card-action--warn${batchBusy ? " srs-btn-disabled" : ""}`}
            >
              <i className="ti ti-refresh" aria-hidden="true" /> 重置
            </Button>
          )}
        </ConfirmBox>

        <label className="srs-card-manage-bar__deck">
          <span className="srs-card-browser-toolbar__label">改牌组</span>
          <select
            value={deckTargetDraft}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onDeckTargetChange(e.target.value)
            }
            disabled={batchBusy}
          >
            <option value="">选择现有牌组…</option>
            {changeDeckOptions.map((deckName: string) => (
              <option key={deckName} value={deckName}>
                {deckName}
              </option>
            ))}
          </select>
        </label>

        <ConfirmBox
          text={changeDeckConfirmText || "请先选择目标牌组"}
          onConfirm={(_e: unknown, close: () => void) => {
            close()
            if (deckTargetDraft.trim()) onChangeDeck()
          }}
        >
          {(open) => (
            <Button
              variant="solid"
              onClick={(e: React.MouseEvent) => {
                if (batchBusy || !deckTargetDraft.trim()) return
                open(e)
              }}
              className={
                batchBusy || !deckTargetDraft.trim()
                  ? "srs-btn-disabled"
                  : undefined
              }
            >
              <i className="ti ti-folder" aria-hidden="true" /> 应用牌组
            </Button>
          )}
        </ConfirmBox>
      </div>
      {batchBusy && (
        <div className="srs-card-manage-bar__busy">正在执行批量操作…</div>
      )}
    </div>
  )
}

export function buildManageConfirmTexts(args: {
  selectedCount: number
  uniqueBlockCount: number
  deckTarget: string
}): {
  suspendConfirmText: string
  resetConfirmText: string
  changeDeckConfirmText: string
} {
  const { selectedCount, uniqueBlockCount, deckTarget } = args
  if (selectedCount === 0) {
    return {
      suspendConfirmText: "",
      resetConfirmText: "",
      changeDeckConfirmText: ""
    }
  }
  return {
    suspendConfirmText: `确定暂停选中的 ${selectedCount} 张卡片？暂停后它们不再进入正常复习队列。`,
    resetConfirmText: `确定将选中的 ${selectedCount} 张卡片重置为新卡？进度会丢失，且不可撤销。`,
    changeDeckConfirmText: !deckTarget.trim()
      ? ""
      : `确定将选中的 ${selectedCount} 张卡（涉及 ${uniqueBlockCount} 个块）的牌组改为「${deckTarget}」？\n牌组是块级字段：同一块上的所有变体会一起变更。`
  }
}

export type CardSelectHintProps = {
  filteredCount: number
  batchBusy: boolean
  onSelectAll: () => void
}

export function CardSelectHint({
  filteredCount,
  batchBusy,
  onSelectAll
}: CardSelectHintProps) {
  if (filteredCount === 0) return null
  return (
    <div className="srs-card-list-view__select-hint">
      <Button
        variant="plain"
        onClick={batchBusy ? undefined : onSelectAll}
        className={batchBusy ? "srs-btn-disabled" : undefined}
      >
        全选筛选结果（{filteredCount}）
      </Button>
    </div>
  )
}

export type CardBatchAlertProps = {
  message: string | null
  onDismiss?: () => void
}

/** 独立 alert：不依赖 selectedCount，partial 失败后仍可见。 */
export function CardBatchAlert({ message, onDismiss }: CardBatchAlertProps) {
  if (!message) return null
  return (
    <div className="srs-card-batch-alert" role="alert">
      <div className="srs-card-batch-alert__body">{message}</div>
      {onDismiss && (
        <Button
          variant="plain"
          className="srs-card-batch-alert__dismiss"
          onClick={onDismiss}
        >
          关闭
        </Button>
      )}
    </div>
  )
}
