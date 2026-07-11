# SRS 插件模块文档

本文件夹包含 SRS 插件各功能模块的详细文档。

## 文档列表

### 核心功能模块

1. **[SRS\_记忆算法.md](SRS_记忆算法.md)**

   - FSRS 算法实现和状态管理
   - 关键文件：`src/srs/algorithm.ts`、`src/srs/types.ts`

2. **[SRS\_数据存储.md](SRS_数据存储.md)**

   - 卡片数据的持久化和读取
   - 关键文件：`src/srs/storage.ts`

3. **[SRS\_卡片创建与管理.md](SRS_卡片创建与管理.md)**

   - 卡片的创建、转换和标签处理
   - 关键文件：`src/srs/cardCreator.ts`

4. **[SRS\_工具函数模块.md](SRS_工具函数模块.md)** ⭐ 新增
   - 2025-12-09 重构后的 6 个工具模块文档
   - 关键文件：`src/srs/panelUtils.ts`、`blockUtils.ts`、`cardCollector.ts`、`deckUtils.ts`、`cardCreator.ts`、`cardBrowser.ts`

### 用户界面模块

5. **[SRS\_卡片复习窗口.md](SRS_卡片复习窗口.md)**

   - 复习会话界面和交互
   - 关键文件：`src/components/SrsReviewSession*.tsx`、`SrsCardDemo.tsx`

6. **[SRS\_卡片浏览器.md](SRS_卡片浏览器.md)**

   - 卡片浏览和管理界面
   - 关键文件：`src/components/SrsCardBrowser.tsx`

7. **[SRS\_块渲染器.md](SRS_块渲染器.md)**
   - 编辑器内卡片的显示和交互
   - 关键文件：`src/components/SrsCardBlockRenderer.tsx`

### 基础设施模块

8. **[SRS\_插件入口与命令.md](SRS_插件入口与命令.md)**

   - 插件初始化和命令注册
   - 关键文件：`src/main.ts`（2025-12-09 已精简，核心逻辑拆分到子模块）

9. **[SRS\_复习队列管理.md](SRS_复习队列管理.md)**
   - 复习队列的构建和管理
   - 关键文件：`src/srs/cardCollector.ts`、`src/srs/reviewSessionManager.ts`

10. **[SRS\_事件通信.md](SRS_事件通信.md)** ⭐ 新增
   - 基于 Orca broadcasts 的跨组件事件通知
   - 关键文件：`src/srs/srsEvents.ts`

11. **[SRS 列表卡.md](SRS%20列表卡.md)** ⭐ 新增
   - 列表卡的创建、调度与辅助预览规则
   - 关键文件：`src/srs/listCardCreator.ts`、`src/srs/cardCollector.ts`、`src/components/ListCardReviewRenderer.tsx`

12. **[渐进阅读.md](渐进阅读.md)**
   - 渐进阅读数据模型、调度、会话语义与 **Orca Custom Panel 统一工作区**（渐进式筛选资料库 + 时间盒专注阅读）
   - 关联：`src/components/incremental-reading/workspace/*`、`src/srs/incremental-reading/*`

13. **[渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)**
   - 面向 SuperMemo 风格低压阅读的分阶段优化计划
   - 覆盖会话交互、断点、快捷键、过载治理、知识漏斗和验收指标

14. **[EPUB导入.md](EPUB导入.md)** ⭐ 新增
   - EPUB 解析、普通笔记导入、指纹去重、断点续传与向导入口
   - 关联：`src/importers/epub/*`、`src/components/epub-import/*`

15. **[渐进阅读_BookIR.md](渐进阅读_BookIR.md)** ⭐ 新增
   - 版本化 `ir.bookPlan`、分散/顺序排期、完成/跳过、整本与章节移出
   - 关联：`src/srs/book-ir/*`、`src/srs/bookIRCreator.ts`

### 协作与流程

16. **[仓库贡献指南.md](仓库贡献指南.md)** ⭐ 新增
   - 构建要求与模块文档同步规范
   - 关键文件：`AGENTS.md`、`package.json`

## 文档结构说明

每个模块文档采用统一的结构：

- **概述**：功能简介、用途、价值
- **技术实现**：核心组件、关键逻辑、数据流
- **用户交互**：使用场景、操作流程、界面元素
- **配置与选项**：参数、默认值、限制
- **扩展点**：可扩展功能、改进方向
- **测试验证**：功能测试点、边界情况
- **相关文件**：核心代码、组件、配置

## 文档编写原则

1. **简洁语言**：使用简短的句子和段落
2. **可视化辅助**：使用 Mermaid 图表展示流程和架构
3. **实例驱动**：提供具体使用示例和场景说明
4. **交叉引用**：使用相对路径链接相关文件和代码

## 更新记录

- 2025-12-08：创建模块文档结构
- 2026-01-29：新增仓库贡献与文档维护指南
