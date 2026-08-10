# SRS AI 模块

> 文档同步日期：2026-08-10
> 近期变更：
> 1. **IR 摘录/主题可作 AI 源文（2026-08-10）**：`isExcludedAiSourceBlock` 不再一律排除所有 `#card`；仅排除纯 SRS 闪卡与 `srs.ai.quickResult` 预览根。`type=topic` / `type=extracts` 及 keep_extract 后仍带 `ir.due` 的 hybrid **允许**作为快捷制卡 / 选区源文（摘录阅读界面光标停在摘录正文即可制卡）。
> 2. **多块 / 跨样式 / 子树源文**：同块跨 fragment、同父连续兄弟跨块、父子跨块（P+子块）与跨分支——统一按 **DFS 前序连续区间** 解析；整段范围展开有界子树（深度 8 / 80 块、缩进、排除**纯** #card 与 AI 结果预览）；结果锚点为阅读方向末块（祖先↔后代跨度挂祖先 P）；`QUICK_SELECTION_MAX=12000`。
> 3. （历史）传输层统一、制卡弹窗 v2、选择题卡、队列 `batchId` + `pending` 等见既有实现。
>
> **能力边界**：跨块按 anchor↔focus 在同一棵树内的 **DFS 前序连续区间** 解析（兄弟链 / 父子链 / 跨分支），不读取「跳选」块 ID 集合；行内端点切片不含端点子树；不同根 / 孤立块 / 块缺失 → 可见报错；真机选区表现仍以宿主为准。
>
> **已搁置（分支 `ai-6-scope`，未合并）**：制卡弹窗「有界子树源范围」UI 选项、保存后清空原文、术语独立块 + 行内引用（与当前选区/整块默认展开子树不是同一项）。

## 概述

AI 模块提供基于 **OpenAI 兼容 Chat Completions** 的能力。产品路径：

| 路径 | 入口 | 行为 |
| --- | --- | --- |
| **AI 生成闪卡** | `${pluginName}.makeAICard`（别名 `interactiveAICard`） | 跨块选区用拼接文本，否则读当前光标块全文 → 弹窗配置 → AI 请求 → 校验/预览/编辑/勾选 → 确认后分组写入（锚点为末块或当前块；祖先↔后代跨块挂祖先 P） |
| **块解释** | 渐进阅读会话：移到块右侧隐形热区出「?」或 `Alt+E` | 读目标块 → 白话/名词内联；可选举例/反驳/追问；用户点「+」才写入普通子块 |
| **AI 快捷交互** | 编辑器工具栏 sparkles 按钮 | 选中文本（同 fragment / 同块跨样式 / 同树任意跨块，含父子链）→ 选提示词；结果挂在**选区末块**下（祖先↔后代跨块挂祖先 P）；见下「快捷交互」 |
| **AI 快捷制卡** | `quickBasicCard` / `quickClozeCard` / `quickChoiceCard`（斜杠「快捷问答卡 / 快捷填空卡 / 快捷选择题」） | 选中文本（或整块；支持跨块，含父子链）→ 直接生成 → 以**待激活卡片**插到**末块**下方预览（祖先↔后代跨块挂祖先 P）→ 保留 / 丢弃 |

可见斜杠命令仅 **`${pluginName}.aiCard`（AI 生成闪卡）**。块解释无独立斜杠命令。

### 核心价值

- 源文：当前选区或块全文，必要时含**有界子树**（见下表）；backend-first `get-block` 校验块存在（抛错时 warn 后回退 state）
- 单次请求 + 确定性本地校验
- 写入前可编辑/取消勾选；关闭不写库
- 成功写入：`invokeGroup({ undoable: true, topGroup: true })`
- 失败：尽力回滚（非 undoable 删除 + 子节点差分 + 校验残留 ID），**不承诺无条件删除**

## 技术实现

### 模块结构

```text
src/srs/ai/
├── aiChatClient.ts          # 【唯一出口】callChatCompletions：并发闸门 + 重试 + 日志
├── aiChatPolicy.ts          # Semaphore / 重试判定 / Retry-After / 可中断退避
├── aiRequestLog.ts          # 会话内环形缓冲（50 条）+ usage 累计
├── aiSettingsSchema.ts      # apiKey / apiUrl / model / enableNativeWebSearch / reasoningEffort / webSearchToolType
├── aiChatRequest.ts         # buildChatCompletionsBody（tools / reasoning_effort）
├── aiService.ts             # generateFlashcardDrafts
├── aiBlockExplain.ts        # 解释 / 举例 / 反驳 / 追问
├── aiBlockExplainWrite.ts   # 普通子块写入 + 正文去重
├── aiConfigValidator.ts     # validateAIConfig、testAIConfigWithDetails（超时）
├── aiDraftTypes.ts
├── aiDraftParseValidate.ts  # JSON + 接地校验；本地 draft id
├── aiCardWriter.ts          # 分组写入 + 尽力回滚
├── aiRequestToken.ts        # 生成请求 token 守卫
├── aiHttpErrors.ts          # HTTP 错误正文限字节 + 脱敏
├── aiDialogState.ts
├── aiFlashcardFlow.ts       # readBlockText + 制卡入口
├── aiToolbarPromptStore.ts  # 工具栏提示词库（独立存储键）
├── aiQuickInteract.ts       # Quick AI 稳定入口（re-export；外部一律从这里导入）
├── aiQuickPrompt.ts         # Quick AI：选区提取 / prompt 组装 / 纯文本请求
├── aiQuickResultBlocks.ts   # Quick AI：结果块状态机 + 串行锁（插入 after|lastChild、打标/合并/候选选择）
├── aiQuickInteractJobs.ts   # 后台插入任务队列
├── aiQuickInteractState.ts  # 弹窗态
└── aiPromptManagerState.ts  # 提示词库面板态
src/srs/http/
├── safeResponse.ts          # Content-Length 预检 + 流式字节上限
└── redactSecrets.ts         # exact key / Bearer / 常见认证字段

src/srs/
├── cardBatch.ts             # srs.batchId 读写与生成

src/components/
├── AIRequestLogSection.tsx  # 设置面板「用量与最近请求」
├── AIDialogMount.tsx
├── AICardGenerationDialog.tsx
├── AICardDraftCard.tsx
├── AIQuickInteractMount.tsx # 弹窗 + 后台任务面板挂载
├── AIQuickInteractDialog.tsx
├── AIQuickJobsPanel.tsx     # 非模态面板（当前可空挂；主操作已内联到结果块）
├── AIBlockLoadingMount.tsx  # 源块行尾 loading + 结果根块罩层/保留取消
├── AIPromptManagerMount.tsx
├── AIPromptManagerDialog.tsx
└── incremental-reading/
    ├── IRBlockExplainController.tsx
    ├── IRBlockExplainInline.tsx
    └── useIRBlockExplain.ts
```

