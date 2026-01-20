/**
 * 方向标记 Inline 渲染器
 *
 * 功能：
 * - 显示方向箭头图标
 * - 支持点击切换方向
 */

import type { ContentFragment, DbId } from "../orca.d.ts"
import {
  cycleDirection,
  updateBlockDirection,
} from "../srs/directionUtils"

const { useRef, useState, useCallback } = window.React

// 图标类名映射
const DIRECTION_ICONS: { [key: string]: string } = {
  forward: "ti ti-arrow-right",
  backward: "ti ti-arrow-left",
  bidirectional: "ti ti-arrows-exchange"
}

// 颜色映射
const DIRECTION_COLORS: { [key: string]: string } = {
  forward: "var(--orca-color-primary-5)",
  backward: "var(--orca-color-warning-5)",
  bidirectional: "var(--orca-color-success-5)"
}

// 方向中文标签
const DIRECTION_LABELS: { [key: string]: string } = {
  forward: "正向",
  backward: "反向",
  bidirectional: "双向"
}

interface DirectionInlineRendererProps {
  blockId: string
  data: ContentFragment
  index: number
}

/**
 * 方向标记 Inline 渲染器组件
 *
 * 接收的 data 格式：
 * {
 *   t: "插件名.direction",
 *   v: "→" | "←" | "↔",
 *   direction: "forward" | "backward" | "bidirectional"
 * }
 */
export default function DirectionInlineRenderer({
  blockId,
  data,
  index,
}: DirectionInlineRendererProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const initialDirection = ((data as any).direction || "forward") as string
  const [currentDir, setCurrentDir] = useState<string>(initialDirection)
  const [isUpdating, setIsUpdating] = useState(false)

  // 获取插件名称（从 data.t 中提取）
  const pluginName = (data.t || "").replace(".direction", "")

  // 获取当前方向对应的图标、颜色和标签
  const currentIcon = DIRECTION_ICONS[currentDir] || DIRECTION_ICONS.forward
  const currentColor = DIRECTION_COLORS[currentDir] || DIRECTION_COLORS.forward
  const currentLabel = DIRECTION_LABELS[currentDir] || DIRECTION_LABELS.forward

  const handleToggle = useCallback(
    async (e: MouseEvent) => {
      if (isUpdating) return

      setIsUpdating(true)
      try {
        const newDir = cycleDirection(currentDir as any)
        setCurrentDir(newDir)

        // 更新块内容
        await updateBlockDirection(Number(blockId) as DbId, newDir, pluginName)

        const label = DIRECTION_LABELS[newDir] || "未知"
        orca.notify("info", `已切换为${label}卡片`)
      } catch (error) {
        console.error("切换方向失败:", error)
        setCurrentDir(initialDirection) // 恢复原状态
      } finally {
        setIsUpdating(false)
      }
    },
    [blockId, currentDir, initialDirection, isUpdating, pluginName]
  )

  return (
    <span
      ref={ref}
      className="orca-inline srs-direction-inline"
      onClick={handleToggle as any}
      contentEditable={false}
      style={{
        cursor: isUpdating ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "24px",
        height: "24px",
        fontSize: "16px",
        margin: "0 4px",
        borderRadius: "4px",
        backgroundColor: "var(--orca-color-bg-2)",
        color: currentColor,
        transition: "all 0.2s ease",
        opacity: isUpdating ? 0.5 : 1,
        userSelect: "text"
      }}
      title={`方向卡 (${currentLabel}) - 点击切换`}
    >
      <i className={currentIcon} />
    </span>
  )
}
