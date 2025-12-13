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
          {/* 顶部工具栏 */}
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginBottom: "20px"
          }}>
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
          </div>

          {/* 题目区域（使用纯文本） */}
          <div style={{
            marginBottom: "20px",
            padding: "20px 24px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "10px"
          }}>
            <div style={{
              fontSize: "13px",
              fontWeight: "500",
              color: "var(--orca-color-text-3)",
              marginBottom: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              题目
            </div>
            <div style={{
              fontSize: "22px",
              color: "var(--orca-color-text-1)",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              fontWeight: 500
            }}>
              {card.front || "(无题目内容)"}
            </div>
          </div>

          {/* 显示答案按钮 / 答案区域 */}
          {!showAnswer ? (
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <Button
                variant="solid"
                onClick={onShowAnswer}
                style={{
                  padding: "12px 32px",
                  fontSize: "16px"
                }}
              >
                显示答案
              </Button>
            </div>
          ) : (
            <>
              {/* 答案区域（使用纯文本） */}
              <div 
                className="srs-answer-reveal"
                style={{
                  marginBottom: "20px",
                  padding: "20px 24px",
                  backgroundColor: "var(--orca-color-bg-2)",
                  borderRadius: "10px",
                  borderLeft: "4px solid var(--orca-color-primary-5)",
                  animation: "srsAnswerFadeIn 0.3s ease-out"
                }}
              >
                <div style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "var(--orca-color-text-3)",
                  marginBottom: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  答案
                </div>
                <div style={{
                  fontSize: "22px",
                  color: "var(--orca-color-text-1)",
                  lineHeight: 1.8,
                  whiteSpace: "pre-wrap",
                  fontWeight: 500
                }}>
                  {card.back || "(无答案内容)"}
                </div>
              </div>

              {/* 评分按钮 */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px"
              }}>
                <Button
                  variant="dangerous"
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
                  <span style={{ fontSize: "12px", opacity: 0.8 }}>忘记</span>
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
                    gap: "4px"
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
            {!showAnswer ? "点击\"显示答案\"查看答案内容" : "根据记忆程度选择评分"}
          </div>
        </div>
      </div>
    </div>
  )
}
