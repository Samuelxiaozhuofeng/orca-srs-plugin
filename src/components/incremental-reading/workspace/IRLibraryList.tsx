/**
 * 按日期分组的高密度资料库列表
 */

import type { DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import {
  type IRCardGroup,
  type IRDateGroupKey
} from "../../../srs/incrementalReadingManagerUtils"
import IRLibraryRow from "./IRLibraryRow"
import { groupSortedIRLibraryCards } from "./irLibraryFilters"
import { resolveBlockDisplayTitle } from "./resolveBlockDisplayTitle"

const { useMemo } = window.React

const FUTURE_GROUPS: IRDateGroupKey[] = ["明天", "未来7天", "新卡", "7天后"]
const PAGE_SIZE = 30

type Props = {
  cards: IRCard[]
  titleMap: Record<string, string>
  expandedGroups: Record<IRDateGroupKey, boolean>
  selectedCardIds: Set<DbId>
  advancingIds: Record<string, boolean>
  groupDisplayCounts: Record<string, number>
  listRef: { current: HTMLDivElement | null }
  now?: Date
  onToggleGroup: (key: IRDateGroupKey) => void
  onToggleCardSelection: (cardId: DbId) => void
  onToggleGroupSelection: (cardIds: DbId[]) => void
  onOpenDetails: (cardId: DbId) => void
  onStartReading: (cardId: DbId) => void
  onAdvanceLearn: (cardId: DbId) => void
  onLoadMore: (key: IRDateGroupKey) => void
}

function getTitle(cardId: DbId, titleMap: Record<string, string>): string {
  // titleMap 由 get-blocks 按 alias > text 刷新；不得再用 state.text 覆盖回旧编号
  const mapped = titleMap[String(cardId)]
  if (mapped) return mapped
  const fromState = orca.state.blocks?.[cardId] as { aliases?: string[]; text?: string } | undefined
  return resolveBlockDisplayTitle(fromState, `(#${cardId})`)
}

export default function IRLibraryList({
  cards,
  titleMap,
  expandedGroups,
  selectedCardIds,
  advancingIds,
  groupDisplayCounts,
  listRef,
  now = new Date(),
  onToggleGroup,
  onToggleCardSelection,
  onToggleGroupSelection,
  onOpenDetails,
  onStartReading,
  onAdvanceLearn,
  onLoadMore
}: Props) {
  const groups = useMemo(() => groupSortedIRLibraryCards(cards, now), [cards, now])

  if (groups.length === 0) {
    return (
      <div className="ir-library-scroll" ref={listRef}>
        <div className="ir-library-empty">没有匹配的渐进阅读卡片</div>
      </div>
    )
  }

  return (
    <div className="ir-library-scroll" ref={listRef}>
      {groups.map((group: IRCardGroup) => {
        const isExpanded = expandedGroups[group.key] !== false
        const groupCardIds = group.cards.map((card: IRCard) => card.id)
        const selectedCount = groupCardIds.filter((id: DbId) => selectedCardIds.has(id)).length
        const isGroupFullySelected =
          groupCardIds.length > 0 && selectedCount === groupCardIds.length
        const canAdvanceLearnGroup = FUTURE_GROUPS.includes(group.key)
        const displayCount = groupDisplayCounts[group.key] ?? PAGE_SIZE
        const visibleCards = group.cards.slice(0, displayCount)
        const remaining = group.cards.length - visibleCards.length

        return (
          <section key={group.key} className="ir-library-group">
            <div className="ir-library-group__bar">
              <button
                type="button"
                className="ir-library-group__toggle"
                onClick={() => onToggleGroup(group.key)}
                aria-expanded={isExpanded}
              >
                <i
                  className={`ti ${isExpanded ? "ti-chevron-down" : "ti-chevron-right"}`}
                  aria-hidden="true"
                />
                <span>{group.title}</span>
                <span className="ir-library-group__meta">{group.cards.length} 张</span>
              </button>
              <div className="ir-library-group__actions">
                <button
                  type="button"
                  className="ir-group-select-btn"
                  onClick={() => onToggleGroupSelection(groupCardIds)}
                  title={isGroupFullySelected ? "取消本组选择" : "全选本组"}
                >
                  {isGroupFullySelected ? "取消本组" : `全选${selectedCount > 0 ? `（${selectedCount}）` : ""}`}
                </button>
              </div>
            </div>
            {isExpanded ? (
              <div>
                {visibleCards.map((card: IRCard) => (
                  <IRLibraryRow
                    key={card.id}
                    card={card}
                    title={getTitle(card.id, titleMap)}
                    selected={selectedCardIds.has(card.id)}
                    canAdvanceLearn={canAdvanceLearnGroup}
                    isAdvancing={Boolean(advancingIds[String(card.id)])}
                    now={now}
                    onToggleSelect={onToggleCardSelection}
                    onOpenDetails={onOpenDetails}
                    onStartReading={onStartReading}
                    onAdvanceLearn={onAdvanceLearn}
                  />
                ))}
                {remaining > 0 ? (
                  <div style={{ padding: "8px 12px" }}>
                    <button type="button" className="ir-load-more-btn" onClick={() => onLoadMore(group.key)}>
                      加载更多（剩余 {remaining} 张）
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

export { PAGE_SIZE as IR_LIBRARY_PAGE_SIZE }
