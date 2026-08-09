# SRS 卡片创建与管理模块

> **文档同步日期**：2026-08-09
> **变更说明**：方向卡 `srs.isCard`、选择题 `setRefData type=choice`、`setCardTagRefData` 写成功后均 `invalidateBlockCache`；`setCardTagRefData` 块不存在 / 无 `#card` 改为 throw（`syncCardTagPriority` 仍 catch 后 `console.error`，不打断 `saveIRState`）。
> 2026-07-29：`ensureCardTagProperties` 幂等创建 `#card` 标签块（alias 缺失时 insertBlock + createAlias + backend 确认）、属性写全成功才缓存、并发共享 Promise、失败可重试；load 后台预初始化。
> 2026-07-28：制卡 undo 对称清理；选择题专用创建命令；`scanCardsFromTags` 兜底门控（仅查询 throw 才全库扫描）；列表卡根 `srs.isCard` 写后 `invalidateBlockCache`。
> 2026-07-26：`createCloze` 返回 `originalContent` 深拷贝；`undoClozeCardCreation` **必须先还原正文**再删 srs/标签（编辑器原生命令栈不会自动去掉 `.cloze` fragment）。

---

## 概述

本模块负责将 Orca 块识别/转换为 SRS（及 IR）卡片：标签、`type`、牌组、初始状态与批量扫描。

### 核心价值

- 通过 **`#card`** 发现/扫描卡片；`#choice` 等只在已发现块上覆盖**类型**
- 多卡种：basic / cloze / direction / list / choice / topic / extracts 等
- Deck 分组与「最近默认牌组」
- 手动转换 + 批量扫描

---

## 技术实现

### 核心文件

