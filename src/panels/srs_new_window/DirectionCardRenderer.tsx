/**
 * Direction 卡片渲染器（用于 SrsNewWindowPanel）
 *
 * 功能：
 * - 水平一行显示「左边内容 → 右边内容」
 * - forward：左边显示，右边隐藏（❓），点击后显示答案
 * - backward：左边隐藏（❓），右边显示，点击后显示答案
 * - 类似 RemNote 的方向卡实现效果
 */

import type { ContentFragment } from "../../orca.d.ts"
import type { ReviewCard, Grade, SrsState } from "../../srs/types"
import { extractDirectionInfo } from "../../srs/directionUtils"
import { previewIntervals, formatInterval } from "../../srs/algorithm"

const { useMemo } = window.React
const { Button } = orca.components

interface DirectionCardRendererProps {
  card: ReviewCard
  pluginName: string
  showAnswer: boolean
  isGrading: boolean
  onShowAnswer: () => void
  onGrade: (grade: Grade) => void
  onBury?: () => void
  onSuspend?: () => void
  onJumpToCard?: () => void
}

/**
 * Direction 卡片渲染组件
 *
 * 水平一行布局：
 * - forward: 「左边内容 → ❓」→ 点击后 →「左边内容 → 右边内容」
 * - backward: 「❓ ← 右边内容」→ 点击后 →「左边内容 ← 右边内容」
 */
