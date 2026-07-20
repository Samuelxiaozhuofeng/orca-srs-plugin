import type { DbId } from "../../orca.d.ts"
import type { Grade, SrsState } from "../../srs/types"
import { previewDueDates, previewIntervals } from "../../srs/algorithm"
import { useReviewShortcuts } from "../../hooks/useReviewShortcuts"
import SrsErrorBoundary from "../SrsErrorBoundary"
import CardInfoPanel from "./CardInfoPanel"
import {
  EmbeddedAnswerBlock,
  EmbeddedQuestionBlock
} from "./EmbeddedReviewBlocks"
import ReviewGradeButtons from "./ReviewGradeButtons"

const { useEffect, useMemo, useRef, useState } = window.React
const { Block, BlockBreadcrumb, Button, ModalOverlay } = orca.components

export type BasicCardReviewRendererProps = {
  front: string
  back: string
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void
  onPrevious?: () => void
  canGoPrevious?: boolean
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  blockId?: DbId
  nextBlockId?: DbId
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
  cardKey: string
  totalChildCount: number
  isExcerptCard: boolean
  readOnly?: boolean
  readOnlyStatusText?: string
}

function completeState(srsInfo?: Partial<SrsState>): SrsState | null {
  if (!srsInfo) return null
  return {
    stability: srsInfo.stability ?? 0,
    difficulty: srsInfo.difficulty ?? 0,
    interval: srsInfo.interval ?? 0,
    due: srsInfo.due ?? new Date(),
    lastReviewed: srsInfo.lastReviewed ?? null,
    reps: srsInfo.reps ?? 0,
    lapses: srsInfo.lapses ?? 0,
    state: srsInfo.state
  }
}

