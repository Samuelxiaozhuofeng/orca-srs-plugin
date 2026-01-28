import type { Block, DbId } from "../orca.d.ts"
import type { IRCard } from "../srs/incrementalReadingCollector"
import {
  groupIRCardsByDate,
  IRDateGroupKey,
  IRCardGroup
} from "../srs/incrementalReadingManagerUtils"

const { useCallback, useEffect, useMemo, useState } = window.React
const { Button } = orca.components

/** 每个分组默认显示的卡片数量 */
const PAGE_SIZE = 20

type IRCardListProps = {
  cards: IRCard[]
  expandedGroups: Record<IRDateGroupKey, boolean>
  onCardClick: (cardId: DbId) => void
  onToggleGroup: (groupKey: IRDateGroupKey) => void
}

type GroupStyle = {
  borderColor: string
  labelColor: string
  labelBg: string
  itemBg?: string
  itemText?: string
}

const groupStyles: Record<IRDateGroupKey, GroupStyle> = {
  "已逾期": {
    borderColor: "var(--orca-color-danger-5)",
    labelColor: "var(--orca-color-danger-6)",
    labelBg: "var(--orca-color-danger-1)",
    itemBg: "var(--orca-color-bg-1)"
  },
  "今天": {
    borderColor: "var(--orca-color-warning-5)",
    labelColor: "var(--orca-color-warning-6)",
    labelBg: "var(--orca-color-warning-1)",
    itemBg: "var(--orca-color-bg-1)"
  },
  "明天": {
    borderColor: "var(--orca-color-warning-4)",
    labelColor: "var(--orca-color-warning-6)",
    labelBg: "var(--orca-color-warning-1)",
    itemBg: "var(--orca-color-warning-1)"
  },
  "未来7天": {
    borderColor: "var(--orca-color-border-1)",
    labelColor: "var(--orca-color-text-2)",
    labelBg: "var(--orca-color-bg-2)"
  },
  "新卡": {
    borderColor: "var(--orca-color-primary-4)",
    labelColor: "var(--orca-color-primary-6)",
    labelBg: "var(--orca-color-primary-1)"
  },
  "7天后": {
    borderColor: "var(--orca-color-border-1)",
    labelColor: "var(--orca-color-text-3)",
    labelBg: "var(--orca-color-bg-2)",
    itemText: "var(--orca-color-text-3)"
  }
}

function formatSimpleDate(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}-${day}`
}

function getBlockTitle(blockId: DbId, titleMap: Record<string, string>): string {
  const fromState = orca.state.blocks?.[blockId] as Block | undefined
  if (fromState?.text) return fromState.text
  return titleMap[blockId] ?? "(无标题)"
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

export default function IRCardList({
  cards,
  expandedGroups,
  onCardClick,
  onToggleGroup
}: IRCardListProps) {
  const [blockTitles, setBlockTitles] = useState<Record<string, string>>({})
  const [groupDisplayCounts, setGroupDisplayCounts] = useState<Record<IRDateGroupKey, number>>({} as Record<IRDateGroupKey, number>)

  const getDisplayCount = useCallback((groupKey: IRDateGroupKey) => {
    return groupDisplayCounts[groupKey] ?? PAGE_SIZE
  }, [groupDisplayCounts])

  const handleLoadMore = useCallback((groupKey: IRDateGroupKey) => {
    setGroupDisplayCounts((prev: Record<IRDateGroupKey, number>) => ({
      ...prev,
      [groupKey]: (prev[groupKey] ?? PAGE_SIZE) + PAGE_SIZE
    }))
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadMissingTitles = async () => {
      const missingIds = Array.from(new Set(
        cards
          .map(card => card.id)
          .filter(id => !blockTitles[id] && !(orca.state.blocks?.[id] as Block | undefined)?.text)
      ))

      if (missingIds.length === 0) return

      try {
        const results: Array<{ id: DbId; text: string }> = []
        const BATCH_SIZE = 200

        for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
          const batchIds = missingIds.slice(i, i + BATCH_SIZE)
          const blocks = await orca.invokeBackend("get-blocks", batchIds) as Block[] | undefined
          const fetched = new Map<DbId, Block>()
          for (const block of (blocks ?? [])) {
            fetched.set(block.id, block)
          }

          for (const id of batchIds) {
            const block = fetched.get(id)
            results.push({ id, text: block?.text || "(无标题)" })
          }
        }

        if (cancelled) return
        setBlockTitles((prev: Record<string, string>) => {
          const next = { ...prev }
          for (const result of results) {
            next[result.id] = result.text
          }
          return next
        })
      } catch (error) {
        console.warn("[IR Manager] 读取块标题失败:", error)
      }
    }

    void loadMissingTitles()

    return () => {
      cancelled = true
    }
  }, [cards, blockTitles])

  const groups = useMemo(() => groupIRCardsByDate(cards), [cards])

  if (groups.length === 0) {
    return (
      <div style={{
        padding: "24px",
        textAlign: "center",
        color: "var(--orca-color-text-3)"
      }}>
        暂无渐进阅读卡片
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {groups.map((group: IRCardGroup) => {
        const style = groupStyles[group.key]
        const isExpanded = expandedGroups[group.key]

        return (
          <div
            key={group.key}
            style={{
              border: `1px solid ${style.borderColor}`,
              borderRadius: "10px",
              padding: "12px",
              backgroundColor: "var(--orca-color-bg-1)"
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  padding: "2px 10px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: style.labelColor,
                  backgroundColor: style.labelBg
                }}>
                  {group.title}
                </span>
                <span style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
                  {group.cards.length} 张
                </span>
              </div>
              <Button
                variant="plain"
                onClick={() => onToggleGroup(group.key)}
                style={{ padding: "2px 8px" }}
              >
                <i className={`ti ${isExpanded ? "ti-chevron-down" : "ti-chevron-right"}`} />
              </Button>
            </div>

            {isExpanded && (() => {
              const displayCount = getDisplayCount(group.key)
              const visibleCards = group.cards.slice(0, displayCount)
              const hasMore = group.cards.length > displayCount
              const remaining = group.cards.length - displayCount

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                  {visibleCards.map(card => {
                    const title = truncateText(getBlockTitle(card.id, blockTitles), 50)

                    return (
                      <div
                        key={card.id}
                        onClick={() => onCardClick(card.id)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          border: `1px solid ${style.borderColor}`,
                          borderRadius: "8px",
                          padding: "10px",
                          backgroundColor: style.itemBg ?? "var(--orca-color-bg-1)",
                          color: style.itemText ?? "var(--orca-color-text-1)",
                          cursor: "pointer"
                        }}
                        title="点击在侧面板打开"
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: style.itemText ?? "var(--orca-color-text-1)"
                            }}
                          >
                            {title}
                          </div>
                          <div style={{
                            marginTop: "6px",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "12px",
                            fontSize: "12px",
                            color: style.itemText ?? "var(--orca-color-text-3)"
                          }}>
                            <span>类型：{card.cardType}</span>
                            <span>到期：{formatSimpleDate(card.due)}</span>
                            <span>已读：{card.readCount}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {hasMore && (
                    <Button
                      variant="plain"
                      onClick={() => handleLoadMore(group.key)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                        borderRadius: "6px",
                        border: "1px dashed var(--orca-color-border-2)",
                        color: "var(--orca-color-text-2)"
                      }}
                    >
                      加载更多（剩余 {remaining} 张）
                    </Button>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
