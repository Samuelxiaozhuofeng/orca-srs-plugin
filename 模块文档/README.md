# SRS 插件模块文档

本文件夹包含 SRS 插件各功能模块的中文技术文档。**以仓库当前代码为实现真相**；计划类文档须标明已落地 / 仍为计划。

> **全量对照同步日期：2026-07-19**（发布前加固：打包/EPUB 安全/HTTP 脱敏/困难卡分页；禁止将本文索引中的路径当作臆造 API 使用）。
>
> **索引增补：2026-08-10（摘录阅读 AI 快捷制卡源文）**：
> - [SRS_AI模块.md](SRS_AI模块.md)：`isExcludedAiSourceBlock` 允许 IR Topic/Extract/hybrid 作源文；纯 SRS `#card` 与 AI 预览根仍排除
> - [问题经验.md](问题经验.md)：摘录界面误报「请选中文本…」根因与回归
>
> **索引增补：2026-08-10（块解释请求状态与选区边界）**：
> - [渐进阅读.md](渐进阅读.md)：举例/反驳独立 controller；跨块选区可见提示并停止解释
>
> **索引增补：2026-08-10（渐进阅读批次 A 可信性修复）**：
> - [渐进阅读.md](渐进阅读.md)：完成 Topic 后 `postCompleteQuizHold` 零 `ir.*` 写回；Extract 创建失败清理半成品；collect `partial` 非阻断提示 + 重新加载
>
> **索引增补：2026-08-09（选择题身份统一 type=choice）**：
> - [SRS_选择题卡.md](SRS_选择题卡.md) / [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md) / [SRS_工具函数模块.md](SRS_工具函数模块.md) / [SRS_数据存储.md](SRS_数据存储.md)：去掉独立 `#choice` 标签；`extractCardType` 只读 `#card type=choice`；创建/撤销不再写/摘 `#choice`
>
> **索引增补：2026-08-09（选择题泄题 CSS 真因 + 题面富文本恢复）**：
> - [SRS_选择题卡.md](SRS_选择题卡.md) / [SRS_块渲染器.md](SRS_块渲染器.md)：选项未揭晓隐藏 `.orca-tags`（真机 `data-name`）；题面暂留 `BlockTextPreview` 纯文本，富文本待单独立项
> - [问题经验.md](问题经验.md)：真机 DOM `data-name` / 误用 `BlockTextPreview` 记录
>
> **索引增补：2026-08-09（选择题洗牌冻结 / 方向卡 undo / 收集兜底失败可见）**：
> - [SRS_选择题卡.md](SRS_选择题卡.md)：`resolveFrozenShuffledOptions` 按 cardKey 冻结
> - [SRS_方向卡.md](SRS_方向卡.md) / [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)：`undoDirectionCardCreation` 对称撤销
> - [SRS_复习队列管理.md](SRS_复习队列管理.md)：`collectSrsBlocks` 双失败 throw，不冒充空结果
> - [问题经验.md](问题经验.md)：上述回归条目
>
> **索引增补：2026-08-09（删除卡片闭环：结构 + 进度）**：
> - [SRS_卡片浏览器.md](SRS_卡片浏览器.md) / [SRS_填空卡.md](SRS_填空卡.md) / [SRS_方向卡.md](SRS_方向卡.md) / [SRS 列表卡.md](SRS%20列表卡.md) / [SRS_数据存储.md](SRS_数据存储.md)：删除 = 解包/降级 content + 清 `srs.*`；List 清全部直接子块；确认文案更新
> - [问题经验.md](问题经验.md)：变体只清属性会复活；List 子块孤儿进度
>
> **索引增补：2026-08-09（IR 可配置紧凑原生选区工具栏）**：
> - [渐进阅读.md](渐进阅读.md)：选区工具栏 allow-list + Topic/Extract 过滤；主栏去掉摘录/挖空；一键解释进工具栏；折叠选区时完整浮层无闪烁退出
> - [SRS_AI模块.md](SRS_AI模块.md)：服务设置新增「渐进阅读」Tab；plugin data `ir.selectionToolbar`
>
> **索引增补：2026-07-26**（「今日学习」统一主页与可恢复入口已落地；见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md) / [SRS_插件入口与命令.md](SRS_插件入口与命令.md)）。
>
> **索引增补：2026-07-26（制卡 undo + 选择题命令 + IR Extract→Q&A/Direction）**：
> - [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)：`scanCardsFromTags` 兜底判空修；`cardCreationUndo` 对称撤销；`createChoiceCard`
> - [SRS_选择题卡.md](SRS_选择题卡.md)：斜杠「创建选择题」一步合规制卡
> - [渐进阅读.md](渐进阅读.md) / [渐进阅读_优化路线.md](渐进阅读_优化路线.md) / [渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)：Extract→Q&A/Direction 原子转化 landed
>
> **索引增补：2026-07-29（#card 标签 schema 预初始化）**：
> - [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)：`ensureCardTagProperties` 幂等创建 alias + 补属性；并发共享 Promise；失败可重试；`tagPropertyInit.test.ts`
> - [SRS_插件入口与命令.md](SRS_插件入口与命令.md)：`load` 后台调用；失败不阻断插件加载
> - [渐进阅读_BookIR.md](渐进阅读_BookIR.md)：Book IR 提交前依赖 schema；全新用户资料库可见章节 Topic
>
> **索引增补：2026-07-28（Home/IR 块三态与 insertBlock 校验 + 扫描兜底 + 列表卡缓存 + React key）**：
> - [SRS_卡片浏览器.md](SRS_卡片浏览器.md)：Flash Home `resolveBlock` 三态；`insertBlock` 有限正数校验；列表 React key 统一 `cardKeyFromReviewCard`
> - [渐进阅读.md](渐进阅读.md)：IR 会话块 `insertBlock` ID 校验（与复习会话块对齐）
>
> **索引增补：2026-08-05（AI 跨块选区升级为 DFS 前序连续区间）**：
> - [SRS_AI模块.md](SRS_AI模块.md)：`resolveSelectedTextFromCursor` 跨块解析从「同父相邻兄弟」升级为 **前序连续区间**——兄弟链 / 父子链（P+子块）/ 跨分支统一（`irRichExtract.ts` 新增 `resolvePreOrderChain` / `isAncestorOf`）；祖先↔后代跨度结果锚点挂祖先 P（纯兄弟仍挂阅读方向末块）；`cross_parent` 错误语义移除，`non_sibling` 改为「无法解析为连续的块区间」
>
> **索引增补：2026-08-01（Extract 摘录处理建议 AI 虚拟块）**：
> - [SRS_AI模块.md](SRS_AI模块.md)：新增请求类型 `extract-coach`（标签「摘录处理建议」）；只读顾问，有界上下文 ≤8 块 / ≤8000 字符，严格 JSON 协议 + `cloze.quote` 接地校验，会话缓存 ≤50 条
> - [渐进阅读.md](渐进阅读.md)：Extract 正文底部 AI 处理思路虚拟块（`enableExtractCoach` 默认关；仅 `extract_focus` 显示；不写库 / 不改排期 / 不建卡）
> - [SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)：`scanCardsFromTags` 仅 throw 走全库兜底；列表卡 `srs.isCard` 写后 `invalidateBlockCache`
>
> **索引增补：2026-08-01（章末小测）**：
> - [渐进阅读_章末小测.md](渐进阅读_章末小测.md)：Topic 完成后 / 更多菜单 → 本章全文单选小测；**Custom Panel 专注答题** + 块侧紧凑入口；揭晓后扁平意图条（加入复习 / 问 AI / 原文）；「原文」优先左侧 IR 阅读面板内定位，无阅读面板才开/复用右侧侧栏；可选简答/填空入队；与 `#choice` 路径独立
>
> **索引增补：2026-08-02（章末小测生成偏好进服务设置面板）**：
> - [渐进阅读_章末小测.md](渐进阅读_章末小测.md)：新增「生成偏好」小节——「AI / Firecrawl 服务设置」→「章末小测」Tab 可配默认出题数量（3–30）、题目语言（auto/zh/en/ja）、自定义提示词（≤500）、专用模型；持久化 plugin data `ai.chapterQuiz`（`chapterQuizSettingsSchema.ts`），`insertChapterQuizBlock` / `generateChapterQuizQuestions` 未显式传参时读取
> - [SRS_AI模块.md](SRS_AI模块.md)：设置项表格 + 面板 Tab 清单同步
>
> **索引增补：2026-08-03（章末小测 P0 UX：题数选择 / 不知道 / 这是猜的 / 即时理解结果 / 生成进度 / 轻量 offer）**：
> - [渐进阅读_章末小测.md](渐进阅读_章末小测.md)：启动可选 5/10/15 题（时长估算、「按设置 N 题」兼容、默认跟偏好且不改偏好）；生成三阶段进度（读取本章→生成→整理）+ 自动重试「第 N/4 次尝试」（block/panel 同步）；生成后一次性稳定打乱题目/选项；完成后续 offer 改轻量；「测验本身不进复习」同屏提示
>
> **索引增补：2026-08-03（章末小测 P1 学习闭环）**：
> - [渐进阅读_章末小测.md](渐进阅读_章末小测.md)：首轮分类（确定答对/猜对或不确定/答错/跳过）+ 弱项冻结；修复轮（选项重排、X/Y、不改首轮）；动作小结替换正确率 hero；整理薄弱点 Panel 子视图顺序制卡；定向反馈字段；键盘与 aria-live
>
> **索引增补：2026-08-02（复习设置迁独立服务面板「复习」页）**：
> - [SRS_记忆算法.md](SRS_记忆算法.md) / [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)：复习页增加 Pass-Fail 与「显示下次复习时间」两项 UI 开关（默认关）；helper 仍为 `reviewServiceSettings.ts`
> - [SRS_AI模块.md](SRS_AI模块.md)：面板标题「服务与算法设置」；Tab「复习」与 draft 含 `review`（非权重表单）
> - [SRS_插件入口与命令.md](SRS_插件入口与命令.md) / [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)：schema 与 `reviewServiceSettings` 路径同步
>
> **索引增补：2026-08-02（Azure TTS MVP）**：
> - [SRS_TTS语音.md](SRS_TTS语音.md)：Azure Speech REST；选区单条 / Flash Home Basic 批量 / `srs.tts.manifest` / 复习手动播放；默认 Multilingual 音色（自动语种）；plugin data `tts.connection`；不自动播放、不批量非 Basic
>
> **索引增补：2026-08-02（暂停卡恢复闭环）**：
> - [SRS_卡片浏览器.md](SRS_卡片浏览器.md)：新增「已暂停」全页视图与逐行取消暂停；同轮收集分 active/suspended，统计只用 active
> - [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md) / [SRS_复习队列管理.md](SRS_复习队列管理.md)：Cloze、Direction、IO 按单个变体暂停，旧整块暂停可迁移恢复
>
> **索引增补：2026-08-03（P1 卡片浏览器增强）**：
> - [SRS_卡片浏览器.md](SRS_卡片浏览器.md)：CardListView 正文搜索、状态/标签/卡型/来源牌组筛选、稳定排序、cardKey 多选；批量暂停/激活/重置/改牌组；`cardBrowserQuery` / `cardBrowserBatchActions`；默认 status=active 不混入暂停卡
>
> **索引增补：2026-08-03（浏览器返修）**：
> - [SRS_卡片浏览器.md](SRS_卡片浏览器.md)：全库 `deckResolutionCards` 改牌组；partial 保留 failed 选择 + 独立 alert；`applyLoaded(showSpinner=false)` rethrow；筛选/批量 controls 拆分；复习 CTA 仅看 active due

