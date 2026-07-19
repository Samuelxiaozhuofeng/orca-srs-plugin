# SRS 错误边界组件

> 文档同步日期：2026-07-19
> 变更说明：Headbar 对话框（AI / Web / EPUB / Book IR）增加局部 `SrsErrorBoundary`，避免单对话框拖垮 headbar 子树。

## 概述

`SrsErrorBoundary` 是 React **类组件**错误边界，用于捕获子树运行时错误，避免整页或整块插件 UI 崩溃。出错时展示可重试的友好界面，并可选复制错误报告。

**文件**：`src/components/SrsErrorBoundary.tsx`

## 技术实现

### 为何用类组件

React 错误边界依赖 `getDerivedStateFromError` / `componentDidCatch`，**不能**用 Hooks 函数组件实现。本组件：

```typescript
class SrsErrorBoundary extends (Component as React.ComponentClass<
  ErrorBoundaryProps,
  ErrorBoundaryState
>) { ... }
```

`Component` 来自 `window.React`（Orca 插件约定）。

### Props

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode
  /** 自定义错误标题（默认「组件加载出错」） */
  errorTitle?: string
  /** 日志与通知标题前缀用的组件名 */
  componentName?: string
  /** 捕获后可选回调（回调自身抛错会被 catch 并打日志） */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  /** 完全自定义错误 UI；retry 为重置 hasError 的函数 */
  renderError?: (error: Error | null, retry: () => void) => React.ReactNode
}
```

### 状态

```typescript
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}
```

### 行为细节

| 步骤 | 行为 |
| ---- | ---- |
| `getDerivedStateFromError` | 置 `hasError` + `error` |
| `componentDidCatch` | `console.error` 前缀 `[SRS Error Boundary - ${componentName}]`；若 `_isMounted` 则写入 `errorInfo`；调用 `onError`；`orca.notify("error", …)` |
| 通知失败 | `try/catch` 后 `console.warn`，不二次抛错 |
| 「重试」 | 仅 `_isMounted` 时清空 `hasError/error/errorInfo`，重新渲染 `children` |
| 「复制错误信息」 | 拼装组件名、时间、message、stack、componentStack → `navigator.clipboard`；成功/失败均 `orca.notify` |

默认错误 UI：警告图标、标题、`error.message`、主色「重试」与 plain「复制错误信息」；边框用 `var(--orca-color-danger-6)`。

## 用户交互

1. 子组件抛错 → 该边界内替换为错误卡片，**外层其它面板/块继续工作**。
2. 用户可「重试」恢复；或「复制错误信息」便于反馈。
3. 同时收到 Orca 错误通知（标题形如「复习会话 错误」）。

## 在项目中的挂载点

以代码中 `componentName` / `errorTitle` 为准：

| 位置 | componentName | errorTitle |
| ---- | ------------- | ---------- |
| `SrsReviewSessionRenderer` | 复习会话 | 复习会话加载出错 |
| `SrsFlashcardHomeRenderer` | Flash Home | Flash Home 加载出错 |
| `SrsFlashcardHomePanel` | 闪卡主页 | 闪卡主页加载出错 |
| `SrsCardBlockRenderer` | SRS卡片 | 卡片加载出错 |
| `AIDialogMount` | AI 生成闪卡 | （默认） |
| `WebImportDialogMount` | 网页导入 | （默认） |
| `EpubImportDialogMount` | EPUB 导入 | （默认） |
| `IRBookDialogMount` | Book IR 创建 | （默认） |
| `ChoiceCardBlockRenderer` | 选择题卡片 | 选择题卡片加载出错 |
| `SrsCardDemo` → Basic 路径 | 复习卡片 | 卡片加载出错 |
| `SrsCardDemo` → Cloze | 填空卡片 | 填空卡片加载出错 |
| `SrsCardDemo` → Direction | 方向卡片 | 方向卡片加载出错 |
| `SrsCardDemo` → List | 列表卡片 | 列表卡片加载出错 |
| `SrsCardDemo` → Choice | 选择题卡片 | 选择题卡片加载出错 |
| `IncrementalReadingSessionRenderer` | 渐进阅读工作区 | 渐进阅读工作区加载出错 |
| `IncrementalReadingManagerPanel` | 渐进阅读工作区 | 渐进阅读工作区加载出错 |

层次示意：会话块外层边界包住 `SrsReviewSessionDemo`；单卡再在各 `*ReviewRenderer` 外包一层，避免一张卡的渲染错误拖垮整场会话 UI。

## 使用示例

### 基本

```tsx
import SrsErrorBoundary from "./SrsErrorBoundary"

<SrsErrorBoundary componentName="复习会话" errorTitle="复习会话加载出错">
  <SrsReviewSessionDemo {...props} />
</SrsErrorBoundary>
```

### 自定义错误 UI

```tsx
<SrsErrorBoundary
  componentName="复习会话"
  renderError={(error, retry) => (
    <div>
      <p>{error?.message}</p>
      <button type="button" onClick={retry}>重新加载</button>
    </div>
  )}
>
  {children}
</SrsErrorBoundary>
```

## 配置

无独立插件设置项；行为完全由 Props 与 Orca `notify` / clipboard API 可用性决定。

## 扩展点

1. `onError`：接入遥测 / 远程上报（回调内勿抛未捕获异常）。
2. `renderError`：与某面板视觉统一的错误页。
3. 更细粒度边界：可在列表单项、图表等再包一层（当前未强制）。

## 相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/components/SrsErrorBoundary.tsx` | 组件实现 |
| `src/components/SrsReviewSessionRenderer.tsx` | 会话外层 |
| `src/components/SrsCardDemo.tsx` | 各卡种边界 |
| `src/components/SrsCardBlockRenderer.tsx` | 编辑器卡片块 |
| `src/components/ChoiceCardBlockRenderer.tsx` | 编辑器选择题块 |
| `src/components/SrsFlashcardHomeRenderer.tsx` | 闪卡主页块 |
| `src/panels/SrsFlashcardHomePanel.tsx` | 闪卡主页面板 |
| `src/components/IncrementalReadingSessionRenderer.tsx` | IR 会话块 |
| `src/components/IncrementalReadingManagerPanel.tsx` | IR 管理面板 |

## 更新历史

- **2025-12-10**：初始创建并接入主要渲染器
- **2026-07-13**：文档同步——补全挂载点与实现细节；明确无 `SrsCardBrowser` 依赖
