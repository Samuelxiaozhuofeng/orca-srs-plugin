# AI API 404 错误排查指南

## 🔍 错误现象

```
[AI Knowledge Extractor] API 错误: 请求失败: 404
```

## 📋 快速诊断步骤

### 步骤 1: 测试 AI 连接

1. 按 `Ctrl+P` / `Cmd+P` 打开命令面板
2. 搜索 "SRS: 测试 AI 连接"
3. 执行命令，查看详细错误信息

新版本会显示：
- 当前配置（API URL、模型、API Key 状态）
- 可能的原因分析
- 具体的解决建议
- 常见 AI 服务的正确配置示例

### 步骤 2: 检查 API URL 配置

打开 **设置 → 插件 → 虎鲸标记 → AI 设置**，检查 API URL 是否正确。

## 🛠️ 常见 AI 服务的正确配置

### 1. OpenAI 官方 API

```
API URL: https://api.openai.com/v1/chat/completions
模型: gpt-3.5-turbo 或 gpt-4
API Key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**注意事项**：
- ✅ URL 必须包含 `/v1/chat/completions`
- ✅ API Key 以 `sk-` 开头
- ❌ 不要使用 `https://api.openai.com` （缺少路径）
- ❌ 不要使用 `https://api.openai.com/v1` （缺少端点）

### 2. DeepSeek API

```
API URL: https://api.deepseek.com/chat/completions
模型: deepseek-chat
API Key: 你的 DeepSeek API Key
```

**注意事项**：
- ✅ DeepSeek 的路径是 `/chat/completions`（没有 `/v1`）
- ✅ 模型名称通常是 `deepseek-chat`

### 3. Ollama 本地服务

```
API URL: http://localhost:11434/v1/chat/completions
模型: llama2 或 mistral
API Key: 留空或任意值
```

**注意事项**：
- ✅ 确保 Ollama 服务已启动（运行 `ollama serve`）
- ✅ 端口默认是 11434
- ✅ 需要先下载模型（`ollama pull llama2`）
- ❌ 不要使用 HTTPS（本地服务用 HTTP）

### 4. Azure OpenAI

```
API URL: https://YOUR-RESOURCE-NAME.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT-NAME/chat/completions?api-version=2023-05-15
模型: gpt-35-turbo
API Key: 你的 Azure API Key
```

**注意事项**：
- ✅ 替换 `YOUR-RESOURCE-NAME` 为你的资源名称
- ✅ 替换 `YOUR-DEPLOYMENT-NAME` 为你的部署名称
- ✅ 包含 `api-version` 参数

### 5. 其他 OpenAI 兼容服务

如果使用其他兼容 OpenAI API 的服务（如 LM Studio、LocalAI 等），URL 格式通常是：

```
http://localhost:PORT/v1/chat/completions
```

## 🐛 常见错误及解决方案

### 错误 1: 404 Not Found

**可能原因**：
1. API URL 路径不完整或错误
2. 使用了错误的端点
3. 服务不支持该端点

**解决方案**：
1. 检查 URL 是否包含完整路径（如 `/v1/chat/completions`）
2. 参考上面的正确配置示例
3. 如果使用第三方服务，查阅其官方文档

### 错误 2: 401 Unauthorized

**可能原因**：
1. API Key 无效或已过期
2. API Key 格式错误
3. API Key 权限不足

**解决方案**：
1. 重新生成 API Key
2. 检查 API Key 是否完整复制（没有多余空格）
3. 确认 API Key 有访问该模型的权限

### 错误 3: 网络错误 (NETWORK_ERROR)

**可能原因**：
1. 网络连接问题
2. 本地服务未启动（如 Ollama）
3. 防火墙或代理阻止

**解决方案**：
1. 检查网络连接
2. 如果使用本地服务，确认服务已启动
3. 检查防火墙设置
4. 如果在公司网络，可能需要配置代理

## 📝 调试技巧

### 1. 查看浏览器控制台

按 `F12` 打开开发者工具，查看 Console 标签页，会显示详细的错误信息和配置。

### 2. 使用 curl 测试

在终端中测试 API 是否可用：

```bash
# OpenAI
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hi"}],
    "max_tokens": 5
  }'

# Ollama
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2",
    "messages": [{"role": "user", "content": "Hi"}],
    "max_tokens": 5
  }'
```

如果 curl 也返回 404，说明 URL 确实有问题。

### 3. 检查 Ollama 服务状态

```bash
# 检查 Ollama 是否运行
ollama list

# 启动 Ollama 服务
ollama serve

# 测试模型
ollama run llama2 "Hi"
```

## 🔄 更新后的改进

新版本添加了以下改进：

1. **详细的错误信息**
   - 显示当前配置
   - 分析可能的原因
   - 提供具体的解决建议
   - 列出常见服务的正确配置

2. **配置验证**
   - 自动检查 URL 格式
   - 验证协议（http/https）
   - 识别常见服务并提示正确格式

3. **更好的测试命令**
   - 使用 "SRS: 测试 AI 连接" 命令
   - 显示详细的诊断信息
   - 在控制台输出完整的错误详情

## 💡 推荐配置流程

1. **首次配置**：
   - 先使用 OpenAI 官方 API 测试（最稳定）
   - 确认功能正常后再切换到其他服务

2. **切换服务**：
   - 修改配置后，立即运行 "测试 AI 连接"
   - 确认连接成功后再使用智能制卡功能

3. **本地服务**：
   - 先在终端测试服务是否正常
   - 再配置到插件中

## 📞 仍然无法解决？

如果按照上述步骤仍然无法解决，请提供以下信息：

1. 使用的 AI 服务（OpenAI / DeepSeek / Ollama / 其他）
2. 完整的 API URL（隐藏敏感信息）
3. 浏览器控制台的完整错误信息
4. "测试 AI 连接" 命令的输出

在 GitHub Issues 中提交问题，我们会尽快帮助解决。
