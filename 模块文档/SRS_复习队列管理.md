# SRS 复习队列管理模块

## 概述

本模块负责复习队列的构建和管理，包括收集待复习卡片、生成复习顺序、管理复习会话块。

### 核心价值

- 智能排序复习顺序
- 两旧一新的交织策略
- 管理复习会话的生命周期

## 技术实现

### 核心文件

- [main.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/main.ts)（队列管理函数）
- [reviewSessionManager.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/reviewSessionManager.ts)（会话块管理）

### 核心函数

#### `collectSrsBlocks(): Promise<BlockWithRepr[]>`

收集所有 SRS 卡片块：

```mermaid
flowchart TD
    A[开始收集] --> B[查询 #card 标签块]
    B --> C{有结果?}
    C -->|是| D[合并状态中的卡片块]
    C -->|否| E[备用方案: get-all-blocks]
    E --> F[手动过滤 #card 标签]
    F --> D
    D --> G[去重返回]
```

#### `collectReviewCards(): Promise<ReviewCard[]>`

将块转换为 ReviewCard 对象：

```typescript
// 返回结构
{
  id: DbId,       // 块 ID
  front: string,  // 题目
  back: string,   // 答案
  srs: SrsState,  // SRS 状态
  isNew: boolean, // 是否新卡
  deck: string    // Deck 名称
}
```

#### `buildReviewQueue(cards): ReviewCard[]`

构建复习队列，采用两旧一新策略：

```mermaid
flowchart LR
    A[到期卡片] --> B[队列]
    C[新卡片] --> B

    subgraph 交织策略
        D[旧1] --> E[旧2] --> F[新1] --> G[旧3] --> H[旧4] --> I[新2]
    end
```

#### `calculateDeckStats(cards): DeckStats`

计算各 Deck 的统计信息：

```typescript
// 返回结构
{
  decks: DeckInfo[],   // 各 Deck 信息
  totalCards: number,  // 总卡片数
  totalNew: number,    // 总新卡数
  totalOverdue: number // 总到期数
}
```

### 会话块管理

#### `getOrCreateReviewSessionBlock(pluginName): Promise<DbId>`

获取或创建复习会话块：

1. 检查内存中是否已有会话块
2. 检查插件数据存储
3. 创建新会话块

#### `cleanupReviewSessionBlock(pluginName): Promise<void>`

清理复习会话块记录：

- 重置内存中的块 ID
- 清除插件数据存储

### 复习队列策略

#### 两旧一新交织

```
输入：
- 到期卡片：[A, B, C, D, E]
- 新卡片：[1, 2, 3]

输出队列：
[A, B, 1, C, D, 2, E, 3]
```

#### 到期判定

- 新卡：`lastReviewed === null` 或 `reps === 0`
- 到期：`due <= 当前时间`
- 未到期：不进入本次队列

### 面板管理

#### `startReviewSession(deckName?)`

启动复习会话：

1. 获取/创建复习会话块
2. 记录当前面板为主面板
3. 在右侧创建复习面板
4. 调整面板宽度比例

```mermaid
flowchart TD
    A[开始] --> B[获取会话块]
    B --> C[记录主面板 ID]
    C --> D{右侧有面板?}
    D -->|否| E[创建右侧面板]
    D -->|是| F[复用右侧面板]
    E --> G[调整面板宽度]
    F --> G
    G --> H[切换焦点]
```

## 辅助函数

| 函数                       | 说明                  |
| -------------------------- | --------------------- |
| `isSrsCardBlock(block)`    | 判断是否为 SRS 卡片块 |
| `getFirstChildText(block)` | 获取第一个子块文本    |
| `resolveFrontBack(block)`  | 解析题目和答案        |
| `removeHashTags(text)`     | 移除文本中的 # 标签   |
| `extractDeckName(block)`   | 提取 Deck 名称        |

## 扩展点

1. **筛选策略**：可扩展按 Deck、标签筛选
2. **优先级算法**：可扩展更复杂的排序算法
3. **学习限制**：可扩展每日新卡/复习卡上限

## 相关文件

| 文件                                                                                               | 说明            |
| -------------------------------------------------------------------------------------------------- | --------------- |
| [main.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/main.ts)                                     | 队列管理函数    |
| [reviewSessionManager.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/reviewSessionManager.ts) | 会话块管理      |
| [types.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/types.ts)                               | ReviewCard 类型 |
