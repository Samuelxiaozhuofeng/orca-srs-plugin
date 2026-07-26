import type { TodayStats } from "../../srs/types"
import type { TodayLearningSummary } from "../../srs/todayLearning/todayLearningSummary"
import type { TodayLearningTimeBudget } from "../../srs/todayLearning/todayLearningResumeStorage"
import type { HomeStatKind } from "./homeStatNav"
import TodayProgressRing from "./TodayProgressRing"

const { Button } = orca.components

export type HomeSummaryBarProps = {
  todayStats: TodayStats
  todayLearning: TodayLearningSummary | null
  todayLearningLoading: boolean
  selectedMinutes: TodayLearningTimeBudget
  onSelectMinutes: (minutes: TodayLearningTimeBudget) => void
  canContinue: boolean
  canStart: boolean
  actionBusy: boolean
  /** 恢复点读取失败（损坏 / getData）；与 action 失败分离 */
  resumeLoadError: string | null
  /** 继续动作失败（块不可用 / sessionId 不一致等）；marker 可能仍在 */
  resumeActionError: string | null
  onPrimaryAction: () => void
  onRetryResumeLoad: () => void
  onRetryContinue: () => void
  onStartFresh: () => void
  onShowDifficultCards: () => void
  onOpenReadingLibrary: () => void
  onRefresh: () => void
  onStatClick?: (kind: HomeStatKind) => void
}

function formatExactCount(value: number | null | undefined): string {
  if (value == null) return "—"
  return String(value)
}

