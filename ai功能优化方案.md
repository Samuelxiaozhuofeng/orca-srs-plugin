# AI 功能优化方案

> 状态：planned（仅扫描与规划，尚未实施）
> 扫描日期：2026-08-10
> 复核日期：2026-08-10（逐条对代码核实；AI-004 由 runtime-gate 升级为 confirmed，AI-002/003/006/008/010 范围已收窄，详见各条「复核」段）
> 目标：优先修复会让 AI 结果串位、卡住、误保留或难以恢复的问题，再用少量增量能力提升制卡、阅读与网页总结体验。

## 1. 结论

当前插件的 AI 基础并不薄弱：已经有统一 Chat Completions 客户端、并发与重试、取消、响应大小限制、错误脱敏、请求日志、结构化输出校验、写入回滚，以及多种学习场景。近期不应重写 AI 架构，也不应先接更多供应商。

优化重点应按以下顺序推进：

1. **先修结果安全与状态一致性**：快捷卡预览不能把答案/选项当普通块单独保留；失败后必须可重试；章末小测的迟到回答不能串到下一题。
2. **再修连接、读取和取消体验**：测连不能假成功，异步结果不能串表单，设置损坏不能被默认值掩盖，后台生成必须有可见取消入口。
3. **最后补小而实用的能力**：正式制卡尊重单块局部选区；长网页在相同 12k 预算内覆盖首、中、尾；未配置或鉴权失败时能直达连接设置。

这份方案刻意不包含全量流式化、供应商抽象层、AI Agent、向量库、持久化用量中心等大工程。

## 2. 扫描范围与核实方式

主 Agent 先建立入口和调用链清单，再由 3 个 subagent 并行审查：

- 共享客户端、设置、模型列表、连接测试、日志与 HTTP 安全边界。
- 正式制卡、快捷制卡、快捷交互、提示词库、预览与写入。
- 渐进阅读块解释、Extract Coach、章末小测、网页导入 AI 总结。

重点读取：

- `src/srs/ai/`
- `src/components/AI*.tsx`
- `src/components/incremental-reading/`
- `src/srs/incremental-reading/chapterQuiz*.ts`
- `src/importers/web/webAiSummary.ts`、`src/importers/web/webImport.ts`
- `src/srs/registry/commands.ts`、`src/srs/registry/uiComponents.tsx`
- `模块文档/SRS_AI模块.md`、`渐进阅读.md`、`渐进阅读_章末小测.md`、`网页导入.md`
- `plugin-docs/modules.md`、`plugin-docs/types/orca-api.md`

核实标签：

- **confirmed**：当前代码足以确认。
- **runtime-gate**：静态代码显示高风险，但必须在 Orca 真机先复现。
- **enhancement**：现有行为是明确取舍，不包装成 bug，只作为产品增强。

## 3. 当前 AI 功能地图

| 功能 | 用户入口 | 当前输出/写入 | 已有保护 |
| --- | --- | --- | --- |
| AI 服务连接 | 服务与算法设置、命令/斜杠入口 | `ai.connection` plugin data | 测连、模型列表、错误脱敏 |
| 请求行为 | 设置中的联网、思考强度、最大输出 token | 统一请求体 | 并发 3、有限重试、超时、1 MiB 上限、请求日志 |
| 正式 AI 制卡 | `makeAICard` / `interactiveAICard` | Basic / Cloze / Choice 卡 | 配置、预览编辑、接地校验、批次、pending、回滚 |
| AI 快捷制卡 | 三个快捷卡命令 | 源块下 pending 卡预览 | 保留后激活、丢弃、离场清理 |
| AI 快捷交互 | 编辑器工具栏提示词菜单 | 弹窗结果或块下预览/直写 | 自定义模型、标签、合并、候选选择、取消 |
| 块解释 | IR 块侧 `?` / `Alt+E` | 白话、术语、举例、反驳、追问；按 `+` 才写子块 | 请求取消、写入去重 |
| Extract Coach | Extract 阅读区自动建议 | 会话内虚拟块，不写数据库 | 有界上下文、接地 cloze quote、缓存、隐藏 |
| 章末小测 | Topic/章节末尾 | 小测状态、追问、修复轮、弱项制卡 | 有界收集、共享生成、取消、自动重试、状态持久化 |
| 网页 AI 总结 | 网页导入勾选项 | 页面首子块总结 | fail-soft、部分写入清理、正文导入不回滚 |
| 诊断 | 设置中的“用量与最近请求” | 会话内 50 条、展示 12 条 | purpose、耗时、状态、重试次数、usage（上游有返回时） |

