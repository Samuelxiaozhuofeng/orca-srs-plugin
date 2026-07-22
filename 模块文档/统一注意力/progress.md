# 统一注意力队列实施进度计划

> **用途**：把 [`渐进阅读_统一注意力队列设计.md`](渐进阅读_统一注意力队列设计.md) 转换为可直接派发、可并行、可验收的工程任务。
>
> **计划状态**：Draft / 尚未开始实现
>
> **最后整理**：2026-07-23
>
> **配套记录**：[`record.md`](record.md)

---

## 1. 使用规则

### 1.1 两份文件的职责

- `progress.md`：稳定的实施地图、任务边界、依赖、验收条件；任务范围变化时才修改。
- `record.md`：动态状态、负责人、证据、命令结果、决策、阻塞和交接；每次工作都要更新。
- 原设计文档：产品目标和详细设计依据，不直接作为单次 Agent 的任务提示词。
- 当前代码与现行模块文档：实现真相；若与原设计冲突，先记录差异，不得按设计稿臆造接口。

### 1.2 状态定义

| 状态 | 含义 |
| --- | --- |
| `TODO` | 依赖已满足，可领取 |
| `BLOCKED` | 等待决策、运行时证据或前置任务 |
| `SCOUTING` | AGY/Antigravity 正在只读调查 |
| `IN_PROGRESS` | Grok 正在实现；同一任务只能有一个实现负责人 |
| `REVIEW` | 实现完成，等待 Pi 独立审查和验证 |
| `DONE` | 代码、测试、文档和必要运行时验证均达到任务 DoD |
| `DEFERRED` | 明确不在当前里程碑，保留原因 |

`DONE` 不等于“Agent 自称完成”。只有 Pi 独立查看 diff、运行约定检查并把证据写入 `record.md` 后才能标记。

### 1.3 Agent 分工

| 角色 | 允许工作 | 不允许工作 |
| --- | --- | --- |
| **Pi** | 拆解、核实源码、决策收口、派发、独立 review、运行最终检查、维护两份进度文件 | 不把 Scout 报告当事实；不跳过验证直接验收 |
| **AGY / Antigravity** | 只读探索、调用链/测试/风险调查、并行设计备选、审查计划或 diff | 不编辑文件、不执行变更、不声称运行时已验证 |
| **Grok** | 按已冻结任务包实现代码、测试与同步文档 | 不扩大范围、不自行决定未决产品口径、不并行改共享热点 |

### 1.4 每个任务的领取流程

1. Pi 在 `record.md` 将任务改为 `SCOUTING` 或 `IN_PROGRESS`，写负责人、分支/工作树和时间。
2. 如需探索，AGY 返回精确路径、符号、测试和未知项；Pi 必须独立复读关键证据。
3. Pi 给 Grok 的任务包必须包含：目标、非目标、允许修改文件、前置决策、不变量、测试命令、完成条件。
4. Grok 完成后改为 `REVIEW`，附 diff 摘要和实际命令结果，不得只写“tests pass”。
5. Pi 检查 `git diff`，复读关键路径，运行最窄测试，再运行阶段门禁。
6. 有失败或缺少必要 Orca 验证时保持 `REVIEW`/`BLOCKED`，不得标 `DONE`。

### 1.5 全局工程不变量

所有任务都必须遵守：

- 每次修改前读本文件指向的相关 `模块文档/`；涉及 Orca API 时先读 `plugin-docs/modules.md` 与对应本地参考。
- IR block property 写入后，在后续读取依赖新值前调用 `invalidateIrBlockCache`；普通 SRS 写入使用 `invalidateBlockCache`。
- SRS `cardKey` 只通过 `src/srs/cardIdentity.ts`；禁止手拼身份、substring 匹配。
- mixed 队列复用普通 SRS frozen descriptor、scope、daily budget、grading 和日志可靠性；不得再造弱化版本。
- 普通卡继续由 FSRS 调度；Topic/Extract 继续由 IR cadence 调度；统一的是注意力流，不是算法。
- 会话装配保持只读；Selection 不得顺手修改 cadence。
- 推后只移动 `due`，不得污染 `intervalDays`、AF、`readCount` 或 `position`。
- 日志 enqueue 不等于写盘成功；flush 失败必须可见、可重试，卸载时须在 Orca API 仍可用时 flush。
- 查询失败不得伪装为空队列；descriptor 损坏不得静默重建覆盖；部分失败必须报告 ID/数量。
- 批量读取和 child expansion 必须有并发、深度、数量边界；禁止仓库级无界 `Promise.all`。
- UI runtime React 来自 `window.React`；只做类型导入，不引入第二份运行时 React。
- 保留无关 worktree 改动；禁止编辑生成目录 `dist/`、`coverage/`。

---

## 2. 总体里程碑与依赖

```text
G0 产品决策 + 运行时基线
 ├── P1 Trace / Replay / Shadow Selection
 │    ├── P2 Frozen Daily Descriptor + IR Daily Ledger
 │    │    └── P3 Mixed SRS 权威预算
 │    └── P6 Adaptive Selection（需可靠 Trace 样本）
 └── P4 Future Load Calendar Shadow
      └── P5 新条目容量感知首次排期

P2 + P6 ──> P7 每日一次旧积压治理
P1 + P2 + P3 + P5 + P6 + P7 稳定 ──> P8 动态 A-Factor
每个阶段 ──> V 阶段验证/文档/回滚门禁
```

### 2.1 可并发工作流

- **流 A：可信今日**：P2 → P3。
- **流 B：未来削峰**：P4 → P5。
- **流 C：可解释选择**：P1 → 收集样本 → P6。
- P2 与 P4 只可在 **G0-T04 已接受、P1 entry/date/cost snapshot 合同已冻结** 后并发；P4 只读取权威 `ir.due` 构建未来负载，不读取或修改 P2 的 Today Plan/ledger。二者不要同时修改共享会话入口。
- 若 P2/P4 需要变更共同的 entry key、本地日或成本合同，立即暂停并行，先由 Pi 更新合同和依赖。
- P3、P5、P6 可在各自前置完成后并发，但最终接线必须串行集成。
- P7 和 P8 属高风险写入阶段，默认串行。

### 2.2 共享热点：禁止并行修改

以下文件是高冲突区，同一时刻只允许一个实现任务改动：

