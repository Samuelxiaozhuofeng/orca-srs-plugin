# SRS 插件入口与命令模块

## 概述

本模块是插件入口，负责生命周期（`load` / `unload`）、设置 schema 注册、委托 `src/srs/registry/*` 完成命令/UI/渲染器/转换器/右键菜单注册，并导出会话启动等业务函数供其他模块调用。

### 核心职责

- **生命周期**：`load` 注入样式与设置、注册能力、可选启动自动标记与延迟清理；`unload` 经 `runPluginUnloadSequence` 先 flush 日志再逐步清理
- **委托注册**：具体 register/unregister 见 [SRS_注册模块.md](./SRS_注册模块.md)
- **会话入口**：普通复习、重复复习、Flash Home、渐进阅读工作区等函数定义在 `main.ts` 并 export，命令侧通过动态 `import("../../main")` 调用

## 技术实现

### 核心文件

| 文件 | 职责 |
|------|------|
| `src/main.ts` | `load` / `unload`；`startReviewSession` / `openFlashcardHome` / `startRepeatReviewSession` / IR 入口等 |
| `src/srs/pluginUnloadSequence.ts` | 卸载顺序 helper：flush → cleanup 步骤 |
| `src/srs/registry/*` | 命令、UI、渲染器、转换器、右键菜单 |
| `src/srs/settings/reviewSettingsSchema.ts` | 复习 / FSRS 设置 schema 与默认 patch |
| `src/srs/settings/incrementalReadingSettingsSchema.ts` | 渐进阅读设置 |
| `src/srs/ai/aiSettingsSchema.ts` | AI 设置 |

### load 流程

```
Orca 启用插件
  → inject CSS（PLUGIN_UI_STYLE_ROLE = "orca-srs-ui"）
  → setupL10N
  → setSettingsSchema(AI + 复习 + 渐进阅读)
  → registerCommands / UI / Renderers / Converters / ContextMenu
  → startRecentDeckWatcher
  → registerIRDefaultShortcuts（动态 import，失败仅 warn）
  → 若 enableAutoExtractMark → startAutoMarkExtract
  → setTimeout 3s → cleanupDeletedCards（不阻塞启动）
```

要点：

- `registerCommands(pluginName)` **不再**接收 `openFlashcardHome` 等回调；命令内动态 import `main` 导出函数。
- 设置合并：`aiSettingsSchema` + `reviewSettingsSchema` + `incrementalReadingSettingsSchema`。

### unload 流程

由 `runPluginUnloadSequence` 统一执行（见 `pluginUnloadSequence.ts`）：

1. **先** `flushReviewLogs(pluginName)`：数据 API 仍可用时落盘；失败 `console.error` + 可选 `orca.notify`，**不阻断**后续卸载，且不宣称日志已落盘。
2. **再**按序执行 cleanup（单步失败记录后继续）：

| 顺序 | name | 行为 |
|------|------|------|
| 1 | `clearSessionProgressStorage` | `clearRegisteredSessionProgressKeys`（FC-09：不依赖 progress 恢复） |
| 2 | `removeCSSResources` | `orca.themes.removeCSSResources(PLUGIN_UI_STYLE_ROLE)` |
| 3 | `stopRecentDeckWatcher` | 停止最近牌组监听 |
| 4 | `stopAutoMarkExtract` | 停止 IR 自动标记 |
| 5 | `unregisterCommands` | 注销命令 |
| 6 | `unregisterUIComponents` | 注销 Headbar / Toolbar / Slash |
| 7 | `unregisterRenderers` | 注销块 / inline 渲染器 |
| 8 | `unregisterConverters` | 注销 plain 转换器 |
| 9 | `unregisterContextMenu` | 注销块右键菜单 |
| 10 | `cleanupIncrementalReadingManagerBlock` | 清理 IR 管理相关块 |

> 说明：文档旧述「仅 converters → … → commands」已过时；现行顺序以 `main.ts` 的 `cleanupSteps` 为准（命令/UI 在 converters 之前注销）。

### 导出的业务 API（`main.ts`）

