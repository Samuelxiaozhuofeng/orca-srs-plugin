# Project Context

## Purpose

虎鲸标记（Orca SRS Plugin）是一款为虎鲸笔记（Orca Notes）打造的间隔重复记忆系统（SRS）插件，旨在帮助用户在笔记中高效制作和复习闪卡。该插件采用科学的 FSRS 记忆算法，支持多种卡片类型，提供沉浸式复习体验，并集成 AI 智能制卡功能。

**核心目标：**
- 将笔记中的知识点高效转化为可复习的闪卡
- 通过科学的间隔重复算法优化记忆效率
- 提供流畅、专业的复习体验
- 支持 AI 辅助快速制卡

## Tech Stack

### 核心技术
- **TypeScript 5.2+** - 主要编程语言，严格模式开启
- **React 18.2+** - UI 组件框架（使用 JSX）
- **Valtio 1.13+** - 状态管理库（peer dependency）
- **Vite 5.2+** - 构建工具和开发服务器

### 构建和开发工具
- **@vitejs/plugin-react-swc** - React 快速刷新和 SWC 编译
- **rollup-plugin-external-globals** - 外部依赖处理（React、Valtio 作为全局变量）
- **Vitest 4.0+** - 单元测试框架
- **@vitest/coverage-v8** - 测试覆盖率工具
- **cross-env** - 跨平台环境变量设置

### 核心依赖
- **ts-fsrs 5.2+** - Free Spaced Repetition Scheduler 算法实现（与 Anki 兼容）
- **fast-check** - 属性测试库（用于测试）

### 平台集成
- 虎鲸笔记（Orca Notes）插件 API
- 支持 OpenAI 兼容的 AI 服务接口

## Project Conventions

### Code Style

**命名约定：**
- TypeScript 文件使用 `camelCase.ts` 或 `PascalCase.tsx`（React 组件）
- 类型定义使用 `PascalCase`
- 函数和变量使用 `camelCase`
- 常量使用 `UPPER_SNAKE_CASE`

**代码组织：**
- 所有源代码位于 `src/` 目录
- React 组件集中在 `src/components/` 和 `src/panels/`
- 核心业务逻辑在 `src/srs/` 目录下按功能模块组织
- 类型定义统一在 `src/srs/types.ts` 和 `src/orca.d.ts`

**注释和文档：**
- 所有代码注释、文档、提交信息必须使用中文
- 函数和模块需要 JSDoc 风格的中文注释
- 重要逻辑需要行内注释说明原因和意图
- `模块文档/` 目录维护各功能模块的详细技术文档

**TypeScript 配置：**
- 严格模式启用（`strict: true`）
- 使用 `ESNext` 语法和模块系统
- JSX 使用 `react-jsx` 转换
- 启用 `noFallthroughCasesInSwitch`

### Architecture Patterns

**模块化设计：**
- **注册模块**（`src/srs/registry/`）：统一管理命令、UI组件、渲染器、转换器、右键菜单的注册和注销
- **管理器模式**：使用专门的 Manager 处理特定功能（如 `flashcardHomeManager.ts`、`repeatReviewManager.ts`）
- **工具模块**：按功能拆分工具函数（如 `clozeUtils.ts`、`directionUtils.ts`、`deckUtils.ts`）
- **存储层**：`storage.ts` 处理数据持久化，`reviewLogStorage.ts` 管理复习日志

**React 组件模式：**
- 组件以功能命名，如 `SrsCardDemo.tsx`、`FlashcardDashboard.tsx`
- 使用 `SrsErrorBoundary.tsx` 进行错误边界处理
- 渲染器组件（Renderer）负责与 Orca 平台集成
- 使用 Hooks（如 `useReviewShortcuts.ts`）封装可复用逻辑

**插件生命周期：**
- `main.ts` 导出 `load()` 和 `unload()` 函数
- 加载时统一注册所有功能模块
- 卸载时统一清理注册的资源

**FSRS 算法集成：**
- `algorithm.ts` 封装 ts-fsrs 库
- 使用 `SrsState` 类型统一记忆状态表示
- 支持四级评分：Again、Hard、Good、Easy

**AI 服务集成：**
- `src/srs/ai/` 目录包含 AI 相关功能
- `aiService.ts` 处理 OpenAI 兼容 API 调用
- `aiCardCreator.ts` 实现 AI 制卡逻辑
- `aiSettingsSchema.ts` 定义 AI 配置项

### Testing Strategy

**测试框架：**
- 使用 Vitest 进行单元测试和集成测试
- 测试文件命名为 `*.test.ts`，与源文件同目录

**现有测试文件：**
- `blockCardCollector.test.ts` - 块卡片收集器测试
- `difficultCardsManager.test.ts` - 困难卡片管理器测试
- `repeatReviewManager.test.ts` - 重复复习管理器测试
- `reviewLogStorage.test.ts` - 复习日志存储测试
- `statisticsManager.test.ts` - 统计管理器测试

**测试覆盖目标：**
- 总体覆盖率目标 ≥ 90%
- 核心算法和数据处理逻辑必须全面覆盖
- 使用 fast-check 进行属性测试

**质量要求：**
- 所有测试必须通过才能合并代码
- 新功能必须包含相应测试
- 关键路径和异常分支必须覆盖

### Git Workflow

**分支策略：**
- 主分支：`main`
- 开发使用 feature 分支，合并前 PR 审查

