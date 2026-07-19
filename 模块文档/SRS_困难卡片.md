# 困难卡片

> **文档同步日期：2026-07-19**
> 以 `difficultCardsManager.ts` + `DifficultCardsView.tsx` 为准。
> 列表：`DIFFICULT_CARDS_PAGE_SIZE=20` 无限滚动 + `DIFFICULT_CARDS_HARD_CAP=500` 硬上限（`difficultCardsPaging.ts`）。

## 概述

自动识别经常遗忘或算法难度偏高的卡片，在 Flash Home 中集中展示，并支持以固定队列方式专项复习。

## 入口

- **主页摘要区**（`HomeSummaryBar` / Flash Home 上半区）：「困难卡片」
- 切换 `viewMode` → `"difficult-cards"`，渲染 `DifficultCardsView`（全页次级视图）
- 「返回」→ `handleBack` → **`home`**（单页主页；不再回已删除的 `deck-list`）

## 判定标准

阈值在 `src/srs/difficultCardsManager.ts` 顶部常量（非用户设置）：

| 常量 | 默认 | 含义 |
| ---- | ---- | ---- |
| `RECENT_REVIEW_WINDOW` | 10 | 最近复习窗口 |
| `AGAIN_COUNT_THRESHOLD` | 3 | 窗口内 Again 次数 ≥ 此值 → `high_again_rate` |
| `LAPSES_THRESHOLD` | 3 | `srs.lapses` ≥ 此值 → `high_lapses` |
| `DIFFICULTY_THRESHOLD` | 7 | `srs.difficulty` ≥ 此值 → `high_difficulty` |
| `REVIEW_LOG_DAYS` | 30 | 拉取复习日志的回溯天数 |

规则：

1. **新卡**（`isNew`）永不计入。
2. 满足任一条件即困难；满足多项 → `reason = "multiple"`。
3. Again 次数来自 `analyzeRecentReviews` + 日志身份匹配（见下）。

## 日志身份匹配（FC-05）

`analyzeRecentReviews` **必须**用 `cardIdentity` 精确匹配，禁止 `includes`。

### 新日志（结构化 / non-legacy）

- 按 `cardKey` 等身份字段完全匹配。
- Cloze c1 的 Again 不计 c2；Direction / List 变体彼此独立。

### 旧日志（legacy）

- v1 或缺字段日志标记 `legacy: true`。
- 兼容：父 `blockId` 相同可匹配；List 旧日志曾用条目 ID 作 `cardId`，额外允许 `cardId === listItemId`。
- **限制**：同父块下变体可能共享 legacy Again 计数；新日志无此问题。

相关：`src/srs/cardIdentity.ts`、`src/srs/reviewLogStorage.ts`。

## API

```typescript
getDifficultCards(pluginName: string, deckName?: string): Promise<DifficultCardInfo[]>
getDifficultCardsStats(pluginName: string): Promise<DifficultCardsStats>
getDifficultCardsForReview(pluginName: string, deckName?: string, limit?: number): Promise<ReviewCard[]>
getDifficultReasonText(reason: DifficultReason): string
// + 颜色等展示辅助（manager 内导出）
```

### 数据结构

```typescript
interface DifficultCardInfo {
  card: ReviewCard
  reason: DifficultReason
  recentAgainCount: number
  totalLapses: number
  difficulty: number
  lastReviewDate: Date | null
}

type DifficultReason =
  | "high_again_rate"
  | "high_lapses"
  | "high_difficulty"
  | "multiple"

interface DifficultCardsStats {
  totalCount: number
  byReason: {
    highAgainRate: number
    highLapses: number
    highDifficulty: number
  }
  byDeck: Map<string, number>
}
```

`getDifficultCardsStats` 对 `multiple` 会按阈值再拆入各类 `byReason`。

## 排序

1. 原因优先级：`multiple` > `high_again_rate` > `high_lapses` > `high_difficulty`
2. 同原因：`totalLapses` 降序

## UI（DifficultCardsView）

1. 头部：返回、标题与总数、「复习困难卡片」（当前筛选非空时）
2. 说明文案：三类困难定义
3. 筛选标签：全部 / 频繁遗忘 / 遗忘次数多 / 难度较高
   - 选某一类时 **包含** `reason === "multiple"` 且满足该类条件的卡（UI 用 reason 或 multiple 计数）
4. 列表项：原因徽章、Deck 名、`SafeBlockPreview`、Again / 遗忘 / 难度、Cloze/Direction 标记
5. 点击卡片：`orca.nav.openInLastPanel("block", { blockId })`
6. 空状态：全部空时「太棒了！没有困难卡片」

列表 key 含 `id / clozeNumber / directionType / listItemId`，避免变体冲突。

## 专项复习流程

`SrsFlashcardHome.handleDifficultCardsReview`：

1. `createFixedRepeatSessionDescriptor({ cards, sourceBlockId: 0, sourceType: "children" })`（F2-01 约定）
2. `createRepeatReviewSession(...)`
3. `createReviewSessionBlockWithDescriptor(pluginName, descriptor)`
4. `orca.nav.openInLastPanel("block", { blockId: reviewBlockId })`

即走 **重复复习 / 固定队列** 会话，而非普通 `startReviewSession(deckName)`。

## 测试

- `src/srs/difficultCardsManager.test.ts`（含身份匹配与判定回归）

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/srs/difficultCardsManager.ts` | 判定、列表、统计、复习抽取 |
| `src/components/DifficultCardsView.tsx` | UI |
| `src/components/difficultCardsPaging.ts` | 分页常量与切片 |
| `src/components/SrsFlashcardHome.tsx` | 入口与复习启动 |
| `src/components/flashcard-home/HomeSummaryBar.tsx` | 主页摘要区入口 |
| `src/srs/cardIdentity.ts` | 日志匹配 |
| `src/srs/reviewLogStorage.ts` | 日志读写 |
| `src/srs/repeatReviewManager.ts` | 固定队列会话 |
| `src/srs/reviewSessionDescriptor.ts` | 会话描述符 |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | Flash Home 总览 |
