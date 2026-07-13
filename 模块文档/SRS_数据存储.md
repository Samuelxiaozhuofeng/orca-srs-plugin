# SRS 数据存储模块

## 概述

本模块负责 SRS 卡片状态的持久化读写，通过 Orca 的块属性系统将卡片的复习状态存储到块中。

### 核心价值

- 将 SRS 状态与 Orca 块系统无缝集成
- 支持读取、保存和更新卡片状态
- 自动初始化新卡片的状态

## 技术实现

### 核心文件

- [storage.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/storage.ts)

### 存储机制

SRS 状态通过 Orca 的块属性（`block.properties`）存储。

#### 普通卡片属性

| 属性名             | 类型     | 说明                  |
| ------------------ | -------- | --------------------- |
| `srs.isCard`       | Boolean  | 标记块是否为 SRS 卡片 |
| `srs.stability`    | Number   | 记忆稳定度            |
| `srs.difficulty`   | Number   | 记忆难度              |
| `srs.interval`     | Number   | 间隔天数              |
| `srs.due`          | DateTime | 下次复习时间          |
| `srs.lastReviewed` | DateTime | 上次复习时间          |
| `srs.reps`         | Number   | 复习次数              |
| `srs.lapses`       | Number   | 遗忘次数              |

#### Cloze 卡片属性

Cloze 卡片的每个填空有独立的 SRS 状态，属性名包含填空编号：

| 属性名（示例 c1）     | 类型     | 说明              |
| --------------------- | -------- | ----------------- |
| `srs.c1.stability`    | Number   | c1 的记忆稳定度   |
| `srs.c1.difficulty`   | Number   | c1 的记忆难度     |
| `srs.c1.interval`     | Number   | c1 的间隔天数     |
| `srs.c1.due`          | DateTime | c1 的下次复习时间 |
| `srs.c1.lastReviewed` | DateTime | c1 的上次复习时间 |
| `srs.c1.reps`         | Number   | c1 的复习次数     |
| `srs.c1.lapses`       | Number   | c1 的遗忘次数     |

### 内部函数

模块内部使用统一的函数处理普通卡片和 Cloze 卡片：

#### `buildPropertyName(base, clozeNumber?): string`

构建属性名称。普通卡片返回 `srs.{base}`，Cloze 卡片返回 `srs.c{N}.{base}`。

#### `loadSrsStateInternal(blockId, clozeNumber?): Promise<SrsState>`

内部加载函数，统一处理普通卡片和 Cloze 卡片的状态加载。

#### `saveSrsStateInternal(blockId, newState, clozeNumber?): Promise<void>`

内部保存函数，统一处理普通卡片和 Cloze 卡片的状态保存。

#### `invalidateBlockCache(blockId): void`（导出）

清除指定块的内部缓存。当外部模块（如 `cardStatusUtils.ts`）直接修改块属性后调用，确保下次 `collectReviewCards` 读取最新数据。

```typescript
import { invalidateBlockCache } from "./storage"

// 修改属性后清除缓存
await orca.commands.invokeEditorCommand("core.editor.setProperties", ...)
invalidateBlockCache(blockId)
```

#### FC-13 批量读取与缓存预热

全库收集先用 `preheatBlockCache(blocks)` 将 `get-blocks-with-tags` 已返回的完整卡片块写入短期缓存，避免同一张卡及其 Cloze/Direction 变体再次逐个调用 `get-block`。

List 子块等未随标签查询返回的块使用 `prefetchBlocksByIds(ids, options)` 调用正式 Backend API `get-blocks`：

- 去重后分批读取，`batchSize` 默认且硬上限为 50。
- 最大并发批次数默认且硬上限为 4；禁止无上限 `Promise.all`。
- `NaN`、`Infinity`、非正数、小数和过大参数由 `normalizeBoundedPositiveInt` 归一化，小数向下取整，无效值回退默认。
- 批量读取失败会 `console.error` 并抛出，不用空结果掩盖后端错误。
- 评分或属性写入后仍必须调用现有精确失效路径；该缓存不是跨会话长期索引。

### 公开 API - 普通卡片

#### `loadCardSrsState(blockId): Promise<SrsState>`

从块属性中读取 SRS 状态。

```typescript
const state = await loadCardSrsState(blockId);
console.log(`下次复习：${state.due}`);
```

#### `saveCardSrsState(blockId, newState): Promise<void>`

