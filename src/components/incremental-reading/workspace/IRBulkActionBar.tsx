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
  /** 当前筛选的来源书 id（数字字符串），用于整本移出入口 */
  filteredSourceBookId?: string | null
  onRemoveSourceBook?: (bookBlockId: number) => Promise<void>
}

export default function IRBulkActionBar({
  selectedCount,
  candidateBatchId,
  isBatchRemoving,
  onSelectBatch,
  onClearSelection,
  onBatchRemove,
  filteredSourceBookId,
  onRemoveSourceBook
}: Props) {
  const sourceBookNumeric =
    filteredSourceBookId
    && filteredSourceBookId !== "all"
    && filteredSourceBookId !== "none"
      ? Number(filteredSourceBookId)
      : NaN
  const canRemoveSourceBook =
    Number.isFinite(sourceBookNumeric) && typeof onRemoveSourceBook === "function"

  if (selectedCount <= 0 && !canRemoveSourceBook) return null

  return (
    <div className="ir-bulk-bar" role="region" aria-label="批量操作">
      <div>
        <div className="ir-bulk-bar__label">
          {selectedCount > 0 ? `已选 ${selectedCount} 张` : "来源书操作"}
        </div>
        <div className="ir-bulk-bar__hint">
          移出保留原块内容、图片与引用，只移除 #card 与 srs.* / ir.*；不删除 epub.*
        </div>
      </div>
      <div className="ir-bulk-bar__actions">
        {canRemoveSourceBook ? (
          <Button
            tabIndex={0}
            variant="outline"
            onClick={() => void onRemoveSourceBook!(sourceBookNumeric)}
            title="整本移出渐进阅读"
          >
            整本移出来源书
          </Button>
        ) : null}
        {selectedCount > 0 && candidateBatchId ? (
          <Button tabIndex={0} variant="outline" onClick={() => onSelectBatch(candidateBatchId)}>
            选中同批次
          </Button>
        ) : null}
        {selectedCount > 0 ? (
          <Button tabIndex={0} variant="plain" onClick={onClearSelection}>
            清空选择
          </Button>
        ) : null}
        {selectedCount > 0 ? (
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
        ) : null}
      </div>
    </div>
  )
}
