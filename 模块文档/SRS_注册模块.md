# SRS 注册模块

> 入口生命周期（load/unload 顺序、main.ts 导出的业务 API）与命令/Headbar 的**摘要表**见 [SRS_插件入口与命令.md](./SRS_插件入口与命令.md)；本文件是 `src/srs/registry/*` 的逐文件权威清单，两文档如有出入以代码为准并同步修正。

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
├── headbarButtons.ts        # Headbar 按钮配置（纯数据：可见入口 / mount / legacy 清理）
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
| `${pluginName}.openFlashcardHome` | SRS: 今日学习 | 动态 import `openFlashcardHome`（命令 ID 保留旧名兼容） |
| `${pluginName}.openOldReviewPanel` | SRS: 开始复习 | 动态 import `startReviewSession`（次级入口 / 兼容旧命令 ID） |
| `${pluginName}.startIncrementalReadingSession` | SRS: 打开阅读材料 | 动态 import（次级入口） |
| `${pluginName}.openIRManager` | SRS: 渐进阅读（资料库） | 动态 import `openIRManager` |
| `${pluginName}.toggleAutoExtractMark` | SRS: 切换渐进阅读自动标签 | 写 IR 设置 + start/stop |
| `${pluginName}.clearRecentDeckPreference` | SRS: 清除最近默认牌组 | `clearRecentDeckPreference` |
| `${pluginName}.resetFsrsSettings` | SRS: 恢复 FSRS 默认设置 | `resetFsrsSettingsToDefaults`（F2-08） |
| `${pluginName}.testAIConnection` | SRS: 测试 AI 连接 | `testAIConfigWithDetails` |
| `${pluginName}.manageAIToolbarPrompts` | SRS: 打开 AI 提示词库 | 动态 import `openAIPromptManager` |
| `${pluginName}.openAIServiceSettings` | SRS: AI / Firecrawl 服务设置 | 动态 import `openAIServiceSettings`（独立面板） |
| `${pluginName}.importEpub` | 导入 EPUB | `showEpubImportDialog` |
| `${pluginName}.importWeb` | 导入网页 | `showWebImportDialog`（Firecrawl） |
| `${pluginName}.resumeEpubImport` | 继续导入 EPUB | `resumeEpubImport(bookBlockId)` |
| `${pluginName}.removeBookFromIR` | IR: 将整本书移出渐进阅读 | `confirmAndRemoveBookFromIR` |
| `${pluginName}.skipSequentialChapter` | IR: 跳过本章并继续（**兼容**；阅读主路径不暴露，新操作走「完成」/`completed`） | IR session CustomEvent `skipChapter` |
| `${pluginName}.irSessionNext` | IR: 下一篇 | `orca-srs:ir-session-action` |
| `${pluginName}.irSessionPostpone` | IR: 推后 | 同上 |
| `${pluginName}.irSessionPriority` | IR: 调整重要性 | 同上 |
| `${pluginName}.irToggleViewMode` | IR: 切换到编辑模式 | 同上（`action: "toggleViewMode"`） |

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
| `${pluginName}.aiQuickInteract` | SRS: AI 快捷交互 | `hasArgs: true`；`startAIQuickInteractFlow`（preset promptId / `__custom__`） |
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

## 模块 2：`uiComponents.tsx` + `headbarButtons.ts`

### 导出

```typescript
// uiComponents.tsx
export function registerUIComponents(pluginName: string): void
export async function unregisterUIComponents(
  pluginName: string,
  options?: { aiCancelTimeoutMs?: number }  // 默认 AI_BACKGROUND_CANCEL_TIMEOUT_MS = 3000
): Promise<void>

// headbarButtons.ts（纯数据配置，便于测试）
export const VISIBLE_HEADBAR_BUTTONS: readonly HeadbarVisibleButtonSpec[]
export const LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES: readonly string[]
export const HEADBAR_MOUNT_SUFFIXES: readonly string[]
export function headbarButtonId(pluginName, suffix): string
export function listVisibleHeadbarButtonIds(pluginName): string[]
export function listUnregisterHeadbarButtonIds(pluginName): string[]  // mount → visible → legacy
```

### Headbar

三类按钮 id 均来自 `headbarButtons.ts`：

**1. 可见业务入口（`VISIBLE_HEADBAR_BUTTONS`）——当前仅一个：**

| ID 后缀 | title | 图标 | 命令 |
|---------|-------|------|------|
| `todayLearningButton` | 今日学习 | `ti ti-calendar-check` | `${pluginName}.openFlashcardHome`（命令 ID 保留旧名兼容） |

**2. 对话框 mount（`HEADBAR_MOUNT_SUFFIXES`，不可见业务按钮，必须保留；均包 `SrsErrorBoundary`）：**

| ID 后缀 | 组件 |
|---------|------|
| `aiDialogMount` | `AIDialogMount`（AI 生成闪卡） |
| `aiQuickInteractMount` | `AIQuickInteractMount`（AI 快捷交互） |
| `aiPromptManagerMount` | `AIPromptManagerMount`（管理 AI 提示词） |
| `aiServiceSettingsMount` | `AIServiceSettingsMount`（AI 服务设置） |
| `irBookDialogMount` | `IRBookDialogMount`（Book IR 创建） |
| `epubImportDialogMount` | `EpubImportDialogMount`（EPUB 导入） |
| `webImportDialogMount` | `WebImportDialogMount`（网页导入） |

**3. LEGACY 清理组（`LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES`）——不再注册，仅在 unregister 时对称清理以兼容旧版本卸载：**

