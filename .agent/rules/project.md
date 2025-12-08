---
trigger: always_on
---

**核心理念与原则**

> **简洁至上**：恪守 KISS（Keep It Simple, Stupid）原则，崇尚简洁与可维护性，避免过度工程化与不必要的防御性设计。
> **深度分析**：立足于第一性原理（First Principles Thinking）剖析问题，并善用工具以提升效率。
> **事实为本**：以事实为最高准则。若有任何谬误，恳请坦率斧正，助我精进。

**开发工作流**

> **渐进式开发**：通过多轮对话迭代，明确并实现需求。在着手任何设计或编码工作前，必须完成前期调研并厘清所有疑点。
> **结构化流程**：严格遵循“构思方案 → 提请审核 → 分解为具体任务”的作业顺序。
> 可以使用“Sequential Thinking” MCP 来促进你的思考；

**输出规范**

> **语言要求**：所有回复、思考过程及任务清单，均须使用中文。
> **固定指令**：`Implementation Plan, Task List and Thought in Chinese`

注意：
这是一个名为虎鲸笔记的插件，配有插件文档，文件夹名为：Plugin-docs

---

本项目在 `模块文档/` 目录下维护了各功能模块的详细技术文档。AI 在进行代码修改时必须遵守以下规则：

1. **修改前阅读文档**：修改代码前，请先阅读 `模块文档/` 目录下的相关文档，了解模块的设计思路和实现细节
2. **修改后更新文档**：修改代码后，请同步更新对应的模块文档，确保文档与代码保持一致
3. **新模块需配套文档**：添加新模块时，请在 `模块文档/` 目录下创建对应的文档文件

### 模块文档目录

| 文档                    | 对应模块                                                  |
| ----------------------- | --------------------------------------------------------- |
| `SRS_记忆算法.md`       | `src/srs/algorithm.ts`                                    |
| `SRS_数据存储.md`       | `src/srs/storage.ts`                                      |
| `SRS_卡片创建与管理.md` | `src/main.ts` 中的卡片创建函数                            |
| `SRS_卡片复习窗口.md`   | `src/components/SrsReviewSession*.tsx`、`SrsCardDemo.tsx` |
| `SRS_卡片浏览器.md`     | `src/components/SrsCardBrowser.tsx`                       |
| `SRS_块渲染器.md`       | `src/components/SrsCardBlockRenderer.tsx`                 |
| `SRS_插件入口与命令.md` | `src/main.ts` 中的 load/unload 函数                       |
| `SRS_复习队列管理.md`   | `src/main.ts` 和 `src/srs/reviewSessionManager.ts`        |
