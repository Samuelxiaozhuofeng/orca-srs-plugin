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
import ChapterQuizConfirmDialog from "./ChapterQuizConfirmDialog"

export type IRSessionChromeProps = {
  isTopic: boolean
  isWorking: boolean
  isSequentialActive: boolean
  sequentialHasNext: boolean
  priority: number
  theme: IRReaderTheme
  contentWidth: number
  viewMode: "reading" | "edit"
  embedded?: boolean
  postponeOpen: boolean
  importanceOpen: boolean
  moreOpen: boolean
  completeChapterOpen: boolean
  archiveConfirmOpen: boolean
  chapterQuizConfirmOpen?: boolean
  /** post-complete = 完成 Topic 后停留的轻量 offer；normal = 更多菜单/阅读中 */
  chapterQuizMode?: "normal" | "post-complete"
  pluginName?: string
  showReturn?: boolean
  onNext: () => void
  onConvertToQA?: () => void
  onConvertToDirection?: () => void
  onChapterQuiz?: () => void
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
  onContentWidthChange: (width: number) => void
  onToggleViewMode: () => void
  onBackToLibrary?: () => void
  onCompleteChapterClose: () => void
  onCompleteChapterToday: () => void
  onCompleteChapterTomorrow: () => void
  onArchiveConfirmClose: () => void
  onArchiveConfirm: () => void
  onChapterQuizConfirmClose?: () => void
  onChapterQuizConfirm?: (count: number) => void
}

export default function IRSessionChrome({
  isTopic,
  isWorking,
  isSequentialActive,
  sequentialHasNext,
  priority,
  theme,
  contentWidth,
  viewMode,
  embedded,
  postponeOpen,
  importanceOpen,
  moreOpen,
  completeChapterOpen,
  archiveConfirmOpen,
  chapterQuizConfirmOpen = false,
  chapterQuizMode = "normal",
  pluginName = "orca-srs",
  showReturn,
  onNext,
  onConvertToQA,
  onConvertToDirection,
  onChapterQuiz,
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
  onContentWidthChange,
  onToggleViewMode,
  onBackToLibrary,
  onCompleteChapterClose,
  onCompleteChapterToday,
  onCompleteChapterTomorrow,
  onArchiveConfirmClose,
  onArchiveConfirm,
  onChapterQuizConfirmClose,
  onChapterQuizConfirm
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
        isTopic={isTopic}
        theme={theme}
        contentWidth={contentWidth}
        viewMode={viewMode}
        embedded={embedded}
        onPostpone={onOpenPostpone}
        onConvertToQA={onConvertToQA}
        onConvertToDirection={onConvertToDirection}
        onChapterQuiz={onChapterQuiz}
        onThemeChange={onThemeChange}
        onContentWidthChange={onContentWidthChange}
        onToggleViewMode={onToggleViewMode}
        onBackToLibrary={onBackToLibrary}
      />

      <IRActionBar
        isWorking={isWorking}
        onNext={onNext}
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

      <ChapterQuizConfirmDialog
        open={chapterQuizConfirmOpen}
        isWorking={isWorking}
        mode={chapterQuizMode}
        pluginName={pluginName}
        onClose={() => onChapterQuizConfirmClose?.()}
        onConfirm={(count) => onChapterQuizConfirm?.(count)}
      />
    </>
  )
}
