/**
 * SRS 卡片组件
 *
 * 题目与答案区域直接嵌入 Orca Block，用户可以像在正文中一样编辑，
 * 不再需要单独的 textarea 与保存逻辑。
 */

// 从全局 window 对象获取 React 与 Valtio（Orca 插件约定）
const { useState, useEffect, useRef } = window.React
const { useSnapshot } = window.Valtio
const { Block, Button, ModalOverlay } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"

type ReviewBlockProps = {
  blockId?: DbId
  panelId?: string
  fallback: string
  hideChildren?: boolean
}

function ReviewBlock({ blockId, panelId, fallback, hideChildren = false }: ReviewBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hideChildren) return
    const container = containerRef.current
    if (!container) return

    const hideDescendants = () => {
      const childNodes = container.querySelectorAll<HTMLElement>("[class*='children'], [data-role*='children'], [data-testid*='children']")
      childNodes.forEach((node: HTMLElement) => {
        node.style.display = "none"
      })
    }

    hideDescendants()

    const observer = new MutationObserver(() => {
      hideDescendants()
    })

    observer.observe(container, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [hideChildren, blockId])

  const containerClassName = `srs-block-container${hideChildren ? " srs-block-hide-children" : ""}`

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={{
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-0)",
        borderRadius: "6px",
        border: "1px solid var(--orca-color-border-1)"
      }}
    >
      {blockId && panelId ? (
        <Block
          panelId={panelId}
          blockId={blockId}
          blockLevel={0}
          indentLevel={0}
          renderingMode={hideChildren ? "simple" : undefined}
        />
      ) : (
        <div style={{
          fontSize: "16px",
          color: "var(--orca-color-text-1)",
          lineHeight: "1.6",
          whiteSpace: "pre-wrap"
        }}>
          {fallback}
        </div>
      )}
    </div>
  )
}

type SrsCardDemoProps = {
  front: string
  back: string
  onGrade: (grade: Grade) => Promise<void> | void
  onClose?: () => void
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  blockId?: DbId
  onJumpToCard?: (blockId: DbId) => void
  inSidePanel?: boolean
  panelId?: string
}

export default function SrsCardDemo({
  front,
  back,
  onGrade,
  onClose,
  srsInfo,
  isGrading = false,
  blockId,
  onJumpToCard,
  inSidePanel = false,
  panelId
}: SrsCardDemoProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const snapshot = useSnapshot(orca.state)
  const blocks = snapshot?.blocks ?? {}
  const questionBlock = blockId ? blocks[blockId] : null
  const answerBlockId: DbId | undefined = questionBlock?.children?.[0]

  const handleGrade = async (grade: Grade) => {
    if (isGrading) return
    console.log(`[SRS Card Demo] 用户选择评分: ${grade}`)
    await onGrade(grade)
    setShowAnswer(false)
  }

  const renderBlock = (renderBlockId: DbId | undefined, fallback: string, options?: { hideChildren?: boolean }) => (
    <ReviewBlock
      blockId={renderBlockId}
      panelId={panelId}
      fallback={fallback}
      hideChildren={options?.hideChildren}
    />
  )

  const cardContent = (
    <div className="srs-card-container" style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      maxWidth: inSidePanel ? "720px" : "600px",
      width: inSidePanel ? "100%" : "90%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      margin: inSidePanel ? "0 auto" : undefined
    }}>

      {blockId && onJumpToCard && (
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "12px"
        }}>
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
        </div>
      )}

      <div className="srs-card-front" style={{
        marginBottom: "24px",
        padding: "20px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        minHeight: "100px"
      }}>
        <div style={{
          fontSize: "14px",
          fontWeight: "500",
          color: "var(--orca-color-text-2)",
          marginBottom: "12px"
        }}>
          题目
        </div>

        {renderBlock(blockId, front, { hideChildren: true })}
      </div>

      {!showAnswer ? (
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
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
          <div className="srs-card-back" style={{
            marginBottom: "24px",
            padding: "20px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "8px",
            minHeight: "100px",
            borderLeft: "4px solid var(--orca-color-primary-5)"
          }}>
            <div style={{
              fontSize: "14px",
              color: "var(--orca-color-text-2)",
              fontWeight: "500",
              marginBottom: "12px"
            }}>
              答案：
            </div>

            {renderBlock(answerBlockId, back)}
          </div>

          <div className="srs-card-grade-buttons" style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px"
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

      <div style={{
        marginTop: "16px",
        textAlign: "center",
        fontSize: "12px",
        color: "var(--orca-color-text-2)",
        opacity: 0.7
      }}>
        {!showAnswer ? "点击\"显示答案\"查看答案内容" : "根据记忆程度选择评分"}
      </div>

      {srsInfo && (
        <div style={{
          marginTop: "16px",
          fontSize: "12px",
          color: "var(--orca-color-text-2)",
          backgroundColor: "var(--orca-color-bg-2)",
          padding: "10px 12px",
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
      className="srs-card-modal"
    >
      {cardContent}
    </ModalOverlay>
  )
}