export default function HomeSummaryBar({
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
  onShowDifficultCards,
  onOpenReadingLibrary,
  onRefresh,
  onStatClick
}: HomeSummaryBarProps) {
  const backlogCount = todayStats.pendingCount - todayStats.todayCount
  const isError = todayLearning?.loadStatus === "error"
  const isPartial = todayLearning?.loadStatus === "partial"
  const isDone =
    todayLearning != null &&
    (todayLearning.loadStatus === "empty" ||
      (todayLearning.loadStatus === "ok" && todayLearning.remainingTotal === 0))

  const hasExactTotal = todayLearning?.remainingTotal != null

  // 环形进度状态：只有已完成/剩余均可信时才画真实进度，否则占位（不把 lower-bound 当真实进度）
  const ringState = isDone
    ? ({ kind: "done", completed: todayLearning?.completedUnified ?? 0 } as const)
    : todayLearning != null &&
        todayLearning.loadStatus === "ok" &&
        todayLearning.completedUnified != null &&
        todayLearning.remainingTotal != null
      ? ({
          kind: "ok",
          completed: todayLearning.completedUnified,
          remaining: todayLearning.remainingTotal
        } as const)
      : ({ kind: "unknown" } as const)

  const primaryLabel = actionBusy
    ? "启动中…"
    : canContinue
      ? "继续上次学习"
      : isDone
        ? "今天已完成"
        : "开始今日学习"

  const primaryDisabled = actionBusy || isError || (!canContinue && !canStart)

  return (
    <div className="srs-home-summary">
      <div className="srs-today-learning">
        <div className="srs-today-learning__title">今日学习</div>

        {todayLearningLoading && !todayLearning ? (
          <div className="srs-today-learning__loading" role="status">
            正在读取今日学习…
          </div>
        ) : isError ? (
          <div className="srs-today-learning__error" role="alert">
            <div>暂时无法读取今日学习</div>
            {todayLearning?.errorMessage ? (
              <div className="srs-today-learning__error-detail">
                {todayLearning.errorMessage}
              </div>
            ) : null}
            <Button
              variant="solid"
              onClick={actionBusy ? undefined : onRefresh}
              style={{ opacity: actionBusy ? 0.5 : 1 }}
            >
              重试
            </Button>
          </div>
        ) : (
          <>
            {isPartial ? (
              <div className="srs-today-learning__partial" role="status">
                部分内容暂时无法读取
                {todayLearning?.errorMessage
                  ? `：${todayLearning.errorMessage}`
                  : ""}
                {todayLearning?.warnings?.length
                  ? `（${todayLearning.warnings.join("；")}）`
                  : ""}
                。以下仅显示已确认侧数字，不是完整总数。
              </div>
            ) : null}

            <div className="srs-today-learning__hero">
              <TodayProgressRing state={ringState} />
              <div className="srs-today-learning__hero-main">
                {isDone ? (
                  <div className="srs-today-learning__done">今天已完成</div>
                ) : hasExactTotal ? (
                  <>
                    <div className="srs-today-learning__remaining">
                      <span className="srs-today-learning__remaining-value">
                        {formatExactCount(todayLearning!.remainingTotal)}
                      </span>
                      <span className="srs-today-learning__remaining-label">
                        还剩
                      </span>
                    </div>
                    <div className="srs-today-learning__breakdown">
                      <span className="srs-today-learning__breakdown-item srs-today-learning__breakdown-item--srs">
                        <i className="ti ti-cards" />
                        复习 {formatExactCount(todayLearning?.srsRemaining)}
                      </span>
                      <span className="srs-today-learning__breakdown-sep">
                        ·
                      </span>
                      <span className="srs-today-learning__breakdown-item srs-today-learning__breakdown-item--ir">
                        <i className="ti ti-book-2" />
                        阅读 {formatExactCount(todayLearning?.irRemaining)}
                      </span>
                    </div>
                    <div className="srs-today-learning__eta">
                      <i className="ti ti-clock-hour-4" />
                      预计约{" "}
                      {formatExactCount(todayLearning?.estimatedMinutes)} 分钟
                    </div>
                  </>
                ) : (
                  <>
                    <div className="srs-today-learning__remaining-label">
                      今日剩余（部分未确认）
                    </div>
                    <div className="srs-today-learning__breakdown">
                      <span className="srs-today-learning__breakdown-item srs-today-learning__breakdown-item--srs">
                        <i className="ti ti-cards" />
                        复习{" "}
                        {todayLearning?.srsRemaining == null
                          ? "暂不可用"
                          : todayLearning.srsRemaining}
                      </span>
                      <span className="srs-today-learning__breakdown-sep">
                        ·
                      </span>
                      <span className="srs-today-learning__breakdown-item srs-today-learning__breakdown-item--ir">
                        <i className="ti ti-book-2" />
                        阅读{" "}
                        {todayLearning?.irRemaining == null
                          ? "暂不可用"
                          : todayLearning.irRemaining}
                      </span>
                    </div>
                    <div className="srs-today-learning__eta">
                      预计总时长暂不可用
                    </div>
                  </>
                )}
              </div>
            </div>

            {todayLearning?.completedUnified != null ? (
              <div className="srs-today-learning__completed">
                今日已完成 {todayLearning.completedUnified}
                {todayLearning.srsCompleted != null ||
                todayLearning.irReadingCompleted != null
                  ? `（记忆卡 ${formatExactCount(todayLearning.srsCompleted)} · 阅读 ${formatExactCount(todayLearning.irReadingCompleted)}）`
                  : ""}
              </div>
            ) : todayLearning?.srsCompleted != null ||
              todayLearning?.irReadingCompleted != null ? (
              <div className="srs-today-learning__completed">
                今日完成统计不完整（记忆卡{" "}
                {formatExactCount(todayLearning.srsCompleted)} · 阅读{" "}
                {formatExactCount(todayLearning.irReadingCompleted)}）
              </div>
            ) : null}

            <div className="srs-today-learning__recommendation">
              {todayLearning?.recommendation ?? "—"}
            </div>

            <div
              className="srs-today-learning__timebox"
              role="radiogroup"
              aria-label="本次学习时长"
            >
              {([10, 20, 30] as const).map((mins) => (
                <button
                  type="button"
                  key={mins}
                  role="radio"
                  className={
                    "srs-today-learning__timebox-btn" +
                    (selectedMinutes === mins
                      ? " srs-today-learning__timebox-btn--selected"
                      : "")
                  }
                  aria-checked={selectedMinutes === mins}
                  disabled={actionBusy || isDone}
                  onClick={() => onSelectMinutes(mins)}
                >
                  {mins} 分钟
                </button>
              ))}
            </div>

            {resumeLoadError ? (
              <div className="srs-today-learning__resume-error" role="alert">
                恢复点读取失败：{resumeLoadError}
                <div className="srs-today-learning__resume-error-actions">
                  <Button
                    variant="plain"
                    onClick={actionBusy ? undefined : onRetryResumeLoad}
                    style={{ opacity: actionBusy ? 0.5 : 1 }}
                  >
                    重试读取
                  </Button>
                  <Button
                    variant="solid"
                    onClick={
                      actionBusy || !canStart ? undefined : onStartFresh
                    }
                    style={{
                      opacity: actionBusy || !canStart ? 0.5 : 1
                    }}
                  >
                    开始新会话
                  </Button>
                </div>
              </div>
            ) : null}

            {resumeActionError ? (
              <div className="srs-today-learning__resume-error" role="alert">
                无法继续上次学习：{resumeActionError}
                <div className="srs-today-learning__resume-error-actions">
                  <Button
                    variant="plain"
                    onClick={actionBusy ? undefined : onRetryContinue}
                    style={{ opacity: actionBusy ? 0.5 : 1 }}
                  >
                    重试继续
                  </Button>
                  <Button
                    variant="solid"
                    onClick={
                      actionBusy || !canStart ? undefined : onStartFresh
                    }
                    style={{
                      opacity: actionBusy || !canStart ? 0.5 : 1
                    }}
                  >
                    开始新会话
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="srs-home-summary__actions">
              <Button
                variant="solid"
                onClick={primaryDisabled ? undefined : onPrimaryAction}
                className={
                  "srs-home-primary-btn" +
                  (primaryDisabled ? " srs-btn-disabled" : "")
                }
                style={{
                  opacity: primaryDisabled ? 0.5 : 1,
                  cursor: primaryDisabled ? "not-allowed" : "pointer"
                }}
              >
                {primaryLabel}
              </Button>
              {canContinue && canStart ? (
                <button
                  type="button"
                  className="srs-home-linkbtn"
                  onClick={actionBusy ? undefined : onStartFresh}
                  disabled={actionBusy}
                >
                  重新开始
                </button>
              ) : null}
            </div>

            <div className="srs-home-summary__nav" aria-label="更多入口">
              <button
                type="button"
                className="srs-home-nav-btn srs-home-nav-btn--library"
                onClick={onOpenReadingLibrary}
                title="打开渐进阅读资料库"
              >
                <i className="ti ti-books" />
                <span>阅读资料库</span>
              </button>
              <button
                type="button"
                className="srs-home-nav-btn srs-home-nav-btn--danger"
                onClick={onShowDifficultCards}
                title="查看困难记忆卡"
              >
                <i className="ti ti-alert-triangle" />
                <span>困难卡</span>
              </button>
              <button
                type="button"
                className="srs-home-nav-btn srs-home-nav-btn--icon"
                onClick={actionBusy ? undefined : onRefresh}
                disabled={actionBusy}
                title="刷新数据"
                aria-label="刷新数据"
              >
                <i className="ti ti-refresh" />
              </button>
            </div>
          </>
        )}
      </div>

      <div
        className="srs-home-summary__strip"
        aria-label="卡库概览"
      >
        <StatChip
          icon="ti-sparkles"
          label="新卡"
          value={todayStats.newCount}
          color="var(--orca-color-primary-6)"
          onClick={onStatClick ? () => onStatClick("new") : undefined}
          title="查看全部新卡"
        />
        <span className="srs-home-summary__strip-sep">·</span>
        <StatChip
          icon="ti-clock"
          label="今日到期"
          value={todayStats.todayCount}
          color="var(--orca-color-danger-6)"
          onClick={onStatClick ? () => onStatClick("today") : undefined}
          title="查看今日到期记忆卡"
        />
        <span className="srs-home-summary__strip-sep">·</span>
        <StatChip
          icon="ti-inbox"
          label="积压"
          value={backlogCount}
          color="var(--orca-color-success-6)"
          onClick={onStatClick ? () => onStatClick("backlog") : undefined}
          title="查看积压记忆卡"
        />
        <span className="srs-home-summary__strip-sep">·</span>
        <span className="srs-home-summary__strip-total">
          共 {todayStats.totalCount} 张
        </span>
      </div>
    </div>
  )
}

type StatChipProps = {
  icon: string
  label: string
  value: number
  color: string
  onClick?: () => void
  title?: string
}

function StatChip({ icon, label, value, color, onClick, title }: StatChipProps) {
  const content = (
    <>
      <i className={`ti ${icon}`} style={{ color }} />
      <span className="srs-stat-chip__label">{label}</span>
      <span className="srs-stat-chip__value" style={{ color }}>
        {value}
      </span>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className="srs-stat-chip srs-stat-chip--clickable"
        onClick={onClick}
        title={title}
      >
        {content}
      </button>
    )
  }
  return (
    <span className="srs-stat-chip" title={title}>
      {content}
    </span>
  )
}
