# SRS 工具函数模块文档

> **文档同步日期**：2026-07-19  
> **变更说明**：  
> - **删除不存在的 `src/srs/cardBrowser.ts`**（旧弹窗浏览器已废弃；现用 Flashcard Home：`flashcardHomeManager.ts` + `SrsFlashcardHome*.tsx`）  
> - Flash Home 学习统计页 / `statisticsManager` 主路径已移除；时长规则仍在 `sessionProgressTracker`  
> - 相关文件改为仓库内相对路径

本文档描述 SRS 核心工具层（创建/收集/牌组/面板/会话时长等）。卡种专项见对应文档。

---

## 模块概览

| 模块 | 文件路径 | 职责 |
| ---- | -------- | ---- |
| 面板工具 | `src/srs/panelUtils.ts` | 查找/调整 Orca 编辑器面板 |
| 块工具 | `src/srs/blockUtils.ts` | 块类型判断、正反面解析 |
| 卡片收集 | `src/srs/cardCollector.ts` | 收集 SRS 块、构建复习队列 |
| Deck 工具 | `src/srs/deckUtils.ts` | 卡型/牌组名/Deck 统计/预取 |
| 卡片创建 | `src/srs/cardCreator.ts` | 扫描标签、转换为卡片 |
| Flashcard Home | `src/srs/flashcardHomeManager.ts` | **替代**旧 cardBrowser：Home 块创建/复用 |
| 会话进度 | `src/srs/sessionProgressTracker.ts` | 有效时长归一化（FC-10） |
| 卡片身份 | `src/srs/cardIdentity.ts` | 统一 cardKey / 排序元组 |
| 摘录工具 | `src/srs/extractUtils.ts` | IR Extract 创建 |

> **历史**：曾存在/文档记载的 `cardBrowser.ts` + `SrsCardBrowser` 弹窗路径**当前仓库不存在**。打开浏览器请走 `openFlashcardHome` / `srs.flashcard-home`（见 `SRS_卡片浏览器.md`）。

---

## panelUtils.ts

**职责**：Orca 编辑器面板树操作。

| 函数 | 说明 |
| ---- | ---- |
| `findRightPanel(node, currentPanelId)` | 查找当前面板右侧面板 |
| `findLeftPanel(node, currentPanelId)` | 查找左侧面板 |
| `containsPanel(node, panelId)` | 树是否包含面板 |
| `extractPanelId(node)` | 提取树中第一个面板 ID |
| `schedulePanelResize(basePanelId, pluginName)` | 延迟调整面板尺寸 |

---

## blockUtils.ts

**职责**：块处理。

### 类型

```typescript
type BlockWithRepr = Block & { _repr?: Repr }
```

| 函数 | 说明 |
| ---- | ---- |
| `removeHashTags(text)` | 移除文本中的 #标签 |
| `isSrsCardBlock(block)` | 是否为 SRS 卡片块 |
| `getFirstChildText(block)` | 首个子块文本 |
| `resolveFrontBack(block)` | 解析 basic 正反面 |
| `getSiblingBlockTexts(blockId, maxCount?)` | 兄弟块文本（上下文用） |

---

## cardCollector.ts

**职责**：收集与队列构建。

### 主要导出

| 符号 | 说明 |
| ---- | ---- |
| `collectSrsBlocks(pluginName?)` | 收集带 SRS 语义的块 |
| `collectReviewCards(pluginName?, options?)` | 展开为 `ReviewCard[]`（多卡种） |
| `buildReviewQueue(cards, limits?)` | 正式队列（due/new 交错与限额） |
| `buildReviewQueueWithChildren` / `buildSessionReviewQueue` | 含子卡展开的会话队列 |
| `partitionDueAndNewCards` / `sortCardsForReviewQueue` / `interleaveDueAndNew` | 纯函数排序组件 |
| `expandChildCardsForRoots` | 子卡展开（深度/数量上限 FC-12） |
| `compareReviewCardsForQueue` | 队列比较（身份 tie-break） |

### 收集卡种分支（`collectReviewCards`）

| cardType | 行为摘要 |
| -------- | -------- |
| cloze | 每 clozeNumber 一张卡；需正确 `pluginName` 识别 fragment |
| direction | 按方向展开；左右文本不完整则跳过 |
| choice | 需有 children；一张卡 |
| list | 找第一条 due≤now 的条目；一张正式卡 |
| excerpt | front=全文 |
| basic | 有子块正反面；无子块按摘录式 |
| topic / extracts | **不进入** SRS 复习队列 |

`topic`/`extracts` 在循环开头 `continue`。暂停卡（status）会跳过。

**Cloze 注意**：`pluginName` 错误会导致找不到 `${pluginName}.cloze` 填空（另有 `*.cloze` 宽松匹配于 `getAllClozeNumbers`）。

SRS 状态读写走 `storage.ts`；读取时用后端 `get-block`/预取，避免半数据块。

---

## deckUtils.ts

**职责**：牌组与卡型。

| 函数/常量 | 说明 |
| --------- | ---- |
| `extractCardType(block)` | 见下 |
| `extractDeckName(block)` | 异步解析「牌组」块引用文本，默认 `"Default"` |
| `getDeckTargetBlockId` / `collectDeckTargetBlockIds` | 牌组目标 ID |
| `prefetchDeckNamesForBlocks` | 批量预取牌组名 |
| `clearDeckNameCache` / `getDeckNameCacheSize` | 缓存 |
| `calculateDeckStats` / `calculateHomeStats` | 统计 |
| `DECK_PREFETCH_BATCH_SIZE` / `DECK_PREFETCH_CONCURRENCY` | 预取参数 |

