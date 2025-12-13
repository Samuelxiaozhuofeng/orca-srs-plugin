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

/**
 * Cloze 卡片渲染组件
 */
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
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px"
          }}>
            {/* 卡片类型标识 */}
            <div style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "var(--orca-color-primary-5)",
              backgroundColor: "var(--orca-color-primary-1)",
              padding: "6px 12px",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}>
              <i className="ti ti-brackets" style={{ fontSize: "14px" }} />
              填空卡 c{card.clozeNumber}
            </div>
            
            {/* 操作按钮 */}
            <div style={{ display: "flex", gap: "8px" }}>
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
          </div>

          {/* 填空内容区域 */}
          <div 
            className={showAnswer ? "srs-answer-reveal" : ""}
            style={{
              marginBottom: "20px",
              padding: "24px 28px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "10px",
              minHeight: "120px",
              fontSize: "22px",
              lineHeight: "1.9",
              color: "var(--orca-color-text-1)",
              fontWeight: 500,
              animation: showAnswer ? "srsAnswerFadeIn 0.3s ease-out" : "none"
            }}
          >
            {showAnswer ? answerContent : questionContent}
          </div>

          {/* 显示答案按钮 / 评分按钮 */}
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
            {!showAnswer ? "点击\"显示答案\"查看填空内容" : "根据记忆程度选择评分"}
          </div>
        </div>
      </div>
    </div>
  )
}
