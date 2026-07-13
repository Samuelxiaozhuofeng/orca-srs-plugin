# AI API 404 错误排查指南

> 文档类型：排查类（不扩写为完整模块文档）  
> 文档同步日期：2026-07-13  
> 变更说明：与 `aiConfigValidator.ts` / `aiService.ts` / `aiKnowledgeExtractor.ts` 中的端点示例与诊断逻辑对齐。

## 错误现象

控制台或通知中可能出现类似：

```text
[AI Knowledge Extractor] API 错误: …
AI API 错误 (HTTP_404): …
请求失败: 404
```

简单制卡、知识点提取、Basic/Cloze 生成与「测试连接」均 `POST` 到设置中的 **`ai.apiUrl` 完整字符串**；URL 少路径时最常见表现是 **HTTP 404**。

## 快速诊断

### 步骤 1：测试 AI 连接

1. `Ctrl+P` / `Cmd+P`  
2. 搜索 **「SRS: 测试 AI 连接」**（命令 ID：`${pluginName}.testAIConnection`）  
3. 执行  

实现：`testAIConfigWithDetails`（`aiConfigValidator.ts`）：

1. 本地 `validateAIConfig`（Key、URL 可解析、协议、常见服务路径警告）  
2. 向配置 URL 发最小 `POST`（`messages: [{ role: "user", content: "Hi" }]`，`max_tokens: 5`）  
3. 失败时 `formatAIConfigError` 输出：当前 URL / 模型 / Key 是否配置、原因与示例端点  

### 步骤 2：核对设置

**设置 → 插件 → AI 相关项**：`ai.apiKey`、`ai.apiUrl`、`ai.model`。

默认 URL：`https://api.openai.com/v1/chat/completions`。

## 代码内置示例端点（`getAIServiceExamples`）

以下与源码一致，排查时以此为准。

### 1. OpenAI

```text
API URL: https://api.openai.com/v1/chat/completions
模型: gpt-3.5-turbo 或 gpt-4
API Key: sk-…
```

- 必须包含路径 `/v1/chat/completions`  
- 仅 `https://api.openai.com` 或 `…/v1` 会 404 或无法 chat  

校验器：URL 含 `api.openai.com` 但不含 `/v1/chat/completions` → 警告。

### 2. DeepSeek

```text
API URL: https://api.deepseek.com/chat/completions
模型: deepseek-chat
```

- 示例路径为 **`/chat/completions`（无 `/v1`）**  
- 校验器：含 `api.deepseek.com` 但不含 `/chat/completions` → 警告  

若你方文档要求带 `/v1`，以服务商当前文档为准；插件示例与校验按**无 `/v1`** 的 URL 编写。

### 3. Ollama（本地）

```text
API URL: http://localhost:11434/v1/chat/completions
模型: llama2（或本机已 pull 的名称）
API Key: 可填任意非空值（当前请求仍会带 Authorization 头；Key 为空会直接报未配置）
```

- 默认 HTTP + 端口 `11434`  
- 校验器对 localhost：路径宜含 `/v1/chat/completions` 或 `/api/chat`  
- 需本机 `ollama serve` 且模型已下载  

### 4. Azure OpenAI（有限兼容）

`getAIServiceExamples` 提供 URL 模板，但实现与其它服务相同：

- 请求头固定：`Authorization: Bearer <API Key>`（**没有** `api-key` 头分支）
- 响应需含 `choices[0].message.content`

```text
API URL: https://YOUR-RESOURCE-NAME.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT-NAME/chat/completions?api-version=2023-05-15
模型: gpt-35-turbo（或部署名对应值）
API Key: 必须是可走 Bearer 的密钥；纯 Azure「api-key 头」模式当前不可用
```

替换资源名、部署名与 `api-version`。若 401/403，优先怀疑认证形态不匹配，而非仅 URL。

### 5. 其他 OpenAI 兼容服务

常见形态：

```text
http://localhost:PORT/v1/chat/completions
```

LM Studio、LocalAI 等以各自文档为准；插件只要求可 `POST` 且响应含 `choices[0].message.content`。

## 常见错误

### HTTP 404

**可能原因**：端点路径错误/不完整；服务不支持该路径；代理改写 URL。

**处理**：对照上表补全路径；用 curl 复现；跑「测试 AI 连接」。

### HTTP 401 / 403

`formatAIConfigError` 会提示 Key 无效、过期或权限不足。检查完整复制、空格、模型权限。

### NETWORK_ERROR

网络不可达、本地服务未起、防火墙/CORS（浏览器插件环境）等。提取器与生成器会把详细文案放进 `error.message`。

### NO_API_KEY

`ai.apiKey` 为空时各生成函数直接失败，不发起请求。Ollama 若 Key 必填逻辑触发，可填占位字符串。

## 调试技巧

### 浏览器控制台

日志前缀示例：

- `[AI Service]`  
- `[AI Config]`  
- `[AI Knowledge Extractor]`  
- `[AI Card Generator]`  

### curl 冒烟

```bash
# OpenAI
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hi"}],"max_tokens":5}'

# Ollama
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2","messages":[{"role":"user","content":"Hi"}],"max_tokens":5}'
```

curl 也 404 → 问题在 URL/服务侧，而非插件业务逻辑。

### Ollama

```bash
ollama list
ollama serve
ollama run llama2 "Hi"
```

## 与代码的对应关系

| 能力 | 文件 / 符号 |
| --- | --- |
| 设置默认 URL / Key | `src/srs/ai/aiSettingsSchema.ts` |
| 简单生成 + 轻量 `testAIConnection` | `src/srs/ai/aiService.ts` |
| 校验、示例、详细测试、404 文案 | `src/srs/ai/aiConfigValidator.ts` |
| 提取路径上的详细错误 | `src/srs/ai/aiKnowledgeExtractor.ts`（`formatAIConfigError`） |
| 命令注册 | `src/srs/registry/commands.ts` → `testAIConfigWithDetails` |

完整模块说明：[SRS_AI模块.md](./SRS_AI模块.md)。

## 仍无法解决时请提供

1. 服务商（OpenAI / DeepSeek / Ollama / 其他）  
2. API URL（可打码域名敏感段，保留路径）  
3. 控制台完整错误  
4. 「SRS: 测试 AI 连接」通知/控制台输出  
