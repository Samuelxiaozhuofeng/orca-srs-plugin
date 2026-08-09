# SRS 块渲染器模块

> 文档同步日期：2026-08-09
> 变更说明：选择题复习——选项区未揭晓隐藏 `.orca-tags`（真机 `data-name`，旧 `data-tag-name` 从未匹配）；题面暂留 `BlockTextPreview` 纯文本，不得裸用 `SafeBlockPreview`（会进 `ChoiceCardBlockRenderer.contentJsx` 泄选项），也不得靠临时改 `_repr` 绕开。编辑器内 `ChoiceCardBlockRenderer` 不变。
> 同日：`SrsCardBlockRenderer` 结构化卡禁止破坏性行内编辑。
> 2026-07-26 / 07-13：内联编辑保存链路；对齐 `registry/renderers.ts`。

## 概述

本模块在 Orca 编辑器中为带特定 `_repr.type` 的块提供自定义渲染：

| `_repr.type` / 块类型 | 渲染组件 | 场景 |
| --------------------- | -------- | ---- |
| `srs.card` | `SrsCardBlockRenderer` | 编辑器内 Basic（及同类 front/back）卡片块 |
| `srs.cloze-card` | `SrsCardBlockRenderer`（复用） | 编辑器内 Cloze 块（仍用 front/back 展示壳） |
| `srs.direction-card` | `SrsCardBlockRenderer`（复用） | 编辑器内 Direction 块 |
| `srs.choice-card` | `ChoiceCardBlockRenderer` | 编辑器内选择题（选项 + 统计指示） |
| `srs.review-session` | `SrsReviewSessionRenderer` | **复习会话**（见 `模块文档/SRS_卡片复习窗口.md`） |
| `srs.flashcard-home` | `SrsFlashcardHomeRenderer` | 闪卡主页 / 浏览（非 `SrsCardBrowser`） |
| `srs.ir-session` / `srs.ir-manager` | IR 渲染器 | 渐进阅读（见 `模块文档/渐进阅读.md`） |

**注意**：复习过程中的 Cloze / Direction / List / Choice **专用 UI** 由 `SrsCardDemo` 路由到 `*ReviewRenderer`，**不是**本表中的编辑器块渲染器。不要把编辑器内 `SrsCardBlockRenderer` 与复习窗口内的卡种 ReviewRenderer 混为一谈。

### 核心价值

- 编辑器内以卡片样式展示 SRS 块
- Basic 类：题目/答案内联编辑、快速评分
- Choice：选项列表与答题统计指示
- 外层 `SrsErrorBoundary` 隔离渲染崩溃

## 技术实现

### 注册

注册位置：`src/srs/registry/renderers.ts`（由插件入口调用 `registerRenderers` / `unregisterRenderers`）。

```typescript
orca.renderers.registerBlock("srs.card", false, SrsCardBlockRenderer, [], false)
orca.renderers.registerBlock("srs.cloze-card", false, SrsCardBlockRenderer, [], false)
orca.renderers.registerBlock("srs.direction-card", false, SrsCardBlockRenderer, [], false)
orca.renderers.registerBlock("srs.choice-card", false, ChoiceCardBlockRenderer, [], false)
// 另有 srs.review-session / srs.flashcard-home / srs.ir-* 等
```

Inline 渲染器（非块级）：

- `${pluginName}.cloze` → `ClozeInlineRenderer`
- `${pluginName}.direction` → `DirectionInlineRenderer`

### SrsCardBlockRenderer

**文件**：`src/components/SrsCardBlockRenderer.tsx`

#### Props（Orca 块渲染约定 + repr 字段）

| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| `panelId` | `string` | 面板 ID |
| `blockId` | `DbId` | 块 ID |
| `rndId` | `string` | 渲染实例 ID |
| `blockLevel` / `indentLevel` | `number` | 层级 / 缩进 |
| `mirrorId?` | `DbId` | 镜像块时用其数据 |
| `initiallyCollapsed?` | `boolean` | 初始折叠 |
| `renderingMode?` | `"normal" \| "simple" \| "simple-children"` | 渲染模式 |
| `front` | `string` | 题目（来自 `_repr`） |
| `back` | `string` | 答案（来自 `_repr`） |

数据源：`useSnapshot(orca.state)` → `blocks[mirrorId ?? blockId]`。

#### 功能

1. **答案揭示**：有子块时先「显示答案」再展示答案与评分；无子块时直接可评（摘录类场景）。
2. **内联编辑**：仅普通卡渲染题目/答案编辑入口；保存走 `core.editor.setBlocksContent`；答案写第一个子块。
   - 先用 `getAllClozeNumbers(block.content, pluginName)` 与 `extractDirectionInfo(block.content, pluginName)` 检测实际 fragment。命中任一结构时，题目与答案均不渲染编辑按钮，并显示「该卡含填空/方向结构，请在源块中编辑。」
   - 检测抛错时不得当成普通卡放行：编辑入口保持关闭，块内显示失败提示，并经 `orca.notify("error", ...)` 报告。
   - **保存链路（2026-07-26，低危#12）**：块的 `content`/`text` 由宿主 `setBlocksContent` 自行同步到 `orca.state`——**不手写 store**（此前直接改 `.text` 的写法已删）；写成功后 `invalidateBlockCache(targetBlockId)`。
   - `_repr.front` / `_repr.back` 是**插件维护的展示元数据**（宿主不感知、不同步；remount 与复习端依赖），保存后按仓库惯例对 `_repr` **整体重赋值**（`liveBlock._repr = { ...liveBlock._repr, front: … }`，`BlockWithRepr` 类型）——这是有据保留的承重代码，非手写宿主状态。
