/**
 * 资料库批量操作固定栏
 */

const { Button, ConfirmBox } = orca.components

type Props = {
  selectedCount: number
  candidateBatchId: string | null
  isBatchRemoving: boolean
  onSelectBatch: (batchId: string) => void
  onClearSelection: () => void
  onBatchRemove: () => Promise<void>
}

export default function IRBulkActionBar({
  selectedCount,
  candidateBatchId,
  isBatchRemoving,
  onSelectBatch,
  onClearSelection,
  onBatchRemove
}: Props) {
  if (selectedCount <= 0) return null

  return (
    <div className="ir-bulk-bar" role="region" aria-label="批量操作">
      <div>
        <div className="ir-bulk-bar__label">已选 {selectedCount} 张</div>
        <div className="ir-bulk-bar__hint">
          批量移出保留原块内容，只移除 #card 与 srs.* / ir.*
        </div>
      </div>
      <div className="ir-bulk-bar__actions">
        {candidateBatchId ? (
          <Button tabIndex={0} variant="outline" onClick={() => onSelectBatch(candidateBatchId)}>
            选中同批次
          </Button>
        ) : null}
        <Button tabIndex={0} variant="plain" onClick={onClearSelection}>
          清空选择
        </Button>
        <ConfirmBox
          text={`确认将已选的 ${selectedCount} 张卡片移出渐进阅读吗？这会保留原始块内容，但会移除 #card 及 srs.* / ir.*。`}
          onConfirm={async (_e: unknown, close: () => void) => {
            await onBatchRemove()
            close()
          }}
        >
          {(open) => (
            <Button
              tabIndex={0}
              variant="solid"
              onClick={isBatchRemoving ? undefined : open}
              aria-disabled={isBatchRemoving}
              className={isBatchRemoving ? "ir-button--busy" : undefined}
            >
              {isBatchRemoving ? "处理中..." : "批量移出"}
            </Button>
          )}
        </ConfirmBox>
      </div>
    </div>
  )
}
