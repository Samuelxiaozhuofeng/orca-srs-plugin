import type { DeckStats, TodayStats } from "../../srs/types"
import type { HomeStatKind } from "./homeStatNav"
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
  onStatClick: (kind: HomeStatKind) => void
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
  onShowDifficultCards,
  onStatClick
}: FlashHomePageProps) {
  return (
    <div className="srs-flash-home-page-inner">
      <HomeSummaryBar
        todayStats={todayStats}
        onStartTodayReview={onStartTodayReview}
        onShowDifficultCards={onShowDifficultCards}
        onRefresh={onRefresh}
        onStatClick={onStatClick}
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
