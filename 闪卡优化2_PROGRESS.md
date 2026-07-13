# 闪卡优化 2 - Progress

## 1. 使用说明

本文件是 `闪卡优化方案2.md` 的唯一进度来源。方案内容、产品规则和验收标准请查看方案文档；本文件只记录状态、执行证据、阻塞和交接信息。

### 状态值

| 状态 | 含义 |
| --- | --- |
| `pending` | 尚未开始 |
| `in_progress` | 已有 Agent 正在处理 |
| `blocked` | 因明确阻塞无法继续，原因已记录 |
| `done` | 实现、测试、类型检查、全量测试和文档同步均完成 |

### Agent 更新要求

1. 领取任务时先更新总表和对应任务记录，再开始改代码。
2. 同一时间原则上只允许一个 `in_progress` 任务；确需并行时必须确认文件范围不冲突。
3. 每次交接都填写最后更新时间、当前结论、未完成事项和下一建议动作。
4. `done` 必须附实际命令和结果；没有真实验证不得写“通过”。
5. Orca UI 未手工验证时，在“遗留验证”中保留，不得假装完成。
6. 发现方案需要调整时，先在本文件记录原因，再同步修改 `闪卡优化方案2.md`。

## 2. 当前基线

- 基线日期：2026-07-13
- Git 分支：`main`
- 工作区：审查时干净
- `npm test`：79 个测试文件、744 项测试通过
- `npx tsc --noEmit`：通过
- 本基线只证明已有测试通过，不代表方案列出的真实流程缺口不存在。

## 3. 总进度

| ID | 任务 | 优先级 | 状态 | 依赖 | 执行者 | 最后更新 |
| --- | --- | --- | --- | --- | --- | --- |
| F2-01 | 显式会话描述与启动交接 | P0 | `done` | 无 | Grok Build | 2026-07-13 10:41 |
| F2-02 | global quota 与并发占用 | P0 | `pending` | F2-01 | - | 2026-07-13 |
| F2-03 | List 正式条目接入预算 | P0 | `pending` | F2-02 | - | 2026-07-13 |
| F2-04 | Again/Hard 短期重新入队 | P0 | `done` | F2-01 | Grok Build | 2026-07-13 11:10 |
| F2-05 | 评分与状态动作同步门闩 | P0 | `done` | F2-01 | Grok Build | 2026-07-13 10:50 |
| F2-06 | 块 missing/unknown 三态 | P1 | `done` | 无 | Grok Build | 2026-07-13 11:26 |
| F2-07 | 动态追加 React 状态纯化 | P1 | `pending` | F2-02、F2-04 | - | 2026-07-13 |
| F2-08 | FSRS 设置完整校验 | P1 | `done` | 无 | Grok Build | 2026-07-13 11:41 |
| F2-09 | 完整会话快照持久化 | P1 | `pending` | F2-01、F2-02、F2-04、F2-05 | - | 2026-07-13 |
| F2-10 | 恢复/放弃/冲突处理 UI | P1 | `pending` | F2-06、F2-09 | - | 2026-07-13 |
| F2-11 | 自定义学习筛选器与预览 | P2 | `pending` | F2-01、F2-02 | - | 2026-07-13 |
| F2-12 | 自定义学习会话模式 | P2 | `pending` | F2-09、F2-10、F2-11 | - | 2026-07-13 |
| F2-13 | 7/30 天负载预测模型 | P2 | `pending` | F2-02、F2-08 | - | 2026-07-13 |
| F2-14 | 每日计划、建议与可视化 | P2 | `pending` | F2-13 | - | 2026-07-13 |
| F2-15 | 端到端回归与文档收口 | 全程 | `pending` | F2-01 至 F2-14 | - | 2026-07-13 |

### 汇总

- 总任务：15
- `pending`：10
- `in_progress`：0
- `blocked`：0
- `done`：5

## 4. 产品决策记录

| 日期 | 决策 | 状态 |
| --- | --- | --- |
| 2026-07-13 | 每日新卡/旧卡额度为所有 Deck 共享的 global total | 已确认 |
| 2026-07-13 | List 正式条目消耗额度，辅助预览不消耗额度 | 已确认 |
| 2026-07-13 | Again/Hard 保留当前会话短期重学 | 已确认 |
| 2026-07-13 | 第二阶段新增断点恢复 | 已确认 |
| 2026-07-13 | 第二阶段新增自定义学习 | 已确认 |
| 2026-07-13 | 第二阶段新增每日计划与 7/30 天负载预测 | 已确认 |

## 5. 待确认设计决策

以下事项尚未得到用户明确确认。执行依赖任务前应先询问并把结果移入“产品决策记录”。