3. **快速评分**：Again / Hard / Good / Easy → `updateSrsState(blockId, grade, "orca-srs")`；成功后 `showNotification`（简化日期 `M-D` + 间隔天数）。
4. **SRS 详细信息**：**已隐藏**（不在 UI 显示完整 due/stability/reps 等）。
5. **BlockShell**：`contentAttrs={{ contentEditable: false }}`，内容由自定义 JSX 承担；子块仍由 `BlockChildren` 渲染。
6. **错误边界**：`contentJsx` 外包 `SrsErrorBoundary`（`componentName="SRS卡片"`，`errorTitle="卡片加载出错"`）。

#### 界面结构（示意）

```
┌─────────────────────────────────────────┐
│ 🎴 SRS 记忆卡片                         │
├─────────────────────────────────────────┤
│ 面包屑 + 题目：                  [编辑] │
│ ┌─────────────────────────────────────┐ │
│ │ front 文本                          │ │
│ └─────────────────────────────────────┘ │
│            [ 显示答案 ] / 答案区        │
│    [Again] [Hard] [Good] [Easy]         │
└─────────────────────────────────────────┘
  （无完整 SRS 状态栏）
```

#### 状态

- `showAnswer`、`isEditingFront` / `isEditingBack`
- `editedFront` / `editedBack`、`frontDisplay` / `backDisplay`
- `isSavingFront` / `isSavingBack`
- `blockId` / `front` / `back` 变化时重置编辑与揭示状态

### ChoiceCardBlockRenderer

**文件**：`src/components/ChoiceCardBlockRenderer.tsx`

- 注册类型：`srs.choice-card`。
- 从块解析选项：`extractChoiceOptions` / `detectChoiceMode`（`src/srs/choiceUtils.ts`）。
- 展示模式文案（单选/多选/未设正确答案）、选项列表；编辑场景可挂 `ChoiceStatisticsIndicator`。
- 同样用 `BlockShell` + `SrsErrorBoundary`（`componentName="选择题卡片"`）。

**不在本组件内完成 FSRS 评分流程**；正式复习走 `ChoiceCardReviewRenderer`（会话内）。

### 复习会话内卡种渲染器（对照）

由 `SrsCardDemo` 在会话中按卡类型挂载，共用 `useReviewShortcuts`、只读回看、评分回调等：

| 组件 | 文件 |
| ---- | ---- |
| `ClozeCardReviewRenderer` | `src/components/ClozeCardReviewRenderer.tsx` |
| `DirectionCardReviewRenderer` | `src/components/DirectionCardReviewRenderer.tsx` |
| `ListCardReviewRenderer` | `src/components/ListCardReviewRenderer.tsx` |
| `ChoiceCardReviewRenderer` | `src/components/ChoiceCardReviewRenderer.tsx` |
| Cloze 块内容辅助 | `src/components/ClozeReviewBlockContent.tsx` |

## 样式要点

- 背景 / 边框：`var(--orca-color-bg-1)` / `bg-2` / `border-1`
- 评分按钮：Again 偏危险、Hard soft、Good/Easy solid / 主色
- 手柄与折叠：局部 CSS 默认隐藏，hover 对应块时显示

## 扩展点

1. Cloze/Direction 编辑器内块若需与 ReviewRenderer 一致的交互，可改为专用块渲染器（当前复用 Basic 壳，但行内编辑已受结构保护）。
2. 键盘快捷键：编辑器块内未挂 `useReviewShortcuts`（会话内才有）。
3. List 卡若有独立 `_repr.type`，需在 `registerRenderers` 单独注册（当前列表复习主要走会话队列 identity，而非本表编辑器块类型）。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/SrsCardBlockRenderer.tsx` | Basic/cloze/direction 编辑器块 |
| `src/components/ChoiceCardBlockRenderer.tsx` | 选择题编辑器块 |
| `src/components/SrsErrorBoundary.tsx` | 错误边界 |
| `src/components/ChoiceStatisticsIndicator.tsx` | 选择题统计指示 |
| `src/srs/registry/renderers.ts` | 注册 / 注销 |
| `src/srs/storage.ts` | `updateSrsState` |
| `src/srs/choiceUtils.ts` | 选项解析 |
| `src/srs/settings/reviewSettingsSchema.ts` | `showNotification` 等 |
| `src/components/SrsCardDemo.tsx` | 会话内卡种路由 |
| `src/components/*ReviewRenderer.tsx` | 各卡种复习 UI |
| `src/components/SrsCardBlockRenderer.structuredGuard.test.ts` | Cloze / Direction 编辑保护、Basic 保存与检测失败回归 |