### `extractCardType` 规则

> 仅判定类型；**收集/扫描入口仍依赖 `#card`**（见 `SRS_选择题卡.md`）。

1. 存在 `#choice` → `"choice"`
2. 否则读 `#card` 的 `type`：`topic` / `extracts` / `cloze` / `direction` / `list` / `excerpt` / `choice`（大小写不敏感）
3. 默认 `"basic"`

### `extractDeckName` 逻辑

1. `#card` ref → data 中 `name="牌组"` 且 BlockRefs
2. value 为引用 ID 数组（通常取第一个）
3. 在 `block.refs` 中匹配得到目标块 → 其 `text` 为牌组名

---

## cardCreator.ts

| 函数 | 说明 |
| ---- | ---- |
| `scanCardsFromTags(pluginName)` | 批量扫描并设置 `_repr`（跳过 direction/list/topic/extracts） |
| `makeCardFromBlock(cursor, pluginName)` | 当前块转 basic（或按已有 type 设 cloze/choice repr） |

详情见 `SRS_卡片创建与管理.md`。

---

## flashcardHomeManager.ts（替代 cardBrowser）

| 能力 | 说明 |
| ---- | ---- |
| `getOrCreateFlashcardHomeBlock` | 复用存储的 `flashcardHomeBlockId` 或创建 `srs.flashcard-home` 块 |
| 清理 | 插件卸载等场景释放引用 |

入口：`main.ts` 的 `openFlashcardHome`、命令 `${pluginName}.openFlashcardHome`。

---

## cardIdentity.ts

| 函数 | 说明 |
| ---- | ---- |
| `inferCardType` / `identityFromReviewCard` | 结构化身份 |
| `buildCardKey` / `cardKeyFromReviewCard` | 稳定字符串键 |
| `orderTupleFromIdentity` / `compareCardIdentity` | 队列稳定排序（FC-11） |

格式示例：`basic:1`、`cloze:1:c2`、`direction:1:forward`、`list:1:item:9`、`choice:1`。

---

## extractUtils.ts

| 函数 | 说明 |
| ---- | ---- |
| `createExtract(cursor, pluginName)` | 选区摘录为子块并初始化 IR（`type=extracts`） |

依赖 `irRichExtract` 规划选区；优先级可继承最近 Topic。

---

## sessionProgressTracker.ts（FC-10 时长口径）

**职责**：会话进度纯函数 + **复习有效时长**归一化（日志 / 会话 / 统计页共用）。

### 常量

| 常量 | 值 | 说明 |
| ---- | -- | ---- |
| `MAX_EFFECTIVE_CARD_DURATION_MS` | 60000 | 单卡有效时长上限（墙钟） |
| `IDLE_TIMEOUT_THRESHOLD` | 同上 | 兼容别名 |

### 时长函数

| 函数 | 说明 |
| ---- | ---- |
| `calculateEffectiveDuration(unknown)` | 非有限/负→0，超过阈值→阈值；幂等 |
| `safeRawDuration(unknown)` | 安全非负原始墙钟（无上限） |
| `computeReviewTiming(start, now)` | 单次 now 同源 timestamp/raw/effective |
| `effectiveDurationFromReviewLog(log)` | 统计累计入口；只用 `duration` |
| `recordEffectiveGrade(state, grade, effective)` | 会话进度写入 |
| `formatDuration` / `generateStatsSummary` | 对 NaN/Infinity 安全 |

### 学习统计页 / statisticsManager（已移除于 Flash Home）

Flash Home **不再**挂载学习统计页（原 `StatisticsView` / `components/statistics/*` / Dashboard 热力图）。主页待办拆分仅用 `deckUtils.calculateHomeStats`（见 [SRS_卡片浏览器.md](SRS_卡片浏览器.md)）。

`statisticsManager` / `srs/statistics/*` **已从仓库删除**。时长累计唯一源仍是 `sessionProgressTracker`：

- 会话摘要、复习日志 `duration` 累计经 `effectiveDurationFromReviewLog`（只用 `duration`，不累 `rawDuration`）
- 相关：`sessionProgressStorage.ts`、`sessionProgressFinalize.ts`（细节见复习窗口/队列文档）

---

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/srs/panelUtils.ts` | 面板工具 |
| `src/srs/blockUtils.ts` | 块工具 |
| `src/srs/cardCollector.ts` | 卡片收集 |
| `src/srs/deckUtils.ts` | Deck / 卡型 |
| `src/srs/cardCreator.ts` | 卡片创建 |
| `src/srs/flashcardHomeManager.ts` | Flashcard Home 块 |
| `src/srs/cardIdentity.ts` | 身份 |
| `src/srs/extractUtils.ts` | 摘录 |
| `src/srs/sessionProgressTracker.ts` | 时长归一化 |
| `src/components/SrsFlashcardHome.tsx` | Home 主容器（非旧 SrsCardBrowser） |
| `src/components/flashcard-home/*` | 单页主页 / 卡组列表 / 卡片列表 |