| ID | 最迟确认任务 | 待确认事项 | 当前建议 | 状态 |
| --- | --- | --- | --- | --- |
| D2-01 | F2-02 | 是否只允许一个会更新 SRS、消耗额度的活动会话 | 第一版只允许一个；避免复杂 reservation 和额度竞态 | `open` |
| D2-02 | F2-09 | 未完成会话快照保留多久 | 默认保留 30 天，过期后仍先提示用户再清理 | `open` |
| D2-03 | F2-10 | 普通关闭按钮的默认语义 | 默认“关闭并保留进度”，另设明确的“放弃会话” | `open` |
| D2-04 | F2-14 | 每日可用学习时间的默认值 | 首次使用时让用户选择，不猜固定分钟数 | `open` |
| D2-05 | F2-14 | retention 建议的最低数据门槛 | 最近 30 天且至少 200 条正式评分日志 | `open` |

## 6. 任务记录

## F2-01 显式会话描述与启动交接

- 状态：`done`（含 Codex review 三项修补）
- 执行者：Grok Build
- 开始时间：2026-07-13 10:25 CST
- 完成时间：2026-07-13 10:41 CST
- 本轮 review 缺陷（2026-07-13 Codex）及修补：
  1. **async load 竞态** → `asyncLoadGeneration` generation gate；Renderer 任意 await 后 `isCurrent` 才 commit；旧失败不覆盖新成功
  2. **多面板同 sessionId** → `retainRepeatReviewSession` / `releaseRepeatReviewSession` 引用计数；cleanup 唯一 release 入口（无 beforeFlush 双重释放）
  3. **custom 布尔语义** → scheduled 固定 true/true，practice 固定 false/false；factory 不接受覆盖，parse 不一致报错
- 实际改动文件（review 修补增量 + 初版）：
  - `src/srs/asyncLoadGeneration.ts` + `.test.ts`（新建）
  - `src/srs/reviewSessionDescriptor.ts` + `.test.ts`
  - `src/srs/repeatReviewManager.ts` + `.test.ts`
  - `src/components/SrsReviewSessionRenderer.tsx`
  - `src/srs/reviewSessionManager.ts`、`src/main.ts`、`contextMenuRegistry.tsx`、`SrsFlashcardHome.tsx`
  - `src/srs/reviewLogStorage.test.ts`（仅 Property 13 唯一 id，+12/-1 行，无全文件换行噪音）
  - `模块文档/SRS_复习队列管理.md`、`SRS_卡片复习窗口.md`、`README.md`
  - `闪卡优化2_PROGRESS.md`
- 聚焦测试：
  - `asyncLoadGeneration.test.ts` + descriptor + repeat + scope + reviewLogStorage → 5 files / 67 passed
- 类型检查：`npx tsc --noEmit` → 通过
- 全量测试：`npm test` → 81 files / **777** tests passed
- `git diff --check` → 通过
- 文档同步：已写 latest-wins 与 retain/release 语义
- 阻塞/备注：无
- 遗留验证：Orca UI 手工：快速连续 Deck A→B；同会话块两面板关一留一；重试按钮
- 下一步：F2-05 或 F2-02

## F2-02 global quota 与并发占用

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：Deck 不再拥有独立额度；需要明确实现单活动排期会话还是 reservation。
- 遗留验证：-
- 下一步：完成 F2-01 后固定 global used/reservation 生命周期。

## F2-03 List 正式条目接入预算

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：必须先占额度再写下一条 due，辅助预览不占额度。
- 遗留验证：-
- 下一步：在 F2-02 budget 语义稳定后实现 List 事务顺序。

## F2-04 Again/Hard 短期重新入队

- 状态：`done`（含 Codex review 修补）
- 执行者：Grok Build
- 开始时间：2026-07-13 10:57 CST
- 完成时间：2026-07-13 11:10 CST（初版 11:02；review 修补 11:10）
- 本轮 review 缺陷（2026-07-13 Codex）及修补：
  1. **pending 重入后完成摘要不重开** → `shouldReopenSessionFinalizeAfterPendingAppend` / `reopenSessionFinalizeIfNeeded`；实际追加且 wasComplete 时 reset finalize + `setSessionStats(null)`；progress 不清零
  2. **notify 数量** → `setQueue` 内 `commitPendingRequeueToQueue` 的 `actuallyAppended` 为准
  3. **finishSession 使 autosave inactive** → `resumeSessionPersistence` + `resumeSessionProgressAutosave`（当前挂载 sessionStorage 恢复写入，**不是** F2-09 跨重启断点）
  4. **注释** → pendingDueRequeue 与 Demo：到达队尾不清，仅明确完成/关闭/卸载/新轮
