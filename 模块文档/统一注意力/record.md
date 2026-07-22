# 统一注意力队列工作记录

> **用途**：记录 [`progress.md`](progress.md) 中任务的实时状态、负责人、证据、决策、验证、阻塞与交接。
>
> **原则**：这里只记录实际发生的工作。未经运行的命令不得写“通过”；未经 Orca 实例复读的行为不得写“实例验证通过”。
>
> **创建时间**：2026-07-23

---

## 1. 当前快照

- **当前里程碑**：M0 — 准备就绪
- **当前阶段**：G0 — 产品口径、存储 ADR 与运行时基线
- **总体状态**：`BLOCKED`
- **阻塞原因**：G0-D01～D12 尚未由用户确认；尚无本轮 Orca 运行时只读样本；存储/并发 ADR 尚未冻结。
- **当前实现任务**：无
- **当前 Scout 任务**：无（初始两份架构/验证 Scout 已完成并由 Pi 抽查，见工作日志）
- **下一可执行动作**：确认产品决策 → 准备并执行 G0-T02 只读采样 → 完成 G0-T04 ADR。
- **代码变更**：无；本轮只创建规划与记录文档。
- **自动化验证等级**：未运行代码测试（文档任务不改变运行时）。
- **Orca 验证等级**：R0；尚未完成 R1/R2/R3。

### Worktree 保护说明

创建本记录时，`git status --short` 已显示：

- `模块文档/README.md` 有既存修改；
- `模块文档/统一注意力/` 为未跟踪目录（含用户提供的设计文档）。

本轮没有覆盖或回退这些既存内容，只新增：

- `模块文档/统一注意力/progress.md`
- `模块文档/统一注意力/record.md`

---

## 2. 阶段看板

| 阶段 | 状态 | 负责人 | 前置条件 | 当前证据/下一步 |
| --- | --- | --- | --- | --- |
| G0 产品/基线/ADR | `BLOCKED` | Pi + 用户 | 无 | 等决策、R1 样本、ADR |
| P1 Trace/Replay/Shadow | `BLOCKED` | 待派发 | G0 | 首任务 P1-T01 |
| P2 Frozen Daily/IR Ledger | `BLOCKED` | 待派发 | G0 + P1 合同 | 先定存储和消费语义 |
| P3 Mixed SRS 权威预算 | `BLOCKED` | 待派发 | P2 + mixed 决策 | 先做 P3-T01 ADR/护栏 |
| P4 Future Load Shadow | `BLOCKED` | 待派发 | G0 + P1 replay | 可与 P2 并行 |
| P5 新条目容量排期 | `BLOCKED` | 待派发 | P4 Shadow 门禁 | 至少 R2 |
| P6 Adaptive Selection | `BLOCKED` | 待派发 | P1 可靠样本 + P2 | production rollout 需 2～4 周样本 |
| P7 每日积压治理 | `BLOCKED` | 待派发 | P2 + P6 + 默认档决策 | 至少 R2 |
| P8 动态 A-Factor | `DEFERRED` | 待派发 | 前述层稳定 | 最后实施，至少 R2 |

---

## 3. G0 产品决策记录

> 用户确认前，所有条目保持 `PENDING`。建议值来自原设计和当前默认行为，不代表已决定。

| ID | 状态 | 决策问题 | 建议值 | 用户确认/理由 | 日期 |
| --- | --- | --- | --- | --- | --- |
| G0-D01 | `PENDING` | 今日学习默认纯阅读或 mixed | 默认纯阅读，可选 mixed | — | — |
| G0-D02 | `PENDING` | 总分钟统一或 IR/SRS 分预算 | 一个总时间预算 + 两侧安全上限 | — | — |
| G0-D03 | `PENDING` | 拆分 `dailyLimit` | 拆成 daily unique + session safety cap | — | — |
| G0-D04 | `PENDING` | `keep_extract` 挖空是否消费 unique slot | 消费一次，不结束 IR | — | — |
| G0-D05 | `PENDING` | 自动积压治理默认档 | 首轮关闭或建议 | — | — |
| G0-D06 | `PENDING` | 低重要性最大等待或 bounded starvation | 先 bounded starvation | — | — |
| G0-D07 | `PENDING` | 同来源连续上限 | soft max=2 | — | — |
| G0-D08 | `PENDING` | distributed `totalDays` 语义 | 硬最晚边界 | — | — |
| G0-D09 | `PENDING` | focus 是否可超 daily unique | 允许，必要时独占 slice | — | — |
| G0-D10 | `PENDING` | 是否允许重新计划今天 | 首轮不提供 | — | — |
| G0-D11 | `PENDING` | 单入口或三入口 | 单入口，启动模式可选/继承 | — | — |
| G0-D12 | `PENDING` | Future Load 是否含 SRS 预测 | Phase 4 首期只做 IR | — | — |

