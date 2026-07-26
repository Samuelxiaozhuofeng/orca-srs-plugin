import type { DeckStats, TodayStats } from "../../srs/types"
import type { TodayLearningSummary } from "../../srs/todayLearning/todayLearningSummary"
import type { TodayLearningTimeBudget } from "../../srs/todayLearning/todayLearningResumeStorage"
import type { HomeStatKind } from "./homeStatNav"
import HomeSummaryBar from "./HomeSummaryBar"
import DeckListView from "./DeckListView"

export type FlashHomePageProps = {
  deckStats: DeckStats
  todayStats: TodayStats
  todayLearning: TodayLearningSummary | null
  todayLearningLoading: boolean
  selectedMinutes: TodayLearningTimeBudget
  onSelectMinutes: (minutes: TodayLearningTimeBudget) => void
  canContinue: boolean
  canStart: boolean
  actionBusy: boolean
  resumeLoadError: string | null
  resumeActionError: string | null
  onPrimaryAction: () => void
  onRetryResumeLoad: () => void
  onRetryContinue: () => void
  onStartFresh: () => void
  panelId: string
  pluginName: string
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
  onRefresh: () => void
  onNoteChange: (deckName: string, note: string) => void
  onShowDifficultCards: () => void
  onOpenReadingLibrary: () => void
  onStatClick: (kind: HomeStatKind) => void
}

export default function FlashHomePage({
  deckStats,
  todayStats,
  todayLearning,
  todayLearningLoading,
  selectedMinutes,
  onSelectMinutes,
  canContinue,
  canStart,
  actionBusy,
  resumeLoadError,
  resumeActionError,
  onPrimaryAction,
  onRetryResumeLoad,
  onRetryContinue,
  onStartFresh,
  panelId,
  pluginName,
  onViewDeck,
  onReviewDeck,
  onRefresh,
  onNoteChange,
  onShowDifficultCards,
  onOpenReadingLibrary,
  onStatClick
}: FlashHomePageProps) {
  return (
    <div className="srs-flash-home-page-inner">
      <HomeSummaryBar
        todayStats={todayStats}
        todayLearning={todayLearning}
        todayLearningLoading={todayLearningLoading}
        selectedMinutes={selectedMinutes}
        onSelectMinutes={onSelectMinutes}
        canContinue={canContinue}
        canStart={canStart}
        actionBusy={actionBusy}
        resumeLoadError={resumeLoadError}
        resumeActionError={resumeActionError}
        onPrimaryAction={onPrimaryAction}
        onRetryResumeLoad={onRetryResumeLoad}
        onRetryContinue={onRetryContinue}
        onStartFresh={onStartFresh}
        onShowDifficultCards={onShowDifficultCards}
        onOpenReadingLibrary={onOpenReadingLibrary}
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
