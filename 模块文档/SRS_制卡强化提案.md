# SRS 制卡强化提案

> 初版扫描：2026-08-09（只读代码/文档扫描）
> 最近更新：2026-08-09，删除已修复条目的详情，仅保留一行结论。
> 范围：普通 SRS 卡片的创建、编辑、预览、浏览、删除与复习形态。渐进阅读、Book IR、EPUB/Web 导入、章末小测不在范围内。

硬约束见 `AGENTS.md`：属性写后必须失效缓存、`cardKey` 只能由 `src/srs/cardIdentity.ts` 生成、批量读块有界、错误不得静默降级、`srs.*` / `srs.cN.*` / `srs.forward|backward.*` 命名空间不可破坏。

---

## 一、已修复（仅存档，勿重复处理）

| 原编号 | 问题 | 修复 |
| --- | --- | --- |
| C-13 | List 卡 `setRefData(type=list)` 后缺 `invalidateBlockCache` | `c23d05f` |
| C-06 | 通用卡块编辑器保存会把 Cloze/Direction 结构压平成纯文本 | `4cc6e95` 结构化卡不再暴露行内编辑入口 |
| C-11 | 四个复习渲染器手拼 cardKey，绕过 `cardIdentity.ts` | `18c5642` |
| C-01 | 删除 Cloze/Direction 变体只清属性不删结构，下次收集复活 | `ecac9a1` 删除 = 删结构 + 删进度，保留文字 |
| C-03 | List 整卡删除遗留子块进度，重建会继承 | `ecac9a1` 一并清理当前全部直接子块 |
| U-01 | 选择题选项在作答中随重渲染重新洗牌 | `0f8de96` 按 cardKey 冻结；判定仍走 blockId，不会错位 |
| C-09 | 方向卡 undo 只还原 content，留下隐藏卡身份 | `6440d53` 接入 `cardCreationUndo` |
| C-12 | 收集兜底失败后 `tagged = []`，把读取失败显示成「没有卡」 | `e96b963` 改为可见失败 |
| C-04 | 选择题复习未作答即泄答案 | `a169a4e` 真因是选项区标签 CSS 选择器写错（宿主用 `data-name`，旧代码写 `data-tag-name`，从未匹配）；改为整体隐藏 `.orca-tags` |

**C-04 的教训值得记住**：初版报告把泄题归因于题面渲染链，据此所做的修改并未解决问题；真因由真机 DOM 才确认。**涉及宿主 DOM/渲染行为的判断，静态代码分析不足以定性，必须真机验证。**

---

## 二、待处理

### P0 —— 无

已知的数据正确性与信任破坏类问题均已修复。

### P1 —— 值得做

| ID | 问题 | 证据 | 说明 |
| --- | --- | --- | --- |
| C-05 | 无正确项的选择题能创建成功，但复习时没有可用的提交路径，只能跳过；仍计入应复习数 | `src/srs/choiceCardCreator.ts:136-160`；`src/components/ChoiceCardReviewRenderer.tsx:444-478` | **需产品决策**：建议直接阻断创建（已有「暂停」承接其它需求）。决策后改动很小 |
| C-07 | Cloze/Direction/Choice 创建是多阶段写入，后阶段失败不补偿前阶段，留下半成品卡 | `src/srs/clozeUtils.ts:327-397`；`src/srs/directionUtils.ts:130-180`；`src/srs/choiceCardCreator.ts:65-115` | 本提案剩余的唯一大工程。需要快照 + best-effort 补偿 + 诚实回执（补偿失败不得报「已回滚」） |
| U-02 | 选择题多选的提交按钮「禁用」只是 CSS class，没有 HTML `disabled`，`handleSubmit` 也不拦空集合 | `src/components/ChoiceCardReviewRenderer.tsx:239-256,444-464` | 可空提交并拿到 Hard；键盘/辅助技术不知其应禁用。修复很便宜 |
| — | 选择题题干在复习中是纯文本，富文本/图片丢失 | `src/components/ChoiceCardReviewRenderer.tsx:416` | 修 C-04 时的取舍。正确做法：只读自绘 content fragments，**不得**碰 `orca.state`（临时改 `_repr` 的方案已实现并否决，见 `问题经验.md`） |
| — | 填空卡复习用 `color: transparent` 遮盖答案，答案仍在 DOM，全选复制会现形 | `src/components/ClozeReviewBlockContent.tsx:167-184` | 与 C-04 同类。其选择器由插件自己生成，不像标签那条会拼错，故未在真机暴露 |

