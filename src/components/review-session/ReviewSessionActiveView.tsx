import type { DbId } from "../../orca.d.ts"
import type { Grade, ReviewCard } from "../../srs/types"
import SrsCardDemo from "../SrsCardDemo"

const { Button } = orca.components

export type ReviewBlockLoadError = {
  cardKey: string
  message: string
}

type ReviewSessionActiveViewProps = {
  containerRef: React.RefObject<HTMLDivElement>
  inSidePanel: boolean
  isMaximized: boolean
  currentIndex: number
  totalCards: number
  counters: { due: number; fresh: number }
  newCardsAdded: number
  lastLog: string | null
  blockLoadError: ReviewBlockLoadError | null
  currentCardKey: string | null
  childExpandWarning?: string | null
  currentCard: ReviewCard | null
  nextCard: ReviewCard | null
  isCurrentReadOnly: boolean
  readOnlyStatusText?: string
  isGrading: boolean
  canGoPrevious: boolean
  isRepeatMode: boolean
  currentRound: number
  panelId?: string
  pluginName: string
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone: () => void
  onSuspend: () => void
  onClose: () => void
  onSkip: () => void
  onContinue: () => void
  onPrevious: () => void
  onJumpToCard: (blockId: DbId, shiftKey?: boolean) => void
  onRetryBlockLoad: () => void
  onCheckNewCards: () => void
}

