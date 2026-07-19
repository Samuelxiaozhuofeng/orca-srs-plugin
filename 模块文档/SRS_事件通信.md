# SRS 事件通信（Broadcasts）

## 概述

基于 Orca `orca.broadcasts` API，在复习状态变更后通知其他 UI（主要是 Flash Home）静默刷新，避免组件直接互相引用。

另有一组 **DOM `CustomEvent`**（`orca-srs:ir-session-action`）用于渐进阅读会话动作与命令面板/快捷键桥接，不属于 `srsEvents.ts`，但同属跨组件通知；下文分两节说明。

### 设计目标

- **解耦**：评分/推迟/暂停逻辑只 `emit*`，不依赖 Flash Home
- **实时刷新**：Home 收到广播后静默 `loadData`
- **可扩展 payload**：评分事件可带 `cardKey` / `identity`（FC-05），订阅方可忽略

## 技术实现

### 核心文件

| 路径 | 职责 |
|------|------|
| `src/srs/srsEvents.ts` | `SRS_EVENTS` 常量、`emitCard*`、`CardGradedExtras` |
| `src/srs/reviewCardGrading.ts` | 评分 / 推迟 / 暂停成功路径上的主发射点 |
| `src/components/SrsReviewSessionDemo.tsx` | 会话 UI 内部分推迟/暂停路径也会 `emit` |
| `src/components/SrsFlashcardHome.tsx` | 订阅三事件并静默刷新 |

### 事件列表（`SRS_EVENTS`）

| 常量 | 事件名 | 说明 | 主要触发方 | 订阅方 |
|------|--------|------|------------|--------|
| `CARD_GRADED` | `srs.cardGraded` | 卡片被评分 | `reviewCardGrading.gradeReviewCard` → `emitCardGraded` | `SrsFlashcardHome` |
| `CARD_POSTPONED` | `srs.cardPostponed` | 卡片被推迟 | `postponeReviewCard` / 会话 UI | `SrsFlashcardHome` |
| `CARD_SUSPENDED` | `srs.cardSuspended` | 卡片被暂停 | `suspendReviewCard` / 会话 UI | `SrsFlashcardHome` |

> **已废弃名称**：旧文档中的 `srs.cardBuried` /「埋藏」**不存在**于现行代码；对应行为为 **推迟** `srs.cardPostponed`。

### Payload

#### `emitCardGraded(blockId, grade, extras?)`

```typescript
// 广播体
{
  blockId: DbId
  grade: Grade
  cardKey?: string      // extras
  identity?: CardIdentity // extras
}
```

- `reviewCardGrading` 在成功写状态并尝试落盘日志后调用，传入 `cardKey` 与 `identity`。
- Home 侧 handler **忽略 payload**，统一触发静默刷新。

#### `emitCardPostponed(blockId)` / `emitCardSuspended(blockId)`

```typescript
{ blockId: DbId }
```

- 推迟常用 `listItemId ?? id` 作为 `blockId`（与存储维度一致）。
- 暂停使用 `card.id`。

### Flash Home 订阅

- `useEffect` 内注册，先 `isHandlerRegistered` 再 `registerHandler`，避免重复注册报错。
- 卸载时 `unregisterHandler`（使用 ref 保存的 handler 引用）。
- 三事件 handler 均：`void loadDataRef.current()`（静默刷新）。

### 数据流

1. 用户在复习会话评分 / 推迟 / 暂停。
2. 业务成功后 `emitCardGraded` / `emitCardPostponed` / `emitCardSuspended`。
3. `SrsFlashcardHome` 收到广播 → 静默刷新统计与队列。
4. 用户回到 Home 时数据已是最新，无需手动刷新。

## DOM 事件：`orca-srs:ir-session-action`（补充）

用于 IR 工作区 Shell 与命令层通信（`window.dispatchEvent` / `addEventListener`），**不是** `orca.broadcasts`。

| 常见 `detail.action` | 来源（示例） |
|----------------------|--------------|
| `itemize` | `createCloze` 编辑器命令（cancelable，Shell 可 preventDefault） |
| `next` / `postpone` / `priority` | `irSessionNext` 等命令 |
| `skipChapter` | `skipSequentialChapter`（兼容；主 UX 为完成/`completed`，见 [渐进阅读.md](渐进阅读.md)） |

监听方：`IRSessionShell` 等。命令实现见 `src/srs/registry/commands.ts`。

## 相关文件

| 路径 | 说明 |
|------|------|
| `src/srs/srsEvents.ts` | 事件常量与 emit |
| `src/srs/reviewCardGrading.ts` | 评分/推迟/暂停发射 |
| `src/components/SrsFlashcardHome.tsx` | 订阅与静默刷新 |
| `src/components/SrsReviewSessionDemo.tsx` | 会话 UI 侧 emit（推迟/暂停） |
| `src/srs/cardIdentity.ts` | `CardIdentity` 类型（评分 extras） |
| `src/components/incremental-reading/IRSessionShell.tsx` | IR CustomEvent 监听 |
| `src/srs/registry/commands.ts` | IR 命令派发 CustomEvent |

## 文档同步

- **文档同步日期：2026-07-13**
- 修正：`cardBuried` → `cardPostponed`；主发射点改为 `reviewCardGrading`；补充 graded extras 与 IR DOM 事件说明。
