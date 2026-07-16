# SRS 注册模块

## 概述

`src/srs/registry/` 将插件能力注册到 Orca（命令、Headbar/工具栏/斜杠、块与 inline 渲染器、plain 转换器、块右键菜单）。`main.ts` 在 `load` 中调用各 `register*`，在 `unload` 经 `runPluginUnloadSequence` 调用各 `unregister*`（及额外清理步骤）。

### 设计要点

- **职责分离**：一类能力一个文件
- **对称注册**：register / unregister 成对
- **命令解耦**：`registerCommands(pluginName)` 不注入 main 回调；需要会话入口时动态 `import("../../main")`
- **闭包捕获 `pluginName`**：编辑器命令 undo 使用 `_pluginName`

## 技术实现

### 目录结构

```
src/srs/registry/
├── commands.ts              # 命令 + 编辑器命令
├── uiComponents.tsx         # Headbar / Toolbar / Slash
├── renderers.ts             # 块 + inline 渲染器
├── converters.ts            # plain 转换器
├── contextMenuRegistry.tsx  # 块右键菜单
├── panelTreeUtils.ts        # 面板树工具（host chrome 门控等）
└── *.test.ts                # 单元测试
```

### load 中的注册调用（`main.ts`）

```
registerCommands(pluginName)
registerUIComponents(pluginName)
registerRenderers(pluginName)
registerConverters(pluginName)
registerContextMenu(pluginName)
// 另：startRecentDeckWatcher、IR shortcuts、可选 autoMark（非 registry 文件）
```

### unload 中的注销（节选 cleanupSteps）

顺序见 [SRS_插件入口与命令.md](./SRS_插件入口与命令.md) 的 unload 表。与 registry 相关的步骤：

```
unregisterCommands → unregisterUIComponents → unregisterRenderers
→ unregisterConverters → unregisterContextMenu
```

> 旧文档「converters 最先注销」与现行 `main.ts` 不一致；以 `cleanupSteps` 为准。

---

## 模块 1：`commands.ts`

### 导出

```typescript
export const RESET_FSRS_SETTINGS_COMMAND = "resetFsrsSettings"
export function getResetFsrsSettingsCommandId(pluginName: string): string
export async function resetFsrsSettingsToDefaults(pluginName: string): Promise<void>
export function registerCommands(pluginName: string): void
export function unregisterCommands(pluginName: string): void
```

### 注册的命令

#### 普通命令

| 命令 ID | Label | 实现要点 |
|---------|-------|----------|
| `${pluginName}.scanCardsFromTags` | SRS: 扫描带标签的卡片 | `scanCardsFromTags` |
| `${pluginName}.openFlashcardHome` | SRS: 打开 Flash Home | 动态 import `openFlashcardHome` |
| `${pluginName}.openOldReviewPanel` | SRS: 打开旧复习面板 | 动态 import `startReviewSession` |
| `${pluginName}.startIncrementalReadingSession` | SRS: 打开渐进阅读面板 | 动态 import |
| `${pluginName}.openIRManager` | SRS: 渐进阅读（资料库） | 动态 import `openIRManager` |
| `${pluginName}.toggleAutoExtractMark` | SRS: 切换渐进阅读自动标签 | 写 IR 设置 + start/stop |
| `${pluginName}.clearRecentDeckPreference` | SRS: 清除最近默认牌组 | `clearRecentDeckPreference` |
| `${pluginName}.resetFsrsSettings` | SRS: 恢复 FSRS 默认设置 | `resetFsrsSettingsToDefaults`（F2-08） |
| `${pluginName}.testAIConnection` | SRS: 测试 AI 连接 | `testAIConfigWithDetails` |
| `${pluginName}.importEpub` | 导入 EPUB | `showEpubImportDialog` |
| `${pluginName}.resumeEpubImport` | 继续导入 EPUB | `resumeEpubImport(bookBlockId)` |
| `${pluginName}.removeBookFromIR` | IR: 将整本书移出渐进阅读 | `confirmAndRemoveBookFromIR` |
| `${pluginName}.skipSequentialChapter` | IR: 跳过本章并继续 | IR session CustomEvent |
| `${pluginName}.irSessionNext` | IR: 下一篇 | `orca-srs:ir-session-action` |
| `${pluginName}.irSessionPostpone` | IR: 推后 | 同上 |
| `${pluginName}.irSessionPriority` | IR: 调整重要性 | 同上 |

#### 编辑器命令