- `src/components/incremental-reading/workspace/useIRWorkspaceSession.ts`
- `src/components/incremental-reading/IRSessionShell.tsx`
- `src/components/incremental-reading/useIRSessionCardActions.ts`
- `src/srs/incremental-reading/irQueuePolicy*.ts`
- `src/srs/incremental-reading/irMixedQueuePolicy.ts`
- `src/srs/settings/incrementalReadingSettingsSchema.ts`
- `src/main.ts` / `src/srs/pluginUnloadSequence.ts`
- `模块文档/README.md`、`模块文档/渐进阅读.md`、`模块文档/记忆排期推送.md`

并发任务优先创建独立纯模块和测试；共享入口由后续单独“接线任务”完成。

---

## 3. 全局完成定义（Global DoD）

单个代码任务至少满足：

- [ ] 任务非目标未被顺手实现，diff 无无关格式化/重构。
- [ ] 新行为有确定性测试；失败、损坏、幂等或边界路径有覆盖。
- [ ] 错误保持可见；没有空 `catch`、伪空数组或计划数冒充成功数。
- [ ] 涉及身份、block property、批量读取、日志或 React 时符合全局不变量。
- [ ] 最窄测试通过；阶段末 `npx tsc --noEmit` 和相关完整测试通过。
- [ ] 行为变更同步相关模块文档及 `模块文档/README.md` 状态。
- [ ] `record.md` 记录实际命令、结果、变更文件、风险、未验证项。
- [ ] 需要 Orca 实例验证的任务，明确区分自动化、只读实例验证、写入实例验证。

阶段完成还必须满足：

- [ ] Feature flag 默认值与回滚路径明确；Shadow 阶段不得改变生产排序或 `due`。
- [ ] 关键验收 fixture 可 replay；相同 descriptor/seed 得到相同结果。
- [ ] 性能检查证明不存在无界并发或异常大数组。
- [ ] Pi 已独立 review，而不是接受 Grok/AGY 自报。

---

# 4. Gate G0：产品口径、存储 ADR 与运行时基线

> **阶段状态**：`BLOCKED`（等待产品决策与 Orca 只读样本）
>
> **阶段目标**：在改变行为前冻结关键语义，确认真实数据形状和现有负载。

## G0-D：产品决策表

Pi 应把用户确认结果写入 `record.md`。未确认时不得让实现 Agent 自行选择。

| ID | 决策 | 建议默认 | 阻塞阶段 |
| --- | --- | --- | --- |
| G0-D01 | “今日学习”默认纯阅读还是 mixed | **纯阅读**，用户可选 mixed；沿用当前默认关闭 | P2 UI、P3 |
| G0-D02 | 总分钟统一预算，还是 IR/SRS 各自预算 | **一个总时间预算 + 两侧权威安全上限** | P2、P3 |
| G0-D03 | `dailyLimit` 是否拆为每日 unique + 单次 safety cap | **拆分**，旧值只迁移为 safety cap；daily unique 用显式默认 | P2 |
| G0-D04 | `keep_extract` 挖空是否消费当日 IR unique slot | **消费一次**，不结束长期 IR 生命周期 | P2 |
| G0-D05 | 自动积压治理默认档 | **关闭或建议**；真实样本稳定前不得默认自动 | P7 |
| G0-D06 | 低重要性最大等待目标或 bounded starvation | **先 bounded starvation**，不开放复杂设置 | P6 |
| G0-D07 | 同来源连续上限 | **soft max=2**，无替代候选可放宽并诊断 | P6 |
| G0-D08 | Book distributed `totalDays` 语义 | **硬最晚边界**，章节顺序为弱偏好 | P4、P5 |
| G0-D09 | “今天阅读” focus 是否可超每日 unique budget | **允许**，但可独占 session slice；消费语义仍去重 | P2 |
| G0-D10 | 是否允许“重新计划今天” | **首轮不提供**；后续必须保留 consumed 与 SRS frozen scope | P2 UI |
| G0-D11 | 单入口还是只读/复习/mixed 三入口 | **一个入口，启动时选择/继承模式** | P2、P3 UI |
| G0-D12 | Future Load 是否纳入 SRS 预测 | **Phase 4 首期只做 IR**；有权威接口后再扩展 | P4 |

## G0-T01：冻结产品决策与术语

- **依赖**：无。
- **执行者**：Pi + 用户；AGY 可提供备选权衡。
- **产出**：`record.md` 的 G0-D01～D12 全部变为 `CONFIRMED` 或明确 `DEFERRED`。
- **验收**：设置名、用户文案、消费动作、focus、mixed、自动治理默认值无歧义。
- **非目标**：不创建设置 key，不改代码。

## G0-T02：只读运行时采样包

- **依赖**：无。
- **执行者**：Pi 设计脚本，用户在 Orca Console 执行。
- **范围**：普通 Topic、普通 Extract、顺序 active 章、distributed 章、hybrid Cloze+IR、一张到期 SRS。
- **要求**：脚本输出 `orca.state.repo`；同一 block 对比 `orca.state.blocks[id]` 与文档确认的 backend `get-block`；top-level `await`；只读；紧凑 JSON。
- **验收**：记录真实 `ir.*`、`#card`、`_repr`、source、due、priority shape；读取失败单独列出，不归为空数据。
- **运行时门禁**：先读 `plugin-docs/modules.md` 和对应 backend 文档后才能给脚本。

## G0-T03：基线 fixture 与负载报告

- **依赖**：G0-T02。
- **执行者**：Grok（fixture/脚本）+ Pi review；AGY 可先定位现有收集入口。
- **产出**：脱敏 deterministic fixture，覆盖 10 本书×20 章、连续 3 天×20 Extract、priority 0/20/50/80/100、逾期 1/30 天、同源极端。
- **指标**：每日预计秒数、峰值/均值、P95、同源同日密度、高重要性最晚日期、读取失败数。
- **验收**：fixture 不依赖个人 repo；现行 v1 输出可稳定 replay。

## G0-T04：存储与并发 ADR

