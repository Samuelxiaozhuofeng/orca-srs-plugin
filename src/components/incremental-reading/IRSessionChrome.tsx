/**
 * Reading-session chrome: postpone / importance / more menus,
 * main action bar, complete + archive dialogs.
 */

import type { IRReaderTheme } from "./irReaderThemeStorage"
import type { ImportanceNudgeDirection } from "../../srs/incremental-reading/irImportance"
import {
  formatImportanceTierCompact,
  importanceToTier
} from "../../srs/incremental-reading/irImportance"
import IRActionBar from "./IRActionBar"
import IRImportanceMenu from "./IRImportanceMenu"
import IRPostponeMenu, { type PostponeChoice } from "./IRPostponeMenu"
import IRSessionMorePanel from "./IRSessionMorePanel"
import IRCompleteChapterDialog from "./IRCompleteChapterDialog"
import IRArchiveConfirmDialog from "./IRArchiveConfirmDialog"

export type IRSessionChromeProps = {
  isTopic: boolean
  isWorking: boolean
  isSequentialActive: boolean
  sequentialHasNext: boolean
  priority: number
  theme: IRReaderTheme
  viewMode: "reading" | "edit"
  embedded?: boolean
  postponeOpen: boolean
  importanceOpen: boolean
  moreOpen: boolean
  completeChapterOpen: boolean
  archiveConfirmOpen: boolean
  showReturn?: boolean
  onNext: () => void
  onExtract: () => void
  onItemize: () => void
  onComplete: () => void
  onImportance: () => void
  onMore: () => void
  onReturn?: () => void
  onPostponeChoose: (choice: PostponeChoice) => void
  onPostponeClose: () => void
  onImportanceChoose: (direction: ImportanceNudgeDirection) => void
  onImportanceClose: () => void
  onOpenPostpone: () => void
  onThemeChange: (theme: IRReaderTheme) => void
  onToggleViewMode: () => void
  onBackToLibrary?: () => void
  onCompleteChapterClose: () => void
  onCompleteChapterToday: () => void
  onCompleteChapterTomorrow: () => void
  onArchiveConfirmClose: () => void
  onArchiveConfirm: () => void
}

export default function IRSessionChrome({
  isTopic,
  isWorking,
  isSequentialActive,
  sequentialHasNext,
  priority,
  theme,
  viewMode,
  embedded,
  postponeOpen,
  importanceOpen,
  moreOpen,
  completeChapterOpen,
  archiveConfirmOpen,
  showReturn,
  onNext,
  onExtract,
  onItemize,
  onComplete,
  onImportance,
  onMore,
  onReturn,
  onPostponeChoose,
  onPostponeClose,
  onImportanceChoose,
  onImportanceClose,
  onOpenPostpone,
  onThemeChange,
  onToggleViewMode,
  onBackToLibrary,
  onCompleteChapterClose,
  onCompleteChapterToday,
  onCompleteChapterTomorrow,
  onArchiveConfirmClose,
  onArchiveConfirm
}: IRSessionChromeProps) {
  return (
    <>
      <IRPostponeMenu
        open={postponeOpen}
        isWorking={isWorking}
        onChoose={(c) => void onPostponeChoose(c)}
        onClose={onPostponeClose}
      />

      <IRImportanceMenu
        open={importanceOpen}
        isWorking={isWorking}
        currentPriority={priority}
        onChoose={(direction) => void onImportanceChoose(direction)}
        onClose={onImportanceClose}
      />

      <IRSessionMorePanel
        open={moreOpen}
        isWorking={isWorking}
        theme={theme}
        viewMode={viewMode}
        embedded={embedded}
        onPostpone={onOpenPostpone}
        onThemeChange={onThemeChange}
        onToggleViewMode={onToggleViewMode}
        onBackToLibrary={onBackToLibrary}
      />

      <IRActionBar
        isTopic={isTopic}
        isWorking={isWorking}
        onNext={onNext}
        onExtract={onExtract}
        onItemize={onItemize}
        onImportance={onImportance}
        importanceOpen={importanceOpen}
        importanceTierLabel={formatImportanceTierCompact(importanceToTier(priority))}
        onComplete={onComplete}
        completeTitle={
          isSequentialActive
            ? "完成本章，解锁下一章"
            : "完成并退出本条阅读队列"
        }
        onMore={onMore}
        moreOpen={moreOpen}
        showReturn={showReturn}
        onReturn={onReturn}
      />

      <IRCompleteChapterDialog
        open={completeChapterOpen}
        isWorking={isWorking}
        hasNextChapter={sequentialHasNext}
        onClose={onCompleteChapterClose}
        onConfirmToday={onCompleteChapterToday}
        onConfirmTomorrow={onCompleteChapterTomorrow}
      />

      <IRArchiveConfirmDialog
        open={archiveConfirmOpen}
        isWorking={isWorking}
        onClose={onArchiveConfirmClose}
        onConfirm={onArchiveConfirm}
      />
    </>
  )
}