相邻但不归入生成式 AI 主线：Azure TTS 使用独立 Key；Firecrawl 负责网页抓取，只有抓取后的总结使用 AI 客户端。

## 4. 优先级总览

| ID | 优先级 | 类型 | 结果 |
| --- | --- | --- | --- |
| AI-001 | P0 | confirmed | 限制快捷卡预览的选择边界，避免破坏卡结构 |
| AI-002 | P0 | confirmed | 保留失败不得丢任务，终态操作必须互斥且可重试 |
| AI-003 | P0 | confirmed | 隔离章末追问/填空改写请求，禁止迟到结果串题 |
| AI-004 | P0 | confirmed | 快捷交互命令不得 await 会写块的后台任务（嵌套顶层事务） |
| AI-005 | P1 | confirmed | 修复举例/反驳切换后的永久 loading |
| AI-006 | P1 | confirmed | 章末正文少返块时禁止静默生成不完整小测 |
| AI-007 | P1 | confirmed | 章末小测只重试可恢复错误并采用退避 |
| AI-008 | P1 | confirmed | 让连接测试可信，并隔离过期的测连/模型结果 |
| AI-009 | P1 | confirmed | 设置读取/保存失败必须显示真实的部分状态 |
| AI-010 | P1 | confirmed | 给后台 AI 生成提供就地取消与最小恢复入口 |
| AI-011 | P1 | confirmed | 可跳过网页 AI 总结，并暴露清理残留与提示注入边界 |
| AI-012 | P1 | enhancement | 正式制卡尊重单块局部选区，并展示实际发送范围 |
| AI-013 | P1 | enhancement | 长网页总结在原预算内改用首、中、尾采样 |
| AI-014 | P2 | enhancement | 未配置/鉴权失败时直达 AI 连接设置 |

## 5. 任务明细

### AI-001 快捷卡预览只能按“卡”保留

- **依据**：快捷卡先写为 pending（`src/srs/ai/aiQuickCardFlow.ts:292`）；所有 ready job 都挂载任意子孙选择（`src/components/AIBlockLoadingMount.tsx:306`、`:448`）；“保留所选”走文本结果的通用移动/删除（`src/srs/ai/aiQuickInteractJobs.ts:443`），只有卡片专用保留才激活（`src/srs/ai/aiQuickCardJob.ts:76`）。
- **风险**：用户可单独保留 Basic 答案或 Choice 选项为普通块；也可能留下仍为 pending 的整卡。
- **实施意图**：第一版对 `kind="card"` 隐藏通用子孙选择，只保留“保留全部/丢弃”。不要在本任务中设计复杂的逐卡选择协议。
- **涉及文件**：`src/components/AIBlockLoadingMount.tsx`、`src/srs/ai/aiQuickInteractJobs.ts`、相邻测试。
- **验收**：卡片预览不出现答案/选项的“选择”；保留完整卡后全部激活，丢弃后包装树删除；文本快捷交互的候选选择不受影响。
- **验证**：新增 card-kind DOM/state 回归；Orca 真机检查 Basic、Cloze、Choice 与复习队列。

### AI-002 快捷卡保留失败可重试，终态操作互斥

- **依据**：`keepQuickCardJob` 返回 `{success:false,error}`（`src/srs/ai/aiQuickCardJob.ts:41-101`），但调用方**完全丢弃返回值**并无条件 `removeJob`（`src/srs/ai/aiQuickInteractJobs.ts:381-386`）；文档承诺移动失败可重试。保留/取消按钮均 fire-and-forget 且没有 committing 状态（`src/components/AIBlockLoadingMount.tsx:413-432`）。
- **复核补充（比原描述更严重）**：失败时不仅任务被误删，**用户看不到任何提示**——界面表现为“点了保留，预览消失，卡片仍是 pending 留在包装块里”。因此可见提示是硬性验收项，不是可选项。
- **实施意图**：仅成功后移除 job；失败时保留 ready/error、预览根与错误信息，并 `orca.notify("error", …)` 明示失败原因与“可重试”。增加 per-job 终态锁，避免双击或“保留+取消”竞态。
- **涉及文件**：`src/srs/ai/aiQuickInteractJobs.ts`、`src/srs/ai/aiQuickCardJob.ts`、`src/components/AIBlockLoadingMount.tsx`。
- **验收**：`moveBlocks` 失败后仍可第二次保留；失败必须弹出可见错误提示；并发 keep/dismiss 只执行第一个；失败后按钮恢复可用。
- **验证**：扩展 `src/srs/ai/aiQuickInteractJobs.test.ts`；真机快速双击与故障恢复。