- **依赖**：G0-T01、G0-T02。
- **执行者**：Pi；AGY 从 SRS descriptor、review log、daily stats 三条路径并行调查。
- **必须决定**：daily descriptor、unique ledger、trace、future-load index、overload batch 各自用 Orca data/localStorage/其他现有设施中的哪一种；跨 panel 写入如何防丢失；schema version、损坏、迁移、repo/date/plugin 隔离、幂等 event id、flush/unload。
- **验收**：ADR 写入 `record.md` 或独立设计记录；不得把 localStorage 单次 read-modify-write 默认当跨面板原子操作。
- **非目标**：不提前确定不存在的 Orca API。

### G0 退出门禁

- [ ] G0-D01～D12 已确认或有明确延期策略。
- [ ] 有可复制的只读运行时样本。
- [ ] 当前代码/文档/运行时的差异已记录。
- [ ] 存储 ADR 包含并发、损坏、恢复与卸载 flush。
- [ ] 基线 fixture 和指标可 replay。

---

# 5. Phase 1：Selection Trace、Replay 与只读 Shadow

> **阶段状态**：`BLOCKED`（依赖 G0）
>
> **目标**：解释当前 v1 的每次选择，并计算 v2 建议；不改变队列顺序、不写 block property。

## P1-T01：冻结 Trace 与 Selection Result 合同

- **依赖**：G0-T03、G0-T04。
- **建议新模块（最终名称需 review）**：`irSelectionTraceTypes.ts`、`irSelectionReplay.ts`。
- **工作**：定义 descriptor/policy snapshot、entry identity、selected/unselected reason、score terms、estimated cost、诊断、trace integrity 状态。
- **身份**：IR 使用稳定 reading entry key；SRS 只接受 `cardIdentity.ts` 产生的 `cardKey`。
- **验收测试**：严格 parse/serialize；未知 version、重复 key、非法数值明确失败；同 fixture round-trip 不丢字段。
- **非目标**：不持久化、不接 UI、不启用新排序。

## P1-T02：为 v1 选择补全可解释 reason

- **依赖**：P1-T01。
- **当前入口**：`irQueuePolicySelect.ts`、`irQueuePolicyConstraints.ts`。
- **工作**：纯函数返回每个候选的入选/未入选原因；覆盖 budget、session cap、protected、Topic floor、new Extract cap、exploration、无合法替换。
- **验收**：返回的 queue 与变更前完全一致；同输入/seed reason 稳定；软化约束都产生 diagnostics。
- **非目标**：不得用新 score 改 v1 顺序。

## P1-T03：实现 v2 Shadow scorer

- **依赖**：P1-T01。
- **工作**：计算 bounded overdue、starvation=0（首期）、progress=shadow、diversity=shadow、bounded noise；输出建议顺序与差异，不接生产 queue。
- **验收**：overdue 单调且有 cap；priority 主导保护区；相同 seed 可 replay；任何比例/预算检查只诊断，不写数据。
- **非目标**：不启用 starvation，不修改真实 selection。

## P1-T04：可靠 Trace enqueue/flush/retry

- **依赖**：P1-T01、G0-T04；`record.md` 中 ADR-003 必须为 `ACCEPTED`，否则本任务保持 `BLOCKED`。
- **参考**：`reviewLogStorage.ts`、`pluginUnloadSequence.ts`、相关 reliability tests。
- **工作**：幂等 event id、内存 pending、明确 flush、失败保持 pending、并发 flush 合并、repo 隔离、卸载顺序。
- **验收**：enqueue 成功不报告“已写盘”；flush 失败后可重试；解析/读/写失败可见；不同 repo 不串；卸载测试证明先 flush 后释放 Orca API。
- **非目标**：不以 block properties 存逐条 trace。

## P1-T05：接入会话装配但保持行为等价

- **依赖**：P1-T02、P1-T03、P1-T04。
- **共享热点**：`useIRWorkspaceSession.ts`，必须单独领取。
- **工作**：冻结 policy input/seed/本地日；记录 v1 reasons 与 v2 shadow；记录 collect 部分失败；创建 replay id。
- **验收**：feature flag 关闭零额外行为；trace/shadow 开启时 queue keys 和顺序不变；会话创建仍只读。

## P1-T06：预计成本与实际停留关联

- **依赖**：P1-T04、P1-T05。
- **参考**：`irCostCalibration.ts`、`irMetrics.ts`、卡片动作与 session summary。
- **工作**：按 descriptor/entry/action event 关联预计秒数和实际 dwell；失败动作不伪装完成。
- **验收**：刷新、同卡重开、跨 session 不重复聚合；缺失日志标 integrity degraded。

## P1-T07：Replay 与差异报告工具

- **依赖**：P1-T02、P1-T03。
- **工作**：从 fixture/trace 重放 v1 与 v2，输出队列交集、顺序变化、预算、约束软化、原因分布。
- **验收**：同输入 byte-stable 或结构稳定；不依赖 Orca runtime；可作为后续 P4/P6 基准。

### P1 退出门禁

- [ ] 当前 v1 queue 行为未变化。
- [ ] 相同 snapshot + seed replay 一致。
- [ ] trace flush 失败可见且 pending 可重试。
- [ ] 可比较 v1/v2，而 v2 未接管生产排序。
- [ ] 连续 2～4 周真实样本门槛已在 `record.md` 建立；未达到时 P6 production rollout 继续阻塞。

---

# 6. Phase 2：Frozen Daily Descriptor 与真实 IR 日额度

> **阶段状态**：`BLOCKED`（依赖 P1 合同、G0 决策/ADR）
>
> **目标**：同一 repo、本地日和冻结策略下，用户多次打开仍继续同一今日计划与剩余额度。

## P2-T01：Daily Descriptor 严格 schema/codec

- **依赖**：P1-T01、G0-D01～D03、G0-D09～D11、G0-T04。
- **工作**：version、descriptorId、repo、plugin、localDate、policyVersion、mode、scope/focus、总秒数、daily unique cap、session cap、三种比例、seed、planned/consumed/remaining keys、status/error。
- **验收**：create/parse/serialize/round-trip；未知 version、损坏字段、repo/date mismatch 明确错误；字段冻结且不可被全局设置静默覆盖。
- **非目标**：不接会话、不实现 SRS budget。

## P2-T02：Descriptor 持久化与恢复状态机

