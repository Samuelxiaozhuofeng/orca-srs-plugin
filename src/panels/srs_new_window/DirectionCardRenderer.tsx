/**
 * Direction 卡片渲染器（用于 SrsNewWindowPanel）
 *
 * 功能：
 * - 根据 directionType 显示问题和答案
 * - forward：左边是问题，❓ 隐藏右边答案
 * - backward：❓ 隐藏左边答案，右边是问题
 * - 点击显示答案后，完整显示 "左边 → 右边"
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
 * 渲染逻辑：
 * - forward: 显示左边文本 + ❓ + 隐藏区域（或答案）
 * - backward: 隐藏区域（或答案）+ ❓ + 显示右边文本
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

  // 解析方向卡内容
  const dirInfo = useMemo(() => {
    return extractDirectionInfo(block?.content, pluginName)
  }, [block?.content, pluginName])

  // 计算预览间隔
  const intervals = useMemo(() => {
    return previewIntervals(card.srs)
  }, [card.srs])

  // 根据方向类型确定问题和答案
  const { question, answer, directionSymbol } = useMemo(() => {
    if (!dirInfo) {
      return { question: card.front, answer: card.back, directionSymbol: "→" }
    }

    const isForward = card.directionType === "forward"
    return {
      question: isForward ? dirInfo.leftText : dirInfo.rightText,
      answer: isForward ? dirInfo.rightText : dirInfo.leftText,
      directionSymbol: isForward ? "→" : "←"
    }
  }, [dirInfo, card])

  // 处理评分
  const handleGrade = (grade: Grade) => {
    if (isGrading) return
    onGrade(grade)
  }

  // 渲染内容区域
  const renderContent = () => {
    if (!showAnswer) {
      // 未显示答案：显示问题 + ❓ + 隐藏区域
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          fontSize: "20px",
          lineHeight: "1.6",
          flexWrap: "wrap"
        }}>
          {card.directionType === "forward" ? (
            <>
              <span style={{ fontWeight: 500 }}>{question}</span>
              <span style={{
                color: "var(--orca-color-primary-5)",
                fontSize: "24px",
                fontWeight: "bold"
              }}>❓</span>
              <span style={{
                color: "var(--orca-color-text-2)",
                fontWeight: 500,
                padding: "4px 12px",
                backgroundColor: "var(--orca-color-bg-3)",
                borderRadius: "6px",
                border: "1px dashed var(--orca-color-border-1)"
              }}>
                [...]
              </span>
            </>
          ) : (
            <>
              <span style={{
                color: "var(--orca-color-text-2)",
                fontWeight: 500,
                padding: "4px 12px",
                backgroundColor: "var(--orca-color-bg-3)",
                borderRadius: "6px",
                border: "1px dashed var(--orca-color-border-1)"
              }}>
                [...]
              </span>
              <span style={{
                color: "var(--orca-color-primary-5)",
                fontSize: "24px",
                fontWeight: "bold"
              }}>❓</span>
              <span style={{ fontWeight: 500 }}>{question}</span>
            </>
          )}
        </div>
      )
    }

    // 显示答案：完整显示 "左边 → 右边"
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        fontSize: "20px",
        lineHeight: "1.6",
        flexWrap: "wrap"
      }}>
        <span style={{ fontWeight: 500 }}>
          {card.directionType === "forward" ? question : answer}
        </span>
        <span style={{
          color: "var(--orca-color-primary-5)",
          fontSize: "24px",
          fontWeight: "bold"
        }}>{directionSymbol}</span>
        <span style={{
          backgroundColor: "var(--orca-color-primary-1)",
          color: "var(--orca-color-primary-5)",
          fontWeight: 600,
          padding: "4px 12px",
          borderRadius: "6px",
          borderBottom: "2px solid var(--orca-color-primary-5)"
        }}>
          {card.directionType === "forward" ? answer : question}
        </span>
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
      {/* 卡片类型标签 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "16px"
      }}>
        <span style={{
          fontSize: "12px",
          color: "var(--orca-color-text-2)",
          backgroundColor: "var(--orca-color-bg-2)",
          padding: "4px 8px",
          borderRadius: "4px"
        }}>
          📍 方向卡 ({card.directionType === "forward" ? "正向" : "反向"})
        </span>

        {/* 跳转/操作按钮 */}
        <div style={{ display: "flex", gap: "8px" }}>
          {onJumpToCard && (
            <Button
              variant="soft"
              onClick={onJumpToCard}
              title="跳转到卡片"
            >
              🔗
            </Button>
          )}
          {onBury && (
            <Button
              variant="soft"
              onClick={onBury}
              title="埋藏卡片 (B)"
            >
              ⏸️
            </Button>
          )}
          {onSuspend && (
            <Button
              variant="soft"
              onClick={onSuspend}
              title="暂停卡片 (S)"
            >
              ⏹️
            </Button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "32px",
        marginBottom: "24px"
      }}>
        {renderContent()}
      </div>

      {/* 操作区域 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px"
      }}>
        {!showAnswer ? (
          <Button
            variant="solid"
            onClick={onShowAnswer}
            style={{
              padding: "16px 48px",
              fontSize: "16px",
              fontWeight: 600
            }}
          >
            显示答案
          </Button>
        ) : (
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "12px",
            flexWrap: "wrap"
          }}>
            <Button
              variant="solid"
              onClick={() => handleGrade("again")}
              style={{
                padding: "12px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                backgroundColor: "var(--orca-color-danger-5)",
                opacity: 0.9
              }}
            >
              <span style={{ fontWeight: 600 }}>{formatInterval(intervals.again)}</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>忘记</span>
            </Button>

            <Button
              variant="solid"
              onClick={() => handleGrade("hard")}
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
                backgroundColor: "var(--orca-color-primary-5)",
                opacity: 0.9
              }}
            >
              <span style={{ fontWeight: 600 }}>{formatInterval(intervals.easy)}</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>简单</span>
            </Button>
          </div>
        )}

        {/* 提示文字 */}
        <div style={{
          marginTop: "8px",
          textAlign: "center",
          fontSize: "12px",
          color: "var(--orca-color-text-2)",
          opacity: 0.7
        }}>
          {!showAnswer ? "点击\"显示答案\"查看内容" : "根据记忆程度选择评分"}
        </div>
      </div>
    </div>
  )
}