### 选区源文本（`aiQuickPrompt.resolveSelectedTextFromCursor`）

所有依赖「当前选区」的 AI 入口共用同一解析层（快捷交互 / 快捷制卡 / 生成闪卡的跨块分支）：

| 形态 | 行为 |
| --- | --- |
| 同 fragment 部分选区 | 取子串；`blockId` = 该块；可附带 `includeBlockContext` |
| 同块跨 fragment（跨粗体/链接等样式） | 拼接各 fragment 切片；`blockId` = 该块 |
| 同树任意跨块（行内拖选） | **DFS 前序连续区间**（`resolvePreOrderChain`：兄弟链 / 父子链 P+子块 / 跨分支统一）；首/末块按 offset 切片（**不含**端点子树）；中间块全文 + **有界子树**；块间 `\n`；`blockId` = **阅读方向末块**（祖先↔后代跨度挂祖先 P）；**关闭**块上下文 |
| 块级 / 整段范围 | `isInline===false` 或两端块首 `(0,0)`：前序区间内各块 **全文 + 有界子树**（2 空格缩进表示层级）；祖先块先展开子树，子块经共享 `visited` 去重不重复 |
| 子树规则 | `collectBoundedSubtreePlainText` + **共享** `SubtreeCollectBudget`：深度 ≤8、**展开子树合计** ≤80 块；行内跨块的首/末切片不计入该 80（最多 +2 端点片段）；跳过**纯 SRS** `#card`（`resolveIRCardType == null`）与 `srs.ai.quickResult`；**不跳过** IR Topic/Extract/hybrid（`ir.due`）；子 id 不在 state → 结构截断；只读 `state.blocks` |
| TTS | `expandSubtree: false`，不展开子孙，避免朗读大纲树 |
| 单块无选区（制卡）/ 生成闪卡单块 | 锚点块全文 + 同上有界子树 |
| 超限 | `QUICK_SELECTION_MAX = 12000` 或子树触顶 → `truncated` + toast；正文不写 marker |
| 不支持 | 不同根 / 孤立块 / 祖先缺失（无法连通为前序区间）→ 可见 warn；跨块任意失败（含 empty）**不**退回锚点全文 |

- 快捷交互：无有效选区仍报错（不退回整块）
- 快捷制卡：无选区时退回**锚点块**全文（光标停在块上即可）
- AI 生成闪卡：仅**跨块**时用拼接选区；单块（含部分选区）仍用该块全文

### 快捷交互（工具栏）

- **提示词项字段**（持久化：`orca.plugins.setData` 键 `ai.promptLibrary`，**不**走 `setSettings`，以免冲掉 apiKey/apiUrl）：
  - `includeBlockContext`：是否附带整块正文作 context（旧数据缺省 `true`）
  - `insertBelowOnComplete`：后台生成 · **预览后确认**（旧数据缺省 `false` 保持弹窗）
  - `directWriteBelow`：后台生成 · **直接写入块下方**为正式内容，无需预览确认（旧数据缺省 `false`）。与 `insertBelowOnComplete` **互斥**；normalize 时二者皆 true 以直接写入为准（关掉预览）
  - `resultTags`：`string[]`，结果根自动打的 Orca 标签 alias（无 `#`）；空数组 = 不打标。表单逗号/空格分隔；`parseResultTagsInput` 去 `#`、去空、大小写不敏感去重。旧数据缺省 `[]`
  - `reuseSameResultBlock`：同一**源块**内多次使用本提示词时，结果追加到已有 `srs.ai.quickResult` + 匹配 `srs.ai.promptLabel` 的结果根下（取最后一个匹配）。旧数据缺省 `false`
  - `model`：可选专用模型 id；空字符串 = 用「AI 服务设置」全局 `model`（旧数据缺省 `""`）
  - 兼容：hydrate 时若 data 无数据，只读迁移 settings 中的 `ai.promptLibrary` / `ai.toolbarPrompts` → setData