export default function ReviewSessionActiveView(props: ReviewSessionActiveViewProps) {
  const progress = props.totalCards > 0
    ? (props.currentIndex / props.totalCards) * 100
    : 0
  const activeError = props.blockLoadError &&
    props.currentCardKey &&
    props.blockLoadError.cardKey === props.currentCardKey
      ? props.blockLoadError
      : null

  if (props.inSidePanel) {
    return (
      <div
        ref={props.containerRef}
        className={`srs-review-session-panel ${props.isMaximized ? "orca-maximized" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          backgroundColor: "var(--orca-color-bg-0)"
        }}
      >
        <ProgressBar progress={progress} />
        <div className="srs-review-header" contentEditable={false} style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--orca-color-border-1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div contentEditable={false} style={{ userSelect: "none" }}>
            <ProgressText {...props} />
            {props.lastLog && <InlineStatus>{props.lastLog}</InlineStatus>}
            {activeError && (
              <InlineAlert message={activeError.message} onRetry={props.onRetryBlockLoad} />
            )}
            {props.childExpandWarning && (
              <InlineStatus warning>{props.childExpandWarning}</InlineStatus>
            )}
          </div>
          <Button variant="plain" onClick={props.onCheckNewCards} title="检查新到期卡片" style={{ marginLeft: "8px" }}>
            <i className="ti ti-refresh" />
          </Button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
          <ActiveCard {...props} inSidePanel={true} />
        </div>
      </div>
    )
  }

  return (
    <div ref={props.containerRef} className="srs-review-session">
      <div contentEditable={false} style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000
      }}>
        <ProgressBar progress={progress} />
      </div>
      <div contentEditable={false} style={{
        position: "fixed",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 16px",
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "20px",
        fontSize: "14px",
        color: "var(--orca-color-text-2)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}>
        <ProgressText {...props} />
      </div>
      {props.lastLog && (
        <FloatingStatus top="48px">{props.lastLog}</FloatingStatus>
      )}
      {activeError && (
        <div contentEditable={false} style={{
          position: "fixed",
          top: props.lastLog ? "80px" : "48px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10001
        }}>
          <InlineAlert message={activeError.message} onRetry={props.onRetryBlockLoad} />
        </div>
      )}
      {props.childExpandWarning && (
        <FloatingStatus
          top={props.lastLog || activeError ? "112px" : "48px"}
          warning
        >
          {props.childExpandWarning}
        </FloatingStatus>
      )}
      <ActiveCard {...props} inSidePanel={false} />
    </div>
  )
}

function ActiveCard(
  props: ReviewSessionActiveViewProps & { inSidePanel: boolean }
) {
  const card = props.currentCard
  if (!card) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: props.inSidePanel ? "100%" : "100vh",
        color: "var(--orca-color-text-2)"
      }}>
        加载中...
      </div>
    )
  }

  return (
    <SrsCardDemo
      front={card.front}
      back={card.back}
      onGrade={props.onGrade}
      onPostpone={props.isCurrentReadOnly ? undefined : props.onPostpone}
      onSuspend={props.isCurrentReadOnly ? undefined : props.onSuspend}
      onClose={props.onClose}
      onSkip={props.isCurrentReadOnly ? props.onContinue : props.onSkip}
      onPrevious={props.onPrevious}
      canGoPrevious={props.canGoPrevious}
      srsInfo={card.srs}
      isGrading={props.isGrading}
      blockId={card.id}
      nextBlockId={props.nextCard?.id}
      onJumpToCard={props.onJumpToCard}
      inSidePanel={props.inSidePanel}
      panelId={props.panelId}
      pluginName={props.pluginName}
      clozeNumber={card.clozeNumber}
      directionType={card.directionType}
      listItemId={card.listItemId}
      listItemIndex={card.listItemIndex}
      listItemIds={card.listItemIds}
      isAuxiliaryPreview={card.isAuxiliaryPreview}
      readOnly={props.isCurrentReadOnly}
      readOnlyStatusText={props.readOnlyStatusText}
    />
  )
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="srs-review-progress-bar" contentEditable={false} style={{
      height: "4px",
      backgroundColor: "var(--orca-color-bg-2)"
    }}>
      <div style={{
        height: "100%",
        width: `${progress}%`,
        backgroundColor: "var(--orca-color-primary-5)",
        transition: "width 0.3s ease"
      }} />
    </div>
  )
}

function ProgressText(props: Pick<
  ReviewSessionActiveViewProps,
  "isRepeatMode" | "currentRound" | "currentIndex" | "totalCards" | "counters" | "newCardsAdded"
>) {
  return (
    <>
      {props.isRepeatMode && (
        <span style={{
          backgroundColor: "var(--orca-color-warning-1)",
          color: "var(--orca-color-warning-6)",
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "12px",
          fontWeight: 600
        }}>
          重复复习 · 第 {props.currentRound} 轮
        </span>
      )}
      <span>
        卡片 {props.currentIndex + 1} / {props.totalCards}
        （到期 {props.counters.due} | 新卡 {props.counters.fresh}）
      </span>
      {props.newCardsAdded > 0 && (
        <span style={{ color: "var(--orca-color-primary-6)", fontSize: "12px" }}>
          +{props.newCardsAdded} 新增
        </span>
      )}
    </>
  )
}

function InlineAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{
      marginTop: "6px",
      fontSize: "12px",
      color: "var(--orca-color-danger-6, var(--orca-color-warning-6))",
      backgroundColor: "var(--orca-color-danger-1, var(--orca-color-warning-1))",
      padding: "4px 8px",
      borderRadius: "4px",
      maxWidth: "480px",
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <Button variant="plain" onClick={onRetry} title="重试加载卡片块" style={{ flexShrink: 0, fontSize: "12px" }}>
        重试
      </Button>
    </div>
  )
}

function InlineStatus({
  children,
  warning = false
}: {
  children: React.ReactNode
  warning?: boolean
}) {
  return (
    <div role={warning ? "status" : undefined} style={{
      marginTop: "6px",
      fontSize: "12px",
      color: warning ? "var(--orca-color-warning-6)" : "var(--orca-color-text-2)",
      backgroundColor: warning ? "var(--orca-color-warning-1)" : undefined,
      padding: warning ? "4px 8px" : undefined,
      borderRadius: warning ? "4px" : undefined,
      opacity: warning ? 1 : 0.8,
      maxWidth: "480px"
    }}>
      {children}
    </div>
  )
}

function FloatingStatus({
  children,
  top,
  warning = false
}: {
  children: React.ReactNode
  top: string
  warning?: boolean
}) {
  return (
    <div role={warning ? "status" : undefined} contentEditable={false} style={{
      position: "fixed",
      top,
      left: "50%",
      transform: "translateX(-50%)",
      padding: "6px 12px",
      backgroundColor: warning
        ? "var(--orca-color-warning-1)"
        : "var(--orca-color-bg-2)",
      borderRadius: "12px",
      fontSize: "12px",
      color: warning
        ? "var(--orca-color-warning-6)"
        : "var(--orca-color-text-2)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      zIndex: 10001,
      maxWidth: "90vw"
    }}>
      {children}
    </div>
  )
}
