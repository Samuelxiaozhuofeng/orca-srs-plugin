# SRS 卡组搜索模块

## 概述

卡组搜索模块为 Flash Home 界面提供了强大的搜索功能，用户可以快速查找特定的卡组，支持按卡组名称和备注内容进行搜索，并提供实时搜索结果高亮显示。

## 功能特性

### 1. 实时搜索

- **即时响应**：输入时实时过滤卡组列表
- **多字段搜索**：同时搜索卡组名称和备注内容
- **大小写不敏感**：忽略大小写进行匹配
- **部分匹配**：支持模糊搜索，包含关键词即可匹配

### 2. 搜索高亮

- **关键词高亮**：在搜索结果中高亮显示匹配的关键词
- **视觉反馈**：使用黄色背景突出显示匹配文本
- **多处高亮**：同一文本中的多个匹配都会被高亮

### 3. 键盘快捷键

- **Escape**：清空搜索内容并保持焦点
- **输入框焦点**：点击搜索框或使用 Tab 键导航

### 4. 搜索统计

- **结果统计**：显示匹配的卡组数量和卡片统计
- **动态更新**：搜索结果变化时实时更新统计信息
- **详细信息**：显示新卡、待复习卡片数量

## UI 设计

### 搜索栏

位于卡组列表顶部，包含：

- **搜索图标**：左侧的放大镜图标
- **输入框**：支持实时输入和快捷键
- **清空按钮**：有搜索内容时显示，点击清空搜索
- **占位符提示**：显示搜索提示和快捷键

```tsx
<div style={{
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px",
  backgroundColor: "var(--orca-color-bg-2)",
  borderRadius: "8px",
  border: "1px solid var(--orca-color-border-1)"
}}>
  <i className="ti ti-search" />
  <input placeholder="搜索卡组名称或备注内容... (Ctrl+F)" />
  <Button variant="plain" title="清空搜索">
    <i className="ti ti-x" />
  </Button>
</div>
```

### 搜索结果

- **空状态**：未找到匹配结果时显示友好提示
- **高亮显示**：匹配的文本使用黄色背景高亮
- **统计更新**：底部统计信息反映搜索结果

### 空状态设计

```tsx
<div style={{ textAlign: "center", padding: "24px" }}>
  <i className="ti ti-search-off" style={{ fontSize: "24px", opacity: 0.5 }} />
  <div>未找到匹配的卡组</div>
  <div style={{ fontSize: "12px", opacity: 0.7 }}>
    尝试搜索卡组名称或备注内容
  </div>
</div>
```

## 技术实现

### 1. 搜索状态管理

使用 React hooks 管理搜索状态：

```tsx
const [searchQuery, setSearchQuery] = useState("")
const searchInputRef = useRef<HTMLInputElement>(null)
```

### 2. 搜索过滤逻辑

使用 `useMemo` 优化性能，避免不必要的重新计算：

```tsx
const filteredDecks = useMemo(() => {
  if (!searchQuery.trim()) {
    return deckStats.decks
  }

  const query = searchQuery.toLowerCase().trim()
  return deckStats.decks.filter((deck: DeckInfo) => {
    const nameMatch = deck.name.toLowerCase().includes(query)
    const noteMatch = deck.note?.toLowerCase().includes(query) || false
    return nameMatch || noteMatch
  })
}, [deckStats.decks, searchQuery])
```

### 3. 高亮组件

创建可复用的高亮文本组件：

```tsx
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>
  }

  const parts = text.split(new RegExp(`(${query})`, "gi"))
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={index} style={{
            backgroundColor: "var(--orca-color-warning-2)",
            color: "var(--orca-color-warning-7)",
            fontWeight: 600,
            padding: "0 2px",
            borderRadius: "2px"
          }}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}
```

### 4. 键盘事件处理

在搜索输入框中处理键盘事件：

```tsx
<input
  onKeyDown={(e) => {
    if (e.key === "Escape") {
      handleClearSearch()
    }
  }}
/>
```

注意：移除了全局 Ctrl+F 快捷键支持，避免与浏览器默认页面搜索功能冲突。

### 5. 搜索统计计算

动态计算搜索结果的统计信息：