| 导出 | 说明 |
|------|------|
| `startReviewSession(deckName?, openInCurrentPanel?)` | 普通复习：`createNormalSessionDescriptor` + `createReviewSessionBlockWithDescriptor`（F2-01 每次新会话块） |
| `openFlashcardHome(openInCurrentPanel?)` | Flash Home；已有同 block 面板则聚焦 |
| `startRepeatReviewSession(blockId, openInCurrentPanel?)` | 查询块 / 子树固定队列复习 |
| `startIncrementalReadingSession(openInCurrentPanel?, workspaceMode?)` | 打开 IR 工作区（`openIRWorkspace`） |
| `openIRManager()` | 管理入口：`workspaceMode = "library"` |
| `getPluginName()` / `getReviewHostPanelId()` | 全局辅助 |
| `getReviewDeckFilter()` | **@deprecated** F2-01：scope 以会话块 descriptor 为准 |
| `collectReviewCards` / `buildReviewQueue` / `buildReviewQueueWithChildren` 等 | 队列与统计 re-export |
| `collectChildCards` / `hasChildCards` / `getCardKey` | 子卡收集 re-export |

#### `startReviewSession`（现行行为摘要）

- 诊断用写入 `reviewDeckFilter`，**Renderer 不得**以此为 scope 来源。
- F2-01：每次启动 `createNormalSessionDescriptor(deckName)`，再 `createReviewSessionBlockWithDescriptor`（禁止复用单例块覆盖 scope）。
- `openInCurrentPanel === true`：当前面板 `goTo`；否则优先复用右侧 panel，否则 `nav.addTo(..., "right", ...)`。

### 命令一览（注册于 `commands.ts`）

#### 普通命令

| 命令 ID 后缀 | Label | 行为要点 |
|--------------|-------|----------|
| `scanCardsFromTags` | SRS: 扫描带标签的卡片 | `scanCardsFromTags` |
| `openFlashcardHome` | SRS: 打开 Flash Home | 动态 import `openFlashcardHome` |
| `openOldReviewPanel` | SRS: 打开旧复习面板 | 动态 import `startReviewSession` |
| `startIncrementalReadingSession` | SRS: 打开渐进阅读面板 | 动态 import |
| `openIRManager` | SRS: 渐进阅读（资料库） | 动态 import `openIRManager` |
| `toggleAutoExtractMark` | SRS: 切换渐进阅读自动标签 | 写设置并 start/stop 自动标记 |
| `clearRecentDeckPreference` | SRS: 清除最近默认牌组 | `clearRecentDeckPreference` |
| `resetFsrsSettings` | SRS: 恢复 FSRS 默认设置 | `resetFsrsSettingsToDefaults` + notify（F2-08） |
| `testAIConnection` | SRS: 测试 AI 连接 | `testAIConfigWithDetails` |
| `importEpub` | 导入 EPUB | 挂载导入对话框 |
| `resumeEpubImport` | 继续导入 EPUB | 参数 `bookBlockId` |
| `removeBookFromIR` | IR: 将整本书移出渐进阅读 | 参数 `bookBlockId` |
| `skipSequentialChapter` | IR: 跳过本章并继续 | `orca-srs:ir-session-action` / 提示 |
| `irSessionNext` / `irSessionPostpone` / `irSessionPriority` | IR: 下一篇 / 推后 / 调整重要性 | `CustomEvent("orca-srs:ir-session-action")` |

#### 编辑器命令

| 命令 ID 后缀 | Label |
|--------------|-------|
| `makeCardFromBlock` | SRS: 将块转换为记忆卡片 |
| `createCloze` | SRS: 创建 Cloze 填空（可先经 IR session action 拦截） |
| `createTopicCard` | SRS: 创建 Topic 卡片 |
| `createExtract` | SRS: 创建摘录（Extract） |
| `createListCard` | SRS: 创建列表卡 |
| `createDirectionForward` / `createDirectionBackward` | 正向 / 反向方向卡 |
| `makeAICard` | SRS: AI 生成记忆卡片 |
| `interactiveAICard` | SRS: AI 智能制卡（交互式） |
| `irRecordProgress` | IR: 记录阅读进度（ir_record） |

#### F2-08：`resetFsrsSettings`

- ID：`${pluginName}.resetFsrsSettings`（`getResetFsrsSettingsCommandId`）
- 写回 `getDefaultFsrsSettingsPatch()`，再 `clearFsrsRuntimeState()`；失败 `notify` + `console.error`，不假装成功

### Headbar / 工具栏 / 斜杠（`uiComponents.tsx`）

#### Headbar

| 按钮 ID 后缀 | 说明 |
|--------------|------|
| `aiDialogMount` / `irBookDialogMount` / `epubImportDialogMount` | 对话框挂载点（无可见图标业务按钮） |
| `reviewButton` | 开始闪卡复习 → `openOldReviewPanel` |
| `flashHomeButton` | 打开 Flash Home（图标 `ti-home`） |
| `incrementalReadingButton` | 打开渐进阅读 |

