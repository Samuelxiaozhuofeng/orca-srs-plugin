# SRS AI 模块

> 文档同步日期：2026-07-20
> 变更说明：块解释 v1.1——白话/名词「+」写普通子块（去重）、举例/反驳、同面板追问与「把这句回答写入」；`aiBlockExplainWrite.ts`。
> **未宣称**：真机 UI / 写入 / 追问全路径验收。

## 概述

AI 模块提供基于 **OpenAI 兼容 Chat Completions** 的能力。产品路径：

| 路径 | 入口 | 行为 |
| --- | --- | --- |
| **AI 生成闪卡** | `${pluginName}.makeAICard`（别名 `interactiveAICard`） | 读当前光标块 → 弹窗配置 → **一次** AI 请求 → 校验/预览/编辑/勾选 → 确认后分组写入 |
| **块解释** | 渐进阅读会话正文块上「?」 | 读目标块 → 白话/名词内联；可选举例/反驳/追问；用户点「+」才写入普通子块 |

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
├── aiSettingsSchema.ts      # apiKey / apiUrl / model
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
└── aiFlashcardFlow.ts       # readBlockText + 制卡入口
src/srs/http/
├── safeResponse.ts          # Content-Length 预检 + 流式字节上限
└── redactSecrets.ts         # exact key / Bearer / 常见认证字段

src/components/
├── AIDialogMount.tsx
├── AICardGenerationDialog.tsx
├── AICardDraftCard.tsx
└── incremental-reading/
    ├── IRBlockExplainController.tsx
    ├── IRBlockExplainInline.tsx
    └── useIRBlockExplain.ts
```

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

### 设置项

| 设置键 | 默认 | 说明 |
| --- | --- | --- |
| `ai.apiKey` | `""` | Bearer |
| `ai.apiUrl` | OpenAI chat/completions | 须 OpenAI 兼容；**拒绝** Ollama 原生 `/api/chat` |
| `ai.model` | `gpt-3.5-turbo` | |

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

## 注册

| 命令 | 说明 |
| --- | --- |
| `makeAICard` | 主编辑器命令 |
| `interactiveAICard` | 兼容别名（无独立斜杠） |
| `testAIConnection` | 连接测试 |

斜杠：仅 `aiCard` → `makeAICard`。

## 相关测试

`aiService.test.ts`、`aiBlockExplain.test.ts`、`aiBlockExplainWrite.test.ts`、`aiDraftParseValidate.test.ts`、`aiCardWriter.test.ts`、`aiRequestToken.test.ts`、`aiConfigValidator.test.ts`
