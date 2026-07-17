# SRS 插件模块文档

本文件夹包含 SRS 插件各功能模块的中文技术文档。**以仓库当前代码为实现真相**；计划类文档须标明已落地 / 仍为计划。

> **全量对照同步日期：2026-07-13**（多 agent 按代码修订；禁止将本文索引中的路径当作臆造 API 使用）。

## 文档分类

| 类型 | 说明 |
|------|------|
| **实现文档** | 描述现行行为与代码路径 |
| **计划 / 路线** | 历史规划 + 状态对照（非实现手册） |
| **使用 / 排查** | 面向操作与排错 |
| **历史 / 摘要** | 修复报告、重复文档的精简版；以权威实现文档为准 |

## 文档列表

### 核心功能

1. **[SRS_记忆算法.md](SRS_记忆算法.md)**
   - FSRS 算法、状态、设置严格校验与统一运行时参数（F2-08）
   - 关联：`src/srs/algorithm.ts`、`src/srs/settings/reviewSettingsSchema.ts`、`src/srs/types.ts`

2. **[SRS_数据存储.md](SRS_数据存储.md)**
   - 卡片属性持久化；块 exists/missing/unknown；日志与会话进度等存储面
   - 关联：`src/srs/storage.ts`、`blockExistence.ts`、`deletedCardCleanup.ts`、`reviewLogStorage.ts`、`sessionProgressStorage.ts` 等

3. **[SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)**
   - 全卡种创建、标签、`_repr`、身份与转换入口
   - 关联：`src/srs/cardCreator.ts`、`cardTagDataBuilder.ts`、`cardIdentity.ts`、`topicCardCreator.ts`

4. **[SRS_工具函数模块.md](SRS_工具函数模块.md)**
   - 收集、卡组、面板、块工具等横切模块（**无** `cardBrowser.ts`；浏览侧见 Flash Home）
   - 关联：`panelUtils.ts`、`blockUtils.ts`、`cardCollector.ts`、`deckUtils.ts`、`flashcardHomeManager.ts` 等

### 卡种

5. **[SRS_填空卡.md](SRS_填空卡.md)** — Cloze fragment / 分天 SRS / 复习渲染
6. **[SRS_方向卡.md](SRS_方向卡.md)** — Direction 左右向、入队条件、渲染（实现文档，非设计草稿）
7. **[SRS 列表卡.md](SRS%20列表卡.md)** — List 创建、解锁评分、progression
8. **[SRS_选择题卡.md](SRS_选择题卡.md)** ⭐ 2026-07-13 新建
   - Choice 标签约定、乱序、提交门闩、选项统计
   - 关联：`choiceUtils.ts`、`choiceSubmitGate.ts`、`choiceAnswerStatistics.ts`、`choiceStatisticsStorage.ts`、`Choice*Renderer.tsx`

### 用户界面

9. **[SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)**
   - 会话 UI、块加载三态、评分门控、宿主 chrome、会话进度
   - 关联：`SrsReviewSession*.tsx`、`SrsCardDemo.tsx`、`reviewSessionBlockLoad.ts`、`reviewSessionActionGate.ts`、`sessionProgress*.ts`

10. **[SRS_卡片浏览器.md](SRS_卡片浏览器.md)**
    - **即 Flashcard Home**（主页 / 卡组 / 统计 / 困难卡）；**不存在** `SrsCardBrowser.tsx`
    - 关联：`SrsFlashcardHome.tsx`、`FlashcardDashboard.tsx`、`StatisticsView.tsx`、`DifficultCardsView.tsx`、`SrsFlashcardHomeRenderer.tsx`、`panels/SrsFlashcardHomePanel.tsx`、`flashcardHomeManager.ts`

11. **[SRS Flash Home 顶部统计卡片.md](SRS%20Flash%20Home%20顶部统计卡片.md)** — 卡组页三统计与 `calculateHomeStats`
12. **[SRS_困难卡片.md](SRS_困难卡片.md)** — 困难集合与 fixed repeat 专项复习
13. **[SRS_块渲染器.md](SRS_块渲染器.md)** — 编辑器内 `srs.*` 块渲染 vs 会话内 `*ReviewRenderer`
14. **[SRS 搜索快捷键.md](SRS%20搜索快捷键.md)** — 卡组搜索 / 复习 / IR 快捷键与门控
15. **[SRS_错误边界.md](SRS_错误边界.md)** — `SrsErrorBoundary` 挂载点与行为
16. **[SRS_卡组备注.md](SRS_卡组备注.md)** — **权威**；`SRS 卡组备注功能.md` 为历史摘要
17. **[SRS_卡组搜索.md](SRS_卡组搜索.md)** — **权威**；`SRS 卡组搜索.md` 为历史摘要

### 基础设施

18. **[SRS_插件入口与命令.md](SRS_插件入口与命令.md)**
    - `load` / `unload`（`runPluginUnloadSequence`）、业务 export
    - 关联：`src/main.ts`、`pluginUnloadSequence.ts`、`registry/*`、settings schemas