## 文档分类

| 类型 | 说明 |
|------|------|
| **实现文档** | 描述现行行为与代码路径 |
| **计划 / 路线** | 历史规划 + 状态对照（非实现手册） |
| **使用 / 排查** | 面向操作与排错 |
| **历史 / 摘要** | 修复报告、重复文档的精简版；以权威实现文档为准 |

## 文档列表

### 核心功能

1. **[SRS_记忆算法.md](SRS_记忆算法.md)** ⭐ 2026-08-02 更新
   - FSRS 算法、状态、设置严格校验与统一运行时参数（F2-08）；运行时实例启用 `enable_fuzz`（削峰分散到期，确定性播种保证预览=正式一致）
   - 独立服务面板 **复习** 页：每日新卡/复习上限 + 目标保留率；权重/最大间隔无 UI；原生 schema 不含每日额度与 FSRS 五项；helper：`reviewServiceSettings.ts`
   - 关联：`src/srs/algorithm.ts`、`src/srs/settings/reviewSettingsSchema.ts`、`src/srs/settings/reviewServiceSettings.ts`、`src/srs/reviewSessionBudget.ts`、`src/components/AIServiceSettingsDialog.tsx`、`src/srs/types.ts`

2. **[SRS_数据存储.md](SRS_数据存储.md)** ⭐ 2026-08-09 更新
   - 卡片属性持久化；块 exists/missing/unknown；日志与会话进度等存储面
   - `srs.state` 读取枚举白名单（脏值回退 `State.New` + warn）；`cleanupSrsProperties` / 选择题统计写删后失效 blockCache
   - `cleanupOldLogs` 整月删除边界：下月 1 日 00:00（1-based month），禁止月末 00:00 误删
   - 核心持久层已有直测：`src/srs/storage.test.ts`（三卡型 save→load 往返、属性名与 type code、缓存失效、reset、按前缀删除、解析回退、`ensureClozeSrsState` 守卫）
   - 关联：`src/srs/storage.ts`、`blockExistence.ts`、`deletedCardCleanup.ts`、`reviewLogStorage.ts`、`sessionProgressStorage.ts` 等

