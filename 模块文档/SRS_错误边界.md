# SRS 错误边界组件

## 概述

`SrsErrorBoundary` 是一个 React 错误边界组件，用于捕获子组件树中的运行时错误，防止错误导致整个应用崩溃。当子组件发生错误时，会显示友好的错误提示界面，并提供恢复选项。

## 文件位置

- **组件文件**: `src/components/SrsErrorBoundary.tsx`

## 组件特性

### 1. 错误捕获

- 使用 React 的 `getDerivedStateFromError` 和 `componentDidCatch` 生命周期方法
- 捕获子组件树中的所有运行时错误
- 防止错误冒泡导致整个应用崩溃

### 2. 错误日志

- 将错误信息、堆栈和组件堆栈记录到控制台
- 可选的错误回调函数 `onError`，用于自定义错误处理逻辑

### 3. 用户通知

- 发生错误时自动发送 Orca 通知
- 显示友好的错误提示界面

### 4. 恢复机制

- 提供"重试"按钮，允许用户重新渲染组件
- 提供"复制错误信息"按钮，方便用户报告问题

## Props 接口

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 可选的自定义错误提示文本 */
  errorTitle?: string;
  /** 可选的组件名称，用于日志记录 */
  componentName?: string;
  /** 可选的错误回调函数 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 可选的自定义错误渲染函数 */
  renderError?: (error: Error | null, retry: () => void) => React.ReactNode;
}
```

## 使用示例

### 基本用法

```tsx
import SrsErrorBoundary from "./SrsErrorBoundary";

function MyComponent() {
  return (
    <SrsErrorBoundary componentName="我的组件" errorTitle="组件加载出错">
      <RiskyComponent />
    </SrsErrorBoundary>
  );
}
```

### 自定义错误回调

```tsx
<SrsErrorBoundary
  componentName="复习卡片"
  onError={(error, errorInfo) => {
    // 发送错误报告到服务器
    reportError(error, errorInfo);
  }}
>
  <SrsCardDemo {...props} />
</SrsErrorBoundary>
```

### 自定义错误渲染

```tsx
<SrsErrorBoundary
  componentName="复习会话"
  renderError={(error, retry) => (
    <div className="custom-error">
      <p>出错了：{error?.message}</p>
      <button onClick={retry}>重新加载</button>
    </div>
  )}
>
  <SrsReviewSessionDemo {...props} />
</SrsErrorBoundary>
```

## 在项目中的应用

错误边界已应用于以下关键组件：

| 组件                       | 保护范围 | 错误标题           |
| -------------------------- | -------- | ------------------ |
| `SrsFlashcardHomeRenderer` | 闪卡主页 | "闪卡主页加载出错" |
| `SrsReviewSessionRenderer` | 复习会话 | "复习会话加载出错" |
| `SrsCardBlockRenderer`     | 卡片块   | "卡片加载出错"     |
| `SrsCardDemo` (basic)      | 复习卡片 | "卡片加载出错"     |
| `SrsCardDemo` (cloze)      | 填空卡片 | "填空卡片加载出错" |

## 错误 UI 说明

默认错误 UI 包含：

1. **错误图标** - 警告图标 ⚠️
2. **错误标题** - 可自定义的错误提示标题
3. **错误详情** - 显示具体的错误信息
4. **操作按钮**：
   - **重试** - 重置错误状态，尝试重新渲染
   - **复制错误信息** - 将完整错误报告复制到剪贴板

## 技术实现

### 类组件实现

由于 React 的错误边界必须使用类组件（无法通过 Hooks 实现），该组件使用类组件语法：

```typescript
class SrsErrorBoundary extends (Component as React.ComponentClass<...>) {
  // ...
}
```

### 状态管理

```typescript
interface ErrorBoundaryState {
  hasError: boolean; // 是否发生错误
  error: Error | null; // 错误对象
  errorInfo: React.ErrorInfo | null; // 组件堆栈信息
}
```

## 更新历史

- **2025-12-10**: 初始创建，添加所有关键渲染器的错误边界保护