- **默认三项**（库从未写入时）：举例说明 / 翻译 / 进一步解释；默认 `insertBelowOnComplete: true`、`directWriteBelow: false`、`resultTags: []`、`reuseSameResultBlock: false`、`model: ""`
- **按提示词选模型**：新增/编辑表单用**下拉**选择 model（选项 = 服务设置同一 Key/URL 的 `/models` 列表 +「默认」项）；与服务设置共享内存缓存 `aiModelsCache`；可「刷新模型」。后台/弹窗路径传入 `runToolbarAIPrompt({ model })`，仅覆盖请求体 `model`
- **提示词库编辑 UI**：表单用组件本地 state + 键盘事件 stopPropagation，避免宿主编辑器抢键导致无法输入。后台落盘两项文案区分：
  - 「后台生成 · 预览后确认」：预览写入，需再选保留/关闭
  - 「后台生成 · 直接写入块下方」：直接 `kept` 落盘，适合查词释义等无需确认场景
  - 「结果标签（可选）」：留空不打标
  - 「同一源块合并到同一结果块」：多次查词挂到同一 `AI · 提示名` 下
  - 列表徽章：`预览插入` / `直接写入` / `弹窗`；可选 `合并写入`、`#标签`
  - 表单布局：`.ai-prompt-manager__form` + `__form-scroll` 字段区滚动、底栏 `footer` 固定，避免选项增多后「取消/保存」被 `max-height:80vh; overflow:hidden` 裁掉
- **合并写入结构**（`reuseSameResultBlock`）：
  - 根标题：`AI · **提示名**`（不含选区）
  - 每次结果：根下新增粗体条目标题（选区文本，超长截断）→ 正文挂在该条目下
  - 查找：`findReusableQuickResultRoot` 扫源块 `lastChild` 子树（或 `after` 同级后方）中带 `srs.ai.quickResult` 且 `srs.ai.promptLabel` 相等的块
  - **复用成功时**：
    1. 将结果根 `srs.ai.status` 提升为 `kept`（若仍是 preview）
    2. `detachJobsForResultRoot` 卸掉仍指向该根的旧 preview job（**不** `deleteBlocks`）
    3. 当前 job 立即结束、不进预览态  
    防止「第一次 preview 未点保留 → 第二次合并追加 → 取消/离场旧 job 把整棵含历史删掉」
  - **串行**：同一 `sourceBlockId + promptLabel` 的合并插入经 `runSerializedReuseInsert` 排队，降低连点并发各建一棵根的概率
- **标签写入**：`core.editor.insertTag(null, rootId, alias)`；已有同名 tag ref（type=2）则跳过；失败抛错、插入失败可见（不静默）
- **后台路径**（`directWriteBelow` 或 `insertBelowOnComplete`；`startBackgroundQuickInsertJob({ commitMode, tags, reuseSameResultBlock })`）：
  1. 选中文本 → 点菜单项 → 立即 `runToolbarAIPrompt`（不弹窗）；成功路径不 toast
  2. 生成中：`AIBlockLoadingMount` 在源块 `.orca-repr-main-content` 行尾挂 `srs-ai-target-block-loading` sparkles
  3. **直接写入**（`commitMode: "direct"`）或 **合并复用成功**（`insert.reused`）：写入后**立即结束 job**（无预览罩层）
  4. **预览写入**（`commitMode: "preview"` 且新建根）：以 `lastChild` 写入预览树（`srs.ai.status=preview`；属性经 `core.editor.setProperties` 的 `BlockProperty[]`：`name/value/type`）
  5. **失败**：生成失败（非 `CANCELLED`）或插入/打标失败 → job `status=error` + `errorMessage`（脱敏）+ `orca.notify("error", …, { title: "AI 快捷交互" })`。Jobs 面板当前空挂（`AIQuickJobsPanel` return null），故 toast 为用户可见主通道；未预期异常路径同
  6. 预览 UI（仅 preview 且新建根）：结果根 `.orca-block` 加罩层 class；根操作栏挂在根块直接子级，CSS `position:absolute; top/right` 贴首行右侧末端（不塞进 contenteditable / `.orca-repr-main` 文档流，避免错位）。无选择时显示「保留全部 / 取消」；有选择时增加「已选 N 项 / 保留所选」
  7. 用户操作（仅 preview）：
     - **选择候选** `toggleBackgroundQuickJobBlockSelection`：预览树每个**子孙块**悬停显示「选择」（`AIBlockLoadingMount` + `MutationObserver` 补挂）。选择只更新 job 的 `selectedResultBlockIds`，**不调用移动/删除命令**；选中后按钮与浅绿色状态常显，可再次点击取消。父块选择代表整棵子树：已选后代自动合并；祖先已选时后代显示「随上级选择」且不重复计数。每个 job 的异步选择更新串行化，避免快速连续点击丢选择
     - **保留所选** `keepSelectedBackgroundQuickJob` → `keepSelectedQuickResultBlocks`：确认时有界读取预览树（最多 500 块、100 层），重新校验并按树前序归一化所选子树根；一次 `moveBlocks(orderedRoots, root, "after")` 保持原文档顺序，再 `deleteBlocks` 清理「AI · 提示名」外壳与未选分支。成功后结束 job 并 toast「已保留 N 项」；失败保留 job、选择和可见预览以便重试。若 move 已成功而 delete 失败，重试可识别已移到结果根同级的候选并继续清理
     - **保留全部** `keepBackgroundQuickJob`：把 `srs.ai.status` 写成 `kept` 并结束预览态（卸罩层/按钮；整棵内容保留）。属性写入失败时仍卸预览 UI，并 `warn` 提示
     - **取消** `dismissBackgroundQuickJob`：删除预览树并结束任务；仅选择尚未确认时仍按未保存预览处理
  8. **离开面板默认取消**（仅仍挂着的 preview job）：任务记录启动时 `activePanel` + 视图指纹（`panelId`/`panelViewKey`）。用户切换/关闭该面板视图且未点保留时，`dismissJobsLeftBehindOnPanelLeave` 按取消处理（generating 静默中止；ready 删预览树；error 仅清任务）。生成结束/插入后也会再校验，避免写完立刻离开留下脏预览。**直接写入 / 合并复用**成功后无 job，不受此影响