- **依赖**：P2-T01、G0-T04。
- **工作**：`active/completed/expired/invalid`；同日复用；跨本地日 expire；repo 隔离；损坏显示错误；显式 retry/recovery，不静默重建覆盖。
- **并发**：处理两个 panel 同时 create/load/update；至少有 revision/CAS、单写者或 ADR 规定的等价保护。
- **验收**：reload 恢复、跨午夜、repo 切换、存储不可用、坏 JSON；使用可控 storage adapter/barrier 模拟两个 panel 在同一 revision 交错读取与提交，验证不会丢失 planned/consumed key，冲突方得到可重试结果而非覆盖成功。若采用 `StorageEvent`/BroadcastChannel/Orca data revision，分别测试通知丢失与重复投递。

## P2-T03：幂等 Daily Unique Ledger

- **依赖**：P2-T01、G0-D04、G0-D09、G0-T04。
- **消费动作**：`next` 成功、`postpone` 成功、`complete/archive` 成功；`keep_extract itemize` 按 G0-D04；未来/命令侧 `archive_extract`、`discard_extract` 若在 Today Plan 中执行并确认结束 Extract，则消费一次且从 remaining 移除。
- **不消费**：打开、滚动、只创建 Extract、对话取消、读取失败、业务写失败、重复动作；非会话 conversion 不得凭空创建另一份当日 descriptor，必须通过同一 ledger service 或明确记录为无 active plan。
- **工作**：稳定 entry key、eventId、业务结果与 ledger 结果分离、ledger 写失败的 retryable event。
- **验收**：幂等、跨 session、并发、所有 conversion strategy、先业务成功后 ledger 失败、重试不重复扣减；失败提示“业务成功但今日记录失败”。

## P2-T04：设置拆分与兼容迁移

- **依赖**：G0-D03、P2-T01。
- **当前入口**：`incrementalReadingSettingsSchema.ts`。
- **工作**：把旧 `dailyLimit` 的单次 cap 语义迁移为明确的每日 unique cap 与 session safety cap；定义旧值映射、校验、安全上限、UI 文案。
- **验收**：旧用户不因迁移获得无限数组或意外更小日额度；非法值可见并回退；已存在 descriptor 保留冻结值。
- **非目标**：不开放算法数学参数。

## P2-T05：只读创建 Today Plan

- **依赖**：P2-T02、P2-T03、P2-T04、P1-T05。
- **工作**：从 eligible pool 过滤 consumed，建立 planned/remaining；focus 冻结首位；focus 超预算时独占；Today Plan 与 Session Slice 分离。
- **验收**：创建 plan 不写 `ir.*`；同日重开不重新选另一批；设置变更不影响已有 descriptor；collect 失败不创建伪空 plan。

## P2-T06：Session Slice 恢复与补片

- **依赖**：P2-T05。
- **共享热点**：`useIRWorkspaceSession.ts`、`IRSessionShell.tsx`。
- **工作**：10/20/30 分钟从 Today Plan 取切片；保存当前位置/remaining；刷新、重开、关闭恢复；当 unique cap 用完不补新 IR。
- **验收**：同日多个时间盒共享 remaining；刷新顺序稳定；当前卡可完成；结束态区分“今日计划完成”“资料库无内容”“加载失败”。

## P2-T07：动作成功后提交 ledger

- **依赖**：P2-T03、P2-T06。
- **共享热点**：`useIRSessionCardActions.ts`。
- **工作**：仅在各业务动作确认成功后提交；`keep_extract` 按 G0-D04；`archive_extract`/`discard_extract` 按 completedExtract 结果消费并移出 remaining；ledger 失败保留 retry；动作失败保持当前条目和额度。
- **验收**：next/postpone/archive 与全部 itemize strategy 每条路径有成功、失败、重复测试；只创建 Extract 不消费父 Topic；取消对话不消费；命令侧 conversion 与会话侧不能双扣。

## P2-T08：Daily stats 与 Daily ledger 边界收口

- **依赖**：P2-T03。
- **参考**：`irDailyStatsStorage.ts` 当前按 session 汇总，不是权威额度。
- **工作**：明确 stats 仅分析，ledger 才是额度真相；避免两个模块重复计数；必要时共享 date/repo/key helper，但不共享损坏恢复语义。
- **验收**：统计 commit 失败不回滚已确认业务；额度读取不依赖汇总 totals；文档明确边界。

## P2-T09：今日学习状态 UI

- **依赖**：P2-T06、P2-T07。
- **工作**：剩余预计时间、完成数、非阻断警告、descriptor/ledger 错误、今日计划完成；首轮不提供 G0-D10 所禁的重排入口。
- **验收**：普通用户看不到内部术语；错误不能显示为空队列；关闭后恢复路径清晰。

### P2 退出门禁

- [ ] 同日重开/跨 panel 不重置额度。
- [ ] 同一 entry 一天只消费一次；失败动作不消费。
- [ ] descriptor 损坏、storage 失败、ledger 部分失败可见可重试。
- [ ] repo、本地日、plugin、policy 隔离。
- [ ] 当前会话创建仍不写 IR block properties。
- [ ] 自动化覆盖恢复、幂等、并发和跨午夜；Orca 只读实例验证完成。

---

# 7. Phase 3：Mixed SRS 权威预算对齐

> **阶段状态**：`BLOCKED`（依赖 P2、G0-D01/D02/D11）
>
> **目标**：mixed 只做合法候选交织；SRS scope、new/review remaining、身份、grading 与日志继续由普通 SRS 权威路径决定。

## P3-T01：SRS 复用边界 ADR 与适配接口

- **依赖**：P2-T01、G0-D01/D02/D11。
- **必须复读**：`reviewSessionDescriptor.ts`、`reviewSessionScope.ts`、`reviewSessionBudget.ts`、`reviewSessionQueueBuilder.ts`、`reviewCardGrading.ts`、review log/session progress。
- **产出**：Unified descriptor 引用/嵌套普通 review descriptor 的方式；禁止复制 card identity、scope 或 budget 算法。
- **验收**：normal/fixed/custom 语义不被错误混用；mixed 只允许正式、会更新 SRS 且消费 quota 的合法 scope。

## P3-T02：计算并冻结 SRS remaining

- **依赖**：P3-T01。
- **工作**：读取 validated review settings 与今日日志，得到 new/review remaining；冻结 scope；partial log failure 不伪装为零使用量。
- **验收**：all/deck scope、跨普通会话已用额度、日志身份去重、坏日志/flush pending 全覆盖。

## P3-T03：Mixed 候选与身份去重

