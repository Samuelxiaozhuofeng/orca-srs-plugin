import type { DeckInfo } from "../srs/types"

const { Button } = orca.components

type DeckCardCompactProps = {
  deck: DeckInfo
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
}

export default function DeckCardCompact({ deck, onViewDeck, onReviewDeck }: DeckCardCompactProps) {
  const dueCount = deck.overdueCount + deck.todayCount

  const handleClick = () => {
    onViewDeck(deck.name)
  }

  const handleReview = (e: any) => {
    e.stopPropagation()
    onReviewDeck(deck.name)
  }

  return (
    <div className="srs-deck-card-compact" onClick={handleClick}>
      {/* 卡组名称 */}
      <div className="srs-deck-card-compact__name">
        {deck.name}
      </div>

      {/* 统计信息 */}
      <div className="srs-deck-card-compact__stats">
        {dueCount > 0 && (
          <div className="srs-deck-card-compact__stat">
            <span className="srs-deck-card-compact__dot srs-deck-card-compact__dot--due" />
            <span>{dueCount} 待复习</span>
          </div>
        )}
        {deck.newCount > 0 && (
          <div className="srs-deck-card-compact__stat">
            <span className="srs-deck-card-compact__dot srs-deck-card-compact__dot--new" />
            <span>{deck.newCount} 新卡</span>
          </div>
        )}
        {dueCount === 0 && deck.newCount === 0 && (
          <div className="srs-deck-card-compact__stat srs-deck-card-compact__stat--done">
            <span className="srs-deck-card-compact__dot srs-deck-card-compact__dot--done" />
            <span>已完成</span>
          </div>
        )}
      </div>

      {/* 总数 */}
      <div className="srs-deck-card-compact__total">
        共 {deck.totalCount} 张卡片
      </div>

      {/* 复习按钮 */}
      {dueCount > 0 && (
        <Button
          variant="solid"
          onClick={handleReview}
          className="srs-deck-card-compact__review"
        >
          开始复习
        </Button>
      )}
    </div>
  )
}