将 SRS 状态保存到块属性。

```typescript
await saveCardSrsState(blockId, newState);
```

#### `writeInitialSrsState(blockId, now?): Promise<SrsState>`

为新卡片写入初始状态。

```typescript
const initial = await writeInitialSrsState(blockId);
```

#### `updateSrsState(blockId, grade): Promise<{state, log}>`

一步完成：读取状态 → 计算新状态 → 保存。

```typescript
const result = await updateSrsState(blockId, "good");
console.log(`新间隔：${result.state.interval} 天`);
```

### 公开 API - Cloze 卡片

#### `loadClozeSrsState(blockId, clozeNumber): Promise<SrsState>`

加载 Cloze 卡片某个填空的 SRS 状态。

```typescript
const state = await loadClozeSrsState(blockId, 1); // 加载 c1 的状态
```

#### `saveClozeSrsState(blockId, clozeNumber, newState): Promise<void>`

保存 Cloze 卡片某个填空的 SRS 状态。

```typescript
await saveClozeSrsState(blockId, 1, newState);
```

#### `writeInitialClozeSrsState(blockId, clozeNumber, daysOffset?): Promise<SrsState>`

为 Cloze 卡片的某个填空写入初始状态，支持设置到期时间偏移。

```typescript
// c1 今天到期，c2 明天到期，c3 后天到期
await writeInitialClozeSrsState(blockId, 1, 0);
await writeInitialClozeSrsState(blockId, 2, 1);
await writeInitialClozeSrsState(blockId, 3, 2);
```

#### `updateClozeSrsState(blockId, clozeNumber, grade): Promise<{state, log}>`

更新 Cloze 卡片某个填空的 SRS 状态。

```typescript
const result = await updateClozeSrsState(blockId, 1, "good");
```

### 属性类型映射

使用 Orca 编辑器命令保存属性时的类型编码：

| 类型值 | 类型名称 | 用途     |
| ------ | -------- | -------- |
| 2      | String   | 文本值   |
| 3      | Number   | 数值     |
| 4      | Boolean  | 布尔值   |
| 5      | DateTime | 日期时间 |

## 使用场景

### 1. 评分后更新状态

```typescript
// 用户点击 "Good" 按钮
const result = await updateSrsState(blockId, "good");
orca.notify("success", `下次复习：${result.state.due}`);
```

### 2. 检查卡片是否需要复习

```typescript
const state = await loadCardSrsState(blockId);
const now = new Date();
if (state.due <= now) {
  console.log("卡片已到期，需要复习");
}
```

## 扩展点

1. **批量操作**：当前支持受控批量读取；批量写入仍可扩展
2. **导出备份**：可扩展将状态导出为 JSON
3. **状态重置**：可扩展重置卡片进度

## 复习日志存储与卡片身份（v2）

复习日志由 `reviewLogStorage.ts` 按月分片持久化（键：`reviewLogs_YYYY_MM`）。

### 落盘确认与失败重试（FC-03）

| API | 语义 |
| --- | ---- |
| `saveReviewLog` | 仅 enqueue + 调度延迟 flush，**不保证**立即落盘 |
| `saveAndFlushReviewLog` | enqueue 后立即走共享 flush，**仅当该日志 ID 已确认写入**后 resolve；失败 reject 且 pending 保留 |
| `flushReviewLogs(pluginName)` | 处理该插件当前 pending；并发调用链式串行，共享/等待，不双开互相覆盖 |

**pending / 缓存规则：**

- pending **按 `pluginName` 隔离**；测试/重置 API（`clearAllReviewLogs`）只清对应插件的 pending、定时器与**该插件**内存缓存。
- 内存 `logCache` 使用 **`pluginName + storageKey` 复合键**；禁止不同插件共用 `reviewLogs_YYYY_MM` 缓存导致串写。全局 `clearLogCache()` 仍用于 FC-04 直接写分片后的全量失效。
- **只有对应分片 `setData` 成功后**，且 pending 中该 ID **仍为快照同一对象引用**时才移除；flush 等待期间同 ID 再 enqueue 的更新版本必须保留并由下一轮 drain 写入。
- `getData` / JSON 解析 / `setData` 任一失败都保留待写日志。
- `loadMonthLogs` 读取失败**抛出清晰错误**，不得返回 `[]` 再合并写入（避免覆盖旧数据）。
- 按月分片：一个分片失败不影响其他已成功分片的移除；失败分片 ID 保留。
- 按 `ReviewLogEntry.id` **幂等合并**：同一 ID 重复 enqueue / 重试最终只落盘一条（内容以最新版本为准）。