- **插入净化**（`sanitizeAiTextForOrcaInsert`，在 `buildQuickResultInsertPlan` 内；顺序关键）：
  1. `[[n]](url)` / `[n](url)` / `〔n〕(url)` → `[源n](url)`（合法半角 Markdown，宿主可点）
  2. 无 URL 的 `[[n]]` → `〔n〕`（防块引用）
  3. `n(url)` → `[源n](url)`
  - 勿先做步骤 2：否则 `[[3]](url)` 会变成不可点的 `〔3〕(url)`
- **弹窗路径**（两项后台开关均关，或「自定义提示词」）：仍走 `aiQuickInteractState` + `AIQuickInteractDialog`，结果可「插入为子块」
- **卸载**：`cancelAllBackgroundQuickJobs` 中止进行中请求；对仍为 `ready` 的未保留预览**默认删除**（与「离开不保存」一致），再清空队列
- **样式**：`src/styles/ai-quick-interact.css`；结果根块不用 padding/margin 改布局（以免挤歪句柄/子块缩进），仅用背景 + inset box-shadow 做左侧 accent

### 快捷制卡（`aiQuickCardFlow.ts` + `aiQuickCardJob.ts` + `aiQuickCardPrefs.ts`）

与「AI 生成闪卡」弹窗的分工，按「每次都会变」vs「稳定偏好」切：

| 维度 | 归属 | 理由 |
| --- | --- | --- |
| 卡型 | **命令名**（三个命令） | 每次都随内容变：这句适合挖空、那段适合问答。藏进设置就意味着按下去之前不知道会得到什么 |
| 语言 / 自定义指令 / 专用 model | **持久化偏好**（`ai.quickCard`） | 设一次用很久。制卡弹窗的配置是弹窗临时状态（`openAIDialog` 每次重置），存不住，因此单开一个 data 键 |
| 详细程度 | **固定概要档**，不可配 | 块下面挂十几张预览卡没法看也没法选。快捷路径的价值是「一眼看完、一秒决定」；要成批就该走弹窗 |

**预览机制复用**：结果结构与文本类快捷交互一致（源块下一个结果根 + 子块内容），
因此罩层、操作栏、离开面板默认取消、卸载清理全部复用现成实现。
`QuickBackgroundJob` 新增 `kind?: "quick" | "card"`（缺省 `quick`，旧任务与既有测试不变），
只在 keep / dismiss 两处分支。

**为什么用待激活卡而不是临时块**：卡片一写进去就带 `#card` 标签与 SRS 状态，
在用户点「保留」之前它已经进复习队列了——当晚复习会撞见一张自己还没确认的卡。
写成 `status=pending` 后不进队列，且即使预览被意外中断（崩溃、强退），
卡片也只是「待激活」而非丢失，用命令「SRS: 激活待激活卡片」就能捞回来。

| 动作 | 行为 |
| --- | --- |
| 保留 | 把卡片从包装块提出来变成源块直接子块 → 清 pending 激活 → 删空包装块。三步失败处理不同：移动失败可重试；激活失败只 warn 并指路激活命令（回滚只会把用户刚看到的卡又搬走）；删壳失败只剩空块，warn 即可 |
| 丢弃 | 连包装块带卡片一起删 |

源文本取法：优先选区（含同块跨样式 / 同树任意跨块——兄弟链、父子链 P+子块、跨分支，块间换行拼接），无选区则用锚点块正文（「光标停在块里直接按快捷键」是最顺手的用法，不该报错）；跨块时结果挂在**末块**下（祖先↔后代跨度挂祖先 P）；无法连通为前序区间（不同根 / 孤立块 / 祖先缺失）可见报错而非静默退回。

### 块解释（`aiBlockExplain.ts` + `aiBlockExplainWrite.ts`）

- 解释：块全文 + 可选 FOCUS → JSON `paraphrase` / `terms[]`
- 举例 / 反驳：`generateBlockSideContent`；追问：`generateBlockFollowUp`（带解释 + 历史）
- 写入：`appendPlainChildIfNew` → 直接子块正文规范化去重 → `core.editor.insertBlock` lastChild（undoable group）
- 名词写入格式：`术语 — 释义`
- UI：见 [渐进阅读.md](./渐进阅读.md)「块解释」

### 摘录处理建议（Extract Coach：`aiExtractCoach.ts` + `IRExtractCoach.tsx` + `irExtractCoachView.ts`）

渐进阅读阅读区内的**只读 AI 顾问**：进入 Extract 卡后约 300ms 自动分析摘录及其**有界上下文**，在正文底部渲染虚拟块（核心价值 1 句 + 最多 3 条处理建议 + 重新生成 / 隐藏）。**不写数据库、不建卡、不改排期**，AI 输出仅会话内缓存。