- **依赖**：P3-T02、P2-T05。
- **当前入口**：`irMixedQueuePolicy.ts`。
- **工作**：只接收已由 SRS 权威层过滤/限额的候选；`irMixedQueuePolicy.ts` 直接从 `cardIdentity.ts` 使用 `cardKeyFromReviewCard`（当前 `childCardCollector.getCardKey` 虽委托同一真相，但 mixed 不应依赖 child collector 门面）；排除已在其他 frozen plan 或当日 confirmed log 消费的 cardKey。
- **验收**：mixed 比例不能突破 SRS remaining；同 cardKey 不重复；IR-only 输出不变；新制 Item 不进入当前 snapshot；测试证明改导入前后 key 完全一致。

## P3-T04：Mixed grading 成功门闩与额度确认

- **依赖**：P3-T03。
- **当前入口**：`IRMixedReviewPane.tsx`、`reviewCardGrading.ts`。
- **工作**：复用评分 action gate；只有 FSRS 写入和规定的日志确认路径成功后推进/消费；enqueue/flush 失败语义与普通会话一致。
- **验收**：双击/快捷键重复评分只成功一次；grading 失败不消费；日志失败可见；pending requeue 遵守 frozen scope 与 budget。

## P3-T05：普通 SRS 回归隔离

- **依赖**：P3-T04。
- **工作**：运行普通 all/deck/fixed/repeat、Again/Hard requeue、session resume 的现有测试；添加 mixed 不影响独立会话的回归。
- **验收**：普通 SRS queue/cardKey/FSRS/settings/log 行为无变化。

## P3-T06：Mixed 状态与降级 UI

- **依赖**：P3-T03、P3-T04。
- **工作**：显示 mixed 目标而非承诺比例；SRS 候选/预算不可用时明确降级为 IR-only 并显示原因；不得把读取失败说成“没有复习卡”。
- **验收**：今日 IR 用完后，仅在 SRS remaining 合法时可继续；两侧都用完显示今日完成。

### P3 退出门禁

- [ ] mixed 不超过 normal SRS new/review remaining。
- [ ] SRS cardKey、scope、grading、日志无第二套实现。
- [ ] 同一卡不因两个会话重复加入或消费。
- [ ] grading/log 失败不伪装成功。
- [ ] IR-only 和普通 SRS 全回归通过。
- [ ] 必要的 Orca 评分写入复读验证完成。

---

# 8. Phase 4：Future Load Calendar（只读 Shadow）

> **阶段状态**：`BLOCKED`（依赖 G0、P1 replay；可与 P2 并行）
>
> **目标**：从权威 `ir.due` 构建可重建派生索引，计算新章节/Extract 的建议首次日期，但不改真实 `due`。

## P4-T01：预计成本与负载桶合同

- **依赖**：G0-D08/D12、G0-T03。
- **工作**：`repo + localDate` 桶；Topic/Extract seconds、counts、sourceCounts、highPriorityCount、failedCount、完整性/dirty 状态。
- **权威性**：block `ir.due/intervalDays` 是真相；calendar 仅加速/分析。
- **验收**：本地日/DST 边界；非法 due/成本明确失败或降级并计数；首期按 G0-D12 只做 IR。

## P4-T02：有界权威重建器

- **依赖**：P4-T01。
- **参考**：IR index IDs、现有 bounded concurrency helper。
- **工作**：分页/分批读取 active IR；日期窗口有界；单块失败计数；取消/重试；不扫描无限未来。
- **验收**：1 万条 fixture；并发上限可测试；无仓库级无界 `Promise.all`；partial result 带 integrity 状态，不能伪装完整。

## P4-T03：Eligibility Window 纯函数

- **依赖**：G0-D08、P4-T01。
- **工作**：按 cardType/importance/user intent 生成最早/最晚本地日；distributed totalDays 作为硬边界；sequential today/tomorrow 作为显式意图。
- **验收**：priority 0/100、窗口 0/1 天、跨 DST、today/tomorrow；高重要性不越最晚边界。

## P4-T04：Date Cost 与稳定放置器

- **依赖**：P4-T01、P4-T03。
- **工作**：expected seconds、same source/type、high-priority crowding、distance preference、bounded stable noise；最低 cost 选择。
- **验收**：不越窗口；相同 input/seed 稳定；近似并列才由 noise 决定；过载窗口有可解释 fallback。

## P4-T05：Distributed Book Shadow placement

- **依赖**：P4-T04。
- **当前基线**：`bookIRCreator.calculateChapterDueDates`、`book-ir/bookIRChapterInit.ts`。
- **工作**：章节顺序弱偏好、同书密度、每章都建议日期、partial failure/retry 模拟；不调用写入函数。
- **验收**：10 本×20 章的全局峰值优于各书局部均匀；失败章重算不扰动已冻结建议。

## P4-T06：多日多批 Extract Shadow placement

- **依赖**：P4-T04。
- **工作**：保留 sibling delay 作为局部先验；叠加 sourceTopic/sourceBook 密度和全局 load；连续 30 天×20 Extract 模拟。
- **验收**：sibling delay 不进入 intentional interval；窗口越界 0；峰值/均值、P95、同源同日密度有 baseline 对照。

## P4-T07：Index dirty/rebuild 协议

- **依赖**：P4-T02。
- **工作**：列出所有 due 改变入口（init/next/priority/postpone/auto/complete/progression/retry/rollback）；首期只标记 dirty 和验证重建，不改写入入口。
- **验收**：漏掉入口的静态清单审查；index mismatch 可诊断；损坏后从权威数据有界恢复。

## P4-T08：Shadow 报告与上线门禁

- **依赖**：P4-T05、P4-T06、P4-T07、P1-T07。
- **工作**：对当前 due 与建议 due 输出峰值/均值、P95、窗口、高优延迟、source density、fallback/failed。
- **验收**：报告不改 block；样本不足时不宣称提升；P5 参数由报告冻结。

### P4 退出门禁

- [ ] Calendar 可从权威 block 数据有界重建。
- [ ] 同 input/seed 建议日期可 replay。
- [ ] 高重要性不越最晚窗口；sequential 用户意图不被改写。
- [ ] 1 万条测试无无界并发。
- [ ] Shadow 指标优于或至少不劣于 baseline，参数已冻结。

---

# 9. Phase 5：启用新条目的容量感知首次排期