| 文件 | 职责 |
| ---- | ---- |
| `src/srs/cardCreator.ts` | `scanCardsFromTags`、`makeCardFromBlock` |
| `src/srs/choiceCardCreator.ts` | 选择题创建 `createChoiceCardFromBlock` |
| `src/srs/clozeUtils.ts` | 填空创建 |
| `src/srs/directionUtils.ts` | 方向标记插入 |
| `src/srs/listCardCreator.ts` | 列表卡创建 |
| `src/srs/topicCardCreator.ts` | Topic IR |
| `src/srs/extractUtils.ts` | 摘录（Extract）创建 |
| `src/srs/cardTagDataBuilder.ts` | 统一 `#card` 标签 data（type / 牌组 / status） |
| `src/srs/cardTagRefData.ts` | `setRefData` / IR priority 同步；写成功 `invalidateBlockCache`；缺块/缺 `#card` throw |
| `src/srs/tagPropertyInit.ts` | `#card` 标签块属性定义初始化 |
| `src/srs/tagUtils.ts` | card/choice/correct/ordered 匹配 |
| `src/srs/tagCleanup.ts` | 新卡清理残留 `srs.*` |
| `src/srs/recentDeckManager.ts` | 最近默认牌组 |
| `src/srs/deckUtils.ts` | `extractCardType` / `extractDeckName` |
| `src/srs/cardIdentity.ts` | 稳定 `cardKey` |
| `src/srs/storage.ts` | 初始 SRS 状态 |
| `src/srs/registry/cardCreationUndo.ts` | 制卡对称撤销（basic/cloze/topic/list/**direction**；只删本次新增） |
| `src/srs/registry/commands.ts` / `uiComponents.tsx` | 命令与 UI 入口 |

---

## 卡片类型一览

| CardType | 识别 | 创建入口 | `_repr` / 扫描 |
| -------- | ---- | -------- | -------------- |
| **basic** | `#card` 且 type 缺省或 basic | 斜杠「转换为记忆卡片」`makeCardFromBlock` | `srs.card`；扫描转换 |
| **cloze** | `type=cloze` 或 cloze fragment 创建时写入 | 工具栏 Cloze / `createCloze` | `srs.cloze-card` |
| **direction** | `type=direction` | 斜杠正向/反向方向卡 | **不**强制 `_repr`；扫描**跳过** |
| **list** | `type=list` | 斜杠「列表卡」 | 扫描**跳过**；容器 + 子块 SRS |
| **choice** | 须有 **`#card`**；类型上 `#choice` **优先**，或 `type=choice` | 斜杠「创建选择题」`createChoiceCard`；也可手动 `#card` + `#choice` + 子块选项 | `srs.choice-card`（扫描时写入；**仅** `_repr` 无 `#card` 仍进不了收集） |
| **topic** | `type=topic` | 斜杠 IR Topic / 右键 | 扫描跳过；走 IR 状态 |
| **extracts** | `type=extracts` | `createExtract` 等 | 扫描跳过；IR 摘录 |
| **excerpt** | `type=excerpt` | 标签 type | 收集时无子块可当摘录展示 |

> **`extractCardType`**：先看 `#choice`，再读 `#card.type`——只决定类型字符串。  
> **发现入口**：`scanCardsFromTags` / `collectSrsBlocks` 只查 `#card`；state 合并不含独立 `srs.choice-card`。因此 **不能**只打 `#choice`。  
> 真实收集路径还必须在 `ReviewCard.cardType` 显式填入（Basic 与 Choice 仅靠变体字段无法区分）。

### Basic 结构

```
父块（#card）→ 题目 front
└── 第一个子块 → 答案 back
```

无子块的 basic 在收集时按「摘录式」处理（只显示 front，back 空）。

---

## 核心函数

### `scanCardsFromTags(pluginName)`

1. `get-blocks-with-tags(["card"])`：
   - **成功返回**（含空数组）→ 有卡则继续转换；空 = 仓库没有 `#card`，**不得**调用 `get-all-blocks`
   - **实际 throw** 才走 `get-all-blocks` 手工 `isCardTag` 过滤（对齐 `cardCollector.tagQuerySucceeded` 语义；已删除空结果下重复查同一标签）
   - 标签查询失败 **且** 全库兜底也失败 → 可见 `error` 通知，**不得**伪装成「没有找到卡片」
2. 对每块 `extractCardType`
3. **跳过** conversion：`direction` / `list` / `extracts` / `topic`
4. 其余：按类型设 `_repr`（cloze → `srs.cloze-card`，choice → `srs.choice-card`，else `srs.card`）
5. `ensureCardSrsState`（不误重置已有进度）

回归：`src/srs/cardCreator.scanCardsFromTags.test.ts`

### `makeCardFromBlock(cursor, pluginName)`

1. 无 `#card`：`insertTag` + `buildCardTagData(..., "basic")` + `ensureCardTagProperties`
2. `resolveFrontBack`；`extractCardType` 决定 repr
3. 新卡：`cleanupSrsProperties` + `writeInitialSrsState`；已有标签：`ensureCardSrsState`
4. 返回 undoArgs：`blockId, originalRepr, originalText, pluginName, addedCardTag, wroteInitialSrs`

### `createChoiceCardFromBlock(cursor, pluginName)`

1. 无 `#card`：`insertTag` + `buildCardTagData(..., "choice")`；已有则 `setRefData type=choice`，**写成功后** `invalidateBlockCache`（再 `ensureCardSrsState`）
2. 无 `#choice`：`insertTag "choice"`
3. `_repr = { type: "srs.choice-card", ... }`
4. 新卡 cleanup + 初始 SRS；已有卡 `ensureCardSrsState`
5. 无 `#correct`/`#正确` 子选项时 `info` 提示（不阻断）
6. undoArgs 另含 `addedChoiceTag`；撤销走 `undoBasicCardCreation`（可选摘 `#choice`）

### `setCardTagRefData` / `syncCardTagPriority`（`cardTagRefData.ts`）

- `setCardTagRefData`：块不存在或找不到 `#card` ref → **throw**（带 `blockId`）；`setRefData` 成功后 `invalidateBlockCache`。
- `syncCardTagPriority`：包装上述写入；失败 **不向上抛**（`saveIRState` 旁路），`console.error` 说明 `ir.priority` 已写、`#card.priority` 未同步。正常 IR 路径在写 `ir.*` 前已确保 `#card` 存在，缺标签视为数据不一致。

### 其它创建

| 函数 | 默认 type |
| ---- | --------- |
| `createCloze` | cloze + 分天 cloze SRS；undoArgs 含 `isFirstClozeCard` / `wroteInitialClozeSrs` |
| `insertDirection` | direction + 方向 SRS；`srs.isCard` **写成功后** `invalidateBlockCache`，再 `ensureDirectionSrsState`（方向卡 undo 仍只还原 content） |
| `createListCardFromBlock` | list + 子块初始 due；根 `srs.isCard` **写成功后立即** `invalidateBlockCache`（写失败不 invalidate、`wroteRootIsCard=false`）；undoArgs 含 `initializedItemIds` / `wroteRootIsCard`。回归：`listCardCreator.test.ts` |
| `createTopicCard` / `createTopicCardByBlockId` | topic + IR 状态；`createdFreshTopic` 控制完整 undo |
| `createExtract` | extracts 摘录子块 + IR |

### 制卡对称撤销（`cardCreationUndo.ts`）

原则：**只删本次新增**。命令 undo 回调调用：

| Helper | 适用 | 行为摘要 |
| ------ | ---- | -------- |
| `undoBasicCardCreation` | makeCard / choice | `wroteInitialSrs` → cleanup；`addedCardTag` → removeTag card；`addedChoiceTag` → removeTag choice；还原 `_repr` |
| `undoClozeCardCreation` | createCloze | **先**用 `originalContent` `setBlocksContent` 还原正文（首次/非首次都要，防残留 `.cloze` fragment 编号错乱）；再删 `srs.c{N}.*`；仅 `isFirstClozeCard` 时再摘 `#card`、顶层 srs、`_repr` |
| `undoTopicCardCreation` | createTopicCard | 仅 `createdFreshTopic`：deleteIRState + removeTag + 删 `_repr` |
| `undoListCardCreation` | createListCard | 清理 `initializedItemIds`；可选根 `srs.isCard` / `#card`；未写 `_repr` 不瞎删 |

### `buildCardTagData(pluginName, blockId, cardType)`

返回：

```typescript
[
  { name: "type", value: cardType },
  { name: "牌组", value: deckRefId ? [deckRefId] : [] },  // 最近牌组引用
  { name: "status", value: "" }
]
```

### `extractCardType` / `extractDeckName`

见 `deckUtils.ts`。牌组：`#card` 上 `牌组` 属性（BlockRefs）→ 目标块 `text`，失败默认 `"Default"`。

---

## 标签属性自动初始化

`ensureCardTagProperties`（`src/srs/tagPropertyInit.ts`）保证仓库具备可用的 `#card` 标签 schema，使**全新用户无需先制普通卡**也能直接 Book IR / Topic / 资料库发现。

### 行为契约

1. **幂等**：`get-block-by-alias("card")` 已有块则只补缺失属性；已全部就绪则直接返回。
2. **缺失 alias 时创建标签块**（不得假设稍后的 `insertTag` 会顺带初始化 schema）：
   - `core.editor.insertBlock`（根级 heading，正文 `card`）→ 返回值必须是**有限正数**
   - `core.editor.createAlias(null, "card", blockId, true)`（page alias）
   - 再次 `get-block-by-alias("card")` **backend 确认**后才继续；不得凭命令返回值假装成功
3. **对称清理**：仅当本轮**新建的块未能成为** `card` alias 时 `deleteBlocks` 清理孤立块；清理失败 `console.error` 且**原错误仍抛出**。不删除既有用户块或既有 `card` 标签。
4. **属性补齐**（名称/类型固定，勿改）：

| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| `type` | Text | basic/cloze/direction/list/choice/topic/… |
| `牌组` | BlockRefs | 初始 `undefined`（**勿**用 `[]`，会被 Orca 静默忽略） |
| `status` | Text | 如 suspend |
| `priority` | Number | IR 默认 50 |

5. **成功缓存**：仅当全部缺失属性 `setProperties` 成功后才置 `cardTagInitialized`；**单个属性失败抛出**，不缓存，下次可重试。
6. **并发**：in-flight 用共享 `Promise`（非 boolean 早退）；调用方全部 await 同一轮结果。
7. **缓存失效**：每次 `setProperties` 成功后 `invalidateBlockCache(tagBlockId)`。标签 schema 块通常不经 `getBlockCached` 进入 SRS `blockCache`（收集器 preheat 的是带 `#card` 的内容块），但写后仍按契约失效，避免将来被预热后读到陈旧 schema。
8. **调用点**：
   - `main.load`：后台预初始化；失败 `console.error` + `orca.notify`，**不阻断**插件加载
   - 制卡路径（`cardCreator` / cloze / direction / list / choice / topic）与 `IRBookDialogMount`（Book IR 提交前）：同步兜底；函数自身 **reject**，依赖 schema 的流程不得静默继续

回归：`src/srs/tagPropertyInit.test.ts`。

---

## 最近牌组自动默认

`recentDeckManager.ts`：

1. 监听用户将非 Default 牌组写入卡片
2. 后续 `buildCardTagData` 创建引用到该牌组块
3. 清空牌组或命令「SRS: 清除最近默认牌组」后恢复 Default

---

## 卡片身份（`cardIdentity`）

| 类型 | cardKey |
| ---- | ------- |
| basic / choice / excerpt / … | `{type}:{blockId}` |
| cloze | `cloze:{blockId}:c{N}` |
| direction | `direction:{blockId}:forward\|backward` |
| list | `list:{blockId}:item:{listItemId}` |

队列 tie-break 用结构化 `orderTuple`，避免字符串字典序。

---

## 使用场景

### 1. 手动 basic

题目 + 子块答案 → 斜杠「转换为记忆卡片」。

### 2. 批量扫描

手动打 `#card` → 命令扫描转换 `_repr` 与初始状态。

### 3. 专用卡种

- Cloze 按钮 / 方向斜杠 / 列表斜杠 / IR Topic  
- 选择题：斜杠「创建选择题」或标签约定（见 `SRS_选择题卡.md`）

---

## 扩展点

1. 多答案子块策略（basic 目前首子块为 back）
2. 模板系统
3. 方向卡制卡 undo 与 content 栈对齐（当前仍只还原 content）

---

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/srs/cardCreator.ts` | 扫描与 basic 转换 |
| `src/srs/choiceCardCreator.ts` | 选择题创建 |
| `src/srs/registry/cardCreationUndo.ts` | 制卡对称撤销 |
| `src/srs/cardTagDataBuilder.ts` | 标签 data |
| `src/srs/cardTagRefData.ts` | ref 数据写入 |
| `src/srs/cardIdentity.ts` | 身份键 |
| `src/srs/tagCleanup.ts` | 属性清理 |
| `src/srs/tagPropertyInit.ts` | 标签属性定义 |
| `src/srs/tagUtils.ts` | 标签匹配 |
| `src/srs/recentDeckManager.ts` | 最近牌组 |
| `src/srs/deckUtils.ts` | 类型与牌组提取 |
| `src/srs/storage.ts` | 状态初始化 |
| `src/srs/types.ts` | CardType / ReviewCard |
| `src/main.ts` | 打开 Flash Home 等入口（创建逻辑已下沉） |
| `模块文档/SRS_填空卡.md` 等 | 各卡种实现文档 |
