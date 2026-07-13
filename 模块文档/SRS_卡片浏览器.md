# SRS Flashcard Home（闪卡主页 / 卡片浏览器）

> **文档同步日期：2026-07-13**  
> 现状以代码为准。历史上称「卡片浏览器」；旧组件 `SrsCardBrowser.tsx` **已不存在**，统一为 Flashcard Home。

## 概述

Flashcard Home 是插件的闪卡管理主界面，以块类型 `srs.flashcard-home` 嵌入 Orca 面板，或通过 `SrsFlashcardHomePanel` 作为面板内容挂载。它聚合：

- **主页 Dashboard**（问候、热力图、未来到期）
- **卡组列表**（搜索、备注、顶部三统计、开始复习）
- **卡片列表**（按 Deck 筛选、重置/删除/跳转）
- **学习统计**（`StatisticsView` + `statisticsManager`）
- **困难卡片**（`DifficultCardsView` + `difficultCardsManager`）

### 核心价值

- 与 Orca 面板系统一致：分屏、聚焦、块历史。
- 一处完成 Deck 管理、统计与专项复习入口。
- 复习/埋藏/暂停后通过 `orca.broadcasts` 静默刷新（见 `SRS_事件通信.md`）。
- 120s 低频全量兜底刷新（编辑/删除事件不完整时的补偿）。

---

## 代码组成

| 文件 | 职责 |
| ---- | ---- |
| `src/components/SrsFlashcardHome.tsx` | 主界面：视图路由、数据加载、Deck/卡片列表、备注与搜索 |
| `src/components/FlashcardDashboard.tsx` | 默认「主页」Dashboard（问候、热力图、未来预测） |
| `src/components/StatisticsView.tsx` | 学习统计全页 |
| `src/components/DifficultCardsView.tsx` | 困难卡片列表与一键复习 |
| `src/components/SrsFlashcardHomeRenderer.tsx` | `srs.flashcard-home` 块渲染器包装 |
| `src/panels/SrsFlashcardHomePanel.tsx` | 面板入口（ErrorBoundary + hideable 布局） |
| `src/srs/hideableDisplayManager.ts` | 隐藏视图占位与样式恢复（面板/Hideable 场景，供 Flash Home 面板使用） |
| `src/srs/flashcardHomeManager.ts` | 特殊块创建、复用、清理（`flashcardHomeBlockId`） |
| `src/srs/deckUtils.ts` | `calculateDeckStats` / `calculateHomeStats` |
| `src/srs/deckNoteManager.ts` | 卡组备注 CRUD |
| `src/srs/statisticsManager.ts` | 统计数据与缓存 |
| `src/srs/difficultCardsManager.ts` | 困难卡判定与列表 |
| `src/srs/cardFilterUtils.ts` | 卡片筛选（全部/已到期/今天/未来/新卡） |
| `src/srs/registry/renderers.ts` | 注册 `srs.flashcard-home` |
| `src/srs/registry/commands.ts` | `openFlashcardHome` 命令 |
| `src/srs/registry/uiComponents.tsx` | 工具栏入口按钮 |
| `src/srs/registry/converters.ts` | plain 转换器 |
| `src/main.ts` | `openFlashcardHome`、`startReviewSession` 等 |

> 旁路演示组件（非主路径）：`HomeStatsDemo.tsx`、`DeckNoteDemo.tsx`、`DeckSearchDemo.tsx`。  
> `DeckCardCompact.tsx` 仍存在，但 **当前 `SrsFlashcardHome` 卡组列表使用内联 `DeckRow`（表格行）**，未挂载 `DeckCardCompact`。

---

## 视图模式

```text
ViewMode = "dashboard" | "deck-list" | "card-list" | "statistics" | "difficult-cards"
默认：dashboard
```

```mermaid
flowchart TD
  A[openFlashcardHome / 块渲染] --> B[SrsFlashcardHome]
  B --> C{viewMode}
  C -->|dashboard| D[FlashcardDashboard]
  C -->|deck-list| E[DeckListView]
  C -->|card-list| F[CardListView]
  C -->|statistics| G[StatisticsView]
  C -->|difficult-cards| H[DifficultCardsView]
  D -->|卡组/统计/困难卡| C
  E -->|查看 Deck| F
  E -->|统计/困难卡| C
```

顶层导航（主页 / 卡组 / 统计）在 `dashboard` 与 `deck-list` 顶部切换；困难卡片在主页右侧或卡组工具栏进入。从统计/困难卡「返回」时 `handleBack` 回到 **`deck-list`**。

---

## 渲染与面板

- **块类型**：`srs.flashcard-home`
- **存储键**：`flashcardHomeBlockId`（`orca.plugins.getData/setData`）
- **块属性**：`srs.isFlashcardHomeBlock`、`srs.pluginName`
- **打开逻辑**（`main.ts` → `openFlashcardHome`）：
  1. `getOrCreateFlashcardHomeBlock(pluginName)`
  2. 若某面板已打开该块 → `switchFocusTo`
  3. 否则右侧复用/新建面板，或 `openInCurrentPanel` 时在当前面板 `goTo`
- **面板组件** `SrsFlashcardHomePanel`：硬编码 `pluginName="srs-plugin"`，外层 `SrsErrorBoundary` + `attachHideableDisplayManager`
- **转换器**：plain 输出占位文本（见 `converters.ts`）

---

## 数据流

