# SRS 插件模块文档

本文件夹包含 SRS 插件各功能模块的中文技术文档。**以仓库当前代码为实现真相**；计划类文档须标明已落地 / 仍为计划。

> **全量对照同步日期：2026-07-19**（发布前加固：打包/EPUB 安全/HTTP 脱敏/困难卡分页；禁止将本文索引中的路径当作臆造 API 使用）。
>
> **索引增补：2026-07-26**（「今日学习」统一主页与可恢复入口已落地；见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md) / [SRS_插件入口与命令.md](SRS_插件入口与命令.md)）。
>
> **索引增补：2026-07-26（制卡 undo + 选择题命令 + IR Extract→Q&A/Direction）**：
> - [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)：`scanCardsFromTags` 兜底判空修；`cardCreationUndo` 对称撤销；`createChoiceCard`
> - [SRS_选择题卡.md](SRS_选择题卡.md)：斜杠「创建选择题」一步合规制卡
> - [渐进阅读.md](渐进阅读.md) / [渐进阅读_优化路线.md](渐进阅读_优化路线.md) / [渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)：Extract→Q&A/Direction 原子转化 landed

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

2. **[SRS_数据存储.md](SRS_数据存储.md)** ⭐ 2026-07-26 更新
   - 卡片属性持久化；块 exists/missing/unknown；日志与会话进度等存储面
   - `srs.state` 读取枚举白名单（脏值回退 `State.New` + warn）；`cleanupSrsProperties` / 选择题统计写删后失效 blockCache
   - 核心持久层已有直测：`src/srs/storage.test.ts`（三卡型 save→load 往返、属性名与 type code、缓存失效、reset、按前缀删除、解析回退、`ensureClozeSrsState` 守卫）
   - 关联：`src/srs/storage.ts`、`blockExistence.ts`、`deletedCardCleanup.ts`、`reviewLogStorage.ts`、`sessionProgressStorage.ts` 等

3. **[SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)** ⭐ 2026-07-26 更新
   - 全卡种创建、标签、`_repr`、身份与转换入口；制卡对称撤销（只删本次新增）；选择题专用创建
   - 关联：`src/srs/cardCreator.ts`、`choiceCardCreator.ts`、`registry/cardCreationUndo.ts`、`cardTagDataBuilder.ts`、`cardIdentity.ts`、`topicCardCreator.ts`

4. **[SRS_工具函数模块.md](SRS_工具函数模块.md)** ⭐ 2026-07-26 更新
   - 收集、卡组、块工具等横切模块（**无** `cardBrowser.ts`；浏览侧见 Flash Home；`panelUtils.ts` 已删除）
   - 关联：`blockUtils.ts`、`cardCollector.ts`、`deckUtils.ts`、`flashcardHomeManager.ts` 等

### 卡种

5. **[SRS_填空卡.md](SRS_填空卡.md)** ⭐ 2026-07-26 更新 — Cloze fragment / 分天 SRS / 复习渲染；`isClozeFragment` 共用谓词（兼容旧前缀）；创建仅新编号初始写入、已有编号 ensure 不覆盖
6. **[SRS_方向卡.md](SRS_方向卡.md)** ⭐ 2026-07-26 更新 — Direction 左右向、入队条件、渲染；direction 白名单双层防御（脏值回退 forward / `getDirectionList` 返回 `[]`）
7. **[SRS 列表卡.md](SRS%20列表卡.md)** — List 创建、解锁评分、progression
8. **[SRS_选择题卡.md](SRS_选择题卡.md)** ⭐ 2026-07-26 更新
   - Choice 标签约定、乱序、提交门闩、选项统计；斜杠「创建选择题」`createChoiceCardFromBlock`
   - 关联：`choiceCardCreator.ts`、`choiceUtils.ts`、`choiceSubmitGate.ts`、`choiceAnswerStatistics.ts`、`choiceStatisticsStorage.ts`、`Choice*Renderer.tsx`

### 用户界面