### AI-003 章末追问与填空改写绑定当前题

- **依据**：追问（`useChapterQuizController.ts:983-1023`）与填空改写（`:879-910`）都没有 AbortController / request token，请求发出后不带 signal；换题只清本地状态（`:170-179`）。
- **复核收窄（避免改到已正确的代码）**：填空改写的**最终写入已经有题号校验**——`handleConfirmClozeFor` 会比对 `clozePreview.questionId !== target.id` 并直接返回，这段不要重写。真正泄漏到新题的是：`setClozePreview` / `setLocalError` / `clozeBusy` 三个中间状态，以及追问结果被 `setFollowUps` 追加进新题的对话。修复只针对这些中间状态与缺失的取消。
- **实施意图**：追问、填空改写分别使用 Abort + request token；切题、进入修复轮、关闭/卸载时取消；所有 `setState` 落地前核对 questionId（含 loading/error 复位，不只是最终写入）。
- **涉及文件**：`src/components/incremental-reading/useChapterQuizController.ts`、必要的展示状态。
- **验收**：挂起上一题请求后切题，即使旧 Promise 晚返回也不得修改新题；取消文案不覆盖新题正常状态。
- **验证**：新增 `src/components/incremental-reading/useChapterQuizController.test.ts`；Orca 真机在生成中连续“下一题”。

### AI-004 快捷交互命令不得 await 会写块的后台任务

- **类型**：confirmed（复核前误判为 runtime-gate）。
- **依据**：
  - 工具栏提示词菜单是通过 `invokeEditorCommand` 触发的（`src/srs/registry/uiComponents.tsx:136`、`:157`），并非“从 React 组件直接发起”。
  - 该 editor command 会 `await startAIQuickInteractFlow`（`src/srs/registry/commands.ts:403-429`）。
  - 当提示词带 `directWriteBelow` 或 `insertBelowOnComplete` 时，流程会 `await startBackgroundQuickInsertJob`（`src/srs/ai/aiQuickInteract.ts:143-159`），其写入使用顶层事务（`src/srs/ai/aiQuickResultBlocks.ts:396`、`:509`、`:545`、`:577`、`:806`，均为 `topGroup: true`）。
  - 同仓库的快捷卡已用 fire-and-forget 规避同一结构，并在注释中写明症状为“AI 已返回但任务永远停在 generating”（`src/srs/registry/commands.ts:509-525`）。**该注释中“文本类快捷交互从 React 工具栏发起”的免责说明已过期**，必须一并更正。
- **未被大面积暴露的原因**：仅 preview/direct 两类提示词进入 await 写入路径；纯弹窗提示词只打开 UI 后立即返回，不受影响。
- **实施意图**：注册层不等待会写块的后台任务（与快捷卡一致的 fire-and-forget + `.catch` 记录）；错误继续由 job 状态与 toast 可见。同时修正 `commands.ts:509-525` 的过期注释。
- **涉及文件**：`src/srs/registry/commands.ts`。
- **验收**：命令立即返回；direct 与 preview 提示词均能完成写入/预览；撤销边界不被破坏；不再出现 generating 不结束。
- **验证**：Orca 真机分别跑一次 direct 与 preview 提示词（仍需真机确认，但不再作为整批闸门——修复本身是单点改动）。

### AI-005 块解释侧向请求状态隔离

- **依据**：举例和反驳共用 AbortController；启动新模式取消旧模式，但旧模式的 loading 没有复位（`src/components/incremental-reading/useIRBlockExplain.ts:327-370`）。跨块 Range 还可能被当作单块 focus（`:100-110`）。
- **实施意图**：每种侧向请求独立 controller/request id，或取消时显式复位旧状态；同时只接受同块 focus，跨块选区给可见提示。
- **涉及文件**：`src/components/incremental-reading/useIRBlockExplain.ts`、`src/components/incremental-reading/IRBlockExplainInline.tsx`。
- **验收**：举例→反驳及反向快速切换后，两侧都能退出 loading；跨块选区不再只取第一块解释。
- **验证**：新增 `src/components/incremental-reading/useIRBlockExplain.test.ts`；真机快速切换和跨块选区。

