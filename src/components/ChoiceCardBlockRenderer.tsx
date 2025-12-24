/**
 * 选择题卡片块渲染器
 *
 * 功能：
 * - 在 Orca 编辑器中以自定义样式渲染选择题卡片块
 * - 显示题目和选项
 * - 在编辑模式下显示选择统计指示器
 *
 * Requirements: 8.1, 8.2
 */

import type { Block, DbId } from "../orca.d.ts"
import SrsErrorBoundary from "./SrsErrorBoundary"
import ChoiceStatisticsIndicator from "./ChoiceStatisticsIndicator"
import { extractChoiceOptions, detectChoiceMode } from "../srs/choiceUtils"
import type { ChoiceOption, ChoiceMode } from "../srs/types"

const { useState, useMemo, useEffect, useCallback } = window.React
const { useSnapshot } = window.Valtio
const { BlockShell, BlockChildren, Block: BlockComponent } = orca.components

// 组件 Props 类型定义
type ChoiceCardBlockRendererProps = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
  front: string  // 题目（从 _repr 接收）
}

export default function ChoiceCardBlockRenderer({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  initiallyCollapsed,
  renderingMode,
  front,
}: ChoiceCardBlockRendererProps) {
  const snapshot = useSnapshot(orca.state)
  const targetBlockId = mirrorId ?? blockId

  // 获取块数据
  const block = useMemo(() => {
    return snapshot?.blocks?.[targetBlockId] as Block | undefined
  }, [snapshot?.blocks, targetBlockId])

  // 提取选项
  const options = useMemo(() => {
    if (!block) return []
    return extractChoiceOptions(block)
  }, [block])

  // 检测选择题模式
  const mode = useMemo(() => {
    return detectChoiceMode(options)
  }, [options])

  // 获取模式显示文本
  const modeText = useMemo(() => {
    switch (mode) {
      case "single": return "单选题"
      case "multiple": return "多选题"
      case "undefined": return "选择题（未设置正确答案）"
    }
  }, [mode])

  // 渲染子块
  const childrenJsx = useMemo(
    () => (
      <BlockChildren
        block={block as Block}
        panelId={panelId}
        blockLevel={blockLevel}
        indentLevel={indentLevel}
        renderingMode={renderingMode}
      />
    ),
    [block, panelId, blockLevel, indentLevel, renderingMode]
  )

  // 卡片内容 JSX
  const contentJsx = useMemo(() => (
    <div
      className="srs-choice-card-block-content"
      style={{
        backgroundColor: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "16px",
        marginTop: "4px",
        marginBottom: "4px",
        userSelect: "text",
        WebkitUserSelect: "text",
      }}
    >
      {/* 样式：隐藏不需要的元素 */}
      <style>{`
        .srs-choice-card-block-content .orca-block-folding-handle,
        .srs-choice-card-block-content .orca-block-handle {
          opacity: 0 !important;
          transition: opacity 0.15s ease;
        }
        .srs-choice-card-block-content .orca-block.orca-container:hover > .orca-repr > .orca-repr-main > .orca-repr-main-none-editable > .orca-block-handle,
        .srs-choice-card-block-content .orca-block.orca-container:hover > .orca-block-folding-handle {
          opacity: 1 !important;
        }
      `}</style>
      
      {/* 卡片图标 + 标题 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
          color: "var(--orca-color-text-2)",
          fontSize: "12px",
          fontWeight: "500",
        }}
      >
        <i className="ti ti-list-check" style={{ fontSize: "16px" }}></i>
        <span>SRS {modeText}</span>
        {mode !== "undefined" && (
          <span style={{ 
            marginLeft: "auto",
            padding: "2px 8px",
            backgroundColor: mode === "single" 
              ? "var(--orca-color-primary-1)" 
              : "var(--orca-color-warning-1)",
            color: mode === "single"
              ? "var(--orca-color-primary-6)"
              : "var(--orca-color-warning-6)",
            borderRadius: "4px",
            fontSize: "11px",
          }}>
            {options.filter((o: ChoiceOption) => o.isCorrect).length} 个正确答案
          </span>
        )}
      </div>

      {/* 题目区域 */}
      <div
        className="srs-choice-card-front"
        style={{
          marginBottom: "12px",
          padding: "12px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "6px",
          color: "var(--orca-color-text-1)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            color: "var(--orca-color-text-2)",
            marginBottom: "8px",
          }}
        >
          题目：
        </div>
        <div 
          style={{ 
            whiteSpace: "pre-wrap",
            userSelect: "text",
            WebkitUserSelect: "text",
            cursor: "text",
            fontSize: "16px",
            fontWeight: "500",
          }}
        >
          {front || "（无题目）"}
        </div>
      </div>

      {/* 选项预览 */}
      <div
        style={{
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            color: "var(--orca-color-text-2)",
            marginBottom: "8px",
          }}
        >
          选项 ({options.length} 个)：
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {options.map((option: ChoiceOption, index: number) => (
            <OptionPreviewItem 
              key={option.blockId} 
              option={option} 
              index={index} 
            />
          ))}
          {options.length === 0 && (
            <div style={{ 
              color: "var(--orca-color-text-3)", 
              fontSize: "13px",
              fontStyle: "italic",
            }}>
              暂无选项，请添加子块作为选项
            </div>
          )}
        </div>
      </div>

      {/* 选择统计指示器 */}
      {options.length > 0 && (
        <ChoiceStatisticsIndicator
          blockId={targetBlockId}
          options={options}
        />
      )}
    </div>
  ), [front, options, mode, modeText, targetBlockId])

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
      reprClassName="srs-repr-choice-card"
      contentClassName="srs-repr-choice-card-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={
        <SrsErrorBoundary componentName="选择题卡片" errorTitle="选择题卡片加载出错">
          {contentJsx}
        </SrsErrorBoundary>
      }
      childrenJsx={childrenJsx}
    />
  )
}

