/**
 * Basic 卡片渲染器（用于 SrsNewWindowPanel）
 *
 * 功能：
 * - 纯文本渲染 front/back 内容
 * - 支持显示答案、评分、埋藏、暂停、跳转操作
 */

import type { ReviewCard, Grade } from "../../srs/types"
import { formatInterval } from "../../srs/algorithm"
import { getSiblingBlockTexts } from "../../srs/blockUtils"
import { getReviewSettings } from "../../srs/settings/reviewSettingsSchema"

const { useMemo } = window.React
const { Button, Block, BlockPreviewPopup } = orca.components

interface BasicCardRendererProps {
  card: ReviewCard
  panelId: string  // 用于 Block 组件渲染
  pluginName: string  // 插件名称，用于读取设置
  showAnswer: boolean
  isGrading: boolean
  intervals: { again: number; hard: number; good: number; easy: number }
  onShowAnswer: () => void
  onGrade: (grade: Grade) => void
  onBury: () => void
  onSuspend: () => void
  onJumpToCard: () => void
}

/**
 * Basic 卡片渲染组件
 *
 * 纯文本版，避免 Block 组件兼容性问题
 */
export default function BasicCardRenderer({
  card,
  panelId,
  pluginName,
  showAnswer,
  isGrading,
  intervals,
  onShowAnswer,
  onGrade,
  onBury,
  onSuspend,
  onJumpToCard
}: BasicCardRendererProps) {
  const [isHovered, setIsHovered] = window.React.useState(false)
  
  // Block 组件在 Custom Panel 中会触发 React Error #185（无限循环）
  // 已验证不可用，回退到纯文本 + BlockPreviewPopup 方案
  const useBlockRendering = false
  
  // 获取复习设置（显示同级块配置）
  const reviewSettings = useMemo(() => getReviewSettings(pluginName), [pluginName])
  
  // 获取同级块文本（根据设置决定显示单个还是多个）
  const answerTexts = useMemo(() => {
    if (!reviewSettings.showSiblingBlocks) {
      // 未启用同级块显示，返回单个答案
      return [card.back || "（无内容）"]
    }
    // 启用同级块显示，获取所有子块文本
    return getSiblingBlockTexts(card.id as number, reviewSettings.maxSiblingBlocks)
  }, [card.id, card.back, reviewSettings.showSiblingBlocks, reviewSettings.maxSiblingBlocks])

  // 排版策略：当答案块较多或内容较长/多行时，使用左对齐+分块承载，避免大段内容全部居中导致难以阅读
  const answerLayout = useMemo(() => {
    const normalizedTextsRaw = answerTexts.map((t: string) => (t ?? "").trim()).filter(Boolean)
    const normalizedTexts = normalizedTextsRaw.length > 0 ? normalizedTextsRaw : ["（无内容）"]
    const blockCount = normalizedTexts.length
    const hasMultiLine = normalizedTexts.some((t: string) => t.includes("\n"))
    const hasLongText = normalizedTexts.some((t: string) => t.length >= 80)
    const shouldLeftAlign = blockCount > 1 || hasMultiLine || hasLongText

    return {
      normalizedTexts,
      shouldLeftAlign,
      containerStyle: {
        fontSize: "22px",
        color: "var(--orca-color-text-1)",
        lineHeight: 2,
        whiteSpace: "pre-wrap",
        fontWeight: 400,
        textAlign: shouldLeftAlign ? "left" : "center",
        animation: "srsAnswerFadeIn 0.3s ease-out",
        display: "flex",
        flexDirection: "column",
        alignItems: shouldLeftAlign ? "stretch" : "center",
        gap: shouldLeftAlign ? "12px" : "16px",
        overflowWrap: "anywhere",
      } as const,
      itemStyle: shouldLeftAlign
        ? ({
            width: "100%",
            padding: "10px 12px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "10px",
            borderLeft: "3px solid var(--orca-color-primary-4)",
            boxSizing: "border-box",
          } as const)
        : ({ maxWidth: "100%" } as const),
    }
  }, [answerTexts])
  
  const handleGrade = (grade: Grade) => {
    if (isGrading) return
    onGrade(grade)
  }

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: "24px",
      overflow: "auto"
    }}>
      <div style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "32px"
      }}>
        {/* 极简卡片容器 */}
        <div 
          style={{
            backgroundColor: "var(--orca-color-bg-1)",
            borderRadius: "12px",
            padding: "32px",
            width: "100%",
            maxWidth: "640px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            position: "relative"
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 悬浮工具栏 */}
          <div style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            display: "flex",
            gap: "4px",
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.2s ease",
            pointerEvents: isHovered ? "auto" : "none"
          }}>
            {/* 编辑按钮 - 使用 BlockPreviewPopup 实现弹窗编辑 */}
            <BlockPreviewPopup blockId={card.id}>
              <Button
                variant="soft"
                style={{
                  padding: "6px",
                  fontSize: "14px",
                  minWidth: "32px",
                  borderRadius: "8px"
                }}
                title="编辑 (E)"
              >
                <i className="ti ti-edit" />
              </Button>
            </BlockPreviewPopup>
            <Button
              variant="soft"
              onClick={onBury}
              style={{
                padding: "6px",
                fontSize: "14px",
                minWidth: "32px",
                borderRadius: "8px"
              }}
              title="埋藏 (B)"
            >
              <i className="ti ti-clock-pause" />
            </Button>
            <Button
              variant="soft"
              onClick={onSuspend}
              style={{
                padding: "6px",
                fontSize: "14px",
                minWidth: "32px",
                borderRadius: "8px"
              }}
              title="暂停 (S)"
            >
              <i className="ti ti-player-pause" />
            </Button>
            <Button
              variant="soft"
              onClick={onJumpToCard}
              style={{
                padding: "6px",
                fontSize: "14px",
                minWidth: "32px",
                borderRadius: "8px"
              }}
              title="跳转"
            >
              <i className="ti ti-external-link" />
            </Button>
          </div>

          {/* 题目内容 - 使用 Block 组件实现内联编辑 */}
          <div 
            className="srs-block-content"
            style={{
              fontSize: "18px",
              color: "var(--orca-color-text-1)",
              lineHeight: 1.8,
              minHeight: "60px"
            }}
          >
            {useBlockRendering ? (
              <Block
                panelId={panelId}
                blockId={card.id}
                blockLevel={0}
                indentLevel={0}
                renderingMode="normal"
              />
            ) : (
              <div style={{ textAlign: "center", whiteSpace: "pre-wrap" }}>
                {card.front || "(无内容)"}
              </div>
            )}
          </div>

          {/* 显示答案按钮 / 答案区域 */}
          {!showAnswer ? (
            <div style={{ textAlign: "center", marginTop: "32px" }}>
              <Button
                variant="solid"
                onClick={onShowAnswer}
                style={{
                  padding: "14px 48px",
                  fontSize: "16px",
                  borderRadius: "24px",
                  fontWeight: 500
                }}
              >
                显示答案
              </Button>
            </div>
          ) : (
            <>
              {/* 分隔线 */}
              <div style={{
                height: "1px",
                backgroundColor: "var(--orca-color-border-2)",
                margin: "24px 0",
                opacity: 0.6
              }} />

              {/* 答案内容 - 支持显示多个同级块 */}
              <div 
                className="srs-answer-reveal"
                style={answerLayout.containerStyle}
              >
                {answerLayout.normalizedTexts.map((text: string, index: number) => (
                  <div key={index} style={answerLayout.itemStyle}>
                    {text}
                  </div>
                ))}
              </div>

              {/* 评分按钮 - 仅时间 */}
              <div style={{
                display: "flex",
                justifyContent: "center",
                gap: "8px",
                marginTop: "32px"
              }}>
                <Button
                  variant="soft"
                  onClick={() => handleGrade("again")}
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 500,
                    borderRadius: "20px",
                    color: "var(--orca-color-danger-6)",
                    backgroundColor: "var(--orca-color-danger-1)"
                  }}
                >
                  {formatInterval(intervals.again)}
                </Button>

                <Button
                  variant="soft"
                  onClick={() => handleGrade("hard")}
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 500,
                    borderRadius: "20px",
                    color: "var(--orca-color-warning-6)",
                    backgroundColor: "var(--orca-color-warning-1)"
                  }}
                >
                  {formatInterval(intervals.hard)}
                </Button>

                <Button
                  variant="solid"
                  onClick={() => handleGrade("good")}
                  style={{
                    padding: "10px 20px",
                    fontSize: "15px",
                    fontWeight: 600,
                    borderRadius: "20px"
                  }}
                >
                  {formatInterval(intervals.good)}
                </Button>

                <Button
                  variant="soft"
                  onClick={() => handleGrade("easy")}
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 500,
                    borderRadius: "20px",
                    color: "var(--orca-color-primary-6)",
                    backgroundColor: "var(--orca-color-primary-1)"
                  }}
                >
                  {formatInterval(intervals.easy)}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