- **触发与取消**：仅 `cardType === "extracts"` 且 `extract_focus` 模式显示（Topic / `chapter_browse` 隐藏）；入场 300ms 防抖请求；切卡 / 关会话 / 禁用时 `AbortController` + `createRequestTokenGuard` 递增 token 双保险，旧结果不得覆盖新卡
- **上下文有界收集** `collectExtractCoachContext`：摘录正文 → 直接父块 → 父块前一/后一兄弟（`block.left` / 祖块 `children` 定位，仅读 state，兄弟缺失是有意降级）→ `sourceTopicId` 块标题 → 直接子块 ≤3（用于避免建议重复加工）。**最多读 8 块**、单块截断、总量 ≤ 8000 字符；只用 `get-block` / `get-blocks`，**禁用 `get-block-tree`**；后端读取失败抛 `ExtractCoachContextError` → 虚拟块错误态 + 重试，不伪装成空上下文
- **输出协议**（严格 JSON，见 `aiExtractCoach.ts`）：`insight`（≤300 字）+ `actions[]`（≤3 条，`kind` ∈ `cloze | question | example | counterpoint | connect | done`）；`actions` 为空视为合法的「无需加工，可继续阅读」态
- **校验与接地**：畸形 JSON / 未知 `kind` / `insight` 为空 → 可见解析错误；`cloze.quote` 必须经 `isContiguousExcerpt` 空白规范化接地，不接地则丢弃 quote（该条降级为普通建议，不展示为可挖空原文）
- **Prompt 边界**：所有笔记内容置于 `-----BEGIN/END-----` 分隔符内，system 明令视为**不可信数据**，不执行其中指令；不要求思维链
- **会话缓存 / 隐藏**：缓存键 = `extractId:modified:上下文签名`，上限 50 条逐最旧；「重新生成」`force` 绕过缓存；「隐藏」按 Extract 记入会话隐藏集，重新进入仍隐藏
- **请求日志**：`purpose: "extract-coach"`，标签「摘录处理建议」（`aiRequestLog.ts`）
- **设置**：渐进阅读设置 `enableExtractCoach`（默认关）；未配置 AI（`isAIConfigured` 为假）时不发请求，虚拟块显示配置提示

### 正式链路

```text
makeAICard / interactiveAICard（别名）
  → startAIFlashcardFlow（若弹窗已开则拒绝并提示）
      → readBlockText
      → openAIDialog
  → AIDialogMount
      → generateFlashcardDrafts（request token + AbortController）
      → parseAndValidateDrafts
      → 用户预览/编辑/选择
      → writeAICardDrafts
```

### 制卡配置（弹窗 v2）

| 项 | 取值 | 说明 |
| --- | --- | --- |
| 卡片类型 | `basic` / `cloze` / `choice` **多选** | 选多种时由模型按内容特点分配；`type` 字段成为必需的路由依据，缺失即计入 rejected（否则 cloze/choice 会被静默误判成 basic）。只允许一种时可省略 type |
| 详细程度 | `summary` / `key`(默认) / `exhaustive` | 取代旧的固定张数 1/3/5。硬上限 2/5/12 只作闸门，prompt 明确标注 "a limit, not a target"。**档位不再决定 `max_tokens`**——输出预算统一走设置项 |
| 卡片语言 | `auto`(默认) / `zh` / `en` / `ja` | **只改题干措辞**。answer / sourceQuote / cloze text 必须逐字取自源文本（接地校验前提），prompt 显式禁止翻译 |
| 自定义指令 | ≤500 字 | 追加在 SOURCE 分隔符**之外**（受信输入；混进 untrusted 区会被 system prompt 明令忽略） |
| 再来一批 | — | 已有草稿题干作为排除清单送进 prompt，结果**追加**而非替换。追加时重新分配 id（模型每批都从 draft_1 编号，直接 concat 会撞号导致勾选/编辑串卡），跨批重复计入提示 |
| 保存为待激活 | 默认关 | 写 `#card` 标签 `status=pending`，卡片不进复习队列也不占当日额度。放行走命令 `${pluginName}.activatePendingCards`（斜杠「SRS: 激活待激活卡片」）批量清回正常态 |

### 选择题卡（`choice`）

输出契约：`{"type":"choice","question":"…","options":[{"text":"…","correct":true},…],"sourceQuote":"…"}`

| 规则 | 取舍理由 |
| --- | --- |
| 选项 3~6 项 | 少于 3 没有测验价值，多于 6 在复习界面不可读 |
| 至少一个正确、不得全部正确 | 全对等于没考点，复习时任选皆对 |
| **干扰项允许模型合成** | 干扰项生成正是 LLM 相对人工最省时间的部分；强求逐字摘录只会让整批卡失败。接地要求落在 `sourceQuote` 上 |
| 去重按题干 | 同一考点换一组干扰项不算新卡 |

写入结构应与手工的 `createChoiceCardFromBlock` 一致（题干块 `#card type=choice` + `_repr = srs.choice-card`，选项为直接子块、正确项打 `#correct`），否则复习渲染器与 `extractChoiceOptions` 认不出来。身份只由 `#card` 的 `type=choice` 决定（不再依赖独立 `#choice` 标签）。

### 队列承接（`srs.batchId` + `pending`）

- **同批聚簇**：`clusterCardsByBatch` 以每批最早到期成员为锚点就地展开整批。批次之间与无批次卡的 due 升序不变，因此不会把晚到期的卡提前到别的批次之前。**放在限额之后**——否则整批卡会一起挤进额度，把当日队列变成单一材料
- **待激活**：`CardStatus` 增加 `pending`。与 `suspend` 的区别是刻意的——suspend 在 `reviewCardFactory` 处直接返回空数组、对所有消费方不可见；pending 仍会被收集成 `ReviewCard`，只是被 `partitionDueAndNewCards` 排除，这样才能统计并批量激活。pending 卡也不占当日额度
- 未知 `status` 值一律回落 `normal`：宁可多复习一张，也不要因为一个笔误静默吞掉卡片

### 设置项（独立面板，不在原生设置页）

入口：Headbar 插头图标 / 命令 `${pluginName}.openAIServiceSettings` / 斜杠「AI / Firecrawl 服务设置」（面板标题「服务与算法设置」）。

