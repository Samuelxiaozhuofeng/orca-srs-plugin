# SRS AI 模块

> 文档同步日期：2026-07-22
> 变更说明：QuickAI 预览支持「保留此块」——子块悬停仅保留该子树并去掉 AI 外壳；根「保留/取消」不变。此前：提示词库项可选 `model`。
> **未宣称**：真机「保留此块」与多 model 路由的端到端验收。

## 概述

AI 模块提供基于 **OpenAI 兼容 Chat Completions** 的能力。产品路径：

| 路径 | 入口 | 行为 |
| --- | --- | --- |
| **AI 生成闪卡** | `${pluginName}.makeAICard`（别名 `interactiveAICard`） | 读当前光标块 → 弹窗配置 → **一次** AI 请求 → 校验/预览/编辑/勾选 → 确认后分组写入 |
| **块解释** | 渐进阅读会话：移到块右侧隐形热区出「?」或 `Alt+E` | 读目标块 → 白话/名词内联；可选举例/反驳/追问；用户点「+」才写入普通子块 |
| **AI 快捷交互** | 编辑器工具栏 sparkles 按钮 | 选中同块文本 → 选提示词；见下「快捷交互」 |

可见斜杠命令仅 **`${pluginName}.aiCard`（AI 生成闪卡）**。块解释无独立斜杠命令。

### 核心价值

- 仅使用当前块文本（backend-first `get-block`：成功返回 null 视为缺失；仅抛错时回退 state）
- 单次请求 + 确定性本地校验
- 写入前可编辑/取消勾选；关闭不写库
- 成功写入：`invokeGroup({ undoable: true, topGroup: true })`
- 失败：尽力回滚（非 undoable 删除 + 子节点差分 + 校验残留 ID），**不承诺无条件删除**

## 技术实现

### 模块结构

