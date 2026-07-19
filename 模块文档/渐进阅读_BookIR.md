# 渐进阅读 Book IR（建书 / 顺序 / 退出）

> **文档同步日期：2026-07-19**  
> 以 `src/srs/book-ir/*`、`src/srs/bookIRCreator.ts`、会话内顺序推进与右键/命令入口为实现真相。  
> 通用 IR 会话与工作区见 [`渐进阅读.md`](渐进阅读.md)。EPUB 纯笔记导入见 [`EPUB导入.md`](EPUB导入.md)。  
> 排期写回细节见 [`记忆排期推送.md`](记忆排期推送.md)。  
>
> 2026-07-19：**已完成章节资料库保留（landed）**——完成本章/归档 strip 章节 Topic IR，笔记保留；资料库书下仍显示章节结构与「已完成」；摘录靠 `ir.sourceTopicId` + `ir.sourceBookId` 挂回。详见下文「资料库展示」与 [`渐进阅读.md`](渐进阅读.md) 资料库三级树。

## 概述

在 EPUB 普通导入结果或已有「书籍 + 章节引用」结构上，建立版本化阅读计划 `ir.bookPlan`（属性常量 `IR_BOOK_PLAN_PROP`），支持：

| 模式 | `mode` | 行为 |
| --- | --- | --- |
| **分散排期**（默认） | `distributed` | 选中章节**全部**初始化为 Topic IR；第 1 章 `due` 为今天，其余按 `totalDays` 分散；之后各章走**普通 Topic 记忆型排期**（基础间隔 + ×1.25 增长） |
| **顺序解锁** | `sequential` | 计划记录全部 `selectedChapterIds`；**同时只激活一章**（写 `#card` + IR）；完成或跳过才解锁下一章。**当前激活章**在「下一篇」时走 **Sequential Active Cadence（SAC）短节奏**，与普通 Topic 记忆间隔分离 |

移出渐进阅读只清理卡片身份与调度，**不删除**笔记正文、图片、引用或 `epub.*` 溯源。

## 持久化：`BookIRPlanV1`

写在**书籍块**属性 `ir.bookPlan`：

- 写入类型：`PropType.JSON`（`0`），值为 JSON 对象
- 读取兼容：历史 JSON 字符串；以及 Orca 将旧 `PropType.BlockRefs`（`2`）文本读成的单元素数组（如 `["{...}"]`）
- 下一次完成/跳过/保存计划时会自动改写为正确 JSON 属性
- 真正的块引用 ID 数组无法还原计划 → 显式 `EpubValidationError`，要求清空后重新初始化
- `version` 必须为 `1`；其他版本拒绝解析（**禁止猜测修复**）

类型定义：`src/importers/epub/types.ts`（`BookIRPlanV1`）；仓库 re-export：`src/srs/book-ir/bookIRPlanTypes.ts`。  
解析/序列化：`src/srs/book-ir/bookIRPlanRepository.ts`（`parseBookIRPlan` / `loadBookIRPlan` / `saveBookIRPlan` / `clearBookIRPlan`）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `1` | 计划 schema 版本，固定 1 |
| `bookBlockId` | `DbId` | 稳定书籍身份（不用 `batchId` 当书身份） |
| `mode` | `"distributed" \| "sequential"` | 排期/解锁模式 |
| `priority` | `number` | 章节 Topic 初始化优先级（写入各章 `ir.priority`；顺序激活章的 SAC 也读该优先级） |
| `totalDays` | `number` | **仅分散模式**用于首次 due 跨度（天）。顺序模式会保存该字段（schema 必填、UI 可录入），但**不参与**顺序解锁、不作为每章间隔、也不驱动 SAC。勿把它当成「每章 N 天」 |
| `selectedChapterIds` | `DbId[]` | 第二阶段选中的章节，顺序即阅读/解锁顺序 |
| `activeChapterId` | `DbId \| null` | 顺序模式当前章；无激活则为 `null`（含暂停、全书完成、或推进失败后的可重试态） |
| `outcomes` | `Record<string, BookIRChapterOutcome>` | 每章结果 |
| `lastError` | `string \| null`（可选） | 顺序下一章激活失败等可诊断错误 |

### 章节 outcome

| 值 | 含义 |
| --- | --- |
| `pending` | 计划内、尚未成为 Topic IR（顺序模式锁定章） |
| `active` | 当前已初始化为 Topic IR |
| `completed` | 用户「完成本章」 |
| `skipped` | 用户「跳过本章并继续」 |
| `removed` | 从 IR 移出（笔记仍在） |