- 实际改动文件（初版 + review 修补）：
  - `src/srs/pendingDueRequeue.ts` + `.test.ts`
  - `src/srs/sessionProgressFinalize.ts` + `.test.ts`（reopen API + harness）
  - `src/srs/sessionProgressStorage.ts`（`resumeSessionProgressAutosave`）
  - `src/hooks/useSessionProgressTracker.ts`（`resumeSessionPersistence`）
  - `src/components/SrsReviewSessionDemo.tsx`
  - `模块文档/SRS 动态复习队列.md`、`SRS_卡片复习窗口.md`、`SRS_复习队列管理.md`
  - `闪卡优化2_PROGRESS.md`
- 聚焦测试：
  - `sessionProgressFinalize` + pending + storage + tracker → **4 files / 67 passed**（含 reopen harness、未追加不重置、resume autosave）
- 类型检查：`npx tsc --noEmit` → 通过
- 全量测试：`npm test` → 83 files / **828** tests passed
- `git diff --check` → 通过
- 文档同步：完成摘要 reopen、resume autosave 非 F2-09、队尾不清 pending
- 阻塞/备注：无
- 残余风险（明确记录，不假装 F2-09）：
  - `resumeSessionPersistence` 只恢复**当前挂载会话**的 sessionStorage autosave；Orca 重启后仍无完整断点（F2-09）
  - 用户点「完成」关面板后 pending 会 deactivate，与「到达队尾仍可重入」不同
- 遗留验证：Orca UI 最后一张 Again → 到期重入 → 再完成摘要含两次评分；关闭后无悬挂 timer
- 下一步：Codex 再检完整 diff；然后 F2-02

## F2-05 评分与状态动作同步门闩

- 状态：`done`
- 执行者：Grok Build
- 开始时间：2026-07-13 10:47 CST
- 完成时间：2026-07-13 10:50 CST
- 计划改动文件：
  - `src/srs/reviewSessionActionGate.ts` + `.test.ts`（新建：同步 acquire/release/invalidate + token）
  - `src/components/SrsReviewSessionDemo.tsx`（接入 grade/repeat/auxiliary/postpone/suspend/250ms 切卡）
  - `模块文档/SRS_卡片复习窗口.md`（action gate 与 choiceSubmitGate 分工）
  - `闪卡优化2_PROGRESS.md`
- 实际改动文件：
  - `src/srs/reviewSessionActionGate.ts` + `.test.ts`（新建）
  - `src/components/SrsReviewSessionDemo.tsx`（统一接入 action gate；List 部分失败保留「评分已保存」语义）
  - `src/srs/choiceSubmitGate.ts`（职责边界注释）
  - `模块文档/SRS_卡片复习窗口.md`
  - `闪卡优化2_PROGRESS.md`
  - （保留既有 F2-01 工作区改动，未 reset/checkout）
- 聚焦测试：`npx vitest run src/srs/reviewSessionActionGate.test.ts` → **21 passed**
  - 同 tick 双 acquire / grade 持锁时 postpone·suspend 失败 / 键盘重复
  - 失败 release 可重试 / 250ms 窗口仍锁定 / 旧 Promise 不推进新卡
  - 返回·跳过·继续·卸载 timer 失效 / 新卡可 acquire / repeat·auxiliary 一次
  - 会话 harness：A 的旧 Promise 不写 B 的 history/index
- 类型检查：`npx tsc --noEmit` → 通过
- 全量测试：`npm test` → 82 files / **798** tests passed
- `git diff --check` → 通过
- 文档同步：已写 action gate vs choiceSubmitGate 分工与释放规则
- 阻塞/备注：无
- 遗留验证：Orca UI 手工：同 tick 双击评分；评分中按 B/S；评分后 250ms 内再点；返回上一张时旧 timer
- 下一步：F2-02 或 F2-04

## F2-06 块 missing/unknown 三态

- 状态：`done`（含 Codex review 修补）
- 执行者：Grok Build
- 开始时间：2026-07-13 11:17 CST
- 完成时间：2026-07-13 11:26 CST（初版 11:20；review 修补 11:26）
- 本轮 Codex review 缺陷（2026-07-13）及修补：
  1. **无超时边界** → `DEFAULT_GET_BLOCK_TIMEOUT_MS=10000` + `timeoutMs` option；超时 → `unknown`（非 missing）；清理 timer；late resolve 不写 state/cache
  2. **非 null 一律 as Block** → `validateBackendBlockIdentity`（非数组 object + 有限 number id === 请求 id）；失败 → unknown 且不写 state
  3. **错误注释** → `reviewSessionBlockLoad` 文件头改为：全检后任一 unknown 优先保留；无 unknown 且任一 missing 才剔除
