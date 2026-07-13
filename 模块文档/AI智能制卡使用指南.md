# AI 智能制卡功能使用指南

> 文档同步日期：2026-07-13  
> 变更说明：与当前交互入口 `startInteractiveCardCreationNew` + `AIDialogMount` 对齐；补充与简单 AI 制卡的差异；将「后续优化」标为计划非实现。

## 功能概述

**AI 智能制卡（交互式）** 在简单「一键生成一张问答卡」之上提供可控流程：

1. 分析当前块内容，提取 2–5 个候选知识点  
2. 弹窗勾选要制卡的知识点（AI 标记推荐的默认勾选）  
3. 可输入自定义知识点  
4. 选择 **Basic（问答）** 或 **Cloze（填空）**  
5. 调用 AI 按知识点生成 1–2 张卡，插入到原始块下方并初始化 SRS  

实现文档见 [SRS_AI模块.md](./SRS_AI模块.md)。

## 使用方法

### 1. 配置 AI 服务

插件设置中配置：

| 项 | 默认 / 说明 |
| --- | --- |
| **API Key** | 必填；OpenAI 兼容 Bearer Token |
| **API URL** | 默认 `https://api.openai.com/v1/chat/completions`（须为完整 chat 端点） |
| **AI Model** | 默认 `gpt-3.5-turbo` |
| 生成语言 / 难度 / 提示词模板 | 主要影响**简单** AI 制卡路径；交互路径使用内置提取与生成 prompt |

配置后建议命令面板执行 **「SRS: 测试 AI 连接」**。常见 404 见 [AI_API_404错误排查指南.md](./AI_API_404错误排查指南.md)。

### 2. 启动智能制卡

光标放在**有文本**的目标块上。

**方式一：斜杠命令**

1. 输入 `/`  
2. 搜索 **「AI 智能制卡（交互式）」**  
3. 执行  

**方式二：命令面板**

1. `Ctrl+P` / `Cmd+P`  
2. 搜索 **「SRS: AI 智能制卡（交互式）」**  
3. 执行  

对应命令 ID：`${pluginName}.interactiveAICard`。

> 勿与 **「AI 生成记忆卡片」**（`${pluginName}.makeAICard`）混淆：后者不弹窗，直接生成 1 张 Basic 卡。

### 3. 交互式选择

弹窗（`AICardGenerationDialog`，Orca `ModalOverlay`）包含：

#### 原始内容预览

当前块全文。

#### 检测到的知识点

列表项包括：

- 复选框（默认勾选 `recommended === true` 的项）  
- 知识点文本；推荐项显示「(推荐)」  
- 可选说明 `description`  
- 难度 `⭐` × `difficulty`（缺省按 3）  

无知识点时提示使用自定义输入。

#### 自定义知识点

单行输入；有内容时计入「预计张数」并与勾选项一并送入生成器。

#### 卡片类型

- **Basic Card（问答卡）**（默认）  
- **Cloze Card（填空卡）**  

按钮文案：`生成 N 张卡片`，其中 **N = 勾选数 +（自定义非空则 1）**，为**估计值**；实际张数由模型决定（通常每知识点 1–2 张）。

生成中禁用关闭与取消类交互（`canClose={!isGenerating}`）。

### 4. 生成结果

点击生成后：

1. 将选中 id 映射为知识点文本，并追加自定义文本  
2. `generateBasicCards` 或 `generateClozeCards`  
3. 逐张插入到源块 `lastChild`：  
   - Basic：问题块 + 答案子块 + `#card` + `ensureCardSrsState`  
   - Cloze：全文块 → 将挖空词替换为插件 cloze 片段 + `#card` + `writeInitialClozeSrsState`  
4. 通知成功/失败张数；关闭弹窗  

若某张 Cloze 的 `clozeText` 不在 `text` 中，该张插入失败并跳过。

## 使用示例

### 示例 1：日语语法（Basic）

**原始内容**：

```text
使役形（～させる）+ ない：不让/不准（某人）做某事
```

**可能提取**：