解析失败必须抛 `EpubValidationError`（带 `code`，如 `plan_missing` / `plan_version` / `plan_corrupted_blockrefs`），禁止静默默认。

## 服务分层

| 模块 | 职责 |
| --- | --- |
| `bookIRService.initializeBookIR` | 两种模式初始化 + 写 plan；返回 `BookIRMutationResult` |
| `bookIRChapterInit.initializeChapterAsTopicIR` | 单章：`#card type=topic` + `ir.*`（含 `sourceBookId` / `batchId` 等）+ 入 IR 索引；**不**读写 plan / `epub.*` |
| `bookIRProgression.advanceSequentialBook` | 完成/跳过 + 检查点式解锁下一章；读/推后/改优先级**禁止**调用 |
| `bookIRProgression.retrySequentialActivation` | 顺序书统一修复入口：扫描 live/partial、收敛单卡、对齐 plan（含 `active!=null` 的 dual-live） |
| `bookIRService.retryFailedBookIRInit`（sequential） | **始终**委托 `retrySequentialActivation`，不再因 `activeChapterId!=null` 早退 |
| `bookIRRemovalService.removeBookFromIR` | 整本移出（`Promise.allSettled`）；成功则 `clearBookIRPlan` |
| `bookIRRemovalService.removeChaptersFromIR` | 章节批量移出；顺序激活章被移出时**暂停**（`sequentialPaused`），**不**静默推进 |
| `bookIRRemovalService.retryRemoveChaptersFromIR` | 仅重试失败章节 ID |
| `bookIRRemovalConfirm` | 确认文案与调用封装（UI） |
| `bookIRCreator.setupBookIR` | 兼容门面 → `initializeBookIR({ mode: "distributed", ... })` |
| `bookIRCreator.calculateChapterDueDates` | 分散 due 计算 |
| `bookIRCreator.getChapterBlockIds(Async)` | 从书籍块 inline refs 发现章节（遗留 UI / 右键） |

请求/结果类型：`InitializeBookIRRequest`、`AdvanceSequentialBookRequest`、`BookIRMutationResult`（`kind`: `initialized` \| `advanced` \| `removed` \| `partial`）。

## 章节初始化（`initializeChapterAsTopicIR`）

对单个章节块：

1. 无 `#card` 则 `insertTag` + `type=topic`；已有则 `setRefData` 保证 `type=topic`
2. 写入 IR 属性：`priority`、`due`、`intervalDays`（按优先级基础间隔，**非**「到首次 due 的天数」）、`stage=topic.preview`、`lastAction=init`、`position`、`sourceBookId` / `sourceBookTitle`、可选 `batchId` / `batchCreatedAt` 等
3. `upsertIRIndexId` 增量入索引

分散模式：全部选中章初始化，`outcomes[id]=active`，`activeChapterId` 取成功列表第一项。  
顺序模式：仅第一选中章初始化为 `active`，其余保持 `pending`（无 `#card` / 无 IR 调度 → 收集器不会入队）。

## 顺序模式规则

- **锁定章**：`pending` → 无卡身份 → 不会进入 IR 队列
- **仅**「完成本章」或「跳过本章并继续」调用 `advanceSequentialBook`
- 打开/阅读、下一篇、推后、改优先级**不得**解锁下一章
- `completed` 与 `skipped` 在 plan 中可区分，但对解锁行为等价（都会尝试激活下一 `pending`）

### 资料库展示（大纲结构 vs 队列）

资料库树展示**书籍大纲 + live IR 卡 + 仍存活的 Extract**；真实阅读队列仍只含 live IR 卡。完成本章 / 归档会 strip 章节 Topic 身份，但**不得**让该书在资料库中「塌成只剩无章节的摘录桶」。

#### 顺序模式大纲（plan 驱动）

顺序模式同一时间通常只有**一张** Topic IR（`activeChapterId`）。资料库树不能只渲染真实卡，否则完成第一章后用户会只看到下一激活章、甚至在短暂无卡窗口看到「没有匹配的渐进阅读卡片」。