### AI-006 章末正文收集必须完整或明确失败

- **依据**：`get-blocks` 少返请求 ID 时，收集循环直接 `continue`，最后仍可调用 AI（`src/srs/incremental-reading/chapterQuiz.ts:426-455`、`:507-559`）。
- **复核收窄**：`getBlocksBatched` 对**整批抛错**已有逐块 `resolveBlockBackendFirst` 兜底（`:436-453`），不需要重写读取逻辑。缺口只有一种：请求未抛错但返回数组短少。修复应是在既有 batch 之后比对 requested/returned，对差集复用现成的逐块兜底，仍缺才报错。
- **实施意图**：计算 requested-minus-returned；对少返项复用既有有界逐块补读，仍缺失则返回可见的上下文不完整错误，不静默生成。
- **涉及文件**：`src/srs/incremental-reading/chapterQuiz.ts`、小测错误展示。
- **验收**：批读少返一个正文子块时不调用 AI；错误含缺失数量（调试信息可含有界 ID 列表）；重试后可继续。
- **验证**：扩展 `src/srs/incremental-reading/chapterQuiz.test.ts`。不在真实笔记库故意制造残缺数据。

### AI-007 章末生成只重试可恢复错误

- **依据**：生成关闭统一传输重试，外层除 `CANCELLED`/`NO_API_KEY` 外对所有错误最多立即尝试 4 次（`src/srs/incremental-reading/chapterQuiz.ts:1878-1886`、`:1948-1963`）。
- **实施意图**：鉴权、参数、确定性客户端错误立即失败；格式/解析问题允许有限修复重试；429/5xx 使用统一 retryable 判定与可中断退避，避免双层重试。
- **涉及文件**：`src/srs/incremental-reading/chapterQuiz.ts`、`src/srs/ai/aiChatPolicy.ts`（只复用，不另造规则）。
- **验收**：401/400/TIMEOUT 只请求一次；PARSE_ERROR 按预算重试；429/5xx 有退避且取消可打断。
- **验证**：扩展 `chapterQuiz.prefs.test.ts` 的 retry describe；真机只抽查请求日志，不人为触发计费重试。

### AI-008 连接测试可信且异步结果不过期串入

- **依据**：测连使用 `allowEmptyContent: true`（`src/srs/ai/aiConfigValidator.ts:254-269`），而客户端在该开关下对 `choices` 缺失/为空不作校验，直接返回 `success: true, content: ""`（`src/srs/ai/aiChatClient.ts:275-337`）——2xx `{}` 会被报成“连接成功”。
- **复核收窄**：**模型列表拉取与 TTS 试听已经有 AbortController，且关窗时会取消**（`src/components/AIServiceSettingsMount.tsx:72-73`、`:326-327`），不要重做。缺失的只有连接测试：`handleTestAI`（`:219-241`）无 controller、无配置指纹，迟到结果会无条件写进 `statusMessage`/`serviceSettingsError`。
- **实施意图**：测连要求合法 response envelope；是否允许“存在 message 但 content 为空”由兼容测试明确。仅为 `handleTestAI` 增加 AbortController + 配置 fingerprint，编辑配置、关闭、重开时取消或丢弃旧结果并清瞬态文案。
- **涉及文件**：`src/srs/ai/aiConfigValidator.ts`、`src/srs/ai/aiChatClient.ts`、`src/components/AIServiceSettingsMount.tsx`、`src/components/AIServiceSettingsDialog.tsx`。
- **验收**：`{}`、`choices:[]` 不得成功；测试 A 后改为 B，A 的迟到结果不得覆盖 B；关闭重开不显示旧成功/错误。
- **验证**：扩展客户端/设置组件测试；真机验证慢网关与关闭重开。

### AI-009 设置损坏与部分提交保持可见

