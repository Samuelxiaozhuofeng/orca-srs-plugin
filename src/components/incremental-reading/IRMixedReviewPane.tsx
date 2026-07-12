/**
 * 混合会话中的单张 SRS 复习卡渲染
 */

import type { DbId } from "../../orca.d.ts"
import type { Grade, ReviewCard } from "../../srs/types"
import {
  gradeReviewCard,
  postponeReviewCard,
  suspendReviewCard
} from "../../srs/reviewCardGrading"
import { showNotification } from "../../srs/settings/reviewSettingsSchema"
import { IR_MIXED_REVIEW_AUTO_ADVANCE_MS } from "../../srs/incremental-reading/irMixedQueuePolicy"
import SrsCardDemo from "../SrsCardDemo"

const { useCallback, useEffect, useRef, useState } = window.React
const { Button } = orca.components

type Props = {
  card: ReviewCard
  panelId: string
  pluginName: string
  nextBlockId?: DbId
  onComplete: () => void
  onFailure?: (message: string) => void
}

export default function IRMixedReviewPane({
  card,
  panelId,
  pluginName,
  nextBlockId,
  onComplete,
  onFailure
}: Props) {
  const [isGrading, setIsGrading] = useState(false)
  const [lastLog, setLastLog] = useState<string | null>(null)
  const [showContinue, setShowContinue] = useState(false)
  const cardStartedAtRef = useRef(Date.now())
  const advancingRef = useRef(false)
  const actionInFlightRef = useRef(false)
  const actionCompletedRef = useRef(false)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    cardStartedAtRef.current = Date.now()
    setLastLog(null)
    setShowContinue(false)
    advancingRef.current = false
    actionInFlightRef.current = false
    actionCompletedRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [card])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const advanceOnce = useCallback(() => {
    if (advancingRef.current) return
    advancingRef.current = true
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    onComplete()
  }, [onComplete])

  const scheduleAutoAdvance = useCallback(() => {
    setShowContinue(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => advanceOnce(), IR_MIXED_REVIEW_AUTO_ADVANCE_MS)
  }, [advanceOnce])

  const finishAction = useCallback(async (
    action: () => Promise<{ ok: boolean; logMessage?: string; error?: unknown }>
  ) => {
    if (actionInFlightRef.current || actionCompletedRef.current || advancingRef.current) return
    actionInFlightRef.current = true
    setIsGrading(true)
    try {
      const result = await action()
      if (!mountedRef.current) return
      if (!result.ok) {
        const message = result.error instanceof Error
          ? result.error.message
          : String(result.error ?? "操作失败")
        onFailure?.(message)
        orca.notify("error", message, { title: "SRS 复习" })
        return
      }
      if (result.logMessage) setLastLog(result.logMessage)
      if ("warning" in result && typeof result.warning === "string") {
        orca.notify("warn", result.warning, { title: "SRS 复习" })
      }
      actionCompletedRef.current = true
      scheduleAutoAdvance()
    } finally {
      actionInFlightRef.current = false
      if (mountedRef.current) setIsGrading(false)
    }
  }, [onFailure, scheduleAutoAdvance])

  const handleGrade = useCallback(async (grade: Grade) => {
    await finishAction(async () => {
      const result = await gradeReviewCard(card, grade, pluginName, cardStartedAtRef.current)
      if (!result.ok) return result
      showNotification("orca-srs", "success", result.logMessage, { title: "SRS 复习" })
      return result
    })
  }, [card, finishAction, pluginName])

  const handlePostpone = useCallback(async () => {
    await finishAction(async () => {
      const result = await postponeReviewCard(card)
      if (!result.ok) return result
      showNotification("orca-srs", "info", "卡片已推迟，明天再复习", { title: "SRS 复习" })
      return result
    })
  }, [card, finishAction])

  const handleSuspend = useCallback(async () => {
    await finishAction(async () => {
      const result = await suspendReviewCard(card)
      if (!result.ok) return result
      showNotification("orca-srs", "info", "卡片已暂停，可在卡片浏览器中取消暂停", { title: "SRS 复习" })
      return result
    })
  }, [card, finishAction])

  return (
    <div className="ir-reading__mixed-review">
      {lastLog ? (
        <div className="ir-reading__banner ir-reading__banner--info" role="status">
          <span>{lastLog}</span>
          {showContinue ? (
            <Button tabIndex={0} variant="solid" onClick={advanceOnce}>
              继续阅读
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="ir-reading__mixed-review-body">
        <SrsCardDemo
          front={card.front}
          back={card.back}
          onGrade={handleGrade}
          onPostpone={handlePostpone}
          onSuspend={handleSuspend}
          srsInfo={card.srs}
          isGrading={isGrading}
          blockId={card.id}
          nextBlockId={nextBlockId}
          inSidePanel
          panelId={panelId}
          pluginName={pluginName}
          clozeNumber={card.clozeNumber}
          directionType={card.directionType}
          listItemId={card.listItemId}
          listItemIndex={card.listItemIndex}
          listItemIds={card.listItemIds}
          isAuxiliaryPreview={card.isAuxiliaryPreview}
        />
      </div>
    </div>
  )
}
