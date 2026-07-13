# SRS 卡组搜索

> **文档同步日期：2026-07-13**  
> **权威文档**。历史实现总结见 [SRS 卡组搜索.md](SRS%20卡组搜索.md)（已降级为摘要）。

## 概述

在 Flash Home **卡组列表**（`DeckListView`）内按卡组 **名称** 与 **备注** 实时过滤，并对匹配片段高亮。

## 功能

| 能力 | 行为 |
| ---- | ---- |
| 实时过滤 | 输入即 `useMemo` 过滤，无独立防抖 |
| 字段 | `deck.name`、`deck.note`（可选） |
| 匹配 | 小写 `includes`，部分匹配 |
| 高亮 | `HighlightText`，`var(--orca-color-warning-2/7)` |
| Escape | 清空查询并 `focus` 输入框 |
| 清空按钮 | 有内容时显示 |
| 结果统计 | 卡组数、总卡数、新卡、待复习（`overdue + today`） |
| 空结果 | 图标 +「未找到匹配的卡组」 |
| 无限滚动 | 搜索变更时重置 `displayCount`（每页 15） |

**不提供** 全局 Ctrl+F（避免与浏览器/宿主搜索冲突）。占位符为「搜索卡组名称或备注内容...」（无快捷键文案）。

## 实现位置

全部在 `src/components/SrsFlashcardHome.tsx`：

- `HighlightText`
- `DeckListView` 内 `searchQuery` / `searchInputRef` / `filteredDecks` / `searchStats`
- `DeckRow`（及未挂载的 `DeckCard`）接收 `searchQuery` 高亮名称与备注

演示组件：`src/components/DeckSearchDemo.tsx`。

### 过滤逻辑（现行）

```typescript
const filteredDecks = useMemo(() => {
  if (!searchQuery.trim()) return deckStats.decks
  const query = searchQuery.toLowerCase().trim()
  return deckStats.decks.filter((deck: DeckInfo) => {
    const nameMatch = deck.name.toLowerCase().includes(query)
    const noteMatch = deck.note?.toLowerCase().includes(query) || false
    return nameMatch || noteMatch
  })
}, [deckStats.decks, searchQuery])
```

### 搜索统计

- 无查询：全局 `todayStats` 与全量 Deck 数
- 有查询：对 `filteredDecks` 聚合 `totalCount` / `newCount` / (`overdueCount + todayCount`)

## 依赖

- 备注字段由 [SRS_卡组备注.md](SRS_卡组备注.md) 在 `loadData` 时合并；无备注时仅能按名称搜。

## 性能说明

- 当前实现适合中等数量卡组；无防抖、无搜索索引、无虚拟列表（仅分页切片）。
- 文档中「未来可做」的正则/历史/防抖等 **尚未落地**，勿当已实现。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/SrsFlashcardHome.tsx` | 搜索 UI 与逻辑 |
| `src/components/DeckSearchDemo.tsx` | 演示 |
| `src/srs/deckNoteManager.ts` | 备注数据来源 |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | Flash Home |