- **依据**：`ai.connection` JSON 解析或 `getData` 失败只写 Console，然后回退旧 settings/默认值（`src/srs/ai/aiSettingsSchema.ts:197-244`）。整包设置顺序保存多个分区，中途失败时前面已落盘但 UI 只显示笼统失败（`src/components/AIServiceSettingsMount.tsx:112-175`）。
- **实施意图**：区分“从未配置”与“读取/解析失败”；失败时保留可用缓存但显示阻断 warning，未经确认不得用默认值覆盖。保存前预校验，提交时记录已保存/未保存分区并允许幂等重试，不伪造跨 key 事务。
- **涉及文件**：`src/srs/ai/aiSettingsSchema.ts`、`src/srs/ai/aiServiceSettingsState.ts`、`src/components/AIServiceSettingsMount.tsx`。
- **验收**：畸形 JSON、`getData` reject 不显示为正常默认配置且不静默 setData；第 N 个保存失败时精确显示完成与失败分区。
- **验证**：schema/state/mount mock 测试；真机确认 warning 和重试文案。

### AI-010 后台生成提供就地取消

- **依据**：已有 `cancelBackgroundQuickJob`（`src/srs/ai/aiQuickInteractJobs.ts:356-370`），但源块 loading 只是不可点击图标（`src/components/AIBlockLoadingMount.tsx:250-303`）。
- **复核订正**：`AIQuickJobsPanel` **确实被挂载**（`src/components/AIQuickInteractMount.tsx:234`），只是组件体被改成 `return null`（`src/components/AIQuickJobsPanel.tsx:24-26`），文件里仍保留 `cancel/promote/dismiss/acknowledge` 等已无用的 import 与 helper。效果等同“不渲染”，但属于死代码，本任务须一并处置。
- **实施意图**：先把行尾 loading 改成明确的取消控件，取消当前源块对应任务并保持状态一致。同时**删除 `AIQuickJobsPanel` 空壳及其挂载点与死 import**（若决定保留面板则必须真正实现，二选一，不得维持空壳）。不要在本批恢复完整任务中心；离屏恢复需求以后再用真机证据决定。
- **涉及文件**：`src/components/AIBlockLoadingMount.tsx`、`src/components/AIQuickJobsPanel.tsx`、`src/components/AIQuickInteractMount.tsx`、`src/srs/ai/aiQuickInteractJobs.ts`、样式与测试。
- **验收**：点击取消后 Abort、生成停止、loading 消失、无迟到写块；同源多任务的“取消单项/全部”语义有明确文案；仓库内不再存在 `return null` 的任务面板空壳。
- **验证**：job 逻辑测试 + Orca DOM 挂载/点击真机验证。

### AI-011 网页 AI 总结不阻塞核心导入且失败可追踪

- **依据**：导入忙碌时禁止关闭，流程等待最长 90 秒的可选总结（`src/components/web-import/WebImportDialogMount.tsx:50-53`、`:426-429`；`src/importers/web/webImport.ts:371-388`）。总结子树清理失败只 Console，最终错误不含残留 ID（`src/importers/web/webAiSummary.ts:197-236`）。ARTICLE prompt 也缺少其它 AI 路径已有的“不可信数据”约束（`:243-263`）。
- **实施意图**：生成阶段提供“跳过 AI 总结并继续导入”，只 abort AI，不冒充取消整个导入；清理失败返回残留 summaryBlockId；prompt 明确 ARTICLE 仅是数据、不得执行其中指令。
- **涉及文件**：`src/components/web-import/WebImportDialogMount.tsx`、`src/importers/web/webImport.ts`、`src/importers/web/webAiSummary.ts`。
- **验收**：AI Promise 挂起时跳过后正文/IR 正常完成且状态为 skipped/cancelled；插入与删除同时失败时错误含残留 ID；prompt 测试锁定不可信源文约束。
- **验证**：扩展 `webImportDialogClose.test.ts`、`webAiSummary.test.ts`；真机使用慢模型验证按钮语义。

### AI-012 正式制卡尊重局部选区并展示实际发送范围