9. **[SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)**
   - 会话 UI、块加载三态、评分门控、宿主 chrome、会话进度
   - Basic 答案嵌入：CSS 精确隐藏卡根正文（无长期 MutationObserver）；显示答案后题目静态 `front`（单 live 卡根）；Tab/Enter 实例验证边界见该文档与 `问题经验.md`
   - 「卡片信息」面板统一为 `review-card/CardInfoPanel.tsx`（五渲染器共用；`showSchedulingDetails` prop）
   - 关联：`SrsReviewSession*.tsx`、`SrsCardDemo.tsx`、`review-card/EmbeddedReviewBlocks.tsx`、`review-card/BasicCardReviewRenderer.tsx`、`styles/srs-review.css`、`reviewSessionBlockLoad.ts`、`reviewSessionActionGate.ts`、`sessionProgress*.ts`；诊断 `src/test/diagnose-review-tab-focus.js`

10. **[SRS_卡片浏览器.md](SRS_卡片浏览器.md)** ⭐ 2026-07-26 更新
    - **即「今日学习」主页**（块/命令 ID 仍兼容 `flashcard-home` / `openFlashcardHome`）
    - 统一 remaining（SRS 日额度 + IR due）、预计分钟、10/20/30、开始/继续；resume 非队列快照
    - 次级：卡库三卡 + 卡组列表；全页：卡片列表 / 困难卡
    - 删除为**变体感知**（`deleteReviewCardBackendData`：仍有存活变体只删该变体前缀属性、保留 `#card`）；今日摘要经 deps 注入复用同轮 cards
    - 关联：`SrsFlashcardHome.tsx`、`flashcard-home/*`、`src/srs/todayLearning/*`、`styles/flashcard-home.css`

11. **[SRS Flash Home 顶部统计卡片.md](SRS%20Flash%20Home%20顶部统计卡片.md)** ⭐ 2026-07-26 收窄 — 仅维护三 `StatCard`（新卡/今日到期/积压）的 `calculateHomeStats` 计算口径；三卡已降级为次级「卡库概览」区，主页布局/主按钮/数据流以 [SRS_卡片浏览器.md](SRS_卡片浏览器.md) 为权威
12. **[SRS_困难卡片.md](SRS_困难卡片.md)** — 困难集合与 fixed repeat 专项复习（零引用门面 `getDifficultCardsForReview` 已于 2026-07-26 删除）
13. **[SRS_块渲染器.md](SRS_块渲染器.md)** ⭐ 2026-07-26 更新 — 编辑器内 `srs.*` 块渲染 vs 会话内 `*ReviewRenderer`；内联编辑保存不手写 store、写后失效缓存、`_repr` 元数据整体重赋值
14. **[SRS 搜索快捷键.md](SRS%20搜索快捷键.md)** ⭐ 2026-07-26 更新 — 卡组搜索 / 复习 / IR 快捷键与门控；IR 默认键一次性播种（`ir.defaultShortcutsSeeded`）
15. **[SRS_错误边界.md](SRS_错误边界.md)** — `SrsErrorBoundary` 挂载点与行为
16. **[SRS_卡组备注.md](SRS_卡组备注.md)** — **权威**；`SRS 卡组备注功能.md` 为历史摘要
17. **[SRS_卡组搜索.md](SRS_卡组搜索.md)** — **权威**；`SRS 卡组搜索.md` 为历史摘要

### 基础设施

18. **[SRS_插件入口与命令.md](SRS_插件入口与命令.md)** ⭐ 2026-07-26 更新
    - `load` / `unload`（`runPluginUnloadSequence`）、业务 export
    - unload flush 现为两段：复习日志 → 断点在途写入（`breakpointFlushOk`）；`cleanupDeletedCards` 定时器卸载时取消
    - 关联：`src/main.ts`、`pluginUnloadSequence.ts`、`registry/*`、settings schemas

19. **[SRS_注册模块.md](SRS_注册模块.md)** ⭐ 2026-07-26 重写过时部分
    - 命令 / UI / 渲染器 / 转换器 / 右键菜单 / panel 工具
    - Headbar：单一可见入口 `todayLearningButton` + 7 个对话框 mount + LEGACY 清理组（`headbarButtons.ts`）；命令/斜杠表对齐现行 label
    - `unregisterUIComponents` 已 async（3s 有界等待 AI 后台任务取消）
    - 关联：`src/srs/registry/*`（含 `headbarButtons.ts`）

20. **[SRS_复习队列管理.md](SRS_复习队列管理.md)** ⭐ 2026-07-26 更新
    - 收集、descriptor（F2-01）、scope / budget / pending、repeat
    - 查询块收集：`getQueryResults` DbId[]/Block[] 双形状归一化，失败抛 `QueryExecutionError`（不吞错）
    - `get-all-blocks` 兜底仅标签查询失败时触发；会话块创建校验 `insertBlock` 返回值（坏 ID 零落盘）
    - 关联：`cardCollector.ts`、`blockCardCollector.ts`、`reviewSessionDescriptor.ts`、`reviewSessionManager.ts`、`repeatReviewManager.ts` 等