**重试策略（有限，非自动无限）：**

- 定时 flush / 主动 flush / 评分 `saveAndFlush` / 会话关闭 / 插件 unload 失败时：**pending 保留**，`console.error` 记录错误。
- **不**在失败后自动无限重试；下一次 `save` / `flush` / 会话关闭 / `unload` 再尝试写入。
- 定时器 Promise 必须 `.catch`，禁止 unhandled rejection。

**评分路径：** `gradeReviewCard` 使用 `saveAndFlushReviewLog`。SRS 状态已成功但日志失败时返回 `ok: true` + `warning` 含「评分已保存，但统计日志保存失败」，不把已成功评分整体标为失败。

**卸载顺序：** 见 `pluginUnloadSequence.ts` / `main.unload()`——在 Orca 插件数据 API 仍可用、注销清理**之前**调用 `flushReviewLogs`；失败 notify（若可用）后继续卸载，不宣称日志已落盘。

### 复习时长字段（FC-10）

| 字段 | 必填 | 说明 |
| ---- | ---- | ---- |
| `duration` | 是 | **有效时长**（毫秒），统一 0..60000。新日志写入 `calculateEffectiveDuration` 结果 |
| `rawDuration` | 否 | 安全非负**原始墙钟**（毫秒）；异常（负/NaN/Infinity）写 0；**无** 60s 上限 |

**产品规则：** 墙钟计时（隐藏/失焦/编辑暂不暂停）；单卡有效时长最多 60 秒；时间回拨等异常 → 有效 0。

**兼容：**

- 旧日志只有 `duration`：`effectiveDurationFromReviewLog(log)` 再次归一化（幂等；历史 >60s 截断）。
- 新字段 `rawDuration` 可选；v1/v2/legacy 读写路径不因该字段报错或丢失其它字段（`normalizeReviewLogIdentity` 展开保留）。
- 统计页（`statisticsManager` 今日 totalTime、daily trend/time 等）**只**通过 `effectiveDurationFromReviewLog` 累加 `duration`，**不**累加 `rawDuration`。
- 实现唯一源：`sessionProgressTracker.ts`（`MAX_EFFECTIVE_CARD_DURATION_MS`、`calculateEffectiveDuration`、`computeReviewTiming` 等）。

**评分路径 timing：** `gradeReviewCard` 单次 `now` 生成 `timestamp` + `rawDuration` + `effectiveDuration`；日志失败时 `timing` 仍返回，会话进度可记同一有效值。

### 存储版本

| version | 说明 |
| ------- | ---- |
| 1 | 仅有 `cardId` 等基础字段；读取时归一化为 `legacy` |
| 2 | 新日志写入完整结构化身份；当前写入版本（可含可选 `rawDuration`） |

### 结构化身份字段（新日志必写）

| 字段 | 说明 |
| ---- | ---- |
| `blockId` | 父卡块 ID（List 仍为列表根块） |
| `cardType` | basic / cloze / direction / list / choice / … |
| `cardKey` | 稳定字符串身份，**仅**由 `src/srs/cardIdentity.ts` 生成 |
| `clozeNumber` / `directionType` / `listItemId` | 变体字段（按类型） |
| `legacy` | 新日志为 `false`；旧数据读取后为 `true` |
| `cardId` | **兼容字段**：List 用 `listItemId`，其余用父 `blockId`。新逻辑不得用 `cardId` 猜变体 |

`cardKey` 格式示例：

- `basic:100` / `choice:100`
- `cloze:100:c1`
- `direction:100:forward`
- `list:100:item:201`
- 旧日志归一化：`legacy:100`

日志 ID：`createReviewLogId(timestamp, cardKey)`（仍兼容传入 numeric `cardId`）。

### 旧日志兼容

- 读取 version 1 或缺少身份字段的记录时：**不报错**，调用 `normalizeReviewLogIdentity` 标记 `legacy: true`，并补 `blockId` / `cardKey`。
- 旧日志仍可参与今日统计等聚合。
- **限制**：legacy 日志无法区分同一父块下的 Cloze c1/c2、Direction 正反向等变体；困难卡匹配对 legacy 仅按父块（及 List 旧 `listItemId`）兼容。

