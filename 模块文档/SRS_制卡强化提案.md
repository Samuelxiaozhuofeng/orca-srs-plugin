# SRS 制卡强化提案

> 扫描日期：2026-08-09  
> 性质：只读代码/文档扫描与增量提案，未做 Orca 真机操作，不代表运行时已复现。  
> 范围：普通 SRS 卡片的创建、编辑、预览、浏览、删除和复习形态。Topic 只用于说明边界；渐进阅读、Book IR、EPUB/Web 导入和章末小测不纳入提案。

本报告以 `AGENTS.md` 为硬约束：属性写后必须失效对应缓存，`cardKey` 只能由 `src/srs/cardIdentity.ts` 生成/比较，批量读块与子块展开必须有界，错误不得被静默降级，并且现有 `srs.*`、`srs.cN.*`、`srs.forward|backward.*` 命名空间不可破坏（`AGENTS.md:5-17`）。仓库中卡片不是独立数据库记录，而是 Orca 块、标签、属性和结构化 fragment 的组合（`CLAUDE.md:34-42`）。

---

## 第一节：制卡路径现状表

### 1.1 步骤数口径与问题标记

- 只计用户可见的**语义阶段**；一次连续输入一个完整字段、或“建立并填好一个子块”记 1 阶段，不拆成每次键鼠操作。插件内部插入标签、写 SRS 属性和初始化 FSRS 不单独计步。AI 流程同时给出“阶段数”和可确认的最少离散点击数。
- “1 步”的前提是块结构已准备好。若还要输入答案、标正确项、添加子项或点击“保留/保存”，均计入。
- 问题标记：`[重叠]` 入口功能重复；`[记忆]` 需记忆语法/标签/隐藏操作；`[反馈]` 结果或去向不清；`[正确性]` 可产生半成品或错误卡；`[缺口]` 该界面无入口。

### 1.2 入口面全景

| 入口面 | 当前实现 | 证据 | 结论 |
| --- | --- | --- | --- |
| 命令面板 | Basic、Choice、Cloze、List、IO、正/反 Direction、AI 批量、AI 快捷 Basic/Cloze/Choice；Topic 也在同组命令中 | `src/srs/registry/commands.ts:63-172`；`src/srs/registry/commands.ts:256-434`；`src/srs/registry/commands.ts:522-603` | 覆盖最全，但命名和普通卡/IR 边界不统一；AI 批量还有两个同 label 的主/兼容 command ID（`src/srs/registry/commands.ts:412-434`） |
| 斜杠命令 | Basic、Choice、List、Direction、IO、AI 批量/快捷、Topic；**没有 Cloze** | `src/srs/registry/uiComponents.tsx:168-264` | 与命令面板并非对称镜像 |
| 选区工具栏 | 普通制卡只有 Cloze；AI 菜单是文本快捷交互，不是 AI 制卡 | `src/srs/registry/uiComponents.tsx:97-166` | Cloze 贴合选区操作，其他卡型无就地入口 |
| 默认快捷键 | 普通制卡只有首次播种的 `Alt+Z` Cloze；冲突或用户曾解绑时不强制恢复 | `src/srs/incremental-reading/irShortcutsRegistry.ts:22-36`；`src/srs/incremental-reading/irShortcutsRegistry.ts:55-85`；`src/main.ts:155-160` | Direction 源码注释中的快捷键并未注册 |
| 块右键 | 普通制卡只有 IO；Topic “加入渐进阅读”是 IR 边界 | `src/srs/registry/contextMenuRegistry.tsx:227-265`；`src/srs/registry/contextMenuRegistry.tsx:657-697`；`src/srs/registry/contextMenuRegistry.tsx:808-841` | Basic/Choice/Cloze/List/Direction 全部缺失 |
| Headbar | 唯一可见业务按钮是“今日学习”；AI/IO 等 headbar 注册仅是不可见 Modal mount | `src/srs/registry/headbarButtons.ts:13-44`；`src/srs/registry/uiComponents.tsx:30-93` | `[缺口]` 无制卡入口；不应再依赖旧指南所说的插头图标 |
| “行内语法” | Cloze/Direction 注册的是结构化 fragment renderer，由命令写入；不存在输入纯文本即自动制卡 | 渲染注册 `src/srs/registry/renderers.ts:121-133`；创建器写 fragment `src/srs/clozeUtils.ts:317-383`、`src/srs/directionUtils.ts:115-168`；plain 形式仅为 converter 表示 `模块文档/SRS_填空卡.md:107-111` | 文档中 `{cN:: 内容}` 是 plain converter 表示，不是用户输入协议 |

### 1.3 卡片类型 × 入口 × 实际步骤