3. **[SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)** ⭐ 2026-08-09 更新
   - 全卡种创建、标签、`_repr`、身份与转换入口；制卡对称撤销（只删本次新增）；选择题专用创建（身份仅 `#card type=choice`）
   - `scanCardsFromTags`：成功空结果不兜底；仅标签查询 throw 才 `get-all-blocks`；双失败可见 error
   - 列表 / 方向 / 选择题写 `srs.isCard` 或 `setRefData` 成功后 `invalidateBlockCache`；`setCardTagRefData` 缺块/缺 `#card` throw
   - **`ensureCardTagProperties`**：缺失 `card` alias 时创建标签页并补齐 schema；全属性成功才缓存；并发共享 Promise；load + 制卡/Book IR 兜底
   - 关联：`src/srs/cardCreator.ts`、`listCardCreator.ts`、`choiceCardCreator.ts`、`directionUtils.ts`、`cardTagRefData.ts`、`tagPropertyInit.ts`、`registry/cardCreationUndo.ts`、`cardTagDataBuilder.ts`、`cardIdentity.ts`、`topicCardCreator.ts`

4. **[SRS_工具函数模块.md](SRS_工具函数模块.md)** ⭐ 2026-08-09 更新
   - 收集、卡组、块工具等横切模块（**无** `cardBrowser.ts`；浏览侧见 Flash Home；`panelUtils.ts` 已删除）
   - `extractCardType` 只读 `#card.type`（含 choice，无 `#choice` 优先分支）
   - 关联：`blockUtils.ts`、`cardCollector.ts`、`deckUtils.ts`、`flashcardHomeManager.ts` 等

4b. **[SRS_TTS语音.md](SRS_TTS语音.md)** ⭐ 2026-08-02 新增
   - Azure Speech REST TTS MVP：服务设置、选区生成、Flash Home Basic 批量、manifest、复习手动播放
   - 关联：`src/srs/tts/*`、`AIServiceSettingsDialog.tsx`、`CardListView.tsx`、`BasicCardReviewRenderer.tsx`

### 卡种

5. **[SRS_填空卡.md](SRS_填空卡.md)** ⭐ 2026-08-02 更新 — Cloze fragment / 首次 due / 复习渲染；`srs.cN.suspended` 单编号暂停与恢复
6. **[SRS_图片遮罩.md](SRS_图片遮罩.md)** ⭐ 2026-08-02 更新 — Image Occlusion：矩形/同号多区组交互 / `io:{id}:cN` / 每图复习模式 / compact+pending FSRS；`srs.cN.suspended` 单遮罩暂停随编号迁移
7. **[SRS_方向卡.md](SRS_方向卡.md)** ⭐ 2026-08-09 更新 — Direction 左右向、入队条件、渲染；白名单门禁；`srs.forward|backward.suspended` 单方向暂停；`srs.isCard` 写后 `invalidateBlockCache`
8. **[SRS 列表卡.md](SRS%20列表卡.md)** — List 创建、解锁评分、progression
9. **[SRS_选择题卡.md](SRS_选择题卡.md)** ⭐ 2026-08-09 更新
   - 身份：`#card type=choice`（不再写/认独立 `#choice`）；乱序、提交门闩、选项统计；斜杠「创建选择题」`createChoiceCardFromBlock`；`setRefData type=choice` 写后 `invalidateBlockCache`
   - 关联：`choiceCardCreator.ts`、`choiceUtils.ts`、`choiceSubmitGate.ts`、`choiceAnswerStatistics.ts`、`choiceStatisticsStorage.ts`、`Choice*Renderer.tsx`

### 用户界面

> ⭐ **[SRS_UI设计规范.md](SRS_UI设计规范.md)** — 2026-07-27 新增，**全插件 UI 的唯一设计基准**（Apple HIG）。
> 基准来自 Flash Home，令牌实现在 `src/styles/srs-design-tokens.css`（由 `src/main.ts` 最先导入）。
> 改动本节任何面板的样式前必须先读它：禁止硬编码圆角/间距/阴影/动效裸值，禁止用 React 内联样式做视觉表现（运行时动态几何量除外）。

9. **[SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)** ⭐ 2026-08-02 更新
   - 会话 UI、块加载三态、评分门控、宿主 chrome、会话进度
   - **视觉层已对齐 [SRS_UI设计规范.md](SRS_UI设计规范.md)**：269 处内联样式迁移到 `srs-review.css` 的 `srs-review-*` / `srs-grade-*` 类，仅保留 7 处运行时几何量；评分按钮语义色 Again=danger / Hard=warning / Good=primary / Easy=success；`srs-review.css` 顶部宿主 DOM 兼容选择器原样保留
   - Basic 答案嵌入：题面始终 live 卡根（宿主 inline 渲染保留），答案区逐个渲染卡根子块（不挂卡根整树、无隐藏正文 CSS、无长期 MutationObserver）；Tab/Enter 实例验证边界见该文档与 `问题经验.md`
   - 「卡片信息」面板统一为 `review-card/CardInfoPanel.tsx`（五渲染器共用；`showSchedulingDetails` prop）
   - 关联：`SrsReviewSession*.tsx`、`SrsCardDemo.tsx`、`review-card/EmbeddedReviewBlocks.tsx`、`review-card/BasicCardReviewRenderer.tsx`、`styles/srs-review.css`、`reviewSessionBlockLoad.ts`、`reviewSessionActionGate.ts`、`sessionProgress*.ts`；诊断 `src/test/diagnose-review-tab-focus.js`

