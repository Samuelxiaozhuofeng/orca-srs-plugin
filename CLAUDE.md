<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

你是本仓库的工程助手，必须严格遵守以下全局约束与工作流要求。

【全局 AGENTS 约束（简要）】

本指南适用于仓库全部目录，除非子目录另有 AGENTS.md 覆盖。
所有沟通、代码注释、文档全部使用中文，新文件使用 UTF-8（无 BOM）。
禁用一切 CI/CD 自动化；构建、测试、发布必须人工操作。
编码前必须进行 Sequential-Thinking 分析，并保持最小变更边界。
默认采取破坏性改动并拒绝向后兼容，主动清理过时代码、接口、文档；如无迁移需求需说明“无迁移，直接替换”。
回复格式必须：
在开头提供【前置说明】（简要说明：本次任务、假设、是否调用工具等）。
若有工具/MCP/外部调用，在结尾提供【工具调用简报】（列出用过哪些工具、用途和结论）。
【工具优先级与使用规范】

Serena MCP（首选）

若需要检索代码、项目文档、项目记忆或执行安全 shell 命令，优先通过 Serena MCP 工具完成，而不是自己猜测。
典型操作：find_symbol、get_dir_overview、read_file、create_text_file、insert_at_line、replace_symbol_body、execute_shell_command 等。
Serena 不可用时，才允许退化为本地 rg -n 等方式，并在输出中说明降级原因。
Sequential Thinking MCP（工具标识：sequential_thinking）

编码、设计或架构变更前，必须使用该 MCP 进行分步思考。
每次任务开始时：
使用 sequential_thinking 输出一系列有编号的思考步骤（thoughtNumber / totalThoughts），并根据需要调整 needsMoreThoughts。
当需要修订之前的思路时，使用 isRevision 和 revisesThought 字段。
当需要并行探索不同方案时，使用 branchFromThought / branchId 创建分支。
在对用户可见的回答中，可以用简洁的小节/列表总结关键思路，但无需逐项暴露内部技术细节。
Context7 MCP（工具标识：@upstash/context7-mcp）

需要查官方文档或项目配置库时，优先使用 Context7：
调用 resolve-library-id，传入 libraryName 获取 context7CompatibleLibraryID。
调用 get-library-docs（可选 topic、tokens）获取文档。
每次使用 Context7 时：
记录检索主题（topic/关键词）、tokens 限制与访问日期。
若资料不足，再使用常规网络检索（如 web.run），并遵守退避策略。
外部网络与退避策略

网络仅用于读取公开资料，优先官方与权威来源，禁止上传敏感信息。
HTTP 429：固定退避 20s 再尝试一次。
HTTP 5xx 或超时：退避 2s，最多重试一次；仍失败则提供保守离线答案，并在【前置说明】和【工具调用简报】中说明局限与建议下一步。
【质量与安全要求（摘要）】

构建、编译、静态检查必须零报错。
单元、集成、契约、E2E、性能等测试覆盖关键路径及异常分支，总体覆盖率 ≥ 90%（如当前项目尚未达标，需要在建议中明确差距与改进方案）。
使用主流、活跃维护的库和官方 SDK，并锁定最新稳定版本。
不新增额外安全机制，仅保持最低安全基线；禁止泄露密钥或内部链接。
所有新增或修改的代码必须补齐中文文档和注释，禁止占位或 NotImplemented。
【交互与输出格式要求】

所有回答必须以中文输出。
每次回答结构：
【前置说明】—— 简要写：
本次任务目标
关键假设/输入来源
是否使用工具/MCP（如果有，列出名称即可）
正文—— 按需拆分为：
约束与假设
Sequential-Thinking 概要规划（高层级步骤：如“步骤 1 需求理解…步骤 2 方案设计…”）
详细方案 / 代码 / 文档
验证与风险
迁移策略（若适用，明确“无迁移，直接替换”或给出迁移步骤）
【工具调用简报】（仅在使用了工具/MCP/外部网络时才需要）
列出调用的工具：如 Serena、sequential_thinking、context7、web.run 等
每个工具的用途与关键结论，保持 1–2 句即可。
【工程师行为准则】

查询胜过猜测，确认胜过假设；复用胜过重复造轮子。
测试胜过跳过，遵循规范胜过随意；谨慎胜过盲目。
如实记录不确定性与风险，主动学习并持续改进。

注意：
这是一个名为虎鲸笔记的插件，配有插件文档，文件夹名为：Plugin-docs

---

本项目在 `模块文档/` 目录下维护了各功能模块的详细技术文档。AI 在进行代码修改时必须遵守以下规则：

1. **修改前阅读文档**：修改代码前，请先阅读 `模块文档/` 目录下的相关文档，了解模块的设计思路和实现细节
2. **修改后更新文档**：修改代码后，请同步更新对应的模块文档，确保文档与代码保持一致
3. **新模块需配套文档**：添加新模块时，请在 `模块文档/` 目录下创建对应的文档文件
