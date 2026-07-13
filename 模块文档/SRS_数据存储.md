# SRS 数据存储模块

> **文档同步日期：2026-07-13**  
> 变更说明：以代码为准校正块属性表（含 Direction / `state` / `resets`）、相关文件路径；补充会话进度 `sessionStorage`（FC-09）、三态存在性与日志/选择题统计要点。

## 概述

本模块负责 SRS 卡片状态与相关附属数据的持久化读写：

| 数据 | 存储位置 | 核心文件 |
|------|----------|----------|
| 卡片 FSRS 状态 | 块属性（`srs.*` / `srs.cN.*` / `srs.forward|backward.*`） | `src/srs/storage.ts` |
| 复习日志 | 插件分片数据 `reviewLogs_YYYY_MM` | `src/srs/reviewLogStorage.ts` |
| 已删除卡日志清理 | 启动扫描分片 + 块三态 | `src/srs/deletedCardCleanup.ts` + `src/srs/blockExistence.ts` |
| 选择题答题统计 | 单块属性 `srs.choice.statistics` | `src/srs/choiceStatisticsStorage.ts` |
| 会话进度（诊断/autosave） | `sessionStorage` 键 `srs-session-progress:v2:…` | `src/srs/sessionProgressStorage.ts` |

### 核心价值

- 将 SRS 状态与 Orca 块系统无缝集成
- 支持普通卡 / Cloze 变体 / Direction 方向变体的独立状态
- 复习日志可靠 pending/flush；启动时按三态清理无效日志
- 会话进度**不**做跨重启断点恢复（FC-09 第一阶段）

## 技术实现

### 核心文件

- `src/srs/storage.ts` — 卡片 SRS 状态读写、块缓存与批量预取
- `src/srs/reviewLogStorage.ts` — 复习日志按月分片
- `src/srs/blockExistence.ts` — 块 exists / missing / unknown
- `src/srs/deletedCardCleanup.ts` — 启动清理
- `src/srs/choiceStatisticsStorage.ts` — 选择题统计
- `src/srs/sessionProgressStorage.ts` — 会话进度 sessionStorage
- `src/srs/sessionProgressTracker.ts` — 有效时长与进度状态（FC-10）

---

## 1. 卡片 SRS 状态（`storage.ts`）

### 存储机制

SRS 状态通过 Orca 的块属性（`block.properties`）存储。命名规则：

| 卡型 | 属性前缀 | 示例 |
|------|----------|------|
| 普通 / List 根 / Choice 等 | `srs.` | `srs.due` |
| Cloze 每个填空 | `srs.c{N}.` | `srs.c1.due` |
| Direction 每个方向 | `srs.forward.` / `srs.backward.` | `srs.forward.due` |

### 属性字段（所有前缀共用）

| 属性基名 | 类型编码 | 说明 |
|----------|----------|------|
| `isCard` | Boolean (4) | 仅普通卡路径写入 `srs.isCard=true` |
| `stability` | Number (3) | 记忆稳定度 |
| `difficulty` | Number (3) | 记忆难度 |
| `interval` | Number (3) | 间隔天数（FSRS `scheduled_days`） |
| `due` | DateTime (5) | 下次复习时间 |
| `lastReviewed` | DateTime (5) | 上次复习时间；`null` 表示新卡 |
| `reps` | Number (3) | 复习次数 |
| `lapses` | Number (3) | 遗忘次数 |
| `resets` | Number (3) | 用户主动重置次数（评分后继承） |
| `state` | Number (3) | FSRS 内部状态：0=New, 1=Learning, 2=Review, 3=Relearning |

### 属性类型编码（本项目实际写入值）

| 类型值 | 用途（代码中的用法） |
|--------|----------------------|
| 1 | Text（选择题统计 JSON 字符串） |
| 2 | String（如会话块 `srs.pluginName` / `srs.sessionId`） |
| 3 | Number |
| 4 | Boolean |
| 5 | DateTime |

### 内部函数

| 函数 | 说明 |
|------|------|
| `buildPropertyName(base, clozeNumber?)` | 普通 `srs.{base}`；Cloze `srs.c{N}.{base}` |
| `buildDirectionPropertyName(base, directionType)` | `srs.{forward\|backward}.{base}` |
| `loadSrsStateInternal` / `saveSrsStateInternal` | 普通 + Cloze 统一加载/保存 |
| `invalidateBlockCache(blockId)` | 外部改属性后精确失效 |
| `preheatBlockCache(blocks)` | 用已有完整块预热短期缓存 |
| `prefetchBlocksByIds(ids, options?)` | 正式 `get-blocks` 分批预取 |
| `clearBlockCache()` | 清空全部块缓存（测试 / 边界） |
| `runBoundedConcurrency` | 有上限并发执行 |

#### FC-13 批量读取与缓存预热

全库收集先用 `preheatBlockCache(blocks)` 将 `get-blocks-with-tags` 已返回的完整卡片块写入短期缓存，避免同一张卡及其 Cloze/Direction 变体再次逐个调用 `get-block`。