#### 工具栏

| ID 后缀 | 说明 |
|---------|------|
| `clozeButton` | 创建 Cloze 填空 |
| `importEpubButton` | 导入 EPUB |

#### 斜杠命令（group: SRS）

| ID 后缀 | 标题 | 关联命令 |
|---------|------|----------|
| `makeCard` | 转换为记忆卡片 | `makeCardFromBlock` |
| `listCard` | 列表卡（子块作为条目） | `createListCard` |
| `directionForward` / `directionBackward` | 方向卡 | 对应编辑器命令 |
| `aiCard` / `interactiveAI` | AI 制卡 | 对应编辑器命令 |
| `ir` | IR：创建 Topic 卡片 | `createTopicCard` |
| `incrementalReading` | 渐进阅读 | `startIncrementalReadingSession` |
| `ir_record` | ir_record | `irRecordProgress` |
| `importEpub` | 导入 EPUB | `importEpub` |

### 渲染器与转换器（摘要）

完整表见 [SRS_注册模块.md](./SRS_注册模块.md)。块类型包括：`srs.card`、`srs.cloze-card`、`srs.direction-card`、`srs.choice-card`、`srs.review-session`、`srs.flashcard-home`、`srs.ir-session`、`srs.ir-manager`；inline：`${pluginName}.cloze`、`${pluginName}.direction`。

### 右键菜单（`contextMenuRegistry.tsx`）

| 菜单 ID 后缀 | 显示条件（摘要） |
|--------------|------------------|
| `reviewQueryResults` | 查询块：复习查询结果 |
| `reviewChildrenCards` | 非查询块：子树有卡时复习 |
| `createBookIR` | 非查询块：创建书籍 IR |
| `removeBookFromIRMenu` | 含 `ir.bookPlan`：整本移出 IR |
| `resumeEpubImportMenu` | `epub.importStatus` 为 partial/importing |
| `joinTopicIR` / `readTopicToday` | Topic IR 分类菜单 |

## 用户交互

1. 命令面板搜索「SRS」/「IR」/「EPUB」
2. 编辑器 `/` 斜杠、工具栏 Cloze / EPUB
3. 顶部栏：复习、Flash Home、渐进阅读
4. 块右键：查询/子树复习、书籍 IR、Topic 加入等

## 扩展点

- 新命令：`commands.ts` 的 register + unregister 成对添加
- 新 UI：`uiComponents.tsx`
- 新渲染器 / 转换器：`renderers.ts` / `converters.ts`
- 新卸载步骤：`main.ts` 的 `cleanupSteps` 数组

## 相关文件

| 路径 | 说明 |
|------|------|
| `src/main.ts` | 插件入口 |
| `src/srs/pluginUnloadSequence.ts` | 卸载顺序 |
| `src/srs/registry/commands.ts` | 命令 |
| `src/srs/registry/uiComponents.tsx` | Headbar / Toolbar / Slash |
| `src/srs/registry/renderers.ts` | 渲染器 |
| `src/srs/registry/converters.ts` | 转换器 |
| `src/srs/registry/contextMenuRegistry.tsx` | 块右键菜单 |
| `src/srs/registry/panelTreeUtils.ts` | 面板树查找 / host chrome 门控 |
| `src/srs/settings/reviewSettingsSchema.ts` | 复习设置 |
| `src/srs/settings/incrementalReadingSettingsSchema.ts` | IR 设置 |
| `src/srs/ai/aiSettingsSchema.ts` | AI 设置 |
| `src/srs/flashcardHomeManager.ts` | Flash Home 块 |
| `src/srs/reviewSessionManager.ts` | 复习会话块 |
| `src/srs/reviewSessionDescriptor.ts` | 会话 descriptor |
| `src/srs/incremental-reading/irWorkspacePanelLaunch.ts` | IR 工作区打开 |
| `src/srs/incremental-reading/irShortcutsRegistry.ts` | IR 默认快捷键 |
| `src/libs/l10n.ts` | 国际化 |
| `src/translations/zhCN.ts` | 中文翻译 |

## 文档同步

- **文档同步日期：2026-07-13**
- 对齐现行 `load`/`unload`、F2-01 会话块、完整命令与 Headbar；删除不存在的 `cardBrowser.ts` 等路径；相关文件改为仓库相对路径。
