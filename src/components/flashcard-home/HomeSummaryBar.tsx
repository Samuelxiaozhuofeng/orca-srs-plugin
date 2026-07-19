import type { TodayStats } from "../../srs/types"
import type { HomeStatKind } from "./homeStatNav"
import StatCard from "./StatCard"

const { Button } = orca.components

export type HomeSummaryBarProps = {
  todayStats: TodayStats
  onStartTodayReview: () => void
  onShowDifficultCards: () => void
  onRefresh: () => void
  /** 点击三数进入全局筛选列表 */
  onStatClick?: (kind: HomeStatKind) => void
}

export default function HomeSummaryBar({
  todayStats,
  onStartTodayReview,
  onShowDifficultCards,
  onRefresh,
  onStatClick
}: HomeSummaryBarProps) {
  const hasDueCards = todayStats.pendingCount > 0 || todayStats.newCount > 0
  const backlogCount = todayStats.pendingCount - todayStats.todayCount

  return (
    <div className="srs-home-summary">
      <div className="srs-home-summary__stats">
        <StatCard
          label="新卡"
          value={todayStats.newCount}
          color="var(--orca-color-primary-6)"
          onClick={onStatClick ? () => onStatClick("new") : undefined}
          title="查看全部新卡"
        />
        <StatCard
          label="今日到期"
          value={todayStats.todayCount}
          color="var(--orca-color-danger-6)"
          onClick={onStatClick ? () => onStatClick("today") : undefined}
          title="查看今日到期卡片"
        />
        <StatCard
          label="积压"
          value={backlogCount}
          color="var(--orca-color-success-6)"
          onClick={onStatClick ? () => onStatClick("backlog") : undefined}
          title="查看积压卡片"
        />
      </div>

      <div className="srs-home-summary__total">
        共 {todayStats.totalCount} 张卡片
      </div>

      <div className="srs-home-summary__actions">
        <Button
          variant="solid"
          onClick={hasDueCards ? onStartTodayReview : undefined}
          className={hasDueCards ? undefined : "srs-btn-disabled"}
          style={{
            opacity: hasDueCards ? 1 : 0.5,
            cursor: hasDueCards ? "pointer" : "not-allowed",
            padding: "8px 24px"
          }}
        >
          开始今日复习
        </Button>
        <Button
          variant="plain"
          onClick={onShowDifficultCards}
          className="srs-difficult-cards-button"
          style={{
            fontSize: "13px",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--orca-color-danger-6)"
          }}
          title="查看困难卡片"
        >
          <i className="ti ti-alert-triangle" />
          困难卡片
        </Button>
        <Button
          variant="plain"
          onClick={onRefresh}
          style={{ padding: "8px 12px" }}
          title="刷新数据"
        >
          <i className="ti ti-refresh" />
        </Button>
      </div>
    </div>
  )
}