> **阶段状态**：`BLOCKED`（依赖 P4 Shadow 通过）
>
> **目标**：只对新创建章节和新 Extract 使用容量感知日期；不批量重排旧 `due`。

## P5-T01：Feature flag、fallback 与 rollout 合同

- **依赖**：P4-T08。
- **工作**：默认 shadow/关闭；明确 index unavailable/dirty/partial 时 fallback 到当前算法；记录 fallback reason。
- **验收**：关 flag 输出与当前实现一致；回滚不需改旧数据；失败不丢新条目。

## P5-T02：新 Extract 首次放置接线

- **依赖**：P5-T01、P4-T06。
- **必须复读**：`extractUtils.ts`、`irSchedulingHelpers.ts`、`irSchedulingMutations.ts`、source provenance 文档。
- **工作顺序**：确定 source → 基础 intentional interval → sibling offset/窗口 → calendar 放置 → 权威写入 → invalidate IR cache → 更新/标脏 index。
- **验收**：新 Extract 写耐久 sourceTopicId/sourceBookId；interval 不含临时分散；写失败可重试且不计 calendar 成功。

## P5-T03：Distributed Book 初始化接线

- **依赖**：P5-T01、P4-T05。
- **工作**：对新 distributed book 逐章使用冻结 placement；保存成功/失败项；retry 只处理失败章。顺序书下一章解锁继续尊重用户明确的 `today`/`tomorrow`，由现有 `advanceSequentialBook`/`resolveNextChapterDue` + SAC 路径负责；Future Load 只可给出负载诊断，不得改写该 due。
- **验收**：每成功章都有 due；失败章可重试；重试不扰动成功章；`totalDays` 硬边界；cache invalidation 正确；sequential complete 后 next chapter 的 today/tomorrow due 与现行行为一致，并有“高负载也不偷改”的回归测试。

## P5-T04：权威写后 Index 更新协议

- **依赖**：P5-T02、P5-T03、P4-T07。
- **工作**：先 block write，后 invalidate，再更新派生 index；index 更新失败标 dirty，不把已成功 block write 伪装失败。
- **验收**：部分/并发写、retry、rollback、index 失败测试；成功数量来自确认写入。

## P5-T05：实例写入验证与灰度

- **依赖**：P5-T02～T04。
- **执行者**：Pi 提供经用户同意的最小 mutating 流程。
- **验证**：创建测试 Extract/Book；backend 复读 `due/interval/source`；后续缓存读取；calendar 桶；flag 关闭 fallback。
- **验收**：自动化、Orca 读验证、Orca 写验证分开记录；未验证 UX/性能风险保留。

### P5 退出门禁

- [ ] 只影响新条目，不批量改旧 due。
- [ ] 所有日期在窗口内；同源峰值和全局峰值达到 P4 冻结门槛。
- [ ] 写后 cache invalidation 与 backend 复读通过。
- [ ] index 失败安全 fallback，重试不扰动成功项。
- [ ] sequential Book IR、today/tomorrow 用户意图回归通过。

---

# 10. Phase 6：Adaptive Selection

> **阶段状态**：`BLOCKED`（依赖 P1 可靠样本；建议在 P2 后启用）
>
> **目标**：在冻结预算内启用 bounded overdue、可靠 starvation、source diversity 和短原因。

## P6-T01：Score terms 纯函数

- **依赖**：P1-T03、P1 样本门槛。
- **工作**：priority、bounded log-like overdue、bounded starvation、progress shadow、diversity adjustment、bounded noise；所有参数版本化。
- **验收**：单调、cap、priority protected；NaN/负数/极端天数；相同 descriptor replay。

## P6-T02：Trace integrity → eligibleSkipCount

- **依赖**：P1-T04、P1-T06。
- **定义**：在 frozen scope 内有资格、因预算/约束未入选的不同本地日次数。
- **工作**：按日去重；排除用户 postpone、读取失败、scope 外、已消费；日志不完整时 integrity degraded。
- **验收**：不得用 postponeCount/readCount/数组位置冒充；trace 不可靠时 starvation bonus=0 并诊断。

## P6-T03：Protected zone 与 source run constraint

- **依赖**：G0-D07、P6-T01。
- **工作**：focus 优先；高重要性旧积压保护；同 source 连续 soft max；无替代时放宽；顺序 active 章不永久排除。
- **验收**：全部同源、只有一张、focus 超预算、protected 与 Topic floor 冲突；所有放宽有 diagnostics。

## P6-T04：Selection Pipeline 接线与最终复核

- **依赖**：P6-T01～T03、P2-T05。
- **共享热点**：`irQueuePolicy*.ts`。
- **优先级**：eligibility → focus → frozen scope → daily remaining → 时间/session cap → protected → Topic floor → new Extract cap → source diversity → score fill → exploration → final audit。
- **验收**：不越预算；不越 daily unique remaining；比例冲突原因准确；Selection 仍不写 block。

## P6-T05：用户可见短原因与诊断抽屉

- **依赖**：P6-T04。
- **文案**：重要性高、已等待较久、继续上次阅读、保持章节曝光、新摘录配额、其他来源穿插、手动选择。
- **验收**：普通 UI 不展示公式；详情可查看 score terms/integrity/softening；读取失败不显示成未选中。

## P6-T06：Shadow 对照、灰度和回滚

- **依赖**：P6-T04、P6-T05。
- **工作**：先 compare-only，再 feature flag 小范围启用；记录高重要性逾期 P95、长期 eligible 未入选数、预算误差、source run。
- **验收**：flag 关闭恢复 v1；指标不足/恶化自动停止扩大；不得用“更随机”作为成功证据。

### P6 退出门禁

- [ ] priority 主导，overdue/starvation 单调有界。
- [ ] trace 不可靠时 starvation 自动停用。
- [ ] 低 priority 有 mercy/exploration 路径，但不能随机越过 protected。
- [ ] 时间、daily remaining、Topic floor/new Extract cap/SRS budget 最终复核通过。
- [ ] 用户原因与机器 diagnostics 一致。

---

# 11. Phase 7：每日一次旧积压治理

> **阶段状态**：`BLOCKED`（依赖 P2 frozen plan、P6 protected/trace、G0-D05）
>
> **目标**：冻结 Today Plan 后，对未入选的旧积压执行关闭/建议/自动三档治理；可审计、可撤销、跨重载幂等。

