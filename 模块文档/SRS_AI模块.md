# SRS AI 模块

> 文档同步日期：2026-07-13  
> 变更说明：按当前 `src/srs/ai/*`、对话框挂载与命令注册全量校正；标明交互制卡入口实际走 New 变体。

## 概述

AI 模块提供基于 OpenAI 兼容 Chat Completions 接口的智能制卡能力，分两条产品路径：

| 路径 | 命令 | 行为 |
| --- | --- | --- |
| **简单 AI 制卡** | `${pluginName}.makeAICard` | 对当前块内容直接生成 **1 张** Basic 问答卡并插入 |
| **交互式智能制卡** | `${pluginName}.interactiveAICard` | 先提取知识点 → 弹窗勾选/自定义 → 按 Basic 或 Cloze 批量生成 |

两条路径共用同一套设置（`ai.*`）与 HTTP 调用约定；交互路径额外使用知识点提取与多卡生成器。

### 核心价值

- 自动从笔记块生成问答 / 填空卡片并写入 `#card` + SRS 状态
- 兼容 **OpenAI Chat Completions 形态**端点（`Authorization: Bearer` + 响应 `choices[0].message.content`；官方 / DeepSeek / Ollama 等）。代码示例含 Azure **URL 模板**，但**未实现** Azure 常用 `api-key` 头认证
- 简单路径支持自定义提示词模板与 `{{content}}` / `{{language}}` / `{{difficulty}}` 变量
- 交互路径支持知识点勾选、自定义知识点与 Basic/Cloze 类型选择

## 技术实现

### 模块结构

```text
src/srs/ai/
├── aiSettingsSchema.ts              # 设置 schema、getAISettings、isAIConfigured
├── aiService.ts                     # 简单制卡 API：generateCardFromAI、testAIConnection
├── aiConfigValidator.ts             # 配置校验、错误格式化、testAIConfigWithDetails
├── aiCardCreator.ts                 # 简单制卡：makeAICardFromBlock
├── aiKnowledgeExtractor.ts          # 知识点提取 extractKnowledgePoints
├── aiCardGenerators.ts              # generateBasicCards / generateClozeCards
├── aiDialogState.ts                 # Valtio 弹窗状态 openAIDialog / closeAIDialog
├── aiInteractiveCardCreatorNew.ts   # ★ 交互制卡正式入口 startInteractiveCardCreationNew
├── aiInteractiveCardCreator.ts      # 历史变体：ReactDOM 直挂（入口未使用）
└── aiInteractiveCardCreatorSimple.ts# 历史变体：块级对话框（入口未使用）

src/components/
├── AIDialogMount.tsx                # Headbar 挂载：订阅状态 + 实际插卡逻辑
└── AICardGenerationDialog.tsx       # ModalOverlay 交互 UI

src/styles/ai-card-dialog.css        # .ai-card-dialog 样式（main.ts 全局引入）
```

设置注册：`src/main.ts` 将 `aiSettingsSchema` 展开进插件 settings。

### 交互制卡变体与入口

| 文件 | 导出名 | 现状 |
| --- | --- | --- |
| `aiInteractiveCardCreatorNew.ts` | `startInteractiveCardCreationNew` | **正式入口**：`commands.ts` 中 `interactiveAICard` 动态 import 并调用 |
| `aiInteractiveCardCreator.ts` | `startInteractiveCardCreation` | 仍在仓库；用独立 React root 渲染对话框。`commands.ts` 有静态 import 但**运行时未调用** |
| `aiInteractiveCardCreatorSimple.ts` | `startInteractiveCardCreationSimple` | 尝试用笔记块承载 UI；**无注册入口** |

正式链路：

```text
interactiveAICard
  → startInteractiveCardCreationNew
      → extractKnowledgePoints
      → openAIDialog (aiDialogState)
  → AIDialogMount (headbar, useSnapshot)
      → AICardGenerationDialog
      → generateBasicCards / generateClozeCards
      → insertBasicCard / insertClozeCard
```

Headbar 挂载点：`${pluginName}.aiDialogMount` → `<AIDialogMount pluginName={…} />`（平时 `isOpen === false` 时渲染 `null`）。

### 设置项

| 设置键 | 标签 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `ai.apiKey` | API Key | string | `""` | Bearer Token；空则各生成函数返回 `NO_API_KEY` |
| `ai.apiUrl` | API URL | string | `https://api.openai.com/v1/chat/completions` | **完整** chat/completions 端点 URL |
| `ai.model` | AI Model | string | `gpt-3.5-turbo` | 请求体 `model` 字段 |
| `ai.language` | 生成语言 | string | `中文` | 仅简单制卡提示词模板变量 |
| `ai.difficulty` | 难度级别 | string | `普通` | 仅简单制卡提示词模板变量 |
| `ai.promptTemplate` | 提示词模板 | string | 见默认模板 | 仅 `generateCardFromAI` 使用 |

