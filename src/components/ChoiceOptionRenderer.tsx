/**
 * 选择题选项渲染组件
 *
 * 功能：
 * - 渲染选项内容（支持复杂嵌套内容）
 * - 处理选中状态和样式
 * - 支持单选（radio）和多选（checkbox）模式
 * - 答案揭晓前隐藏正确标记
 * 
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6
 */

const { useMemo, useRef, useEffect } = window.React
const { Block } = orca.components

import type { DbId, ContentFragment } from "../orca.d.ts"
import type { ChoiceMode } from "../srs/types"

interface ChoiceOptionRendererProps {
  blockId: DbId                    // 选项块 ID
  index: number                    // 选项索引（用于显示序号）
  isSelected: boolean              // 是否被选中
  isCorrect: boolean               // 是否为正确选项
  isAnswerRevealed: boolean        // 答案是否已揭晓
  mode: ChoiceMode                 // 单选/多选模式
  onClick: () => void              // 点击回调
  disabled?: boolean               // 是否禁用（答案揭晓后）
}

/**
 * 获取选项字母标签（A, B, C, ...）
 */
function getOptionLabel(index: number): string {
  return String.fromCharCode(65 + index) // A=65
}

/**
 * 选项区注入样式文本（纯函数，供单测锁定隐藏规则）。
 *
 * 未揭晓：隐藏整个 `.orca-tags` 容器（与标签别名/chip 属性拼法无关）。
 * 揭晓：不注入隐藏规则。
 * 禁止枚举单个正确标签名（大小写/别名会漏）。
 */
export function buildChoiceOptionInjectedCss(args: {
  uniqueId: string
  isAnswerRevealed: boolean
}): string {
  const { uniqueId, isAnswerRevealed } = args
  const hideTagsRule = !isAnswerRevealed
    ? `
      [data-choice-option="${uniqueId}"] .orca-tags {
        display: none !important;
      }
      `
    : ""

  return `
      [data-choice-option="${uniqueId}"] .orca-block-children,
      [data-choice-option="${uniqueId}"] .orca-repr-children {
        display: block !important;
      }
      [data-choice-option="${uniqueId}"] .orca-block-handle,
      [data-choice-option="${uniqueId}"] .orca-block-folding-handle,
      [data-choice-option="${uniqueId}"] .orca-block-drag-handle,
      [data-choice-option="${uniqueId}"] .orca-repr-main-none-editable,
      [data-choice-option="${uniqueId}"] .orca-block-editor-sidetools {
        display: none !important;
      }
      [data-choice-option="${uniqueId}"] .orca-repr-main-content {
        font-size: 14px;
        line-height: 1.6;
      }
      [data-choice-option="${uniqueId}"] .orca-block-editor {
        background: transparent !important;
      }
      [data-choice-option="${uniqueId}"] .orca-block {
        margin: 0 !important;
        padding: 0 !important;
      }
      ${hideTagsRule}
      /* 图片尺寸限制 */
      [data-choice-option="${uniqueId}"] img {
        max-width: 100%;
        max-height: 200px;
        object-fit: contain;
      }
      /* 代码块横向滚动 */
      [data-choice-option="${uniqueId}"] pre,
      [data-choice-option="${uniqueId}"] code {
        overflow-x: auto;
        max-width: 100%;
      }
    `
}

