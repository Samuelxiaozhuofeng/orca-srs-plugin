# Flash Home 卡库统计卡片（StatCard 计算口径）

> **文档同步日期：2026-07-26**  
> 「今日学习」改版后，三枚 `StatCard` **不再是主页上半区主体**：`HomeSummaryBar` 上半区现为「今日学习」hero（统一 remaining、复习/阅读拆分、预计分钟、10/20/30 分钟时间盒、开始/继续/恢复点错误处理），三卡降级到次级 **「卡库概览」** 区（`.srs-home-summary__secondary`，下方另有「共 N 张记忆卡」）。  
> 主页布局、主按钮与数据加载的**权威描述**见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)；本文件只维护三卡的**计算口径**，避免两份文档分叉。

## 三张卡片

标签为 **新卡 / 今日到期 / 积压**（不再使用「未学习 / 学习中 / 待复习」），数据来自 `calculateHomeStats` 产出的 `TodayStats`：

| 标签 | 计算 | 颜色 token | 含义 |
| ---- | ---- | ---------- | ---- |
| **新卡** | `todayStats.newCount` | `var(--orca-color-primary-6)` | 从未复习（`isNew`） |
| **今日到期** | `todayStats.todayCount` | `var(--orca-color-danger-6)` | 已到期且到期日在今天的复习卡 |
| **积压** | `pendingCount - todayCount` | `var(--orca-color-success-6)` | 已到期且到期日早于今天 |

> 「今日到期」指「今天自然日内到期且已到点」的复习任务，**不是** FSRS 状态机里的 `learning` 状态。

三卡 **可点击**（`onStatClick`）：进入全局 `CardListView`（全部牌组）并应用对应筛选（新卡 / today / overdue），映射见 `homeStatNav.ts`。

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
| `src/components/flashcard-home/StatCard.tsx` | 单枚统计卡展示 |
| `src/components/flashcard-home/HomeSummaryBar.tsx` | 今日学习 hero + 次级「卡库概览」三卡 |
| `src/components/flashcard-home/homeStatNav.ts` | 三卡点击 → 全局筛选映射 |
| `src/srs/deckUtils.ts` | `calculateHomeStats` |
| `src/srs/types.ts` | `TodayStats` |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | 「今日学习」主页权威文档（布局 / 主按钮 / 数据流） |
