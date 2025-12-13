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
  const [isHovered, setIsHovered] = React.useState(false)

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
          {/* 块数据缺失警告 */}
          {renderBlockMissingWarning()}
          
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
            {onBury && (
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
            )}
            {onSuspend && (
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
            )}
            {onJumpToCard && (
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
            )}
          </div>

          {/* 方向卡内容 - 极简水平布局 */}
          <div 
            className={showAnswer ? "srs-answer-reveal" : ""}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              minHeight: "100px",
              animation: showAnswer ? "srsAnswerFadeIn 0.3s ease-out" : "none"
            }}
          >
            {/* 左边内容 */}
            <div style={{
              flex: "1 1 auto",
              maxWidth: "260px",
              fontSize: leftContent === "❓" ? "32px" : "20px",
              lineHeight: 1.8,
              color: leftContent === "❓" 
                ? "var(--orca-color-text-3)" 
                : "var(--orca-color-text-1)",
              textAlign: "center",
              fontWeight: 400
            }}>
              {leftContent}
            </div>

            {/* 箭头 - 轻量化 */}
            <div style={{
              fontSize: "24px",
              color: "var(--orca-color-text-3)",
              fontWeight: 300,
              flexShrink: 0,
              opacity: 0.6
            }}>
              {arrowSymbol}
            </div>

            {/* 右边内容 */}
            <div style={{
              flex: "1 1 auto",
              maxWidth: "260px",
              fontSize: rightContent === "❓" ? "32px" : "20px",
              lineHeight: 1.8,
              color: rightContent === "❓" 
                ? "var(--orca-color-text-3)" 
                : "var(--orca-color-text-1)",
              textAlign: "center",
              fontWeight: 400
            }}>
              {rightContent}
            </div>
          </div>

          {/* 底部按钮区域 */}
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
