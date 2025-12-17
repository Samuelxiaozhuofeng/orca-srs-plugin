# SRS AI 模块文档

## 概述

AI 模块提供基于大语言模型的智能卡片生成功能，允许用户通过 AI 自动将知识点转换为问答式闪卡。

### 核心价值

- **自动生成问答**：AI 分析用户输入内容，自动提取关键信息生成问题和答案
- **多模型支持**：兼容 OpenAI API 格式，支持 GPT、DeepSeek、Ollama 等多种模型
- **可自定义**：支持自定义提示词模板和多个变量替换

## 技术实现

### 模块结构

```
src/srs/ai/
├── aiSettingsSchema.ts   # 设置 schema 定义和获取工具
├── aiService.ts          # AI API 调用服务
└── aiCardCreator.ts      # AI 卡片创建逻辑
```

### 设置项

| 设置键              | 标签       | 类型   | 默认值                                       | 说明                  |
| ------------------- | ---------- | ------ | -------------------------------------------- | --------------------- |
| `ai.apiKey`         | API Key    | string | (空)                                         | OpenAI 兼容的 API Key |
| `ai.apiUrl`         | API URL    | string | `https://api.openai.com/v1/chat/completions` | API 端点地址          |
| `ai.model`          | AI Model   | string | `gpt-3.5-turbo`                              | 使用的模型名称        |
| `ai.language`       | 生成语言   | string | `中文`                                       | AI 生成内容的语言     |
| `ai.difficulty`     | 难度级别   | string | `普通`                                       | 生成卡片的难度级别    |
| `ai.promptTemplate` | 提示词模板 | string | (见下方)                                     | AI 生成卡片的提示词   |

### 提示词变量

提示词模板支持以下变量替换：

| 变量             | 说明               |
| ---------------- | ------------------ |
| `{{content}}`    | 用户输入的原始内容 |
| `{{language}}`   | 设置中的生成语言   |
| `{{difficulty}}` | 设置中的难度级别   |

### 默认提示词模板

```
你是一个闪卡制作助手。根据用户提供的内容，生成一个问答对。

输入内容：{{content}}
语言要求：{{language}}
难度级别：{{difficulty}}

要求：
1. 根据内容生成一个问题和对应的答案
2. 问题应该清晰简洁，符合指定的难度级别
3. 答案应该准确但简短
4. 使用指定的语言输出

请严格以 JSON 格式返回，不要包含其他内容：
{"question": "问题内容", "answer": "答案内容"}
```

## 核心函数

### `generateCardFromAI(pluginName, content)`

调用 AI API 生成问答卡片。

**参数**：

- `pluginName: string` - 插件名称（用于读取设置）
- `content: string` - 用户输入的内容

**返回**：

```typescript
type AIGenerateResult =
  | { success: true; data: { question: string; answer: string } }
  | { success: false; error: { code: string; message: string } };
```

**错误码**：
| 错误码 | 说明 |
|--------|------|
| `NO_API_KEY` | 未配置 API Key |
| `HTTP_xxx` | HTTP 请求错误 |
| `EMPTY_RESPONSE` | AI 返回内容为空 |
| `PARSE_ERROR` | JSON 解析失败 |
| `NETWORK_ERROR` | 网络错误 |

### `testAIConnection(pluginName)`

测试 AI 连接是否正常。

**返回**：

```typescript
{
  success: boolean;
  message: string;
}
```

### `makeAICardFromBlock(cursor, pluginName)`

主入口函数，创建 AI 卡片。

**流程**：

1. 获取当前块的文本内容
2. 调用 `generateCardFromAI` 生成问答
3. 创建子块（问题）
4. 创建孙子块（答案）
5. 给子块添加 `#card` 标签
6. 初始化 SRS 状态

**卡片结构**：

```
原始块（用户输入的内容）
└── 子块 [#card 标签]（AI 生成的问题）
    └── 孙子块（AI 生成的答案）
```

## 注册的命令

| 命令 ID                          | 类型       | 说明            |
| -------------------------------- | ---------- | --------------- |
| `${pluginName}.makeAICard`       | 编辑器命令 | AI 生成记忆卡片 |
| `${pluginName}.testAIConnection` | 普通命令   | 测试 AI 连接    |

## 注册的 UI 组件

### 工具栏按钮

| ID                           | 图标          | 说明            |
| ---------------------------- | ------------- | --------------- |
| `${pluginName}.aiCardButton` | `ti ti-robot` | AI 生成记忆卡片 |

### 斜杠命令

| ID                     | 标题            | 说明                     |
| ---------------------- | --------------- | ------------------------ |
| `${pluginName}.aiCard` | AI 生成记忆卡片 | 使用 AI 自动生成问答卡片 |

## 使用方式

### 1. 配置 AI 服务

1. 打开 Orca 设置 → 插件 → 虎鲸标记
2. 输入 API Key
3. 配置 API URL（如使用第三方服务）
4. 选择模型
5. 可选：自定义语言、难度和提示词

### 2. 测试连接

1. 按 `Ctrl+P` / `Cmd+P` 打开命令面板
2. 输入 "测试 AI 连接"
3. 执行命令，查看连接结果

### 3. 生成 AI 卡片

1. 在块中输入要学习的内容（如："光合作用是植物利用阳光将二氧化碳和水转化为葡萄糖的过程"）
2. 输入 `/AI` 或 `/AI 生成记忆卡片`
3. 等待 AI 生成问答对
4. 自动创建子块和孙子块结构

### 示例

**输入**：

```
光合作用是植物利用阳光将二氧化碳和水转化为葡萄糖的过程
```

**AI 生成结果**：

```
光合作用是植物利用阳光将二氧化碳和水转化为葡萄糖的过程
└── 什么是光合作用？ [#card]
    └── 植物利用阳光将二氧化碳和水转化为葡萄糖的过程
```

## 与原有功能的关系

| 功能         | 命令               | 说明                                               |
| ------------ | ------------------ | -------------------------------------------------- |
| **原有功能** | `/转换为记忆卡片`  | 手动模式：用户自己写好问答，直接转换当前块         |
| **新增功能** | `/AI 生成记忆卡片` | AI 模式：用户写原始内容，AI 生成问答并创建子块结构 |

> **注意**：AI 功能是独立模块，不影响原有的手动制卡功能。

## 支持的 AI 服务

| 服务         | API URL                                        | 模型示例                 |
| ------------ | ---------------------------------------------- | ------------------------ |
| OpenAI       | `https://api.openai.com/v1/chat/completions`   | `gpt-3.5-turbo`, `gpt-4` |
| DeepSeek     | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat`          |
| Ollama       | `http://localhost:11434/v1/chat/completions`   | `llama2`, `mistral`      |
| 其他兼容服务 | 自定义 URL                                     | 服务商提供的模型名       |

## 相关文件

| 文件                                                                                          | 说明             |
| --------------------------------------------------------------------------------------------- | ---------------- |
| [aiSettingsSchema.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/ai/aiSettingsSchema.ts) | 设置 schema 定义 |
| [aiService.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/ai/aiService.ts)               | AI API 调用服务  |
| [aiCardCreator.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/ai/aiCardCreator.ts)       | AI 卡片创建逻辑  |
| [commands.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/registry/commands.ts)           | 命令注册         |
| [uiComponents.tsx](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/registry/uiComponents.tsx)   | UI 组件注册      |

## 更新历史

| 日期       | 版本  | 说明                      |
| ---------- | ----- | ------------------------- |
| 2025-12-11 | 1.0.0 | 初始版本：AI 卡片生成功能 |