读取：`getAISettings(pluginName)`；是否配置 Key：`isAIConfigured(pluginName)`。

### 提示词变量（简单制卡）

| 变量 | 说明 |
| --- | --- |
| `{{content}}` | 当前块文本 |
| `{{language}}` | `ai.language` |
| `{{difficulty}}` | `ai.difficulty` |

默认模板要求模型严格返回：

```json
{"question": "问题内容", "answer": "答案内容"}
```

### HTTP 约定（所有 fetch 路径共用）

- `POST` 到 `settings.apiUrl`
- Headers：`Content-Type: application/json`，`Authorization: Bearer ${apiKey}`
- Body：`{ model, messages, temperature?, max_tokens }`
- 成功响应按 OpenAI 风格读取 `data.choices[0].message.content`
- 失败：`HTTP_${status}`、`EMPTY_RESPONSE`、`PARSE_ERROR` / `INVALID_FORMAT`、`NETWORK_ERROR`、`NO_API_KEY`

| 调用点 | max_tokens | temperature |
| --- | --- | --- |
| `generateCardFromAI` | 1000 | 0.7 |
| `testAIConnection` / `testAIConfigWithDetails` | 5 | （未设） |
| `extractKnowledgePoints` | 1500 | 0.7 |
| `generateBasicCards` / `generateClozeCards` | 2000 | 0.7 |

### 配置校验（`aiConfigValidator.ts`）

- `validateAIConfig`：检查 Key、URL 协议/可解析性；对 OpenAI / DeepSeek / localhost 给出路径警告与建议
- `getAIServiceExamples`：内置示例端点（与下表一致）
- `formatAIConfigError`：按 `HTTP_404` / `401|403` / `NETWORK_ERROR` 拼诊断文案
- `testAIConfigWithDetails`：**命令面板「SRS: 测试 AI 连接」实际调用的函数**（先校验再请求）

说明：`aiService.testAIConnection` 仍存在，但注册命令走的是 `testAIConfigWithDetails`。

### 代码内推荐端点（`getAIServiceExamples`）

| 服务 | API URL | 模型示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-3.5-turbo` / `gpt-4` |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-chat` |
| Ollama | `http://localhost:11434/v1/chat/completions` | `llama2` |
| Azure OpenAI（仅 URL 示例） | `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT-NAME/chat/completions?api-version=2023-05-15` | `gpt-35-turbo` |

DeepSeek 校验规则：URL 需包含 `/chat/completions`（示例**无** `/v1` 前缀）。Ollama 亦接受含 `/api/chat` 的本地 URL 作为「格式可能正确」的放行条件。

**Azure 认证限制**：`aiService` / 校验请求统一使用 `Authorization: Bearer <apiKey>`，并解析 OpenAI 风格 `choices[0].message.content`。  
- 若 Azure 部署接受 **Bearer** 且响应形态兼容，URL 示例可用。  
- 仅配置 Azure 门户常见的 **`api-key` 头**认证时，**当前代码不支持**，会认证失败——勿当作完整 Azure SDK 兼容。

## 核心流程

### 1. 简单制卡 `makeAICardFromBlock`

1. 校验光标 / 块 / 非空文本  
2. `generateCardFromAI(pluginName, content)`  
3. 在原块下插入子块（问题）与孙子块（答案）  
4. 子块：`insertTag` `#card`（`buildCardTagData` · `basic`）、`ensureCardTagProperties`、`ensureCardSrsState`  
5. 可选写 `_repr: { type: "srs.card", front, back, cardType: "basic" }`  
6. 撤销：删除创建的问题子块（孙子随删）

结构：

```text
原始块（用户内容）
└── 子块 [#card]（问题）
    └── 孙子块（答案）
```

### 2. 交互制卡 `startInteractiveCardCreationNew` + `AIDialogMount`

1. 取当前块文本 → `extractKnowledgePoints`  
2. `openAIDialog(knowledgePoints, content, blockId)`  
3. 用户在 `AICardGenerationDialog` 中勾选（默认 `recommended === true`）、可选自定义输入、选 `basic` | `cloze`  
4. 估计卡片数 ≈ 选中知识点数 +（有自定义则 +1）；实际张数由 AI 每知识点 1–2 张决定  
5. 生成后对每张卡：  
   - **Basic**：问题子块 + 答案孙子块 + `#card` basic + `ensureCardSrsState`  
   - **Cloze**：插入全文 → 将 `clozeText` 替换为 `${pluginName}.cloze` 片段 → `#card` cloze + `writeInitialClozeSrsState`  
6. 关闭弹窗时 `closeAIDialog`，300ms 后清空状态字段  

`GenerationConfig`：

```typescript
{
  selectedKnowledgePoints: string[]  // 知识点 id 列表
  customInput: string
  cardType: "basic" | "cloze"
}
```

### 知识点与多卡生成（内置 prompt，非设置项）