```tsx
const searchStats = useMemo(() => {
  if (!searchQuery.trim()) {
    return {
      deckCount: deckStats.decks.length,
      totalCards: todayStats.totalCount,
      newCards: todayStats.newCount,
      pendingCards: todayStats.pendingCount
    }
  }

  const totalCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.totalCount, 0)
  const newCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.newCount, 0)
  const pendingCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.overdueCount + deck.todayCount, 0)

  return {
    deckCount: filteredDecks.length,
    totalCards,
    newCards,
    pendingCards
  }
}, [deckStats.decks, filteredDecks, todayStats, searchQuery])
```

## 使用场景

### 1. 快速定位

- **大量卡组**：当用户有很多卡组时，快速找到特定卡组
- **分类查找**：按主题或类型搜索相关卡组
- **备注搜索**：通过备注内容找到相关卡组

### 2. 学习管理

- **进度查找**：搜索备注中的进度关键词
- **主题筛选**：按学习主题过滤卡组
- **状态查询**：查找特定状态的卡组

### 3. 内容组织

- **标签搜索**：通过备注中的标签找到相关内容
- **难度筛选**：搜索难度相关的备注
- **时间管理**：查找特定时间段的学习内容

## 搜索示例

### 按名称搜索

- 输入 "英语" → 匹配 "英语词汇"、"商务英语" 等
- 输入 "数学" → 匹配 "高等数学"、"数学公式" 等

### 按备注搜索

- 输入 "重点" → 匹配备注中包含 "重点复习" 的卡组
- 输入 "困难" → 匹配备注中标记为困难的卡组
- 输入 "完成" → 匹配备注中记录完成状态的卡组

### 组合搜索

- 输入 "TOEFL" → 同时匹配名称和备注中的 TOEFL 相关内容
- 输入 "第一轮" → 匹配备注中记录学习进度的卡组

## 性能优化

### 1. 防抖处理

虽然当前实现是实时搜索，但可以考虑添加防抖来优化性能：

```tsx
const [debouncedQuery] = useDebounce(searchQuery, 300)
```

### 2. 虚拟滚动

对于大量卡组的情况，可以考虑实现虚拟滚动：

```tsx
// 只渲染可见区域的卡组
const visibleDecks = filteredDecks.slice(startIndex, endIndex)
```

### 3. 索引优化

可以预建索引来提高搜索性能：

```tsx
const searchIndex = useMemo(() => {
  return deckStats.decks.map(deck => ({
    ...deck,
    searchText: `${deck.name} ${deck.note || ""}`.toLowerCase()
  }))
}, [deckStats.decks])
```

## 未来扩展

### 1. 高级搜索

- **正则表达式**：支持正则表达式搜索
- **精确匹配**：支持引号包围的精确匹配
- **排除搜索**：支持 `-keyword` 排除特定关键词

### 2. 搜索历史

- **历史记录**：保存最近的搜索记录
- **快速选择**：点击历史记录快速搜索
- **清空历史**：提供清空历史记录的选项

### 3. 搜索建议

- **自动完成**：基于现有卡组名称提供搜索建议
- **拼写纠正**：提供拼写错误的纠正建议
- **相关搜索**：显示相关的搜索建议

### 4. 搜索分析

- **搜索统计**：记录用户的搜索行为
- **热门搜索**：显示最常搜索的关键词
- **搜索优化**：基于搜索数据优化功能

## 注意事项

### 1. 性能考虑

- 大量卡组时搜索可能较慢
- 考虑实现防抖或节流
- 避免在搜索过程中进行复杂计算

### 2. 用户体验

- 保持搜索状态的一致性
- 提供清晰的视觉反馈
- 确保键盘导航的可访问性

### 3. 数据一致性

- 确保搜索结果与实际数据同步
- 处理数据更新时的搜索状态
- 避免搜索过程中的数据竞态条件

## 总结

卡组搜索功能显著提升了 Flash Home 的可用性，特别是在处理大量卡组时。通过实时搜索、高亮显示和键盘快捷键，用户可以快速找到所需的卡组，提高学习效率。

该功能的实现充分考虑了性能、用户体验和可扩展性，为未来的功能扩展奠定了良好的基础。