## P7-T01：持久 Daily Governance 状态机

- **依赖**：P2-T02、G0-D05、G0-T04。
- **key**：repo + localDate + policyVersion。
- **状态**：not-run/running/partial/completed/failed/undo-partial/undone；包含 revision、attempt、pending IDs。
- **验收**：插件重载后不重复；全批失败不标 completed；并发 panel 只允许一个执行者。

## P7-T02：严格候选选择

- **依赖**：P2-T05、P6-T03、P7-T01。
- **条件**：`dueDay < today`、未进 frozen plan、非 focus、非 protected、scope 内、未受 postpone protection、读取成功。
- **验收**：today due、未来 due、scope 外、读取失败、已处理、protected 全排除且给 reason。

## P7-T03：持久批次快照与执行器

- **依赖**：P7-T01、P7-T02。
- **复用**：评估 `irOverloadService.ts` / `irOverflowDefer.ts`，不要并存两套冲突事务语义。
- **写语义**：只移 due；保留 interval/position；不改 AF/readCount；更新 postponeCount/lastAction/batchId；每次写后 invalidate。
- **验收**：真实 success/failed/rollbackFailed；partial 可重试；成功数量不使用 plannedCount。

## P7-T04：跨重载撤销与冲突保护

- **依赖**：P7-T03。
- **工作**：持久 snapshot；撤销前复读 backend；若用户之后修改同卡，跳过并报告；rollback 失败列 block IDs。
- **验收**：重载后可撤销；用户后续操作不被覆盖；完成/部分/失败状态可恢复。

## P7-T05：关闭/建议/自动 UI 与摘要

- **依赖**：P7-T01～T04。
- **工作**：关闭立即停止；建议显示一键摘要；自动只在每日首次 frozen plan 后执行；显示推后/保留/失败/撤销。
- **验收**：打开面板本身仍不隐式写；只有明确模式与治理时机触发；失败不显示全成功。

## P7-T06：Orca 写入与撤销验证

- **依赖**：P7-T05。
- **验证**：backend 前后复读 due、interval、position、AF/readCount、batch；重载后第二次打开不再执行；撤销后复读。
- **验收**：自动化和实例验证分别记录；关闭模式零写入。

### P7 退出门禁

- [ ] 同日最多一次；today due/focus/protected 不动。
- [ ] 只改规定字段；cache invalidation 正确。
- [ ] 部分失败、retry、rollbackFailed 和用户后续修改都可见。
- [ ] 关闭后停止；建议/自动默认值符合 G0-D05。
- [ ] 跨重载幂等与撤销通过。

---

# 12. Phase 8：动态 A-Factor

> **阶段状态**：`BLOCKED`（最后实施；依赖前述层稳定）
>
> **目标**：用逐条目、进展感知 cadence 替换普通 Topic/Extract 固定倍率；不改变统一队列边界。

## P8-T01：`ir.aFactor` codec 与 lazy fallback

- **依赖**：P1/P2/P5/P6/P7 稳定；相关算法文档复读。
- **工作**：缺字段 Topic=1.25、Extract=1.35；严格 clamp/parse；不批量迁移；未知 `ir.*` 保留。
- **验收**：round-trip、坏值、legacy、feature flag off；property 写后 invalidate。

## P8-T02：Progress-aware AF 纯算法 Shadow

- **依赖**：P8-T01、可靠 dwell/progress 数据。
- **工作**：真实进展更新 target/smoothing；stall 不增长；priority 弱耦合；postpone 不更新；sibling delay 不复利。
- **验收**：数学边界和 deterministic fixtures；不写真实 AF/due；顺序 active 章明确分流到 SAC。

## P8-T03：Shadow 指标与参数冻结

- **依赖**：P8-T02。
- **指标**：回归间隔、无进展 next、逾期、完成率、用户 postpone、预算误差；与 fixed factor baseline 对照。
- **验收**：真实数据不劣于 baseline；样本不足时继续 shadow。

## P8-T04：用户动作接线

- **依赖**：P8-T03。
- **当前入口**：`irSchedulingHelpers.ts`、`irSchedulingMutations.ts`、`irPropertyCodec.ts`、session next action。
- **工作**：只有确认进展的真实 next 写 AF/interval/due；postpone/priority-only/selection 不写 AF；SAC 路径不走普通 AF。
- **验收**：业务写失败不留半套 cadence；写后 invalidate；flag off 完整恢复 v1 multiplier。

## P8-T05：灰度、回滚与实例验证

- **依赖**：P8-T04。
- **工作**：shadow → opt-in → 分阶段默认；记录 scheduleVersion 是否真的需要，未证明前不新增属性。
- **验收**：不批量改旧 due；关闭 flag 后旧 AF 可保留但读取恢复 v1；backend 复读 AF/interval/due；SAC 回归通过。

### P8 退出门禁

- [ ] 不批量迁移或重排旧 due。
- [ ] 无进展不增长，postpone 不改 AF/interval，sibling delay 不复利。
- [ ] sequential active 章继续使用 SAC。
- [ ] flag 关闭恢复固定倍率。
- [ ] 指标优于或不劣于 baseline，Orca 写入复读通过。

---

# 13. 横切验证与发布任务

## V-T01：每任务最窄验证

按变更选择最窄命令，例如：

```bash
npx vitest run src/srs/incremental-reading/<changed>.test.ts
npx vitest run src/components/incremental-reading/workspace/<changed>.test.ts
```

实际命令和退出结果写入 `record.md`，不得只复制建议命令。

## V-T02：每阶段类型与回归门禁

```bash
npx tsc --noEmit
npm test
npm run build
```

- `npm run build` 只在仓库内生成 `dist/`，不等于已部署 Orca。
- 阶段内可先跑相关 suite，阶段关闭前按风险决定是否跑全量；失败时任务保持 `REVIEW`。

## V-T03：规模/属性测试矩阵

必须覆盖：

- 10 本书 × 20 章；
- 30 天每天 20 Extract；
- 1 万 IR 条目；
- priority 0/100；
- 全同源、全新 Extract、无 Topic、单一超长 Topic；
- 未来窗口全部过载；
- seed replay；
- 本地午夜/DST；
- 存储损坏、部分读取、部分写入、并发 panel、插件 reload；
- 两个 panel 使用 barrier 交错执行同 descriptor revision 的 load/consume/save；验证两个不同 entry 均保留、同一 event 只消费一次、冲突明确重试；
- 通知重复、乱序或丢失时，以权威 revision/ledger 复读收敛，不依赖通知本身作为提交成功证据。