10. **[SRS_卡片浏览器.md](SRS_卡片浏览器.md)** ⭐ 2026-08-03 更新
    - **即「今日学习」主页**（块/命令 ID 仍兼容 `flashcard-home` / `openFlashcardHome`）
    - 统一 remaining（SRS 日额度 + IR due）、预计分钟、开始/继续；**日额度队列**（无 10/20/30）；受信任 remaining 显式降级（mixed / 独立 SRS / 只读 IR）
    - Flash Home 块：`resolveBlock` 三态（throw 不新建）；`insertBlock` 有限正数校验；列表/困难卡 React key 用 `cardKeyFromReviewCard`
    - **卡片浏览器 P1**：搜索 front/back/标签；状态（默认 active）/标签/卡型/来源牌组筛选；稳定排序；cardKey 多选与批量暂停·激活·重置·改牌组；与 TTS 批量选择隔离
    - 从 Home 点开始/继续进入 IR：`openInCurrentPanel` 替换 Home；已有 IR 面板则聚焦后关闭 Home
    - resume 非队列快照；统一 `kind:"ir"` marker 在纯 SRS 剩余时也可继续；装配成功后才写 IR marker
    - 次级：卡库三卡 + 卡组列表；全页：卡片列表 / 困难卡
    - 「已暂停」全页视图：逐 `cardKey` 恢复；Cloze/Direction/IO 不误伤同块其它变体
    - 删除为**变体感知**（`deleteReviewCardBackendData`：仍有存活变体只删该变体前缀属性、保留 `#card`）；今日摘要经 deps 注入复用同轮 cards
    - 关联：`SrsFlashcardHome.tsx`、`flashcard-home/*`、`flashcardHomeManager.ts`、`src/srs/todayLearning/*`（含 `todayLearningLaunch.ts`）、`styles/flashcard-home.css`

11. **[SRS Flash Home 顶部统计卡片.md](SRS%20Flash%20Home%20顶部统计卡片.md)** ⭐ 2026-07-26 收窄 — 仅维护三 `StatCard`（新卡/今日到期/积压）的 `calculateHomeStats` 计算口径；三卡已降级为次级「卡库概览」区，主页布局/主按钮/数据流以 [SRS_卡片浏览器.md](SRS_卡片浏览器.md) 为权威
12. **[SRS_困难卡片.md](SRS_困难卡片.md)** — 困难集合与 fixed repeat 专项复习（零引用门面 `getDifficultCardsForReview` 已于 2026-07-26 删除）
13. **[SRS_块渲染器.md](SRS_块渲染器.md)** ⭐ 2026-08-09 更新 — 编辑器内 `srs.*` 块渲染 vs 会话内 `*ReviewRenderer`；Cloze / Direction 实际 fragment 检测并禁止破坏性行内编辑；Basic 保存行为不变
14. **[SRS 搜索快捷键.md](SRS%20搜索快捷键.md)** ⭐ 2026-07-26 更新 — 卡组搜索 / 复习 / IR 快捷键与门控；IR 默认键一次性播种（`ir.defaultShortcutsSeeded`）
15. **[SRS_错误边界.md](SRS_错误边界.md)** — `SrsErrorBoundary` 挂载点与行为
16. **[SRS_卡组备注.md](SRS_卡组备注.md)** — **权威**；`SRS 卡组备注功能.md` 为历史摘要
17. **[SRS_卡组搜索.md](SRS_卡组搜索.md)** — **权威**；`SRS 卡组搜索.md` 为历史摘要

### 基础设施

18. **[SRS_插件入口与命令.md](SRS_插件入口与命令.md)** ⭐ 2026-07-29 更新
    - `load` / `unload`（`runPluginUnloadSequence`）、业务 export
    - load 后台 `ensureCardTagProperties`（失败 notify 不阻断）；unload flush 两段：复习日志 → 断点在途写入（`breakpointFlushOk`）；`cleanupDeletedCards` 定时器卸载时取消
    - 关联：`src/main.ts`、`pluginUnloadSequence.ts`、`registry/*`、settings schemas

19. **[SRS_注册模块.md](SRS_注册模块.md)** ⭐ 2026-08-09 更新
    - 命令 / UI / 渲染器 / 转换器 / 右键菜单 / panel 工具
    - `contextMenuRegistry`：hooks 从 `window.React` 解构，无 runtime `import "react"`
    - Headbar：单一可见入口 `todayLearningButton` + 7 个对话框 mount + LEGACY 清理组（`headbarButtons.ts`）；命令/斜杠表对齐现行 label
    - `unregisterUIComponents` 已 async（3s 有界等待 AI 后台任务取消）
    - 关联：`src/srs/registry/*`（含 `headbarButtons.ts`）

20. **[SRS_复习队列管理.md](SRS_复习队列管理.md)** ⭐ 2026-08-02 更新
    - 收集、descriptor（F2-01）、scope / budget / pending、repeat
    - 查询块收集：`getQueryResults` DbId[]/Block[] 双形状归一化，失败抛 `QueryExecutionError`（不吞错）
    - `get-all-blocks` 兜底仅标签查询失败时触发；会话块创建校验 `insertBlock` 返回值（坏 ID 零落盘）
    - normal 收集/队列排除暂停卡；显式 include 路径供 Home 同轮分流 active/suspended
    - 关联：`cardCollector.ts`、`blockCardCollector.ts`、`reviewSessionDescriptor.ts`、`reviewSessionManager.ts`、`repeatReviewManager.ts` 等

21. **[SRS 动态复习队列.md](SRS%20动态复习队列.md)** ⭐ 2026-07-26 更新 — 动态队列与 resume 相关细节；短期重学窗口 5→15 分钟；已评分卡到期后允许回流本会话（去重范围收窄为未处理部分 + pending 身份）
22. **[SRS_事件通信.md](SRS_事件通信.md)** ⭐ 2026-07-26 更新
    - `srs.cardGraded` / `srs.cardPostponed` / `srs.cardSuspended`；IR DOM 事件补充
    - **模块级总线** `srsBroadcastBus`：Orca 每类型单 handler + 订阅者扇出；Flash Home 经总线订阅；unload `teardown`
    - 关联：`srsEvents.ts`、`srsBroadcastBus.ts`、`reviewCardGrading.ts`