21. **[SRS 动态复习队列.md](SRS%20动态复习队列.md)** — 动态队列与 resume 相关细节
22. **[SRS_事件通信.md](SRS_事件通信.md)** ⭐ 2026-07-26 更新
    - `srs.cardGraded` / `srs.cardPostponed` / `srs.cardSuspended`；IR DOM 事件补充
    - **模块级总线** `srsBroadcastBus`：Orca 每类型单 handler + 订阅者扇出；Flash Home 经总线订阅；unload `teardown`
    - 关联：`srsEvents.ts`、`srsBroadcastBus.ts`、`reviewCardGrading.ts`

23. **[记忆排期推送.md](记忆排期推送.md)** ⭐ 2026-07-26 更新 — IR 分散/排队、时间盒队列最终配额与诊断、本地日 seed、会话启动只读（B1）（含已落地 vs 计划状态说明）；§6.4 补混合会话 SRS 复习日额度扣减（`irMixedDailyBudget.ts`，日志失败 fail-closed 阻断装配）

### 渐进阅读与导入

24. **[渐进阅读.md](渐进阅读.md)** ⭐ 2026-07-26 更新
    - 统一工作区、主面板默认 Wide View 与宿主 chrome 清理、书籍/网页来源树、章节 Topic 与 Extract 层级、**已完成章节资料库保留**、**摘录近上下文 / 章节浏览**、**块下内联 AI 解释（v1）**、**重要性 UX**、**会话主栏 UX（下一篇→摘录|挖空→重要性→完成→⋯；`keep_extract` 挖空；完成主路径）**、时间盒队列策略（Topic 最低曝光/新 Extract 最终 cap/探索）、会话启动只读（B1）、只读/混合、主题模式、阅读模式展开、切卡滚动/断点、完成页今日累计、快捷键、资料库显式溢出推后、漏斗、会话服务
    - 2026-07-26：**Extract→Q&A / Direction 原子转化**（`convertExtractToQA` / `convertExtractToDirection`，与 Cloze 共用事务脚手架；会话 ⋯更多「问答」「方向」）
    - 2026-07-26：断点**交互捕获守卫**（`irBreakpointInteractiveCapture.ts`，切卡清交互 debounce、过期捕获丢弃）；收集索引路径批量 `get-blocks`（批 50/并发 4）、`preheatIrBlockCache` 仅后端块、`mapPool` 并发 8
    - 2026-07-26（低危批次）：兜底仅查询失败触发；索引失败可见告警；autoMark 重入守卫/世代计数；快捷键一次性播种（`ir.defaultShortcutsSeeded`）；卸载排空断点在途写入；会话块 `resolveBlock` 三态；`IncrementalReadingSessionDemo` 已删；两套块缓存不合并决策固化
    - 关联：`src/components/incremental-reading/**`（含 `IRActionBar.tsx`、`IRBlockExplain*.tsx`、`useIRBlockExplain.ts`、`IRCompleteChapterDialog.tsx`、`IRArchiveConfirmDialog.tsx`、`IRImportanceMenu.tsx`）、`src/srs/incremental-reading/*`、`src/srs/ai/aiBlockExplain.ts`、`incrementalReading*.ts`、`topicCardCreator.ts`、`topicIRMenu.ts`

25. **[渐进阅读_BookIR.md](渐进阅读_BookIR.md)** ⭐ 2026-07-26 更新
    - `ir.bookPlan` v1、分散/顺序、章节 init、progression（完成主路径 / skip 兼容）、整本/章节移出、完成本章后大纲保留「已完成」结构、顺序徽标与 toast 文案
    - 每轮 reconcile 每章恰一次 strict `get-block`；死门面 `setupBookIR` 已删除
    - 关联：`src/srs/book-ir/*`、`bookIRCreator.ts`

26. **[EPUB导入.md](EPUB导入.md)** ⭐ 2026-07-26 更新（repository backend-first）
    - 解析、指纹、导入服务、向导、与普通笔记/BookIR 边界；同 XHTML 多 fragment 逻辑章节展开与 DOM 切片
    - `epubBookRepository.getBlock` backend-first：manifest 写后读可信，resume 不再误判已导入章节
    - 关联：`src/importers/epub/*`、`src/components/epub-import/*`

