# SRS 卡组备注

> **文档同步日期：2026-07-13**  
> **权威文档**。历史实现总结见 [SRS 卡组备注功能.md](SRS%20卡组备注功能.md)（已降级为摘要）。

## 概述

为每个卡组（Deck）保存一段文本备注，持久化在插件数据中，并在 Flash Home 卡组列表中展示与编辑。

## 功能

- 添加 / 编辑 / 清空备注（空字符串保存 = 删除）
- 卡组行内展示备注预览，支持搜索高亮（见卡组搜索）
- 加载时批量 `getAllDeckNotes` 合并进 `DeckInfo.note`

## 数据存储

- 键：`deckNotes`（`orca.plugins.getData` / `setData`）
- 值：JSON 字符串，解析为 `{ [deckName: string]: string }`
- 写入前 `trim`；空内容则 `delete` 该 key 再写回

## API（`src/srs/deckNoteManager.ts`）

| 函数 | 说明 |
| ---- | ---- |
| `getDeckNote(pluginName, deckName)` | 单卡组备注，失败/缺失 → `""` |
| `setDeckNote(pluginName, deckName, note)` | 设置或删除；失败 throw |
| `deleteDeckNote(pluginName, deckName)` | 等价于 `setDeckNote(..., "")` |
| `getAllDeckNotes(pluginName)` | 全量 map，失败 → `{}` |
| `renameDeckNote(pluginName, old, new)` | 改名时迁移备注（若旧 key 存在） |

## 类型

`DeckInfo.note?: string`（`src/srs/types.ts`）

## UI 集成（Flash Home）

实现文件：`src/components/SrsFlashcardHome.tsx`。

### 数据流

1. `loadData`：`getAllDeckNotes` → 映射到 `deckStats.decks[].note`
2. 保存：动态 `import("../srs/deckNoteManager")` → `setDeckNote` → `onNoteChange` 更新本地 state
3. 取消：还原 `noteText` 为 `deck.note`

### 现行主路径：`DeckRow`（表格）

卡组列表 **当前只渲染 `DeckRow`**：

- 有备注时在名称下方灰色小字展示；点击进入编辑
- 编辑：单行 `input` + 取消 / 保存
- 备注按钮（笔记图标）也可进入编辑
- 搜索时备注走 `HighlightText`

### 仍保留但未挂载的 `DeckCard`

同文件内的 `DeckCard` 支持多行 `textarea` 与「添加备注」按钮；**DeckListView 未使用该组件**。  
独立文件 `DeckCardCompact.tsx` 亦无备注能力且未在 Home 引用。  
演示：`src/components/DeckNoteDemo.tsx`。

## 注意事项

1. 备注与 **卡组名称字符串** 绑定；改 Deck 标签名需调用 `renameDeckNote`，否则备注 orphan。
2. 随插件数据存，卸载/清数据会丢。
3. 支持 Unicode 与多行内容；表格行编辑以单行控件为主。
4. 全量加载一次，避免按 Deck 反复 getData。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/srs/deckNoteManager.ts` | 存储与 API |
| `src/srs/types.ts` | `DeckInfo.note` |
| `src/components/SrsFlashcardHome.tsx` | UI 与合并逻辑 |
| `src/components/DeckNoteDemo.tsx` | 演示 |
| [SRS_卡组搜索.md](SRS_卡组搜索.md) | 按备注搜索 |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | Flash Home |