- **提取**（`aiKnowledgeExtractor`）：2–5 个原子知识点；字段 `id` / `text` / `description?` / `difficulty?` / `recommended`  
- **Basic**（`aiCardGenerators`）：返回 `{ cards: [{ question, answer }] }`  
- **Cloze**：返回 `{ cards: [{ text, clozeText, hint? }] }`；插入时若 `text` 中找不到 `clozeText` 则该卡失败  

解析均支持整段 JSON 或从文本中正则提取含目标字段的 JSON 对象。

## 注册的命令与 UI

### 命令（`registry/commands.ts`）

| 命令 ID | 类型 | 标签 / 说明 |
| --- | --- | --- |
| `${pluginName}.makeAICard` | 编辑器命令 | `SRS: AI 生成记忆卡片` |
| `${pluginName}.interactiveAICard` | 编辑器命令 | `SRS: AI 智能制卡（交互式）` |
| `${pluginName}.testAIConnection` | 普通命令 | `SRS: 测试 AI 连接` → `testAIConfigWithDetails` |

### 斜杠命令（`registry/uiComponents.tsx`）

| 注册 ID | 标题 | 绑定命令 |
| --- | --- | --- |
| `${pluginName}.aiCard` | AI 生成记忆卡片 | `makeAICard` |
| `${pluginName}.interactiveAI` | AI 智能制卡（交互式） | `interactiveAICard` |

### Headbar

| ID | 作用 |
| --- | --- |
| `${pluginName}.aiDialogMount` | 注入 `AIDialogMount`（无可见图标；交互制卡弹窗宿主） |

> **注意（与旧文档差异）**：当前工具栏**没有** `ti-robot` AI 按钮；工具栏仅保留 Cloze 与「导入 EPUB」等入口。AI 通过斜杠命令或命令面板触发。

## 用户交互摘要

1. 设置 → 插件 → 配置 `ai.apiKey` / `ai.apiUrl` / `ai.model` 等  
2. 命令面板执行「SRS: 测试 AI 连接」验证  
3. 光标置于有内容的块：  
   - `/AI 生成记忆卡片`：直接 1 张 Basic  
   - `/AI 智能制卡（交互式）`：分析 → 弹窗 → 批量 Basic/Cloze  

## 与手动制卡的关系

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| 手动 | `/转换为记忆卡片` | 用户已写好结构，直接转换 |
| AI 简单 | `/AI 生成记忆卡片` | AI 生成 1 问 1 答 |
| AI 交互 | `/AI 智能制卡（交互式）` | 知识点选择 + 多卡 + Cloze |

互不影响；AI 失败时不改写原块内容（除已部分插入的卡需用户自行清理）。

## 错误与排查

- 提取失败时 `extractKnowledgePoints` 会通过 `formatAIConfigError` 返回长诊断文案  
- 404/401/网络类问题见 [AI_API_404错误排查指南.md](./AI_API_404错误排查指南.md)  
- 交互流程用户向说明见 [AI智能制卡使用指南.md](./AI智能制卡使用指南.md)

## 测试

当前仓库**无** `src/srs/ai/*.test.ts`。基线检查：`npx tsc --noEmit`、手动「测试 AI 连接」与制卡流程。

## 相关文件

| 路径 | 说明 |
| --- | --- |
| `src/srs/ai/aiSettingsSchema.ts` | 设置 schema |
| `src/srs/ai/aiService.ts` | 简单生成与轻量连接测试 |
| `src/srs/ai/aiConfigValidator.ts` | 配置校验与详细连接测试 |
| `src/srs/ai/aiCardCreator.ts` | 简单制卡落盘 |
| `src/srs/ai/aiKnowledgeExtractor.ts` | 知识点提取 |
| `src/srs/ai/aiCardGenerators.ts` | Basic/Cloze 批量生成 |
| `src/srs/ai/aiDialogState.ts` | 弹窗 Valtio 状态 |
| `src/srs/ai/aiInteractiveCardCreatorNew.ts` | 交互入口（正式） |
| `src/srs/ai/aiInteractiveCardCreator.ts` | 历史 ReactDOM 变体 |
| `src/srs/ai/aiInteractiveCardCreatorSimple.ts` | 历史块对话框变体 |
| `src/components/AIDialogMount.tsx` | 弹窗宿主与插卡 |
| `src/components/AICardGenerationDialog.tsx` | 交互 UI |
| `src/styles/ai-card-dialog.css` | 对话框样式 |
| `src/srs/registry/commands.ts` | 命令注册 |
| `src/srs/registry/uiComponents.tsx` | 斜杠 / Headbar 注册 |
| `src/main.ts` | `aiSettingsSchema` 合并与 CSS 引入 |

## 更新历史

| 日期 | 说明 |
| --- | --- |
| 2026-07-13 | 文档同步：完整文件树、双路径、校验器、New 入口、无工具栏 AI 按钮 |
| 2025-12-11 | 初始版本：简单 AI 卡片生成 |