19. **[SRS_注册模块.md](SRS_注册模块.md)**
    - 命令 / UI / 渲染器 / 转换器 / 右键菜单 / panel 工具
    - 关联：`src/srs/registry/*`

20. **[SRS_复习队列管理.md](SRS_复习队列管理.md)**
    - 收集、descriptor（F2-01）、scope / budget / pending、repeat
    - 关联：`cardCollector.ts`、`reviewSessionDescriptor.ts`、`reviewSessionManager.ts`、`repeatReviewManager.ts` 等

21. **[SRS 动态复习队列.md](SRS%20动态复习队列.md)** — 动态队列与 resume 相关细节
22. **[SRS_事件通信.md](SRS_事件通信.md)**
    - `srs.cardGraded` / `srs.cardPostponed` / `srs.cardSuspended`；IR DOM 事件补充
    - 关联：`srsEvents.ts`、`reviewCardGrading.ts`

23. **[记忆排期推送.md](记忆排期推送.md)** — IR 分散/排队与过载方向（含已落地 vs 计划状态说明）

### 渐进阅读与导入

24. **[渐进阅读.md](渐进阅读.md)**
    - 统一工作区、书籍/网页来源树、章节 Topic 与 Extract 层级、时间盒、只读/混合、断点、快捷键、过载、漏斗、会话服务
    - 关联：`src/components/incremental-reading/**`、`src/srs/incremental-reading/*`、`incrementalReading*.ts`、`topicCardCreator.ts`、`topicIRMenu.ts`

25. **[渐进阅读_BookIR.md](渐进阅读_BookIR.md)**
    - `ir.bookPlan` v1、分散/顺序、章节 init、progression、整本/章节移出
    - 关联：`src/srs/book-ir/*`、`bookIRCreator.ts`

26. **[EPUB导入.md](EPUB导入.md)**
    - 解析、指纹、导入服务、向导、与普通笔记/BookIR 边界
    - 关联：`src/importers/epub/*`、`src/components/epub-import/*`

27. **[网页导入.md](网页导入.md)** ⭐ 2026-07-16 新建
    - Firecrawl 抓取、清洗、去重、原子写入、可选 Topic / 今天阅读、资料库「网页」来源归类
    - 关联：`src/importers/web/*`、`src/components/web-import/*`、`webImportSettingsSchema.ts`

28. **[渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)** — **计划文档**（顶部有落地对照）
29. **[渐进阅读_优化路线.md](渐进阅读_优化路线.md)** — **计划/路线**（顶部有状态对照）

### AI

30. **[SRS_AI模块.md](SRS_AI模块.md)** — Plan B：单次生成最终草稿、本地校验、预览确认与分组写入
31. **[AI智能制卡使用指南.md](AI智能制卡使用指南.md)** — AI 生成闪卡使用向导
32. **[AI_API_404错误排查指南.md](AI_API_404错误排查指南.md)** — 排查类

### 协作与历史

33. **[仓库贡献指南.md](仓库贡献指南.md)** — 构建与模块文档同步规范
34. **[React集成问题修复报告.md](React集成问题修复报告.md)** — 历史报告
35. **[问题经验.md](问题经验.md)** — 经验摘录

### 重复文档（勿当主文档）

| 文件 | 状态 |
|------|------|
| [SRS 卡组备注功能.md](SRS%20卡组备注功能.md) | 请参阅 [SRS_卡组备注.md](SRS_卡组备注.md) |
| [SRS 卡组搜索.md](SRS%20卡组搜索.md) | 请参阅 [SRS_卡组搜索.md](SRS_卡组搜索.md) |

## 文档结构说明（实现类）

建议结构（可按模块裁剪）：

- **概述** → **技术实现** → **用户交互** → **配置与选项** → **扩展点** → **测试验证** → **相关文件**

## 文档编写原则

1. **以代码为准**：现状描述；计划单列并标明状态
2. **路径真实**：`相关文件` 使用仓库相对路径；勿写本机绝对路径或已删除模块
3. **简洁中文** + 标识符保持代码原样
4. **交叉引用** 用相对 Markdown 链接
5. 行为变更后同步更新本文索引与对应模块文档

## 更新记录

- 2025-12-08：创建模块文档结构
- 2026-01-29：新增仓库贡献与文档维护指南
- **2026-07-13**：按当前代码全量对照更新；新建选择题文档；Flash Home 取代不存在的 CardBrowser 表述；计划类文档加落地状态；压缩方向卡等过时「实现计划」长文；修正事件名、卸载顺序、队列 due 判定等偏差
- **2026-07-13（审核修订）**：Choice 发现须 `#card`；删除不存在的 sibling 设置键；FSRS log 与 `ReviewLogEntry` 分列；Azure 认证限定；根文件名 `AGENTS.md`/`CLAUDE.md`；删除临时 `_doc_sync_brief.md`；Home 补 `hideableDisplayManager`
- **2026-07-16**：新增 [网页导入.md](网页导入.md)（Firecrawl MVP）