| 存储 | 键 / 字段 | 默认 | 说明 |
| --- | --- | --- | --- |
| plugin **data** `ai.connection` | `apiKey` | `""` | Bearer |
| 同上 | `apiUrl` | OpenAI chat/completions | 须 OpenAI 兼容；**拒绝** Ollama 原生 `/api/chat` |
| 同上 | `model` | `gpt-3.5-turbo` | 可「拉取模型」自 `/models` 列表选择 |
| 同上 | `enableNativeWebSearch` | `false` | **唯一**联网开关（勾选）。开启后由 model 自动选路线：Grok 4.5 → 扁平 `web_search`；Gemini Flash → nested `google_search`；其它 model 不挂 tools |
| 同上 | `webSearchToolType` | `auto` | **历史字段，运行时忽略**。面板已去掉形态下拉；保存时固定写 `auto`，避免旧值干扰 |
| 同上 | `maxOutputTokens` | `16384` | 单次响应**输出**上限（与上下文窗口无关；百万上下文的模型输出上限通常仍是 8k~64k，填超会被网关 400）。推理模型把 reasoning token 计入 completion_tokens，旧的写死 2000 会被思考吃光 |
| 同上 | `reasoningEffort` | `default` | `default` 不传字段；`low`/`medium`/`high` → `reasoning_effort` |
| plugin **data** `ai.quickCard` | `cardLanguage` / `customInstruction` / `model` | `auto` / `""` / `""` | 快捷制卡偏好；面板内独立分区 |
| plugin **data** `ai.chapterQuiz` | `questionCount` / `language` / `customPrompt` / `model` | `10` / `auto` / `""` / `""` | 章末小测偏好（默认出题数 / 题目语言 / 自定义提示词 / 专用模型）；面板内独立分区；见 [渐进阅读_章末小测.md](渐进阅读_章末小测.md) |
| plugin **data** `ir.selectionToolbar` | `actions` / `formatGroups` | 摘录·挖空·解释开；AI 菜单·TTS 关；格式组全关 | IR 原生选区工具栏 allow-list；面板 **渐进阅读** Tab「选区工具栏」；见 [渐进阅读.md](渐进阅读.md) §选区工具栏 |
| plugin **data** `tts.connection` | `apiKey` / `region` / `endpoint` / `voice` / `format` / `rate` / `pitch` | Azure 默认 | **语音 TTS**（Azure Speech REST）；**独立 Key**，不复用 AI；见 [SRS_TTS语音.md](SRS_TTS语音.md) |
| plugin **data** `webImport.firecrawl` | `firecrawlApiKey` / `firecrawlApiUrl` | 官方 v2 scrape | 与 AI 同面板；**不**写 `setSettings` |
| plugin **settings**（原 key，**非** data） | `review.newCardsPerDay` / `review.reviewCardsPerDay` / `review.fsrsRequestRetention` / `review.passFailButtons` / `review.showNextReviewTime` | 30 / 200 / 0.9 / false / false | **复习** 页签编辑；后两项仅 UI；helper 见 `reviewServiceSettings.ts`；[SRS_记忆算法.md](SRS_记忆算法.md) |
| 同上（无面板 UI） | `review.fsrsWeights` / `review.fsrsMaximumInterval` | FSRS v6 默认 | 算法 runtime +「恢复 FSRS 默认」命令；普通面板保存**不**写回 |

- 读取：`getAISettings` / `getWebImportSettings` / `getTtsSettings`（内存缓存 → 默认）；复习页用 `loadReviewServiceSettings`（`src/srs/settings/reviewServiceSettings.ts`，settings 原 key）
- hydrate：插件 load + 打开面板；旧 AI settings 键可迁移到 setData；缺省字段归一为默认（旧数据无联网/强度键时安全）
- 面板：`AIServiceSettingsDialog` — **分段 Tab**（默认「连接」；标题「服务与算法设置」）
  - **连接**：Key / URL / 模型 / 拉取 / 测连；模型 chips 默认 8 个，「浏览全部」展开
  - **行为**：联网 / 思考强度 / max tokens；长说明「了解更多」折叠
  - **快捷制卡** / **章末小测** / **渐进阅读**（选区工具栏动作与格式组开关；「恢复推荐设置」仅改草稿）/ **复习**（每日新卡 / 每日复习 / 目标保留率；「恢复默认值」仅改草稿 30/200/0.9；**不**显示权重与最大间隔）/ **语音 TTS**（Azure region·endpoint·Key·voice·试听）/ **网页导入** / **诊断**（请求日志）各一页
  - 保存一次提交整份 draft（`ai` + `firecrawl` + `quickCard` + `chapterQuiz` + **`tts`** + **`review`**）
  - **复习页先严格校验**（`reviewServiceSettings.ts`）：`parseReviewServiceSettingsDraftStrict` 失败则整包中止（面板 banner + notify），**不会**先保存 AI/Firecrawl 再发现复习项非法；合法时 `saveReviewServiceSettingsFromForm` → `setSettings` 写额度/保留率三项 + 两项 UI 开关 + `clearFsrsRuntimeState()`（不覆盖个人权重/最大间隔）
  - 打开时若可见复习项非法：表单显示安全生效值 + 全局 warning banner；隐藏权重/最大间隔错误不由本面板阻止保存
- 请求：`buildChatCompletionsBody` 用于制卡 / 块解释 / 快捷交互 / 连接测试
  - 原生联网（`resolveWebSearchRoute` / `resolveWebSearchTool` / `materializeWebSearchTool`）：
    - UI 仅一个勾选 `enableNativeWebSearch`；**无**形态下拉
    - 开启后按 **model leaf**（最后一段 `/` 后）自动：`grok-4.5`（`(?!\d)` 防 `grok-4.50`）→ 扁平 `{ type: "web_search" }`；含 `gemini` 且 `flash` 为独立 token（如 `-flash`/`-flash-high`）→ `{ type: "google_search", google_search: {} }`；其它 model 不写 tools
    - 历史 `webSearchToolType` 读写保留但**不参与解析**（面板保存固定 `auto`）
  - 连接测试：`allowWebSearch: false`（不触发搜索计费/延迟），仍会带上用户设定的 `reasoning_effort`
  - 不支持该 tool 或 `reasoning_effort` 的上游会返回可见 HTTP 错误，不静默降级
  - 制卡仍做源文本接地校验：开启联网后若答案依赖源外内容，校验可能失败