23. **[记忆排期推送.md](记忆排期推送.md)** ⭐ 2026-07-30 更新 — **IR Topic/Extract due-only 分散 Phase 0+1**（`computeDispersalOffsetDays`，priority 窗口、随机不进 `ir.intervalDays`）；**IR 源记忆卡首次 due 1–14 天分散**（`initialDuePolicy`，仅新建）；§6.4 统一推送；排队/auto-postpone/迟到补偿/老化

### 渐进阅读与导入

24. **[渐进阅读.md](渐进阅读.md)** ⭐ 2026-08-10 更新 — **块解释并发状态隔离与单块选区边界**（举例/反驳互不取消；跨块选区可见提示）；可配置紧凑原生选区工具栏（服务设置「渐进阅读」Tab；摘录/挖空/一键解释在工具栏；主栏 下篇→重要→完成→⋯）；due-only 分散 Phase 0+1 短记；`syncCardTagPriority` 失败 `console.error` 不打断 `saveIRState`；Extract 摘录处理建议 AI 虚拟块；章末小测见专文；
24a. **[渐进阅读_章末小测.md](渐进阅读_章末小测.md)** ⭐ 2026-08-03 更新 — Topic 章末小测；**P0 UX**：5/10/15 题选择、生成三阶段+重试计数、稳定打乱、完成后续轻量 offer；**P1 学习闭环**：首轮分类/修复轮/动作小结/整理薄弱点/定向反馈；Custom Panel + 共享生成 / live 同步；制卡落点=sourceBlockId 子块；键盘与 aria-live；panel nav A→B
    - **会话块 insertBlock ID 校验**（2026-07-28）：与复习会话块相同的有限正数校验；坏 ID 零落盘、不污染内存指针
    - **今日学习统一推送 + 移除时间盒**（2026-07-27）：阅读条目与记忆卡在**同一会话、同一面板**交错推送，不再「先读完 IR 再回首页点复习另开面板」。**10/20/30 时间盒整体删除**，队列长度改由每日上限决定（`UNLIMITED_TIME_BUDGET_MINUTES`）；纳入新卡、阅读队列为空产出纯复习队列、交错不丢条目、完成页「再学一轮」原地重装、IR 日额度不再被复习吃掉；删除 `mixedLearningReviewRatio` 与 resume 时长字段
    - **mixed 复习卡块可用性**（2026-07-27）：`IRMixedReviewPane` 挂载前 `preflightMixedReviewCard`（`writeToState` + missing/unknown 三态），修复 state miss 永久「加载中」；`SrsCardDemo` 改为纯渲染器
    - **mixed 复习卡 UI 聚焦**（2026-07-27）：刷到普通记忆卡时取消阅读纸张主题 / 收起「渐进阅读」顶栏 chrome，中性 SRS 表面 +「记忆复习」精简顶栏
    - **统一交付修复**（2026-07-27）：Again/Hard **按真实 FSRS due**  pending 回流（800ms 只离卡不立刻入队，`irMixedPendingDue` / `useIRMixedPendingDueQueue`）；**部分退出**同步结算 IR 日统计（分段 delta + sessionId 轮换，不双计）；首页 **受信任侧降级**（`decideTodayLearningLaunch`）；活跃计时 pause（资料库 `display:none` 不计时）；统一 ir marker 识别纯 SRS 剩余
    - **误点回撤 + 文末防呆**（2026-07-27）：会话内**单步**「撤销上一篇」（`performNext` 回传动作前 IR 快照 → `undoPerformNext` 整体写回真回滚排期，队列按原下标回插并按快照修正断点/新卡判定；入口=会话头部按钮 + `Alt+U` + **「下一篇」成功通知 action**（ref 接到最新 `handleUndoNext`，失效再点可见 info）；当前篇一旦有写库动作即失效，完成页不提供）；读到文末（触底或一屏装下全文）且停留 ≥4s 时「下一篇」先确认「以后再复习 / 完成，移出队列 / 取消」，完成分支仍走既有二次确认，本会话处理一次后不再弹。新增 `irNextUndo.ts` / `irEndOfContentGate.ts` / `useIRReadingEndZone.ts` / `IREndOfContentDialog.tsx`
    - **视觉层已对齐 [SRS_UI设计规范.md](SRS_UI设计规范.md)**（2026-07-27）：新增「视觉规范（Apple HIG 基线）」小节；`ir-workspace.css` 全面令牌化——52 处裸圆角（4/5/6/7/8/9/10/12/14/16px 十档）归一到 `--srs-radius-*` 六档阶梯、18 处自定义阴影收敛为 `--srs-shadow-1/2/hero/overlay/pill`、37 处裸秒数动效改 `--srs-duration-*`；排版走 `--srs-text-*` / `--srs-weight-*` 且统计数字统一 `tabular-nums`；徽章/筛选 chip/次级按钮/托盘/空态按规范统一；IR 组件 ~150 处视觉内联样式迁移到 CSS 类（仅保留动作栏与正文宽度等运行时几何量）。**边界**：专注阅读保持块宿主（面板宿主深树死循环，见 [问题经验.md](问题经验.md)）；`*-host-chrome-managed` 作用域选择器原样保留；正文宽度仍是用户偏好（`irReaderWidthStorage`），未被 `--srs-measure` 覆盖；阅读纸张主题（mint/sepia/academic）改为每主题一份 `--ir-paper-*` 调色板（无法由 Orca 主题变量派生）
    - 2026-07-27（死代码清理）：`IRCardList.tsx` / `IRStatistics.tsx`（零引用旧平面列表/统计 UI）已删，随之删除 `incrementalReadingManagerUtils.ts` 中仅服务于它们的 `groupIRCardsByDate` / `calculateIRStats` / `IRCardStats`，以及 `ir-workspace.css` 中仅服务于它们的 `.ir-cardlist-*` / `.ir-stats-card-*`（41 条规则）；资料库分组由 `workspace/irLibraryFilters.ts` 承担，`getIRDateGroup` / `IR_GROUP_ORDER` / `IRCardGroup` 仍在使用
    - 统一工作区、主面板默认 Wide View 与宿主 chrome 清理、书籍/网页来源树、章节 Topic 与 Extract 层级、**已完成章节资料库保留**、**摘录近上下文 / 章节浏览**、**块下内联 AI 解释（v1）**、**重要性 UX**、**会话主栏 UX（下篇→重要→完成→⋯；摘录|挖空在原生选区工具栏；`keep_extract` 挖空；完成主路径）**、**选区工具栏 allow-list + Topic/Extract 过滤**、时间盒队列策略（Topic 最低曝光/新 Extract 最终 cap/探索）、会话装配只读（B1）、只读/混合、主题模式、阅读模式展开、切卡滚动/断点、完成页今日累计、快捷键、资料库显式溢出推后、漏斗、会话服务
    - 2026-07-26（P0 低压调度优化）：已读间隔**迟到补偿**（`computeLatenessEffectiveBase`）；队列排序改**加性得分老化**（终结低优先级饥饿）+ 探索改**真随机采样**；`applyAutoPostpone` **接回主路径**（用户显式启动会话触发、当日一次守卫、反复推迟降权、会话头部 banner + 撤销，`runSessionStartAutoPostpone.ts`）
    - 2026-07-26：**Extract→Q&A / Direction 原子转化**（`convertExtractToQA` / `convertExtractToDirection`，与 Cloze 共用事务脚手架；会话 ⋯更多「问答」「方向」）
    - 2026-07-26：断点**交互捕获守卫**（`irBreakpointInteractiveCapture.ts`，切卡清交互 debounce、过期捕获丢弃）；收集索引路径批量 `get-blocks`（批 50/并发 4）、`preheatIrBlockCache` 仅后端块、`mapPool` 并发 8
    - 2026-07-26（低危批次）：兜底仅查询失败触发；索引失败可见告警；autoMark 重入守卫/世代计数；快捷键一次性播种（`ir.defaultShortcutsSeeded`）；卸载排空断点在途写入；会话块 `resolveBlock` 三态；`IncrementalReadingSessionDemo` 已删；两套块缓存不合并决策固化
    - 关联：`src/components/incremental-reading/**`（含 `IRActionBar.tsx`、`IRBlockExplain*.tsx`、`useIRBlockExplain.ts`、`IRCompleteChapterDialog.tsx`、`IRArchiveConfirmDialog.tsx`、`IREndOfContentDialog.tsx`、`IRImportanceMenu.tsx`）、`src/srs/incremental-reading/*`（含 `irSelectionToolbarController.ts`）、`src/srs/settings/irSelectionToolbarSettings.ts`、`src/srs/ai/aiBlockExplain.ts`、`incrementalReading*.ts`、`topicCardCreator.ts`、`topicIRMenu.ts`

