# SRS 选择题卡（Choice）

> **文档同步日期**：2026-08-09  
> **变更说明**：选择题身份统一为 `#card` 的 `type=choice`（**不再**写入或识别独立 `#choice` 标签）；`extractCardType` 与 cloze/direction 同一路径。选项区未揭晓时隐藏整个 `.orca-tags`（真实 DOM 为 `data-name`）；题面继续用 `BlockTextPreview` 纯文本（**已知取舍**：题干富文本/图片暂不显示）。选项顺序按 `cardKey` 冻结仍有效。

---

## 概述

选择题以**父块为题干**、**直接子块为选项**。正确选项通过标签标记；复习时支持乱序、单选即时确认、多选提交、自动评分建议，以及选项维度的答题统计。

### 发现与类型（单真相源）

| 阶段 | 实际要求 |
| ---- | -------- |
| **进入扫描 / 复习队列 / Flash Home** | 父块必须有 **`#card`**。`collectSrsBlocks` 与 `scanCardsFromTags` 只查询/过滤 `#card`；`orca.state.blocks` 合并也只认 `srs.card` / `srs.cloze-card` / `srs.direction-card`，**不含**单独的 `srs.choice-card`。 |
| **类型判定**（块已被发现后） | `extractCardType` **只**读 `#card` ref data 的 `type` 字段；`type=choice` → `"choice"`（与 cloze/direction 同一路径）。 |
| **删除清理**（`deletedCardCleanup`） | 是否仍为 SRS 卡 = `isSrsCardBlock`（即有 `#card`）；与其它卡种一致。 |

> **正确做法**：父块打 `#card`，并将其 `type` 设为 `choice`（斜杠「创建选择题」会自动写入）。  
> 不要再依赖独立的 `#choice` 标签：插件创建路径不再写入它，类型判定也不再读取它。

### 创建方式

#### 推荐：斜杠命令「创建选择题」

- 命令：`${pluginName}.createChoiceCard`（`src/srs/choiceCardCreator.ts` → `createChoiceCardFromBlock`）
- 斜杠：`choiceCard`，group `SRS`，icon `ti ti-list-check`
- 行为：
  1. 无 `#card` → `insertTag` + `buildCardTagData(..., "choice")` + `ensureCardTagProperties`；已有则 `setRefData type=choice`，**写成功后** `invalidateBlockCache`
  2. `_repr = { type: "srs.choice-card", front, back, cardType: "choice" }`
  3. 新卡：`cleanupSrsProperties` + `writeInitialSrsState`；已有 `#card`：`ensureCardSrsState`（依赖上一步缓存失效）
  4. 直接子块均无 `#correct`/`#正确` 时 `info` 提示（**不阻断**）
- undoArgs：`blockId, originalRepr, originalText, pluginName, addedCardTag, wroteInitialSrs`
- 撤销：`undoBasicCardCreation`（按标志 cleanup / removeTag `card` / 还原 `_repr`）

#### 类型识别（在已有 `#card` 的前提下）

`#card` 的 `type` 属性为 `choice`（大小写不敏感）。

#### 手动标签工作流（仍有效）

1. 写好题干（父块）
2. 在下方添加若干子块作为选项
3. 在正确选项上打 `#correct` 或 `#正确`
4. 父块打 **`#card`**，并设置 **`type=choice`**
5. 可选：父块打 `#ordered` 禁用选项乱序
6. 扫描或复习收集时写入/确保 `srs.*`；`scanCardsFromTags` / `makeCardFromBlock` 也会将 `_repr.type` 设为 `srs.choice-card`

---

## 数据结构

### 类型（`types.ts`）

| 类型 | 含义 |
| ---- | ---- |
| `ChoiceMode` | `single` / `multiple` / `undefined`（正确选项数 1 / ≥2 / 0） |
| `ChoiceOption` | `blockId`, `text`, `content`, `isCorrect`, `isAnchor` |
| `ChoiceStatisticsEntry` | `timestamp`, `selectedBlockIds`, `correctBlockIds`, `isCorrect` |
| `ChoiceStatisticsStorage` | `{ version: 1, entries: [...] }` |

### 标签约定（`tagUtils.ts`）

| 标签 / 属性 | 作用 |
| ---- | ---- |
| `#card` + `type=choice` | **身份**：发现依赖 `#card`；类型由 ref data 的 `type` 决定 |
| `#correct` / `#正确` | 选项为正确项 |
| `#ordered` | 禁用乱序 |

### 块表示与 SRS