### 已删除卡片日志清理（FC-04）

启动时由 `deletedCardCleanup.ts` 扫描分片并清理无效日志。返回报告：

| 字段 | 说明 |
| ---- | ---- |
| `cleanedCount` | 实际写入成功后删除的条数 |
| `retainedUnknownCount` | 因 unknown/无效字段而保留的条数 |
| `errors` | 可读错误（含 storageKey / blockId 等） |

#### 块读取三态

| 状态 | 含义 |
| ---- | ---- |
| `exists` | `orca.state.blocks` 命中，或 `get-block` 在超时内返回可验证块（object + 有限 number id === 请求 id） |
| `missing` | 后端明确返回 `null` / `undefined` |
| `unknown` | 后端抛错、**timeout**、或非 null 但身份不可判定；**不得当 missing 删除** |

通用实现：`src/srs/blockExistence.ts`（`resolveBlockExistence` / `BlockExistenceCache` / `DEFAULT_GET_BLOCK_TIMEOUT_MS` / 最小身份校验）。
超时后晚到的 backend 结果不得写 state 或改写已返回结论。`deletedCardCleanup.ts` 与复习会话（F2-06）共用三态语义；cleanup 在单次运行内对 blockId 缓存结果；复习当前卡路径可对 unknown 真实重试。

同一清理运行内对 blockId 缓存读取结果。直接 `setData` / `removeData` 修改分片后必须 `clearLogCache()`。

#### 结构化日志有效规则

| 类型 | 保留条件 | 可删除 |
| ---- | -------- | ------ |
| Basic / Excerpt / Choice | 父块 exists、仍是 SRS 卡、`cardType` 与日志一致 | 父 missing 或类型已变 |
| Cloze | 父 exists、类型 cloze、`clozeNumber` 仍在内容中 | 父 missing / 非 cloze / 编号消失 |
| Direction | 父 exists、类型 direction、`directionType` 仍在当前方向定义集合中 | 父 missing / 方向集合不再包含 |
| List | 父 exists 且为 list；`listItemId` 在直接 children 中；子块 exists | 父/子 missing，或条目不再属于父列表 |

字段不完整或 `cardKey` 自相矛盾：按 unknown **保留**并记错误；仅当**明确父块 `blockId` missing** 时可删。

**分类注意（不得用 `isStructuredReviewLog` 反推 legacy）**：

| 类别 | 条件 | 规则 |
| ---- | ---- | ---- |
| pure legacy | `legacy === true`，或**完全没有任何**结构化痕迹（无 blockId/cardType/cardKey/变体/`legacy:false`） | 仅按 `cardId` 存在性 |
| 结构化（完整或部分） | 存在任一结构化痕迹（如 `legacy === false`、blockId、cardType、cardKey、clozeNumber、directionType、listItemId） | 先做完整性/一致性校验；不完整且父 exists/unknown → 保留；仅父 `blockId` 明确 missing 才可删 |

部分结构化 List 日志若 `cardId=listItemId` 且子条目 missing，**不得**因误判 legacy 而删除。

#### legacy 清理

仅检查 `cardId` 指向块的存在性：exists 保留，missing 删除，unknown 保留。不猜卡型，不因无 `#card` 标签删除。

#### 存储错误

分片 JSON 解析失败、`getData` / `getDataKeys` / `setData` / `removeData` 失败时不得吞掉：保留未确认数据，`errors` 含具体 `storageKey`，不得宣称清理成功。

### 相关模块

- `src/srs/cardIdentity.ts`：唯一身份生成与比较来源
- `src/srs/reviewCardGrading.ts`：评分时写入结构化身份
- `src/srs/difficultCardsManager.ts`：精确 `cardKey` 匹配
- `src/srs/childCardCollector.ts`：`getCardKey` / `getParentCardKey` 复用统一身份
- `src/srs/blockExistence.ts`：块 exists/missing/unknown 通用解析
- `src/srs/deletedCardCleanup.ts`：启动时按三态 + 结构化身份清理日志

## 选择题答题统计（FC-08）

### 方案：单块属性 + 最近 200 条上限

选择题统计**不**使用插件分片数据，而是把全部历史写入**该选择题卡片块**上的单个属性，每次读-改-写全量重写。

