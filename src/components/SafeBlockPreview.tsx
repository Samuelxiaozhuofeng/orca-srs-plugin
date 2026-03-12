/**
 * 安全的 Block 预览组件
 * 使用 normal 模式渲染块，支持编辑
 */

import type { DbId } from "../orca.d.ts"

const { useRef, useEffect, useMemo } = window.React
const { Block } = orca.components

type SafeBlockPreviewProps = {
  blockId: DbId
  panelId: string
  cardType?: string
}

export default function SafeBlockPreview({ blockId, panelId, cardType }: SafeBlockPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  
  // 为每个预览生成唯一的虚拟 panelId，避免与真实 panel 冲突
  const virtualPanelId = useMemo(() => `block-preview-${blockId}`, [blockId])

  // 设置样式隐藏不需要的元素（但保留编辑能力）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const uniqueId = `preview-${blockId}`
    container.setAttribute('data-block-preview', uniqueId)
    
    const styleId = `style-preview-${blockId}`
    if (document.getElementById(styleId)) return
    
    const style = document.createElement('style')
    style.id = styleId
    
    // 对于 bg 卡片，不隐藏任何内容
    let styleContent = `
      [data-block-preview="${uniqueId}"] .orca-block-handle,
      [data-block-preview="${uniqueId}"] .orca-block-folding-handle,
      [data-block-preview="${uniqueId}"] .orca-block-drag-handle,
      [data-block-preview="${uniqueId}"] .orca-repr-main-none-editable,
      [data-block-preview="${uniqueId}"] .orca-block-editor-sidetools {
        display: none !important;
      }
      [data-block-preview="${uniqueId}"] .orca-repr-main-content {
        font-size: 14px;
        line-height: 1.5;
      }
      [data-block-preview="${uniqueId}"] .orca-block-editor {
        background: transparent !important;
      }
      [data-block-preview="${uniqueId}"] .orca-block {
        margin: 0 !important;
        padding: 0 !important;
      }
    `
    
    // 非 bg 卡片隐藏子块
    if (cardType !== "bg") {
      styleContent = `
        [data-block-preview="${uniqueId}"] .orca-block-children,
        [data-block-preview="${uniqueId}"] .orca-repr-children {
          display: none !important;
        }
        ${styleContent}
      `
    }
    
    style.textContent = styleContent
    document.head.appendChild(style)

    return () => {
      const existingStyle = document.getElementById(styleId)
      if (existingStyle) {
        document.head.removeChild(existingStyle)
      }
    }
  }, [blockId, cardType])

  // 添加安全检查
  if (!blockId) {
    return <div style={{ color: "var(--orca-color-text-3)", fontSize: "12px" }}>无效的卡片</div>
  }

  return (
    <div ref={containerRef} style={{ minHeight: "20px" }}>
      <Block
        panelId={virtualPanelId}
        blockId={blockId}
        blockLevel={0}
        indentLevel={0}
        renderingMode="normal"
      />
    </div>
  )
}