| 层 | 行为 |
| --- | --- |
| 发现 | `loadSequentialBookTreeContexts`：合并 **live 卡 `sourceBookId`** 与 **repo 级顺序书注册表**（`sequentialBookRegistry`，localStorage，按 `orca.state.repo` 隔离），加载 `mode === "sequential"` 的 `ir.bookPlan`；章节标题优先 manifest，其次块标题。plan/manifest 失败写 `console.error` 并进入 `warnings`，**不**静默清空整本，也**不**在读失败时 prune 注册表 |
| 注册表 | `saveBookIRPlan`（sequential）时 `registerSequentialBookId`；`clearBookIRPlan` 时 `unregister`。仅在确认无 sequential plan 时 prune 过期 id。上限 500，不扫描 `get-all-blocks` |
| 树构建 | `buildIRSourceTree` 选项 `sequentialBooks`：即使 **零 live 卡** 也创建 book source 组；对 `selectedChapterIds` 中尚无 Topic 卡的章创建占位 `IRChapterNode`（`card: null`，`isSequentialPlaceholder: true`，`sequentialStatus`） |
| 已完成章 | plan `outcomes[id]=completed` → 占位节点保留在大纲中；徽标 **「已完成」**；`card: null`、不可操作；**其下 Extract** 经 `ir.sourceTopicId === chapterId` 挂回（摘录仍 actionable） |
| 真实队列 | **不变**：仍仅 `collectAllIRCards`；占位**不**写 `#card`、**不**入索引、不进批量选择 |
| UI | 激活章：徽标「当前激活」+ 原有 due/阶段/开始阅读等；未激活/已完成/已跳过：灰化 + 文案，无操作按钮、不进 `selectedCardIds` |
| 筛选 | 默认「全部」保留大纲；时间带与属性筛选不把纯占位当匹配卡 |

#### 分散模式与跨模式：已完成章 + 摘录挂靠（landed）

| 要点 | 行为 |
| --- | --- |
| 完成本章 / 归档 | `completeIRCard` / progression strip：**只**清章节上的 `#card`、`srs.*`、`ir.*` 与索引；**不删**章节块与正文 |
| Extract 耐久溯源 | 创建摘录时写 `ir.sourceTopicId`；来源为书章节时再写 `ir.sourceBookId` / `ir.sourceBookTitle`（见 [`渐进阅读.md`](渐进阅读.md) 跨块摘录） |
| 分散书上下文节点 | 章节 strip 后无 live Topic 时，`buildIRSourceTree` 用同书 Extract 的 `sourceTopicId` **合成**上下文章节（`card: null`，标「已完成」）；**不是**「未关联章节的摘录」fallback |
| 收集器 legacy | 父 Topic 仍 live 时，Extract 可在内存继承 book meta；章节完成后必须依赖 Extract 上的耐久 `sourceBookId` |
| 「未关联章节的摘录」 | **仅**无法在该来源组内解析到父章节（无可用 `sourceTopicId` / 无对应上下文）时的兜底桶 |
| 标题 | `titleMap` 对 Extract 的 `sourceTopicId` 做 `get-blocks`，即使该章已非 IR 卡 |

相关文件：`workspace/loadSequentialBookTreeContexts.ts`、`workspace/irSourceTreeBuilder.ts`、`workspace/irChapterPresentation.ts`、`src/srs/book-ir/sequentialBookRegistry.ts`、`workspace/IRLibraryChapterItem.tsx`、`workspace/useIRWorkspaceLibrary.ts`、`src/srs/extractUtils.ts`、`src/srs/incrementalReadingCollector.ts`。

### Sequential Active Cadence（SAC）：当前激活章的短节奏

**问题**：顺序模式虽只激活一章，但章节卡原先复用普通 Topic 排期（priority=50 时基础间隔约 8 天，每次「下一篇」×1.25），导致一章分三次阅读可能拖到 20+ 天。

**适用范围**（必须同时满足）：

1. 书籍 `ir.bookPlan.mode === "sequential"`
2. 当前块 `blockId === plan.activeChapterId`
3. 章节带 `ir.sourceBookId` 指向该书籍

**不走 SAC**（保持原 Topic/Extract 行为）：普通 Topic、Extract、distributed 各章、顺序计划中**非** active 的章（通常本就无 IR）。

**基线间隔**（`ir.priority` 0–100，经 `normalizePriority`；公式在 `irSchedulingHelpers.getSequentialActiveBaseIntervalDays`）：

```text
baseIntervalDays = 1 + 2 * (1 - priority / 100)
```

| priority | 约期间隔 |
| --- | --- |
| 0 | 3 天 |
| 50 | 2 天 |
| 100 | 1 天 |

间隔最终 ≥ 1 天。数值 **1/2/3 天是产品启发式**，不是学习科学给出的固定最优；与「记忆巩固」的 Topic 增长是不同目标。