### 制卡提示词质量规则（`aiService` system/user prompt）

提示词仍为英文；卡片语言与源文本匹配。不新增输出字段、不要求思维链，不改 `temperature` / `max_tokens`。

| 规则 | 要点 |
| --- | --- |
| 最小信息 | 一卡一知识点；复合观点/列表/多部分答案拆卡 |
| 独立可理解 | 脱离源文本、上下文与其他卡仍可理解；避免模糊指代 |
| 唯一明确答案 | 避免过宽题干、多合理解或措辞泄题 |
| 高价值筛选 | 优先核心概念、定义、因果、机制、条件与重要区别；不为凑数做边角卡 |
| Basic | 题干明确主题与范围，触发主动回忆；`answer` 为 `sourceQuote` 内简洁连续摘录 |
| Cloze | 只挖核心非琐碎目标；上下文足够但不泄题；一卡一主要挖空 |
| 静默自检 | 输出前淘汰含糊、琐碎、重复、未接地或不能独立回答的卡 |
| 质量优先 | 材料不足时返回更少或空 `cards` 数组 |

源文本仍以 untrusted delimiters（`-----BEGIN/END SOURCE-----`）包裹；解析与写入逻辑不变。

### 输出契约与校验（模型输出）

- 内部 `id`：**始终**本地分配 `draft_1…`，不信任模型 id
- Basic：`answer` 须出现在 `sourceQuote` 中（规范化空白）；`sourceQuote` 接地且长度 ≥ `min(8, 源规范化长度)`
- Cloze：`text` 须为源的连续摘录；`clozeText ⊆ text`；`sourceQuote` 同上
- **接地匹配**：先做空白规范化包含；失败再对源与摘录做 `normalizeForGrounding`（`[label](url)` → label，剥离 `[1]` 类数字脚注）后比较。解决维基/Markdown 粘贴源 vs 模型返回纯文本导致整批 `sourceQuote 未出现在源文本中`
- 去重、`maxCards`：超限计入 `truncatedCount`，**不**写入 `rejected`
- 用户编辑后保存：结构校验 + 接地/信息量足够的 `sourceQuote`（不再强制 answer⊆quote / text⊆source）

### 写入与回滚

**假设**：弹窗保存期间低并发，其他进程不会同时向源块插入子块。

1. 记录源块已有直接子 ID
2. 立即 track 每个返回的顶层卡块 ID
3. 失败时 backend-first 再取源块，将**新出现的直接子**并入回滚候选（覆盖 commit-then-reject）
4. 在 `invokeGroup({ undoable: false, topGroup: true })` 中 `deleteBlocks`
5. backend-first 校验删除；`orphanBlockIds` 为仍存在的 ID；若校验无法执行则保守报告候选
6. UI 在有残留时展示块 ID，提示手动检查删除

### 请求策略（`aiChatClient` + `aiChatPolicy`）

所有 Chat Completions 请求经 `callChatCompletions` 单一出口，横切能力只实现一次。

| 能力 | 规则 |
| --- | --- |
| **重试** | 仅 `HTTP_429` / `500` / `502` / `503` / `504` / `NETWORK_ERROR`；默认额外 2 次，指数退避 800ms→1.6s→3.2s（上限 8s）。尊重 `Retry-After`（整数秒或 HTTP 日期）。退避期间可被用户取消打断 |
| **不重试** | `CANCELLED`（用户意图）、`TIMEOUT`（deadline 就是 deadline，重试等于让用户等两倍）、其余 4xx（鉴权/参数错，重试必然同样失败）、`RESPONSE_PARSE_ERROR`、`RESPONSE_TOO_LARGE` |
| **并发闸门** | 全局信号量默认 3，FIFO 唤醒（避免后台任务饿死交互请求）。**排队期间不计入超时**，deadline 从真正发请求起算。连接测试 `bypassConcurrencyGate: true` + `maxRetries: 0` |
| **超时分级** | 制卡 60s / 块解释 40s / 快捷交互 30s / 网页总结 90s / 测连 15s（此前一律 40s） |
| **输出预算** | 统一取设置项 `maxOutputTokens`（默认 16384），不再按用途写死 1600/900/2000。推理模型把 reasoning token 计入 `completion_tokens`，任何写死的小值都可能被思考吃光 |
| **截断检测** | `finish_reason === "length"` 在解析前拦下，返回 `RESPONSE_TRUNCATED` 并报出实际花费与其中的推理 token 数。此前截断的 JSON 会报成「不是合法 JSON」、完全没生成会报成「返回内容为空」——两条都把预算问题说成模型返回问题 |
| **请求日志** | 环形缓冲最近 50 条（**会话内存，不写笔记库**）：时间、用途、model、endpoint host、耗时、重试次数、HTTP 状态、脱敏错误正文、usage。`NO_API_KEY` 是配置问题不占并发名额也不进日志 |

`Retry-After` 解析上的一个坑：畸形值（如 `-1`）不能落到 `Date.parse`——它会被解析成远古日期从而返回 0ms，等于让畸形头绕过退避。因此纯数字非法形态与不含字母的串一律判为畸形返回 null。

### HTTP

- 生成：`temperature: 0.2`，约 40s 超时，可取消
- 连接测试：约 15s 超时；保留截断后的纯文本错误正文
- 源文本在 prompt 中标为 untrusted data
- 可选扩展字段（设置面板）：`tools`（`web_search` 或嵌套 `google_search`）、`reasoning_effort`
- 请求体始终 `stream: false`（避免部分网关按模型默认开流）
- 成功体解析：`parseJsonResponseText` 支持纯 JSON、JSON 后夹带、SSE `data:`、NDJSON 首行；仍失败时 code=`RESPONSE_PARSE_ERROR`

