# SRS 快捷键（搜索 / 复习 / 渐进阅读）

> 文档同步日期：2026-07-13  
> 变更说明：由「卡组搜索去掉 Ctrl+F」的变更记录扩展为现行快捷键实现说明；覆盖卡组搜索、复习会话（`useReviewShortcuts`）、渐进阅读会话（`useIRShortcuts` + registry）。

## 概述

本仓库内键盘相关逻辑分三块，**互不共用一套全局 map**：

| 场景 | 实现 | 作用域 |
| ---- | ---- | ------ |
| 卡组搜索 | `DeckSearchDemo` 输入框 `onKeyDown` | 仅搜索框内 Escape |
| 复习会话 | `useReviewShortcuts` + `reviewShortcutRules` | `document` keydown（过滤输入框） |
| 渐进阅读会话 | `useIRShortcuts` + `irShortcutRules`；摘录/填空可走 Orca `shortcuts.assign` | 会话 DOM 树 + 部分全局可重绑定 |

---

## 1. 卡组搜索

**文件**：`src/components/DeckSearchDemo.tsx`

### 现行行为

| 按键 | 行为 |
| ---- | ---- |
| `Escape` | 清空搜索内容（输入框 `onKeyDown`） |
| 点击清除按钮 | 同清空 |

### 已移除（历史）

- ~~`Ctrl+F` / `Cmd+F` 全局聚焦搜索框~~：已删除，避免与浏览器页面搜索冲突。
- 不再注册全局 `document` 监听用于聚焦搜索。

### 聚焦方式

1. 鼠标点击搜索框  
2. Tab / Shift+Tab 导航  
3. 点击搜索图标区域（若 UI 提供）

保留：实时过滤、高亮、统计等与快捷键无关的搜索体验。

---

## 2. 复习会话快捷键

### 文件

| 文件 | 职责 |
| ---- | ---- |
| `src/hooks/useReviewShortcuts.ts` | 挂 `document` `keydown`，调用解析并执行回调 |
| `src/hooks/reviewShortcutRules.ts` | 纯函数 `resolveReviewShortcut`（可单测） |

### 挂载位置

各复习 UI 自行调用（互不冲突：仅当前挂载的渲染器 `enabled`）：

- `SrsCardDemo`：仅 `shouldRenderBasicCard` 时 `enabled`
- `ClozeCardReviewRenderer` / `DirectionCardReviewRenderer` / `ListCardReviewRenderer` / `ChoiceCardReviewRenderer`：各自启用

### 通用键位

| 按键 | 条件 | 动作 |
| ---- | ---- | ---- |
| `空格` | 答案**未**显示 | `showAnswer`（见下节 Choice 例外） |
| `空格` | 答案**已**显示 | 评分为 **good** |
| `1` | 答案已显示 | grade `again` |
| `2` | 答案已显示 | grade `hard` |
| `3` | 答案已显示 | grade `good` |
| `4` | 答案已显示 | grade `easy` |
| `b` | — | bury / 推迟（需提供 `onBury`） |
| `s` | — | suspend（需提供 `onSuspend`） |

答案未显示时，数字评分键**不生效**（解析为 `none`）。

### 选择题额外键

当传入 `choiceCard: { mode, optionCount, onSelectOption, onSubmit }` 且答案未显示：

| 按键 | 条件 | 动作 |
| ---- | ---- | ---- |
| `1`–`9` | 序号 ≤ `optionCount` | `choiceSelect`（索引 `n-1`） |
| `Enter` | `mode === "multiple"` | `choiceSubmit` |
| `空格` | `mode === "multiple"` 且未揭晓 | **提交**（不走 showAnswer） |
| `空格` | 单选 / 其它 | 仍为 `showAnswer`（若 `hasShowAnswer`） |

### 门控与安全

`resolveReviewShortcut` / Hook 行为：

1. `enabled === false` 或 `isGrading === true` → 全部忽略（UI 层）。
2. **`readOnly === true`（FC-06）**：禁止 grade / bury / suspend / choice 选择与提交；**仍允许**显示答案（只读回看）。多选空格提交在 readOnly 下也为 `none`。
3. 焦点在 `INPUT` / `TEXTAREA` / `contentEditable` → 不处理。
4. **并发正确性**：`isGrading` 只禁用快捷键展示层；正式 FSRS / 推迟 / 暂停防重依赖 `reviewSessionActionGate`；选择题答案提交防重依赖 `choiceSubmitGate`（见 `模块文档/SRS_卡片复习窗口.md`）。