### 决策变更规则

- 变更已冻结决策时，必须记录影响任务、迁移和已有 descriptor 的兼容方式。
- 已存在 daily descriptor 不随全局设置变更静默重排。
- 任何 Agent 不得把“建议值”当作“已确认值”。

---

## 4. G0 任务记录

| Task | 状态 | 负责人 | 开始 | 最近更新 | 产出/阻塞 |
| --- | --- | --- | --- | --- | --- |
| G0-T01 冻结产品决策 | `BLOCKED` | Pi + 用户 | — | 2026-07-23 | 等 G0-D01～D12 确认 |
| G0-T02 只读运行时采样 | `BLOCKED` | Pi + 用户 | — | 2026-07-23 | 需先读 Orca backend 文档并生成脚本 |
| G0-T03 fixture/负载报告 | `BLOCKED` | 待派发 | — | 2026-07-23 | 等 G0-T02 样本 |
| G0-T04 存储与并发 ADR | `BLOCKED` | Pi | — | 2026-07-23 | 等决策与运行时形状 |

---

## 5. 实施任务登记

> 领取任务时在本节新增一行。不要一次把未来所有任务复制进来；只登记当前里程碑内已领取/待 review 的任务。

| Task | 状态 | Agent | 分支/工作树 | Allowed files | 开始 | Handoff | Pi review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | — |

### Agent 冲突锁

| 共享热点 | 当前锁持有者 | Task | 起始 | 释放条件 |
| --- | --- | --- | --- | --- |
| `useIRWorkspaceSession.ts` | 无 | — | — | — |
| `IRSessionShell.tsx` | 无 | — | — | — |
| `useIRSessionCardActions.ts` | 无 | — | — | — |
| `irQueuePolicy*.ts` | 无 | — | — | — |
| `irMixedQueuePolicy.ts` | 无 | — | — | — |
| `incrementalReadingSettingsSchema.ts` | 无 | — | — | — |
| unload/log pipeline | 无 | — | — | — |
| 模块文档共享文件 | 无 | — | — | — |

---

## 6. 验证台账

### 6.1 自动化命令

| 日期 | Task/阶段 | 命令 | 结果 | 关键输出/失败 | 执行者 |
| --- | --- | --- | --- | --- | --- |
| 2026-07-23 | 规划文档 | 未运行代码测试 | N/A | 本轮无运行时代码变更 | Pi |

### 6.2 Orca 实例验证

| 日期 | Task/阶段 | 等级 | Repo/样本 | 只读/写入 | 结果 | 证据/未验证项 |
| --- | --- | --- | --- | --- | --- | --- |
| — | G0-T02 | R1 待执行 | — | 只读 | `PENDING` | 尚无 Console 返回 |

### 6.3 阶段质量门禁

| 阶段 | Focused tests | `tsc` | Full tests | Build | Orca | Docs | Pi review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G0 | N/A | N/A | N/A | N/A | R1 pending | 规划已建并完成结构审查 | 规划文档已审查；阶段仍受决策/R1/ADR 阻塞 |
| P1 | — | — | — | — | 视接线要求 | — | — |
| P2 | — | — | — | — | R1，最终建议 R3 | — | — |
| P3 | — | — | — | — | R2/R3 | — | — |
| P4 | — | — | — | — | R1 性能采样 | — | — |
| P5 | — | — | — | — | 至少 R2 | — | — |
| P6 | — | — | — | — | R1/R3 | — | — |
| P7 | — | — | — | — | 至少 R2 | — | — |
| P8 | — | — | — | — | 至少 R2 | — | — |

---

## 7. 运行时样本登记

> G0-T02 返回后填写。原始输出若含私人内容，应先脱敏；保留 block 类型、属性 shape、ID 关系、日期与错误形态。

| Sample ID | 类型 | state 命中 | backend 命中 | 关键字段 | 差异/错误 | 关联 fixture |
| --- | --- | --- | --- | --- | --- | --- |
| S-01 | 普通 Topic | — | — | — | — | — |
| S-02 | 普通 Extract | — | — | — | — | — |
| S-03 | 顺序 active 章 | — | — | — | — | — |
| S-04 | distributed 章 | — | — | — | — | — |
| S-05 | hybrid Cloze + IR | — | — | — | — | — |
| S-06 | 到期 SRS | — | — | — | — | — |
| S-07 | 同源当天多 Extract | — | — | — | — | — |
| S-08 | 同日关闭重开 | — | — | — | — | — |