- 实际改动文件（初版 + review 修补）：
  - `src/srs/blockExistence.ts` + `.test.ts`（timeout + 身份校验 + 确定性 deferred 测试）
  - `src/srs/reviewSessionBlockLoad.ts` + `.test.ts`（注释修正；决策测试保留）
  - `src/srs/deletedCardCleanup.ts`（共用三态 re-export）
  - `src/components/SrsReviewSessionDemo.tsx`（三态 UI；本轮未再改）
  - `模块文档/SRS_卡片复习窗口.md`、`SRS_数据存储.md`、`README.md`
  - `闪卡优化2_PROGRESS.md`
- 聚焦测试（review 修补后）：
  - `npx vitest run src/srs/blockExistence.test.ts src/srs/reviewSessionBlockLoad.test.ts src/srs/deletedCardCleanup.test.ts` → **3 files / 77 passed**
- 类型检查：`npx tsc --noEmit` → 通过
- 全量测试：`npm test` → **85 files / 873 tests passed**
- `git diff --check` → 通过
- 文档同步：timeout 默认与 option、身份校验、late resolve 语义、List 决策注释
- 阻塞/备注：无。唯一 Grok 修补轮；未扩张其他 F2；保留全部未提交改动
- 遗留验证：Orca UI 手工：
  1. get-block 失败/超时 → 卡保留 + 重试
  2. 删除块 → 一次 missing 剔除
  3. List 父/子分别 unknown/missing
  4. 预缓存失败不跳当前卡
- 下一步：无需再开 Grok 写入轮；可选 Codex 再检 timeout/身份校验 diff

## F2-07 动态追加 React 状态纯化

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：依赖 global budget 与 pending requeue 的最终数据结构。
- 遗留验证：-
- 下一步：抽取纯计算结果，移除 updater 内通知与外部 Set 修改。

## F2-08 FSRS 设置完整校验

- 状态：`done`（含 Codex review 修补）
- 执行者：Grok Build
- 开始时间：2026-07-13 11:32 CST
- 完成时间：2026-07-13 11:41 CST（初版 11:37；review 修补 11:41）
- 计划改动文件：见 `F2-08_PLAN.md`
- 本轮 Codex review 缺陷及修补：
  1. **warning 去重** → validated 无 issues（合法 / undefined 静默默认）时清除 `lastWarnedConfigFingerprint`；不影响 FSRS 生效参数 cache。故 非法 A → 合法 → 非法 A 通知两次；同非法配置连续预览仍只一次；非法 A→B 各一次
- 实际改动文件（含初版 + review 修补）：
  - `src/srs/settings/reviewSettingsSchema.ts` + `reviewSettingsSchema.test.ts`
  - `src/srs/algorithm.ts` + `algorithm.fsrsSettings.test.ts`（修补 + 序列测试）
  - `src/srs/fsrsPreviewPluginName.harness.test.ts`
  - `src/srs/registry/commands.ts` + `resetFsrsSettings.test.ts`
  - `src/components/SrsCardDemo.tsx`、`ClozeCardReviewRenderer.tsx`、`DirectionCardReviewRenderer.tsx`、`ListCardReviewRenderer.tsx`、`ChoiceCardReviewRenderer.tsx`
  - `模块文档/SRS_记忆算法.md`、`SRS_卡片复习窗口.md`、`SRS_插件入口与命令.md`、`README.md`
  - `F2-08_PLAN.md`、`闪卡优化2_PROGRESS.md`
- 聚焦测试（唯一精确命令；**Test Files 5 passed / Tests 47 passed**）：
  ```bash
  npx vitest run \
    src/srs/settings/reviewSettingsSchema.test.ts \
    src/srs/algorithm.fsrsSettings.test.ts \
    src/srs/algorithm.test.ts \
    src/srs/registry/resetFsrsSettings.test.ts \
    src/srs/fsrsPreviewPluginName.harness.test.ts
  ```
- 类型检查：`npx tsc --noEmit` → 通过
- 全量测试：`npm test` → **Test Files 89 passed / Tests 913 passed**
- `git diff --check` → 通过
- 文档同步：记忆算法补充「合法配置重置去重」
- 阻塞/备注：无
- 遗留验证（Orca UI 手工）：
  1. 非法 A warn → 改合法 → 再改非法 A 应再 warn
  2. 同配置预览四按钮不重复弹
  3. 恢复默认命令成功/失败可见
  4. 预览与正式 Good due 一致
- 下一步：无需再开 Grok 写入轮；可选 Codex 再检

