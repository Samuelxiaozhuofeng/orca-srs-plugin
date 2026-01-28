## Context
目前 Topic 与 Extract 共用同一套“到期”推送机制，Topic 的优先级优势不明显。
希望把 Topic 变成“阅读清单”，把 Extract 变成“到期复习”。

## Goals / Non-Goals
- Goals:
  - Topic 与 Extract 使用不同推送机制
  - 用户可以控制 Topic 占比（默认 20%）
  - 支持自动后移与每日上限，避免过量堆积
  - 保持旧数据可用，不强制迁移
- Non-Goals:
  - 不改变现有 Topic/Extract 的创建方式
  - 不引入外部存储或新数据库

## Decisions
- Decision: 为 Topic 增加“队列位置”字段（`ir.position`）
  - Why: 位置更适合表达“阅读清单”的先后顺序
- Decision: Topic 用“位置”，Extract 用“到期时间”
  - Why: Topic 是阅读材料，Extract 更像复习任务
- Decision: 队列合成为“Topic 配额 + Extract 配额”
  - Why: 让 Topic 始终保持固定比例，避免被 Extract 淹没
- Decision: 超过每日上限时自动后移低优先级内容
  - Why: 控制日负荷，避免积压造成的压力

## Risks / Trade-offs
- 新字段可能导致理解成本上升（需要清晰文案）
- Topic 的“位置”与“优先级”并存，需避免混淆

## Open Questions
- 每日上限默认值是否定为 30？
