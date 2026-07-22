# SRS 插件模块文档

本文件夹包含 SRS 插件各功能模块的中文技术文档。**以仓库当前代码为实现真相**；计划类文档须标明已落地 / 仍为计划。

> **全量对照同步日期：2026-07-19**（发布前加固：打包/EPUB 安全/HTTP 脱敏/困难卡分页；禁止将本文索引中的路径当作臆造 API 使用）。
>
> **索引增补：2026-07-23**（新增统一注意力队列详细设计；仅为计划，不改变当前实现状态）。

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
   - Basic 答案嵌入：CSS 精确隐藏卡根正文（无长期 MutationObserver）；显示答案后题目静态 `front`（单 live 卡根）；Tab/Enter 实例验证边界见该文档与 `问题经验.md`
   - 关联：`SrsReviewSession*.tsx`、`SrsCardDemo.tsx`、`review-card/EmbeddedReviewBlocks.tsx`、`review-card/BasicCardReviewRenderer.tsx`、`styles/srs-review.css`、`reviewSessionBlockLoad.ts`、`reviewSessionActionGate.ts`、`sessionProgress*.ts`；诊断 `src/test/diagnose-review-tab-focus.js`

10. **[SRS_卡片浏览器.md](SRS_卡片浏览器.md)**
    - **即 Flashcard Home**（单页：上摘要三卡 + 下卡组列表；次级全页：卡片列表 / 困难卡）；**不存在** `SrsCardBrowser.tsx`
    - 已删除学习统计页与 `FlashcardDashboard`；`ViewMode = home | card-list | difficult-cards`
    - Deck 下钻列表：`CardFrame` 左色条 + `.srs-card-list-frame` 间距分离；`cardStatus.ts`（新卡/今日/积压/未来）；样式 `styles/flashcard-home.css`
    - 关联：`SrsFlashcardHome.tsx`、`flashcard-home/FlashHomePage.tsx`、`flashcard-home/HomeSummaryBar.tsx`、`flashcard-home/DeckListView.tsx`、`flashcard-home/DeckRow.tsx`、`flashcard-home/StatCard.tsx`、`flashcard-home/CardListView.tsx`、`flashcard-home/CardListItem.tsx`、`flashcard-home/CardFrame.tsx`、`flashcard-home/cardStatus.ts`、`styles/flashcard-home.css`、`DifficultCardsView.tsx`、`SrsFlashcardHomeRenderer.tsx`、`panels/SrsFlashcardHomePanel.tsx`、`flashcardHomeManager.ts`

11. **[SRS Flash Home 顶部统计卡片.md](SRS%20Flash%20Home%20顶部统计卡片.md)** — 主页 `HomeSummaryBar` 三卡（新卡/今日到期/积压）与 `calculateHomeStats`
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

23. **[记忆排期推送.md](记忆排期推送.md)** — IR 分散/排队、时间盒队列最终配额与诊断、本地日 seed、会话启动只读（B1）（含已落地 vs 计划状态说明）

### 渐进阅读与导入

24. **[渐进阅读.md](渐进阅读.md)**
    - 统一工作区、主面板默认 Wide View 与宿主 chrome 清理、书籍/网页来源树、章节 Topic 与 Extract 层级、**已完成章节资料库保留**、**摘录近上下文 / 章节浏览**、**块下内联 AI 解释（v1）**、**重要性 UX**、**会话主栏 UX（下一篇→摘录|挖空→重要性→完成→⋯；`keep_extract` 挖空；完成主路径）**、时间盒队列策略（Topic 最低曝光/新 Extract 最终 cap/探索）、会话启动只读（B1）、只读/混合、主题模式、阅读模式展开、切卡滚动/断点、完成页今日累计、快捷键、资料库显式溢出推后、漏斗、会话服务
    - 关联：`src/components/incremental-reading/**`（含 `IRActionBar.tsx`、`IRBlockExplain*.tsx`、`useIRBlockExplain.ts`、`IRCompleteChapterDialog.tsx`、`IRArchiveConfirmDialog.tsx`、`IRImportanceMenu.tsx`）、`src/srs/incremental-reading/*`、`src/srs/ai/aiBlockExplain.ts`、`incrementalReading*.ts`、`topicCardCreator.ts`、`topicIRMenu.ts`

25. **[渐进阅读_BookIR.md](渐进阅读_BookIR.md)**
    - `ir.bookPlan` v1、分散/顺序、章节 init、progression（完成主路径 / skip 兼容）、整本/章节移出、完成本章后大纲保留「已完成」结构、顺序徽标与 toast 文案
    - 关联：`src/srs/book-ir/*`、`bookIRCreator.ts`

26. **[EPUB导入.md](EPUB导入.md)** ⭐ 2026-07-19 更新
    - 解析、指纹、导入服务、向导、与普通笔记/BookIR 边界
    - 关联：`src/importers/epub/*`、`src/components/epub-import/*`

27. **[网页导入.md](网页导入.md)** ⭐ 2026-07-19 更新
    - Firecrawl 抓取、本地主文提取（Readability）、标题/链接/代码清洗、预览摘要与告警、去重原子写入、可选 Topic / 今天阅读
    - 关联：`src/importers/web/*`、`src/components/web-import/*`、`webImportSettingsSchema.ts`

28. **[渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)** — **计划文档**（顶部有落地对照）
29. **[渐进阅读_优化路线.md](渐进阅读_优化路线.md)** — **计划/路线**（顶部有状态对照）
30. **[渐进阅读_统一注意力队列设计.md](渐进阅读_统一注意力队列设计.md)** ⭐ 2026-07-23 新增 — **产品目标 / 技术设计 / 分阶段开发计划，尚未落地**
   - 定义“每天只需打开今日学习”的目标体验；逐项标记当前能力与差距
   - 规划 frozen daily descriptor、真实跨会话日额度、Future Load Calendar、全局 Extract/章节削峰、adaptive selection、mixed SRS 权威预算、每日一次积压治理与动态 A-Factor 的实施顺序
   - 关联：现行实现见 `渐进阅读.md` / `渐进阅读_BookIR.md` / `记忆排期推送.md`；算法候选见 `记忆算法优化.md`

### AI

31. **[SRS_AI模块.md](SRS_AI模块.md)** ⭐ 2026-07-22 更新 — 制卡 + 块解释 + Quick AI 多选暂存/统一保留；提示词可绑专用 model；原生联网 + 思考强度
32. **[AI智能制卡使用指南.md](AI智能制卡使用指南.md)** — AI 生成闪卡使用向导
33. **[AI_API_404错误排查指南.md](AI_API_404错误排查指南.md)** — 排查类

### 协作与历史

34. **[仓库贡献指南.md](仓库贡献指南.md)** — 构建与模块文档同步规范
35. **[React集成问题修复报告.md](React集成问题修复报告.md)** — 历史报告
36. **[问题经验.md](问题经验.md)** — 经验摘录

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

- **2026-07-23**：新增 [渐进阅读_统一注意力队列设计.md](渐进阅读_统一注意力队列设计.md)——记录“今日学习”统一注意力流、真实每日额度、冻结 descriptor、Future Load Calendar、全局削峰、等待补偿、mixed SRS 权威预算、积压治理和动态 A-Factor 的详细计划；**未改变当前实现状态**
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