27. **[网页导入.md](网页导入.md)** ⭐ 2026-07-24 更新（可选 AI 总结）
    - Firecrawl 抓取、本地主文提取（Readability）、标题/链接/代码清洗、预览摘要与告警、去重原子写入、可选 Topic / 今天阅读
    - 关联：`src/importers/web/*`、`src/components/web-import/*`、`webImportSettingsSchema.ts`

28. **[渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)** ⭐ 2026-07-26 更新 — **计划文档**（顶部有落地对照；Extract→Q&A/Direction 已标 landed）
29. **[渐进阅读_优化路线.md](渐进阅读_优化路线.md)** ⭐ 2026-07-26 更新 — **计划/路线**（P2 Extract→Q&A/Direction 已勾选 + 证据路径）

> **已移除错误索引**：原「渐进阅读_统一注意力队列设计.md」在仓库中**不存在**；其核心产品目标「今日学习统一入口」已在 2026-07-26 落地到 [SRS_卡片浏览器.md](SRS_卡片浏览器.md) / [渐进阅读.md](渐进阅读.md)，勿再声称该文件存在。

### AI

30. **[SRS_AI模块.md](SRS_AI模块.md)** ⭐ 2026-07-26 更新 — 制卡 + 块解释 + Quick AI 预览/直接写入/标签/合并结果块；提示词可绑 model；原生联网；`aiQuickInteract.ts` 拆为 `aiQuickPrompt.ts` + `aiQuickResultBlocks.ts` + 稳定入口 re-export
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

