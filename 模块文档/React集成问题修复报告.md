# React 集成问题修复报告

## 🐛 问题描述

**错误信息**：
```
[AI Interactive Card Creator] React or ReactDOM not found
```

**根本原因**：
在 Orca 插件环境中，React 不是通过 ES6 `import` 语句导入的，而是通过 `window.React` 全局对象访问的。

## 🔍 问题分析

### 错误的做法

```typescript
// ❌ 错误：使用 ES6 import
import React, { useState, useMemo } from "react"

// ❌ 错误：尝试从 window 获取但类型不对
const React = (window as any).React
```

### 正确的做法

```typescript
// ✅ 正确：从 window.React 解构
const { useState, useMemo } = window.React

// ✅ 正确：直接使用 window.React
const React = window.React
const ReactDOM = window.ReactDOM as any
```

## 🛠️ 已修复的文件

### 1. `src/components/AICardGenerationDialog.tsx`

**修改前**：
```typescript
import React, { useState, useMemo } from "react"
```

**修改后**：
```typescript
import type { KnowledgePoint } from "../srs/ai/aiKnowledgeExtractor"

const { useState, useMemo } = window.React
```

**关键点**：
- ✅ 只保留 `type` import（类型导入）
- ✅ 从 `window.React` 解构 hooks
- ✅ 组件内部直接使用 `useState`、`useMemo` 等

### 2. `src/srs/ai/aiInteractiveCardCreator.ts`

**修改前**：
```typescript
const React = (window as any).React
const ReactDOM = (window as any).ReactDOM

if (!React || !ReactDOM) {
  console.error("[AI Interactive Card Creator] React or ReactDOM not found")
  orca.notify("error", "无法加载对话框组件")
  return
}
```

**修改后**：
```typescript
const React = window.React
const ReactDOM = window.ReactDOM as any

if (!React || !ReactDOM) {
  console.error("[AI Interactive Card Creator] React or ReactDOM not found")
  console.error("[AI Interactive Card Creator] window.React:", typeof window.React)
  console.error("[AI Interactive Card Creator] window.ReactDOM:", typeof window.ReactDOM)
  orca.notify("error", "无法加载对话框组件，请刷新页面重试")
  return
}

// 兼容新旧版本的 ReactDOM
if (!dialogRoot) {
  if (ReactDOM.createRoot) {
    dialogRoot = ReactDOM.createRoot(container)
  } else {
    console.warn("[AI Interactive Card Creator] 使用旧版 ReactDOM.render")
    dialogRoot = {
      render: (element: any) => ReactDOM.render(element, container)
    }
  }
}
```

**关键点**：
- ✅ 使用 `window.React` 而不是 `(window as any).React`
- ✅ 添加详细的调试日志
- ✅ 兼容新旧版本的 ReactDOM API
- ✅ 提供更友好的错误提示

## 📚 Orca 插件中的 React 使用规范

### 规则 1: 使用 window.React

在 Orca 插件中，React 是全局对象，通过 `window.React` 访问：

```typescript
// ✅ 正确
const { useState, useEffect, useMemo } = window.React

// ❌ 错误
import React, { useState, useEffect } from "react"
```

### 规则 2: 类型导入仍然使用 import

类型导入不会影响运行时，可以正常使用：

```typescript
// ✅ 正确
import type { KnowledgePoint } from "../types"

// ✅ 也可以
import { type KnowledgePoint } from "../types"
```

### 规则 3: 使用 React.createElement

创建元素时使用 `React.createElement`：

```typescript
const React = window.React

const element = React.createElement(MyComponent, {
  prop1: value1,
  prop2: value2
})
```

### 规则 4: 兼容新旧 ReactDOM API

```typescript
const ReactDOM = window.ReactDOM as any

if (ReactDOM.createRoot) {
  // React 18+
  const root = ReactDOM.createRoot(container)
  root.render(element)
} else {
  // React 17-
  ReactDOM.render(element, container)
}
```

## 🎯 参考示例

查看项目中其他组件的正确用法：

### 示例 1: `src/components/SrsFlashcardHome.tsx`

```typescript
const { useState, useEffect, useCallback, useMemo, useRef } = window.React

export function SrsFlashcardHome(props: SrsFlashcardHomeProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard")
  // ...
}
```

### 示例 2: `src/components/StatisticsView.tsx`

```typescript
const { useState, useEffect, useCallback, useMemo } = window.React

export function StatisticsView(props: StatisticsViewProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1month")
  // ...
}
```

### 示例 3: `src/srs/registry/contextMenuRegistry.tsx`

```typescript
import React from "react"

// 在函数内部使用
const [cardCount, setCardCount] = React.useState<number | null>(null)
React.useEffect(() => {
  // ...
}, [])
```

## ✅ 验证步骤

1. **构建成功**
   ```bash
   npm run build
   # ✓ 99 modules transformed
   # ✓ built in 537ms
   ```

2. **在 Orca 中测试**
   - 加载插件
   - 执行 `/AI 智能制卡（交互式）`
   - 弹窗应该正常显示

3. **检查控制台**
   - 不应该有 "React or ReactDOM not found" 错误
   - 弹窗应该正常渲染

## 🔧 故障排除

如果仍然遇到问题：

### 问题 1: 弹窗不显示

**检查**：
```javascript
// 在浏览器控制台执行
console.log(window.React)
console.log(window.ReactDOM)
```

**预期输出**：
```
Object { ... } // React 对象
Object { ... } // ReactDOM 对象
```

### 问题 2: 组件渲染错误

**检查**：
- 确认所有组件都使用 `window.React`
- 确认没有使用 ES6 import React
- 查看浏览器控制台的详细错误信息

### 问题 3: 类型错误

**解决**：
```typescript
// 使用 as any 绕过类型检查
const ReactDOM = window.ReactDOM as any
```

## 📝 总结

**修复内容**：
- ✅ 修改 `AICardGenerationDialog.tsx` 使用 `window.React`
- ✅ 修改 `aiInteractiveCardCreator.ts` 的 React 访问方式
- ✅ 添加详细的调试日志
- ✅ 兼容新旧版本的 ReactDOM API
- ✅ 提供更友好的错误提示

**构建状态**：
- ✅ TypeScript 编译通过
- ✅ Vite 构建成功
- ✅ 无错误和警告

**下一步**：
1. 在 Orca 中测试弹窗功能
2. 验证知识点选择和卡片生成
3. 确认用户体验流畅

---

## 🎓 经验教训

1. **环境差异**：不同的运行环境有不同的模块加载方式
2. **全局对象**：Orca 使用全局 React 对象而不是模块导入
3. **类型 vs 运行时**：类型导入不影响运行时，可以正常使用
4. **参考现有代码**：遇到问题时先查看项目中其他组件的实现方式
5. **详细日志**：添加详细的调试日志有助于快速定位问题
