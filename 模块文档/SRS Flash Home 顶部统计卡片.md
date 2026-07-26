# Flash Home 卡库统计卡片（StatChip 计算口径）

> **文档同步日期：2026-07-26**  
> 「今日学习」改版（英雄卡 + 概览细带）后，`HomeSummaryBar` 结构：
> - **上半区「今日学习」英雄卡**：横向 hero = 左侧 **环形进度**（`TodayProgressRing`，已完成/总数百分比）+ 右侧统一 remaining、复习/阅读拆分（带 `ti-cards`/`ti-book-2` 图标语义色）、预计分钟；下接完成数、推荐语、10/20/30 分钟时间盒、开始/继续/恢复点错误处理。
> - **下半区「卡库概览细带」**（`.srs-home-summary__strip`）：单行内联 chip —— `✨新卡 · ⏰今日到期 · 📥积压 · 共 N 张`，取代原三枚盒式 `StatCard`（组件已删除）。chip 由 `HomeSummaryBar` 内联的 `StatChip` 渲染。  
> 主页布局、主按钮与数据加载的**权威描述**见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)；本文件只维护三项的**计算口径**，避免两份文档分叉。

## 三项概览（StatChip）

标签为 **新卡 / 今日到期 / 积压**（不再使用「未学习 / 学习中 / 待复习」），数据来自 `calculateHomeStats` 产出的 `TodayStats`：

| 标签 | 图标 | 计算 | 颜色 token | 含义 |
| ---- | ---- | ---- | ---------- | ---- |
| **新卡** | `ti-sparkles` | `todayStats.newCount` | `var(--orca-color-primary-6)` | 从未复习（`isNew`） |
| **今日到期** | `ti-clock` | `todayStats.todayCount` | `var(--orca-color-danger-6)` | 已到期且到期日在今天的复习卡 |
| **积压** | `ti-inbox` | `pendingCount - todayCount` | `var(--orca-color-success-6)` | 已到期且到期日早于今天 |

> 「今日到期」指「今天自然日内到期且已到点」的复习任务，**不是** FSRS 状态机里的 `learning` 状态。

三项 chip **可点击**（`onStatClick`）：进入全局 `CardListView`（全部牌组）并应用对应筛选（新卡 / today / overdue），映射见 `homeStatNav.ts`。`共 N 张` 为 `todayStats.totalCount`，不可点击。

## 环形进度（TodayProgressRing）

`src/components/flashcard-home/TodayProgressRing.tsx` —— 纯 SVG donut，数据仅取 `TodayLearningSummary`：

| 状态 | 条件 | 呈现 |
| ---- | ---- | ---- |
| `ok` | `loadStatus==="ok"` 且 `completedUnified!=null` 且 `remainingTotal!=null` | 进度弧 = `completed/(completed+remaining)`，心内百分比 |
| `done` | `isDone`（`empty` 或 `ok && remainingTotal===0`） | 满环 + `ti-check` |
| `unknown` | partial / 任一为 null | 灰色虚线占位环，心内 `—`（**禁止把 lower-bound 当真实进度**，遵守 `todayLearningSummary` 口径） |

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

## 数据加载（口径提示，权威见卡片浏览器文档）

`SrsFlashcardHome.applyLoaded` 经 `loadFlashHomeData` 拿到 `cards` 后计算 `TodayStats`；同一轮还会加载 **今日学习摘要**（`loadTodayLearningSummaryCached`，经 `deps.collectReviewCards` 注入**复用本轮 cards**，避免 SRS 全量收集连跑两遍）与 **resume 恢复点**（`loadTodayLearningResume`）。旧描述「loadData 仅 collectReviewCards」已失效。

主按钮文案为「开始今日学习 / 继续上次学习 / 今天已完成 / 启动中…」（`HomeSummaryBar.primaryLabel`）；「开始今日复习」按钮**不存在**。

## 与其他统计的关系

| 数据 | 用途 |
| ---- | ---- |
| `TodayStats`（`deckUtils.calculateHomeStats`） | 卡库概览三卡、「共 N 张记忆卡」 |
| `TodayLearningSummary`（`todayLearningSummary.ts`） | 上半区「今日学习」hero：统一 remaining / 预计分钟 / 完成数 |
| Deck 行「新卡 / 今日到期 / 积压」 | 单 Deck：`newCount` / `todayCount` / `overdueCount`（`calculateDeckStats` 与上表同语义） |

> 原 `TodayStatistics`（`statisticsManager`）与学习统计页、Dashboard 热力图等 **已从 Flash Home 移除**，不再作为本模块数据源。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/flashcard-home/TodayProgressRing.tsx` | 今日学习环形进度（SVG donut） |
| `src/components/flashcard-home/HomeSummaryBar.tsx` | 今日学习英雄卡 + 概览细带（内联 `StatChip`） |
| `src/components/flashcard-home/homeStatNav.ts` | 概览 chip 点击 → 全局筛选映射 |
| `src/srs/deckUtils.ts` | `calculateHomeStats` |
| `src/srs/types.ts` | `TodayStats` |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | 「今日学习」主页权威文档（布局 / 主按钮 / 数据流） |
