/**
 * Cloze（填空）卡片渲染器（用于 SrsNewWindowPanel）
 *
 * 功能：
 * - 使用 renderFragments 渲染 ContentFragment 数组
 * - 支持隐藏/显示特定填空编号的答案
 * - 支持评分、埋藏、暂停、跳转操作
 */

import type { ContentFragment } from "../../orca.d.ts"
import type { ReviewCard, Grade } from "../../srs/types"
import { formatInterval } from "../../srs/algorithm"

const { Button } = orca.components

interface ClozeCardRendererProps {
  card: ReviewCard
  pluginName: string
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
 * 渲染 ContentFragment 数组为可视化内容
 *
 * @param fragments - 内容片段数组
 * @param showAnswers - 是否显示答案（true = 显示答案，false = 显示 [...]）
 * @param pluginName - 插件名称（用于识别 cloze fragment）
 * @param currentClozeNumber - 当前复习的填空编号（仅隐藏该编号的填空，其他填空显示答案）
 */
function renderFragments(
  fragments: ContentFragment[] | undefined,
  showAnswers: boolean,
  pluginName: string,
  currentClozeNumber?: number
): React.ReactNode[] {
  const React = window.React
  
  if (!fragments || fragments.length === 0) {
    return [<span key="empty">（空白内容）</span>]
  }

  return fragments.map((fragment, index) => {
    // 普通文本片段
    if (fragment.t === "t") {
      return <span key={index}>{fragment.v}</span>
    }

    // Cloze 片段（支持任何 xxx.cloze 格式）
    const isClozeFragment = 
      fragment.t === `${pluginName}.cloze` ||
      (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
    
    if (isClozeFragment) {
      const fragmentClozeNumber = (fragment as any).clozeNumber

      // 判断是否应该隐藏此填空
      // 如果 currentClozeNumber 存在，只隐藏该编号的填空；否则隐藏所有填空
      const shouldHide = currentClozeNumber
        ? fragmentClozeNumber === currentClozeNumber
        : true

      if (showAnswers || !shouldHide) {
        // 显示答案：高亮显示填空内容
        return (
          <span
            key={index}
            style={{
              backgroundColor: "var(--orca-color-primary-1)",
              color: "var(--orca-color-primary-5)",
              fontWeight: "600",
              padding: "2px 6px",
              borderRadius: "4px",
              borderBottom: "2px solid var(--orca-color-primary-5)"
            }}
          >
            {fragment.v}
          </span>
        )
      } else {
        // 隐藏答案：显示 [...]
        return (
          <span
            key={index}
            style={{
              color: "var(--orca-color-text-2)",
              fontWeight: "500",
              padding: "2px 6px",
              backgroundColor: "var(--orca-color-bg-3)",
              borderRadius: "4px",
              border: "1px dashed var(--orca-color-border-1)"
            }}
          >
            [...]
          </span>
        )
      }
    }

    // 其他简单片段类型：代码、链接引用等，显示其文本内容
    if (fragment.v) {
      return <span key={index}>{fragment.v}</span>
    }

    // 未知类型的 fragment，显示占位符
    return (
      <span key={index} style={{ color: "var(--orca-color-text-3)" }}>
        [...]
      </span>
    )
  })
}

export default function ClozeCardRenderer({
  card,
  pluginName,
  showAnswer,
  isGrading,
  intervals,
  onShowAnswer,
  onGrade,
  onBury,
  onSuspend,
  onJumpToCard
}: ClozeCardRendererProps) {
  const [isHovered, setIsHovered] = window.React.useState(false)
  
  const handleGrade = (grade: Grade) => {
    if (isGrading) return
    onGrade(grade)
  }

  // 渲染题目（隐藏当前填空编号的答案）
  const questionContent = renderFragments(
    card.content,
    false,
    pluginName,
    card.clozeNumber
  )

  // 渲染答案（显示所有填空并高亮当前填空）
  const answerContent = renderFragments(
    card.content,
    true,
    pluginName,
    card.clozeNumber
  )

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

          {/* 填空内容 - 无标签 */}
          <div 
            className={showAnswer ? "srs-answer-reveal" : ""}
            style={{
              fontSize: "22px",
              lineHeight: 2,
              color: "var(--orca-color-text-1)",
              fontWeight: 400,
              textAlign: "center",
              minHeight: "80px",
              animation: showAnswer ? "srsAnswerFadeIn 0.3s ease-out" : "none"
            }}
          >
            {showAnswer ? answerContent : questionContent}
          </div>

          {/* 显示答案按钮 / 评分按钮 */}
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