**有实际阅读进展时**：下一次仍用 SAC 短节奏重算，**不**使用 Topic 的 ×1.25 增长。

**停滞保护**（防超长章/空转占满队列）：

- 进度指纹来自现有字段：`ir.resumeBlockId` + `ir.breakpoint`（`readingBreakpoint` 的 preview/selection；**不含** `updatedAt`）
- 可选持久化：`ir.sacProgressKey`、`ir.sacStagnantCount`（缺失视为无历史，**不**批量迁移旧数据）
- 连续「下一篇」且指纹不变 → `stagnantCount` 递增，间隔 `base + stagnantCount * 1` 天，**上限约 6 天**
- 指纹变化（resume/断点实质前进）→ 停滞计数清零
- **局限说明**：若用户阅读却从未写回断点/resume，指纹会一直为空，连续 next 会被判停滞并逐渐拉长间隔——保守策略，与断点写入路径一致

**手动意图优先**：

- `postpone` / 会话推后：只写 `due` / `lastAction=postpone`（及 `postponeCount`），**保留** intentional `intervalDays`（Batch B2）；**打开卡片不会**用 SAC 静默覆盖
- 仅在用户再次「下一篇」等写路径时按 SAC 重算下一轮
- 显式改优先级：SAC 章按新 priority 重算短节奏（属用户意图）；非 SAC 仍比例修正

**兼容**：

- 不重写历史 `ir.bookPlan`、不批量 re-anchor 已有 due
- 从**下一次** `markAsRead` / 相关写路径起对新逻辑生效；已经很远的 due 保持到用户动作再变
- `totalDays` 在 sequential 中仍只是存盘字段，与 SAC 无关

**实现位置**：

- 纯函数：`src/srs/incremental-reading/irSchedulingHelpers.ts`（`getSequentialActiveBaseIntervalDays` / `computeSacIntervalDays` / `nextSacStagnation` / `isSequentialActiveChapter`）
- 写路径：`irSchedulingMutations.markAsRead`（及 priority 相关）、`irSessionService.performNext` → `markAsRead`
- 测试：`src/srs/incremental-reading/irSequentialActiveCadence.test.ts`

### 推进状态机（检查点）

`advanceSequentialBook` 顺序（**先激活下一章，再清理当前章**，失败可重试）：

1. 校验 plan 存在、`mode=sequential`、且 `activeChapterId === request.chapterId`
2. 找下一个 `pending` 章；若无则进入「全书完成」路径（`nextChapterSchedule` 被忽略）
3. 若有下一章：安全激活为唯一目标 IR Topic（`due` 由显式 `nextChapterSchedule` 决定）  
   - 已完全兼容（`#card` + `ir.due` + 匹配 `ir.sourceBookId`）→ 复用，不重写进度  
   - 同书 partial（`ir.sourceBookId` 已匹配）→ 可补全激活  
   - 属于其他书的 IR，或已有 `#card` 但 **缺少** `ir.sourceBookId` → **显式抛错**，不静默覆盖无关卡  
   - **失败则抛错**：plan 与当前章均未改动，不得 plain-complete，不得整本清理
4. 写 plan — 记录当前 outcome，`outcomes[next]=active`（若有），`activeChapterId=next|null`
5. `completeIRCard(request.chapterId)` **仅**剥离当前章 IR 身份（单 id：`#card` / `srs.*` / `ir.*` / 索引）  
   - **不删除**章节笔记内容；plan 已记 `completed` 后资料库大纲仍保留该章结构节点（见上「资料库展示」）
   - 该章下已创建的 Extract **保留**自身 `ir.sourceTopicId` / `ir.sourceBookId`，继续可调度、可操作
   - 清理失败 → `kind: "partial"`，`currentChapterRemoved: false`（下一章已激活、plan 已指向 next）
6. 若有下一章，从后端校验**完全激活**（`#card` + `ir.due` + `sourceBookId`）；失败 → `partial` 且 `currentChapterRemoved: true`（当前章已清理）

**完全激活（fully active）定义**（**严格** backend `get-block`；读失败抛错，**禁止**用 `orca.state` 冒充已验证）：

- 存在 `#card` 标签，且
- 存在有效 `ir.due`（primitive 或单元素数组；空/多元素数组不算），且
- `ir.sourceBookId` 等于本书 `bookBlockId`（同样规范化单元素数组；经 `parseOptionalNumber`）

**结果标志**（会话 UI 用）：