## F2-09 完整会话快照持久化

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：必须跨 Orca 重启；不能继续把 sessionStorage 自动保存当作断点恢复。
- 遗留验证：-
- 下一步：先确定 schema/version、写入串行策略和 reservation 字段。

## F2-10 恢复/放弃/冲突处理 UI

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：依赖 snapshot 与 missing/unknown 规则。
- 遗留验证：需要真实 Orca 重启场景。
- 下一步：实现“继续 / 关闭并保留 / 放弃”清晰交互。

## F2-11 自定义学习筛选器与预览

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：第一版不要求保存预设。
- 遗留验证：-
- 下一步：先实现结构化定义、纯 predicate 和结果预览。

## F2-12 自定义学习会话模式

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：排期学习消耗 global quota；额外练习不更新 SRS、不消耗 quota。
- 遗留验证：-
- 下一步：在筛选和恢复基础稳定后接入两种会话模式。

## F2-13 7/30 天负载预测模型

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：需要特别处理 List 逐条解锁，不能把全部未来条目直接计入同一天。
- 遗留验证：-
- 下一步：先完成纯预测数据模型和本地日界测试，不先做图表。

## F2-14 每日计划、建议与可视化

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：待执行者确认
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：retention 只建议不自动修改；数据不足时不产生建议。
- 遗留验证：需要窄面板和真实数据视觉检查。
- 下一步：F2-13 完成后设计 7/30 天视图和建议解释文本。

## F2-15 端到端回归与文档收口

- 状态：`pending`
- 执行者：-
- 开始时间：-
- 完成时间：-
- 计划改动文件：所有受影响测试与模块文档
- 实际改动文件：-
- 聚焦测试：-
- 类型检查：-
- 全量测试：-
- 文档同步：-
- 阻塞/备注：本任务不能代替各功能任务随改随测。
- 遗留验证：完整 Orca 手工检查清单。
- 下一步：每完成一个 F2 任务即累计更新本项的回归覆盖记录。

## 7. 交接记录

### 2026-07-13 11:44 - Codex - F2-08 最终验收

- 当前状态：`done`
- Codex review：首轮发现「非法 A → 合法 → 再非法 A」不会再次告警；同一 Grok session 修补 1 轮后，合法/undefined 安全配置会清除 warning 指纹，且不影响 FSRS 生效参数 cache
- 最终确认：
  1. 权重仅接受恰好 21 个完整、有限数字；retention 仅 `0.7..0.99`；maximum interval 仅 `1..36500` 有限整数
  2. 非法字段逐项回退默认并用户可见；同非法连续预览只告警一次，配置修好后再次破坏会重新告警
  3. Basic/Cloze/Direction/List/Choice 与混合复习预览均传 `pluginName`，和正式评分共用 validated 参数路径
  4. `${pluginName}.resetFsrsSettings` 使用已验证的 `orca.plugins.setSettings("app", ...)`，成功/失败可见并正确注销
- Codex 独立验证：
  - 精确 5 文件聚焦测试 → 5 files / 47 passed
  - `npx tsc --noEmit` → 通过
  - `npm test` → 89 files / 913 passed
  - `git diff --check` → 通过
- 遗留验证：Orca UI 手工检查非法设置告警、修好后再破坏、恢复默认命令、预览与正式 Good due
- 下一建议动作：确认 D2-01 后推进 F2-02 → F2-03 → F2-07；随后确认 D2-02/D2-03 进入 F2-09/F2-10

### 2026-07-13 11:41 - Grok Build - F2-08 Codex review 修补完成

- 当前状态：`done`
- 已完成：
  1. `resolveAndApplyFsrsConfig` / `maybeWarnFsrsConfigIssues`：无 issues 时 `lastWarnedConfigFingerprint = null`
  2. 测试：非法 A→合法→非法 A 通知 2 次；undefined 后首次非法可通知
  3. 聚焦 5 files / 47；tsc；npm test 89/913；diff --check；文档一句同步
- 验证命令：见任务记录 F2-08 精确 bash
- 阻塞或风险：Orca UI 手工仍待
- 下一建议动作：无需再开修补轮

### 2026-07-13 11:40 - Grok Build - F2-08 Codex review 修补开始

- 当前状态：已于 11:41 完成 → `done`
- Codex 缺陷：`lastWarnedConfigFingerprint` 在合法配置（无 issues）时未清除 → 非法 A → 合法 → 非法 A 第二次静默
- 计划：无 issues 时重置去重状态（不影响 FSRS cache）；补序列测试；精确聚焦命令后全量验证

### 2026-07-13 11:37 - Grok Build - F2-08 初版完成