| 项 | 说明 |
| -- | ---- |
| `_repr.type` | `srs.choice-card` |
| FSRS | 父块普通 `srs.*`（与 basic 相同），**不是**按选项分状态 |
| 统计属性 | 父块 `srs.choice.statistics`（Text / JSON），最近最多 200 条 |
| `cardKey` | `choice:{blockId}` |

### 锚定选项

文本含下列关键词（大小写不敏感）的选项视为 **anchor**，乱序时固定在末尾（保持相对顺序）：

`以上`、`皆非`、`都是`、`都不是`、`all of the above`、`none of the above`、`all above`、`none above`

---

## 工具逻辑（`choiceUtils.ts`）

| 函数 | 说明 |
| ---- | ---- |
| `isAnchorOption` | 锚定检测 |
| `extractChoiceOptions` | 仅直接 children；`#correct`/`#正确` 判对 |
| `detectChoiceMode` | 按正确项数量 |
| `shuffleOptions(options, isOrdered)` | Fisher-Yates 非锚定段 + 锚定追加；ordered 时原序 |
| `resolveFrozenShuffledOptions({ cardKey, cache, rawOptions, ordered })` | 按 `cardKey`（`cardIdentity`）冻结展示顺序；换卡才重洗 |
| `calculateAutoGrade` | 自动评分建议（按 **blockId** 集合，与展示下标无关） |

### 自动评分规则

| 情形 | 建议 Grade |
| ---- | ---------- |
| mode `undefined` 或无正确项 | `null`（不自动评） |
| 单选且选中唯一正确项 | `good` |
| 单选错误 | `again` |
| 多选：有错选 | `again` |
| 多选：全对 | `good` |
| 多选：无错选但漏选 | `hard` |

`suggestChoiceGrade` 为同一规则的 pure 包装（`choiceAnswerStatistics.ts`）。

---

## 收集与路由

`collectReviewCards`：

- `cardType === "choice"`
- 无 children → 跳过
- 一张 ReviewCard：`front=题干`，`back=""`，`cardType: "choice"`

`SrsCardDemo`：

1. `extractChoiceOptions` + 检测 `#ordered`
2. `resolveFrozenShuffledOptions`（内部 `shuffleOptions`）按 **`buildCardKey({ cardType:"choice", blockId })`** 冻结展示顺序；同一张卡重渲染不重洗
3. 挂 `createChoiceAnswerHandler({ options: rawOptions })` 到 `onAnswer`（**用原始选项的 `isCorrect`/blockId**，不依赖展示下标）
4. 渲染 `ChoiceCardReviewRenderer`

### 复习题面 vs 编辑器块渲染（2026-08-09）

| 场景 | 组件 | 题干 | 选项 / 正确标记 |
| ---- | ---- | ---- | --------------- |
| **复习未作答** | `ChoiceCardReviewRenderer` 题面 | `BlockTextPreview` 纯文本题干（不挂宿主 `Block`，因此不会进 `ChoiceCardBlockRenderer.contentJsx`） | 选项只在下方 `ChoiceOptionRenderer`；未揭晓时 CSS 隐藏整个 `.orca-tags`（`#correct` 仍在 DOM，属视觉隐藏） |

### 题面富文本待办

题面目前是纯文本，题干中的加粗、图片、行内样式在复习时不显示。这是权衡后的暂定状态：

- **不能**裸用 `SafeBlockPreview` —— 会走到 `ChoiceCardBlockRenderer`，其 `contentJsx` 直接列出选项与「正确」标记，`SafeBlockPreview` 只隐藏 children，挡不住。
- **也不采用**「临时把 `_repr.type` 改成 `text` 再挂宿主 `Block`、卸载还原」的做法：那是为局部渲染去改全局共享 state，同块在笔记中同时打开会闪成普通文本块，卸载未执行（崩溃／错误边界）时 `_repr` 会残留错误值。已评估并否决。
- **正确方向**：只读地自绘根块的 content fragments（不触碰 `orca.state`），单独立项实现。
| **块编辑器** | `ChoiceCardBlockRenderer`（`srs.choice-card`） | 展示 front | 选项预览 + 绿色「正确」+ 统计指示（笔记视图，保持不变） |

**为何不能裸用 `SafeBlockPreview`（代码依据）**：

1. `ChoiceCardBlockRenderer` 在 **`contentJsx`** 里 `map(options → OptionPreviewItem)`，含绿色「正确」——不在 children 容器内。
2. `SafeBlockPreview` 只 CSS 隐藏 `.orca-block-children` / `.orca-repr-children`，**挡不住 contentJsx 选项列表**。
3. 真机泄题 DOM 还证明：选项块上 `#correct` 渲染在 `<span class="orca-tags">`，chip 属性为 **`data-name`**；旧选择器 `data-tag-name` 从未匹配。