| 字段 | 含义 |
| --- | --- |
| `currentChapterRemoved` | 当前章 strip 是否成功；`false` 时会话**不得** `removeCurrent()` |
| `planPersisted` | 目标 plan / 检查点是否已写入后端；检查点也失败时为 `false` 且消息同时报告原错误与检查点错误 |

**`retrySequentialActivation` 恢复合同**：

1. 扫描 `selectedChapterIds` 上属于本书的 live / partial IR（不碰 `sourceBookId` 不同的无关卡）
2. 选择 plan 顺序中**最后**一个已有本书 IR 的章作为目标（activate-before-strip 失败时 next 在 current 之后）
3. 将目标补全为 fully active；剥离其他 selected 上本书 IR
4. 写 plan：`activeChapterId=target`，旧 dual-live 章 outcome → `completed`（已是 skipped/removed/completed 则保留）
5. 成功后本书最多一张 fully active sequential 卡；无法安全收敛 → visible `partial` + `lastError`

**不变量（故障相关）**：

- 不得对 `selectedChapterIds` 全集批量 `removeTag` / `deleteProperties`
- 不得从完成本章路径调用 `removeBookFromIR` / `removeChaptersFromIR`
- pending 章默认无真实 IR 卡；不得因推进而破坏其无关标签/属性
- 下一章只有在后端满足 fully active 后才算完整激活；不能只凭 `insertTag` 未抛错或 IR 索引已写入判定成功
- 旧实现「先 strip 再 init」会在 next 初始化失败时留下 **零 IR 卡**——已改为 activate-before-strip
- 若 3 成功而 4 失败：下一章已有 IR；broken plan 会把 `activeChapterId=null`、next 暂记 `pending` 并写 `lastError`；检查点写失败时错误可见且仍可重试，**禁止空 catch**
- 创建 plan 时 `selectedChapterIds` 去重（保序）；`parseBookIRPlan` 亦规范化重复 id

### Plan 读写与缓存

`bookIRPlanRepository`：

- **读**：backend-first `get-block`，避免 `orca.state.blocks` 旧快照；backend 失败时 log 后回退 state
- **写**：`setProperties` / `deleteProperties` 成功后 `invalidateIrBlockCache` + `invalidateBlockCache`
- sequential 写入时维护 `sequentialBookRegistry`（发现索引，非权威真相）

#### 下一章安排策略 `nextChapterSchedule`

类型：`NextChapterSchedule = "today" | "tomorrow"`（定义于 `AdvanceSequentialBookRequest`）。**禁止**隐式全局状态；调用方必须把用户选择显式传入。

| 值 | 下一章 `ir.due` | plan | 今日队列 |
| --- | --- | --- | --- |
| `today`（默认） | 本地今天 00:00 | `outcomes[next]=active`，`activeChapterId=next` | **立即**可作为到期卡进入 IR 队列 |
| `tomorrow` | 本地明天 00:00 | 同上（完成结果与激活语义不变） | 今日**不**当作到期卡；明日起进入队列 |

- 选择 **tomorrow** 只改下一章 due，**不**改变当前章 `completed`/`skipped` 记录，也不改变「下一章成为 active」的计划状态。
- `retrySequentialActivation` 修复路径仍默认 `today`，便于把失败卡住的下一章立刻拉回队列。
- 传给 `invokeEditorCommand` 的 plan / ref / 属性必须是可 structured clone 的纯 JSON（`parseBookIRPlan` 会物化数组与 outcomes；`saveBookIRPlan` 再 plain 克隆）。避免把 `orca.state` 上的 Proxy 直接写入导致 `An object could not be cloned.`。
- Orca 的 type=2 属性经 `get-block` 可能返回单元素数组；EPUB 仓库会在读取边界解包后再严格解析 `epub.manifest`，多元素数组仍视为非法。
- 激活下一章时会继承当前章 `ir.sourceBookTitle`；若为空则从书籍块 alias/text 恢复。资料库 header 也使用书籍块标题兜底，避免显示“书籍 #id”。
- IR 索引 localStorage key 使用 `orca.state.repo` 隔离；切换数据库后不会复用另一库的 block ID。

会话侧：

