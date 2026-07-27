/**
 * 混合会话中的单张 SRS 复习卡渲染
 *
 * 挂载 SrsCardDemo 前对 required 块做三态 preflight（writeToState），
 * 与独立复习 useReviewCardAvailability 语义对齐，避免 state miss 永久「加载中」。
 */

import type { DbId } from "../../orca.d.ts"
import type { Grade, ReviewCard } from "../../srs/types"
import { cardKeyFromReviewCard } from "../../srs/cardIdentity"
import {
  gradeReviewCard,
  postponeReviewCard,
  suspendReviewCard
} from "../../srs/reviewCardGrading"
import { showNotification } from "../../srs/settings/reviewSettingsSchema"
import {
  IR_MIXED_REVIEW_AUTO_ADVANCE_MS,
  shouldRequeueReviewInSession
} from "../../srs/incremental-reading/irMixedQueuePolicy"
import { shouldApplyBlockLoadResult } from "../../srs/reviewSessionBlockLoad"
import {
  preflightMixedReviewCard,
  type MixedReviewLoadPhase
} from "./irMixedReviewAvailability"
import SrsCardDemo from "../SrsCardDemo"

const { useCallback, useEffect, useRef, useState } = window.React
const { Button } = orca.components

type Props = {
  card: ReviewCard
  panelId: string
  pluginName: string
  nextBlockId?: DbId
  /**
   * 本条目处理完毕。`requeueCard` 非空表示短期重学：该卡应在本次会话内回流队尾
   * （仅正式评分路径可能给出；推迟 / 暂停一律不回流）。
   */
  onComplete: (requeueCard?: ReviewCard) => void
  /**
   * 后端明确 missing：从队列剔除，**不计**复习完成 / action.review。
   * 同一 cardKey 仅应调用一次（pane 内 autoDropped 守卫）。
   */
  onMissing?: (info: { cardKey: string; userMessage: string }) => void
  onFailure?: (message: string) => void
}

export default function IRMixedReviewPane({
  card,
  panelId,
  pluginName,
  nextBlockId,
  onComplete,
  onMissing,
  onFailure
}: Props) {
  const [isGrading, setIsGrading] = useState(false)
  const [lastLog, setLastLog] = useState<string | null>(null)
  const [showContinue, setShowContinue] = useState(false)
  const [loadPhase, setLoadPhase] = useState<MixedReviewLoadPhase>({
    status: "loading"
  })
  const [retryNonce, setRetryNonce] = useState(0)

  const cardStartedAtRef = useRef(Date.now())
  const advancingRef = useRef(false)
  const actionInFlightRef = useRef(false)
  const actionCompletedRef = useRef(false)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requeueCardRef = useRef<ReviewCard | null>(null)
  const autoDroppedCardKeysRef = useRef(new Set<string>())
  const onMissingRef = useRef(onMissing)
  onMissingRef.current = onMissing

  const cardKey = cardKeyFromReviewCard(card)
  const currentCardKeyRef = useRef(cardKey)
  currentCardKeyRef.current = cardKey

  useEffect(() => {
    cardStartedAtRef.current = Date.now()
    setLastLog(null)
    setShowContinue(false)
    requeueCardRef.current = null
    advancingRef.current = false
    actionInFlightRef.current = false
    actionCompletedRef.current = false
    setLoadPhase({ status: "loading" })
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [cardKey])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // required 块三态 preflight：exists → writeToState → ready 后才挂 SrsCardDemo
  useEffect(() => {
    if (autoDroppedCardKeysRef.current.has(cardKey)) return

    let cancelled = false
    setLoadPhase({ status: "loading" })

    void (async () => {
      const phase = await preflightMixedReviewCard(card)
      if (
        !shouldApplyBlockLoadResult({
          cancelled,
          expectedCardKey: cardKey,
          currentCardKey: currentCardKeyRef.current
        })
      ) {
        return
      }
      if (!mountedRef.current) return

      if (phase.status === "missing") {
        if (autoDroppedCardKeysRef.current.has(phase.cardKey)) return
        autoDroppedCardKeysRef.current.add(phase.cardKey)
        console.log(
          `[${pluginName}] mixed 复习卡 missing，自动剔除: ${phase.diagnostic}`
        )
        setLoadPhase(phase)
        onMissingRef.current?.({
          cardKey: phase.cardKey,
          userMessage: phase.userMessage
        })
        orca.notify("info", phase.userMessage, { title: "SRS 复习" })
        return
      }

      if (phase.status === "unknown") {
        console.error(
          `[${pluginName}] mixed 复习卡块 unknown，保留队列: ${phase.diagnostic}`
        )
        setLoadPhase(phase)
        orca.notify("error", phase.userMessage, { title: "SRS 复习" })
        return
      }

      setLoadPhase(phase)
    })()

    return () => {
      cancelled = true
    }
  }, [card, cardKey, pluginName, retryNonce])

  const handleRetryLoad = useCallback(() => {
    setLoadPhase({ status: "loading" })
    setRetryNonce((n: number) => n + 1)
  }, [])

  const advanceOnce = useCallback(() => {
    if (advancingRef.current) return
    advancingRef.current = true
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    onComplete(requeueCardRef.current ?? undefined)
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
      // Again/Hard 且新 due 落在短期重学窗口内：本次会话队尾回流，
      // 与独立复习会话口径一致，不必回首页另开面板
      if (
        shouldRequeueReviewInSession({
          grade,
          updatedCard: result.updatedCard,
          nowMs: Date.now()
        })
      ) {
        requeueCardRef.current = result.updatedCard
      }
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

  if (loadPhase.status === "loading") {
    return (
      <div className="ir-reading__mixed-review">
        <div
          className="ir-reading__mixed-review-body"
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "200px",
            color: "var(--orca-color-text-2)"
          }}
        >
          正在加载卡片...
        </div>
      </div>
    )
  }

  if (loadPhase.status === "unknown") {
    return (
      <div className="ir-reading__mixed-review">
        <div className="ir-reading__banner ir-reading__banner--error" role="alert">
          <span>{loadPhase.userMessage}</span>
          <Button tabIndex={0} variant="solid" onClick={handleRetryLoad}>
            重试
          </Button>
        </div>
      </div>
    )
  }

  if (loadPhase.status === "missing") {
    // onMissing 已触发剔除；短暂占位避免空闪
    return (
      <div className="ir-reading__mixed-review">
        <div
          className="ir-reading__mixed-review-body"
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "120px",
            color: "var(--orca-color-text-2)"
          }}
        >
          {loadPhase.userMessage}
        </div>
      </div>
    )
  }

  return (
    <div className="ir-reading__mixed-review">
      {lastLog ? (
        <div className="ir-reading__banner ir-reading__banner--info" role="status">
          <span>{lastLog}</span>
          {showContinue ? (
            <Button tabIndex={0} variant="solid" onClick={advanceOnce}>
              继续学习
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