**提交规范：**
- 所有提交信息必须使用中文
- 提交信息应清晰描述变更内容和原因
- 禁止包含占位代码或未完成功能

**构建和发布：**
- 使用 `npm run build` 构建生产版本
- 构建输出到 `dist/` 目录
- 禁用一切 CI/CD 自动化，所有构建、测试、发布必须人工操作

**重要约束：**
- **未经用户明确要求，绝对禁止执行 git commit、push、分支操作等**
- AI 辅助开发时，修改代码后必须同步更新 `模块文档/` 中的相关文档

## Domain Context

### SRS 领域知识

**间隔重复学习（Spaced Repetition）：**
- 基于遗忘曲线理论，在最佳时间点复习以巩固记忆
- FSRS 算法追踪每张卡片的记忆稳定度和难度
- 动态调整复习间隔，优化学习效率

**卡片类型：**
1. **Basic 基础卡**：父块为题目，子块为答案，适用于问答式知识点
2. **Cloze 填空卡**：挖空文本中的关键词，适用于定义和概念记忆
3. **Direction 方向卡**：双向问答（正向/反向/双向），适用于词汇对应和因果关系

**核心概念：**
- **Deck（牌组）**：卡片的分组单位，可设置备注
- **Review（复习）**：根据到期时间安排的复习任务
- **Grade（评分）**：Again（忘记）、Hard（困难）、Good（良好）、Easy（简单）
- **Bury（埋藏）**：将卡片推迟到明天
- **Suspend（暂停）**：暂停卡片不参与复习

### 虎鲸笔记集成

**块系统（Block System）：**
- 虎鲸笔记基于块（Block）组织内容
- 每个块有唯一的 `DbId`
- 块支持标签、属性、引用等元数据

**插件 API：**
- `orca.plugins.*` - 插件注册和设置 API
- `orca.block.*` - 块操作 API
- `orca.panel.*` - 面板管理 API
- `orca.ui.*` - UI 组件 API

**卡片标识：**
- 使用 `#card` 标签标识闪卡块
- 使用块属性 `牌组` 关联到牌组块
- 通过块 ID 实现卡片与原始笔记的双向跳转

## Important Constraints

### 技术约束

1. **外部依赖限制：**
   - React 和 Valtio 作为 peer dependencies，不打包到插件中
   - 构建输出为 ES module 格式
   - 使用 `rollup-plugin-external-globals` 将 React 和 Valtio 作为全局变量

2. **构建约束：**
   - 必须通过 TypeScript 编译检查（零报错）
   - 禁用 CSS 代码分割（`cssCodeSplit: false`）
   - 使用内联动态导入（`inlineDynamicImports: true`）

3. **兼容性要求：**
   - 需与虎鲸笔记平台 API 兼容
   - 遵循虎鲸笔记的插件规范

### 业务约束

1. **数据安全：**
   - 所有用户数据存储在虎鲸笔记本地
   - AI 服务调用需要用户提供 API Key
   - 不泄露密钥或内部链接

2. **用户体验：**
   - 复习界面必须流畅，支持键盘快捷键
   - 快捷键与 Anki 保持一致，降低学习成本
   - 错误必须有友好的提示和边界处理（使用 `SrsErrorBoundary`）

3. **数据完整性：**
   - 复习记录必须可靠存储
   - 支持复习日志的长期追踪和统计分析

### 开发约束

1. **代码质量：**
   - 遵循 SOLID、KISS、DRY、YAGNI 原则
   - 禁止占位代码或 NotImplemented
   - 所有代码必须有中文注释和文档

2. **变更管理：**
   - 默认采取破坏性改动，主动清理过时代码
   - 修改代码后必须同步更新 `模块文档/`
   - 使用 OpenSpec 工作流管理重大变更（参见 `openspec/AGENTS.md`）

3. **测试要求：**
   - 新功能必须包含单元测试
   - 测试覆盖率目标 ≥ 90%
   - 关键业务逻辑必须有属性测试（fast-check）

## External Dependencies

### 虎鲸笔记平台
- **用途**：插件宿主环境，提供块系统、面板系统、UI 组件等基础能力
- **API**：全局 `orca` 对象（类型定义见 `src/orca.d.ts`）
- **依赖方式**：运行时提供

### OpenAI 兼容 AI 服务
- **用途**：AI 智能制卡功能
- **支持的服务**：OpenAI、DeepSeek、Ollama 等
- **配置**：用户提供 API Key、API URL、Model
- **默认端点**：`https://api.openai.com/v1/chat/completions`
- **默认模型**：`gpt-3.5-turbo`

### ts-fsrs 算法库
- **用途**：提供 FSRS 间隔重复算法实现
- **版本**：5.2.3
- **与 Anki 兼容**：算法和评分系统与 Anki 高度兼容

### 文档和资源
- **模块文档**：`模块文档/` 目录包含各功能模块的详细技术文档
- **插件文档**：`Plugin-docs` 文件夹（虎鲸笔记插件开发文档）
- **OpenSpec 规范**：`openspec/` 目录用于管理变更提案和规范

---

## OpenSpec 工作流集成

本项目使用 OpenSpec 进行规范化的变更管理。在进行以下类型的变更时，必须先创建 OpenSpec 提案：

- 添加新功能或能力
- 进行破坏性变更（API、数据模式等）
- 架构或设计模式的重大调整
- 性能或安全相关的重要优化

详细流程参见 `openspec/AGENTS.md`。

---

**最后更新：** 2025-12-24
**项目状态：** 活跃开发中
