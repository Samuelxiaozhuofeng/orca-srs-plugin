# SRS 卡片创建与管理模块

> **文档同步日期**：2026-07-13  
> **变更说明**：按当前代码校正卡种、`_repr` 规则、最近牌组与相关文件路径；去掉失效的绝对 `file://` 链接。

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
| `src/srs/clozeUtils.ts` | 填空创建 |
| `src/srs/directionUtils.ts` | 方向标记插入 |
| `src/srs/listCardCreator.ts` | 列表卡创建 |
| `src/srs/topicCardCreator.ts` | Topic IR |
| `src/srs/extractUtils.ts` | 摘录（Extract）创建 |
| `src/srs/cardTagDataBuilder.ts` | 统一 `#card` 标签 data（type / 牌组 / status） |
| `src/srs/cardTagRefData.ts` | `setRefData` / IR priority 同步 |
| `src/srs/tagPropertyInit.ts` | `#card` 标签块属性定义初始化 |
| `src/srs/tagUtils.ts` | card/choice/correct/ordered 匹配 |
| `src/srs/tagCleanup.ts` | 新卡清理残留 `srs.*` |
| `src/srs/recentDeckManager.ts` | 最近默认牌组 |
| `src/srs/deckUtils.ts` | `extractCardType` / `extractDeckName` |
| `src/srs/cardIdentity.ts` | 稳定 `cardKey` |
| `src/srs/storage.ts` | 初始 SRS 状态 |
| `src/srs/registry/commands.ts` / `uiComponents.tsx` | 命令与 UI 入口 |

---

## 卡片类型一览

| CardType | 识别 | 创建入口 | `_repr` / 扫描 |
| -------- | ---- | -------- | -------------- |
| **basic** | `#card` 且 type 缺省或 basic | 斜杠「转换为记忆卡片」`makeCardFromBlock` | `srs.card`；扫描转换 |
| **cloze** | `type=cloze` 或 cloze fragment 创建时写入 | 工具栏 Cloze / `createCloze` | `srs.cloze-card` |
| **direction** | `type=direction` | 斜杠正向/反向方向卡 | **不**强制 `_repr`；扫描**跳过** |
| **list** | `type=list` | 斜杠「列表卡」 | 扫描**跳过**；容器 + 子块 SRS |
| **choice** | 须有 **`#card`**；类型上 `#choice` **优先**，或 `type=choice` | 无专用命令：`#card` + `#choice`（或 type）+ 子块选项 | `srs.choice-card`（扫描时写入；**仅** `_repr` 无 `#card` 仍进不了收集） |
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

1. `get-blocks-with-tags(["card"])`，失败则备用全量过滤
2. 对每块 `extractCardType`
3. **跳过** conversion：`direction` / `list` / `extracts` / `topic`
4. 其余：按类型设 `_repr`（cloze → `srs.cloze-card`，choice → `srs.choice-card`，else `srs.card`）
5. `ensureCardSrsState`（不误重置已有进度）

### `makeCardFromBlock(cursor, pluginName)`

1. 无 `#card`：`insertTag` + `buildCardTagData(..., "basic")` + `ensureCardTagProperties`
2. `resolveFrontBack`；`extractCardType` 决定 repr
3. 新卡：`cleanupSrsProperties` + `writeInitialSrsState`；已有标签：`ensureCardSrsState`

### 其它创建

| 函数 | 默认 type |
| ---- | --------- |
| `createCloze` | cloze + 分天 cloze SRS |
| `insertDirection` | direction + 方向 SRS |
| `createListCardFromBlock` | list + 子块初始 due |
| `createTopicCard` / `createTopicCardByBlockId` | topic + IR 状态（默认优先级 50，不强制今天） |
| `createExtract` | extracts 摘录子块 + IR |

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

`ensureCardTagProperties` 在 `#card` 标签块上补齐：

| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| `type` | Text | basic/cloze/direction/list/choice/topic/… |
| `牌组` | BlockRefs | 初始 `undefined`（**勿**用 `[]`，会被 Orca 静默忽略） |
| `status` | Text | 如 suspend |
| `priority` | Number | IR 默认 50 |

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
- 选择题：标签 + 正确选项（见 `SRS_选择题卡.md`）

---

## 扩展点

1. 多答案子块策略（basic 目前首子块为 back）
2. 选择题专用创建命令（当前靠标签约定）
3. 模板系统

---

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/srs/cardCreator.ts` | 扫描与 basic 转换 |
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