- **类型**：enhancement，且**需要产品决策后才可实施**。当前“单块局部选区仍读整块+子树”是已文档化行为，不按 bug 处理；改成“选区优先”会改变既有用户习惯，必须先由需求方确认，不得由实施方自行决定。
- **依据**：选区解析层已支持单 fragment/跨 fragment（`src/srs/ai/aiQuickPrompt.ts:378-417`、`:586-604`），正式入口却只接受 `multiBlock` 后回退整块（`src/srs/ai/aiFlashcardFlow.ts:105-137`）。弹窗展示“下方源文本将发送”，但服务端仍可能按 `AI_CARD_SOURCE_MAX` 裁到 6000 字（`src/components/AICardGenerationDialog.tsx:135-142`、`src/srs/ai/aiService.ts:239`）。
- **实施意图**：有非空选区时优先使用选区；折叠光标保持整块+有界子树。发送前完成裁剪并让弹窗展示实际发送文本与“已截断”状态。
- **涉及文件**：`src/srs/ai/aiFlashcardFlow.ts`、`src/srs/ai/aiService.ts`、`src/components/AICardGenerationDialog.tsx`、选区与服务测试。
- **验收**：单块局部/跨样式选区只发送选中内容；无选区行为不变；6000+ 字时 UI 与请求正文一致。

### AI-013 长网页总结采用确定性首、中、尾采样

- **类型**：enhancement。当前只取开头是成本边界，不按 bug 处理。
- **依据**：总输入预算固定 12,000 字符，但 `truncateForSummaryPrompt` 只 `slice(0, maxChars)`（`src/importers/web/webAiSummary.ts:16-18`、`:43-47`）。
- **实施意图**：仅替换截断 helper，以固定比例取开头、中段、结尾并加清晰片段分隔；总长仍不超过 12k，仍为一次请求，不做 map-reduce。
- **涉及文件**：`src/importers/web/webAiSummary.ts`、`src/importers/web/webAiSummary.test.ts`。
- **验收**：短文完全不变；长文首、中、尾均可见、结果确定、总预算不超限；模型被明确告知片段不连续。

### AI-014 配置错误可直达连接设置

- **类型**：enhancement。
- **依据**：正式制卡、Quick AI、快捷卡等未配置时只 toast 后返回（`src/srs/ai/aiFlashcardFlow.ts:98-100`、`src/srs/ai/aiQuickInteract.ts:99-101`、`src/srs/ai/aiQuickCardFlow.ts:178-182`）；连接面板已有稳定打开函数。
- **实施意图**：无 Key 的入口前置失败可直接打开“连接”页；已经进入生成 UI 后遇 401/403，则显示“打开连接设置”动作，不自动抢占当前弹窗。
- **涉及文件**：各 AI 入口、错误 UI、`src/srs/ai/aiServiceSettingsState.ts`。
- **验收**：无配置一步到连接页；401/403 保留错误信息并可显式切换设置；其他错误不跳设置。
- **验证**：入口单测；Orca 真机确认弹窗互斥和 notification action 能力。

## 6. 分批实施

### 当前批次：结果安全（AI-001～AI-004）

顺序：

1. 实施 AI-004（单点改动：命令不再 await 后台写块任务 + 更正过期注释）。
2. 实施 AI-002，保证保留失败可见、可重试并阻止终态竞态。
3. 实施 AI-001，封住快捷卡错误选择路径。
4. 实施 AI-003，阻止章末辅助请求串题。

> 顺序说明：AI-002 与 AI-001 都改 `aiQuickInteractJobs.ts` + `AIBlockLoadingMount.tsx`，先做状态层（002）再做 UI 门禁（001），避免两次改动互相覆盖。

检查点：Quick Card 三卡型预览/保留/丢弃、章末切题、快捷交互 preview/direct 均通过自动化；再做一次 Orca 真机冒烟，才能进入下一批。

文档收尾（本批必须完成，属仓库契约）：更新 `模块文档/SRS_AI模块.md`、`模块文档/渐进阅读_章末小测.md` 中被改动的行为描述，并把本轮问题记入 `模块文档/问题经验.md`；若条目状态变化，同步 `模块文档/README.md`。

### 第二批：可靠性与恢复（AI-005～AI-011）

先处理阅读状态与正文完整性，再处理连接/设置，最后补后台取消与网页导入恢复。每项独立提交、独立验收，不把 7 项合成一次大改。

检查点：错误必须可见、失败状态可重试、取消后无迟到写入；设置和网页导入的故障注入测试通过。

文档收尾：同批更新 `模块文档/SRS_AI模块.md`、`模块文档/渐进阅读.md`、`模块文档/渐进阅读_章末小测.md`、`模块文档/网页导入.md` 与 `模块文档/问题经验.md`。

### 第三批：小幅能力增强（AI-012～AI-014）

这批不改变数据模型：统一选区语义、改善长文采样、缩短配置恢复路径。若前两批真机仍有 blocker，第三批暂停。

