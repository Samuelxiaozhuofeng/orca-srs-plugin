/**
 * Flash Home 块渲染器
 * 
 * 作为 Orca 块渲染器包装组件，负责：
 * - 接收 Orca 块渲染器 props
 * - 使用 BlockShell 包裹内容
 * - 使用 SrsErrorBoundary 捕获错误
 * - 加载数据并传递给 SrsFlashcardHome 主组件
 * 
 * 需求: 7.2, 7.3, 7.4
 */

import type { DbId } from "../orca.d.ts"
import SrsFlashcardHome from "./SrsFlashcardHome"
import SrsErrorBoundary from "./SrsErrorBoundary"

const { useState, useEffect } = window.React
const { BlockShell, Button } = orca.components

type RendererProps = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
}

export default function SrsFlashcardHomeRenderer(props: RendererProps) {
  const {
    panelId,
    blockId,
    rndId,
    blockLevel,
    indentLevel,
    mirrorId,
    initiallyCollapsed,
    renderingMode
  } = props

  // 1. 所有 Hooks 在顶层声明（避免 Error #185）
  const [pluginName, setPluginName] = useState<string>("orca-srs")
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 加载插件名称
  useEffect(() => {
    void loadPluginName()
  }, [])

  const loadPluginName = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const { getPluginName } = await import("../main")
      const name = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      setPluginName(name)
    } catch (error) {
      console.error("[SRS Flashcard Home Renderer] 加载插件名称失败:", error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    orca.nav.close(panelId)
  }

  const handleRetry = () => {
    void loadPluginName()
  }

  // 2. 条件渲染在 Hooks 之后
  const renderContent = () => {
    if (isLoading) {
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          minHeight: "200px",
          fontSize: "14px",
          color: "var(--orca-color-text-2)"
        }}>
          加载中...
        </div>
      )
    }

    if (errorMessage) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "24px",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center"
        }}>
          <div style={{ color: "var(--orca-color-danger-5)" }}>
            加载失败：{errorMessage}
          </div>
          <Button variant="solid" onClick={handleRetry}>
            重试
          </Button>
        </div>
      )
    }

    return (
      <SrsErrorBoundary 
        componentName="Flash Home" 
        errorTitle="Flash Home 加载出错"
      >
        <SrsFlashcardHome
          panelId={panelId}
          pluginName={pluginName}
          onClose={handleClose}
        />
      </SrsErrorBoundary>
    )
  }

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="srs-repr-flashcard-home"
      contentClassName="srs-repr-flashcard-home-content"
      contentJsx={renderContent()}
      childrenJsx={null}
    />
  )
}