25. **[渐进阅读_BookIR.md](渐进阅读_BookIR.md)** ⭐ 2026-07-29 更新
    - `ir.bookPlan` v1、分散/顺序、章节 init、progression（完成主路径 / skip 兼容）、整本/章节移出、完成本章后大纲保留「已完成」结构、顺序徽标与 toast 文案
    - 每轮 reconcile 每章恰一次 strict `get-block`；死门面 `setupBookIR` 已删除
    - 建书前 `ensureCardTagProperties`（load 预初始化 + 弹窗兜底），全新仓库资料库可发现章节 Topic
    - 关联：`src/srs/book-ir/*`、`bookIRCreator.ts`

26. **[EPUB导入.md](EPUB导入.md)** ⭐ 2026-07-27 更新（章节粒度 auto：章+小节不展开 / chapterPlan 续传）
    - 解析、指纹、导入服务、向导、与普通笔记/BookIR 边界；同 XHTML 多 fragment 逻辑章节展开与 DOM 切片
    - `epubBookRepository.getBlock` backend-first：manifest 写后读可信，resume 不再误判已导入章节
    - **视觉层已对齐 [SRS_UI设计规范.md](SRS_UI设计规范.md)**（2026-07-27）：向导 47 处内联样式迁移到 `ai-card-dialog.css` 尾部的 `.srs-import-dialog*` / `.srs-chapter-selector*` / `.srs-import-progress*` / `.srs-import-result*` 类，仅保留进度条宽度 1 处运行时几何量
    - 关联：`src/importers/epub/*`、`src/components/epub-import/*`

27. **[网页导入.md](网页导入.md)** ⭐ 2026-07-24 更新（可选 AI 总结）
    - Firecrawl 抓取、本地主文提取（Readability）、标题/链接/代码清洗、预览摘要与告警、去重原子写入、可选 Topic / 今天阅读
    - **视觉层已对齐 [SRS_UI设计规范.md](SRS_UI设计规范.md)**（2026-07-27）：对话框 23 处内联样式迁移到 `.srs-import-dialog*` / `.srs-web-preview*` 类
    - 关联：`src/importers/web/*`、`src/components/web-import/*`、`webImportSettingsSchema.ts`

28. **[渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)** ⭐ 2026-07-26 更新 — **计划文档**（顶部有落地对照；Extract→Q&A/Direction 已标 landed）
29. **[渐进阅读_优化路线.md](渐进阅读_优化路线.md)** ⭐ 2026-07-26 更新 — **计划/路线**（P2 Extract→Q&A/Direction 已勾选 + 证据路径）

> **已移除错误索引**：原「渐进阅读_统一注意力队列设计.md」在仓库中**不存在**；其核心产品目标「今日学习统一入口」已在 2026-07-26 落地到 [SRS_卡片浏览器.md](SRS_卡片浏览器.md) / [渐进阅读.md](渐进阅读.md)，勿再声称该文件存在。

### AI

30. **[SRS_AI模块.md](SRS_AI模块.md)** ⭐ 2026-08-10 更新 — **IR 摘录/主题可作 AI 源文**（`isExcludedAiSourceBlock` 仅排除纯 SRS 闪卡与预览根）；服务设置 **渐进阅读** Tab（选区工具栏偏好 `ir.selectionToolbar`）；制卡 + 块解释 + Quick AI + **摘录处理建议**；**传输层统一到 `aiChatClient` 单一出口**（重试/并发闸门/超时分级/usage/请求日志）；联网仅一勾选，按 model 自动 Grok `web_search` / Gemini Flash nested `google_search`；制卡弹窗 v2（详细程度 · 卡型多选 · 语言 · 自定义指令 · 再来一批）；新增选择题卡；同批聚簇 + 待激活；输出预算可配 + 截断可诊断；`extract-coach` 请求类型（有界上下文 / 严格 JSON + 接地 / 会话缓存）
    - 新增「**视觉规范**」小节：`ai-card-dialog.css` / `ai-quick-interact.css` 已对齐 [SRS_UI设计规范.md](SRS_UI设计规范.md)；删除全部 `prefers-color-scheme` / `.theme-dark` 硬编码分支（历史上引用了不存在的 `--orca-bg-primary` / `--orca-border` / `--orca-color-dangerous` 等变量，永远落到十六进制 fallback，Orca 主题与系统主题不一致时会浅底深字）
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