- 当前状态：曾标 `done`；11:40 因 Codex review 改回 `in_progress`
- 已完成：
  1. 纯校验 `validateFsrsConfig`：严格 21 权重、retention 0.7..0.99、max 1..36500；undefined 静默默认；issues 可诊断
  2. `algorithm` 仅 validated 进 FSRS；规范化 cache；warn 指纹去重；`clearFsrsRuntimeState`
  3. basic/cloze/direction/list/choice 预览均传 `pluginName`
  4. 命令 `${pluginName}.resetFsrsSettings` 注册/注销；`setSettings("app", ...)` 写三项默认
  5. 初版测试与文档同步
- 阻塞或风险：warning 去重在「修好后再破坏」路径有缺陷（本轮修补）

### 2026-07-13 11:32 - Grok Build - F2-08 开始

- 当前状态：已于 11:37 完成 → `done`
- 已完成：阅读方案 F2-08、Progress、`ts-fsrs@5.2.3` 的 `default_w`/`generatorParameters`、Orca `setSettings("app", ...)` 文档；固定规则：权重恰好 21 有限数、retention `0.7..0.99`、max `1..36500`
- 计划：见 `F2-08_PLAN.md`

### 2026-07-13 11:29 - Codex - F2-06 最终验收

- 当前状态：done
- Codex review：首轮发现 timeout 与不可判定返回值被遗漏，打回同一 Grok session 修补 1 轮；修补后逐项检查三态 resolver、List 汇总决策、重试、预缓存隔离与 stale async gate
- 最终确认：
  - `null` / `undefined` 才是 missing；throw / timeout / 畸形值 / id 不匹配均为 unknown
  - timeout 后 late resolve/reject 不写 state、不覆盖 cache；unknown 保留当前卡并可显式重试
  - List 全检后 unknown 优先；无 unknown 且任一 required missing 才剔除
- Codex 独立验证：
  - `npx vitest run src/srs/blockExistence.test.ts src/srs/reviewSessionBlockLoad.test.ts src/srs/deletedCardCleanup.test.ts` → 3 files / 77 passed
  - `npx tsc --noEmit` → 通过
  - `npm test` → 85 files / 873 passed
  - `git diff --check` → 通过
- 遗留验证：Orca UI 手工模拟 get-block throw/timeout 后重试、明确 missing 自动剔除、List 父/子分别失败、下一张预缓存失败不影响当前卡
- 下一建议动作：推进无产品决策依赖的 F2-08；F2-02 继续等待 D2-01

### 2026-07-13 11:26 - Grok Build - F2-06 Codex review 修补完成

- 当前状态：done
- 已完成：
  1. `DEFAULT_GET_BLOCK_TIMEOUT_MS` + `timeoutMs`；超时 unknown；timer 清理；late resolve 不写 state/cache
  2. `validateBackendBlockIdentity` 最小身份校验；false/string/array/{}/wrong id → unknown
  3. `reviewSessionBlockLoad` 文件头注释修正
  4. 确定性 deferred + 短 timeout 测试；文档与 Progress 更新
- 验证：聚焦 3 files / 77 passed；`tsc` 通过；`npm test` 85/873；`git diff --check` 通过
- 阻塞或风险：Orca UI 手工仍待；默认 timeout 10s 在真实 UI 需手工确认体感
- 下一建议动作：可选 Codex 再检；然后 F2-08 或 F2-02（D2-01）

### 2026-07-13 11:24 - Grok Build - F2-06 Codex review 修补开始

- 当前状态：in_progress（已于 11:26 完成）
- Codex 缺陷：
  1. get-block 无 timeout → 永不 settle 时卡死无错误/无重试
  2. 非 null 一律当 exists（false/string/array/{}/wrong id）
  3. reviewSessionBlockLoad 文件头注释与真实「任一 missing」规则不符
- 计划：timeout 常量 + option 注入；最小 Block 身份校验；补确定性测试；更新文档
- 下一建议动作：完成本轮修补并全量验证后标 done

### 2026-07-13 11:20 - Grok Build - F2-06 完成

- 当前状态：done
- 已完成：
  - 抽取通用 `blockExistence` 三态（cleanup re-export 兼容）
  - 复习纯决策 `reviewSessionBlockLoad`：List 全检、unknown 优先于 missing、stale 作废、prefetch 只诊断
  - Demo：仅 missing 写 auto-dropped；unknown 错误条 + 重试 nonce；预缓存失败不改队列
- 实际改动文件：见任务记录 F2-06
- 验证命令与结果：
  - 聚焦：2 files / 32 passed（+ cleanup 共 64）
  - `npx tsc --noEmit` → 通过
  - `npm test` → 85 files / 860 tests passed
  - `git diff --check` → 通过
