/**
 * 卡片块预览组件
 * 用于在列表中安全地渲染 Block 组件
 */

import type { DbId } from "../orca.d.ts"

const { useRef, useEffect, useMemo } = window.React
const { Block } = orca.components

type CardBlockPreviewProps = {
  blockId: DbId
  panelId: string
}

export default function CardBlockPreview({ blockId, panelId }: CardBlockPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  
  // 为每个预览生成唯一的虚拟 panelId，避免冲突
  const virtualPanelId = useMemo(() => `card-preview-${blockId}`, [blockId])

  // 设置样式隐藏不需要的元素
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const uniqueId = `preview-${blockId}`
    container.setAttribute('data-preview', uniqueId)
    
    const style = document.createElement('style')
    style.id = `style-${uniqueId}`
    style.textContent = `
      [data-preview="${uniqueId}"] .orca-block-children,
      [data-preview="${uniqueId}"] .orca-repr-children {
        display: none !important;
      }
      [data-preview="${uniqueId}"] .orca-block-handle,
      [data-preview="${uniqueId}"] .orca-block-folding-handle,
      [data-preview="${uniqueId}"] .orca-repr-main-none-editable {
        display: none !important;
      }
      [data-preview="${uniqueId}"] {
        pointer-events: none;
      }
      [data-preview="${uniqueId}"] .orca-repr-main-content {
        font-size: 14px;
        font-weight: 500;
      }
    `
    document.head.appendChild(style)

    return () => {
      const existingStyle = document.getElementById(`style-${uniqueId}`)
      if (existingStyle) {
        document.head.removeChild(existingStyle)
      }
    }
  }, [blockId])

  // 添加安全检查，确保 blockId 有效
  if (!blockId) {
    return <div style={{ color: "var(--orca-color-text-3)", fontSize: "12px" }}>无效的卡片</div>
  }

  return (
    <div ref={containerRef}>
      <Block
        panelId={virtualPanelId}
        blockId={blockId}
        blockLevel={0}
        indentLevel={0}
      />
    </div>
  )
}
