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
import {
  shouldInvokePanelWideViewToggle,
  shouldManageHostEditorChrome
} from "../srs/registry/panelTreeUtils"

const { useState, useEffect, useRef } = window.React
const { BlockShell, Button } = orca.components

/**
 * Host `.orca-block-editor` class applied only when the panel main block view is
 * the flashcard-home block. Hides bullet / handle / query tabs (引用/同标签/候选引用)
 * / query views so 今日学习 reads as a clean full-panel surface. Mirrors the IR
 * workspace's `srs-ir-host-panel-chrome-managed`; scoped to a distinct class so
 * embedded flashcard-home renderings (backlinks / ref previews) never lose chrome.
 */
export const FLASH_HOME_HOST_CHROME_CLASS = "srs-flash-home-host-chrome-managed"

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
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 防止 effect 重跑时重复 toggle Wide View。 */
  const wideViewAttemptedRef = useRef(false)

  // 加载插件名称
  useEffect(() => {
    void loadPluginName()
  }, [])

  /**
   * 当 flashcard-home 块是面板主视图时：隐藏宿主编辑器 chrome + 默认 Wide View。
   * fail-closed（shouldManageHostEditorChrome）——绝不触碰 Journal 内嵌 / 查询 / 引用预览。
   * 用 Renderer 传入的 panelId（非 activePanel）；Wide 仅在 panel.wide 非 true 时切一次。
   */
  useEffect(() => {
    const panel = orca.nav.findViewPanel(panelId, orca.state.panels)
    const manageHost = shouldManageHostEditorChrome(panel, panelId, blockId)
    if (!manageHost) return

    const blockEditor = rootRef.current?.closest<HTMLElement>(".orca-block-editor")
    if (blockEditor) {
      blockEditor.classList.add(FLASH_HOME_HOST_CHROME_CLASS)
    }

    const shouldToggle = shouldInvokePanelWideViewToggle(
      manageHost,
      panel?.wide,
      wideViewAttemptedRef.current
    )
    wideViewAttemptedRef.current = true
    if (shouldToggle) {
      void (async () => {
        try {
          await orca.commands.invokeCommand("core.panel.toggleWideView", panelId)
        } catch (error) {
          console.error("[今日学习] 启用 Wide View 失败:", error)
          orca.notify("error", "启用宽屏视图失败", { title: "今日学习" })
        }
      })()
    }

    return () => {
      if (blockEditor) {
        blockEditor.classList.remove(FLASH_HOME_HOST_CHROME_CLASS)
      }
    }
  }, [panelId, blockId])

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
        <div className="srs-flash-home-state srs-flash-home-state--loading">
          加载中...
        </div>
      )
    }

    if (errorMessage) {
      return (
        <div className="srs-flash-home-state srs-flash-home-state--error">
          <div className="srs-flash-home-state__error-text">
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
      contentJsx={(
        <div ref={rootRef} className="srs-flash-home-host">
          {renderContent()}
        </div>
      )}
      childrenJsx={null}
    />
  )
}