| 卡型 | 入口 | 前置条件 | 实际步骤数 | 问题标记与证据 |
| --- | --- | --- | --- | --- |
| Basic 父子问答 | 命令面板“SRS: 将块转换为记忆卡片” | 父块=题面，第一子块=答案；Topic/Extract 等 live IR 身份会被拒绝 | 结构已备 1；从空白块约 3 个语义阶段（题目、建立并填好子答案、转换） | `[反馈]` 无子块也能成卡，会变成 back 为空的摘录式 Basic；`src/srs/cardCreator.ts:184-224`；`src/srs/reviewCardFactory.ts:343-355`；`模块文档/SRS_卡片创建与管理.md:68-75` |
| Basic 父子问答 | 斜杠“转换为记忆卡” | 同上 | 1 / 3 | `[重叠][命名]` 与命令面板同一 command，却一处叫“记忆卡片”、一处叫“记忆卡”；`src/srs/registry/commands.ts:72-89`；`src/srs/registry/uiComponents.tsx:170-175` |
| Basic 手工扫描 | 手工打 `#card` → 命令“扫描带标签的卡片” | 必须是 `#card`；只打 `#choice` 不会被发现 | 2 | `[记忆][重叠]` 要知道标签协议和二次扫描；`src/srs/registry/commands.ts:63-70`；`模块文档/SRS_卡片创建与管理.md:64-66,211-217` |
| Cloze 填空 | 选区工具栏“创建 Cloze 填空” | 非空选区，必须同块且位于同一 content fragment，不能跨样式 | 2（选中+点击） | `[记忆]` 每次自动使用 `max+1`，无同号分组入口；`src/srs/clozeUtils.ts:247-312`；`src/srs/registry/uiComponents.tsx:103-107` |
| Cloze 填空 | 命令面板“SRS: 创建 Cloze 填空” | 同上，用户仍需先选区 | 2 | `[重叠]` 和工具栏相同逻辑；`src/srs/registry/commands.ts:113-151` |
| Cloze 填空 | 默认 `Alt+Z` | 快捷键播种成功且未被用户解绑；同上选区限制 | 2（选中+按键） | `[反馈]` 冲突时跳过，用户可能以为默认键必然存在；`src/srs/incremental-reading/irShortcutsRegistry.ts:55-85` |
| Direction 正向 | 命令面板 / 斜杠“创建正向方向卡 →” | 光标左侧非空；不能已有 Direction，不能与 Cloze 混用 | 左右都已写 1；只写左侧时约 3（输入左侧、创建、补右侧） | `[记忆]` 需理解“光标作分隔符”；`src/srs/directionUtils.ts:74-124`；`src/srs/registry/uiComponents.tsx:191-196` |
| Direction 反向 | 命令面板 / 斜杠“创建反向方向卡 ←” | 同上 | 1 / 3 | `[重叠][记忆]` 正反向是两条顶层命令；双向只能在成卡后点箭头循环得到；`src/components/DirectionInlineRenderer.tsx:72-119` |
| Direction 方向切换 | 点击块内箭头 | 必须先有 Direction fragment | 1（修改，非创建入口） | `[记忆][反馈]` tooltip 才说明可循环；失败只写 console；`src/components/DirectionInlineRenderer.tsx:72-119` |
| Choice 选择题 | 命令面板“SRS: 创建选择题” | 根块=题干，直接子块=选项，正确项子块需 `#correct` / `#正确` | 结构与正确标记已备 1；未标正确项时至少 2 | `[记忆][正确性]` 没有正确项也会先报“成功”；`src/srs/choiceCardCreator.ts:136-160` |
| Choice 选择题 | 斜杠“创建选择题” | 同上 | 1 / 2+ | `[重叠]` 与命令面板同逻辑；`src/srs/registry/uiComponents.tsx:177-182` |
| Choice 手工标签 | 手工加 `#card` + `#choice` → 扫描/下次收集 | 根块已有子选项，正确项仍需 `#correct/#正确`；只打 `#choice` 不会被发现 | 至少 3 个语义阶段（两个标签+扫描）；正确项标记另计 | `[记忆][重叠]` 需了解三层标签协议；`模块文档/SRS_卡片创建与管理.md:59,64-66` |
| List 列表卡 | 命令面板“SRS: 创建列表卡” | 根块=题目，直接子块=逐条答案 | 已有子项 1；无子项时至少 2 | `[反馈][正确性]` 零子项仍提示“已创建”，实际尚无可评分变体；`src/srs/listCardCreator.ts:110-137`；`src/srs/reviewCardFactory.ts:302-329` |
| List 列表卡 | 斜杠“列表卡（子块作为条目）” | 同上 | 1 / 2+ | `[重叠]` 文案比命令面板多一层结构说明；`src/srs/registry/uiComponents.tsx:184-189` |
| Image Occlusion | 命令面板“SRS: 图片遮罩（IO）” | 非查询宿主块，本块/行内/直接子块能解析到图片；不与专用卡型混用 | 单图或接受默认图 3（打开、绘制、保存）；多图且切换到非默认图 4 | `[记忆]` “IO”缩写与完整中文混用；`模块文档/SRS_图片遮罩.md:14-32`；`src/components/image-occlusion/useIoEditorController.ts:135-162`；`src/srs/registry/commands.ts:277-302` |
| Image Occlusion | 斜杠“图片遮罩（IO）” | 同上 | 3；切换非默认图 4 | `[重叠]` 同一编辑器；`src/srs/registry/uiComponents.tsx:205-211` |
| Image Occlusion | 块右键“图片遮罩” | 菜单先出现，打开后才验证是否有图 | 3；切换非默认图 4 | `[反馈]` 无图块也能点进去后才失败；`src/srs/registry/contextMenuRegistry.tsx:227-245`；`src/components/image-occlusion/useIoEditorController.ts:129-170` |
| AI 批量（Basic/Cloze/Choice） | 命令面板两个同名“SRS: AI 生成闪卡”（主 ID + 兼容 ID） | 有效跨块选区，或光标块及其有界子树有文本；AI 服务已配置 | 4 个阶段（打开、配置/生成、审稿、保存）；最少约 5-6 次点击，取决于是否改默认卡型/数量和草稿选择 | `[重叠][反馈]` 可保存为 pending，“已保存”不等于已进正常复习排期；`src/srs/registry/commands.ts:397-434`；`src/srs/ai/aiFlashcardFlow.ts:105-161`；`src/srs/ai/aiCardWriter.ts:403-478`；`src/components/AIDialogMount.tsx:160-223` |
| AI 批量（Basic/Cloze/Choice） | 斜杠“AI 生成记忆卡” | 同上 | 同上：4 阶段，最少约 5-6 次点击 | `[重叠][命名]` 命令面板叫“闪卡”，斜杠叫“记忆卡”；`src/srs/registry/uiComponents.tsx:213-220` |
| AI 快捷 Basic/Cloze/Choice | 三条命令面板“快捷…卡” | AI 已配置；可有选区，也可仅将光标放在有内容块 | 有选区 3（选中、触发、保留）；无选区 2（触发、保留） | `[反馈]` 预览是真实 pending 卡；正常离开所属面板/卸载且未保留时会尽力删除，崩溃/强退可留 pending；`src/srs/registry/commands.ts:522-564`；`src/srs/ai/aiQuickCardFlow.ts:99-153,262-364`；`src/srs/ai/aiQuickCardJob.ts:1-14,32-100`；`src/srs/ai/aiQuickInteractJobs.ts:538-578` |
| AI 快捷 Basic/Cloze/Choice | 三条斜杠“选中即生成，下方预览” | 同上 | 2 / 3 | `[命名]` 实际支持无选区，标题却说“选中即生成”；三种卡共用同一 bolt 图标；`src/srs/registry/uiComponents.tsx:222-241` |
| AI pending 完成路径 | 命令面板“SRS: 激活待激活卡片” | AI 批量主动保存为 pending，或 AI 快捷异常离场留下 pending | 在“已写入卡块”之后额外 1 步；激活后才进正常复习排期 | `[反馈]` pending 仍可被收集，但不进正常队列；`src/srs/registry/commands.ts:566-603`；`src/srs/reviewCardFactory.ts:125-128`；`src/srs/ai/aiQuickCardJob.ts:76-84` |
| Topic（边界） | 命令面板“创建 Topic 卡片”、斜杠“创建阅读材料（主题）”、右键“加入渐进阅读” | 普通可加载块/有效 blockId；它是 IR 路径，非普通卡型 | 1 | `[命名][边界]` 结果会初始化 `ir.*` 且不产出普通 `ReviewCard`；同一事物被叫“卡片/阅读材料”；`src/srs/topicCardCreator.ts:32-92`；`src/srs/reviewCardFactory.ts:130-136` |

### 1.4 心智模型对照

| 卡型 | 用户表达“题/答”的方式 | 独立变体 | 最主要的不统一 |
| --- | --- | --- | --- |
| Basic | 父块/子块结构 | 通常 1 张 | 卡型来自 `#card.type=basic`，答案却隐含为“第一子块”（`src/srs/cardCreator.ts:184-224`） |
| Cloze | 先选文本，命令将其改成带 `clozeNumber` 的 fragment | 每个 cN 一张 | 自动 `max+1`，却无可见的“加入已有 cN”（`src/srs/clozeUtils.ts:92-132,310-312`） |
| Direction | 光标作为分界，插入可点击箭头 fragment | forward/backward 最多 2 张 | 不是选区，双向还需在成卡后点箭头（`src/srs/directionUtils.ts:103-125`；`src/components/DirectionInlineRenderer.tsx:72-119`） |
| Choice | 子块=选项，正确性由用户自己打 `#correct/#正确` | 根块 1 张 | 必须同时理解 `#card.type=choice`、`#choice`、`#correct`（`模块文档/SRS_卡片创建与管理.md:101-108`） |
| List | 子块=条目，子块自带 SRS 进度 | 每个子项一个调度身份 | 外观像 Basic 的多答案，调度却是“逐条解锁”（`src/srs/listCardCreator.ts:110-130`；`src/srs/reviewCardGrading.ts:108-139`） |
| IO | 在图片上画矩形，同号可分组 | 每个 cN 一张 | 是唯一有专用可视编辑器和模式选择的卡型（`模块文档/SRS_图片遮罩.md:20-45`） |

---

## 第二节：问题清单

### 2.1 成熟工具能力对照