```text
src/srs/ai/
├── aiSettingsSchema.ts      # apiKey / apiUrl / model / enableNativeWebSearch / reasoningEffort
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
├── aiQuickInteract.ts       # 选区提取 / 请求 / 插入 after|lastChild
├── aiQuickInteractJobs.ts   # 后台插入任务队列
├── aiQuickInteractState.ts  # 弹窗态
└── aiPromptManagerState.ts  # 提示词库面板态
src/srs/http/
├── safeResponse.ts          # Content-Length 预检 + 流式字节上限
└── redactSecrets.ts         # exact key / Bearer / 常见认证字段

src/components/
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

### 快捷交互（工具栏）

- **提示词项字段**（持久化：`orca.plugins.setData` 键 `ai.promptLibrary`，**不**走 `setSettings`，以免冲掉 apiKey/apiUrl）：
  - `includeBlockContext`：是否附带整块正文作 context（旧数据缺省 `true`）
  - `insertBelowOnComplete`：是否后台生成并默认插入到**查询块下方**（同级 `after`；旧数据缺省 `false` 保持弹窗）
  - `model`：可选专用模型 id；空字符串 = 用「AI 服务设置」全局 `model`（旧数据缺省 `""`）
  - 兼容：hydrate 时若 data 无数据，只读迁移 settings 中的 `ai.promptLibrary` / `ai.toolbarPrompts` → setData
- **默认三项**（库从未写入时）：举例说明 / 翻译 / 进一步解释；默认均 `insertBelowOnComplete: true`、`model: ""`
- **按提示词选模型**：新增/编辑表单用**下拉**选择 model（选项 = 服务设置同一 Key/URL 的 `/models` 列表 +「默认」项）；与服务设置共享内存缓存 `aiModelsCache`；可「刷新模型」。后台/弹窗路径传入 `runToolbarAIPrompt({ model })`，仅覆盖请求体 `model`
- **提示词库编辑 UI**：表单用组件本地 state + 键盘事件 stopPropagation，避免宿主编辑器抢键导致无法输入
- **后台路径**（`insertBelowOnComplete`）：
  1. 选中文本 → 点菜单项 → 立即 `runToolbarAIPrompt`（不弹窗）
  2. 生成中：`AIBlockLoadingMount` 在源块 `.orca-repr-main-content` 行尾挂 `srs-ai-target-block-loading` sparkles
  3. 成功：以 `lastChild` 写入 `AI · 提示名` 预览树（`srs.ai.status=preview`；属性经 `core.editor.setProperties` 的 `BlockProperty[]`：`name/value/type`）
  4. 预览 UI：结果根 `.orca-block` 加罩层 class；**保留/取消**操作栏挂在根块直接子级，CSS `position:absolute; top/right` 贴首行右侧末端（不塞进 contenteditable / `.orca-repr-main` 文档流，避免错位）
  5. 用户操作：
     - **保留（全部）** `keepBackgroundQuickJob`：把 `srs.ai.status` 写成 `kept` 并结束预览态（卸罩层/按钮；整棵内容保留）。属性写入失败时仍卸预览 UI，并 `warn` 提示
     - **保留此块** `keepSingleBlockBackgroundQuickJob`：预览树每个**子孙块**悬停显示按钮（`AIBlockLoadingMount` + `MutationObserver` 补挂）。`keepSingleQuickResultBlock`：校验块属于预览树 → `moveBlocks` 到结果根 `after`（整棵子树一起）→ `deleteBlocks` 剩余预览树（含「AI · 提示名」外壳与其它兄弟）。成功后卸预览任务并 toast「已保留该块」；失败保留任务与预览树可重试。点根自身时退化为整棵 `keepQuickResult`
     - **取消** `dismissBackgroundQuickJob`：删除预览树并结束任务
  6. **离开面板默认取消**：任务记录启动时 `activePanel` + 视图指纹（`panelId`/`panelViewKey`）。用户切换/关闭该面板视图且未点保留时，`dismissJobsLeftBehindOnPanelLeave` 按取消处理（generating 静默中止；ready 删预览树）。生成结束/插入后也会再校验，避免写完立刻离开留下脏预览
- **插入净化**（`sanitizeAiTextForOrcaInsert`，在 `buildQuickResultInsertPlan` 内；顺序关键）：
  1. `[[n]](url)` / `[n](url)` / `〔n〕(url)` → `[源n](url)`（合法半角 Markdown，宿主可点）
  2. 无 URL 的 `[[n]]` → `〔n〕`（防块引用）
  3. `n(url)` → `[源n](url)`
  - 勿先做步骤 2：否则 `[[3]](url)` 会变成不可点的 `〔3〕(url)`
- **弹窗路径**（选项关闭或「自定义提示词」）：仍走 `aiQuickInteractState` + `AIQuickInteractDialog`，结果可「插入为子块」
- **卸载**：`cancelAllBackgroundQuickJobs` 中止进行中请求；对仍为 `ready` 的未保留预览**默认删除**（与「离开不保存」一致），再清空队列
- **样式**：`src/styles/ai-quick-interact.css`；结果根块不用 padding/margin 改布局（以免挤歪句柄/子块缩进），仅用背景 + inset box-shadow 做左侧 accent

### 块解释（`aiBlockExplain.ts` + `aiBlockExplainWrite.ts`）

- 解释：块全文 + 可选 FOCUS → JSON `paraphrase` / `terms[]`
- 举例 / 反驳：`generateBlockSideContent`；追问：`generateBlockFollowUp`（带解释 + 历史）
- 写入：`appendPlainChildIfNew` → 直接子块正文规范化去重 → `core.editor.insertBlock` lastChild（undoable group）
- 名词写入格式：`术语 — 释义`
- UI：见 [渐进阅读.md](./渐进阅读.md)「块解释」

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

### 设置项（独立面板，不在原生设置页）

入口：Headbar 插头图标 / 命令 `${pluginName}.openAIServiceSettings` / 斜杠「AI / Firecrawl 服务设置」。

| 存储 | 键 / 字段 | 默认 | 说明 |
| --- | --- | --- | --- |
| plugin **data** `ai.connection` | `apiKey` | `""` | Bearer |
| 同上 | `apiUrl` | OpenAI chat/completions | 须 OpenAI 兼容；**拒绝** Ollama 原生 `/api/chat` |
| 同上 | `model` | `gpt-3.5-turbo` | 可「拉取模型」自 `/models` 列表选择 |
| 同上 | `enableNativeWebSearch` | `false` | 为 true 时请求附带 `tools: [{ type: "web_search" }]`（xAI 等内置 server tool） |
| 同上 | `reasoningEffort` | `default` | `default` 不传字段；`low`/`medium`/`high` → `reasoning_effort` |
| plugin **data** `webImport.firecrawl` | `firecrawlApiKey` / `firecrawlApiUrl` | 官方 v2 scrape | 与 AI 同面板；**不**写 `setSettings` |

- 读取：`getAISettings` / `getWebImportSettings`（内存缓存 → 旧 settings 迁移源 → 默认）
- hydrate：插件 load + 打开面板；旧 settings 键自动迁移到 setData；缺省字段归一为默认（旧数据无联网/强度键时安全）
- 面板：`AIServiceSettingsDialog`（本地表单 state + 测连 + 拉模型 + 联网开关 + 思考强度）
- 请求：`buildChatCompletionsBody` 用于制卡 / 块解释 / 快捷交互 / 连接测试
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

### HTTP

- 生成：`temperature: 0.2`，约 40s 超时，可取消
- 连接测试：约 15s 超时；保留截断后的纯文本错误正文
- 源文本在 prompt 中标为 untrusted data
- 可选扩展字段（设置面板）：`tools`（web_search）、`reasoning_effort`
- 请求体始终 `stream: false`（避免部分网关按模型默认开流）
- 成功体解析：`parseJsonResponseText` 支持纯 JSON、JSON 后夹带、SSE `data:`、NDJSON 首行；仍失败时 code=`RESPONSE_PARSE_ERROR`

## 注册

| 命令 | 说明 |
| --- | --- |
| `makeAICard` | 主编辑器命令 |
| `interactiveAICard` | 兼容别名（无独立斜杠） |
| `testAIConnection` | 连接测试 |

斜杠：仅 `aiCard` → `makeAICard`。

## 相关测试

`aiService.test.ts`、`aiChatRequest.test.ts`、`aiSettingsStore.test.ts`、`aiBlockExplain.test.ts`、`aiBlockExplainWrite.test.ts`、`aiDraftParseValidate.test.ts`、`aiCardWriter.test.ts`、`aiRequestToken.test.ts`、`aiConfigValidator.test.ts`、`aiQuickInteract.test.ts`（提示词库字段 + `insertQuickResult` 位置 + `keepSingleQuickResultBlock` / `isStrictDescendantOf`）、`aiQuickInteractJobs.test.ts`（后台 keep / 单块 keep / 离开面板取消）