| 命令 ID | Label | 实现 |
|---------|-------|------|
| `${pluginName}.makeCardFromBlock` | SRS: 将块转换为记忆卡片 | `makeCardFromBlock` + undo 恢复 `_repr`/text |
| `${pluginName}.createCloze` | SRS: 创建 Cloze 填空 | 可先发 `ir-session-action` itemize；`createClozeFromEditorCommand` |
| `${pluginName}.createTopicCard` | SRS: 创建 Topic 卡片 | `createTopicCard` |
| `${pluginName}.createExtract` | SRS: 创建摘录（Extract） | `createExtract`；undo 删摘录块 |
| `${pluginName}.createListCard` | SRS: 创建列表卡 | `createListCardFromBlock` |
| `${pluginName}.createDirectionForward` | SRS: 创建正向方向卡 → | `insertDirection(..., "forward")` |
| `${pluginName}.createDirectionBackward` | SRS: 创建反向方向卡 ← | `insertDirection(..., "backward")` |
| `${pluginName}.makeAICard` | SRS: AI 生成闪卡 | `startAIFlashcardFlow`（Plan B 弹窗） |
| `${pluginName}.interactiveAICard` | SRS: AI 生成闪卡（兼容别名） | 同上 `startAIFlashcardFlow` |
| `${pluginName}.irRecordProgress` | IR: 记录阅读进度（ir_record） | `updateReadingBreakpoint` / undo 回写 |

#### 编辑器命令 do/undo 模式

```typescript
orca.commands.registerEditorCommand(
  id,
  async (editor, ...args) => {
    // do：返回 { ret, undoArgs } 或 null
  },
  async undoArgs => { /* undo */ },
  { label: "...", hasArgs: false }
)
```

Cloze 创建：先 `CustomEvent("orca-srs:ir-session-action", { action: "itemize", ... })`；若被 `preventDefault` 则由 IR Shell 接管。

### 主要依赖

`cardCreator`、`irClozeCommandService`、`directionUtils`、`listCardCreator`、`topicCardCreator`、`extractUtils`、AI 模块、`incrementalReadingStorage`、`reviewSettingsSchema` / `algorithm`、`recentDeckManager` 等。

---

## 模块 2：`uiComponents.tsx`

### 导出

```typescript
export function registerUIComponents(pluginName: string): void
export function unregisterUIComponents(pluginName: string): void
```

### Headbar

| ID | 说明 |
|----|------|
| `${pluginName}.aiDialogMount` | `AIDialogMount` |
| `${pluginName}.irBookDialogMount` | `IRBookDialogMount` |
| `${pluginName}.epubImportDialogMount` | `EpubImportDialogMount` |
| `${pluginName}.reviewButton` | 脑图标 → `openOldReviewPanel` |
| `${pluginName}.flashHomeButton` | 主页图标 → `openFlashcardHome` |
| `${pluginName}.incrementalReadingButton` | 书图标 → `startIncrementalReadingSession` |

### 工具栏

| ID | 图标 | 命令 |
|----|------|------|
| `${pluginName}.clozeButton` | `ti ti-braces` | `createCloze` |
| `${pluginName}.importEpubButton` | `ti ti-book-upload` | `importEpub` |

### 斜杠命令（group: `SRS`）

| ID | title | command |
|----|-------|---------|
| `makeCard` | 转换为记忆卡片 | `makeCardFromBlock` |
| `listCard` | 列表卡（子块作为条目） | `createListCard` |
| `directionForward` / `directionBackward` | 方向卡 | 对应命令 |
| `aiCard` | AI 生成闪卡 | `makeAICard` |
| `ir` | IR：创建 Topic 卡片 | `createTopicCard` |
| `incrementalReading` | 渐进阅读 | `startIncrementalReadingSession` |
| `ir_record` | ir_record | `irRecordProgress` |
| `importEpub` | 导入 EPUB | `importEpub` |

> Orca 当前版本不支持在本模块注册自定义快捷键；工具栏以 Cloze / EPUB 为主，其余走斜杠或命令面板。

---

## 模块 3：`renderers.ts`

### 导出

```typescript
export function registerRenderers(pluginName: string): void
export function unregisterRenderers(pluginName: string): void
```

### 块渲染器

| 类型 | 组件 | 可编辑 |
|------|------|--------|
| `srs.card` | `SrsCardBlockRenderer` | 否 |
| `srs.cloze-card` | `SrsCardBlockRenderer` | 否 |
| `srs.direction-card` | `SrsCardBlockRenderer` | 否 |
| `srs.choice-card` | `ChoiceCardBlockRenderer` | 否 |
| `srs.review-session` | `SrsReviewSessionRenderer` | 否 |
| `srs.flashcard-home` | `SrsFlashcardHomeRenderer` | 否 |
| `srs.ir-session` | `IncrementalReadingSessionRenderer` | 否 |
| `srs.ir-manager` | `IncrementalReadingManagerPanel` | 否 |

注册形态：`orca.renderers.registerBlock(type, false, Component, [], false)`。

### Inline 渲染器

| 类型 | 组件 |
|------|------|
| `${pluginName}.cloze` | `ClozeInlineRenderer` |
| `${pluginName}.direction` | `DirectionInlineRenderer` |

---

## 模块 4：`converters.ts`

### 导出

```typescript
export function registerConverters(pluginName: string): void
export function unregisterConverters(pluginName: string): void
```

