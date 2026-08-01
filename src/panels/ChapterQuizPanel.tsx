/**
 * 章末小测 Custom Panel：从 panelId 解析 viewArgs.quizBlockId，挂载专注答题体验。
 * PanelProps 不含 viewArgs；右栏复用时依赖 CHAPTER_QUIZ_PANEL_NAV_EVENT 更新 quizBlockId。
 */

import type { PanelProps } from "../orca.d.ts"
import ChapterQuizExperience from "../components/incremental-reading/ChapterQuizExperience"
import SrsErrorBoundary from "../components/SrsErrorBoundary"
import {
  CHAPTER_QUIZ_COPY,
  resolveQuizBlockIdForPanel
} from "../srs/incremental-reading/chapterQuiz"
import {
  CHAPTER_QUIZ_PANEL_NAV_EVENT,
  resolveQuizBlockIdFromPanelNav,
  shouldApplyChapterQuizPanelNav,
  type ChapterQuizPanelNavDetail
} from "../srs/incremental-reading/chapterQuizLive"

const { useEffect, useState } = window.React

export default function ChapterQuizPanel(props: PanelProps) {
  const { panelId, active } = props

  const [quizBlockId, setQuizBlockId] = useState<number | null>(() =>
    resolveQuizBlockIdForPanel(panelId)
  )

  // 首次 mount / panelId 变化：从 viewArgs 解析
  useEffect(() => {
    const fromArgs = resolveQuizBlockIdForPanel(panelId)
    setQuizBlockId(fromArgs)
    if (fromArgs == null) {
      console.error(
        "[章末小测] Custom Panel 缺少合法 quizBlockId，panelId=",
        panelId
      )
    }
  }, [panelId])

  // 右栏复用 goTo 时可能不 remount 且 active 不变：监听 scoped nav 事件
  useEffect(() => {
    const onNav = (event: Event) => {
      const detail = (event as CustomEvent<ChapterQuizPanelNavDetail>).detail
      if (!shouldApplyChapterQuizPanelNav(panelId, detail)) return
      const nextId = resolveQuizBlockIdFromPanelNav(detail)
      if (nextId == null) {
        console.error(
          "[章末小测] panel nav 事件携带非法 quizBlockId:",
          detail
        )
        setQuizBlockId(null)
        return
      }
      setQuizBlockId(nextId)
    }
    window.addEventListener(CHAPTER_QUIZ_PANEL_NAV_EVENT, onNav)
    return () => {
      window.removeEventListener(CHAPTER_QUIZ_PANEL_NAV_EVENT, onNav)
    }
  }, [panelId])

  if (quizBlockId == null) {
    return (
      <div className="chapter-quiz-panel chapter-quiz-panel--error">
        <div className="chapter-quiz-panel__shell">
          <div className="chapter-quiz__status chapter-quiz__status--error">
            {CHAPTER_QUIZ_COPY.panelMissingId}
          </div>
          <div className="chapter-quiz__hint">
            请从章节中的小测入口重新打开侧栏答题。
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chapter-quiz-panel-root" data-active={active ? "1" : "0"}>
      <SrsErrorBoundary componentName="章末小测" errorTitle="章末小测面板出错">
        {/* key 强制 quiz 切换时重置体验内部状态，避免显示旧小测 */}
        <ChapterQuizExperience
          key={quizBlockId}
          panelId={panelId}
          quizBlockId={quizBlockId}
        />
      </SrsErrorBoundary>
    </div>
  )
}
