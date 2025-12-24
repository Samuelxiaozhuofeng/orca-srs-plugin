# SRS 卡组备注模块

## 概述

卡组备注模块提供了为每个卡组添加、编辑和管理备注的功能。备注信息存储在插件数据中，与卡组名称关联。

## 功能特性

### 1. 备注管理

- **添加备注**：为卡组添加文本备注
- **编辑备注**：修改现有的卡组备注
- **删除备注**：清空卡组备注
- **查看备注**：在卡组列表中显示备注信息

### 2. 数据存储

备注数据使用 `orca.plugins.getData/setData` API 存储，存储结构如下：

```typescript
{
  "deckNotes": {
    "卡组名称1": "备注内容1",
    "卡组名称2": "备注内容2",
    ...
  }
}
```

### 3. UI 交互

#### 卡组列表视图（表格模式）

- 在每个卡组行中显示备注按钮（笔记图标）
- 点击备注按钮展开编辑区域
- 编辑区域包含：
  - 输入框（单行文本）
  - 取消按钮
  - 保存按钮
- 如果卡组有备注，在卡组名称下方显示备注内容（灰色小字）
- 点击备注内容可以快速进入编辑模式

#### 卡组卡片视图（卡片模式）

- 如果卡组有备注，在卡片中显示备注区域
- 备注区域样式：
  - 浅色背景
  - 圆角边框
  - 可点击编辑
- 编辑模式：
  - 多行文本框
  - 取消和保存按钮
- 如果没有备注，显示"添加备注"按钮

## API 文档

### `getDeckNote(pluginName, deckName)`

获取指定卡组的备注。

**参数：**
- `pluginName: string` - 插件名称
- `deckName: string` - 卡组名称

**返回：**
- `Promise<string>` - 备注内容，如果没有则返回空字符串

**示例：**
```typescript
const note = await getDeckNote("my-plugin", "Default")
console.log(note) // "这是默认卡组的备注"
```

### `setDeckNote(pluginName, deckName, note)`

设置指定卡组的备注。

**参数：**
- `pluginName: string` - 插件名称
- `deckName: string` - 卡组名称
- `note: string` - 备注内容（会自动 trim，如果为空则删除备注）

**返回：**
- `Promise<void>`

**示例：**
```typescript
await setDeckNote("my-plugin", "Default", "这是一个重要的卡组")
```

### `deleteDeckNote(pluginName, deckName)`

删除指定卡组的备注。

**参数：**
- `pluginName: string` - 插件名称
- `deckName: string` - 卡组名称

**返回：**
- `Promise<void>`

**示例：**
```typescript
await deleteDeckNote("my-plugin", "Default")
```

### `getAllDeckNotes(pluginName)`

获取所有卡组的备注。

**参数：**
- `pluginName: string` - 插件名称

**返回：**
- `Promise<DeckNotesData>` - 卡组名称到备注的映射对象

**示例：**
```typescript
const allNotes = await getAllDeckNotes("my-plugin")
console.log(allNotes)
// {
//   "Default": "默认卡组备注",
//   "英语": "英语学习卡组"
// }
```

### `renameDeckNote(pluginName, oldDeckName, newDeckName)`

重命名卡组时更新备注的关联。

**参数：**
- `pluginName: string` - 插件名称
- `oldDeckName: string` - 旧卡组名称
- `newDeckName: string` - 新卡组名称

**返回：**
- `Promise<void>`

**示例：**
```typescript
await renameDeckNote("my-plugin", "旧名称", "新名称")
```

## 数据类型

### `DeckInfo` 扩展

在 `src/srs/types.ts` 中，`DeckInfo` 类型已扩展以包含备注字段：

```typescript
export type DeckInfo = {
  name: string              // deck 名称
  totalCount: number        // 总卡片数
  newCount: number          // 新卡数
  overdueCount: number      // 已到期数
  todayCount: number        // 今天到期数
  futureCount: number       // 未来到期数
  note?: string             // 卡组备注（新增）
}
```

## 实现细节

### 1. 数据加载

在 `SrsFlashcardHome` 组件的 `loadData` 函数中：

1. 调用 `calculateDeckStats(cards)` 计算卡组统计
2. 调用 `getAllDeckNotes(pluginName)` 获取所有备注
3. 将备注数据合并到卡组统计中

```typescript
const stats = calculateDeckStats(cards)
const deckNotes = await getAllDeckNotes(pluginName)
const enhancedStats = {
  ...stats,
  decks: stats.decks.map(deck => ({
    ...deck,
    note: deckNotes[deck.name] || ""
  }))
}
```

### 2. 状态管理

使用 React 的 `useState` 管理备注编辑状态：

- `isEditingNote: boolean` - 是否处于编辑模式
- `noteText: string` - 当前编辑的备注文本

### 3. 保存流程

1. 用户点击保存按钮
2. 调用 `setDeckNote` 保存到插件数据
3. 调用 `onNoteChange` 回调更新父组件状态
4. 退出编辑模式

### 4. 取消流程

1. 用户点击取消按钮
2. 恢复 `noteText` 为原始值
3. 退出编辑模式

## 使用场景

1. **学习计划**：记录卡组的学习目标和计划
2. **进度追踪**：记录学习进度和里程碑
3. **内容说明**：描述卡组的内容范围和特点
4. **提醒事项**：记录需要注意的事项
5. **学习心得**：记录学习过程中的感悟

## 注意事项

1. **备注长度**：建议备注内容不要过长，以保持界面整洁
2. **特殊字符**：备注支持任意 Unicode 字符，包括换行符
3. **数据持久化**：备注数据存储在插件数据中，卸载插件会丢失
4. **卡组重命名**：如果需要重命名卡组，应使用 `renameDeckNote` 函数同步更新备注
5. **性能考虑**：所有备注在加载时一次性获取，避免频繁的数据库查询

## 未来改进

1. **富文本支持**：支持 Markdown 格式的备注
2. **备注模板**：提供常用备注模板
3. **备注搜索**：支持按备注内容搜索卡组
4. **备注历史**：记录备注的修改历史
5. **备注导出**：支持导出所有卡组备注
