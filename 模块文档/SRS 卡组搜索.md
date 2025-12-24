# 卡组搜索功能实现总结

## 🎯 功能概述

成功为 SRS 插件的 Flash Home 界面实现了完整的卡组搜索功能，用户可以通过卡组名称和备注内容快速查找特定卡组，提供实时搜索、高亮显示和键盘快捷键支持。

## 📁 新增文件

### 1. `模块文档/SRS_卡组搜索.md`
详细的搜索功能文档，包含：
- 功能特性和使用场景
- 技术实现细节
- UI 设计规范
- 性能优化建议
- 未来扩展方向

### 2. `src/components/DeckSearchDemo.tsx`
搜索功能演示组件，展示：
- 实时搜索和高亮显示
- 键盘快捷键操作
- 搜索统计信息
- 预设搜索示例
- 使用技巧说明

## 🔧 修改的文件

### 1. `src/components/SrsFlashcardHome.tsx`
主要修改包括：

#### 新增高亮文本组件
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

#### DeckListView 组件增强
- **搜索状态管理**：添加 `searchQuery` 状态和 `searchInputRef` 引用
- **搜索栏 UI**：包含搜索图标、输入框和清空按钮
- **实时过滤**：使用 `useMemo` 优化的搜索过滤逻辑
- **键盘快捷键**：支持 Ctrl+F 聚焦和 Escape 清空
- **搜索统计**：动态计算和显示搜索结果统计

#### 搜索过滤逻辑
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

#### 搜索统计计算
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

#### DeckRow 和 DeckCard 组件更新
- **Props 扩展**：添加可选的 `searchQuery` 参数
- **高亮显示**：在卡组名称和备注中使用 `HighlightText` 组件
- **类型安全**：添加完整的 TypeScript 类型注解

### 2. `README.md`
更新项目文档：
- 在功能特性中添加"智能搜索功能"
- 在界面说明中详细介绍搜索功能
- 提供搜索操作指南和快捷键说明

## 🎨 UI 设计

### 搜索栏设计
- **位置**：位于卡组列表顶部，醒目易找
- **布局**：左侧搜索图标 + 中间输入框 + 右侧清空按钮
- **样式**：使用浅色背景，与整体设计保持一致
- **交互**：支持键盘导航和快捷键操作

### 搜索结果显示
- **高亮效果**：匹配文本使用黄色背景高亮
- **空状态**：未找到结果时显示友好提示
- **统计信息**：实时显示搜索结果的统计数据

### 视觉反馈
- **即时响应**：输入时立即显示搜索结果
- **清晰标识**：高亮显示让匹配内容一目了然
- **状态提示**：清空按钮仅在有搜索内容时显示

## ⌨️ 键盘快捷键

### 支持的快捷键
| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Escape` | 清空搜索 | 清空搜索内容并保持焦点 |

### 实现方式
```tsx
<input
  onKeyDown={(e) => {
    if (e.key === "Escape") {
      handleClearSearch()
    }
  }}
