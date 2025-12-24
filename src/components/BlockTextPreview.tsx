/**
 * 块文本预览组件
 * 直接显示块的纯文本内容，避免渲染 Block 组件导致的状态冲突
 */

import type { DbId } from "../orca.d.ts"

const { useSnapshot } = window.Valtio

type BlockTextPreviewProps = {
  blockId: DbId
}

export default function BlockTextPreview({ blockId }: BlockTextPreviewProps) {
  // 使用 useSnapshot 安全地读取块数据
  const blocks = useSnapshot(orca.state.blocks)
  const block = blocks[blockId]

  if (!block) {
    return (
      <span style={{ color: "var(--orca-color-text-3)", fontSize: "13px" }}>
        卡片 #{String(blockId).slice(-6)}
      </span>
    )
  }

  const text = block.text || ""
  
  // 移除 hashtags
  const cleanText = text.replace(/#[\w\u4e00-\u9fa5/-]+/g, "").trim()
  
  if (!cleanText) {
    return (
      <span style={{ color: "var(--orca-color-text-3)", fontSize: "13px" }}>
        （空白卡片）
      </span>
    )
  }

  return (
    <span style={{ 
      fontSize: "14px", 
      color: "var(--orca-color-text-1)",
      lineHeight: "1.5"
    }}>
      {cleanText}
    </span>
  )
}