- **2026-08-10（摘录阅读 AI 快捷制卡）**：修复摘录正文上快捷制卡误报「请选中文本…」——源文排除规则改为允许 IR Topic/Extract/hybrid，仍跳过纯 SRS 闪卡与 AI 预览根。见 [SRS_AI模块.md](SRS_AI模块.md)、[问题经验.md](问题经验.md)
- **2026-08-01（AI 服务设置分段 Tab）**：`AIServiceSettingsDialog` 改为 连接 / 行为 / 快捷制卡 / 网页导入 / 诊断 五段；默认落地连接；模型列表折叠；长 hint「了解更多」。见 [SRS_AI模块.md](SRS_AI模块.md)
- **2026-08-01（联网 tool 一键自动路由）**：设置面板去掉「联网 tool 形态」下拉，只保留「模型原生联网」勾选；开启后 `resolveWebSearchRoute` 按 model 自动：Grok 4.5 → 扁平 `web_search`，Gemini Flash → nested `google_search`；历史 `webSearchToolType` 忽略。见 [SRS_AI模块.md](SRS_AI模块.md)
- **2026-08-01（Gemini google_search 联网形态）**：`materializeWebSearchTool` 将 Gemini 路线序列化为 `{ type: "google_search", google_search: {} }`（ROUTER9 实测仅扁平 `type` 不触发检索）；Grok 仍扁平 `web_search`。见 [SRS_AI模块.md](SRS_AI模块.md)
- **2026-07-27（视图切换视口归零）**：修复「结束最后一张阅读卡后，『今日学习完毕』完成页仍停在上一张卡的滚动位置」——真实纵向滚动 owner 常是 host `.orca-block-editor` 祖先，React 换子树不会让它回顶。新增 `src/hooks/viewportScrollReset.ts`（复用 `resolveVerticalScrollOwner`），IR 会话按视图 key（`summary` / `review:<entryKey>` / `load-failed`，阅读条目仍交给断点恢复）归零；SRS 复习会话在切卡 / 进完成摘要时归零，祖先 owner 受 `manageHostEditorChrome` gate 约束。见 [渐进阅读.md](渐进阅读.md)、[SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)、[问题经验.md](问题经验.md)
- **2026-07-27（死代码清理）**：删除零引用的 `src/components/IRCardList.tsx` / `IRStatistics.tsx`，以及仅服务于它们的 `groupIRCardsByDate` / `calculateIRStats` / `IRCardStats` 与 `.ir-cardlist-*` / `.ir-stats-card-*` 样式；`IR_GROUP_DEFAULT_EXPANDED` 同为零引用但早于本次改动即已死，未在本次范围内处理。见 [渐进阅读.md](渐进阅读.md)
- **2026-07-27（全插件 UI 设计基线落地 · 整合收口）**：新增 [SRS_UI设计规范.md](SRS_UI设计规范.md)（Apple HIG 基准，反推自 Flash Home）与令牌层 `src/styles/srs-design-tokens.css`（`src/main.ts` **最先**导入，含 `prefers-reduced-motion` 统一降级）。四个面板并行对齐后由整合方收口：
  - **令牌层补档**：`--srs-text-display/subtitle/callout`、图标阶梯 `--srs-icon-sm/md/empty`（图标是几何量，与字号阶梯**刻意分离**）、`--srs-measure-narrow`、`--srs-duration-gauge`、状态色 `--srs-accent-warn/success/danger`
  - **域色 vs 状态色分离**（写入规范硬性规则）：`--srs-accent-srs`/`-reading` 标识内容归属，`-warn`/`-success`/`-danger` 标识结果好坏。取值可能相同但**不得互相复用**，否则调色板变更会把「阅读」与「警告」绑死。收口时已把 IR 中 12 处误用域色表达调度状态的声明改回状态色（零视觉变化）
  - **幽灵变量清理**：全域清除不存在的 Orca 变量。除 AI 对话框那批外，另修 `IRBookDialogMount.tsx`（`--orca-bg-primary, #ffffff` + `--orca-text-primary, #333`，暗色主题下浅底深字）与 `CardInfoPanel.tsx`（`--orca-color-success/warning/primary` 无数字后缀且无 fallback，卡片状态色实际从未生效；其回归测试曾把该 bug 固化为契约，已一并更新）
  - **`danger` / `dangerous` 命名歧义**：官方主题文档示例写 `--orca-color-dangerous-5`，本仓库全域用 `--orca-color-danger-*`。缺失时 `var()` 静默失效，故令牌层危险色改走「danger → dangerous → 兜底字面量」回退链
  - 验证：`tsc` 通过 · `npm test` 177 文件 / 1757 用例全绿 · `npm run build` 成功（`dist/style.css` 195.62 kB）
  - **未做**：Orca 实例内运行时渲染验证（四条线共同盲区，建议集中验一次明暗主题）；困难卡列表项无 `tabIndex`，键盘不可达（已确认为可接受，`:focus-visible` 规则保留待用）
