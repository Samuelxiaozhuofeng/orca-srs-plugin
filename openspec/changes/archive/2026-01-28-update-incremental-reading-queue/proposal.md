# Change: 让 Topic 与 Extract 使用不同的推送方式

## Why
- 目前 Topic 与 Extract 在同一队列里，推送方式几乎一样，Topic 很难真正“更优先”。
- SuperMemo 的做法更像“阅读清单 + 复习到期”：Topic 是阅读材料，Extract 是细粒度复习。
- 需要允许用户控制每天的阅读量，避免越读越多、越堆越高。

## What Changes
- 新增“Topic 队列位置”字段（`ir.position`），只用于 Topic 的先后顺序。
- Topic 用“队列位置”推送；Extract 仍用“到期时间”推送。
- 队列合成改为“Topic 配额 + Extract 配额”，默认 Topic 20%。
- 增加自动后移与每日上限，超量时把低优先级内容顺延。
- 在设置中提供配额、自动后移、每日上限等选项。
- `ir.position` 是“阅读清单里的排队号”，数字越小越靠前，默认由插件自动决定。
- 用户通过“靠前/靠后”按钮影响位置（类似将阅读材料前移或后移）。
- 新 Topic 可选基于优先级分区写入初始位置（高/中/低）。

### 初始位置规则（按优先级分区，推荐）
- 高优先级：放到队列前 10–20%
- 中优先级：放到队列中间 40–60%
- 低优先级：放到队列后 80–100%
- 同区段内随机一点，避免完全固定顺序

## Impact
- Affected specs: incremental-reading
- Affected code: incrementalReadingCollector, incrementalReadingStorage, incrementalReadingScheduler,
  incrementalReadingSettingsSchema, IncrementalReadingSession
