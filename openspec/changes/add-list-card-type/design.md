## Context（背景）

插件目前通过 `#card` 标签 + `type` 属性识别卡片类型，并在 `collectReviewCards()` 中生成复习队列。Cloze/Direction 通过“同一块 ID + 子标识（cN/forward/backward）”在同一块上承载多张子卡的 SRS 属性；复习 UI 通过 `SrsCardDemo` 路由到不同渲染器。

“列表卡”需要引入一种新的“多子卡”模型：一个父块表示一张列表卡，子块表示列表条目；复习时应按顺序逐条推送，并在 `again/hard` 时对后续条目做“明天再推送”的调度，同时允许当日继续预览后续条目但不计入正式统计。

## Goals / Non-Goals

### Goals（目标）

- 通过斜杠命令将当前块转换为 `#card(type=list)` 列表卡
- 将列表条目拆分成多个可独立评分与调度的“条目子卡”
- 复习时按顺序逐条推送条目子卡
- 实现“失败后后续条目推迟到明天，但当日仍可辅助预览且不计入统计”的规则

### Non-Goals（非目标）

- 不在本次引入复杂列表解析（多层、混合有序/无序的完全支持）
- 不修改 FSRS 核心算法

## Data Model（数据模型）

### 列表卡识别

- 父块：存在 `#card` 标签，且标签属性 `type=list`
- 条目来源：父块 `children` 的直接子块，按出现顺序编号 `1..N`

### 条目身份映射（稳定性）

- 条目“身份”以子块 `blockId` 为准（稳定映射）：
  - 编辑条目文本不会改变其 `blockId`，因此进度保持
  - 重排子块仅改变“顺序”，不改变条目本身的 SRS 状态
  - 新增/删除子块会产生/移除条目，不尝试跨条目迁移进度

### SRS 状态存储

列表条目的 SRS 状态存储在“条目子块”自身上（复用现有普通卡属性 `srs.*`）：

- 存储位置：列表条目子块（child block）
- 属性集合：`srs.stability/srs.difficulty/srs.interval/srs.due/srs.lastReviewed/srs.reps/srs.lapses/srs.state/srs.resets`

> 说明：通过“子块自身存储”天然获得稳定映射（blockId），避免 `index -> 状态` 在重排/增删时错位。

### 子卡唯一键（用于队列去重与统计）

引入一个稳定的子卡键 `subCardKey`：

- basic：`{blockId}-basic`
- cloze：`{blockId}-cloze-{n}`
- direction：`{blockId}-direction-{forward|backward}`
- list：`{blockId}-list-{index}`

该键用于：
- 动态队列更新时的去重（当前代码以 `id+clozeNumber+directionType` 组合去重，需扩展）
- 复习日志/统计的唯一标识（避免同一父块下多个子卡混淆）

本变更的最小实现中：
- 列表条目直接使用“条目子块 blockId”作为 `ReviewCard.id`，因此队列去重与日志现有 `cardId` 逻辑即可区分条目。
- Cloze/Direction 的更细粒度区分（按 cN/方向）不在本变更强制实现范围内。

## Review Flow（复习流程）

### 队列生成策略（最小实现）

在 `collectReviewCards()` 中遇到 `type=list` 的块时：

- 解析条目子块序列（children）
- 只生成**一个**“正式可复习条目子卡”：
  - 选择规则：在当前顺序下，从前到后找到第一个 `due<=now` 的条目
  - `ReviewCard.id = 条目子块 blockId`
  - `deck/tags` 继承父块（列表卡）的属性（用于过滤与展示）
  - 这样可保证“逐次推送”不会一次性把 1..N 全部塞进队列

### 评分驱动的“逐次推送”与“失败处理”

在复习会话中对列表条目子卡评分时：

#### Case A：评分为 `good/easy`

- 正常更新该条目的 FSRS 状态与复习日志
- 立即尝试推送下一条 `index+1`（按“当前 children 顺序”）：
  - 若存在下一条目：
    - 确保其 SRS 状态已初始化（写入在条目子块上）
    - 将其 `due` 调整为 `now`（或今天零点，满足 `due<=now`），使其在“当天”可进入正式复习
    - 将下一条目作为“正式卡片”追加到当前队列末尾

#### Case B：评分为 `again/hard`

- 正常更新该条目的 FSRS 状态与复习日志（该条目算一次正式复习）
- 将后续条目 `index+1..N`（按当前顺序）统一安排到明天：
  - 将这些条目的 `due` 设置为“明天零点”
  - 这样它们不会在当日再次被 `collectReviewCards()` 收集为正式复习
- 当日辅助预览：
  - 在当前会话中，仍可将后续条目作为“辅助卡片”追加展示
  - 辅助卡片规则：
    - 不更新 SRS 状态
    - 不写入复习日志
    - 不计入任何“正式统计/记忆收益”
    - 允许用户点击评分，但在 UI 中明确提示“辅助预览评分不计入统计”

> 与用户示例对齐：当 3 评分为困难或忘记，4 和 5 当天仍展示，但仅辅助。

## UI / Rendering（渲染与交互）

### 渲染复用策略

优先复用现有复习 UI 的框架（`SrsCardDemo`）：

- 新增 `list` 分支，渲染为“列表条目复习”视图
- MVP 渲染建议：
  - 题目态：显示列表标题（父块文本去标签）+ 列表条目，其中当前条目以 `[...]` 占位
  - 答案态：显示完整条目并高亮当前条目

辅助卡片在 UI 上增加明显标识（如“辅助预览，不计入统计”），并禁用/弱化评分按钮（或保留按钮但不记录）。

## Statistics / Logging（统计与日志）

最小实现复用现有日志与统计结构：

- 正式复习：
  - 列表条目使用“条目子块 blockId”作为 `ReviewLogEntry.cardId`，天然可区分每条目
  - 仍复用现有 `deckName` 等字段（继承自父块的牌组）
- 辅助预览：
  - 允许用户评分，但不写入复习日志、不更新 SRS 状态
  - UI 必须明确提示“该评分不计入统计”

## Edge Cases（边界情况与规则）

- 列表条目为空/只有 1 条：斜杠命令应提示用户需要至少 2 条条目（或允许 1 条但意义有限）
- 条目被重排/删除/新增：
  - MVP：按索引绑定状态；结构变化可能导致进度错位（需在 proposal 的 Open Questions 中确认）
- 与 `postpone/suspend` 的交互：
  - `postpone` 对列表卡默认作用于“当前条目子卡”（仅推迟该条目）
  - `suspend` 默认作用于父块的卡片状态（暂停整张列表卡，所有条目均不再进入队列）

## Test Plan（测试策略）

- 单元测试（Vitest）：
  - 列表条目解析（children → items）
  - 列表条目 SRS 状态命名与读写（`srs.l{index}.`）
  - `collectReviewCards()` 对 list 卡只返回 1 个可复习条目
  - 评分驱动逻辑：`good/easy` 推送下一条；`again/hard` 推迟后续并生成辅助条目（不写日志、不更新状态）
- 回归测试：
  - Basic/Cloze/Direction/Choice 的复习流程与统计不被破坏