1. `loadData()`：
   - `collectReviewCards(pluginName)` → `allCards`
   - `calculateDeckStats(cards)` + `getAllDeckNotes` → 合并 `note` 到各 `DeckInfo`
   - `calculateHomeStats(cards)` → `todayStats`（`TodayStats`）
   - Dashboard：`getReviewHistory(..., "3months")`、`getFutureForecast(..., 30)`、`getTodayStatistics`
2. 事件：`CARD_GRADED` / `CARD_POSTPONED` / `CARD_SUSPENDED` → 静默 `loadData`（单处理器注册防护）
3. 定时：每 **120s** 静默刷新卡片与 Deck 统计（不强制重载 Dashboard 三套统计 API）
4. 复习：`startReviewSession(deckName?)`；困难卡走 `createFixedRepeatSessionDescriptor` + `createRepeatReviewSession` + `createReviewSessionBlockWithDescriptor`

### TodayStats（卡组页顶部三卡）

| 字段 | 含义（`calculateHomeStats`） |
| ---- | ---------------------------- |
| `newCount` | `isNew` 卡片数 |
| `pendingCount` | 非新卡且 `due <= now`（精确到时分秒） |
| `todayCount` | 上述待复习中，到期日落在今天的数量 |
| `totalCount` | 全部卡片 |

顶部展示：

| 标签 | 计算 |
| ---- | ---- |
| 未学习 | `newCount` |
| 学习中 | `todayCount` |
| 待复习 | `pendingCount - todayCount`（积压：到期日早于今天，且已到期） |

---

## DeckListView（卡组）

### 工具栏

- 「困难卡片」「统计」按钮
- 顶部三 `StatCard`
- 搜索栏：名称 + 备注，大小写不敏感；`Escape` 清空；**无**全局 Ctrl+F
- 牌组表格：`DeckRow`（未学习 / 学习中 / 待复习 + 复习按钮）
- 备注：行内编辑，`setDeckNote` + `onNoteChange`
- 无限滚动：每页 15 个 Deck（`IntersectionObserver`）
- 底部：搜索统计 / 全局统计、「开始今日复习」「刷新」
- 「开始今日复习」在 `pendingCount > 0 || newCount > 0` 时可点

### 备注与搜索

详见权威文档：

- [SRS_卡组备注.md](SRS_卡组备注.md)
- [SRS_卡组搜索.md](SRS_卡组搜索.md)

---

## CardListView（单 Deck 卡片）

1. 面包屑：返回、Deck 名、「复习此牌组」（有到期时）
2. 筛选：`全部 / 已到期 / 今天 / 未来 / 新卡`（`filterCards` + 数量统计）
3. 列表项：`SafeBlockPreview`、到期相对描述、间隔、Cloze/Direction 标记、重置次数
4. 操作：**删除**（清 SRS + 去 `#card`）、**重置**（变新卡）、**跳转**（`orca.nav.openInLastPanel("block", …)`）
5. 无限滚动：每页 20 张

筛选逻辑与 `cardFilterUtils.FilterType` 一致（按自然日边界，非 `pendingCount` 的「精确 now」）。

---

## Dashboard（主页）

`FlashcardDashboard` 使用：

- `dueCards` / `newCards`（来自 `TodayStats`）
- `reviewHistory`、`futureForecast`（statisticsManager）

内容：

- 问候 + 本周摘要 + 「开始复习」
- GitHub 风格学习热力图（复习历史）
- 未来到期预测条

（`todayStatistics` 会加载并传入 props，当前主组件渲染侧主要用 history/forecast/new/due。）

---

## 扩展点

1. 将 `DeckCard` 卡片模式重新挂入视图切换（代码内仍保留组件）。
2. 统计/困难卡返回目标可改为 `dashboard`。
3. 视图状态（`selectedDeck` / `currentFilter`）持久化到块属性。
4. 点击顶部三统计跳转到对应筛选。

---

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/SrsFlashcardHome.tsx` | 主界面与子视图 |
| `src/components/FlashcardDashboard.tsx` | Dashboard |
| `src/components/StatisticsView.tsx` | 学习统计 |
| `src/components/DifficultCardsView.tsx` | 困难卡片 UI |
| `src/components/SrsFlashcardHomeRenderer.tsx` | 块渲染器 |
| `src/panels/SrsFlashcardHomePanel.tsx` | 面板封装 |
| `src/srs/flashcardHomeManager.ts` | 块生命周期 |
| `src/srs/deckUtils.ts` | Deck/首页统计 |
| `src/srs/deckNoteManager.ts` | 卡组备注 |
| `src/srs/statisticsManager.ts` | 统计后端 |
| `src/srs/difficultCardsManager.ts` | 困难卡后端 |
| `src/srs/cardFilterUtils.ts` | 列表筛选 |
| `src/srs/srsEvents.ts` | 广播事件名 |
| `src/main.ts` | 打开与复习入口 |
| `src/srs/registry/{commands,renderers,uiComponents,converters}.ts` | 注册 |

### 相关模块文档

- [SRS Flash Home 顶部统计卡片.md](SRS%20Flash%20Home%20顶部统计卡片.md)
- [SRS_困难卡片.md](SRS_困难卡片.md)
- [SRS_卡组备注.md](SRS_卡组备注.md)
- [SRS_卡组搜索.md](SRS_卡组搜索.md)
- [SRS_事件通信.md](SRS_事件通信.md)
