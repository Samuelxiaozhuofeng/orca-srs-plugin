# SRS 事件通信（Broadcasts）

## 概述

本模块基于 Orca 内置的 `broadcasts` API，实现 SRS 不同 UI 组件之间的事件通知，用于解决“复习面板操作后返回 FlashcardHome 数据不刷新”的实时更新问题。

### 设计目标

- **跨组件解耦**：复习面板不直接依赖 FlashcardHome，只发事件。
- **实时刷新**：评分/埋藏/暂停后，FlashcardHome 自动静默刷新统计与队列。
- **最小入侵**：不改变现有数据存储与队列构建逻辑，仅补齐通知链路。

## 技术实现

### 核心文件

- `src/srs/srsEvents.ts`：事件常量与 `emit*` 工具函数

### 事件列表

| 事件 | 说明 | 触发方 | 订阅方 |
| --- | --- | --- | --- |
| `srs.cardGraded` | 卡片被评分 | `SrsReviewSessionDemo` | `SrsFlashcardHome` |
| `srs.cardBuried` | 卡片被埋藏 | `SrsReviewSessionDemo` | `SrsFlashcardHome` |
| `srs.cardSuspended` | 卡片被暂停 | `SrsReviewSessionDemo` | `SrsFlashcardHome` |

### 事件 payload

目前 FlashcardHome 只需要“知道发生了变更并刷新”，因此 payload 主要用于调试与未来扩展：

- `srs.cardGraded`：`{ blockId, grade }`
- `srs.cardBuried`：`{ blockId }`
- `srs.cardSuspended`：`{ blockId }`

> 说明：订阅侧不依赖 payload，统一触发 `loadData(false)` 静默刷新。

## 数据流

1. 用户在旧复习会话（`SrsReviewSessionDemo`）执行评分/埋藏/暂停。
2. 状态更新成功后调用 `emit*` 广播事件。
3. `SrsFlashcardHome` 通过 `registerHandler` 监听事件，收到后调用 `loadData(false)`。
4. 用户返回 FlashcardHome 时，统计与“开始复习”按钮状态已是最新。

## 相关文件

- `src/srs/srsEvents.ts`
- `src/components/SrsReviewSessionDemo.tsx`
- `src/components/SrsFlashcardHome.tsx`