---

## 8. ADR / 技术决策

### ADR-001：规划文件位置

- **状态**：`ACCEPTED`
- **日期**：2026-07-23
- **决策**：`progress.md` 与 `record.md` 放在原设计同目录 `模块文档/统一注意力/`。
- **理由**：任务、进度和设计可相对链接；避免仓库根目录出现与其他项目混淆的通用文件名。
- **影响**：后续 Agent 必须先读同目录设计与 `progress.md`，动态写 `record.md`。

### ADR-002：实施顺序

- **状态**：`ACCEPTED`
- **日期**：2026-07-23
- **决策**：Trace/descriptor/budget/future-load shadow 在前；production adaptive selection、自动治理、动态 AF 在后。
- **理由**：同时改变首次排期、selection、AF、postpone 会失去归因能力；原设计也明确要求 Shadow 和 frozen daily 优先。
- **影响**：P6 production 需 P1 可靠样本；P5 需 P4 Shadow；P8 最后。

### ADR-003：Daily descriptor / ledger / trace 存储

- **状态**：`PENDING`
- **候选**：Orca session block、现有插件 data、localStorage 或可验证的组合。
- **必须解决**：跨 panel 并发、schema version、repo/date/plugin 隔离、损坏、幂等、flush/unload、迁移。
- **禁止假设**：不得仅因 `irDailyStatsStorage.ts` 使用 localStorage 就直接复用为权威额度；其当前 read-modify-write 与 session 汇总语义不能自动满足并发 ledger。

### ADR-004：Unified 与 SRS descriptor 的组合方式

- **状态**：`PENDING`
- **约束**：必须复用 `ReviewSessionDescriptor`、scope、budget、cardKey 和 grading/log；不可复制弱版本。
- **目标任务**：P3-T01。

### ADR-005：Future Load 首期范围

- **状态**：`PENDING`（建议 G0-D12 确认后接受）
- **建议**：首期只投影 IR；SRS 无权威未来成本接口时不估算假精度。

---

## 9. 风险与阻塞

| ID | 状态 | 风险/阻塞 | 影响 | 缓解/下一步 | Owner |
| --- | --- | --- | --- | --- | --- |
| R-001 | `OPEN` | 产品决策未确认 | P2/P3/P5/P6/P7 无法冻结口径 | 完成 G0-D01～D12 | Pi + 用户 |
| R-002 | `OPEN` | 未确认权威存储与跨 panel 并发语义 | descriptor/ledger 可能丢更新或重复消费 | G0-T04 ADR + 并发测试 | Pi |
| R-003 | `OPEN` | 设计文档是计划，不是现行 API | Agent 可能发明路径/接口 | 每任务先复读源码与模块文档 | Pi |
| R-004 | `OPEN` | mixed 当前只是视觉交织 | 可能绕过 SRS daily remaining/scope | P3 先做复用 ADR/护栏 | Pi/Grok |
| R-005 | `OPEN` | Trace 可靠性不足 | starvation 统计可能错误 | 日志失败时 bonus=0；P1 先行 | Pi/Grok |
| R-006 | `OPEN` | Future Load 派生索引漂移 | 新排期依据错误 | block 为权威、dirty + 有界重建 | Pi/Grok |
| R-007 | `OPEN` | 自动治理跨重载状态当前不持久 | 同日重复推后/不可撤销 | P7 状态机与持久 snapshot | Pi/Grok |
| R-008 | `OPEN` | 长 Topic 可能被成本模型饿死 | Topic 长期不入选 | 成本只装箱；Topic floor/focus/protected | Pi/Grok |
| R-009 | `OPEN` | 多 Agent 修改共享入口冲突 | 丢改动/不一致接线 | 使用冲突锁，纯模块与入口接线拆任务 | Pi |
| R-010 | `OPEN` | Orca 自动化通过不代表实例通过 | 错误宣称修复 | 按 R0–R3 分级记录 | Pi |

---

## 10. 工作日志

### 2026-07-23 — 将设计稿转换为执行计划

- **执行者**：Pi
- **状态**：完成文档产出，未开始代码实施。
- **读取/核实**：
  - 完整读取 2045 行 `渐进阅读_统一注意力队列设计.md`；
  - 读取 `模块文档/README.md`、`渐进阅读.md`、`记忆排期推送.md`、`SRS_复习队列管理.md` 的当前状态；
  - 抽查当前会话、queue policy、mixed、daily stats、SRS descriptor/budget、overload、Book IR 和动作入口源码；
  - 确认当前 IR queue 是 React 内存 snapshot，`dailyLimit` 是单次 cap；当前 mixed 未对齐完整 SRS 权威 budget；daily stats 不是 daily unique ledger；Future Load 与动态 AF 尚不存在。
