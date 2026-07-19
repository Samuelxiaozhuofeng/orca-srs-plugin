# SRS 卡组搜索

> **文档同步日期：2026-07-19**  
> **权威文档**。历史实现总结见 [SRS 卡组搜索.md](SRS%20卡组搜索.md)（已降级为摘要）。

## 概述

在 Flash Home **主页下半区**的卡组列表（`DeckListView`）内按卡组 **名称** 与 **备注** 实时过滤，并对匹配片段高亮。

主页编排见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)（`FlashHomePage` = `HomeSummaryBar` + `DeckListView`）。

## 功能

| 能力 | 行为 |
| ---- | ---- |
| 实时过滤 | 输入即 `useMemo` 过滤，无独立防抖 |
| 字段 | `deck.name`、`deck.note`（可选） |
| 匹配 | 小写 `includes`，部分匹配 |
| 高亮 | `HighlightText`，`var(--orca-color-warning-2/7)` |
| Escape | 清空查询并 `focus` 输入框 |
| 清空按钮 | 有内容时显示 |
| 结果提示 | 有查询时安静行「匹配 n 个卡组」 |
| 空结果 | 图标 +「未找到匹配的卡组」 |
| 无限滚动 | 搜索变更时重置 `displayCount`（每页 15） |

**不提供** 全局 Ctrl+F（避免与浏览器/宿主搜索冲突）。占位符为「搜索卡组名称或备注内容...」（无快捷键文案）。

## 实现位置

| 文件 | 说明 |
| ---- | ---- |
| `src/components/flashcard-home/DeckListView.tsx` | `searchQuery` / `searchInputRef` / `filteredDecks` |
| `src/components/flashcard-home/HighlightText.tsx` | 高亮片段 |
| `src/components/flashcard-home/DeckRow.tsx` | 接收 `searchQuery` 高亮名称与备注 |

演示组件 `DeckSearchDemo` 已删除；行为以 `DeckListView` 为准。

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

## 依赖

- 备注字段由 [SRS_卡组备注.md](SRS_卡组备注.md) 在 `loadData` 时合并；无备注时仅能按名称搜。
- 全局三卡 / 开始复习等不在搜索区，见 `HomeSummaryBar`。

## 性能说明

- 当前实现适合中等数量卡组；无防抖、无搜索索引、无虚拟列表（仅分页切片）。
- 文档中「未来可做」的正则/历史/防抖等 **尚未落地**，勿当已实现。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/flashcard-home/DeckListView.tsx` | 搜索 UI 与逻辑 |
| `src/components/flashcard-home/HighlightText.tsx` | 高亮 |
| `src/components/flashcard-home/DeckRow.tsx` | 行内高亮 |

| `src/srs/deckNoteManager.ts` | 备注数据来源 |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | Flash Home |