export default function DirectionCardRenderer({
  card,
  pluginName,
  showAnswer,
  isGrading,
  onShowAnswer,
  onGrade,
  onBury,
  onSuspend,
  onJumpToCard
}: DirectionCardRendererProps) {
  const React = window.React

  // 从 orca.state 获取 block 内容
  const block = orca.state.blocks[card.id]
  
  // 边界检查：如果 block 不存在（可能已被删除），显示错误状态
  const blockMissing = !block

  // 解析方向卡内容
  const dirInfo = useMemo(() => {
    if (blockMissing) return null
    return extractDirectionInfo(block.content, pluginName)
  }, [block?.content, pluginName, blockMissing])

  // 计算预览间隔
  const intervals = useMemo(() => {
    return previewIntervals(card.srs)
  }, [card.srs])

  // 根据方向类型确定显示内容
  const { leftContent, rightContent, arrowSymbol, directionLabel, directionColor } = useMemo(() => {
    const isForward = card.directionType === "forward"
    // 如果 block 不存在，回退到 card.front/card.back
    const leftText = dirInfo?.leftText || card.front || "（无内容）"
    const rightText = dirInfo?.rightText || card.back || "（无内容）"

    return {
      // forward: 左边显示，右边隐藏；backward: 左边隐藏，右边显示
      leftContent: isForward ? leftText : (showAnswer ? leftText : "❓"),
      rightContent: isForward ? (showAnswer ? rightText : "❓") : rightText,
      arrowSymbol: isForward ? "→" : "←",
      directionLabel: isForward ? "正向" : "反向",
      directionColor: isForward 
        ? "var(--orca-color-primary-6)" 
        : "var(--orca-color-success-6)"
    }
  }, [dirInfo, card.directionType, card.front, card.back, showAnswer])

  // 处理评分
  const handleGrade = (grade: Grade) => {
    if (isGrading) return
    onGrade(grade)
  }

  // 如果 block 不存在，显示警告信息但仍允许操作（使用 card.front/card.back 兜底）
  const renderBlockMissingWarning = () => {
    if (!blockMissing) return null
    return (
      <div style={{
        padding: "8px 12px",
        marginBottom: "12px",
        backgroundColor: "var(--orca-color-warning-1)",
        border: "1px solid var(--orca-color-warning-3)",
        borderRadius: "6px",
        fontSize: "12px",
        color: "var(--orca-color-warning-6)"
      }}>
        ⚠️ 原始块数据不可用，显示的是缓存内容
      </div>
    )
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
        paddingTop: "24px"
      }}>
        <div style={{
          backgroundColor: "var(--orca-color-bg-1)",
          borderRadius: "16px",
          padding: "28px",
          width: "100%",
          maxWidth: "720px",
          boxShadow: "0 6px 32px rgba(0,0,0,0.12)"
        }}>
          {/* 块数据缺失警告 */}
          {renderBlockMissingWarning()}
          
          {/* 顶部工具栏 */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px"
          }}>
            {/* 方向标签 */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              backgroundColor: `${directionColor}15`,
              borderRadius: "8px",
              fontSize: "13px",
              color: directionColor,
              fontWeight: 600
            }}>
              <i className={card.directionType === "forward" ? "ti ti-arrow-right" : "ti ti-arrow-left"} style={{ fontSize: "16px" }} />
              <span>{directionLabel}</span>
            </div>

            {/* 操作按钮 */}
            <div style={{
              display: "flex",
              gap: "8px"
            }}>
              {onBury && (
                <Button
                  variant="soft"
                  onClick={onBury}
                  style={{
                    padding: "6px 12px",
                    fontSize: "13px",
                    transition: "transform 0.1s ease"
                  }}
                  title="埋藏到明天 (B)"
                >
                  <i className="ti ti-clock-pause" style={{ marginRight: "4px" }} />
                  埋藏
                </Button>
              )}
              {onSuspend && (
                <Button
                  variant="soft"
                  onClick={onSuspend}
                  style={{
                    padding: "6px 12px",
                    fontSize: "13px",
                    transition: "transform 0.1s ease"
                  }}
                  title="暂停卡片 (S)"
                >
                  <i className="ti ti-player-pause" style={{ marginRight: "4px" }} />
                  暂停
                </Button>
              )}
              {onJumpToCard && (
                <Button
                  variant="soft"
                  onClick={onJumpToCard}
                  style={{
                    padding: "6px 12px",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "transform 0.1s ease"
                  }}
                >
                  <i className="ti ti-external-link" />
                  跳转
                </Button>
              )}
            </div>
          </div>

          {/* 方向卡内容区域 - 水平一行显示 */}
          <div 
            className={showAnswer ? "srs-answer-reveal" : ""}
            style={{
              marginBottom: "24px",
              padding: "36px 28px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "12px",
              animation: showAnswer ? "srsAnswerFadeIn 0.3s ease-out" : "none"
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              flexWrap: "wrap"
            }}>
              {/* 左边内容 */}
              <div style={{
                flex: "1 1 auto",
                minWidth: "120px",
                maxWidth: "300px",
                padding: "20px 24px",
                backgroundColor: leftContent === "❓" 
                  ? "var(--orca-color-warning-1)" 
                  : "var(--orca-color-bg-0)",
                borderRadius: "12px",
                border: leftContent === "❓"
                  ? "2px dashed var(--orca-color-warning-5)"
                  : "1px solid var(--orca-color-border-2)",
                textAlign: "center",
                transition: "all 0.2s ease"
              }}>
                <div style={{
                  fontSize: leftContent === "❓" ? "36px" : "22px",
                  lineHeight: 1.8,
                  color: leftContent === "❓" 
                    ? "var(--orca-color-warning-6)" 
                    : "var(--orca-color-text-1)",
                  wordBreak: "break-word",
                  fontWeight: leftContent === "❓" ? 400 : 500
                }}>
                  {leftContent}
                </div>
              </div>

              {/* 箭头 */}
              <div style={{
                fontSize: "32px",
                color: directionColor,
                fontWeight: 600,
                flexShrink: 0
              }}>
                {arrowSymbol}
              </div>

              {/* 右边内容 */}
              <div style={{
                flex: "1 1 auto",
                minWidth: "120px",
                maxWidth: "300px",
                padding: "20px 24px",
                backgroundColor: rightContent === "❓" 
                  ? "var(--orca-color-warning-1)" 
                  : (showAnswer ? "var(--orca-color-primary-1)" : "var(--orca-color-bg-0)"),
                borderRadius: "12px",
                border: rightContent === "❓"
                  ? "2px dashed var(--orca-color-warning-5)"
                  : showAnswer 
                    ? "2px solid var(--orca-color-primary-4)"
                    : "1px solid var(--orca-color-border-2)",
                textAlign: "center",
                transition: "all 0.2s ease"
              }}>
                <div style={{
                  fontSize: rightContent === "❓" ? "36px" : "22px",
                  lineHeight: 1.8,
                  color: rightContent === "❓" 
                    ? "var(--orca-color-warning-6)" 
                    : "var(--orca-color-text-1)",
                  wordBreak: "break-word",
                  fontWeight: rightContent === "❓" ? 400 : 500
                }}>
                  {rightContent}
                </div>
              </div>
            </div>
          </div>

          {/* 底部按钮区域 */}
          {!showAnswer ? (
            <div style={{ textAlign: "center" }}>
              <Button
                variant="solid"
                onClick={onShowAnswer}
                style={{
                  padding: "12px 32px",
                  fontSize: "15px"
                }}
              >
                显示答案
              </Button>
            </div>
          ) : (
            <>
              {/* 评分按钮组 */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px"
              }}>
                <Button
                  variant="soft"
                  onClick={() => handleGrade("again")}
                  style={{
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{formatInterval(intervals.again)}</span>
                  <span style={{ fontSize: "12px", opacity: 0.8 }}>重来</span>
                </Button>

                <Button
                  variant="soft"
                  onClick={() => handleGrade("hard")}
                  style={{
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{formatInterval(intervals.hard)}</span>
                  <span style={{ fontSize: "12px", opacity: 0.8 }}>困难</span>
                </Button>

                <Button
                  variant="solid"
                  onClick={() => handleGrade("good")}
                  style={{
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    opacity: 0.9
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{formatInterval(intervals.good)}</span>
                  <span style={{ fontSize: "12px", opacity: 0.8 }}>良好</span>
                </Button>

                <Button
                  variant="solid"
                  onClick={() => handleGrade("easy")}
                  style={{
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    opacity: 0.9
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{formatInterval(intervals.easy)}</span>
                  <span style={{ fontSize: "12px", opacity: 0.8 }}>简单</span>
                </Button>
              </div>
            </>
          )}

          {/* 提示文字 */}
          <div style={{
            marginTop: "16px",
            textAlign: "center",
            fontSize: "12px",
            color: "var(--orca-color-text-2)",
            opacity: 0.7
          }}>
            {!showAnswer ? "点击\"显示答案\"查看隐藏内容" : "根据记忆程度选择评分"}
          </div>
        </div>
      </div>
    </div>
  )
}
