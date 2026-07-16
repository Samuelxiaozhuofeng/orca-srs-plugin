# React 集成问题修复报告

> **历史文档**（排查/修复报告，非现行模块规格）
> **当前状态（2026-07-16）**：Plan B AI 闪卡已移除 `aiInteractiveCardCreator*.ts` 与知识点类型；正式路径见 [SRS_AI模块.md](./SRS_AI模块.md)。
> 原则仍有效：Orca 插件运行时从 **`window.React` / `window.ReactDOM`** 取 React，勿对运行时使用 `import … from "react"`（类型可用 `import type`）。

## 问题描述（历史）

**错误信息**：
```
[AI Interactive Card Creator] React or ReactDOM not found
```

**根本原因**：
在 Orca 插件环境中，React 不是通过 ES6 `import` 语句作为运行时模块导入，而是通过 `window.React` 全局对象访问。

## 问题分析

### 错误的做法

```typescript
// 错误：使用 ES6 import 获取运行时
import React, { useState, useMemo } from "react"

// 错误：仅 as any 取 window 且缺少防护
const React = (window as any).React
```

### 正确的做法

```typescript
// 从 window.React 解构 hooks
const { useState, useMemo } = window.React

// 或直接持有引用
const React = window.React
const ReactDOM = window.ReactDOM as any
```

## 历史修复文件（已过时路径）

以下文件名来自当时的交互制卡实验，**多数已删除或重写**：

| 历史路径 | 现状 |
| --- | --- |
| `src/components/AICardGenerationDialog.tsx` | 仍存在，已改为 Plan B 预览 UI |
| `src/srs/ai/aiInteractiveCardCreator.ts` 等 | **已删除** |
| `src/srs/ai/aiKnowledgeExtractor.ts` | **已删除** |

现行挂载：`AIDialogMount` + `aiDialogState` + `startAIFlashcardFlow`（见 [SRS_AI模块.md](./SRS_AI模块.md)）。

## Orca 插件中的 React 使用规范

### 规则 1: 使用 window.React

```typescript
// 正确
const { useState, useEffect, useMemo } = window.React

// 错误（运行时）
import React, { useState, useEffect } from "react"
```

### 规则 2: 类型导入仍可用 import type

```typescript
// 现行示例（类型）
import type { AICardDraft } from "../srs/ai/aiDraftTypes"
```

（历史示例曾 import 已删除的 `KnowledgePoint`，请勿再使用。）

### 规则 3: createElement

```typescript
const React = window.React
const element = React.createElement(MyComponent, { prop1: value1 })
```

### 规则 4: 兼容 ReactDOM API

优先 `ReactDOM.createRoot`，旧环境可回退 `ReactDOM.render`。现行 AI 弹窗经 Headbar 挂入 Orca 的 React 树，一般无需独立 root。