export default function ChoiceOptionRenderer({
  blockId,
  index,
  isSelected,
  isCorrect,
  isAnswerRevealed,
  mode,
  onClick,
  disabled = false
}: ChoiceOptionRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  
  // 为每个选项生成唯一的虚拟 panelId
  const virtualPanelId = useMemo(() => `choice-option-${blockId}`, [blockId])

  // 注入选项区样式。未揭晓时隐藏整个 .orca-tags 容器（真实 DOM 中标签在独立兄弟容器，
  // chip 属性为 data-name；不得再按错误属性名枚举正确标签）。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const uniqueId = `choice-opt-${blockId}`
    container.setAttribute("data-choice-option", uniqueId)

    const styleId = `style-choice-opt-${blockId}`
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement("style")
      style.id = styleId
      document.head.appendChild(style)
    }

    style.textContent = buildChoiceOptionInjectedCss({
      uniqueId,
      isAnswerRevealed
    })

    return () => {
      const existingStyle = document.getElementById(styleId)
      if (existingStyle) {
        existingStyle.remove()
      }
    }
  }, [blockId, isAnswerRevealed])

  // 计算选项样式
  const optionStyle = useMemo(() => {
    const baseStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
      padding: "12px 16px",
      borderRadius: "8px",
      cursor: disabled ? "default" : "pointer",
      transition: "all 0.2s ease",
      border: "2px solid transparent",
      backgroundColor: "var(--orca-color-bg-2)",
      minHeight: "48px",
    }

    // 答案揭晓后的样式
    if (isAnswerRevealed) {
      if (isCorrect && isSelected) {
        // 正确且选中：绿色
        return {
          ...baseStyle,
          backgroundColor: "rgba(34, 197, 94, 0.15)",
          borderColor: "rgba(34, 197, 94, 0.5)",
        }
      } else if (isCorrect && !isSelected) {
        // 正确但未选中：浅绿色边框
        return {
          ...baseStyle,
          backgroundColor: "rgba(34, 197, 94, 0.08)",
          borderColor: "rgba(34, 197, 94, 0.3)",
        }
      } else if (!isCorrect && isSelected) {
        // 错误且选中：红色
        return {
          ...baseStyle,
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          borderColor: "rgba(239, 68, 68, 0.5)",
        }
      }
      // 错误且未选中：默认样式
      return baseStyle
    }

    // 答案未揭晓时的样式
    if (isSelected) {
      return {
        ...baseStyle,
        backgroundColor: "var(--orca-color-primary-1)",
        borderColor: "var(--orca-color-primary-5)",
      }
    }

    return baseStyle
  }, [isSelected, isCorrect, isAnswerRevealed, disabled])

  // 选择指示器样式（radio/checkbox）
  const indicatorStyle = useMemo(() => {
    const baseIndicator: React.CSSProperties = {
      width: "20px",
      height: "20px",
      borderRadius: mode === "single" ? "50%" : "4px",
      border: "2px solid var(--orca-color-border-2)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      transition: "all 0.2s ease",
      marginTop: "2px",
    }

    if (isAnswerRevealed) {
      if (isCorrect) {
        return {
          ...baseIndicator,
          borderColor: "rgba(34, 197, 94, 0.8)",
          backgroundColor: isSelected ? "rgba(34, 197, 94, 0.8)" : "transparent",
        }
      } else if (isSelected) {
        return {
          ...baseIndicator,
          borderColor: "rgba(239, 68, 68, 0.8)",
          backgroundColor: "rgba(239, 68, 68, 0.8)",
        }
      }
    } else if (isSelected) {
      return {
        ...baseIndicator,
        borderColor: "var(--orca-color-primary-5)",
        backgroundColor: "var(--orca-color-primary-5)",
      }
    }

    return baseIndicator
  }, [mode, isSelected, isCorrect, isAnswerRevealed])

  // 选项标签样式
  const labelStyle: React.CSSProperties = {
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    backgroundColor: isSelected 
      ? "var(--orca-color-primary-5)" 
      : "var(--orca-color-bg-3)",
    color: isSelected 
      ? "white" 
      : "var(--orca-color-text-2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "12px",
    flexShrink: 0,
    transition: "all 0.2s ease",
  }

  // 答案揭晓后更新标签样式
  const finalLabelStyle = useMemo(() => {
    if (!isAnswerRevealed) return labelStyle
    
    if (isCorrect) {
      return {
        ...labelStyle,
        backgroundColor: "rgba(34, 197, 94, 0.8)",
        color: "white",
      }
    } else if (isSelected) {
      return {
        ...labelStyle,
        backgroundColor: "rgba(239, 68, 68, 0.8)",
        color: "white",
      }
    }
    return labelStyle
  }, [isAnswerRevealed, isCorrect, isSelected])

  return (
    <div
      className="srs-choice-option"
      style={optionStyle}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={(e) => {
        if (!disabled && !isAnswerRevealed) {
          e.currentTarget.style.backgroundColor = isSelected 
            ? "var(--orca-color-primary-2)" 
            : "var(--orca-color-bg-3)"
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !isAnswerRevealed) {
          e.currentTarget.style.backgroundColor = isSelected 
            ? "var(--orca-color-primary-1)" 
            : "var(--orca-color-bg-2)"
        }
      }}
    >
      {/* 选项标签 (A, B, C, ...) */}
      <div style={finalLabelStyle}>
        {getOptionLabel(index)}
      </div>

      {/* 选择指示器 */}
      <div style={indicatorStyle}>
        {isSelected && (
          <i 
            className={mode === "single" ? "ti ti-circle-filled" : "ti ti-check"} 
            style={{ 
              fontSize: mode === "single" ? "8px" : "12px", 
              color: "white" 
            }} 
          />
        )}
        {isAnswerRevealed && isCorrect && !isSelected && (
          <i 
            className="ti ti-check" 
            style={{ fontSize: "12px", color: "rgba(34, 197, 94, 0.8)" }} 
          />
        )}
      </div>

      {/* 选项内容 */}
      <div 
        ref={containerRef}
        style={{ 
          flex: 1, 
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <Block
          panelId={virtualPanelId}
          blockId={blockId}
          blockLevel={0}
          indentLevel={0}
          renderingMode="normal"
          initiallyCollapsed={false}
        />
      </div>

      {/* 答案揭晓后的状态图标 */}
      {isAnswerRevealed && (
        <div style={{ flexShrink: 0, marginLeft: "8px" }}>
          {isCorrect && isSelected && (
            <i className="ti ti-circle-check" style={{ fontSize: "20px", color: "rgba(34, 197, 94, 0.9)" }} />
          )}
          {isCorrect && !isSelected && (
            <i className="ti ti-circle-check" style={{ fontSize: "20px", color: "rgba(34, 197, 94, 0.6)" }} />
          )}
          {!isCorrect && isSelected && (
            <i className="ti ti-circle-x" style={{ fontSize: "20px", color: "rgba(239, 68, 68, 0.9)" }} />
          )}
        </div>
      )}
    </div>
  )
}