### 块 → plain

| 源类型 | 输出摘要 |
|--------|----------|
| `srs.card` | `[SRS 卡片]\n题目: …\n答案: …` |
| `srs.cloze-card` | `[SRS 填空卡片]\n…` |
| `srs.direction-card` | `[SRS 方向卡片]\nfront ->|<-|<-> back` |
| `srs.choice-card` | `[SRS 选择题卡片]\n题目: …` |
| `srs.review-session` | `[SRS 复习会话面板块]` |
| `srs.flashcard-home` | `[SRS Flashcard Home 面板块]` |
| `srs.ir-session` | `[SRS 渐进阅读面板块]` |
| `srs.ir-manager` | `[SRS 渐进阅读管理面板块]` |

### Inline → plain

| 源类型 | 输出 |
|--------|------|
| `${pluginName}.cloze` | 仅 `fragment.v`（无 `{cN::}` 包装） |
| `${pluginName}.direction` | ` -> ` / ` <- ` / ` <-> `（两侧空格） |

注销：`unregisterBlock("plain", type)` / `unregisterInline("plain", type)`。

---

## 模块 5：`contextMenuRegistry.tsx`

### 导出

```typescript
export function registerContextMenu(pluginName: string): void
export function unregisterContextMenu(pluginName: string): void
```

注销时遍历 `registeredMenuIds` 调用 `unregisterBlockMenuCommand`。

### 菜单项

| 菜单 ID | 条件 / 行为 |
|---------|-------------|
| `${pluginName}.reviewQueryResults` | 查询块：收集结果卡 → 固定重复复习会话 |
| `${pluginName}.reviewChildrenCards` | 非查询块且估计有卡：子树复习 |
| `${pluginName}.createBookIR` | 非查询块：书籍 IR 创建 UI |
| `${pluginName}.removeBookFromIRMenu` | 含属性 `ir.bookPlan`：invoke `removeBookFromIR` |
| `${pluginName}.resumeEpubImportMenu` | `epub.importStatus` ∈ {partial, importing} |
| `${pluginName}.joinTopicIR` | `classifyTopicIRBlockMenu === "join"` |
| `${pluginName}.readTopicToday` | `classifyTopicIRBlockMenu === "readToday"` |

重复复习路径使用 `createFixedRepeatSessionDescriptor` + `createRepeatReviewSession`，与 `main.startRepeatReviewSession` 一致（F2-01 sessionId 绑定）。

---

## 模块 6：`panelTreeUtils.ts`

工具模块（非 Orca register API），供复习面板判断是否应改 host 编辑器 chrome：

| 函数 | 作用 |
|------|------|
| `findPanelIdByBlockView` | 树中查找主视图为某 block 的 panel id |
| `isPanelMainBlockView` | panel 主视图是否为该 block |
| `shouldManageHostEditorChrome` | 仅当 `panelId` 匹配且主视图为该块时允许 maximize/hide 等 |

嵌入渲染（Journal、反链、查询结果）不得改外层编辑器。

---

## 设计原则（现行）

1. **单一职责**：commands / ui / renderers / converters / contextMenu 分离
2. **成对注销**：每个 register 对应 unregister
3. **动态 import 入口**：避免 registry ↔ main 循环依赖
4. **卸载容错**：`runPluginUnloadSequence` 单步失败不中断整链

## 扩展点

1. 新命令：在 `registerCommands` / `unregisterCommands` 同时添加
2. 新 UI：`uiComponents.tsx`
3. 新块类型：`renderers.ts` + `converters.ts` 成对
4. 新右键：`contextMenuRegistry.tsx` 并 `registeredMenuIds.push`

## 相关文件

| 路径 | 说明 |
|------|------|
| `src/main.ts` | 调用 register / unload cleanupSteps |
| `src/srs/pluginUnloadSequence.ts` | 卸载顺序 |
| `src/srs/registry/commands.ts` | 命令 |
| `src/srs/registry/uiComponents.tsx` | UI |
| `src/srs/registry/renderers.ts` | 渲染器 |
| `src/srs/registry/converters.ts` | 转换器 |
| `src/srs/registry/contextMenuRegistry.tsx` | 右键菜单 |
| `src/srs/registry/panelTreeUtils.ts` | 面板树工具 |
| `src/srs/registry/panelTreeUtils.test.ts` | 面板工具测试 |
| `src/srs/registry/resetFsrsSettings.test.ts` | F2-08 相关测试 |
| `src/components/SrsCardBlockRenderer.tsx` 等 | 渲染器组件 |
| `src/srs/srsEvents.ts` | 跨组件广播（非 registry，见事件文档） |

## 文档同步

- **文档同步日期：2026-07-13**
- 补全 contextMenu / panelTreeUtils / 选择题与 IR 渲染与转换、完整命令表；修正 `registerCommands` 签名与卸载顺序；去掉过时行数与错误本机绝对路径。
