## ADDED Requirements

### Requirement: 到期与新卡入队
系统 SHALL 将 Extract 的到期或未读纳入 Extract 队列；Topic 不以到期规则入队，而以队列位置决定先后。

#### Scenario: Extract 入队条件
- **GIVEN** 一个 Extract 没有 `ir.lastRead`
- **AND** 另一个 Extract 的 `ir.due` 小于等于当前时间
- **WHEN** 渐进阅读队列生成
- **THEN** 这两个 Extract 应进入 Extract 队列
- **AND** Topic 不因到期条件而改变队列位置

### Requirement: Topic/Extract 配额混合策略
系统 SHALL 按 Topic 配额与 Extract 配额合成阅读队列，默认 Topic 20%。

#### Scenario: 默认配额混合
- **GIVEN** Topic 与 Extract 均有可读内容
- **AND** 当日上限为 10
- **WHEN** 使用默认设置生成阅读队列
- **THEN** 队列中至少 2 个为 Topic，其余为 Extract

### Requirement: Topic 队列位置
系统 SHALL 为 Topic 记录队列位置 `ir.position`，数值越小越靠前。

#### Scenario: Topic 初始化位置
- **GIVEN** 一个新建 Topic 没有 `ir.position`
- **WHEN** 系统初始化该 Topic
- **THEN** 为其写入一个有效的队列位置

### Requirement: Topic 推送操作
系统 SHALL 提供“靠前/靠后”推送 Topic 的能力，并调整其队列位置。

#### Scenario: Topic 靠后推送
- **GIVEN** 一个 Topic 在阅读队列中
- **WHEN** 用户选择“靠后”
- **THEN** 该 Topic 的队列位置应变为更靠后

### Requirement: 直观的 Topic 队列控制
系统 SHALL 在渐进阅读面板提供可见的 Topic 操作按钮，避免使用弹窗或隐藏菜单。

#### Scenario: 可见操作按钮
- **GIVEN** 当前卡片为 Topic
- **WHEN** 用户查看渐进阅读面板
- **THEN** 面板中应显示“已读”“靠前”“靠后”和“优先级切换”按钮

#### Scenario: 一键切换优先级
- **GIVEN** 当前卡片为 Topic
- **WHEN** 用户点击“优先级切换”按钮
- **THEN** 优先级在“高/中/低”之间循环切换
- **AND** 该 Topic 的队列位置保持不变

### Requirement: 优先级与队列位置分离
系统 SHALL 将优先级用于 Extract 的阅读节奏，不直接改变 Topic 的队列位置。

#### Scenario: 调整 Topic 优先级
- **GIVEN** 一个 Topic 已有队列位置
- **WHEN** 用户调整该 Topic 的优先级
- **THEN** 该 Topic 的队列位置保持不变

### Requirement: 自动后移与每日上限
系统 SHALL 支持自动后移与每日上限，超过上限时顺延低优先级内容。

#### Scenario: 超过每日上限
- **GIVEN** 当天可读内容数量超过每日上限
- **AND** 自动后移已开启
- **WHEN** 生成当天阅读队列
- **THEN** 低优先级内容应被顺延到后面日期或队列位置

### Requirement: 可配置的 Topic 配额
系统 SHALL 在设置中提供 Topic 配额百分比，默认 20%，可调整。

#### Scenario: 修改 Topic 配额
- **GIVEN** 用户将 Topic 配额改为 30%
- **WHEN** 生成当天阅读队列
- **THEN** 队列中至少 3 个为 Topic（当日上限为 10 时）

### Requirement: 可配置的自动后移与每日上限
系统 SHALL 在设置中提供自动后移开关与每日上限数值（默认开启，默认 30）。

#### Scenario: 关闭自动后移
- **GIVEN** 用户关闭自动后移
- **WHEN** 当天内容超过每日上限
- **THEN** 系统不自动顺延，但仍提示超量