## 注册

| 命令 | 说明 |
| --- | --- |
| `makeAICard` | 主编辑器命令 |
| `interactiveAICard` | 兼容别名（无独立斜杠） |
| `testAIConnection` | 连接测试 |
| `quickBasicCard` / `quickClozeCard` / `quickChoiceCard` | 快捷制卡（editor command，需光标） |
| `activatePendingCards` | 批量激活「待激活」卡片（backend-first 解析 + 写后失效两套缓存；逐张串行，单张失败不中止整批） |

斜杠：仅 `aiCard` → `makeAICard`。

## 视觉规范

AI 对话框与导入向导的视觉层统一遵循 [SRS_UI设计规范.md](SRS_UI设计规范.md)（Apple HIG 基线，基准实现是 Flash Home）。令牌真源为 `src/styles/srs-design-tokens.css`。

| 样式表 | 覆盖面 |
| --- | --- |
| `src/styles/ai-card-dialog.css` | AI 制卡对话框、快捷交互弹窗、提示词库、服务设置、后台任务托盘，**以及导入向导**（EPUB / 网页 / 渐进阅读书籍设置）。导入向导没有独立样式表——`src/main.ts` 的样式导入清单不在本模块职责内，故其类（`.srs-import-dialog*`、`.srs-chapter-selector*`、`.srs-import-progress*`、`.srs-web-preview*`）合并在本表尾部。 |
| `src/styles/ai-quick-interact.css` | 行尾加载图标、AI 结果块罩层、预览/子块操作栏 |

落地约定（改动这两张表或相关组件时必须保持）：

- **禁止裸数值与裸十六进制色**：圆角 / 间距 / 阴影 / 动效时长 / 字号字重一律用 `--srs-*`；颜色只能来自 `--orca-color-*` 或 `--srs-*` 派生。历史上这两张表大量引用了并不存在的变量（`--orca-bg-primary`、`--orca-border`、`--orca-text-primary`、`--orca-color-primary`、`--orca-color-dangerous`、`--orca-accent-color`…），实际永远落到硬编码 fallback，靠 `@media (prefers-color-scheme: dark)` 二次覆盖——当 Orca 主题与系统主题不一致时会出现浅底深字。现已全部换成真实 Orca 令牌并删除所有 `prefers-color-scheme` / `.theme-dark` 分支。
- **浮层容器基线**：`--srs-surface-base` + hairline + `--srs-radius-lg` + `--srs-shadow-overlay` + `--srs-font-family`。
- **草稿卡 / 提示词卡 / 后台任务卡**：`bg-1` + hairline + `--srs-radius-lg` + `--srs-shadow-1`，hover 升 `--srs-shadow-2` + `--srs-hairline-strong`；状态用左侧 4px 语义色条（`.is-selected` → `--srs-accent-new`，`.has-error` → `--orca-color-danger-5`，任务卡 generating/ready/error 同理）。
- **按钮体系**：`__btn--primary` 走主 CTA（`--srs-radius-lg`、15px/600）；`__btn` 基线走次级按钮（`--srs-radius-md`、`7px 14px`、13px/500）；`__btn--ghost` 与各面板 `__close` 走安静按钮。四态齐全，焦点环统一 `2px solid var(--orca-color-primary-5)` + `outline-offset: 2px`。
- **表单控件**：`--srs-radius-sm`（对话框内）/ `--srs-radius-md`（导入向导）+ hairline，聚焦态为 `primary-5` 边框 + 半透明 primary 光环，不使用浏览器默认蓝框。
- **内联样式**：组件里只允许保留**运行时动态几何量**。目前唯一一处是 `EpubImportProgress` 的进度条填充宽度；轨道与填充的视觉（`--srs-radius-pill` + `--orca-color-primary-5`）在 CSS 里。
- **锁定态**：忙碌 / 不可用的宿主 `orca.components.Button` 用 `.srs-ui-locked`（`opacity` + `cursor` + `pointer-events: none`，`!important`）表达，等价于原先的内联样式；部分调用点未在 `onClick` 内二次守卫，指针拦截是行为契约的一部分，**不要去掉 `pointer-events`**。
- **宿主兼容选择器**：`ai-quick-interact.css` 中所有 `.orca-block[data-srs-ai-result…]` / `.orca-repr-main` 作用域选择器必须原样保留，绝不放宽为裸选择器。

## 相关测试

`aiChatClient.test.ts`（并发闸门 / 重试判定 / 日志 / 脱敏）、`aiChatPolicy.test.ts`（Semaphore FIFO 与 abort-release 竞态 / Retry-After 解析 / 可中断退避）、`aiDialogState.test.ts`（再来一批的 id 重分配与跨批去重）、`cardBatch.test.ts`、`reviewQueueBatchCluster.test.ts`（聚簇不丢不重 / pending 不进队列不占额度）、`cardStatusPending.test.ts`、`aiService.test.ts`、`aiChatRequest.test.ts`、`aiSettingsStore.test.ts`、`aiBlockExplain.test.ts`、`aiBlockExplainWrite.test.ts`、`aiDraftParseValidate.test.ts`、`aiCardWriter.test.ts`、`aiRequestToken.test.ts`、`aiConfigValidator.test.ts`、`aiQuickInteract.test.ts`（提示词库字段含 `directWriteBelow`/`resultTags`/`reuseSameResultBlock` + `insertQuickResult` 打标/合并写入 + 候选选择归一化）、`aiQuickInteractJobs.test.ts`（后台 preview/direct/tags/reuse 跳过预览 / 多选与离开面板取消）