List 子块等未随标签查询返回的块使用 `prefetchBlocksByIds(ids, options)` 调用正式 Backend API `get-blocks`：

- 去重后分批读取，`batchSize` 默认且硬上限为 **50**（`BLOCK_PREFETCH_BATCH_SIZE`）。
- 最大并发批次数默认且硬上限为 **4**（`BLOCK_PREFETCH_CONCURRENCY`）；禁止无上限 `Promise.all`。
- `NaN`、`Infinity`、非正数、小数和过大参数由 `normalizeBoundedPositiveInt` 归一化，小数向下取整，无效值回退默认。
- 批量读取失败会 `console.error` 并抛出，不用空结果掩盖后端错误。
- 评分或属性写入后仍必须调用现有精确失效路径；该缓存不是跨会话长期索引。

### 公开 API — 普通卡片

| 函数 | 说明 |
|------|------|
| `loadCardSrsState(blockId)` | 读取状态；块不存在返回初始态 |
| `saveCardSrsState(blockId, newState)` | 写入属性并失效缓存 |
| `writeInitialSrsState(blockId, now?)` | 写入初始状态 |
| `updateSrsState(blockId, grade, pluginName?)` | 读 → `nextReviewState` → 存 |
| `ensureCardSrsState` / `ensureCardSrsStateWithInitialDue` | 缺失则初始化 |
| `resetCardSrsState(blockId)` | 重置为新卡并累加 `resets` |
| `deleteCardSrsData(blockId)` | 删除 SRS 相关属性 |

### 公开 API — Cloze

| 函数 | 说明 |
|------|------|
| `loadClozeSrsState` / `saveClozeSrsState` | 按 `clozeNumber` 读写 |
| `writeInitialClozeSrsState(blockId, clozeNumber, daysOffset?)` | 初始 due = 当天零点 + offset 天 |
| `updateClozeSrsState(blockId, clozeNumber, grade, pluginName?)` | 评分更新 |
| `ensureClozeSrsState` / `resetClozeSrsState` / `deleteClozeCardSrsData` | 确保 / 重置 / 删除 |

### 公开 API — Direction

| 函数 | 说明 |
|------|------|
| `loadDirectionSrsState(blockId, "forward"\|"backward")` | 读方向状态 |
| `saveDirectionSrsState` | 写方向状态 |
| `writeInitialDirectionSrsState` | 初始化某一方向 |
| `updateDirectionSrsState(..., grade, pluginName?)` | 评分更新 |
| `ensureDirectionSrsState` / `resetDirectionSrsState` / `deleteDirectionCardSrsData` | 确保 / 重置 / 删除 |

### 使用场景（摘要）

```typescript
// 评分
const result = await updateSrsState(blockId, "good", pluginName)

// 检查到期（精确到时分秒，与队列一致）
const state = await loadCardSrsState(blockId)
if (state.due.getTime() <= Date.now()) { /* due */ }

// 外部改属性后
invalidateBlockCache(blockId)
```

---

## 2. 复习日志存储与卡片身份（v2）

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

#### 块读取三态（`blockExistence.ts`）

| 状态 | 含义 |
| ---- | ---- |
| `exists` | `orca.state.blocks` 命中，或 `get-block` 在超时内返回可验证块（object + 有限 number id === 请求 id） |
| `missing` | 后端明确返回 `null` / `undefined` |
| `unknown` | 后端抛错、**timeout**、或非 null 但身份不可判定；**不得当 missing 删除** |

- 默认超时：`DEFAULT_GET_BLOCK_TIMEOUT_MS = 10_000`
- API：`resolveBlockExistence` / `BlockExistenceCache` / `validateBackendBlockIdentity` / `writeBlockToOrcaState`
- 超时后晚到的 backend 结果不得写 state 或改写已返回结论
- `deletedCardCleanup` 与复习会话（F2-06）共用三态语义；cleanup 在单次运行内对 blockId 缓存结果；复习当前卡路径可对 unknown 真实重试
- 直接 `setData` / `removeData` 修改分片后必须 `clearLogCache()`

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
| pure legacy | `legacy === true`，或**完全没有任何**结构化痕迹 | 仅按 `cardId` 存在性 |
| 结构化（完整或部分） | 存在任一结构化痕迹 | 先做完整性/一致性校验；不完整且父 exists/unknown → 保留；仅父 `blockId` 明确 missing 才可删 |

- **清理 vs 发现**：`isStillSrsCard` 会把带 `#choice` 的块仍视为 SRS 卡（避免清理时误删）；**队列/扫描发现仍要求 `#card`**，见 `SRS_选择题卡.md`。
- 部分结构化 List 日志若 `cardId=listItemId` 且子条目 missing，**不得**因误判 legacy 而删除。

#### legacy 清理

仅检查 `cardId` 指向块的存在性：exists 保留，missing 删除，unknown 保留。不猜卡型，不因无 `#card` 标签删除。

#### 存储错误

分片 JSON 解析失败、`getData` / `getDataKeys` / `setData` / `removeData` 失败时不得吞掉：保留未确认数据，`errors` 含具体 `storageKey`，不得宣称清理成功。