### P2 —— 体验与一致性

| ID | 问题 | 证据 |
| --- | --- | --- |
| U-03 / U-04 | Direction 创建按 `block.text` 重建全块，富文本被降级；Direction/List 复习不保留媒体 | `src/srs/directionUtils.ts:103-125,382-415`；`src/components/ListCardReviewRenderer.tsx:90-102` |
| U-05 | 浏览器预览隐藏 children，Basic 答案与 List 条目不可见 | `src/components/SafeBlockPreview.tsx:19-45` |
| U-07 / U-08 | 图片遮罩编辑器无撤销栈、无脏数据关闭确认；图片加载失败无 `onError` 状态 | `src/components/image-occlusion/useIoEditorController.ts:68-88` |
| U-10 / U-14 / U-15 | 入口命名混乱（记忆卡/闪卡/问答卡混用）；AI 批量有两个同名命令；Topic 在普通卡型词汇中出现 | `src/srs/registry/uiComponents.tsx:168-264`；`src/srs/registry/commands.ts:412-434` |
| U-11 | 创建后只有短 toast，不说明卡进了哪个牌组、能否复习、去哪看 | 各 creator 的 notify 调用 |
| U-12 | 「转换为记忆卡」对已有专用卡型不会稳定改回 basic，可产生混合身份 | `src/srs/cardCreator.ts:240-319` |
| U-16 | 无子块 Basic 与空 List 的「完成」定义不一致 | `src/srs/reviewCardFactory.ts:302-343` |

### 待验证（未经真机确认，不得当作已知缺陷）

- **C-02**：整卡删除后 `_repr` 是否残留、是否导致重新收集。取决于 Orca `removeTag` 的宿主行为。
- **C-10**：`get-all-blocks` 兜底仅在标签查询全部抛错时触发（有 `cardCollector.fallback.test.ts` 锁定），初版报告标「高」偏重。真正需要 cap 的是子树递归与反链展开：`src/srs/blockCardCollector.ts:183-265`、`src/srs/childCardCollector.ts:126-169`。
- **U-06**：预览用的 virtual panel/style ID 只含 blockId，同块多变体共用，是否在真机产生可见故障未确认。

---

## 三、功能增强提案（尚未实施）

按价值/成本排序，均为增量、不改数据模型的方案。

| ID | 提案 | 价值 | 成本 | 依赖 |
| --- | --- | --- | --- | --- |
| E-04 | 统一「新建卡片…」入口 + 完成回执（明示牌组与去向） | 高 | M | C-07 先给出可靠完成态 |
| E-05 | 卡片浏览器 2.0：正反面预览 + 批量标签/删除 | 高 | L | 删除语义已就绪 |
| E-06 | Cloze 同号分组 + hint（数据层已支持同号去重，缺 UI） | 中高 | M | — |
| E-11 | 图片遮罩编辑安全网（撤销栈 + 脏关闭确认 + 图片错误态） | 中高 | M | 可独立实施 |
| E-10 | 浏览器「按源块分组」，把同块多变体变成 Note 式体验 | 中高 | M | E-05 |
| E-08 | 重复卡检测（首版只做 Basic/Direction 的确定性内容指纹，只警告不合并） | 中 | M | — |
| E-07 | 制卡预设（存 settings，不写进卡块） | 中 | M | E-04 |
| E-12 | 普通卡导入/导出（TSV/CSV + 筛选结果 JSON） | 中 | L | 宿主文件 API 待验证 |
| E-13 | 有限的卡型转换（统一重置调度，旧日志只读保留） | 中 | L | E-05 |

**兼容底线**：不改既有属性命名空间；预设/模板不落到卡块；卡型转换视为显式迁移，不承诺跨 cardKey 迁移进度；所有身份操作只经 `cardIdentity.ts`。

---

## 四、需要产品决策的问题

1. **无正确项的选择题**：阻断创建，还是允许草稿？（建议阻断）
2. **无子块的 Basic**：是合法的「自评卡」，还是待补答案的草稿？
3. **创建时的牌组**：继续隐式用「最近牌组」，还是在回执中明示并可改？（建议后者）
4. **Cloze hint 的粒度**：每个 fragment 一个，还是每个 cN 共享？（建议按 cN 共享，冲突时报错）
5. **Cloze 嵌套**：是否有真实需求？（建议先显式阻断）
6. **Topic**：是否从普通卡型词汇中彻底分离，统一叫「加入渐进阅读」？（建议是，内部 type 保持 `topic`）
