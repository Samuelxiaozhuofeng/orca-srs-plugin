# Flash Home 顶部统计卡片

> **文档同步日期：2026-07-19**  
> 描述单页 Flash Home 上半区 `HomeSummaryBar` 三枚 `StatCard` 的行为。  
> 标签为 **新卡 / 今日到期 / 积压**（不再使用「未学习 / 学习中 / 待复习」）。

## 概述

在 **主页**（`viewMode === "home"`）上半区展示全局三张统计卡，对应 `calculateHomeStats` 产出的 `TodayStats`，帮助用户一眼区分新卡、今日到期与积压。

布局归属：

- 编排：`FlashHomePage`（上 `HomeSummaryBar` + 下 `DeckListView`）
- 三卡 UI：`HomeSummaryBar` → 复用 `StatCard`
- **不再**仅挂在 `DeckListView` 顶部；`DeckListView` 自身为精简卡组表，不重复嵌三卡

## 三张卡片

| 标签 | 计算 | 颜色 token | 含义 |
| ---- | ---- | ---------- | ---- |
| **新卡** | `todayStats.newCount` | `var(--orca-color-primary-6)` | 从未复习（`isNew`） |
| **今日到期** | `todayStats.todayCount` | `var(--orca-color-danger-6)` | 已到期且到期日在今天的复习卡 |
| **积压** | `pendingCount - todayCount` | `var(--orca-color-success-6)` | 已到期且到期日早于今天 |

> 「今日到期」指「今天自然日内到期且已到点」的复习任务，**不是** FSRS 状态机里的 `learning` 状态。

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

| 位置 | 说明 |
| ---- | ---- |
| `src/components/flashcard-home/HomeSummaryBar.tsx` | 顶部三卡 + 困难卡片入口等摘要动作 |
| `src/components/flashcard-home/StatCard.tsx` | 单枚统计卡展示 |
| `src/components/flashcard-home/FlashHomePage.tsx` | 将 `todayStats` 传入 `HomeSummaryBar` |
| `src/components/SrsFlashcardHome.tsx` | `loadData` / 静默刷新中调用 `calculateHomeStats` |

数据：`loadData` 仅 `collectReviewCards` → `calculateDeckStats` + notes → `calculateHomeStats`；**不再**加载 `getReviewHistory` / `getFutureForecast` / `getTodayStatistics`。

布局建议：`display: flex`、`gap: 12px`、`justifyContent: center`、`flexWrap: wrap`；卡片 `minWidth: 80px`，背景 `var(--orca-color-bg-2)`。

## 与其他统计的关系

| 数据 | 用途 |
| ---- | ---- |
| `TodayStats`（`deckUtils.calculateHomeStats`） | 主页三卡、「共 N 张…」、是否可「开始今日复习」 |
| Deck 行「新卡 / 今日到期 / 积压」 | 单 Deck：`newCount` / `todayCount` / `overdueCount`（`calculateDeckStats` 与上表同语义） |

> 原 `TodayStatistics`（`statisticsManager`）与学习统计页、Dashboard 热力图等 **已从 Flash Home 移除**，不再作为本模块数据源。会话进度时长累计仍走 `effectiveDurationFromReviewLog`（见数据存储文档）。

## 用户体验

- 打开 Flash Home 即见全局待办拆分 + 下方卡组列表，无需再切「卡组」页或进入统计页。
- 颜色语义：蓝=新内容，红=今日到期，绿=积压。
- 摘要区同时提供「开始今日复习」「困难卡片」「刷新」；困难卡返回主页。
- 三卡 **可点击**：进入全局 `CardListView`（全部牌组）并应用对应筛选（新卡 / today / overdue）。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/flashcard-home/HomeSummaryBar.tsx` | 顶部摘要 |
| `src/components/flashcard-home/StatCard.tsx` | 统计小卡 |
| `src/components/flashcard-home/FlashHomePage.tsx` | 主页编排 |
| `src/components/SrsFlashcardHome.tsx` | 数据加载与 `todayStats` 状态 |
| `src/srs/deckUtils.ts` | `calculateHomeStats` |
| `src/srs/types.ts` | `TodayStats` |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | Flash Home 总览 |