对照项来自成熟工具的官方文档，它们是“高价值能力参考”，不表示本插件应原样照搬：[Anki 字段、模板、hint 与媒体](https://docs.ankiweb.net/templates/fields.html)、[Anki 文本导入与重复处理](https://docs.ankiweb.net/importing/text-files.html)、[Anki 浏览与重复检查](https://docs.ankiweb.net/editing.html)、[RemNote 普通制卡](https://help.remnote.com/en/articles/6025481-creating-flashcards)、[RemNote 图片遮罩](https://help.remnote.com/en/articles/6511625-image-occlusion-cards)、[RemNote 导入与 hint](https://help.remnote.com/en/articles/9252072-how-to-import-flashcards-from-text)、[SuperMemo 功能总览](https://help.supermemo.org/wiki/Features)、[SuperMemo 模板相关快捷键](https://help.supermemo.org/wiki/Keyboard_shortcuts)。下表对本插件的判定只依据本地代码/文档。

| 能力 | 判定 | 本插件现状与代码证据 |
| --- | --- | --- |
| 批量制卡 | **部分存在** | AI 可一批生成 Basic/Cloze/Choice，审稿后批量写入并尽力回滚（`src/srs/ai/aiCardWriter.ts:403-478`）；手工结构没有“多块批量转卡”向导。 |
| 批量编辑 | **部分存在** | 浏览器已有多选、全选筛选结果、暂停/激活/重置/改牌组，并保留失败项（`src/components/flashcard-home/CardListView.tsx:196-267,348-384`）；无批量标签、正文、删除或卡型修改。 |
| 卡片模板/预设 | **缺失** | `ReviewCard` 只有 front/back/deck/卡型/变体和状态等，无 template/preset/note-type 字段（`src/srs/types.ts:95-133`）；制卡命令也直接指向具体创建器（`src/srs/registry/commands.ts:72-172,256-434`）。 |
| 一处编辑多卡同步 | **部分存在** | 同一块上 Cloze/Direction/IO 可产生多个变体，List 以同一根块组织条目（`src/srs/reviewCardFactory.ts:143-240,294-329`）；但无显式 Note/Template 层、无按源块分组编辑 UI（`src/srs/types.ts:95-133`）。 |
| 卡型互转 | **缺失，且现有操作可产生混合身份** | 无转换菜单；`makeCardFromBlock` 遇到已有 `#card` 时不会把 type 稳定改回 basic（`src/srs/cardCreator.ts:240-319`）。 |
| Cloze 同号分组 | **数据层部分存在，UI 缺失** | 读取会对相同 `clozeNumber` 去重，但新建永远是 `max+1`（`src/srs/clozeUtils.ts:92-132,310-312`）。 |
| Cloze 嵌套 | **缺失/未定义** | 数据是平面 fragment + number；在旧 Cloze fragment 内再挖空会形成交错号码，不是可解释的嵌套模型（`src/srs/clozeUtils.ts:177-195`）。 |
| Cloze hint | **缺失** | Cloze fragment 只写 `t/v/clozeNumber`，复习固定显示 `[...]`（`src/srs/clozeUtils.ts:190-195`；`src/components/ClozeReviewBlockContent.tsx:167-184`）。 |
| 通用图片/音频字段 | **部分存在** | Basic 复习可保留 Orca 原生子块/媒体且有 TTS（`src/components/review-card/EmbeddedReviewBlocks.tsx:64-116`；`src/components/review-card/BasicCardReviewRenderer.tsx:111-180`）；IO 有图片；Direction/List 复习降为纯文本（`src/srs/directionUtils.ts:382-415`；`src/components/ListCardReviewRenderer.tsx:90-102,253-269`）。 |
| 标签与牌组 | **部分存在** | 新卡默认写“最近牌组”引用（`src/srs/cardTagDataBuilder.ts:7-23`）；可按标签/牌组筛选并批量改现有牌组（`src/components/flashcard-home/cardBrowserQuery.ts:80-138,183-205`；`src/components/flashcard-home/CardListView.tsx:348-384`）；无创建时明示牌组确认、无批量增删标签。 |
| 卡片预览所见即所得 | **部分存在** | 浏览器用 live `SafeBlockPreview`，但统一隐藏 children，Basic 答案/List 条目看不到（`src/components/SafeBlockPreview.tsx:19-45`；`src/components/flashcard-home/CardListItem.tsx:229-231`）；IO 编辑器有题面/答案预览（`模块文档/SRS_图片遮罩.md:20-32`）。 |
| 搜索、筛选、排序 | **已存在** | front/back/tag 搜索，状态/标签/卡型/牌组筛选，AND 组合与稳定排序已实现（`src/components/flashcard-home/cardBrowserQuery.ts:80-138,144-205`）。 |
| 重复卡检测 | **部分存在** | AI 对话框只对当次草稿做去重（`src/srs/ai/aiDialogState.ts:200-260`）；无全库或制卡前的重复检测。 |
| 普通卡导入/导出 | **缺失** | 普通制卡命令注册只有创建、扫描、AI 和激活（`src/srs/registry/commands.ts:63-172,256-603`）；另有的 EPUB/Web 导入命令属于本报告明确排除的内容，不是普通卡导入（`src/srs/registry/commands.ts:850-867`）。 |
| 编辑/浏览/删除 | **部分存在** | 单卡可重置、删除、跳转源块（`src/components/flashcard-home/CardListItem.tsx:264-331`）；专用结构缺乏统一编辑表单，且删除语义有第 2.2 节的复活/残留问题。 |

### 2.2 具体问题

| ID / 标题 | 现象 | 证据（file:line） | 影响 | 严重度 |
| --- | --- | --- | --- | --- |
| C-01 Cloze/Direction “删除变体”会复活 | 删除只清理对应 SRS 属性，不删 Cloze fragment，也不把双向箭头改为剩余方向；下次收集仍能从结构枚举该变体并 `ensure*` 重建状态 | `src/components/SrsFlashcardHome.tsx:206-229`；`src/srs/reviewCardFactory.ts:143-156,217-240` | 用户明确删除的卡再次出现，直接破坏对卡库的信任 | **高** |
| C-02 Basic/Cloze 整卡删除后可能被 `_repr` 重新收集 | 整卡删除只清 `srs.*` 和 `#card`，插件代码不显式清 `_repr`；收集器会合并 state 中 `srs.card/srs.cloze-card/srs.direction-card` 块 | `src/components/SrsFlashcardHome.tsx:233-242`；`src/srs/storage.ts:898-913`；`src/srs/cardCollector.ts:190-203` | **若** Orca `removeTag` 后 `_repr` 仍保留，该块就可能被重新收集并初始化调度 | **高风险（待 Orca 真机确认）** |
| C-03 List 整卡删除遗留条目进度 | List 的调度状态在直接子块，而整卡删除只清根块；仅“创建撤销”会清理本次初始化的 item | `src/srs/listCardCreator.ts:110-130`；`src/components/SrsFlashcardHome.tsx:233-242`；`src/srs/registry/cardCreationUndo.ts:250-305` | 重建列表卡可继承用户以为已删的旧进度，子块也留下孤儿属性 | **高** |
| C-04 Choice 复习题面存在高风险泄题调用链 | 复习根题面用 `SafeBlockPreview`；静态调用链会让 `srs.choice-card` 走专用块渲染器，而其选项预览用绿色和“正确”标出答案 | `src/components/ChoiceCardReviewRenderer.tsx:407-410`；`src/components/SafeBlockPreview.tsx:74-83`；`src/srs/registry/renderers.ts:49-56`；`src/components/ChoiceCardBlockRenderer.tsx:258-333` | 若宿主按该调用链可见渲染，复习未作答就会看到答案，选择题失去有效性 | **高（待 Orca 真机复现）** |
| C-05 无正确项 Choice 会成卡，但没有正常提交路径 | 创建只 info 提示而不阻断；`mode=undefined` 点选项时走非单选分支，UI 却只在 `multiple` 时显示提交按钮 | `src/srs/choiceCardCreator.ts:136-160`；`src/srs/choiceUtils.ts:91-111`；`src/components/ChoiceCardReviewRenderer.tsx:174-256,444-478` | 创建成功但复习只能跳过，还会污染应复习数和用户预期 | **高** |
| C-06 Cloze 经通用卡块编辑器保存会抹掉结构 | `srs.cloze-card` 复用 `SrsCardBlockRenderer`；“编辑题目→保存”把整块改写为单个纯文本 fragment | `src/srs/registry/renderers.ts:31-37`；`src/components/SrsCardBlockRenderer.tsx:76-77,127-151` | 一次看似正常的文本编辑会删除全部 Cloze 标记，变体和进度随之脱节 | **高** |
| C-07 Cloze/Direction/Choice 创建不是原子操作 | 正文、`#card`、专用标签/属性和 SRS 是多阶段写入；后阶段失败只通知/返回，不补偿已完成的前阶段 | `src/srs/clozeUtils.ts:327-397,464-467`；`src/srs/directionUtils.ts:130-180,269-272`；`src/srs/choiceCardCreator.ts:65-115` | 留下带部分标签、部分 fragment 或部分 SRS 的半成品，后续收集结果难预测 | **高** |
| C-08 List 初始化失败被隐藏且仍报成功 | 根 `srs.isCard` 写失败和各条目初始化失败只 `console.warn`，最后仍发 success toast；后续收集会尝试 `ensure*` 自愈 | `src/srs/listCardCreator.ts:94-137`；`src/srs/reviewCardFactory.ts:302-329` | 用户看不到初始化失败，首次 due 可延迟或变得不确定；后续自愈不能使“创建成功”的当下反馈变真 | **中** |
| C-09 Direction 撤销不对称 | undo 只恢复 `originalContent`，不撤销本次加/改的 `#card.type`、`srs.isCard` 和方向 SRS 状态 | `src/srs/registry/commands.ts:305-344,351-390`；对照完整 helper `src/srs/registry/cardCreationUndo.ts:86-201` | 用户 Ctrl/Cmd+Z 后外观恢复，但隐藏卡身份仍在，属于静默数据残留 | **高** |
| C-10 无界全库/子树/最近牌组读取 | 手工扫描和全局收集 fallback 调 `get-all-blocks`；普通块子树递归和查询结果无数量/深度 cap，反链子卡无数量 cap；最近牌组 watcher 对一次 ops 中任意多块做无界 `Promise.allSettled` | `src/srs/cardCreator.ts:61-82`；`src/srs/cardCollector.ts:157-187`；`src/srs/blockCardCollector.ts:116-175,183-265`；`src/srs/childCardCollector.ts:126-169`；`src/srs/recentDeckManager.ts:157-165,222-243`；规则 `AGENTS.md:15-16` | 大库/深树或大批 ops 下可引发长时卡顿、后端压力或不可控的耗时 | **高** |
| C-11 四个复习器手拼“卡片唯一标识” | Cloze/Direction/List/Choice 用字符串模板生成组件状态 key，没有走 `cardIdentity.ts` | `src/components/ClozeCardReviewRenderer.tsx:64-77`；`src/components/DirectionCardReviewRenderer.tsx:64-77`；`src/components/ListCardReviewRenderer.tsx:70-81`；`src/components/ChoiceCardReviewRenderer.tsx:89-101`；唯一入口 `src/srs/cardIdentity.ts:81-140`；规则 `AGENTS.md:9` | 现有四种拼法在当前卡型下仍可区分；但扩展时 UI 重置身份可与日志/队列身份分叉 | **中（明确规则违反；未确认已有数据错位）** |
| C-12 收集/激活/查询路径会降级隐藏读失败 | 全库 fallback 二次失败后将 `tagged=[]`；pending 激活吞掉 backend throw 并改读可能过期的 state；查询返回非数组时与空数组一样被当成空结果 | `src/srs/cardCollector.ts:157-187`；`src/srs/cardStatusUtils.ts:559-589`；`src/srs/blockCardCollector.ts:116-127`；规则 `AGENTS.md:17` | 失败**可能**被误表示为“没有卡”或基于旧 state 继续；fallback 数据也可能恰好正确，但用户不知道读取已失败 | **高** |
| C-13 List 更新已有卡型时存在缓存失效窗口 | 已有 `#card` 时先 `setRefData(type=list)`，却不立即失效 block cache；失效被拖到下一次 `srs.isCard` 写成功后。若第二写失败，第一写永远未失效，流程还会继续 | `src/srs/listCardCreator.ts:78-108`；Choice 的对照正确路径 `src/srs/choiceCardCreator.ts:87-95`；规则 `AGENTS.md:8` | 随后读可看到旧 type，且用户仍会收到“已创建”，是可达的缓存与反馈双重风险 | **高** |
| U-01 Choice 在复习中可因重渲染重新洗牌 | `SrsCardDemo` 每次渲染都直接调随机 `shuffleOptions`，没有按 cardKey 冻结 | `src/components/SrsCardDemo.tsx:196-202`；`src/srs/choiceUtils.ts:121-174` | 已点选项与屏幕位置可在作答中变化，产生误触和不公平评分 | **中** |
| U-02 Choice 多选的“禁用”只是 CSS | 未选任何项时按钮只加 `--disabled` class，没有 HTML `disabled`；`handleSubmit` 也不检查空集合 | `src/components/ChoiceCardReviewRenderer.tsx:239-256,444-464` | 可空提交并得到 Hard，键盘/辅助技术也不知道它应被禁用 | **中** |
| U-03 Direction 创建会丢富文本 | 实现按 `block.text` 和 cursor offset 切分，再重建成三个纯文本/方向 fragment | `src/srs/directionUtils.ts:103-125` | 粗体、引用、行内媒体和多 fragment 样式可被不可逆地降级，offset 也可与实际 fragment 位置不一致 | **中** |
| U-04 Direction/List 复习不保留媒体和富文本 | Direction 抽取 `leftText/rightText`；List 将子块降成 text 并去标签 | `src/srs/directionUtils.ts:382-415`；`src/components/ListCardReviewRenderer.tsx:90-102,253-269` | 笔记中看到的内容与实际复习不同，图片/音频/代码块答案不可用 | **中** |
| U-05 浏览器预览不是正反面预览 | `SafeBlockPreview` 隐藏原生 children，列表项只挂根块；Basic 答案和 List 条目不可见。Choice 的原生 children 也被隐藏，但专用 renderer 又重新显示选项摘要，并有 C-04 的泄题风险 | `src/components/SafeBlockPreview.tsx:19-45`；`src/components/flashcard-home/CardListItem.tsx:229-231`；`src/components/ChoiceCardBlockRenderer.tsx:182-215,258-333` | 预览不同卡型的语义不一致：有的缺答案，有的反而显示过多 | **中** |
| U-06 浏览预览的 virtual panel/style ID 仅含 blockId | 同块的 Cloze/Direction/IO 多变体共用 ID，某实例卸载时还会移除共用 style | `src/components/SafeBlockPreview.tsx:19-31,61-67`；`src/components/CardBlockPreview.tsx:19-31,52-58` | 潜在面板状态/样式抢占；是否会在 Orca 真机产生可见故障尚未确认 | **中（待 Orca 验证）** |
| U-07 IO 编辑器无历史栈、无脏数据关闭确认 | 只保存当前 `regions` state；取消/Esc/Modal 关闭直接 `onClose()` | `src/components/image-occlusion/useIoEditorController.ts:68-88,255-258`；`src/components/image-occlusion/ImageOcclusionEditorMount.tsx:70-83` | 复杂遮罩误操不可逐步撤销，误关可无提示丢失整次编辑 | **中** |
| U-08 IO 图片加载失败无明确状态 | 只在 URL 为空时显示缺失；编辑和复习 `<img>` 都没有 `onError` | `src/components/image-occlusion/ImageOcclusionEditorCanvas.tsx:69-87`；`src/components/image-occlusion/ImageOcclusionReviewRenderer.tsx:277-306` | 404/解码失败只显示破图，用户不知是源图损坏、路径失效还是插件问题 | **中** |
| U-09 Cloze 分组/hint/嵌套的可见模型缺失 | 同号去重存在但新建永远 `max+1`；无 hint；对旧 Cloze 内再挖空未定义嵌套语义 | `src/srs/clozeUtils.ts:92-132,177-195,310-312`；`src/components/ClozeReviewBlockContent.tsx:167-184` | 当前 UI 无法创建同号分组、hint 或具有明确语义的嵌套 Cloze；手改 fragment 不是受支持的替代流程 | **中** |
| U-10 入口命名、图标和快捷键信息不一致 | “记忆卡/闪卡/问答卡”混用，Cloze/IO/Topic 中英文混用，AI 三种快捷卡全用 bolt 图标；UI 注释称 Orca 不支持快捷键，代码/API 又实际支持 | `src/srs/registry/uiComponents.tsx:6-7,168-264`；`src/srs/registry/commands.ts:87,149,305,351,420-431,528-530`；`plugin-docs/types/command-types.md:776-819` | 命令面板难扫描，用户无法形成一套稳定词汇和可预测的入口规则 | **中** |
| U-11 创建后只有短 toast，卡片去向和默认牌组不透明 | 创建器仅发“已创建”文本，没有“查看卡片/继续完善” action；新卡牌组默认由“最近牌组”隐式决定，Flash Home 又是独立“今日学习”入口 | `src/srs/clozeUtils.ts:441-450`；`src/srs/directionUtils.ts:253-263`；`src/srs/choiceCardCreator.ts:152-160`；`src/srs/listCardCreator.ts:133-137`；`src/srs/cardTagDataBuilder.ts:7-23`；`src/srs/registry/headbarButtons.ts:13-22` | 用户操作成功却不知卡在哪个牌组、是否已可复习、去哪里预览 | **中** |
| U-12 “转换为记忆卡”不是可靠的卡型转换 | `makeCardFromBlock` 对已有专用 `#card` 可修改 `_repr`/补 SRS，但不稳定将 type 改回 basic | `src/srs/cardCreator.ts:240-319` | Choice/List/Direction 等块上运行普通转换后，展示、收集类型和调度身份可不一致 | **中** |
| U-13 Basic/专用卡的编辑语义不一致 | 通用块编辑器将题面/第一答案降为 textarea 纯文本，但 Basic 正式复习会展示所有直接子块；Choice 则依赖下方原生 `BlockChildren` 修改结构 | `src/components/SrsCardBlockRenderer.tsx:127-180`；`src/components/review-card/EmbeddedReviewBlocks.tsx:103-116`；`src/components/ChoiceCardBlockRenderer.tsx:182-245` | 同一个“编辑卡片”概念在不同地方可能改不同内容，并导致富文本损失 | **中** |
| U-14 AI 入口/指南过时且命令可能重复 | `makeAICard` 与兼容 `interactiveAICard` 同 label；指南只说 Basic/Cloze 且说 Headbar 有插头，实际已支持 Choice 且 Headbar 只有“今日学习” | `src/srs/registry/commands.ts:412-434,522-530`；`模块文档/AI智能制卡使用指南.md:8,22,26-30`；`src/srs/registry/headbarButtons.ts:13-22` | 命令面板可出现两个同名入口，用户按文档找不到实际入口 | **中** |
| U-15 Topic 命名混入普通卡型 | 命令面板称“Topic 卡片”，斜杠/右键称“阅读材料/渐进阅读”；实际不进普通 ReviewCard | `src/srs/registry/commands.ts:154-172`；`src/srs/registry/uiComponents.tsx:257-264`；`src/srs/topicCardCreator.ts:42-92`；`src/srs/reviewCardFactory.ts:133-136` | 用户会将“创建 Topic 卡片”理解为普通 SRS 卡型，创建后却在阅读域找到它 | **中** |
| U-16 无子块 Basic 和空 List 的“完成”定义不一致 | Basic 无子块会被当摘录式卡并可直接评分；List 无子块则不产生可评分条目，却也报成功 | `src/srs/reviewCardFactory.ts:302-343`；`src/components/review-card/BasicCardReviewRenderer.tsx:386-414`；`src/srs/listCardCreator.ts:133-137` | “没有答案”在不同卡型中时而是可用卡、时而是待补全草稿，无统一空状态 | **中** |
| L-01 卡型图标可扫描性不均 | Basic/Choice/List/Direction/IO 各有专属斜杠图标，但 AI 快捷三卡型都用 `ti-bolt`；命令面板也无统一的卡型前缀词 | `src/srs/registry/uiComponents.tsx:170-241`；`src/srs/registry/commands.ts:522-530` | 用户在长菜单中只能读完整标题来区分 AI 卡型 | **低** |

### 2.3 仓库硬规则专项审计

| 硬规则 | 审计结论 | 证据 |
| --- | --- | --- |
| 属性写后失效缓存 | **已确认一处违规**：List 对已有 `#card` 先写 `type=list`，但只在随后 `srs.isCard` 写成功时才失效；若后一步失败，type 写入没有对应失效。Choice 更新 type 后立即失效，Cloze 写 `srs.isCard` 后失效 | `src/srs/listCardCreator.ts:78-108`；对照 `src/srs/choiceCardCreator.ts:87-95`；`src/srs/clozeUtils.ts:388-397`；规则 `AGENTS.md:8`。Direction content 切换是否还需对宿主 state 做额外失效属运行时问题，不在没有真机证据时判定为已违规。 |
| `cardKey` 唯一入口 | **已确认违规**：四个复习器手拼组件状态 key | `AGENTS.md:9`；`src/srs/cardIdentity.ts:81-140`；`src/components/ClozeCardReviewRenderer.tsx:64-77`；`src/components/DirectionCardReviewRenderer.tsx:64-77`；`src/components/ListCardReviewRenderer.tsx:70-81`；`src/components/ChoiceCardReviewRenderer.tsx:89-101` |
| 错误必须可见 | **已确认违规**：List 只 warn 后报成功；全库 fallback 失败后置空；pending 读取会静默回退 state；malformed query response 被当空结果 | `AGENTS.md:17`；`src/srs/listCardCreator.ts:94-137`；`src/srs/cardCollector.ts:157-187`；`src/srs/cardStatusUtils.ts:559-589`；`src/srs/blockCardCollector.ts:116-127` |
| 批量读块/子展开有界 | **已确认违规**：`get-all-blocks`、查询结果、普通子树深度/数量、反链数量缺 cap；最近牌组 watcher 还有无界 `Promise.allSettled` | `AGENTS.md:15-16`；`src/srs/cardCreator.ts:61-82`；`src/srs/cardCollector.ts:157-187`；`src/srs/blockCardCollector.ts:116-265`；`src/srs/childCardCollector.ts:126-169`；`src/srs/recentDeckManager.ts:157-165,222-243` |
| 子卡合法 self back-reference | **已正确排除，不是问题** | `src/srs/childCardCollector.ts:139-143`；规则 `AGENTS.md:16` |
| 属性命名空间 | **本次范围未发现新别名/新 type code**；提案也不建议替换旧 key | `AGENTS.md:13`；`src/srs/types.ts:22-31`；`src/srs/cardIdentity.ts:81-140` |
| FSRS 调度路径 | 本报告不审计算法本身；仅指出卡身份变化、孤儿进度、删除复活会间接影响调度正确性 | 卡身份字段见 `src/srs/types.ts:95-133`；唯一 identity 路径见 `src/srs/cardIdentity.ts:81-140` |

---

## 第三节：增强提案

### 3.1 提案列表

| ID / 提案名 | 用户价值 | 建议交互设计（菜单文案与操作序列） | 主要涉及文件 | 复杂度 | 风险/验证 |
| --- | --- | --- | --- | --- | --- |
| E-01 删除闭环 + Choice 安全模式 | 先消除“删后复活”和“复习泄题”这两类信任破坏 | **Cloze**：“删除此填空 cN” → 确认框明示“将恢复普通文本并删除该进度；原挖空前样式未保存，无法保证恢复” → 对所有同号 fragment 用 `v` 解包 + 清 `srs.cN.*`。**Direction**：双向删一向时改为剩余箭头；最后一向时移除 direction fragment，保留左/右内容。**整卡**：只清插件确认拥有的 SRS `_repr`/专用标记，不盲删其他 repr；List 额外列出并清子项 SRS。**Choice**：建议产品决定后采用“无正确项则阻断创建”；已有无正确项卡先从队列排除并给“修复选项”；复习题面只显示题干 | `src/components/SrsFlashcardHome.tsx`；`src/srs/storage.ts`；`src/srs/clozeUtils.ts`；`src/srs/directionUtils.ts`；`src/srs/listCardCreator.ts`；`src/components/ChoiceCardReviewRenderer.tsx`；`src/components/ChoiceCardBlockRenderer.tsx`；`src/srs/reviewCardFactory.ts` | L | 需分别测同号 Cloze、双向 Direction、List 子项、无正确项 Choice、插件/非插件 `_repr`。结构修改只能 best-effort 补偿；Choice 题干富文本和 C-02 的 `_repr` 宿主行为需真机验证。 |
| E-02 制卡补偿事务与对称撤销 | 后阶段失败时尽力恢复创建前状态；Ctrl/Cmd+Z 后外观和数据尽可能一致 | 每个 creator 先记录 original content/`_repr`、已有 `#card` 的 type/牌组/status，以及每个属性/标签是否由本次新增。操作：完整前置校验 → 分阶段写入 → 校验完成态 → 回执。失败时按相反顺序 best-effort 补偿，只删本次新增内容；全部补偿成功才显示“创建失败，已回滚”，否则显示残留操作和块 ID。Direction 改用专用 undo helper；IO 历史栈留给 E-11 | `src/srs/cardCreator.ts`；`src/srs/clozeUtils.ts`；`src/srs/directionUtils.ts`；`src/srs/choiceCardCreator.ts`；`src/srs/listCardCreator.ts`；`src/srs/registry/cardCreationUndo.ts`；`src/srs/registry/commands.ts` | L | 多个异步宿主写无法承诺 ACID；只能依赖已验证的 command group 和显式补偿。补偿本身失败时不得发“已回滚”。 |
| E-03a 硬规则即时合规 | 先消除可达的缓存、身份、无界并发和错误降级风险 | List `setRefData(type=list)` 成功后立即 `invalidateBlockCache`；四个复习器仅通过 `cardIdentity.ts` 生成/比较 key；最近牌组 watcher 改成有界 worker；malformed query response 直接抛可见错误；`cardCollector` fallback 失败不得 `tagged=[]`；pending backend 读失败不得用可能过期 state 伪装激活成功；现有无界子树/查询/backRefs 路径加显式 hard cap，超限不伪装完整 | `src/srs/listCardCreator.ts`；`src/srs/cardIdentity.ts`；四个 `src/components/*CardReviewRenderer.tsx`；`src/srs/recentDeckManager.ts`；`src/srs/blockCardCollector.ts`；`src/srs/childCardCollector.ts`；`src/srs/cardCollector.ts`；`src/srs/cardStatusUtils.ts` | M | cap 先使用仓库级保守常量并显示超限；不在这一步承诺分页继续。这是 non-negotiable 合规工作，优先于新功能。 |
| E-03b 大库分页/继续扫描 | 在不取消上限的前提下，让用户显式继续处理超大结果集 | 超限态显示“已收集 N 张，另有结果未读取”和“**继续读取下一批**”；每批仍受 count/depth/concurrency cap。标签查询失败时不自动 `get-all-blocks`，而是显示“**使用慢速全库扫描**”和风险说明 | `src/srs/blockCardCollector.ts`；`src/srs/childCardCollector.ts`；`src/srs/cardCollector.ts`；`src/srs/cardCreator.ts`；浏览器加载状态 | L | Orca backend 查询是否支持游标/分页**待根据 `plugin-docs/` 和真机验证**；不支持时只能做分批本地处理，不宣称降低了后端全量读成本。 |
| E-04 统一“新建卡片…”入口与完成回执 | 新用户无需先学会七条命令、隐藏标签和不一致词汇；创建后立即知道结果、牌组和去向 | 命令面板、斜杠、右键统一新增“**SRS: 新建卡片…**”，选择“问答卡/填空卡/方向卡/选择题/列表卡/图片遮罩/AI 生成卡片” → 查看结构检测与“牌组：X” → 确认。回执只有“已创建并可复习”、“待补全，尚未入队”、“创建失败，已回滚/有残留”。`orca.notify` 可附 action callback（`plugin-docs/types/plugin-runtime-types.md:932-988`），但 API 没有 action label 字段；若必须精确显示“查看卡片/继续编辑”文案，用自建完成条而不臆造 notify 参数。Topic 仅保留“加入渐进阅读” | `src/srs/registry/commands.ts`；`src/srs/registry/uiComponents.tsx`；`src/srs/registry/contextMenuRegistry.tsx`；`src/srs/cardTagDataBuilder.ts`；`src/srs/cardCreator.ts`；`src/srs/clozeUtils.ts`；`src/srs/directionUtils.ts`；`src/srs/choiceCardCreator.ts`；`src/srs/listCardCreator.ts`；`src/srs/imageOcclusion.ts` | M | 保留旧 command ID；hidden alias 是否支持待验证。“已回滚”只能在 E-02 确认补偿成功时显示。 |
| E-05 卡片浏览器 2.0：正反面预览 + 批量标签/删除 | 在一处核对“真正会考什么”，并完成高频卡库整理 | 单卡行增加“**题面** / **答案** / **复习预览**”，默认只读；预览惰性挂载，同时只保留一个 live renderer。“编辑源块”才打开 Orca 编辑。多选栏增加“**添加标签**”、“**移除标签**”、“**删除所选…**”；确认框的口径固定为“选中 N 个 cardKey，涉及 M 个源块，其中 K 个是多变体块”。标签是源块级操作；只选一个 Cloze/Direction 变体时明示“将影响同源块全部变体” | `src/components/flashcard-home/CardListView.tsx`；`src/components/flashcard-home/CardListItem.tsx`；`src/components/flashcard-home/CardBrowserBatchControls.tsx`；`src/components/flashcard-home/cardBrowserBatchActions.ts`；`src/components/flashcard-home/cardBrowserQuery.ts`；各卡型 read-only review renderer | L | preview mode 必须同时禁用评分、日志、统计、全局快捷键和 TTS 自动播放，不只是 `readOnly`。批量删除依赖 E-01，失败项必须保留。 |
| E-06 Cloze 同号分组 + hint | 支持“多个空同时作答”和语法/语义提示，不需手改 fragment | 选中文本后，Cloze 菜单提供“**新建填空 c{next}**”、“**加入填空 c1…cN**”、“**新建填空并添加提示…**”。hint 规范：同一 cN 的每个 fragment 重复存储相同可选 hint；新增同号 fragment 自动继承；检测到冲突则报错，不静默选值。复习有 hint 显示 `[hint]`，无 hint 仍 `[...]`。在已有 Cloze fragment 内选中时阻断并提示“嵌套填空尚未支持” | `src/srs/clozeUtils.ts`；`src/components/ClozeInlineRenderer.tsx`；`src/components/ClozeReviewBlockContent.tsx`；`src/srs/registry/uiComponents.tsx`；`src/srs/registry/converters.ts` | M | 旧 fragment 无 hint 仍合法，无全库迁移。plain converter 目前只输出 `fragment.v`（`src/srs/registry/converters.ts:104-109`），必须先定义带编号/hint 的导出-再导入 roundtrip；否则明示 plain 导出会降级。 |
| E-07 制卡预设（Preset） | 高频场景不再反复选卡型、牌组、标签、方向和复习模式 | 在“新建卡片…”顶部显示“**最近使用**”和“**预设**”。“保存为预设…” → 输入名称 → 选卡型/牌组/用户标签/可选默认（Direction 方向、Choice 是否乱序、IO 模式）。应用预设后仍先跑结构校验 | `src/srs/settings/**`；`src/srs/cardTagDataBuilder.ts`；`src/srs/recentDeckManager.ts`；`src/srs/registry/uiComponents.tsx`；各 creator | M | 预设存于插件 data/settings，不把 template ID 写进卡块。牌组引用失效时可回落 Default，但完成回执必须显示“原牌组无效，已改用 Default”，不静默降级。 |
| E-08 重复卡检测 | 避免相同卡片反复入库、分散进度 | 首版只对 Basic 和 Direction 做确定性内容指纹：Basic=规范化题面+答案子树；Direction=规范化左/右内容+方向。命中时显示“可能重复（2）”与“**查看已有卡** / **继续创建** / **取消**”。Cloze 需“完整文本+结构化挖空位置”，Choice 需“题干+选项+正确项”，List/IO 后置。`cardKey` 只用于检测结果行的**身份去重/精确操作**，不作为跨块内容重复判据 | 新建 `src/srs/cardDuplicateDetector.ts`；`src/srs/cardIdentity.ts`；`src/srs/ai/aiDialogState.ts`；`src/srs/cardCreator.ts`；`src/srs/directionUtils.ts`；浏览器 | M | 首版不做相似度/向量检索，只警告不自动合并。全库读必须复用有界索引，不现场 `get-all-blocks`。 |
| E-09 富文本/媒体复习对齐 | 先阻止制卡造成的样式损失，再逐步让复习与笔记一致 | **阶段 1**：Direction 创建保留分隔点前后 fragments，不经 `block.text` 重建全块；List 当前项直接渲染对应 live child block。**阶段 2**：在 Orca 验证部分 fragment 渲染能力后，Direction 复习再改为渲染左/右 fragment slice。媒体优先复用 Orca 原生块/行内资产，不另造 `srs.audio`；TTS 是否扩展由每个卡型单独决定 | `src/srs/directionUtils.ts`；`src/components/DirectionCardReviewRenderer.tsx`；`src/components/ListCardReviewRenderer.tsx`；`src/components/review-card/EmbeddedReviewBlocks.tsx`；`src/srs/tts/**` | L | 部分 fragment 稳定渲染 API **待验证**。阶段 1 不应被阶段 2 阻塞；Basic 现有 TTS 不代表其他卡型已支持音频。 |
| E-10 按源块分组的“一处编辑多卡” | 把已存在的“同块多变体”变成可见的 Note 式体验，不新建第二套数据模型 | 浏览器新增“**按源块分组**” toggle；示例分别为“源块 #ID · 2 张：c1/c2”或“源块 #ID · 2 张：正向/反向”，不把互斥卡型混在一组示例。点“**编辑源内容**”打开唯一 Orca 块；返回浏览器时显式失效并重读该源块变体，列出“新增/删除的卡身份”。不假定已有源块 save hook | `src/components/flashcard-home/CardListView.tsx`；`src/components/flashcard-home/cardBrowserQuery.ts`；`src/components/flashcard-home/CardListItem.tsx`；`src/srs/cardIdentity.ts`；`src/srs/reviewCardFactory.ts` | M | 不引入 `noteId/templateId`，无数据迁移；变体数量变化必须清孤儿进度，依赖 E-01。 |
| E-11 IO 编辑安全网 | 降低复杂遮罩的误操和误关损失，图片失效时给出可行动的反馈 | 工具栏增加“撤销/重做”图标按钮；一次 pointer 交互只在提交时记一条历史，pointer move 不逐帧入栈，源图切换也入历史。dirty 以规范化 `regions + mode + sourceKey/src` 与初始快照比较；关闭显示“**放弃更改** / **继续编辑** / **保存**”。`img onError` 显示“图片无法加载”和“重新加载同一地址” | `src/components/image-occlusion/useIoEditorController.ts`；`src/components/image-occlusion/ImageOcclusionEditorToolbar.tsx`；`src/components/image-occlusion/ImageOcclusionEditorMount.tsx`；`src/components/image-occlusion/ImageOcclusionEditorCanvas.tsx`；`src/components/image-occlusion/ImageOcclusionReviewRenderer.tsx` | M | 历史栈有长度上限；保存失败不关闭。Modal 关闭拦截覆盖点击遮罩/Esc 需真机验证；若同时改复习端错误态，整体接近 L。 |
| E-12 普通卡导入/导出 | 迁移旧卡、批量建库和做可审计备份 | “**导入问答卡…**”首版支持 TSV/CSV（front, back, deck, tags），预览前 20 行、字段映射、重复策略（跳过/仍创建），确认后有界分批写块。“**导出筛选结果…**”默认 JSON/TSV，包含结构化 card identity，不默认将 FSRS 内部状态当作跨工具格式 | 新建 `src/srs/importExport/`；参考但不直接继承 AI 特有 pending 语义的 `src/srs/ai/aiCardWriter.ts`；复用 `src/srs/cardIdentity.ts`、`src/srs/cardTagDataBuilder.ts`；浏览器筛选结果 | L | 文件选择/下载在 Orca 宿主中的能力待验证；API 不足时用粘贴 TSV + 复制导出内容。Importer 必须自定义分批回滚/失败报告，不假定 AI writer 的事务边界可原样复用。 |
| E-13 有限、可预览的卡型转换 | 修正选错卡型，避免手工删标签/属性；但不伪装一对多/多对一转换能无损保留调度 | “**转换卡型…**”首版只提供向导并统一**重置调度**：Basic → Choice 必须在预览里选正确项；Choice → Basic 必须选哪些选项合并为答案；Basic → List 必须确认“一张卡将变为 N 个条目身份”。Cloze/Direction/IO 不自动互转；“取消卡型并保留原文”也必须先列出 fragment/`_repr`/标签/SRS 清理结果 | 新建 `src/srs/cardTypeConversion.ts`；`src/srs/cardCreator.ts`；`src/srs/choiceCardCreator.ts`；`src/srs/listCardCreator.ts`；`src/srs/storage.ts`；`src/srs/cardIdentity.ts`；浏览器 | L | 转换改 cardKey，旧日志保留只读、新卡从新状态开始。必须先快照、best-effort 补偿，新结构验证成功后才清旧专用数据，不创建新 type alias。 |

### 3.2 兼容与迁移策略

1. **现有命名不改**：所有调度状态继续使用 `srs.*`、`srs.cN.*`、`srs.forward|backward.*`；不建议为 hint、模板或导入另起并行调度 key。
2. **Cloze hint 只做可选扩展**：旧 fragment 的 `t/v/clozeNumber` 仍合法；同一 cN 的每个 fragment 重复保存相同的可选 hint，新增同号 fragment 自动继承，冲突时显式报错。converter 必须定义编号/hint 的往返语义；无需全库迁移。
3. **模板/预设不落到每张卡**：先存于现有 settings/local store，只在创建时展开为现有标签/牌组/卡型写入；删除预设不影响旧卡。
4. **卡型转换是显式迁移**：首版统一重置调度，旧日志只读保留，不承诺跨 cardKey 迁移进度。只在新卡型完整写入并验证后删旧类型专属数据；失败时执行 best-effort 快照恢复并报告残留。
5. **command ID 保留，可见名称收敛**：旧 ID 可继续转发到新创建器，以保护用户已绑快捷键。只在 Orca 文档/真机证实支持 hidden alias 后隐藏重复项；否则不删除兼容 ID。
6. **所有新身份操作只经 `cardIdentity.ts`**：批量删除、重复检测、按源块分组和卡型转换都不得用手拼 key 或 substring 匹配（`AGENTS.md:9`；`src/srs/cardIdentity.ts:81-140`）。

---

## 第四节：优先级排序

### 4.1 价值/成本排序

评分为相对值：价值 5 最高；成本 1 最低、3 最高。价值/成本相同时，先做数据正确性和仓库硬规则。

| 顺序 | 提案 | 价值 | 成本 | 价值/成本判断 | 依赖 |
| --- | --- | ---: | ---: | --- | --- |
| 1 | E-03a 硬规则即时合规 | 5 | 2 | 消除已确认的缓存、`cardKey`、有界读取和错误可见违规 | 无；与 E-01/E-02 可并行分模块落地 |
| 2 | E-01 删除闭环 + Choice 安全模式 | 5 | 3 | 处理删除复活、孤儿进度和复习泄题风险 | 无；应是其他删除/批量功能的前置 |
| 3 | E-02 制卡补偿事务与对称撤销 | 5 | 3 | 把“成功/失败”恢复为可相信的结果 | 建议与 E-01 同一正确性里程碑 |
| 4 | E-04 统一新建入口与完成回执 | 5 | 2 | 同时减少入口认知成本和“创建后去哪找”断点 | E-01/E-02 先给出可靠完成态 |
| 5 | E-05 浏览器 2.0 | 4 | 3 | 补齐预览、批量整理和安全删除闭环 | E-01 先定义批量删除语义 |
| 6 | E-06 Cloze 同号分组 + hint | 4 | 2 | 数据层已支持同号，增量 UI 收益高 | E-01 的同号删除语义 |
| 7 | E-11 IO 编辑安全网 | 4 | 2 | IO 交互复杂，撤销/脏关闭价值高 | 可独立实施 |
| 8 | E-10 按源块分组 | 4 | 2 | 不改数据模型即可提供 Note 式管理 | E-01、E-05 |
| 9 | E-08 重复卡检测 | 4 | 2 | 防止卡库长期污染，确定性规则可增量落地 | E-03a；全库索引能力可能还需 E-03b |
| 10 | E-07 制卡预设 | 3 | 2 | 提高高频制卡效率，但需先稳定统一入口 | E-04 |
| 11 | E-09 富文本/媒体对齐 | 4 | 3 | 价值高，但 Direction fragment 切片渲染存在 Orca API 不确定 | 可先单独做 List live child |
| 12 | E-03b 大库分页/继续扫描 | 3 | 3 | 大库价值明确，但 Orca 分页能力仍待验证 | E-03a |
| 13 | E-12 普通卡导入/导出 | 4 | 3 | 迁移/备份价值高，但格式、媒体和批量写入边界较大 | E-03a、E-08；大库场景依赖 E-03b |
| 14 | E-13 有限卡型转换 | 3 | 3 | 使用频率低于创建/管理，却会改 cardKey 与调度语义 | E-01、E-02、E-03a、E-05 |

### 4.2 Top 5 建议

1. **先做 E-03a：硬规则即时合规。** 这是已确认的缓存、身份、读取边界和错误可见问题，范围可拆分且不依赖产品决策。
2. **第二做 E-01：删除闭环 + Choice 安全模式。** 删除复活、孤儿进度和 Choice 泄题调用链会破坏卡库可信度；批量删除和卡型转换也依赖统一删除语义。
3. **第三做 E-02：补偿事务与对称撤销。** 当前多步写入的半成品和 Direction 不对称撤销会让新入口继续扩大风险；回执必须以实际补偿结果为准。
4. **第四做 E-04：统一入口和完成回执。** 在底层已能准确返回完成态后，用一个“新建卡片…”选择器收敛名称、前置条件、牌组和“去哪里看”断点，收益会立即体现。
5. **第五做 E-05：浏览器正反面预览 + 批量标签/删除。** 现有搜索、筛选、多选和 partial failure 处理已是良好底座，这一步不需新建第二个卡库 UI，即可将“找到卡”升级为“看懂、批量整理、安全删除”。

---

## 第五节：不确定项与需要产品决策的问题

1. **“删除变体”的期望是结构删除，还是只停止复习？** 当前文案明说删除，但实现只清 SRS 数据（`src/components/flashcard-home/CardListItem.tsx:264-292`；`src/components/SrsFlashcardHome.tsx:206-229`）。建议将“删除”定义为结构+进度同步删除；若只想移出队列，已有“暂停”语义。
2. **无正确选项的 Choice 应阻断创建，还是允许草稿？** 当前允许成卡却无正常答题路径（`src/srs/choiceCardCreator.ts:136-160`；`src/components/ChoiceCardReviewRenderer.tsx:444-478`）。建议首版直接阻断；若要草稿，必须先定义它不进复习队列的持久状态，且不新造 type alias。
3. **无子块 Basic 是合法的“摘录式自评”，还是待补答案？** 当前会作为 back 为空的 Basic 收集（`src/srs/reviewCardFactory.ts:330-343`）。需决定在统一创建器中将它命名为“自评卡”，还是警告“缺少答案”。
4. **创建时牌组是否继续默认使用“最近牌组”？** 当前是隐式默认（`src/srs/cardTagDataBuilder.ts:7-23`）。建议保留快速默认，但在创建确认/回执中明示“牌组：X”并可一次修改。
5. **Cloze 同号分组的默认操作是什么？** 数据层支持同号去重，但新建永远 `max+1`（`src/srs/clozeUtils.ts:92-132,310-312`）。建议默认仍“新建 cN”，“加入已有 cN”放在同一工具栏菜单中而不用修饰键隐藏。
6. **Cloze 嵌套是否真的有产品需求？** 现有数据是平面 fragment，交错编号不等于嵌套（`src/srs/clozeUtils.ts:177-195`）。建议首先显式阻断，只有在渲染、编辑、删除和调度语义都定义后再开放。
7. **hint 是每个 fragment 一个，还是每个 cN 一个？** 同号分组时两者会产生不同交互。建议按 cN 共享：同号 fragment 的 hint 必须一致；检测到冲突时显式报错，不静默选一个。当前完全无 hint（`src/srs/clozeUtils.ts:190-195`）。
8. **卡片预览是只读还是可直接编辑？** `SafeBlockPreview` 当前明确用 normal 模式并“保留编辑能力”（`src/components/SafeBlockPreview.tsx:1-4,74-83`），同时卡片行点击/选择也是交互。建议浏览器默认只读，通过“编辑源块”进入唯一编辑会话。
9. **媒体策略是“通用字段”还是“Orca 原生块”？** Basic 已经能用 live child 保留媒体（`src/components/review-card/EmbeddedReviewBlocks.tsx:64-116`）。建议优先复用原生块/行内媒体，不在 SRS 属性中再保存资产路径副本。
10. **模板是“创建预设”还是 Anki 式 Note Template？** 当前没有 Note/template 身份（`src/srs/types.ts:95-133`）。建议先做不迁移数据的创建预设；只在确定需要一个 note 生成多种 front/back 模板后，再评估持久 Note 模型。
11. **卡型转换后的复习历史是否连续？** `basic:123` 与 `choice:123` 是不同 cardKey（`src/srs/cardIdentity.ts:81-133`）。建议默认重置调度并保留旧日志只读；若需“迁移历史”，必须单独设计映射，不用 substring 改日志 key。
12. **重复卡的规则和处理策略是什么？** 建议首版只检查同卡型中规范化 front/back 完全一致，只警告不强制合并。AI 现有去重只在当次草稿（`src/srs/ai/aiDialogState.ts:200-260`）。
13. **普通卡导入/导出的首发格式是什么？** 建议从 Basic TSV/CSV + 筛选结果 JSON 开始；Choice/Cloze/IO 的结构和媒体并不适合在第一版强行压平。Orca 宿主文件选择/下载 API 本次未找到足以承诺的完整证据，需待验证，不应臆造。
14. **是否需要把右键也扩展到全卡型？** 当前只有 IO（`src/srs/registry/contextMenuRegistry.tsx:227-245,808-841`）。建议右键只放一个“新建卡片…”打开选择器，不平铺七个菜单项；子菜单 API 若无本地证据，不依赖它。
15. **Topic 是否应从 SRS 制卡词汇中完全分离？** 代码已将它视为 IR（`src/srs/topicCardCreator.ts:42-92`；`src/srs/reviewCardFactory.ts:133-136`）。建议产品层统一叫“加入渐进阅读”，不再在普通卡型选择器里显示“Topic 卡片”；内部 type 保持 `topic` 以兼容旧数据。

---

## 扫描边界与验证说明

- 本报告没有修改代码、没有运行 Orca 真机交互、没有对 FSRS 数学算法本身下结论。
- Choice 题面存在静态高风险泄题调用链，仍待 Orca 真机复现；C-02 的 `_repr` 删除行为、preview ID 冲突和 Direction 部分 fragment 渲染能力同样待真机确认。
- 对 Anki/RemNote/SuperMemo 的引用只用来建立能力基准；所有“已存在/部分存在/缺失”判定都附了本仓库 `file:line` 证据。