回归：`ChoiceOptionRenderer.tagHide.test.ts`、`ChoiceCardReviewRenderer.questionFace.test.ts`、`choiceUtils.shuffleFreeze.test.ts`。

块编辑器：`ChoiceCardBlockRenderer`（`srs.choice-card`）展示题干、模式标签、子选项，并嵌入 `ChoiceStatisticsIndicator`。

---

## 复习交互

### 单选

- 点击选项后约 **150ms** 延迟提交（给用户改选窗口）
- 使用 `choiceSubmitGate` 防双击/快捷键竞态

### 多选

- 切换多选，Enter 或提交按钮确认
- 门闩：`tryBeginMultiSubmit` 同周期只 accept 一次

### 揭晓后

- 选项正确/错误样式
- 显示 `calculateAutoGrade` 建议；用户仍可选手动四档评分
- 只读回看：`readOnly` 时禁止选择/提交/评分

### 快捷键（`useReviewShortcuts` / `reviewShortcutRules`）

- 数字 1–9：选对应选项
- 多选 Enter / 空格（规则内）：提交

### 提交门闩边界（FC-06 / F2-05）

| 模块 | 职责 |
| ---- | ---- |
| `choiceSubmitGate` | **仅** Choice 答案提交（选项/延迟/多选 Enter）；不写 FSRS、不推进会话 |
| `reviewSessionActionGate` | 会话层 grade / postpone / suspend / 切卡 |

二者不得互相替代。

门闩 API 概要：`createChoiceSubmitGate`、`tryBeginSingleSubmit`、`canFireSingleSubmit`、`completeSingleSubmit`、`tryBeginMultiSubmit`、`cancelPendingSubmit`、`resetGateForCard`、`enterReadOnlyGate`、`isSubmitGateBlocking`。

---

## 答题统计（FC-08）

### 写入

- 触发：用户提交答案 → `onAnswer` → `recordChoiceAnswerStatistics`
- 正确性：`areChoiceAnswerSetsEqual`（集合全等；无正确项恒 `false`）
- 保存失败：`notify` 警告「选择题统计保存失败，本次答题仍可继续评分」，**不阻断** FSRS 评分

### 存储（`choiceStatisticsStorage.ts`）

| 项 | 值 |
| -- | -- |
| 属性名 | `srs.choice.statistics` |
| 版本 | `CHOICE_STATISTICS_STORAGE_VERSION = 1`（不支持静默迁移） |
| 上限 | `MAX_CHOICE_STATISTICS_ENTRIES = 200` |
| 并发 | 同 `blockId` 串行 save；损坏 JSON 抛错，避免空覆盖 |

### 编辑态指示器

`ChoiceStatisticsIndicator`：

- `loadChoiceStatistics` + `calculateOptionFrequency`
- 选项选择率；非正确项且错误占比高时警告  
  - 阈值约 30% 错误选择率，且至少 3 次样本

---

## 相关文件

| 路径 | 说明 |
| ---- | ---- |
| `src/srs/choiceUtils.ts` | 提取/乱序/自动评分 |
| `src/srs/choiceSubmitGate.ts` | 提交门闩 |
| `src/srs/choiceSubmitGate.test.ts` | 门闩测试 |
| `src/srs/choiceAnswerStatistics.ts` | entry 构造与 record |
| `src/srs/choiceAnswerStatistics.test.ts` | 统计逻辑测试 |
| `src/srs/choiceStatisticsStorage.ts` | 持久化 |
| `src/srs/choiceStatisticsStorage.test.ts` | 存储测试 |
| `src/srs/types.ts` | Choice 类型 |
| `src/srs/tagUtils.ts` | correct/ordered 标签（类型不再走独立 choice 标签） |
| `src/srs/cardCollector.ts` | 入队 |
| `src/srs/cardCreator.ts` | 扫描/转换 `_repr` |
| `src/srs/cardIdentity.ts` | `choice:{id}` |
| `src/srs/registry/renderers.ts` / `converters.ts` | `srs.choice-card` |
| `src/components/ChoiceCardReviewRenderer.tsx` | 复习 |
| `src/components/ChoiceOptionRenderer.tsx` | 选项 UI（隐藏 #correct 标签等） |
| `src/components/ChoiceCardBlockRenderer.tsx` | 编辑器块 |
| `src/components/ChoiceStatisticsIndicator.tsx` | 频率指示 |
| `src/components/SrsCardDemo.tsx` | 路由与 shuffle |
| `src/hooks/useReviewShortcuts.ts` / `reviewShortcutRules.ts` | 快捷键 |