export default function BasicCardReviewRenderer({
  front,
  back,
  onGrade,
  onPostpone,
  onSuspend,
  onClose,
  onSkip,
  onPrevious,
  canGoPrevious = false,
  srsInfo,
  isGrading = false,
  blockId,
  nextBlockId,
  onJumpToCard,
  inSidePanel = false,
  panelId,
  pluginName,
  cardKey,
  totalChildCount,
  isExcerptCard,
  readOnly = false,
  readOnlyStatusText
}: BasicCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(readOnly)
  const [showCardInfo, setShowCardInfo] = useState(false)
  const previousCardKeyRef = useRef("")

  useEffect(() => {
    if (previousCardKeyRef.current !== cardKey) {
      setShowAnswer(readOnly)
      setShowCardInfo(false)
      previousCardKeyRef.current = cardKey
    } else if (readOnly) {
      setShowAnswer(true)
    }
  }, [cardKey, readOnly])

  const handleGrade = async (grade: Grade) => {
    if (isGrading || readOnly) return
    await onGrade(grade)
    setShowAnswer(false)
  }

  useReviewShortcuts({
    showAnswer,
    isGrading,
    onShowAnswer: () => setShowAnswer(true),
    onGrade: handleGrade,
    onBury: onPostpone,
    onSuspend,
    readOnly
  })

  const fullState = useMemo(() => completeState(srsInfo), [srsInfo])
  const intervals = useMemo(
    () => previewIntervals(fullState, undefined, pluginName),
    [fullState, pluginName]
  )
  const dueDates = useMemo(
    () => previewDueDates(fullState, undefined, pluginName),
    [fullState, pluginName]
  )

  const gradeButtons = (
    <ReviewGradeButtons
      intervals={intervals}
      dueDates={dueDates}
      onGrade={handleGrade}
      onSkip={onSkip}
      readOnly={readOnly}
    />
  )

  const cardContent = (
    <div className="srs-card-container" style={{
      borderRadius: "12px",
      padding: "16px",
      width: inSidePanel ? "100%" : "90%",
      minWidth: inSidePanel ? "0" : "600px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
    }}>
      {readOnly && (
        <div contentEditable={false} style={{
          marginBottom: "10px",
          padding: "8px 12px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--orca-color-warning-6)",
          backgroundColor: "var(--orca-color-warning-1)",
          textAlign: "center"
        }}>
          {readOnlyStatusText ?? "只读回看"}
        </div>
      )}

      {blockId && (
        <div contentEditable={false} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          opacity: 0.6,
          transition: "opacity 0.2s"
        }}
          onMouseEnter={(event) => { event.currentTarget.style.opacity = "1" }}
          onMouseLeave={(event) => { event.currentTarget.style.opacity = "0.6" }}
        >
          <div style={{ display: "flex", gap: "4px" }}>
            {onPrevious && (
              <Button
                variant="plain"
                onClick={canGoPrevious ? onPrevious : undefined}
                title="回到上一张"
                style={{
                  padding: "4px 6px",
                  fontSize: "14px",
                  opacity: canGoPrevious ? 1 : 0.3,
                  cursor: canGoPrevious ? "pointer" : "not-allowed"
                }}
              >
                <i className="ti ti-arrow-left" />
              </Button>
            )}
          </div>
          <div style={{ display: "flex", gap: "2px" }}>
            {!readOnly && onPostpone && (
              <Button variant="plain" onClick={onPostpone} title="推迟到明天 (B)" style={{ padding: "4px 6px", fontSize: "14px" }}>
                <i className="ti ti-calendar-pause" />
              </Button>
            )}
            {!readOnly && onSuspend && (
              <Button variant="plain" onClick={onSuspend} title="暂停卡片 (S)" style={{ padding: "4px 6px", fontSize: "14px" }}>
                <i className="ti ti-player-pause" />
              </Button>
            )}
            {onJumpToCard && (
              <Button
                variant="plain"
                onClick={(event: React.MouseEvent) => onJumpToCard(blockId, event.shiftKey)}
                title="跳转到卡片 (Shift+点击在侧面板打开)"
                style={{ padding: "4px 6px", fontSize: "14px" }}
              >
                <i className="ti ti-external-link" />
              </Button>
            )}
            <Button
              variant="plain"
              onClick={() => setShowCardInfo((visible: boolean) => !visible)}
              title="卡片信息"
              style={{
                padding: "4px 6px",
                fontSize: "14px",
                color: showCardInfo ? "var(--orca-color-primary-5)" : undefined
              }}
            >
              <i className="ti ti-info-circle" />
            </Button>
          </div>
        </div>
      )}

      {blockId && showCardInfo && <CardInfoPanel srsInfo={srsInfo} />}

      {!isExcerptCard && (
        <div className="srs-card-front" style={{
          marginBottom: "16px",
          padding: "20px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "8px",
          minHeight: "80px"
        }}>
          <EmbeddedQuestionBlock blockId={blockId} panelId={panelId} fallback={front} />
        </div>
      )}

      {isExcerptCard ? (
        <>
          <div className="srs-card-back" style={{
            marginBottom: "16px",
            padding: "20px",
            borderRadius: "8px",
            minHeight: "80px"
          }}>
            {blockId && <BlockBreadcrumb key={blockId} blockId={blockId} />}
            <div contentEditable={false} style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "var(--orca-color-text-2)",
              marginBottom: "16px",
              textAlign: "center"
            }}>
              摘录
            </div>
            {blockId && panelId ? (
              <Block
                panelId={panelId}
                blockId={blockId}
                blockLevel={0}
                indentLevel={0}
                initiallyCollapsed={false}
              />
            ) : (
              <div style={{
                padding: "12px",
                fontSize: "20px",
                fontWeight: "500",
                color: "var(--orca-color-text-1)",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
                userSelect: "text",
                WebkitUserSelect: "text"
              }}>
                {front}
              </div>
            )}
          </div>
          {gradeButtons}
        </>
      ) : totalChildCount === 0 || showAnswer ? (
        <>
          {totalChildCount > 0 && showAnswer && (
            <div className="srs-card-back" style={{
              marginBottom: "16px",
              padding: "20px",
              borderRadius: "8px",
              minHeight: "80px"
            }}>
              <div contentEditable={false} style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "var(--orca-color-text-2)",
                marginBottom: "16px",
                textAlign: "center"
              }}>
                答案
              </div>
              <EmbeddedAnswerBlock blockId={blockId} panelId={panelId} fallback={back} />
            </div>
          )}
          {gradeButtons}
        </>
      ) : (
        <div contentEditable={false} style={{
          display: "flex",
          justifyContent: "center",
          gap: "12px",
          marginBottom: "12px"
        }}>
          {onSkip && (
            <Button variant="outline" onClick={onSkip} title="跳过当前卡片，不评分" style={{ padding: "12px 24px", fontSize: "16px" }}>
              跳过
            </Button>
          )}
          <Button variant="solid" onClick={() => setShowAnswer(true)} style={{ padding: "12px 32px", fontSize: "16px" }}>
            显示答案
          </Button>
        </div>
      )}
    </div>
  )

  const prefetchBlock = nextBlockId && panelId ? (
    <div style={{
      position: "absolute",
      left: "-9999px",
      visibility: "hidden",
      pointerEvents: "none"
    }}>
      <Block panelId={panelId} blockId={nextBlockId} blockLevel={0} indentLevel={0} />
    </div>
  ) : null

  if (inSidePanel) {
    return (
      <SrsErrorBoundary componentName="复习卡片" errorTitle="卡片加载出错">
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          {cardContent}
          {prefetchBlock}
        </div>
      </SrsErrorBoundary>
    )
  }

  return (
    <SrsErrorBoundary componentName="复习卡片" errorTitle="卡片加载出错">
      <ModalOverlay visible={true} canClose={true} onClose={onClose} className="srs-card-modal">
        {cardContent}
        {prefetchBlock}
      </ModalOverlay>
    </SrsErrorBoundary>
  )
}