前置：AI-012 属行为变更，必须先拿到需求方对“单块内选中一段文字后制卡应只用选区还是仍用整块”的明确答复，未确认前不得开工；AI-013、AI-014 不受此阻塞。

## 7. 验证方案

### 自动化

扫描期间已有基线：

- `npx vitest run src/srs/ai/aiQuickInteractJobs.test.ts src/srs/ai/aiQuickCardFlow.test.ts src/srs/ai/aiService.test.ts`：47 项通过。
- 共享客户端/HTTP 的 8 个聚焦测试文件共 90 项通过。

实施时最窄新增/扩展位置：

- `src/srs/ai/aiQuickInteractJobs.test.ts`
- `src/components/incremental-reading/useChapterQuizController.test.ts`（新增）
- `src/components/incremental-reading/useIRBlockExplain.test.ts`（新增）
- `src/srs/incremental-reading/chapterQuiz.test.ts`
- `src/srs/incremental-reading/chapterQuiz.prefs.test.ts`
- `src/components/web-import/webImportDialogClose.test.ts`
- `src/importers/web/webAiSummary.test.ts`
- `src/srs/ai/aiChatClient.test.ts`、`aiConfigValidator.test.ts`、设置 state/schema 测试

每个代码批次完成后运行对应聚焦测试、`npx tsc --noEmit`，最后按仓库契约运行 `npm run build`。涉及共享客户端或设置契约时，再运行 `npm test`。

### Orca 真机冒烟

1. Quick Basic/Cloze/Choice 各生成一次，确认答案/选项不可被单独保留，保留后进入复习队列。
2. 快速双击「保留」与「保留+取消」并发，确认只执行第一个、不产生重复移动/删除。（“保留失败后可重试且有可见提示”在 Orca 内无法可靠制造故障，改由 `aiQuickInteractJobs.test.ts` 单测覆盖，不列入真机项。）
3. 章末小测追问中立刻切下一题，再对填空改写重复一次；旧结果不得回灌。
4. 块解释先点“举例”再立即点“反驳”，两侧都能恢复；跨块 focus 不被误当单块解释。
5. 用慢网关测试连接后编辑 URL/模型并关闭重开，旧结果不串入新表单。
6. 后台 Quick AI 生成中点击行尾取消，确认请求停止且无迟到写块。
7. 网页导入勾选 AI 总结，生成中点“跳过总结”，正文与 IR 仍完成。
8. 长网页总结确认内容覆盖开头、中段与结尾，首子块版式仍符合现有规范。

自动化不得替代上述宿主交互验证；尤其是 editor command 事务、DOM 挂载、弹窗互斥和复习队列激活。

## 8. 明确暂缓

- **Extract Coach 一键转卡**：当前契约明确只读，只有 cloze quote 做了接地；直接加按钮会牵涉预览、撤销、去重、焦点和多卡型写入，超出“小改”边界。
- **全量流式输出**：结构化制卡/小测需要完整 JSON；先不为了局部打字机效果改写统一客户端。
- **完整后台任务中心**：先交付就地取消；只有真机证明离屏任务经常不可恢复时，再恢复最小任务面板。
- **持久化请求日志/费用中心**：现有会话内 50 条已经覆盖主要排障；先修准确性和错误恢复。
- **多请求 map-reduce 网页总结**：AI-013 保持单请求与 12k 成本上限。
- **切换到 `orca.ai` 或新供应商抽象层**：本地文档证明宿主 API 存在，但当前插件的 Key/URL/模型、重试、日志和联网策略均围绕兼容端点；没有真机兼容证据前不迁移。

## 9. 后续低优先级观察项

以下问题静态成立，但不进入前三批：

- 失败响应已有 usage 时仍未计入汇总，token 总量会低报。
- semaphore 在 Retry-After 退避期间仍占槽，日志也不含排队耗时。
- SSE/NDJSON 兼容只适合单帧 message，标准多帧 delta 可能被误报为空响应。
- 用户指南仍有“仅当前块、仅 Basic/Cloze、1/3/5 张”等过时表述；实施 AI-012 后统一更新 `模块文档/AI智能制卡使用指南.md`、`SRS_AI模块.md` 与 `模块文档/README.md`。

这些项只有在请求日志或真实网关复现证明用户影响后再升级，避免为了理论完整性扩大改动。