/**
 * 选项预览项组件
 */
interface OptionPreviewItemProps {
  option: ChoiceOption
  index: number
}

function OptionPreviewItem({ option, index }: OptionPreviewItemProps) {
  const label = String.fromCharCode(65 + index) // A, B, C, ...
  
  // 截断过长的文本
  const displayText = option.text.length > 50 
    ? option.text.substring(0, 50) + "..." 
    : option.text || "(空)"

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 10px",
        backgroundColor: option.isCorrect 
          ? "rgba(34, 197, 94, 0.1)" 
          : "var(--orca-color-bg-2)",
        borderRadius: "6px",
        border: option.isCorrect 
          ? "1px solid rgba(34, 197, 94, 0.3)" 
          : "1px solid transparent",
      }}
    >
      {/* 选项标签 */}
      <div
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "4px",
          backgroundColor: option.isCorrect 
            ? "rgba(34, 197, 94, 0.2)" 
            : "var(--orca-color-bg-3)",
          color: option.isCorrect 
            ? "rgba(34, 197, 94, 0.9)" 
            : "var(--orca-color-text-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize: "11px",
          flexShrink: 0,
        }}
      >
        {label}
      </div>

      {/* 选项文本 */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: "13px",
          color: "var(--orca-color-text-1)",
        }}
        title={option.text}
      >
        {displayText}
      </div>

      {/* 正确标记 */}
      {option.isCorrect && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "rgba(34, 197, 94, 0.9)",
            fontSize: "11px",
          }}
        >
          <i className="ti ti-check" style={{ fontSize: "14px" }} />
          <span>正确</span>
        </div>
      )}

      {/* 锚定标记 */}
      {option.isAnchor && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--orca-color-text-3)",
            fontSize: "11px",
          }}
          title="锚定选项：乱序时固定在末尾"
        >
          <i className="ti ti-anchor" style={{ fontSize: "12px" }} />
        </div>
      )}
    </div>
  )
}
