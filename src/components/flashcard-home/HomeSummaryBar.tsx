import type { TodayStats } from "../../srs/types"
import StatCard from "./StatCard"

const { Button } = orca.components

export type HomeSummaryBarProps = {
  todayStats: TodayStats
  onStartTodayReview: () => void
  onShowDifficultCards: () => void
  onRefresh: () => void
}

export default function HomeSummaryBar({
  todayStats,
  onStartTodayReview,
  onShowDifficultCards,
  onRefresh
}: HomeSummaryBarProps) {
  const hasDueCards = todayStats.pendingCount > 0 || todayStats.newCount > 0
  const backlogCount = todayStats.pendingCount - todayStats.todayCount

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      alignItems: "center"
    }}>
      {/* 三枚统计卡：新卡 / 今日到期 / 积压 */}
      <div style={{
        display: "flex",
        gap: "12px",
        justifyContent: "center",
        flexWrap: "wrap"
      }}>
        <StatCard
          label="新卡"
          value={todayStats.newCount}
          color="var(--orca-color-primary-6)"
        />
        <StatCard
          label="今日到期"
          value={todayStats.todayCount}
          color="var(--orca-color-danger-6)"
        />
        <StatCard
          label="积压"
          value={backlogCount}
          color="var(--orca-color-success-6)"
        />
      </div>

      <div style={{
        fontSize: "13px",
        color: "var(--orca-color-text-2)"
      }}>
        共 {todayStats.totalCount} 张卡片
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
        justifyContent: "center"
      }}>
        <Button
          variant="solid"
          onClick={hasDueCards ? onStartTodayReview : undefined}
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
