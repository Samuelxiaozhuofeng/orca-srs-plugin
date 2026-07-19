import type { DeckStats, TodayStats } from "../../srs/types"
import HomeSummaryBar from "./HomeSummaryBar"
import DeckListView from "./DeckListView"

export type FlashHomePageProps = {
  deckStats: DeckStats
  todayStats: TodayStats
  panelId: string
  pluginName: string
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
  onStartTodayReview: () => void
  onRefresh: () => void
  onNoteChange: (deckName: string, note: string) => void
  onShowDifficultCards: () => void
}

export default function FlashHomePage({
  deckStats,
  todayStats,
  panelId,
  pluginName,
  onViewDeck,
  onReviewDeck,
  onStartTodayReview,
  onRefresh,
  onNoteChange,
  onShowDifficultCards
}: FlashHomePageProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    }}>
      <HomeSummaryBar
        todayStats={todayStats}
        onStartTodayReview={onStartTodayReview}
        onShowDifficultCards={onShowDifficultCards}
        onRefresh={onRefresh}
      />
      <DeckListView
        deckStats={deckStats}
        panelId={panelId}
        pluginName={pluginName}
        onViewDeck={onViewDeck}
        onReviewDeck={onReviewDeck}
        onNoteChange={onNoteChange}
      />
    </div>
  )
}
