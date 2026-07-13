# SRS 列表卡

> **文档同步日期**：2026-07-13  
> **变更说明**：对照 `listCardCreator` / `cardCollector` / `SrsReviewSessionDemo` / `reviewCardGrading` 校正；补充身份、评分路径与相关文件。

---

## 概述

列表卡把一个列表按**直接子块**顺序逐条推送复习。每条条目在**子块自身**上保存独立 FSRS 状态。

核心规则：

- 条目来源：父块 `children`（直接子块）
- **Good / Easy**：解锁并继续推送下一条（正式复习）
- **Again / Hard**：
  - 正式调度：将后续条目中 due 早于「明天零点」的统一推到明天零点
  - 当日会话：仍可把后续条目加入队列作为**辅助预览**（`isAuxiliaryPreview`），评分不写日志、不更新 SRS、不计入统计

---

## 创建方式

- 斜杠命令：`列表卡（子块作为条目）` → `${pluginName}.createListCard`
- 实现：`createListCardFromBlock(cursor, pluginName)`（`listCardCreator.ts`）

创建后：

- 父块：`#card(type=list)`，`srs.isCard = true`
- 子块：若尚无任何 `srs.*` 属性，第 1 条 due=今天零点，其余=明天零点
- 无子块也可先创建，提示用户添加子块；收集时再 `ensureCardSrsStateWithInitialDue`

`scanCardsFromTags` **跳过** list（不转换 `_repr`）。

---

## 数据结构与存储

### 父块（容器）

| 项 | 说明 |
| -- | ---- |
| 标签 | `#card(type=list)` |
| 顺序 | `children` 当前顺序 |
| 身份中的 blockId | 父列表根块 |

### 子块（条目）

| 项 | 说明 |
| -- | ---- |
| SRS | 普通 `srs.*` 属性（与 basic 相同前缀） |
| 身份 | `listItemId` = 子块 ID |
| 进度稳定性 | 改文本/重排不丢进度；新增子块视为新条目 |

### ReviewCard 字段

```typescript
{
  id: blockId,              // 父块
  cardType: "list",
  listItemId,               // 当前条目
  listItemIndex,            // 1-based 序号
  listItemIds,              // 当前 children 快照
  isAuxiliaryPreview?,      // 辅助预览
  srs: /* 来自 listItemId 的状态 */
}
```

### 身份（cardIdentity）

- `cardKey`：`list:{blockId}:item:{listItemId}`
- 复习日志 v2 写 `blockId` + `listItemId` + `cardKey`；兼容字段 `cardId` 仍可为 `listItemId`

---

## 收集行为

`collectReviewCards` 在 `cardType === "list"` 时：

1. 无 children → 跳过
2. 按顺序找**第一个** `due <= now` 的条目作为正式可复习项
3. 只为该条目生成**一张** ReviewCard（不是一次展开全部条目）
4. 后续条目由评分后的会话逻辑追加（见下）

收集阶段会对 list 子块做 `get-blocks` 预取（性能优化）。

---

## 复习行为

### 正式评分路径

主路径在 `SrsReviewSessionDemo`：

1. `gradeReviewCard(..., { updateListProgression: false })`  
   - List 条目用 `updateSrsState(listItemId, grade)` 写 FSRS  
   - 会话内自行处理解锁/推迟，避免与 `reviewCardGrading.updateListProgression` 双重追加冲突
2. **Good / Easy**：将下一条 `srs.due` 设为现在，并 `push` 正式 `ReviewCard` 到队列
3. **Again / Hard**：后续条目 due 提到明天零点；当日把后续条目以 `isAuxiliaryPreview: true` 入队

`reviewCardGrading.updateListProgression` 仍保留：在 `updateListProgression !== false`（如混合会话固定快照）时只改 due、**不**往队列塞卡。

### 辅助预览

- UI：`ListCardReviewRenderer` 显示「辅助预览，不计入统计」
- 会话：`isAuxiliaryPreview` 时 early-return：不写日志、不更新 SRS、不 track 正式进度
- 历史动作类型：`auxiliary_grade`

### 渲染

- `ListCardReviewRenderer`：展示父块题干上下文 + 当前条目内容；支持显示答案与评分
- `SrsCardDemo`：`listItemId` 等齐全时路由到 List 渲染器

---

## 复习日志与启动清理（FC-04 / FC-05）

列表卡每个条目有独立复习日志。新日志（存储 v2）写入结构化身份：

- `blockId`：父列表根块
- `listItemId`：条目子块
- `cardKey`：`list:{blockId}:item:{listItemId}`
- `cardId`：兼容字段，仍为 `listItemId`

### 启动清理如何判定 List 日志是否有效

实现：`src/srs/deletedCardCleanup.ts`。**不再**用 `collectSrsBlocks()` 结果当删除真相。

对结构化 List 日志，同时要求：

1. 父列表块 **exists**，且仍为 `type=list` 的 SRS 卡
2. `listItemId` 仍在父块的**直接** `children` 中
3. 子条目块本身 **exists**

删除条件（确认后才删）：

- 父块或子块 **missing**
- 子条目已不在父列表 `children` 中
- 父块类型已不是 list

**unknown 保留**：父或子 `get-block` 抛错时不得删除，计入 `retainedUnknownCount` 并写入 `errors`。

### legacy 与部分结构化日志

**pure legacy**（仅有 `cardId`，或 `legacy === true`，无其它身份痕迹）无法区分「父卡」与「List 子条目」：

- 只检查 `cardId` 指向块是否存在
- exists → 保留；missing → 删除；unknown → 保留
- **不**因缺少 `#card` 标签删除

若日志已有任一结构化痕迹（如 `legacy: false`、`blockId`、`cardType`、`listItemId`）但字段不完整（例如缺 `cardKey`），**不得**按 legacy 用 `cardId`（可能是子条目 ID）删除；应按结构化不完整处理：父块 exists/unknown 时保留并记错误，仅父块明确 missing 时可删。

---

## 常见问题

### 重排条目会怎么样？

条目进度跟随子块 `blockId`，重排只改变推送顺序，不重置已有进度。

### 删除/新增条目会怎么样？

- 删除子块：对应条目不再存在；清理逻辑可删关联日志
- 新增子块：新卡，按初始化规则进入解锁流程

---

## 相关文件

| 路径 | 说明 |
| ---- | ---- |
| `src/srs/listCardCreator.ts` | 创建列表卡 |
| `src/srs/listCard.test.ts` | 测试 |
| `src/srs/cardCollector.ts` | 收集正式 due 条目 |
| `src/srs/reviewCardGrading.ts` | 评分 + List progression（可选） |
| `src/srs/cardIdentity.ts` | list cardKey |
| `src/srs/deletedCardCleanup.ts` | 日志清理 |
| `src/srs/storage.ts` | 条目 `srs.*` / ensure with initial due |
| `src/srs/registry/commands.ts` / `uiComponents.tsx` | 命令与斜杠 |
| `src/components/ListCardReviewRenderer.tsx` | 复习 UI |
| `src/components/SrsCardDemo.tsx` | 路由 |
| `src/components/SrsReviewSessionDemo.tsx` | 解锁/辅助预览会话逻辑 |