- 阻塞或风险：Orca UI 手工未做；Demo 内 applyMissing 闭包依赖 effect 同步 currentIndex（与旧逻辑同构）
- 遗留验证：见 F2-06 任务记录
- 下一建议动作：Codex review F2-06；推进 F2-08 或 F2-02（待 D2-01）

### 2026-07-13 11:15 - Codex - F2-04 最终验收修补

- 当前状态：done
- 已完成：
  - 修复 `actuallyAppended` 依赖 React `setQueue` updater 立即执行的时序问题
  - 直接提交 `processPendingWake` 的纯 `queue/appended` 结果，并同步更新 `queueRef`
  - 保证 pending 实际追加后稳定 reopen finalize；未追加时不重置摘要、不发送假数量通知
- 实际改动文件：`src/components/SrsReviewSessionDemo.tsx`、`闪卡优化2_PROGRESS.md`
- 验证命令与结果：
  - 聚焦测试：5 files / 88 passed
  - `npx tsc --noEmit` → 通过
  - `npm test` → 83 files / 828 tests passed
  - `git diff --check` → 通过
- 阻塞或风险：Orca UI 手工验证仍待执行；F2-09 前不提供跨重启 pending 持久化
- 遗留验证：最后一张 Again → pending 重入 → 二次完成摘要包含两次评分；关闭后无悬挂 timer
- 下一建议动作：推进 F2-06 / F2-08，F2-02 等待 D2-01 产品决策

### 2026-07-13 11:10 - Grok Build - F2-04 review 修补完成

- 当前状态：done
- 已完成：
  - reopen finalize 判定/API + Demo 在实际追加且 wasComplete 时重置摘要
  - notify 用 actuallyAppended；resumeSessionPersistence 不清零 progress
  - pending 注释与队尾生命周期一致；文档 + 聚焦 67 + 全量 828 + tsc + diff --check
- 实际改动文件：见任务记录
- 验证命令与结果：
  - 聚焦 4 files / 67 passed
  - `npx tsc --noEmit` → 通过
  - `npm test` → 83 files / 828 tests passed
  - `git diff --check` → 通过
- 阻塞或风险：无（F2-09 跨重启仍未做，已写残余风险）
- 遗留验证：Orca UI 最后一张 Again → 重入 → 二次完成摘要
- 下一建议动作：Codex 再检完整 diff

### 2026-07-13 11:07 - Grok Build - F2-04 review 修补

- 当前状态：in_progress（已完成见上条）
- 已完成：Progress 改回 in_progress；记录 Codex 完成摘要不重开缺陷
- 实际改动文件：`闪卡优化2_PROGRESS.md`（状态）
- 验证命令与结果：当时尚未改源码
- 阻塞或风险：无
- 遗留验证：Orca UI 最后一张 Again → 重入 → 摘要含两次
- 下一建议动作：reopen finalize + resume persistence + 测试

### 2026-07-13 11:02 - Grok Build - F2-04

- 当前状态：done
- 已完成：
  - 纯模块 `pendingDueRequeue`：幂等 upsert、generation/timer token、尾部去重、稳定排序、processPendingWake
  - Demo 接入：正式 again/hard + 窗口 + action token 后 track；唯一 timer 重排；finish/close/unmount/新轮 deactivate
  - 修整队列去重缺陷（历史副本不再挡重入）；scope/budget 拒绝保留 pending + notify
  - 文档 + 聚焦 119 + 全量 823 + tsc + diff --check
- 实际改动文件：见任务记录
- 验证命令与结果：
  - 聚焦 5 files / 119 passed
  - `npx tsc --noEmit` → 通过
  - `npm test` → 83 files / 823 tests passed
  - `git diff --check` → 通过
- 阻塞或风险：无
- 遗留验证：Orca UI Again/Hard 到期重现；最后一张 Again；关闭无悬挂 timer
- 下一建议动作：Codex 检完整 diff；然后 F2-02

### 2026-07-13 10:57 - Grok Build - F2-04

- 当前状态：in_progress（已完成见上条）
- 已完成：阅读方案/Progress 与 Demo pending/scope/budget/gate 源码；总表与 F2-04 改为 in_progress
- 实际改动文件：`闪卡优化2_PROGRESS.md`（状态）
- 验证命令与结果：当时尚未改源码
- 阻塞或风险：无
- 遗留验证：Orca UI Again/Hard 到期后同会话重现
- 下一建议动作：实现 `pendingDueRequeue` 并接入 Demo

### 2026-07-13 10:50 - Grok Build - F2-05

