/**
 * Basic 卡片渲染器（用于 SrsNewWindowPanel）
 *
 * 功能：
 * - 纯文本渲染 front/back 内容
 * - 支持显示答案、评分、埋藏、暂停、跳转操作
 */

import type { ReviewCard, Grade } from "../../srs/types"
import { formatInterval } from "../../srs/algorithm"

const { Button } = orca.components

interface BasicCardRendererProps {
  card: ReviewCard
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

          {/* 题目内容 - 无标签 */}
          <div style={{
            fontSize: "22px",
            color: "var(--orca-color-text-1)",
            lineHeight: 2,
            whiteSpace: "pre-wrap",
            fontWeight: 400,
            textAlign: "center",
            minHeight: "60px"
          }}>
            {card.front || "(无内容)"}
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

              {/* 答案内容 - 无标签 */}
              <div 
                className="srs-answer-reveal"
                style={{
                  fontSize: "22px",
                  color: "var(--orca-color-text-1)",
                  lineHeight: 2,
                  whiteSpace: "pre-wrap",
                  fontWeight: 400,
                  textAlign: "center",
                  animation: "srsAnswerFadeIn 0.3s ease-out"
                }}
              >
                {card.back || "(无内容)"}
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
