# SRS 选择题卡（Choice）

> **文档同步日期**：2026-07-13（审核修订：发现前提须 `#card`）  
> **变更说明**：新建后据代码校正。代码侧已有完整实现（`choiceUtils` / 提交门闩 / 统计存储 / 渲染器）。

---

## 概述

选择题以**父块为题干**、**直接子块为选项**。正确选项通过标签标记；复习时支持乱序、单选即时确认、多选提交、自动评分建议，以及选项维度的答题统计。

### 发现前提（易错）

| 阶段 | 实际要求 |
| ---- | -------- |
| **进入扫描 / 复习队列 / Flash Home** | 父块必须有 **`#card`**。`collectSrsBlocks` 与 `scanCardsFromTags` 只查询/过滤 `#card`；`orca.state.blocks` 合并也只认 `srs.card` / `srs.cloze-card` / `srs.direction-card`，**不含**单独的 `srs.choice-card`。 |
| **类型判定**（块已被发现后） | `extractCardType`：**优先**看是否有 `#choice`；否则读 `#card` 的 `type=choice`。 |
| **删除清理**（`deletedCardCleanup`） | `isStillSrsCard` 会把仅有 `#choice` 的块仍视为 SRS 卡，避免误删统计；**这不等于**仅有 `#choice` 就能被收集进队列。 |

> **错误做法**：只打 `#choice`、不打 `#card` → 通常**不会**出现在 Flash Home 或普通复习队列。  
> **正确做法**：父块同时具备 `#card`，并用 `#choice` 或 `type=choice` 标明选择题。

### 创建方式（无独立 createChoice 命令）

类型识别（在已有 `#card` 的前提下）：

1. **优先**：块上存在 `#choice` 标签（`isChoiceTag`，大小写不敏感）
2. 或 `#card` 的 `type` 属性为 `choice`

常见工作流：

1. 写好题干（父块）
2. 在下方添加若干子块作为选项
3. 在正确选项上打 `#correct` 或 `#正确`
4. 父块打 **`#card`**，并打 **`#choice`**（或设置 `#card` 的 `type=choice`）
5. 可选：父块打 `#ordered` 禁用选项乱序
6. 扫描或复习收集时写入/确保 `srs.*`；`scanCardsFromTags` / `makeCardFromBlock` 会将 `_repr.type` 设为 `srs.choice-card`

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

| 标签 | 作用 |
| ---- | ---- |
| `#choice` | **类型覆盖**：识别为选择题（优先于 `type` 字符串）；**不能替代**发现所需的 `#card` |
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
| `calculateAutoGrade` | 自动评分建议 |

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
2. `shuffleOptions` 得到展示顺序
3. 挂 `createChoiceAnswerHandler` 到 `onAnswer`
4. 渲染 `ChoiceCardReviewRenderer`

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
| `src/srs/tagUtils.ts` | choice/correct/ordered 标签 |
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