- **并行只读 Scout**：
  1. 架构/调用链/并发分工角度；
  2. 测试/持久化/失败/rollout 角度。
- **Pi 独立抽查的关键文件**：
  - `src/components/incremental-reading/workspace/useIRWorkspaceSession.ts`
  - `src/components/incremental-reading/workspace/assembleSessionReadingQueue.ts`
  - `src/srs/incremental-reading/irQueuePolicyCore.ts`
  - `src/srs/incremental-reading/irQueuePolicySelect.ts`
  - `src/srs/incremental-reading/irMixedQueuePolicy.ts`
  - `src/srs/incremental-reading/irDailyStatsStorage.ts`
  - `src/srs/reviewSessionDescriptor.ts`
  - `src/srs/reviewSessionBudget.ts`
  - `src/components/incremental-reading/useIRSessionCardActions.ts`
  - `src/srs/incremental-reading/irOverloadService.ts`
  - `src/srs/incremental-reading/irOverflowDefer.ts`
  - `src/srs/bookIRCreator.ts`
  - `src/srs/book-ir/bookIRChapterInit.ts`
- **产出**：
  - `progress.md`：G0 + P1～P8 + 验证/发布任务、依赖、并行边界、DoD、Agent 模板；
  - `record.md`：状态、决策、任务、验证、ADR、风险和交接台账。
- **计划审查**：第三个只读 Scout 对 `progress.md`/`record.md` 做覆盖和依赖审计；Pi 复核后修订：
  - P1 trace 持久化明确要求 ADR-003 先 `ACCEPTED`；
  - P2/P4 并发前冻结 entry/date/cost snapshot 合同，P4 不读取 Today Plan；
  - P2 ledger 覆盖 `keep_extract`、`archive_extract`、`discard_extract` 及命令/会话双扣边界；
  - P2/V-T03 增加两个 panel 交错 revision 的可测验收；
  - P3 明确 mixed 直接依赖 `cardIdentity.ts`；现有 `childCardCollector.getCardKey` 实际已委托 `cardKeyFromReviewCard`，因此不是当前身份错误，但应消除 mixed 的不必要门面依赖；
  - P5 明确 sequential next chapter 的 `today`/`tomorrow` 是用户意图，Future Load 只诊断、不改写，符合原设计 §11.7。
- **文档结构检查**：相对链接无缺失；62 个任务 ID 唯一、无漏号；`git diff --check` 无空白错误。
- **未执行**：没有改运行时代码，没有运行 Vitest/typecheck/build，没有执行 Orca Console。
- **下一步**：请求用户确认 G0 产品决策；随后执行 G0-T02/G0-T04。

---

## 11. 标准交接记录模板

### Grok → Pi

```md
## Handoff: P?-T??
- 状态：REVIEW
- 变更文件：
- 实现摘要：
- 明确未做：
- 测试命令与实际结果：
- 类型检查/构建：
- 错误/失败路径覆盖：
- Orca runtime：未验证 / R1 / R2 / R3
- 风险与后续：
- Worktree/commit：
```

### AGY → Pi

```md
## Scout: P?-T??
- Scope：
- Confirmed evidence（路径/符号/行范围）：
- Inference/candidates：
- Unknowns：
- Tests/docs：
- Pi 推荐复读：
- 未修改文件声明：
```

### Pi review

```md
## Pi Review: P?-T??
- Diff 范围：符合 / 超范围
- 关键调用链复读：
- 不变量检查：identity / cache / frozen scope / bounded I/O / errors / React
- 独立命令与结果：
- Orca 验证等级：
- 文档同步：
- 结论：DONE / CHANGES_REQUESTED / BLOCKED
- 后续任务：
```

---

## 12. 下一次会话恢复清单

1. 先读 `progress.md` 的第 1～3 节与当前阶段。
2. 看本文件“当前快照”“阶段看板”“产品决策”“风险与阻塞”。
3. 运行 `git status --short`，确认无并发 Agent 或用户新增改动。
4. 若派发代码任务，先加载 Grok executor，并检查“冲突锁”。
5. 若做宽范围只读探索，给 AGY 一个单一、可验证的焦点问题。
6. 同一任务只允许一个实现负责人；可并行任务必须使用独立工作树/文件边界并登记冲突锁。Pi 的编排 todo 同一时刻只保留一个主集成任务为 `IN_PROGRESS`。
7. Agent 完成即转 `REVIEW`，Pi 验证后才 `DONE`；更新本文件的实际证据，不把计划写成已完成事实。