| 项 | 值 |
| -- | -- |
| 属性名 | `srs.choice.statistics` |
| 属性类型 | Text（`type = 1`），JSON 字符串 |
| 版本字段 | `version: 1` |
| 条数上限 | `MAX_CHOICE_STATISTICS_ENTRIES = 200`（仅保留最近 200 次提交） |
| 裁剪方式 | 追加后 `slice` 尾部，保持按时间/追加顺序 |

JSON 形态：

```json
{
  "version": 1,
  "entries": [
    {
      "timestamp": 1703404800000,
      "selectedBlockIds": [123, 456],
      "correctBlockIds": [123],
      "isCorrect": false
    }
  ]
}
```

`isCorrect`：题目**至少有一个正确选项**，且 selected/correct **集合完全相等**（无错选且无漏选，顺序无关）。空正确集合始终 `false`（与 `calculateAutoGrade` 在无正确项时返回 `null` 对齐，不得记 true）。

- 单选：正确 → good / `isCorrect=true`，否则 again / false
- 多选：有错选 → again；无错但漏选 → hard；完全相等 → good / true
- 无正确选项（mode undefined）：自动评分 null，`isCorrect=false`

`deserializeStatistics` **仅接受**当前整数版本 `CHOICE_STATISTICS_STORAGE_VERSION`（现为 1）；缺失、小数、其它版本均抛错（无迁移逻辑，防止误读覆盖）。

### 安全加载（禁止用空数据覆盖）

| 场景 | `loadChoiceStatistics` 行为 |
| ---- | --------------------------- |
| 块存在，属性缺失或空值 | 返回 `[]` |
| `get-block` 抛错 | `console.warn` 后**抛出** |
| 块不存在（undefined） | `console.warn` 后**抛出** |
| 属性 JSON 损坏 / 结构非法 / ID 非 DbId | `console.warn` 后**抛出**（deserialize 不静默默认化） |

这样 save 在 load 失败时不会把旧数据覆盖成空数组。

### 并发与失败产品规则

- **同一 blockId**：`saveChoiceStatistics` 内部 Promise 链串行读-改-写；调用者仍收到真实 rejection。
- **不同 blockId**：互不阻塞。
- **setProperties** 若返回明确 `Error` 实例则抛出；其余依赖 Promise reject。
- **复习层**（`recordChoiceAnswerStatistics` / `SrsCardDemo`）：保存失败 `console.error`/`warn` + `orca.notify("warn", "选择题统计保存失败，本次答题仍可继续评分")`，**不阻断** FSRS 评分；成功不打扰用户。
- **防重复**：同一次提交只 save 一次，依赖 FC-06 `choiceSubmitGate`；集成层可用 `submitChoiceAnswerOnce` 验证。
- **展示**：`ChoiceStatisticsIndicator` / `calculateOptionFrequency` 只统计当前仍存在的选项 ID；旧记录含已删除选项时过滤掉且不报错。加载失败走 warn，不显示假数据。

### 核心 API

| 函数 | 说明 |
| ---- | ---- |
| `serializeStatistics` / `deserializeStatistics` | 严格往返；损坏抛错 |
| `appendChoiceStatisticsEntries` | 纯 append + trim |
| `loadChoiceStatistics` / `saveChoiceStatistics` | 块属性读写；save 按块串行 |
| `calculateOptionFrequency` | 频率（过滤已删选项） |
| `buildChoiceStatisticsEntry` / `recordChoiceAnswerStatistics` / `createChoiceAnswerHandler` | 见 `choiceAnswerStatistics.ts` |

## 相关文件

| 文件                                                                         | 说明         |
| ---------------------------------------------------------------------------- | ------------ |
| [storage.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/storage.ts)     | 存储核心实现 |
| [algorithm.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/algorithm.ts) | 算法调用     |
| [types.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/types.ts)         | 类型定义     |
| `src/srs/cardIdentity.ts` | 卡片稳定身份 |
| `src/srs/reviewLogStorage.ts` | 复习日志读写与可靠 pending/flush |
| `src/srs/pluginUnloadSequence.ts` | 卸载前 flush 顺序 helper |
| `src/srs/reviewSessionClose.ts` | 会话关闭统一 flush helper |
| `src/srs/deletedCardCleanup.ts` | 已删除卡片日志清理 |
| `src/srs/choiceStatisticsStorage.ts` | 选择题统计块属性存储（FC-08） |
| `src/srs/choiceAnswerStatistics.ts` | 答题 entry 构造与复习保存回调 |
