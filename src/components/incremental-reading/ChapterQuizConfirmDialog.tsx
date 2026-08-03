/**
 * 章末小测确认：完成后续停留（post-complete）与更多菜单/阅读中（normal）共用。
 *
 * - normal：数量预设（快速 5 / 标准 10 / 深入 15，偏好不在预设内时附「按设置 N 题」），
 *   默认选中偏好值；点「开始出题」以所选数量启动。
 * - post-complete：轻量 offer —— 主操作「继续下一篇」（释放完成停留并推进），
 *   副操作「快速测一下 · 5题」；展开可换 10/15/按设置，点选即启动并保持停留。
 * - 选择的数量经 onConfirm(count) 传入 launchChapterQuiz，冻结进本轮 repr，
 *   不自动修改偏好。
 * - 每项附确定性时长估算（约 X 分钟）。
 */

import {
  buildQuizCountChoices,
  CHAPTER_QUIZ_COPY,
  type ChapterQuizCountChoice
} from "../../srs/incremental-reading/chapterQuiz"
import { getChapterQuizPrefs } from "../../srs/settings/chapterQuizSettingsSchema"

const { useEffect, useMemo, useState } = window.React
const { Button, ModalOverlay } = orca.components

type Props = {
  open: boolean
  isWorking?: boolean
  /** post-complete = 完成 Topic 后停留的轻量 offer；normal = 更多菜单/阅读中 */
  mode: "normal" | "post-complete"
  pluginName: string
  /** 关闭（post-complete 下即「继续下一篇」：释放停留并推进） */
  onClose: () => void
  /** 以指定题数启动小测（post-complete 下保持停留直至测完） */
  onConfirm: (count: number) => void
}

export default function ChapterQuizConfirmDialog({
  open,
  isWorking,
  mode,
  pluginName,
  onClose,
  onConfirm
}: Props) {
  const choices: ChapterQuizCountChoice[] = useMemo(
    () => buildQuizCountChoices(getChapterQuizPrefs(pluginName).questionCount),
    // 再次打开时重读偏好，覆盖同一会话中刚修改默认题量的场景。
    [open, pluginName]
  )
  /** normal 模式的选中数量；null = 跟随偏好默认值 */
  const [selectedCount, setSelectedCount] = useState<number | null>(null)
  /** post-complete 模式是否展开更多题数 */
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedCount(null)
      setExpanded(false)
    }
  }, [open])

  if (!open) return null

  const busyClassName = isWorking ? "ir-button--blocked" : undefined
  const effectiveCount = selectedCount ?? choices.find((c) => c.isPreference)?.count ?? 5
  const postComplete = mode === "post-complete"

  return (
    <ModalOverlay
      visible={true}
      canClose={!isWorking}
      onClose={() => {
        if (isWorking) return
        onClose()
      }}
    >
      <div className="ir-dialog">
        <div className="ir-dialog__title">{CHAPTER_QUIZ_COPY.confirmTitle}</div>
        <div className="ir-dialog__text ir-dialog__text--preline">
          {postComplete
            ? CHAPTER_QUIZ_COPY.postCompleteBody
            : CHAPTER_QUIZ_COPY.confirmBody}
        </div>

        {postComplete ? (
          <div className="chapter-quiz__count-picker">
            {expanded ? (
              <>
                <div className="chapter-quiz__count-picker-row">
                  {choices.map((c) => (
                    <button
                      key={c.count}
                      type="button"
                      className={
                        "chapter-quiz__count-option" +
                        (c.isPreference ? " is-preference" : "")
                      }
                      title={`${c.durationLabel}${c.isPreference ? "（当前设置默认）" : ""}`}
                      disabled={isWorking}
                      onClick={() => {
                        if (isWorking) return
                        onConfirm(c.count)
                      }}
                    >
                      <span className="chapter-quiz__count-option-label">
                        {c.label}
                      </span>
                      <span className="chapter-quiz__count-option-duration">
                        {c.durationLabel}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="chapter-quiz__count-expand"
                  disabled={isWorking}
                  onClick={() => {
                    if (isWorking) return
                    setExpanded(false)
                  }}
                >
                  {CHAPTER_QUIZ_COPY.collapseCountOptions} ▴
                </button>
              </>
            ) : (
              <button
                type="button"
                className="chapter-quiz__count-expand"
                title={CHAPTER_QUIZ_COPY.moreCountOptionsTitle}
                disabled={isWorking}
                onClick={() => {
                  if (isWorking) return
                  setExpanded(true)
                }}
              >
                {CHAPTER_QUIZ_COPY.moreCountOptions} ▾
              </button>
            )}
          </div>
        ) : (
          <div className="chapter-quiz__count-picker">
            <div className="chapter-quiz__count-picker-row">
              {choices.map((c) => {
                const isSelected = effectiveCount === c.count
                return (
                  <button
                    key={c.count}
                    type="button"
                    className={
                      "chapter-quiz__count-option" +
                      (isSelected ? " is-selected" : "") +
                      (c.isPreference ? " is-preference" : "")
                    }
                    aria-pressed={isSelected}
                    title={`${c.durationLabel}${c.isPreference ? "（当前设置默认）" : ""}`}
                    disabled={isWorking}
                    onClick={() => {
                      if (isWorking) return
                      setSelectedCount(c.count)
                    }}
                  >
                    <span className="chapter-quiz__count-option-label">
                      {c.label}
                    </span>
                    <span className="chapter-quiz__count-option-duration">
                      {c.durationLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="ir-dialog__text chapter-quiz__quiz-vs-cards">
          {CHAPTER_QUIZ_COPY.quizVsCardsHint}
        </div>

        <div className="ir-dialog__actions">
          {postComplete ? (
            <>
              <Button
                tabIndex={0}
                variant="solid"
                onClick={() => {
                  if (isWorking) return
                  onClose()
                }}
                className={busyClassName}
              >
                {CHAPTER_QUIZ_COPY.continueNext}
              </Button>
              <Button
                tabIndex={0}
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  onConfirm(5)
                }}
                className={busyClassName}
              >
                {isWorking
                  ? "处理中…"
                  : CHAPTER_QUIZ_COPY.postCompleteQuick(5)}
              </Button>
            </>
          ) : (
            <>
              <Button
                tabIndex={0}
                variant="outline"
                onClick={() => {
                  if (isWorking) return
                  onClose()
                }}
                className={busyClassName}
              >
                {CHAPTER_QUIZ_COPY.confirmCancel}
              </Button>
              <Button
                tabIndex={0}
                variant="solid"
                onClick={() => {
                  if (isWorking) return
                  onConfirm(effectiveCount)
                }}
                className={busyClassName}
              >
                {isWorking ? "处理中…" : CHAPTER_QUIZ_COPY.confirmStart}
              </Button>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}