---

## 3. 选择题答题统计（FC-08）

### 方案：单块属性 + 最近 200 条上限

选择题统计**不**使用插件分片数据，而是把全部历史写入**该选择题卡片块**上的单个属性，每次读-改-写全量重写。

| 项 | 值 |
| -- | -- |
| 属性名 | `srs.choice.statistics`（`CHOICE_STATISTICS_PROPERTY_NAME`） |
| 属性类型 | Text（`type = 1`），JSON 字符串 |
| 版本字段 | `version: 1`（`CHOICE_STATISTICS_STORAGE_VERSION`） |
| 条数上限 | `MAX_CHOICE_STATISTICS_ENTRIES = 200` |
| 裁剪方式 | 追加后 `slice` 尾部 |

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

`isCorrect`：题目**至少有一个正确选项**，且 selected/correct **集合完全相等**（无错选且无漏选，顺序无关）。空正确集合始终 `false`（与 `calculateAutoGrade` 在无正确项时返回 `null` 对齐）。

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
| 属性 JSON 损坏 / 结构非法 / ID 非 DbId | `console.warn` 后**抛出** |

### 并发与失败产品规则

- **同一 blockId**：`saveChoiceStatistics` 内部 Promise 链串行读-改-写；调用者仍收到真实 rejection。
- **不同 blockId**：互不阻塞。
- **复习层**（`recordChoiceAnswerStatistics` / UI）：保存失败 notify warn，**不阻断** FSRS 评分。
- **防重复**：同一次提交只 save 一次，依赖 `choiceSubmitGate`。

### 核心 API

| 函数 | 说明 |
| ---- | ---- |
| `serializeStatistics` / `deserializeStatistics` | 严格往返；损坏抛错 |
| `appendChoiceStatisticsEntries` | 纯 append + trim |
| `loadChoiceStatistics` / `saveChoiceStatistics` | 块属性读写；save 按块串行 |
| `calculateOptionFrequency` | 频率（过滤已删选项） |
| `buildChoiceStatisticsEntry` / `recordChoiceAnswerStatistics` | 见 `choiceAnswerStatistics.ts` |

---

## 4. 会话进度 sessionStorage（FC-09）

> 产品阶段：**不支持跨重启断点恢复**。sessionStorage 仅用于当前挂载会话的 scoped 自动保存 / 诊断。

### 键与 scope

- 前缀：`SESSION_PROGRESS_KEY_PREFIX = "srs-session-progress:v2:"`
- scope 类型（`SessionProgressScope`）：
  - `normal/all`
  - `normal/deck/{encodedDeckName}`
  - `fixed/difficult`（Home 约定：`sourceType=children` 且 `sourceBlockId=0`）
  - `fixed/{sourceType}/{sourceBlockId}`（其他专项 / 重复复习）

| API | 说明 |
|-----|------|
| `toSessionProgressStorageKey(scope)` | 稳定 key 编码 |
| `createSessionProgressDescriptorFromNormal` / `…FromFixedSource` | Renderer 冻结后传 Demo |
| `clearSessionProgressKey` | 新会话启动清理同 scope 旧值 |
| `autoSaveSessionProgress` / `resumeSessionProgressAutosave` | 自动保存；F2-04 完成后再开时恢复写入（**不清零**进度） |
| `tryParseSessionProgressJson` | 严格解析；非法返回 null |
| 安全 get/set/remove | 失败 `console.warn`，不抛到主流程 |

进度状态本体与评分时长累计见 `sessionProgressTracker.ts`（`SessionProgressState`、`CURRENT_VERSION`）。

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/srs/storage.ts` | 卡片 SRS 状态、块缓存、批量预取 |
| `src/srs/types.ts` | `SrsState` / `ReviewLogEntry` / `ChoiceStatistics*` |
| `src/srs/algorithm.ts` | `nextReviewState` / 初始态（被 storage 调用） |
| `src/srs/cardIdentity.ts` | 卡片稳定身份 |
| `src/srs/reviewLogStorage.ts` | 复习日志读写与可靠 pending/flush |
| `src/srs/pluginUnloadSequence.ts` | 卸载前 flush 顺序 |
| `src/srs/reviewSessionClose.ts` | 会话关闭统一 flush |
| `src/srs/blockExistence.ts` | 块三态 exists/missing/unknown |
| `src/srs/deletedCardCleanup.ts` | 已删除卡片日志清理 |
| `src/srs/choiceStatisticsStorage.ts` | 选择题统计块属性（FC-08） |
| `src/srs/choiceAnswerStatistics.ts` | 答题 entry 构造与复习保存回调 |
| `src/srs/sessionProgressStorage.ts` | 会话进度 sessionStorage（FC-09） |
| `src/srs/sessionProgressTracker.ts` | 有效时长与进度状态（FC-10） |
| `src/srs/reviewCardGrading.ts` | 评分时写结构化身份与日志 |
| `src/srs/difficultCardsManager.ts` | 精确 cardKey 匹配 |
| `src/srs/childCardCollector.ts` | getCardKey / 子卡身份复用 |
