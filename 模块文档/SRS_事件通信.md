# SRS 事件通信（Broadcasts）

> **文档同步日期：2026-07-26**  
> 变更：Orca `broadcasts` **每事件类型仅允许一个 handler**（重复 `registerHandler` 会抛 `already registered`）。Flash Home 改为经 **模块级总线** `srsBroadcastBus` 订阅，不再直接 `registerHandler`。

## 概述

基于 Orca `orca.broadcasts` API，在复习状态变更后通知其他 UI（主要是 Flash Home）静默刷新，避免组件直接互相引用。

另有一组 **DOM `CustomEvent`**（`orca-srs:ir-session-action`）用于渐进阅读会话动作与命令面板/快捷键桥接，不属于 `srsEvents.ts`，但同属跨组件通知；下文分两节说明。

### 设计目标

- **解耦**：评分/推迟/暂停逻辑只 `emit*`，不依赖 Flash Home
- **实时刷新**：Home 收到广播后静默 `loadData`
- **可扩展 payload**：评分事件可带 `cardKey` / `identity`（FC-05），订阅方可忽略
- **多实例安全**：多个 Flash Home（对话框 + 面板等）共存时不抛错、不丢刷新

## 技术实现

### 核心文件

| 路径 | 职责 |
|------|------|
| `src/srs/srsEvents.ts` | `SRS_EVENTS` 常量、`emitCard*`、`CardGradedExtras` |
| `src/srs/srsBroadcastBus.ts` | **模块级总线**：每类型单一底层 Orca handler + 订阅者 Set 扇出 |
| `src/srs/reviewCardGrading.ts` | 评分 / 推迟 / 暂停成功路径上的主发射点 |
| `src/components/SrsReviewSessionDemo.tsx` | 会话 UI 内部分推迟/暂停路径也会 `emit` |
| `src/components/SrsFlashcardHome.tsx` | 经总线 `subscribeSrsCardLifecycleEvents` 静默刷新 |

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

### Flash Home 订阅（模块级总线）

Orca 运行时约束（`plugin-docs` / 实机）：

- `isHandlerRegistered(type)` **只按事件类型**判断是否已有 handler。
- 同一 `type` 再次 `registerHandler` 会 **抛错**（`Broadcast handler for … already registered`）。
- 因此 **不能** 假设 `(type, handler)` 多 handler 共存；也不能让每个 Flash Home 实例各自 `registerHandler`。

总线设计（`src/srs/srsBroadcastBus.ts`）：

1. 每个 SRS 事件类型向 `orca.broadcasts` **最多注册一个**底层 handler（惰性、幂等；`isHandlerRegistered` / 本地 `orcaHandlers` 守卫，失败可见不崩溃）。
2. 底层 handler 将事件 **扇出** 到本地 `Set` 中的订阅者回调。
3. `subscribeSrsBroadcast` / `subscribeSrsCardLifecycleEvents` 返回 `dispose`；实例卸载时从 Set 移除。
4. 某类型订阅者清空时 **注销** 底层 Orca handler。
5. 插件 `unload` 调用 `teardownSrsBroadcastBus()`（`main.ts` cleanup），避免热重载后宿主残留 `isHandlerRegistered === true`。

`SrsFlashcardHome`：

```ts
return subscribeSrsCardLifecycleEvents({
  graded: () => { /* silentReload */ },
  postponed: () => { /* silentReload */ },
  suspended: () => { /* silentReload */ }
})
```

- 三事件 handler 均：`void loadDataRef.current()`（静默刷新）。
- 回归测试：`src/srs/srsBroadcastBus.test.ts`。

### 数据流

1. 用户在复习会话评分 / 推迟 / 暂停。
2. 业务成功后 `emitCardGraded` / `emitCardPostponed` / `emitCardSuspended`（仍走 `orca.broadcasts.broadcast`）。
3. 总线底层 handler 收到 → 扇出到所有 Flash Home 订阅者 → 静默刷新。
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
| `src/srs/srsBroadcastBus.ts` | 单 handler + 多订阅者扇出；`teardownSrsBroadcastBus` |
| `src/srs/srsBroadcastBus.test.ts` | 多实例 / 退订 / 不重复 register |
| `src/srs/reviewCardGrading.ts` | 评分/推迟/暂停发射 |
| `src/components/SrsFlashcardHome.tsx` | 经总线订阅与静默刷新 |
| `src/components/SrsReviewSessionDemo.tsx` | 会话 UI 侧 emit（推迟/暂停） |
| `src/srs/cardIdentity.ts` | `CardIdentity` 类型（评分 extras） |
| `src/components/incremental-reading/IRSessionShell.tsx` | IR CustomEvent 监听 |
| `src/srs/registry/commands.ts` | IR 命令派发 CustomEvent |
| `src/main.ts` | unload 时 `teardownSrsBroadcastBus` |

## 文档同步

- **文档同步日期：2026-07-13**
- 修正：`cardBuried` → `cardPostponed`；主发射点改为 `reviewCardGrading`；补充 graded extras 与 IR DOM 事件说明。
