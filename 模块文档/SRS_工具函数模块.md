# SRS 工具函数模块文档

本文档涵盖 2025-12-09 重构后新增的 6 个工具模块。

## 模块概览

| 模块       | 文件路径                   | 职责                      |
| ---------- | -------------------------- | ------------------------- |
| 面板工具   | `src/srs/panelUtils.ts`    | 查找/调整 Orca 编辑器面板 |
| 块工具     | `src/srs/blockUtils.ts`    | 块类型判断、文本提取      |
| 卡片收集   | `src/srs/cardCollector.ts` | 收集 SRS 块、构建复习队列 |
| Deck 工具  | `src/srs/deckUtils.ts`     | 提取 deck 名称、统计信息  |
| 卡片创建   | `src/srs/cardCreator.ts`   | 将块转换为卡片、批量扫描  |
| 浏览器管理 | `src/srs/cardBrowser.ts`   | 打开/关闭卡片浏览器弹窗   |

---

## panelUtils.ts

**职责**：Orca 编辑器面板操作

### 导出函数

| 函数                                           | 说明                       |
| ---------------------------------------------- | -------------------------- |
| `findRightPanel(node, currentPanelId)`         | 查找当前面板右侧的面板     |
| `containsPanel(node, panelId)`                 | 检查面板树是否包含指定面板 |
| `extractPanelId(node)`                         | 提取面板树中第一个面板 ID  |
| `schedulePanelResize(basePanelId, pluginName)` | 延迟调整面板尺寸           |

---

## blockUtils.ts

**职责**：块处理工具

### 导出类型

```typescript
type BlockWithRepr = Block & { _repr?: Repr };
```

### 导出函数

| 函数                       | 说明                  |
| -------------------------- | --------------------- |
| `removeHashTags(text)`     | 移除文本中的 #标签    |
| `isSrsCardBlock(block)`    | 判断块是否为 SRS 卡片 |
| `getFirstChildText(block)` | 获取首个子块文本      |
| `resolveFrontBack(block)`  | 解析卡片正反面内容    |

---

## cardCollector.ts

**职责**：卡片收集和队列构建

### 导出函数

| 函数                              | 说明                                   |
| --------------------------------- | -------------------------------------- |
| `collectSrsBlocks(pluginName?)`   | 收集所有 SRS 块                        |
| `collectReviewCards(pluginName?)` | 收集待复习卡片（支持 Cloze 多填空）    |
| `buildReviewQueue(cards)`         | 构建 2:1 交错队列（支持新卡到期检查） |

### 收集逻辑（2025-12-10 更新）

```mermaid
flowchart TD
    A[查询 #card 标签] --> B{有结果?}
    B -->|是| C[合并 state 中的 srs.card 块]
    B -->|否| D[备用：get-all-blocks]
    D --> E[手动过滤 card 标签]
    E --> C
    C --> F{识别卡片类型}
    F -->|Basic| G[生成 1 张 ReviewCard]
    F -->|Cloze| H[为每个填空生成独立 ReviewCard]
    G --> I[返回所有卡片]
    H --> I
```

**关键更新**：

- `collectReviewCards()` 必须接收正确的 `pluginName` 参数
- 用于识别 Cloze inline fragment 类型（`${pluginName}.cloze`）
- 如果不传或传错，Cloze 卡片会被跳过（找不到填空）
- SRS 状态读写统一走 `storage.ts`，读取时通过后端 `get-block` 获取完整 properties，避免使用“半数据块”误判

**Cloze 卡片处理**：

- 从 `block.content` 提取所有 `clozeNumber`
- 为每个填空生成独立的 `ReviewCard` 对象
- 每个 ReviewCard 包含 `clozeNumber` 属性用于标识
- 使用 `loadClozeSrsState(blockId, clozeNumber)` 加载独立的 SRS 状态

---

## deckUtils.ts

**职责**：Deck 管理

### 导出函数

| 函数                        | 说明                     |
| --------------------------- | ------------------------ |
| `extractDeckName(block)`    | 从标签属性提取牌组名称（异步） |
| `calculateDeckStats(cards)` | 计算各 deck 统计信息     |

### extractDeckName 逻辑

1. 查找 `block.refs` 中 `type=2, alias="card"` 的引用
2. 从 `ref.data` 找 `name="牌组"` 且 `type=2 (PropType.BlockRefs)` 的属性
3. 读取 `value`（引用 ID 数组，通常只取第一个）
4. 在 `block.refs` 中用引用 ID 匹配 `BlockRef.id`，获取其 `to`（目标块 ID）
5. 读取目标块 `text` 作为牌组名称；任何一步失败默认 `"Default"`

### extractCardType 逻辑（2025-12-10 新增）

从标签属性中提取卡片类型：

1. 查找 `block.refs` 中 `type=2, alias="card"` 的引用
2. 从 `ref.data` 找 `name="type"` 的属性
3. 返回值：
   - `"cloze"` - 填空卡片
   - `"basic"` - 普通卡片（默认）
4. 支持数组和字符串格式，自动转换为小写

**用途**：

- 在 `collectReviewCards()` 中识别卡片类型
- 决定使用哪种渲染器（`SrsCardDemo` vs `ClozeCardReviewRenderer`）
- 决定是否需要为每个填空生成独立的 ReviewCard

---

## cardCreator.ts

**职责**：卡片创建和扫描

### 导出函数

| 函数                                    | 说明                        |
| --------------------------------------- | --------------------------- |
| `scanCardsFromTags(pluginName)`         | 批量扫描 #card 标签块并转换 |
| `makeCardFromBlock(cursor, pluginName)` | 将光标所在块转换为卡片      |

### 转换流程

```mermaid
flowchart LR
    A[原始块] --> B[添加 #card 标签]
    B --> C[设置 _repr.type='srs.card']
    C --> D[写入初始 SRS 状态]
    D --> E[SRS 卡片块]
```

---

## cardBrowser.ts

**职责**：卡片浏览器弹窗管理

### 导出函数

| 函数                           | 说明           |
| ------------------------------ | -------------- |
| `openCardBrowser(pluginName)`  | 打开浏览器弹窗 |
| `closeCardBrowser(pluginName)` | 关闭浏览器弹窗 |

### 实现细节

- 使用 React 18 `createRoot` API
- 创建 DOM 容器并挂载 `SrsCardBrowser` 组件
- 关闭时卸载组件并移除容器

---

## 相关文件

| 文件                                                                                 | 说明       |
| ------------------------------------------------------------------------------------ | ---------- |
| [panelUtils.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/panelUtils.ts)       | 面板工具   |
| [blockUtils.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/blockUtils.ts)       | 块工具     |
| [cardCollector.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/cardCollector.ts) | 卡片收集   |
| [deckUtils.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/deckUtils.ts)         | Deck 工具  |
| [cardCreator.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/cardCreator.ts)     | 卡片创建   |
| [cardBrowser.ts](file:///d:/orca插件/虎鲸标记%20内置闪卡/src/srs/cardBrowser.ts)     | 浏览器管理 |