---

## 3. 渐进阅读（IR）快捷键

### 会话内 Hook

| 文件 | 职责 |
| ---- | ---- |
| `src/hooks/useIRShortcuts.ts` | capture 阶段 `keydown`；IME composition 停用 |
| `src/hooks/irShortcutRules.ts` | 可编辑/交互目标、选区、Enter 是否处理等纯规则 |

**挂载**：`src/components/incremental-reading/IRSessionShell.tsx` 传入 `sessionRootRef` 与 handlers。

| 按键 | 处理位置 | 动作（handlers） |
| ---- | -------- | ---------------- |
| `Enter`（无 Shift） | **仅** `useIRShortcuts` | `onNext`（下一则） |
| `Shift+Enter` | **仅** Hook | `onPostpone` |
| `Alt+P` | **仅** Hook | `onPriority` |
| `Escape` | Hook（须事件在会话 root 内） | `onEscape` |

**故意不**通过 Orca 全局 `shortcuts.assign` 绑定 Enter / Shift+Enter，避免绕过焦点/IME 保护、影响其它面板。历史若误绑 `enter` / `shift+enter` 到会话命令，`registerIRDefaultShortcuts` 会尝试解除。

### 冲突规则（摘要）

- 弹窗、`input` / `textarea` / `select` / `contenteditable` / dialog 类目标：视为可编辑，限制会话键。
- `button` / `a[href]` / 部分 `role=*`：交互目标，Enter 不抢。
- 非空文本选区时 Enter 可走「下一则」策略（`shouldHandleEnter`）。
- 多面板：事件目标须在本会话 `sessionRootRef` 内（Escape 亦要求 inRoot）。
- IME `compositionstart/end` 或 `event.isComposing` 期间不处理。

### Orca 可重绑定默认键

**文件**：`src/srs/incremental-reading/irShortcutsRegistry.ts`

| 默认快捷键 | 命令（示例） | 说明 |
| ---------- | ------------ | ---- |
| `alt+x` | `${pluginName}.createExtract` | 创建摘录；可用户重绑 |
| `alt+z` | `${pluginName}.createCloze` | 创建填空 |

- 若命令已绑定到其它键，或默认键已被占用，则跳过 assign。
- **Alt+X / Alt+Z** 由编辑器命令路径处理，**不**在 `useIRShortcuts` 内再触发一次，避免双重执行。

---

## 用户交互对照

| 用户意图 | 应使用 |
| -------- | ------ |
| 清空卡组搜索 | 搜索框内 `Escape` 或清除按钮 |
| 浏览器内找页面文本 | 系统 `Ctrl/Cmd+F`（插件不再劫持） |
| 复习显示答案 / 评分 | 复习界面空格与 1–4 |
| 复习推迟 / 暂停 | `b` / `s` |
| 选择题选题 / 多选提交 | 1–9 / Enter（或空格提交多选） |
| IR 下一则 / 推迟 / 优先级 | Enter / Shift+Enter / Alt+P |
| IR 摘录 / 填空 | Alt+X / Alt+Z（可重绑定） |

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/DeckSearchDemo.tsx` | 卡组搜索 Escape |
| `src/hooks/useReviewShortcuts.ts` | 复习快捷键 Hook |
| `src/hooks/reviewShortcutRules.ts` | 复习键解析 |
| `src/hooks/useIRShortcuts.ts` | IR 会话快捷键 Hook |
| `src/hooks/irShortcutRules.ts` | IR 冲突规则 |
| `src/srs/incremental-reading/irShortcutsRegistry.ts` | IR 默认可重绑定注册 |
| `src/components/incremental-reading/IRSessionShell.tsx` | 挂载 `useIRShortcuts` |
| `src/components/SrsCardDemo.tsx` 及各 `*ReviewRenderer.tsx` | 挂载 `useReviewShortcuts` |
| `src/srs/reviewSessionActionGate.ts` | 评分类动作并发门控 |
| `src/srs/choiceSubmitGate.ts` | 选择题提交门控 |

## 历史说明（卡组搜索）

早期版本曾用全局 `Ctrl/Cmd+F` 聚焦搜索框，后移除以符合浏览器习惯并减少冲突。现行代码中该监听已不存在；文档与演示文案仅保留 Escape 清空说明。
