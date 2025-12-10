/**
 * Cloze 填空卡片复习渲染器
 *
 * 用于在复习界面显示填空卡：
 * - 题目状态：将 {c1:: 答案} 显示为 [...]
 * - 答案状态：显示完整内容并高亮填空部分
 */

// 从全局 window 对象获取 React 与 Valtio（Orca 插件约定）
const { useState, useMemo } = window.React
const { useSnapshot } = window.Valtio
const { Button, ModalOverlay } = orca.components

import type { DbId, ContentFragment } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"

type ClozeCardReviewRendererProps = {
  blockId: DbId
  onGrade: (grade: Grade) => Promise<void> | void
  onClose?: () => void
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  onJumpToCard?: (blockId: DbId) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
}

/**
 * 渲染 ContentFragment 数组为可视化内容
 *
 * @param fragments - 内容片段数组
 * @param showAnswers - 是否显示答案（true = 显示答案，false = 显示 [...]）
 * @param pluginName - 插件名称（用于识别 cloze fragment）
 */
function renderFragments(
  fragments: ContentFragment[] | undefined,
  showAnswers: boolean,
  pluginName: string
): React.ReactNode[] {
  if (!fragments || fragments.length === 0) {
    return [<span key="empty">（空白内容）</span>]
  }

  return fragments.map((fragment, index) => {
    // 普通文本片段
    if (fragment.t === "t") {
      return <span key={index}>{fragment.v}</span>
    }

    // Cloze 片段
    if (fragment.t === `${pluginName}.cloze`) {
      if (showAnswers) {
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
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "4px",
              border: "1px dashed var(--orca-color-border-1)"
            }}
          >
            [...]
          </span>
        )
      }
    }

    // 其他类型的 fragment（暂时显示原始内容）
    return (
      <span key={index} style={{ color: "var(--orca-color-text-2)" }}>
        {fragment.v}
      </span>
    )
  })
}

export default function ClozeCardReviewRenderer({
  blockId,
  onGrade,
  onClose,
  srsInfo,
  isGrading = false,
  onJumpToCard,
  inSidePanel = false,
  panelId,
  pluginName
}: ClozeCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const snapshot = useSnapshot(orca.state)
  const blocks = snapshot?.blocks ?? {}
  const block = blocks[blockId]

  const handleGrade = async (grade: Grade) => {
    if (isGrading) return
    await onGrade(grade)
    setShowAnswer(false)
  }

  // 从 block.content 中提取内容片段
  const contentFragments = useMemo(() => {
    return block?.content ?? []
  }, [block?.content])

  // 渲染题目（隐藏答案）
  const questionContent = useMemo(() => {
    return renderFragments(contentFragments, false, pluginName)
  }, [contentFragments, pluginName])

  // 渲染答案（显示答案）
  const answerContent = useMemo(() => {
    return renderFragments(contentFragments, true, pluginName)
  }, [contentFragments, pluginName])

  const cardContent = (
    <div className="srs-cloze-card-container" style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "16px",
      width: inSidePanel ? "100%" : "90%",
      minWidth: inSidePanel ? "0" : "600px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
    }}>

      {/* 卡片类型标识 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px"
      }}>
        <div style={{
          fontSize: "12px",
          fontWeight: "500",
          color: "var(--orca-color-primary-5)",
          backgroundColor: "var(--orca-color-primary-1)",
          padding: "4px 10px",
          borderRadius: "6px",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px"
        }}>
          <i className="ti ti-braces" />
          填空卡
        </div>

        {blockId && onJumpToCard && (
          <Button
            variant="soft"
            onClick={() => onJumpToCard(blockId)}
            style={{
              padding: "6px 12px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            <i className="ti ti-arrow-right" />
            跳转到卡片
          </Button>
        )}
      </div>

      {/* 题目区域 */}
      <div className="srs-cloze-question" style={{
        marginBottom: "16px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        minHeight: "100px",
        fontSize: "16px",
        lineHeight: "1.8",
        color: "var(--orca-color-text-1)"
      }}>
        {showAnswer ? answerContent : questionContent}
      </div>

      {/* 显示答案按钮 / 评分按钮 */}
      {!showAnswer ? (
        <div style={{ textAlign: "center", marginBottom: "12px" }}>
          <Button
            variant="solid"
            onClick={() => setShowAnswer(true)}
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
          <div className="srs-card-grade-buttons" style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "8px",
            marginTop: "16px"
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
              <span style={{ fontWeight: 600 }}>Again</span>
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
              <span style={{ fontWeight: 600 }}>Hard</span>
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
              <span style={{ fontWeight: 600 }}>Good</span>
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
              <span style={{ fontWeight: 600 }}>Easy</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>简单</span>
            </Button>
          </div>
        </>
      )}

      {/* 提示文本 */}
      <div style={{
        marginTop: "16px",
        textAlign: "center",
        fontSize: "12px",
        color: "var(--orca-color-text-2)",
        opacity: 0.7
      }}>
        {!showAnswer ? "点击\"显示答案\"查看填空内容" : "根据记忆程度选择评分"}
      </div>

      {/* SRS 信息 */}
      {srsInfo && (
        <div style={{
          marginTop: "12px",
          fontSize: "12px",
          color: "var(--orca-color-text-2)",
          backgroundColor: "var(--orca-color-bg-2)",
          padding: "8px 10px",
          borderRadius: "8px"
        }}>
          <div>下次复习：{srsInfo.due ? new Date(srsInfo.due).toLocaleString() : "未安排"}</div>
          <div style={{ marginTop: "6px" }}>
            间隔：{srsInfo.interval ?? "-"} 天 / 稳定度：{srsInfo.stability?.toFixed ? srsInfo.stability.toFixed(2) : srsInfo.stability} / 难度：{srsInfo.difficulty?.toFixed ? srsInfo.difficulty.toFixed(2) : srsInfo.difficulty}
          </div>
          <div style={{ marginTop: "4px" }}>
            已复习：{srsInfo.reps ?? 0} 次，遗忘：{srsInfo.lapses ?? 0} 次
          </div>
        </div>
      )}
    </div>
  )

  if (inSidePanel) {
    return (
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        {cardContent}
      </div>
    )
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={onClose}
      className="srs-cloze-card-modal"
    >
      {cardContent}
    </ModalOverlay>
  )
}
