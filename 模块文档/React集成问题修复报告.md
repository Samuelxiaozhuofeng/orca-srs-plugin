# React 集成问题修复报告

> **历史文档**（排查/修复报告，非现行模块规格）  
> **文档同步日期：2026-07-13**：仅校正说明与示例路径；不扩写为完整模块文档。  
> 原则仍有效：Orca 插件运行时从 **`window.React` / `window.ReactDOM`** 取 React，勿对运行时使用 `import … from "react"`（类型可用 `import type`）。

## 问题描述

**错误信息**：
```
[AI Interactive Card Creator] React or ReactDOM not found
```

**根本原因**：
在 Orca 插件环境中，React 不是通过 ES6 `import` 语句作为运行时模块导入，而是通过 `window.React` 全局对象访问。

## 问题分析

### 错误的做法

```typescript
// ❌ 错误：使用 ES6 import 获取运行时
import React, { useState, useMemo } from "react"

// ❌ 错误：仅 as any 取 window 且缺少防护
const React = (window as any).React
```

### 正确的做法

```typescript
// ✅ 从 window.React 解构 hooks
const { useState, useMemo } = window.React

// ✅ 或直接持有引用
const React = window.React
const ReactDOM = window.ReactDOM as any
```

## 当时修复的文件

### 1. `src/components/AICardGenerationDialog.tsx`

- 仅保留 `type` import
- 从 `window.React` 解构 hooks

### 2. `src/srs/ai/aiInteractiveCardCreator.ts`

- 使用 `window.React` / `window.ReactDOM`
- 调试日志与友好 notify
- 兼容 `createRoot` 与旧版 `ReactDOM.render`

> 仓库中可能另有 `aiInteractiveCardCreatorNew.ts` / `aiInteractiveCardCreatorSimple.ts` 等变体；挂载入口以实际 `main`/命令注册为准，本文不声称唯一路径。

## Orca 插件中的 React 使用规范

### 规则 1: 使用 window.React

```typescript
// ✅ 正确
const { useState, useEffect, useMemo } = window.React

// ❌ 错误（运行时）
import React, { useState, useEffect } from "react"
```

### 规则 2: 类型导入仍可用 import

```typescript
import type { KnowledgePoint } from "../srs/ai/aiKnowledgeExtractor"
```

### 规则 3: createElement

```typescript
const React = window.React
const element = React.createElement(MyComponent, { prop1: value1 })
```

### 规则 4: 兼容 ReactDOM API

```typescript
const ReactDOM = window.ReactDOM as any
if (ReactDOM.createRoot) {
  ReactDOM.createRoot(container).render(element)
} else {
  ReactDOM.render(element, container)
}
```

## 参考示例（仓库内常见写法）

### `src/components/SrsFlashcardHome.tsx`

```typescript
const { useState, useEffect, useCallback, useMemo, useRef } = window.React
```

### `src/components/StatisticsView.tsx`

```typescript
const { useState, useEffect, useCallback, useMemo } = window.React
```

### `src/srs/registry/contextMenuRegistry.tsx`

部分注册代码可能使用 `import React from "react"` 并由构建/宿主解析；**UI 组件主路径仍以 `window.React` 为准**。遇到运行时缺失时优先对照 Flash Home / Statistics 等组件。

## 验证思路

1. `npm run build` 通过
2. Orca 中打开 AI 交互制卡等对话框
3. 控制台无 `React or ReactDOM not found`
4. 控制台检查 `window.React` / `window.ReactDOM` 为对象

## 经验教训

1. 宿主环境模块加载方式可能与标准 Vite SPA 不同
2. 类型导入与运行时导入分离
3. 优先对照项目内已稳定的组件写法
4. 缺失全局对象时输出明确调试日志

---

**状态**：历史修复记录；若 AI 对话框架构已迁移到其他 mount 文件，以当前 `src/components/AI*.tsx` / `src/srs/ai/*` 源码为准。
