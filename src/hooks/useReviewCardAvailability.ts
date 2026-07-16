import type { ReviewCard } from "../srs/types"
import { getCardKey } from "../srs/childCardCollector"
import {
  resolveBlockExistence,
  writeBlockToOrcaState
} from "../srs/blockExistence"
import {
  decidePrefetchBlockOutcome,
  decidePrefetchWhenStateHit,
  decideRequiredBlocksOutcome,
  requiredBlocksForCard,
  shouldApplyBlockLoadResult
} from "../srs/reviewSessionBlockLoad"

const { useEffect, useRef, useState } = window.React
const { useSnapshot } = window.Valtio

export type ReviewBlockLoadError = {
  cardKey: string
  message: string
}

type UseReviewCardAvailabilityOptions = {
  currentCard: ReviewCard | null
  nextCard: ReviewCard | null
  currentIndex: number
  pluginName: string
  setQueue: React.Dispatch<React.SetStateAction<ReviewCard[]>>
  setLastLog: React.Dispatch<React.SetStateAction<string | null>>
  onBeforeDrop: () => void
}

/**
 * 验证当前卡片所需块的三态可用性，并以只读方式预取下一张卡片。
 * missing 才剔除；unknown 保留队列并暴露可重试错误。
 */
export function useReviewCardAvailability({
  currentCard,
  nextCard,
  currentIndex,
  pluginName,
  setQueue,
  setLastLog,
  onBeforeDrop
}: UseReviewCardAvailabilityOptions) {
  const snapshot = useSnapshot(orca.state)
  const currentCardBlock = currentCard ? snapshot?.blocks?.[currentCard.id] : null
  const currentListItemBlock = currentCard?.listItemId
    ? snapshot?.blocks?.[currentCard.listItemId]
    : null
  const autoDroppedCardKeysRef = useRef(new Set<string>())
  const [blockLoadError, setBlockLoadError] = useState<ReviewBlockLoadError | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const currentCardKey = currentCard ? getCardKey(currentCard) : null
  const currentCardKeyRef = useRef<string | null>(currentCardKey)
  const onBeforeDropRef = useRef(onBeforeDrop)
  currentCardKeyRef.current = currentCardKey
  onBeforeDropRef.current = onBeforeDrop

  useEffect(() => {
    if (!currentCard) {
      setBlockLoadError(null)
      return
    }

    const expectedCardKey = getCardKey(currentCard)
    if (autoDroppedCardKeysRef.current.has(expectedCardKey)) return
    let cancelled = false

    void (async () => {
      const results = []
      for (const spec of requiredBlocksForCard(currentCard)) {
        const result = await resolveBlockExistence(spec.blockId, { writeToState: true })
        if (!shouldApplyBlockLoadResult({
          cancelled,
          expectedCardKey,
          currentCardKey: currentCardKeyRef.current
        })) return
        results.push(result)
      }

      if (!shouldApplyBlockLoadResult({
        cancelled,
        expectedCardKey,
        currentCardKey: currentCardKeyRef.current
      })) return

      const outcome = decideRequiredBlocksOutcome(expectedCardKey, results)
      if (outcome.action === "ready") {
        setBlockLoadError((previous: ReviewBlockLoadError | null) =>
          previous?.cardKey === expectedCardKey ? null : previous
        )
        return
      }

      if (outcome.action === "drop_missing") {
        autoDroppedCardKeysRef.current.add(outcome.cardKey)
        console.log(
          `[${pluginName}] 卡片对应块 missing，自动剔除: ${outcome.diagnostic}`
        )
        onBeforeDropRef.current()
        setBlockLoadError(null)
        setQueue((previousQueue) => {
          if (currentIndex < 0 || currentIndex >= previousQueue.length) {
            return previousQueue
          }
          if (getCardKey(previousQueue[currentIndex]!) !== outcome.cardKey) {
            return previousQueue
          }
          return [
            ...previousQueue.slice(0, currentIndex),
            ...previousQueue.slice(currentIndex + 1)
          ]
        })
        setLastLog(outcome.userMessage)
        return
      }

      console.error(
        `[${pluginName}] 卡片块状态 unknown，保留队列: ${outcome.diagnostic}`,
        outcome.unknowns.map((unknown) => unknown.error)
      )
      setBlockLoadError({ cardKey: outcome.cardKey, message: outcome.userMessage })
      setLastLog(outcome.userMessage)
      orca.notify("error", outcome.userMessage, { title: "SRS 复习" })
    })()

    return () => { cancelled = true }
  }, [
    currentCard?.id,
    currentCard?.listItemId,
    currentIndex,
    pluginName,
    currentCardBlock,
    currentListItemBlock,
    retryNonce,
    setLastLog,
    setQueue
  ])

  const retry = () => {
    if (!currentCardKey) return
    setBlockLoadError(null)
    setRetryNonce((nonce: number) => nonce + 1)
  }

  useEffect(() => {
    if (!nextCard?.id) return
    const nextId = nextCard.id
    if (decidePrefetchWhenStateHit(nextId, Boolean(orca.state.blocks?.[nextId]))) {
      return
    }

    let cancelled = false
    void (async () => {
      const result = await resolveBlockExistence(nextId, { writeToState: false })
      if (cancelled) return
      const outcome = decidePrefetchBlockOutcome(result)
      if (outcome.action === "write_cache") {
        writeBlockToOrcaState(outcome.block)
        console.log(`[SRS Review Session] 已预缓存下一张卡片: ${outcome.blockId}`)
      } else if (outcome.action === "log_null") {
        console.warn(
          `[SRS Review Session] 预缓存：块明确不存在（不影响当前队列）: ${outcome.diagnostic}`
        )
      } else if (outcome.action === "log_throw") {
        console.warn(
          `[SRS Review Session] 预缓存失败（不影响当前队列）: ${outcome.diagnostic}`,
          outcome.error
        )
      }
    })()
    return () => { cancelled = true }
  }, [nextCard?.id])

  return { blockLoadError, currentCardKey, retry }
}