- ☑ 使役形（～させる）  
- ☑ ない的否定用法  
- ☐ 使役形 + ない 的组合规则  

**生成结构示意**：

```text
使役形（～させる）+ ない：不让/不准（某人）做某事
  └── …问题… #card
      └── …答案…
  └── …问题… #card
      └── …答案…
```

### 示例 2：概念（Cloze）

选择 Cloze 后，模型返回带 `text` / `clozeText` 的句子；插件在笔记中写入可复习的填空片段（非字面 `[词]` 括号，而是插件 cloze 内容类型）。

## 技术细节

### 正式入口与历史变体

| 组件 / 文件 | 角色 |
| --- | --- |
| `aiInteractiveCardCreatorNew.ts` | **正式入口**：提取知识点 → `openAIDialog` |
| `AIDialogMount.tsx` | Headbar 挂载；订阅 `aiDialogState`；执行生成与插卡 |
| `AICardGenerationDialog.tsx` | UI |
| `aiDialogState.ts` | Valtio：`isOpen` / `knowledgePoints` / `originalContent` / `sourceBlockId` |
| `aiKnowledgeExtractor.ts` | 提取 API |
| `aiCardGenerators.ts` | Basic / Cloze 生成 API |
| `aiInteractiveCardCreator.ts` | 历史：命令内 ReactDOM 直挂（**未作为入口调用**） |
| `aiInteractiveCardCreatorSimple.ts` | 历史：块级 UI（**未注册**） |

### AI 提示词设计（内置常量）

| 阶段 | 要点 |
| --- | --- |
| 知识点提取 | 2–5 个原子知识点；难度 1–5；`recommended` |
| Basic | 每知识点 1–2 张；最小知识点原则 |
| Cloze | 关键词挖空；可选 `hint`（当前插卡逻辑以 `text`/`clozeText` 为主） |

### 与简单 AI 制卡对比

| 维度 | 简单 AI 制卡 | 智能制卡（交互式） |
| --- | --- | --- |
| 命令 | `makeAICard` / 斜杠「AI 生成记忆卡片」 | `interactiveAICard` / 「AI 智能制卡（交互式）」 |
| 交互 | 无弹窗 | Modal 勾选 + 类型 |
| 卡片数 | 固定 1 张 | 多张（由知识点与模型决定） |
| 类型 | 仅 Basic | Basic / Cloze |
| 设置模板 | 使用 `ai.promptTemplate` 等 | 使用模块内置 prompt |
| 实现 | `aiCardCreator` + `aiService` | New 入口 + Mount + Generators |

## 常见问题

### Q: 为什么没有检测到知识点？

内容过短、过散或模型解析失败时可能为空。使用「自定义知识点」或改用简单 AI 制卡 / 手动制卡。

### Q: 生成质量不佳？

1. 换更强模型（如 `gpt-4`）  
2. 收紧块内原文、减少噪声  
3. 用自定义知识点精确描述目标  
4. 简单路径可改 `ai.promptTemplate`（不影响交互路径内置 prompt）

### Q: 可以批量多块吗？

当前每次针对**一个**光标块。

### Q: 支持其他语言吗？

模型可按原文语言输出。设置中的「生成语言」主要服务简单制卡模板。

### Q: 弹窗不出现？

确认 Headbar 已加载插件（`aiDialogMount`）。交互路径依赖 Orca React 树内的 `AIDialogMount`，而非独立 `document.body` 根（那是历史变体行为）。

### Q: Cloze 插入失败？

模型返回的 `clozeText` 必须是 `text` 的子串；否则该张会被跳过。可改用 Basic 或收紧知识点描述后重试。

## 计划中的优化（未在代码中实现）

以下为产品方向，**不要当作已实现功能**：

1. 一次处理多个块  
2. 生成前预览卡片正文  
3. 卡片质量评分  
4. 分学科提示词模板库  
5. 用户选择偏好历史  

## 反馈

问题可附：AI 服务商、API URL（脱敏）、控制台日志、「测试 AI 连接」输出。
