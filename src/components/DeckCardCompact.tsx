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
    <div
      onClick={handleClick}
      style={{
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-1)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        transition: "all 0.2s ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
        e.currentTarget.style.borderColor = "var(--orca-color-primary-4)"
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)"
        e.currentTarget.style.borderColor = "var(--orca-color-border-1)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      {/* 卡组名称 */}
      <div style={{ 
        fontSize: "16px", 
        fontWeight: 600, 
        color: "var(--orca-color-text-1)",
        marginBottom: "4px"
      }}>
        {deck.name}
      </div>

      {/* 统计信息 */}
      <div style={{ 
        display: "flex", 
        gap: "12px",
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        {dueCount > 0 && (
          <div style={{ 
            display: "flex", 
            alignItems: "center",
            gap: "4px"
          }}>
            <span style={{ 
              width: "6px", 
              height: "6px", 
              borderRadius: "50%", 
              backgroundColor: "var(--orca-color-warning-5)" 
            }} />
            <span>{dueCount} 待复习</span>
          </div>
        )}
        {deck.newCount > 0 && (
          <div style={{ 
            display: "flex", 
            alignItems: "center",
            gap: "4px"
          }}>
            <span style={{ 
              width: "6px", 
              height: "6px", 
              borderRadius: "50%", 
              backgroundColor: "var(--orca-color-primary-5)" 
            }} />
            <span>{deck.newCount} 新卡</span>
          </div>
        )}
        {dueCount === 0 && deck.newCount === 0 && (
          <div style={{ 
            display: "flex", 
            alignItems: "center",
            gap: "4px",
            color: "var(--orca-color-success-6)"
          }}>
            <span style={{ 
              width: "6px", 
              height: "6px", 
              borderRadius: "50%", 
              backgroundColor: "var(--orca-color-success-5)" 
            }} />
            <span>已完成</span>
          </div>
        )}
      </div>

      {/* 总数 */}
      <div style={{ 
        fontSize: "12px", 
        color: "var(--orca-color-text-3)",
        paddingTop: "8px",
        borderTop: "1px solid var(--orca-color-border-1)"
      }}>
        共 {deck.totalCount} 张卡片
      </div>

      {/* 复习按钮 */}
      {dueCount > 0 && (
        <Button
          variant="solid"
          onClick={handleReview}
          style={{
            width: "100%",
            padding: "8px",
            fontSize: "13px",
            marginTop: "4px"
          }}
        >
          开始复习
        </Button>
      )}
    </div>
  )
}