- **2026-07-26（cloze 撤销还原正文 + 广播总线）**：`createCloze` 快照 `originalContent`，`undoClozeCardCreation` 先 `setBlocksContent` 还原（防残留 fragment 编号错乱）；`srsBroadcastBus` 解决 Flash Home `already registered` 崩溃；见 [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)、[SRS_事件通信.md](SRS_事件通信.md)
- **2026-07-26（制卡 undo + 选择题命令 + IR Extract→Q&A/Direction）**：`scanCardsFromTags` 兜底判空修；`cardCreationUndo` 对称撤销（make/cloze/topic/list/choice）；斜杠「创建选择题」；Extract→Q&A/Direction 原子转化与会话更多菜单；见 [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)、[SRS_选择题卡.md](SRS_选择题卡.md)、[渐进阅读.md](渐进阅读.md)、[渐进阅读_优化路线.md](渐进阅读_优化路线.md)、[渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)
- **2026-07-26（低危批次文档同步）**：全库扫描兜底仅失败触发 + `insertBlock` 校验（[SRS_复习队列管理.md](SRS_复习队列管理.md)）；`panelUtils.ts`/`IncrementalReadingSessionDemo.tsx`/`getDifficultCardsForReview`/`setupBookIR`/`importWebArticle` 等死代码删除同步（[SRS_工具函数模块.md](SRS_工具函数模块.md)、[SRS_困难卡片.md](SRS_困难卡片.md)、[渐进阅读.md](渐进阅读.md)、[渐进阅读_优化路线.md](渐进阅读_优化路线.md)、[渐进阅读_BookIR.md](渐进阅读_BookIR.md)）；autoMark 守卫/索引告警/快捷键一次性播种/`resolveBlock` 三态/断点卸载排空/缓存不合并决策（[渐进阅读.md](渐进阅读.md)）；广播对称注册（[SRS_事件通信.md](SRS_事件通信.md)）；两段 flush + async UI 注销（[SRS_插件入口与命令.md](SRS_插件入口与命令.md)、[SRS_注册模块.md](SRS_注册模块.md)）；`srs.state`/direction 白名单（[SRS_数据存储.md](SRS_数据存储.md)、[SRS_方向卡.md](SRS_方向卡.md)）；Quick AI 三文件拆分（[SRS_AI模块.md](SRS_AI模块.md)）；内联编辑保存链路（[SRS_块渲染器.md](SRS_块渲染器.md)）；[问题经验.md](问题经验.md) 追加「IR 会话块瞬时故障误判」
- **2026-07-26（修复批文档同步）**：cloze 二次挖空/旧前缀（[SRS_填空卡.md](SRS_填空卡.md)）；IR 断点交互捕获守卫 + 收集批量化/预热（[渐进阅读.md](渐进阅读.md)）；epub repository backend-first（[EPUB导入.md](EPUB导入.md)）；查询块 `QueryExecutionError`（[SRS_复习队列管理.md](SRS_复习队列管理.md)、[SRS_插件入口与命令.md](SRS_插件入口与命令.md)）；删除变体感知 + 摘要复用 cards（[SRS_卡片浏览器.md](SRS_卡片浏览器.md)）；[SRS_注册模块.md](SRS_注册模块.md) 重写过时的 Headbar/命令/斜杠表；[SRS Flash Home 顶部统计卡片.md](SRS%20Flash%20Home%20顶部统计卡片.md) 收窄为 StatCard 计算口径；复习「卡片信息」面板统一 `CardInfoPanel`（[SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)）；`storage.test.ts` 直测持久层；[问题经验.md](问题经验.md) 新增 6 条
- **2026-07-26**：「今日学习」统一主页 + 可恢复入口 + Headbar 单入口；见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)、[SRS_插件入口与命令.md](SRS_插件入口与命令.md)、[SRS_数据存储.md](SRS_数据存储.md)、[渐进阅读.md](渐进阅读.md)；删除不存在的「统一注意力队列设计」错误索引
- **2026-07-25**：IR 定位续读精度——折叠 caret 不再覆盖视口；`viewportAnchor.topOffsetPx`（schema v2）；恢复改确定性 scrollTop 对齐 + 几何稳定后释放抑制；`chapter_browse` 禁止捕获；见 [渐进阅读.md](渐进阅读.md)
- 2025-12-08：创建模块文档结构
- 2026-01-29：新增仓库贡献与文档维护指南
- **2026-07-13**：按当前代码全量对照更新；新建选择题文档；Flash Home 取代不存在的 CardBrowser 表述；计划类文档加落地状态；压缩方向卡等过时「实现计划」长文；修正事件名、卸载顺序、队列 due 判定等偏差
- **2026-07-13（审核修订）**：Choice 发现须 `#card`；删除不存在的 sibling 设置键；FSRS log 与 `ReviewLogEntry` 分列；Azure 认证限定；根文件名 `AGENTS.md`/`CLAUDE.md`；删除临时 `_doc_sync_brief.md`；Home 补 `hideableDisplayManager`
- **2026-07-16**：新增 [网页导入.md](网页导入.md)（Firecrawl MVP）
- **2026-07-17**：渐进阅读主面板默认启用 Wide View，并清理 Bullet、Query Tabs 与 Query Views 宿主 chrome
- **2026-07-18**：渐进阅读专注会话新增「绿茶 / 书卷 / 文献」主题模式，默认「绿茶」，并通过 `localStorage` 持久化用户选择
- **2026-07-18**：网页导入强化本地主文提取、标题后缀去重、安全链接文本、代码/遗留排版与预览诊断（见 [网页导入.md](网页导入.md)、[问题经验.md](问题经验.md)）
- **2026-07-20**：Basic 答案区编辑会话加固（第一阶段）——移除答案区长期 MutationObserver/DOM style 重写，CSS 只藏卡根 main；显示答案后题目静态 `front` 单 live 根；诊断 `src/test/diagnose-review-tab-focus.js`；**自动化 ≠ Orca 实例 Tab/Enter 已修复**；见 [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)、[问题经验.md](问题经验.md)
- **2026-07-20**：SRS 复习嵌入块默认展开——题目/答案/Cloze/选择题预览等 `initiallyCollapsed={false}`，原笔记折叠时复习仍可见题目；见 [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)、[问题经验.md](问题经验.md)
- **2026-07-19**：IR 时间盒队列 Batch A——`topicQuotaPercent` 映射 Topic 最低曝光、新 Extract 最终比例、Topic floor 诊断、探索受预算/配额约束、本地日 seed；见 [渐进阅读.md](渐进阅读.md)、[记忆排期推送.md](记忆排期推送.md)。算法升级总计划仍见未落地 `记忆算法优化.md`
- **2026-07-19**：IR 调度 Batch B1——会话创建/打开/刷新只读装配（移除 `loadReadingQueue` 中 `applyAutoPostpone`）；focus 冻结到最终队列首位；`enableAutoDefer` 仅控制资料库显式溢出按钮；见 [渐进阅读.md](渐进阅读.md)、[记忆排期推送.md](记忆排期推送.md)
- **2026-07-19**：IR 调度 Batch B1 第二轮——collector `{ readOnly: true }` 跳过 `ensureIRState`；会话主收集/fallback/focus 均显式只读；默认路径保留惰性 ensure；见 [渐进阅读.md](渐进阅读.md)
- **2026-07-19**：IR 调度 Batch B2——priority 单一真相与 cardType clamp；sibling queueDelay 只影响首次 due；嵌套 Extract `sourceTopicId`；postpone 只移 due；overflow 真实成功/失败；见 [渐进阅读.md](渐进阅读.md)、[记忆排期推送.md](记忆排期推送.md)、[问题经验.md](问题经验.md)
- **2026-07-19**：Batch B2 第一轮 Codex 修补——overflow 保留 position；create 先 invalidate 再 ensure；sibling 硬 cap/同源/截断 warn；`irOverflowDefer` 拆分；见 HANDOFF
- **2026-07-19**：发布前安全收口——HTTP 无流响应 fail-closed、EPUB 解压后取消检查、AI 生成卸载取消；发布脚本增加严格 `release:ready` 与 tag-only workflow
- **2026-07-19**：渐进阅读 `IRWorkspaceShell` 挂接既有 `attachHideableDisplayManager`，隐藏 `.orca-hideable-hidden` 时强制 `display:none` 并在恢复/卸载时还原；见 [渐进阅读.md](渐进阅读.md)
- **2026-07-19**：渐进阅读修复——阅读模式面板内默认展开（`initiallyCollapsed=false` + DOM expand helper）；切卡先归零再恢复断点（`resolveVerticalScrollOwner` 解析真实 host 滚动祖先）；完成页「今日学习完毕」+ `irDailyStatsStorage` 按 repo/plugin/本地日累计；见 [渐进阅读.md](渐进阅读.md)
- **2026-07-19**：已完成章节资料库保留——完成本章 strip Topic IR 不删笔记；资料库书下保留「已完成」上下文节点；摘录耐久 `ir.sourceTopicId` + 书章节时 `ir.sourceBookId`；顺序 plan outcomes / 分散合成上下文；「未关联章节的摘录」仅无父章时；见 [渐进阅读.md](渐进阅读.md)、[渐进阅读_BookIR.md](渐进阅读_BookIR.md)
- **2026-07-19**：摘录近上下文 / 章节浏览 landed——`extract_focus` 默认父近上下文 + hide-self；`chapter_browse` 单正文 + locate 高亮 + 动作栏「返回」；断点 preview 永不存 browseBlockId；见 [渐进阅读.md](渐进阅读.md)
- **2026-07-19**：重要性 UX——用户可见「重要性」（存储 `ir.priority`）；建书/导入 setup 三档 20/50/80（`importanceSetupOptions`）；阅读主栏「重要性」相对微调（±15 / 设回 50，`IRImportanceMenu`，`Alt+P`）；推后移出主栏（更多 + Shift+Enter）；见 [渐进阅读.md](渐进阅读.md)、[渐进阅读_BookIR.md](渐进阅读_BookIR.md)、[EPUB导入.md](EPUB导入.md)
- **2026-07-19**：IR 会话 UX——主栏 **下一篇 → 摘录|挖空 → 重要性 → 完成 → ⋯**；挖空=`keep_extract`（不 strip IR、不离队）；完成统一文案（顺序章对话框 / 非顺序确认）；更多无归档/跳过；顺序 toast 与资料库徽标（在读/未解锁/已完成/已跳过）；见 [渐进阅读.md](渐进阅读.md)、[渐进阅读_BookIR.md](渐进阅读_BookIR.md)
- **2026-07-19**：Flash Home UI 简化——单页主页（`HomeSummaryBar` + `DeckListView`）；删除 Dashboard / 学习统计页；三卡标签改为 **新卡/今日到期/积压**；困难卡返回 `home`；见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)、[SRS Flash Home 顶部统计卡片.md](SRS%20Flash%20Home%20顶部统计卡片.md)、[SRS_困难卡片.md](SRS_困难卡片.md)
- **2026-07-19**：Flash Home Deck 下钻卡片列表视觉帧——`CardFrame` 左状态色条、`.srs-card-list-frame` 托盘间距、`cardStatus.ts` + `styles/flashcard-home.css`；标签 **新卡**；见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)