全局不变量：不越窗口、不越预算、不丢身份、不重复消费、无无界并发、所有软化有 diagnostics。

## V-T04：Orca 运行时验证等级

| 等级 | 内容 | 可宣称 |
| --- | --- | --- |
| R0 | 仅 Vitest/typecheck/build | 自动化通过；**不能**宣称 Orca 实例通过 |
| R1 | 只读 Console：state vs backend | Orca 实例读取形状通过 |
| R2 | 用户同意的测试写入 + backend 复读 | 指定写入路径实例验证通过 |
| R3 | 真实 UI 完整流程 | 指定 UX 流程实例验证通过 |

每阶段在 `record.md` 指明所需等级；P5、P7、P8 至少 R2，P2/P3 最终验收建议 R3。

## V-T05：文档同步

每次行为变化同步：

- `模块文档/渐进阅读.md`
- `模块文档/渐进阅读_BookIR.md`（Book 相关）
- `模块文档/记忆排期推送.md`（排期/削峰/队列）
- `模块文档/SRS_复习队列管理.md`、`SRS_数据存储.md`（mixed/SRS/持久化）
- `模块文档/问题经验.md`（真实数据确认的 bug）
- `模块文档/README.md`（状态与关联路径）
- 本设计文档顶部“已落地/计划”状态

## V-T06：阶段回滚检查

每个生产开关都要记录：

- 默认值与生效范围；
- 关闭后的读取/写入行为；
- 已写数据是否兼容旧路径；
- 是否需要清理派生 index（不得删除权威 block 数据）；
- 如何区分 rollout failure、data corruption 和单块失败。

---

# 14. 原设计覆盖映射

| 原设计章节 | 可执行任务 |
| --- | --- |
| §8–10 Outstanding/descriptor/daily budget | P2-T01～T09 |
| §11–12 Future Load/Book/Extract | P4-T01～T08、P5-T01～T05 |
| §13–14 candidate score/constraints | P1-T02/T03、P6-T01～T06 |
| §15 IR + SRS | P3-T01～T06 |
| §16 dynamic AF | P8-T01～T05 |
| §17 overload | P7-T01～T06 |
| §18 trace/explainability | P1-T01～T07、P6-T05 |
| §19 index consistency | P4-T02/T07、P5-T04 |
| §20 failure/recovery | G0-T04、P1-T04、P2-T02/T03、P5-T04、P7-T01/T03/T04 |
| §21 settings/UX | G0-D、P2-T04/T09、P3-T06、P7-T05 |
| §22 migration/flags | P2-T04、P5-T01、P6-T06、P8-T01/T05、V-T06 |
| §24 tests | V-T01～T03 + 各任务验收 |
| §25 runtime verification | G0-T02、V-T04、P5/P7/P8 实例任务 |
| §26 metrics | G0-T03、P1-T06/T07、P4-T08、P6-T06、P8-T03 |
| §27 scenarios A–G | P4/P5、P2、P6、P3、P7 阶段门禁 |
| §28 risks | 全局不变量、G0 ADR、各阶段非目标/回滚 |
| §29 decisions | G0-D01～D12 |
| §30 first-round scope | Milestone M1（见下节） |

---

# 15. 推荐交付批次

## M0：准备就绪

包含：G0-T01～T04。

完成后才能稳定派发代码任务。

## M1：可信、可解释的“今天”（推荐首轮）

包含：

1. P1-T01～T07；
2. P2-T01～T09；
3. P3 仅先完成 T01 复用 ADR + 测试护栏；
4. P4-T01～T08 保持 Shadow；
5. V-T01～T06 对应门禁。

**M1 明确不启用**：Future Load 写真实 due、production starvation、自动治理、动态 AF、批量重排旧 due、大量高级设置。

## M2：权威 mixed + 新条目削峰

包含：P3-T02～T06、P5-T01～T05。

## M3：自适应选择

包含：P6-T01～T06；必须满足 P1 真实样本门槛。

## M4：自动治理

包含：P7-T01～T06；默认先建议模式。

## M5：自适应 cadence

包含：P8-T01～T05；最后实施。

---

# 16. 给 Grok 的标准任务包

复制以下模板，每次只派一个清晰任务；共享入口接线与纯模块实现应拆开。

```md
# Task ID
P?-T??

# Goal
一句话说明唯一目标。

# Verified baseline
- Pi 已复读的真实路径、符号、当前行为。
- 前置决策/ADR 编号。

# Allowed files
- 明确文件列表；候选新文件单列。

# Must not change
- 非目标与共享热点。
- frozen descriptor / cardKey / cache / read-only / error visibility 等不变量。

# Implementation requirements
1. ...
2. ...

# Tests first / required cases
- success
- failure
- corruption/idempotency/boundary（按任务）

# Verification commands
- npx vitest run ...
- npx tsc --noEmit（如要求）

# Handoff
- diff 摘要
- 实际命令及结果
- 未验证的 Orca runtime 项
- 风险/后续任务
```

---

# 17. 给 AGY 的标准 Scout 包

```md
只读调查任务：P?-T??

聚焦问题：只问一个调用链、持久化边界、测试缺口或设计取舍。

必须输出：
1. confirmed evidence：仓库相对路径 + 符号 + 行范围；
2. inference/candidate/unknown 分开；
3. 相关测试与模块文档；
4. 推荐 Pi 下一步复读文件；
5. 不修改文件、不安装依赖、不运行 mutating 命令。
```

Pi 必须独立验证报告中的关键路径、符号、调用链和测试，才能转成 Grok 任务。

---

# 18. 当前下一步

1. 在 [`record.md`](record.md) 完成 G0-D01～D12 决策确认。
2. 读取 `plugin-docs/modules.md` 和 `get-block` 对应本地文档，生成 G0-T02 最小只读 Console 脚本。
3. 收到运行时样本后完成 G0-T04 存储 ADR。
4. 将 P1-T01 作为第一个 Grok 代码任务；P4 的成本/索引 Scout 可与之并行，但不要提前写生产 `due`。
