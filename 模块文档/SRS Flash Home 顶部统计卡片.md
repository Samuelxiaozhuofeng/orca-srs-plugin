# Flash Home 顶部统计卡片

> **文档同步日期：2026-07-13**  
> 描述 `DeckListView` 顶部三枚 `StatCard` 的现行行为；演示页见 `HomeStatsDemo.tsx`。

## 概述

在 **卡组列表视图**（`viewMode === "deck-list"`）顶部展示三张统计卡片，对应 `calculateHomeStats` 产出的 `TodayStats`，帮助用户一眼区分新卡、今日到期与积压。

默认 **主页 Dashboard** 使用问候区 + `dueCards`/`newCards` 文案，**不**复用这三枚 `StatCard`。

## 三张卡片

| 标签 | 计算 | 颜色 token | 含义 |
| ---- | ---- | ---------- | ---- |
| 未学习 | `todayStats.newCount` | `var(--orca-color-primary-6)` | 从未复习（`isNew`） |
| 学习中 | `todayStats.todayCount` | `var(--orca-color-danger-6)` | 已到期且到期日在今天的复习卡 |
| 待复习 | `pendingCount - todayCount` | `var(--orca-color-success-6)` | 已到期且到期日早于今天（积压） |

> 文案「学习中」在 UI 中指「今天到期且已到点」的复习任务，不是 FSRS 状态机里的 `learning` 状态。

## 数据定义

`src/srs/types.ts`：

```typescript
export type TodayStats = {
  pendingCount: number  // due <= now 的非新卡
  todayCount: number    // 其中 due 落在今天自然日
  newCount: number
  totalCount: number
}
```

`calculateHomeStats`（`src/srs/deckUtils.ts`）要点：

- 新卡只计入 `newCount`，不进 `pendingCount` / `todayCount`。
- 到期判断使用 **当前时刻** `due.getTime() <= now`，不是「今天 23:59:59」。
- 今天自然日：`[today 00:00, tomorrow 00:00)`。
- 未来未到点的卡不计入任何待办字段。

## 实现位置

- 组件：`SrsFlashcardHome.tsx` 内 `StatCard` + `DeckListView` 顶部 flex 区域。
- 数据：主组件 `loadData` / 静默刷新中调用 `calculateHomeStats`，经 props 传入 `DeckListView`。
- 演示：`src/components/HomeStatsDemo.tsx`（独立 demo，不进主路径）。

布局：`display: flex`、`gap: 12px`、`justifyContent: center`、`flexWrap: wrap`；卡片 `minWidth: 80px`，背景 `var(--orca-color-bg-2)`。

## 与其他统计的关系

| 数据 | 用途 |
| ---- | ---- |
| `TodayStats`（deckUtils） | 卡组页顶部三卡、底部「共 N 张…」、是否可「开始今日复习」 |
| `TodayStatistics`（statisticsManager） | 今日已复习/新学/重学/用时与评分分布，供 Dashboard/StatisticsView |
| Deck 行「未学习/学习中/待复习」 | 按 **单 Deck** 的 `newCount` / `todayCount` / `overdueCount`（`calculateDeckStats`） |

## 用户体验（现行）

- 打开「卡组」页即可看到全局待办拆分，无需进入统计页。
- 颜色语义：蓝=新内容，红=今日到期，绿=积压。
- 当前 **不可点击** 跳转筛选；筛选需进入具体 Deck 的 `CardListView`。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/SrsFlashcardHome.tsx` | `StatCard`、`DeckListView` |
| `src/srs/deckUtils.ts` | `calculateHomeStats` |
| `src/srs/types.ts` | `TodayStats` |
| `src/components/HomeStatsDemo.tsx` | 演示组件 |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | Flash Home 总览 |
