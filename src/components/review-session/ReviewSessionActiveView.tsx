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
      >
        <ProgressBar progress={progress} />
        <div className="srs-review-header" contentEditable={false}>
          <div contentEditable={false} className="srs-review-header__main">
            <ProgressText {...props} />
            {props.lastLog && <InlineStatus>{props.lastLog}</InlineStatus>}
            {activeError && (
              <InlineAlert message={activeError.message} onRetry={props.onRetryBlockLoad} />
            )}
            {props.childExpandWarning && (
              <InlineStatus warning>{props.childExpandWarning}</InlineStatus>
            )}
          </div>
          <Button
            variant="plain"
            onClick={props.onCheckNewCards}
            title="检查新到期卡片"
            className="srs-review-icon-btn srs-review-header__refresh"
          >
            <i className="ti ti-refresh" />
          </Button>
        </div>
        <div className="srs-review-session-body">
          <ActiveCard {...props} inSidePanel={true} />
        </div>
      </div>
    )
  }

  return (
    <div ref={props.containerRef} className="srs-review-session">
      <div contentEditable={false} className="srs-review-topbar">
        <ProgressBar progress={progress} />
      </div>
      <div contentEditable={false} className="srs-review-hud">
        <ProgressText {...props} />
      </div>
      {props.lastLog && (
        <FloatingStatus top="48px">{props.lastLog}</FloatingStatus>
      )}
      {activeError && (
        <div
          contentEditable={false}
          className="srs-review-floating"
          style={{ top: props.lastLog ? "80px" : "48px" }}
        >
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
      <div
        className={`srs-review-state ${
          props.inSidePanel ? "" : "srs-review-state--viewport"
        }`}
      >
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
    <div className="srs-review-progress-bar" contentEditable={false}>
      {/* 宽度是运行时动态几何量，按规范保留内联 */}
      <div className="srs-review-progress-bar__fill" style={{ width: `${progress}%` }} />
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
        <span className="srs-review-repeat-badge">
          重复复习 · 第 {props.currentRound} 轮
        </span>
      )}
      <span className="srs-review-counts">
        卡片 {props.currentIndex + 1} / {props.totalCards}
        （到期 {props.counters.due} | 新卡 {props.counters.fresh}）
      </span>
      {props.newCardsAdded > 0 && (
        <span className="srs-review-newly-added">
          +{props.newCardsAdded} 新增
        </span>
      )}
    </>
  )
}

function InlineAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="srs-review-inline-alert">
      <span className="srs-review-inline-alert__message">{message}</span>
      <Button
        variant="plain"
        onClick={onRetry}
        title="重试加载卡片块"
        className="srs-review-inline-alert__retry"
      >
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
    <div
      role={warning ? "status" : undefined}
      className={`srs-review-inline-status ${
        warning ? "srs-review-inline-status--warning" : ""
      }`}
    >
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
    // top 由调用方按浮层堆叠顺序动态给出，属运行时几何量，保留内联
    <div
      role={warning ? "status" : undefined}
      contentEditable={false}
      className={`srs-review-floating-status ${
        warning ? "srs-review-floating-status--warning" : ""
      }`}
      style={{ top }}
    >
      {children}
    </div>
  )
}