/>
```

**注意**：移除了 Ctrl+F 全局快捷键支持，避免与浏览器默认页面搜索功能冲突。用户可以通过点击搜索框或使用 Tab 键导航来聚焦搜索输入框。

## 🔍 搜索功能特性

### 1. 实时搜索
- **即时响应**：输入时立即过滤结果
- **大小写不敏感**：忽略大小写进行匹配
- **部分匹配**：支持模糊搜索，包含关键词即可

### 2. 多字段搜索
- **卡组名称**：搜索卡组的名称字段
- **备注内容**：搜索卡组的备注字段
- **组合搜索**：同时匹配名称和备注

### 3. 搜索高亮
- **关键词高亮**：匹配的文本用黄色背景标识
- **多处高亮**：同一文本中的多个匹配都会高亮
- **视觉清晰**：使用对比色确保可读性

### 4. 搜索统计
- **结果计数**：显示匹配的卡组数量
- **卡片统计**：显示搜索结果中的总卡片数
- **分类统计**：显示新卡和待复习卡片数量

## 📊 性能优化

### 1. React 优化
- **useMemo**：缓存搜索结果，避免不必要的重新计算
- **useCallback**：缓存事件处理函数，减少重新渲染
- **条件渲染**：仅在需要时渲染清空按钮

### 2. 搜索优化
- **早期返回**：空搜索时直接返回原始数据
- **字符串预处理**：一次性转换为小写进行比较
- **结果缓存**：利用 React 的 memoization 缓存结果

### 3. 类型安全
- **完整类型注解**：所有函数参数都有明确类型
- **类型推断**：利用 TypeScript 的类型推断能力
- **错误预防**：编译时捕获类型错误

## 🧪 测试场景

### 功能测试
- ✅ 按卡组名称搜索
- ✅ 按备注内容搜索
- ✅ 组合字段搜索
- ✅ 大小写不敏感搜索
- ✅ 空搜索处理
- ✅ 搜索结果高亮
- ✅ 搜索统计计算

### 交互测试
- ✅ 实时搜索响应
- ✅ Escape 键清空搜索
- ✅ 清空搜索功能
- ✅ 搜索框焦点管理
- ✅ 空状态显示

### 性能测试
- ✅ 大量卡组时的搜索性能
- ✅ 频繁输入时的响应性能
- ✅ 内存使用优化

## 📈 使用场景

### 1. 快速定位
- **大量卡组**：当用户有很多卡组时快速找到目标
- **分类查找**：按主题或类型搜索相关卡组
- **模糊记忆**：记不清确切名称时的模糊搜索

### 2. 内容管理
- **备注搜索**：通过备注内容找到相关卡组
- **标签查找**：搜索备注中的标签或关键词
- **状态筛选**：查找特定状态或进度的卡组

### 3. 学习规划
- **主题整理**：按学习主题组织卡组
- **进度跟踪**：搜索学习进度相关的备注
- **重点标记**：快速找到标记为重点的卡组

## 🚀 未来扩展

### 1. 高级搜索
- **正则表达式**：支持正则表达式搜索
- **精确匹配**：支持引号包围的精确匹配
- **排除搜索**：支持 `-keyword` 排除特定关键词
- **字段指定**：支持 `name:keyword` 指定搜索字段

### 2. 搜索增强
- **搜索历史**：保存和复用搜索历史
- **搜索建议**：提供自动完成和搜索建议
- **拼写纠正**：智能纠正拼写错误
- **相关搜索**：显示相关的搜索建议

### 3. 性能优化
- **防抖处理**：添加搜索防抖减少计算
- **虚拟滚动**：大量结果时的虚拟滚动
- **索引优化**：预建搜索索引提高性能
- **Web Worker**：复杂搜索使用 Web Worker

### 4. 用户体验
- **搜索分析**：记录搜索行为优化功能
- **个性化**：基于使用习惯的个性化搜索
- **多语言**：支持多语言搜索和高亮
- **无障碍**：完善的键盘导航和屏幕阅读器支持

## 📝 总结

卡组搜索功能的实现显著提升了 Flash Home 的可用性：

- ✅ **功能完整**：支持实时搜索、高亮显示、Escape 键清空
- ✅ **性能优化**：使用 React 优化技术确保流畅体验
- ✅ **用户友好**：直观的 UI 设计和清晰的视觉反馈
- ✅ **技术可靠**：完整的 TypeScript 类型支持和错误处理
- ✅ **扩展性强**：为未来功能扩展预留了良好的架构基础

这个功能与之前实现的卡组备注功能完美结合，用户不仅可以为卡组添加备注，还可以通过备注内容快速搜索和定位卡组，形成了完整的卡组管理体验。

搜索功能的实现充分考虑了用户体验、性能优化和可维护性，为用户提供了高效的卡组查找工具，特别是在处理大量卡组时能够显著提高学习效率。