- `performArchive(blockId, pluginName, { nextChapterSchedule? })`：若为顺序激活章 → progression `completed` + 传入安排策略；否则普通 `completeIRCard` 归档
- `performSkipChapter`：仅顺序书；progression `skipped`（下一章默认 `today`）
- 会话在决定是否进入顺序推进前以后端 `get-block` 读取 `ir.sourceBookId`；状态快照缺失或过期不会再把顺序章误判为普通卡。单元素数组属性会先规范化，歧义/无效值直接暴露错误并保留可重试状态
- UI：`IRSessionShell` 更多菜单
  - **顺序激活章「完成本章」**：`ModalOverlay` 说明当前章将标记完成，并二选一「今天安排下一章」/「明天安排下一章」；**取消/关闭不调用推进、不清理当前章**
  - **普通 IR 卡「归档」**：既有 `ConfirmBox` 确认后 `completeIRCard`
  - **顺序书「跳过本章并继续」**：`ConfirmBox`（与完成结果不同，下一章默认今天）
- 失败时错误必须暴露（`归档失败：${message}`），不得吞错后 plain-complete；检查点失败仍可重试
- 命令：`{plugin}.skipSequentialChapter`（提示在会话内操作）

## 退出语义（移出 IR）

- 移出只清理 `#card`、`srs.*`、`ir.*` 与 IR 索引（经 `completeIRCard` / `stripChapterIR`）
- **不删除**书籍/章节块、正文、图片、引用、`epub.*`
- 身份以 **`bookBlockId` + `ir.bookPlan`** 为准，**不用** `ir.batchId` 当书身份

### 整本移出

入口：

- 书籍页右键「将整本书移出渐进阅读」（需块上已有 `ir.bookPlan`）→ 命令 `{plugin}.removeBookFromIR`
- 资料库筛选来源书后「整本移出来源书」

行为：

1. 目标章：plan 中 `outcomes !== removed` 的 `selectedChapterIds`；无 plan 时回退 epub manifest / `epub.bookId` 扫描
2. `Promise.allSettled` 逐章 `stripChapterIR`
3. 全成功：`clearBookIRPlan`；部分失败：保留 plan，`outcomes` 标记成功章为 `removed`，`lastError` 记录失败，可重试

### 章节批量移出

- 资料库多选批量移出；同源书时走 `removeChaptersFromIR`
- 若移出的包含**顺序模式当前激活章**：`activeChapterId=null`，`sequentialPaused=true`，**不**自动解锁下一章
- 若选中范围内已无剩余 active/pending 且无失败：清除 plan

移出后可从普通笔记/右键重新「创建渐进阅读书籍」，无需重新导入 EPUB。

## 用户入口

| 入口 | 实现 |
| --- | --- |
| EPUB 导入向导第二阶段 | `EpubImportWizard.tsx` → 建书参数 |
| 独立建书对话框 | `IRBookSetupDialog.tsx` + `IRBookDialogMount.tsx` |
| 右键「创建渐进阅读书籍」 | `contextMenuRegistry.tsx` → 章节 refs → `showIRBookDialog` |
| 右键整本移出 | 同上 + `removeBookFromIR` 命令 |
| 会话完成本章 / 跳过 | `IRSessionShell` + `irSessionService` |
| 资料库批量/整本移出 | `useIRWorkspaceLibrary` / bulk bar + removal 服务 |

## 测试

- `src/srs/book-ir/bookIRService.test.ts`（初始化、顺序推进、移出、plan 校验）
- `src/srs/book-ir/bookIRPlanRepository.test.ts`
- `src/srs/book-ir/bookIRRemovalConfirm.test.ts`
- `src/srs/incremental-reading/irSequentialActiveCadence.test.ts`（SAC 公式、停滞、postpone 不静默覆盖、Topic/distributed 回归）

## 相关文件

- `src/srs/book-ir/bookIRService.ts`
- `src/srs/book-ir/bookIRChapterInit.ts`
- `src/srs/book-ir/bookIRProgression.ts`
- `src/srs/book-ir/bookIRPlanRepository.ts`
- `src/srs/book-ir/bookIRPlanTypes.ts`
- `src/srs/book-ir/bookIRRemovalService.ts`
- `src/srs/book-ir/bookIRRemovalConfirm.ts`
- `src/srs/bookIRCreator.ts`（门面 + 章节发现 + due 计算）
- `src/importers/epub/types.ts`（`BookIRPlanV1`、`IR_BOOK_PLAN_PROP`、mutation 类型）
- `src/srs/incremental-reading/irSessionService.ts`（顺序完成/跳过桥接）
- `src/components/incremental-reading/IRSessionShell.tsx`
- `src/components/IRBookSetupDialog.tsx` / `IRBookDialogMount.tsx`
- `src/components/epub-import/EpubImportWizard.tsx`
- `src/srs/registry/contextMenuRegistry.tsx` / `commands.ts`
- `模块文档/渐进阅读.md`
- `模块文档/EPUB导入.md`
