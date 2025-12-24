/**
 * SRS 错误边界组件
 *
 * 用于捕获 React 组件树中的运行时错误，防止整个应用崩溃。
 * 当子组件发生错误时，显示友好的错误提示并提供恢复选项。
 */

const { Component } = window.React
const { Button } = orca.components

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** 可选的自定义错误提示文本 */
  errorTitle?: string
  /** 可选的组件名称，用于日志记录 */
  componentName?: string
  /** 可选的错误回调函数 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  /** 可选的自定义错误渲染函数 */
  renderError?: (error: Error | null, retry: () => void) => React.ReactNode
}

/**
 * SRS 错误边界组件
 *
 * 使用示例：
 * ```tsx
 * <SrsErrorBoundary componentName="卡片复习">
 *   <SrsCardDemo {...props} />
 * </SrsErrorBoundary>
 * ```
 */
class SrsErrorBoundary extends (Component as React.ComponentClass<ErrorBoundaryProps, ErrorBoundaryState>) {
  private _isMounted = false

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  componentDidMount(): void {
    this._isMounted = true
  }

  componentWillUnmount(): void {
    this._isMounted = false
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // 更新 state 使下一次渲染显示错误 UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { componentName, onError } = this.props
    const prefix = componentName ? `[SRS Error Boundary - ${componentName}]` : "[SRS Error Boundary]"

    // 记录错误信息到控制台
    console.error(prefix, "捕获到运行时错误:")
    console.error(prefix, "错误信息:", error.message)
    console.error(prefix, "错误堆栈:", error.stack)
    console.error(prefix, "组件堆栈:", errorInfo.componentStack)

    // 只在组件仍然挂载时更新状态
    if (this._isMounted) {
      this.setState({ errorInfo })
    }

    // 调用可选的错误回调
    if (onError) {
      try {
        onError(error, errorInfo)
      } catch (callbackError) {
        console.error(prefix, "错误回调执行失败:", callbackError)
      }
    }

    // 发送通知给用户
    try {
      orca.notify("error", `组件运行时错误：${error.message}`, {
        title: componentName ? `${componentName} 错误` : "SRS 错误"
      })
    } catch (notifyError) {
      // 静默处理通知失败
      console.warn(prefix, "发送错误通知失败:", notifyError)
    }
  }

  /**
   * 重置错误状态，尝试重新渲染子组件
   */
  handleRetry = (): void => {
    if (this._isMounted) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null
      })
    }
  }

  /**
   * 复制错误信息到剪贴板
   */
  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state
    const { componentName } = this.props

    const errorText = [
      `=== SRS 错误报告 ===`,
      `组件: ${componentName || "未知"}`,
      `时间: ${new Date().toISOString()}`,
      ``,
      `错误信息: ${error?.message || "未知错误"}`,
      ``,
      `错误堆栈:`,
      error?.stack || "无堆栈信息",
      ``,
      `组件堆栈:`,
      errorInfo?.componentStack || "无组件堆栈信息"
    ].join("\n")

    try {
      await navigator.clipboard.writeText(errorText)
      orca.notify("success", "错误信息已复制到剪贴板", { title: "复制成功" })
    } catch (clipboardError) {
      console.warn("[SRS Error Boundary] 复制到剪贴板失败:", clipboardError)
      orca.notify("warn", "复制失败，请查看控制台日志", { title: "复制失败" })
    }
  }

  render(): React.ReactNode {
    const { hasError, error } = this.state
    const { children, errorTitle, renderError } = this.props

    if (hasError) {
      // 如果提供了自定义错误渲染函数，使用它
      if (renderError) {
        return renderError(error, this.handleRetry)
      }

      // 默认错误 UI
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            minHeight: "120px",
            backgroundColor: "var(--orca-color-bg-1)",
            border: "1px solid var(--orca-color-danger-6)",
            borderRadius: "12px",
            gap: "16px"
          }}
        >
          {/* 错误图标 */}
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "var(--orca-color-danger-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px"
            }}
          >
            ⚠️
          </div>

          {/* 错误标题 */}
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--orca-color-text-1)"
            }}
          >
            {errorTitle || "组件加载出错"}
          </div>

          {/* 错误详情 */}
          <div
            style={{
              fontSize: "13px",
              color: "var(--orca-color-text-3)",
              textAlign: "center",
              maxWidth: "400px",
              wordBreak: "break-word"
            }}
          >
            {error?.message || "发生未知错误，请刷新重试"}
          </div>

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <Button variant="solid" onClick={this.handleRetry}>
              重试
            </Button>
            <Button variant="plain" onClick={this.handleCopyError}>
              复制错误信息
            </Button>
          </div>
        </div>
      )
    }

    return children
  }
}

export default SrsErrorBoundary