- 当前状态：done
- 已完成：
  - 同步 `reviewSessionActionGate`（acquire/release/complete/invalidate/bindCard + token）
  - Demo 接入 formal/repeat/auxiliary grade、postpone、suspend、250ms 切卡
  - 导航/自动剔除/卸载作废旧 token；List 部分失败不回滚评分
  - choiceSubmitGate 与 action gate 分工注释 + 模块文档
  - 聚焦 21 + 全量 798 + tsc + diff --check
- 实际改动文件：见任务记录
- 验证命令与结果：
  - `npx vitest run src/srs/reviewSessionActionGate.test.ts` → 21 passed
  - `npx tsc --noEmit` → 通过
  - `npm test` → 82 files / 798 tests passed
  - `git diff --check` → 通过
- 阻塞或风险：无
- 遗留验证：Orca UI 双击评分 / 评分中 B·S / 250ms 窗口 / 返回上一张
- 下一建议动作：F2-02 或 F2-04；Codex 可检完整 diff

### 2026-07-13 10:47 - Grok Build - F2-05

- 当前状态：in_progress（已完成见上条）
- 已完成：阅读方案/Progress 与相关源码；总表与 F2-05 改为 in_progress
- 实际改动文件：`闪卡优化2_PROGRESS.md`（状态）
- 验证命令与结果：当时尚未改源码
- 阻塞或风险：无
- 遗留验证：Orca UI 双击评分 / 评分中按 B·S
- 下一建议动作：实现 `reviewSessionActionGate` 并接入 Demo

### 2026-07-13 10:41 - Grok Build - F2-01 review 修补完成

- 当前状态：done
- 已完成：generation gate；retain/release；custom 固定 flags；文档；全量验证
- 验证：
  - 聚焦 67 passed（含 asyncLoadGeneration / retain / custom）
  - `npx tsc --noEmit` 通过
  - `npm test` 81 files / 777 tests passed
  - `git diff --check` 通过；`reviewLogStorage.test.ts` 仅 +12/-1
- 遗留验证：Orca UI 连续 Deck A/B、同块双面板
- 下一建议动作：F2-05 或 F2-02；Codex 可再检完整 diff

### 2026-07-13 10:35 - Grok Build - F2-01 review 修补

- 当前状态：in_progress（已完成见上条）
- 已完成：Progress 改回 in_progress；记录 Codex 三项缺陷
- 待修：当时待实现

### 2026-07-13 10:30 - Grok Build - F2-01

- 当前状态：done（已被 Codex review 打回，见上条）
- 已完成：
  - 版本化 `ReviewSessionDescriptor`（normal/all、normal/deck、fixed/repeat、custom 类型）
  - 每次启动新建会话块，描述写入 `_repr.sessionDescriptor`
  - Renderer 仅按 blockId 读描述；失败明确报错不回退 all
  - repeat 按 sessionId 隔离；卸载只清本会话
  - 文档与聚焦/全量测试、tsc、diff --check 通过
- 实际改动文件：见任务记录「实际改动文件」
- 验证命令与结果：
  - 聚焦 Vitest：46 passed
  - `npx tsc --noEmit`：通过
  - `npm test`：80 files / 764 tests passed
  - `git diff --check`：通过
- 阻塞或风险：fixed/repeat 卡片载荷仍在进程内存（完整持久化属 F2-09）；custom 仅类型无启动路径
- 遗留验证：Orca UI 连续 Deck A/B、多面板、重复复习并发
- 下一建议动作：F2-05 或 F2-02

### 2026-07-13 10:25 - Grok Build - F2-01

- 当前状态：in_progress（已完成见上条）
- 已完成：阅读方案/Progress/plugin-docs；总表与任务记录改为 in_progress
- 实际改动文件：`闪卡优化2_PROGRESS.md`（状态）
- 验证命令与结果：当时尚未改源码
- 阻塞或风险：无
- 遗留验证：Orca UI 快速连续启动 Deck A/B
- 下一建议动作：实现版本化 `ReviewSessionDescriptor` 与按 block 关联

### 2026-07-13 - Codex

- 完成：创建第二阶段方案与 Progress 跟踪文档。
- 代码改动：无。
- 验证：F2-01 至 F2-15 在方案和总表中一一对应；`git diff --check` 通过；未运行代码测试（仅新增 Markdown 文档）。
- 结论：所有任务初始化为 `pending`，下一实施任务建议为 F2-01。

## 8. 通用交接模板

后续 Agent 在本节顶部追加记录：

```markdown
### YYYY-MM-DD HH:mm - Agent 名称 - F2-XX

- 当前状态：in_progress / blocked / done
- 已完成：
- 实际改动文件：
- 验证命令与结果：
- 阻塞或风险：
- 遗留验证：
- 下一建议动作：
```