- **2026-07-27（EPUB 章节粒度 auto）**：默认 `auto` 识别「一章一文件 + NCX/nav 嵌套小节」为整章容器（不拆小节、不丢章首）；保留历史 multi-fragment 展开；前缀正文兜底；manifest `chapterPlan` + 旧书 resume 强制 `toc-fragments`。真书《智人之上》auto≈21 章 / legacy=101 章。见 [EPUB导入.md](EPUB导入.md)
- **2026-07-27（渐进阅读双面板视觉对齐）**：`ir-workspace.css`（2934→3600+ 行）全面令牌化并对齐 [SRS_UI设计规范.md](SRS_UI设计规范.md)——圆角十档收敛为六档阶梯、阴影统一为 `--srs-shadow-*` 五级、动效统一为 `--srs-duration-*` 三级、排版统一 `--srs-text-*`/`--srs-weight-*` 且统计数字加 `tabular-nums`；资料库概览细带改 Flash Home StatChip 形态、列表行改卡片基线（hover 升 `shadow-1` + `hairline-strong`）、时间导航带改筛选 Chip、`.ir-tag` 与来源/章节徽标统一徽章规格、工具栏统一次级按钮四态；专注阅读会话总结卡升英雄卡（`radius-xl` + `shadow-hero`）、动作栏/抽屉/次级浮层统一 `shadow-overlay` + `radius-lg`、启动页用 `--srs-measure` 收行长；三套阅读纸张主题改为「每主题一份 `--ir-paper-*` 调色板」（刻意纸色，无法由 Orca 主题派生），其余全表零裸十六进制；IR 组件视觉内联样式迁移到 CSS 类。**未动**：宿主挂载 / 渲染宿主 / 虚拟化 / 事件 / 数据流；专注阅读仍为块宿主（面板宿主深树同步死循环，见 [问题经验.md](问题经验.md)）；`*-host-chrome-managed` 作用域选择器原样保留。见 [渐进阅读.md](渐进阅读.md)
- **2026-07-27（AI 能力扩展，分支 ai-1…ai-5，已合并 main）**：五处重复的 Chat Completions 请求链路收敛到 `aiChatClient.callChatCompletions` 单一出口（1756 个既有测试零改动全绿即为等价证据），在其上一次性补齐有限次退避重试、全局并发闸门、按路径分级超时、usage 采集与会话内请求日志；联网 tool 形态由硬编码 `grok-4.5` 匹配改为设置项；制卡新增详细程度（取代固定张数）、自定义指令、卡片语言、再来一批；新增选择题卡并支持卡型混合生成；新增 `srs.batchId` 同批聚簇与 `CardStatus.pending` 待激活（含「SRS: 激活待激活卡片」命令）；输出 token 预算做成设置项（默认 16384）并新增 `finish_reason=length` 截断检测——推理模型会把 reasoning token 计入 completion_tokens，旧的写死 2000 会被思考吃光而报成「不是合法 JSON」。子树源范围 / 术语块引用两项保留在未合并的 `ai-6-scope` 分支。见 [SRS_AI模块.md](SRS_AI模块.md)、[SRS_卡片创建与管理.md](SRS_卡片创建与管理.md)、[SRS_复习队列管理.md](SRS_复习队列管理.md)
- **2026-07-27（AI 对话框 / 导入向导视觉对齐）**：`ai-card-dialog.css`、`ai-quick-interact.css` 全面令牌化并对齐 [SRS_UI设计规范.md](SRS_UI设计规范.md)；删除全部 `@media (prefers-color-scheme: dark)` / `.theme-dark` 硬编码分支——这两张表历史上引用了并不存在的 Orca 变量（`--orca-bg-primary`/`--orca-border`/`--orca-text-primary`/`--orca-color-primary`/`--orca-color-dangerous`/`--orca-accent-color`），实际永远落到十六进制 fallback，Orca 主题与系统主题不一致时会出现浅底深字；草稿卡/提示词卡/后台任务卡改为 Flash Home 卡片基线 + 左侧 4px 语义色条；按钮体系统一（主 CTA / 次级 / 安静，四态 + `primary-5` 焦点环）；EPUB 与网页导入向导的 70 处内联样式迁移为 `.srs-import-dialog*` 等 CSS 类，仅保留进度条宽度 1 处运行时几何量。见 [SRS_AI模块.md](SRS_AI模块.md)、[EPUB导入.md](EPUB导入.md)、[网页导入.md](网页导入.md)
- **2026-07-27（P0 低压调度优化）**：① SRS FSRS 启用 `enable_fuzz`（≥2.5 天间隔削峰分散，确定性播种保证预览=正式一致）；② SRS `SHORT_RELEARN_WINDOW_MS` 5→15 分钟 + `selectNewDueCardsForSession` 去重收窄为未处理部分 + pending 身份，修复「Review 卡评 Again 后本会话内永不回流」；③ IR 已读间隔增长补迟到补偿（`computeLatenessEffectiveBase`，仅普通路径非 SAC）；④ IR 时间盒队列排序从字典序改为加性得分老化（终结低优先级饥饿）+ 探索改真随机采样；⑤ IR `applyAutoPostpone` 接回主路径（用户显式启动会话触发、当日一次守卫、反复推迟降权、会话头部 banner + 撤销）。见 [SRS_记忆算法.md](SRS_记忆算法.md)、[SRS 动态复习队列.md](SRS%20动态复习队列.md)、[SRS_复习队列管理.md](SRS_复习队列管理.md)、[渐进阅读.md](渐进阅读.md)、[渐进阅读_低压体验优化计划.md](渐进阅读_低压体验优化计划.md)、[记忆排期推送.md](记忆排期推送.md)
- **2026-07-27（今日学习面板块 UI/UX 重塑）**：块渲染器 `SrsFlashcardHomeRenderer` 新增宿主 chrome 清理（`srs-flash-home-host-chrome-managed`：隐藏 bullet/handle/查询 Tab 引用·同标签·候选引用/查询视图）+ 默认 Wide View（均 fail-closed 于面板主视图）；`HomeSummaryBar` 动作区分主 CTA / 次级入口两行并新增「阅读资料库」入口（`openIRWorkspace({ mode:"library" })`）；`flashcard-home.css` 按 Apple 标准重做（居中最大宽度列、今日学习主卡片、iOS 分段时长控件、按钮层级）；见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)
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
- **2026-07-27**：修复「显示答案后题面 inline 渲染丢失」——Basic 题目区显示答案前后始终 live 卡根 Block；答案区改为逐个渲染卡根子块（`EmbeddedAnswerBlock` + `useSnapshot`），不再挂卡根整树，删除隐藏根正文 CSS（`.srs-answer-block > .orca-block > …`）；回归 `reviewBlockExpand.test.ts`；见 [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)、[问题经验.md](问题经验.md)
- **2026-07-20**：Basic 答案区编辑会话加固（第一阶段）——移除答案区长期 MutationObserver/DOM style 重写，CSS 只藏卡根 main；显示答案后题目静态 `front` 单 live 根（2026-07-27 已改为题面始终 live + 答案子块渲染）；诊断 `src/test/diagnose-review-tab-focus.js`；**自动化 ≠ Orca 实例 Tab/Enter 已修复**；见 [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md)、[问题经验.md](问题经验.md)
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
