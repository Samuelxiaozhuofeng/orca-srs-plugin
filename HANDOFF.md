# IR 调度优化交接文档

更新时间：2026-07-19

## 一句话状态

我们正在按 [`模块文档/记忆算法优化.md`](模块文档/记忆算法优化.md) 分批改进渐进阅读（IR）的调度与队列。**Batch A、B1、B2 已通过 Codex 最终自动化复验。** 自动化验证 **不等于** 修复后的 Orca 实例验证；B2 尚未部署，也不要提前写实机最终验收。

普通记忆卡仍使用 FSRS。本任务不替换 FSRS，也没有启用动态 A-Factor。

## 用户要求与协作方式

- 默认中文。
- 用户要求由 Grok 负责主要实现，并尽可能使用子代理。
- Codex 负责拆分、review、独立测试和最终验收，不能相信 Grok 的自评。
- Grok 直接修改当前工作区，不创建 worktree。
- 多个子代理可以并行只读分析，但不要让多个写入执行者并发修改同一工作区。
- 不要 commit / reset / checkout / clean；保留全部未提交改动（含用户计划文档）。

## 已完成批次摘要

### Batch A：纯队列策略（无 block 写入）

- `topicQuotaPercent` → 时间盒 `topicMinRatio`
- 新 Extract 最终比例 cap + 回填
- Topic floor 最终约束与诊断
- 有界探索 + 本地日 seed
- 策略拆分为 `Core ← Constraints ← Select ← Policy` 单向 DAG

### Batch B1：会话启动只读

- `loadReadingQueue` 不调用 `applyAutoPostpone`
- 收集 `{ readOnly: true }` 跳过 `ensureIRState`
- focus 冻结到最终队列首位
- `enableAutoDefer` 仅控制资料库显式溢出按钮

### Batch B2：排期写入语义统一

目标与落地（第一版 + Codex 第一轮修补）：

1. **priority 单一真相**：`performPriorityAdjust` 委托 `updatePriority`；纯 helper + Extract≤30 / Topic≤60；SAC 仍短节奏。
2. **queueDelay 只影响首次 due**：interval / due offset 分离；`sourceTopicId` + 有界同源 sibling 扫描（硬 cap、嵌套 Topic 不深入、截断 warn）。
3. **create 顺序**：`invalidate(tag)` → `[setSource → invalidate]` → `ensure` → `updatePriority`（标签写后 cache 先失效）。
4. **postpone 只移 due**：手动 / auto / overflow 均保留 `intervalDays` **与 `position`**（修补：删除 overflow 重排 position）。
5. **真实结果**：`irOverflowDefer` 返回 successIds/failed；UI `mapOverflowDeferNotify`；`AutoPostponeError` 含 rollbackFailed。
6. **模块拆分**：overflow 写入 → `src/srs/incremental-reading/irOverflowDefer.ts`；collector 兼容 re-export。

**剩余风险（不伪装已恢复）**：auto postpone 若 mid-fail 后 snapshot restore 也失败，`rollbackFailed` 列出 blockId，进程内批次未登记，卡片可能停留在部分写入状态，需可见处理/人工重试。

**状态**：**B2 已通过 Codex 最终自动化复验。** 尚未部署，未宣称 Orca 实例验证。

**不做**：动态 AF、真实 dailyLimit、恢复会话 auto-postpone、批量迁移用户数据、Topic 508 历史 `#card.priority` 修复。

## 已取得的 Orca 只读证据

### B1 设计约束

- repo `sgf9fkhr9z3yz`，约 `2026-07-19T00:11:17Z`
- Topic 231/508：state miss 但 `get-block` 可读；会话须容忍 cache miss

### B2 写入路径约束（用户已返回）

- repo `sgf9fkhr9z3yz`，`2026-07-19T00:54:15.737Z`，`errors=[]`
- Extract `#1646`：parent `#237`（普通正文），`ir.sourceTopicId=231`，priority=50，interval≈5.83，due `2026-07-24`，lastAction=priority，readCount=0
- Topic `#231`：priority=50，intervalDays=8，lastAction=init
- Topic `#508`：`ir.priority=50` 但 `#card.priority` 缺失（**不**在本批扩大修复）

**含义**：真实嵌套 Extract 不能靠 direct parent 找 Topic；sourceTopicId 必须在排期计算前写入。
**边界**：只读证据 ≠ 修复后实例验证。

## B2 修改文件（相对本批）

生产代码（含修补）：

- `src/srs/incrementalReadingDispersal.ts`
- `src/srs/incremental-reading/irSchedulingHelpers.ts`
- `src/srs/incremental-reading/irSchedulingMutations.ts`
- `src/srs/incremental-reading/irSessionService.ts`
- `src/srs/incremental-reading/irQueuePolicyCore.ts`
- `src/srs/incremental-reading/irOverloadService.ts`
- `src/srs/incremental-reading/irOverflowDefer.ts`（B2 overflow 写入）
- `src/srs/incrementalReadingCollector.ts`（re-export）
- `src/srs/extractUtils.ts` / `incrementalReadingAutoMark.ts`
- `src/components/.../useIRWorkspaceLibrary.ts` + `irOverflowDeferNotify.ts`

新增/更新测试：

- `irScheduling.priority|queueDelay|postpone.test.ts`
- `irOverflowDefer.test.ts` / `irOverflowDeferNotify.test.ts`
- `extractUtils.scheduleOrder.test.ts`
- `irOverloadService.test.ts`（含 rollbackFailed）

文档：

- `模块文档/渐进阅读.md`
- `模块文档/记忆排期推送.md`
- `模块文档/README.md`
- `模块文档/问题经验.md`
- `HANDOFF.md`

未跟踪用户计划文档 `模块文档/记忆算法优化.md` 仍保留，不要删除。

## 自动化验证（B2 最终复验）

- B1/B2 聚焦测试：8 files / 40 tests 通过
- `npm test`：117 files / 1201 tests 通过
- `npx tsc --noEmit`：通过
- `npx vite build`：通过，285 modules transformed
- `git diff --check`：通过
- 未运行 `npm run build`，因此没有复制到外部 Orca 插件目录
- failure-injection 测试包含预期 stderr，不是未处理的验证失败

## 当前工作区状态

- 分支：`main`
- dirty：Batch A + B1 + B2 + 用户计划文档
- 无 commit / stage / push

新会话第一件事：

```bash
git status --short
git diff --check
```

## 下一步：Batch C1

- `dailyLimit` 从“每次生成队列上限”升级为 repo + local day 的唯一完成条目额度
- 同一卡当天多次打开只消费一次；失败动作不消费
- 需要可靠 action log，不能只放 React 内存

## 仍需 Orca 手动验证（B2）

1. 创建嵌套 Extract（正文子块选区）：确认 `ir.sourceTopicId`、首次 due 有序、`intervalDays` 不含 sibling delay
2. 调重要性：Extract 从高 interval 边界降低 priority 仍 ≤30；Topic ≤60
3. 手动推后 / 资料库溢出推后：interval 不变，due 变化；部分失败 UI 不为“全部成功”
4. 会话启动仍只读（B1 回归）：打开时间盒不写 due