`reviewButton` / `flashHomeButton` / `incrementalReadingButton` / `aiPromptLibraryButton` / `aiServiceSettingsButton`

`unregisterUIComponents` 已 **async**（2026-07-26，低危#17）：先启动后台 AI 快捷任务取消（`cancelAllBackgroundQuickJobs`，与同步注销并行），函数末尾 `Promise.race` **有界等待**其完成（默认 `AI_BACKGROUND_CANCEL_TIMEOUT_MS = 3000`）——unload 序列真正 await 到该清理；超时/失败向上抛出，由 `runPluginUnloadSequence` 记入 `cleanupErrors`（可见不吞错）；超时后迟到的失败仍有 `console.error`。回归：`uiComponents.unload.test.ts`。

### 工具栏

| ID | 图标 | 行为 |
|----|------|------|
| `${pluginName}.clozeButton` | `ti ti-braces` | 命令 `createCloze` |
| `${pluginName}.aiQuickInteract` | `ti ti-sparkles` | 下拉菜单：`getToolbarAIPrompts` 各预设 → 编辑器命令 `aiQuickInteract`；「提示词库…」→ `manageAIToolbarPrompts`；「自定义提示词…」→ `aiQuickInteract("__custom__")` |

> 旧 `importEpubButton` 工具栏按钮已移除；EPUB 导入走斜杠命令 / 命令面板。

### 斜杠命令（group: `SRS`）

| ID 后缀 | title | command |
|---------|-------|---------|
| `makeCard` | 转换为记忆卡 | `makeCardFromBlock` |
| `listCard` | 列表卡（子块作为条目） | `createListCard` |
| `directionForward` | 创建正向方向卡 → (光标位置分隔问答) | `createDirectionForward` |
| `directionBackward` | 创建反向方向卡 ← (光标位置分隔问答) | `createDirectionBackward` |
| `aiCard` | AI 生成记忆卡 | `makeAICard` |
| `manageAIPrompts` | 打开 AI 提示词库 | `manageAIToolbarPrompts` |
| `openAIServiceSettings` | AI / Firecrawl 服务设置 | `openAIServiceSettings` |
| `ir` | 创建阅读材料（主题） | `createTopicCard` |
| `incrementalReading` | 打开阅读工作区 | `startIncrementalReadingSession` |
| `ir_record` | 记录阅读进度 | `irRecordProgress` |
| `todayLearning` | 今日学习 | `openFlashcardHome` |
| `importEpub` | 导入 EPUB | `importEpub` |
| `importWeb` | 导入网页 | `importWeb` |

注销时额外 try/catch 清理旧构建可能注册过的 `${pluginName}.interactiveAI` 斜杠 id（失败仅 warn）。

> Orca 当前版本不支持在本模块注册自定义快捷键；工具栏保留「填空卡 + AI 快捷交互」入口，其余走斜杠或命令面板。

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

**查询块失败语义**（与 [SRS_复习队列管理.md](./SRS_复习队列管理.md) 的 `getQueryResults` 对应）：

- `handleReviewError` 对 `error instanceof QueryExecutionError` 单独分支：notify `error`「查询执行失败，请重试」（title「SRS 复习」），与「查询结果中没有找到卡片」的 info 通知明确区分。
- `QueryBlockMenuItem` 的 `fetchCount` 失败（含 `QueryExecutionError`）落入本地 `hasError`：菜单标题显示「复习此查询结果 (加载失败)」并禁用，不伪装成 0 张卡。

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
| `src/srs/registry/headbarButtons.ts` | Headbar 按钮配置（可见 / mount / legacy） |
| `src/srs/registry/renderers.ts` | 渲染器 |
| `src/srs/registry/converters.ts` | 转换器 |
| `src/srs/registry/contextMenuRegistry.tsx` | 右键菜单 |
| `src/srs/registry/panelTreeUtils.ts` | 面板树工具 |
| `src/srs/registry/panelTreeUtils.test.ts` | 面板工具测试 |
| `src/srs/registry/headbarButtons.test.ts` | Headbar 配置测试 |
| `src/srs/registry/resetFsrsSettings.test.ts` | F2-08 相关测试 |
| `src/components/SrsCardBlockRenderer.tsx` 等 | 渲染器组件 |
| `src/srs/srsEvents.ts` | 跨组件广播（非 registry，见事件文档） |

## 文档同步

- **文档同步日期：2026-07-26**
- 对齐「今日学习」改版后的注册现状：目录补 `headbarButtons.ts`；Headbar 改为「单一可见入口 `todayLearningButton` + 7 个对话框 mount + LEGACY 清理组」；命令表补 `manageAIToolbarPrompts` / `openAIServiceSettings` / `importWeb` / `irToggleViewMode` / `aiQuickInteract`，并更正 `openFlashcardHome`（SRS: 今日学习）、`openOldReviewPanel`（SRS: 开始复习）、`startIncrementalReadingSession`（SRS: 打开阅读材料）的 label；斜杠表补 `todayLearning` / `importWeb` / `manageAIPrompts` / `openAIServiceSettings` 并更正各 title；工具栏 `importEpubButton` 改为 `aiQuickInteract` 下拉；补查询块 `QueryExecutionError` 失败语义；文首加与 [SRS_插件入口与命令.md](./SRS_插件入口与命令.md) 的交叉引用。
- 2026-07-13：补全 contextMenu / panelTreeUtils / 选择题与 IR 渲染与转换、完整命令表；修正 `registerCommands` 签名与卸载顺序；去掉过时行数与错误本机绝对路径。
