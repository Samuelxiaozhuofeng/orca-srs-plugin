/**
 * Flash Home 卡片列表 — 批量 TTS 状态与操作。
 * 从 CardListView 抽出以控制文件体积；行为保持并发 2 / 取消 / 失败重试 / Basic 限制。
 */

import type { ReviewCard } from "../../srs/types"
import { cardKeyFromReviewCard } from "../../srs/cardIdentity"
import {
  buildBatchItems,
  filterBasicCardsForTtsBatch,
  retryFailedTtsBatch,
  runTtsBatch,
  summarizeBatchProgress,
  type TtsBatchItem,
  type TtsBatchProgress
} from "../../srs/tts/ttsBatch"
import { isTtsConfigured } from "../../srs/tts/ttsSettingsSchema"

const { useEffect, useMemo, useRef, useState, useCallback } = window.React

export type UseTtsBatchModeOptions = {
  cards: ReviewCard[]
  pluginName: string
  /** 筛选或牌组变化时清空选择 */
  selectionResetKey: string
}

export function useTtsBatchMode(options: UseTtsBatchModeOptions) {
  const { cards, pluginName, selectionResetKey } = options

  const [batchMode, setBatchMode] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] =
    useState<TtsBatchProgress | null>(null)
  const [batchItems, setBatchItems] = useState<TtsBatchItem[] | null>(null)
  const [skipExisting, setSkipExisting] = useState(true)
  const batchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setSelectedKeys(new Set())
  }, [selectionResetKey])

  useEffect(() => {
    return () => {
      batchAbortRef.current?.abort()
    }
  }, [])

  const basicFilter = useMemo(
    () => filterBasicCardsForTtsBatch(cards),
    [cards]
  )

  const cardByKey = useMemo(() => {
    const map = new Map<string, ReviewCard>()
    for (const card of basicFilter.eligible) {
      map.set(cardKeyFromReviewCard(card), card)
    }
    return map
  }, [basicFilter.eligible])

  const toggleSelect = useCallback((cardKey: string) => {
    setSelectedKeys((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(cardKey)) next.delete(cardKey)
      else next.add(cardKey)
      return next
    })
  }, [])

  const selectAllEligible = useCallback(() => {
    setSelectedKeys(new Set(basicFilter.eligible.map(cardKeyFromReviewCard)))
  }, [basicFilter.eligible])

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  const exitBatchMode = useCallback(() => {
    if (batchRunning) {
      batchAbortRef.current?.abort()
    }
    setBatchMode(false)
    setSelectedKeys(new Set())
    setBatchProgress(null)
    setBatchItems(null)
  }, [batchRunning])

  const startBatch = useCallback(async () => {
    if (batchRunning) return
    if (!isTtsConfigured(pluginName)) {
      orca.notify(
        "warn",
        "尚未配置 Azure TTS，请先打开「AI 与导入服务」→「语音 TTS」",
        { title: "批量语音" }
      )
      const { openAIServiceSettings } = await import(
        "../../srs/ai/aiServiceSettingsState"
      )
      await openAIServiceSettings(pluginName)
      return
    }

    const selectedCards: ReviewCard[] = []
    for (const key of selectedKeys) {
      const c = cardByKey.get(key)
      if (c) selectedCards.push(c)
    }
    if (selectedCards.length === 0) {
      orca.notify("warn", "请先勾选至少一张 Basic 卡", { title: "批量语音" })
      return
    }

    const items = buildBatchItems(selectedCards)
    setBatchItems(items)
    setBatchRunning(true)
    const controller = new AbortController()
    batchAbortRef.current = controller

    try {
      const progress = await runTtsBatch({
        pluginName,
        items,
        mode: skipExisting ? "skip_existing" : "regenerate",
        concurrency: 2,
        signal: controller.signal,
        onProgress: (p) => setBatchProgress({ ...p, items: [...p.items] })
      })
      setBatchProgress(progress)
      setBatchItems([...items])

      const parts = [
        `成功 ${progress.success}`,
        `跳过 ${progress.skipped}`,
        `失败 ${progress.failed}`,
        progress.cancelled > 0 ? `取消 ${progress.cancelled}` : null
      ].filter(Boolean)
      const summary = parts.join(" · ")
      if (progress.failed > 0 || progress.cancelled > 0) {
        orca.notify(
          progress.success > 0 ? "warn" : "error",
          `批量语音结束：${summary}`,
          { title: "批量语音" }
        )
      } else {
        orca.notify("success", `批量语音完成：${summary}`, {
          title: "批量语音"
        })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      console.error("[TTS Batch]", message, error)
      orca.notify("error", message, { title: "批量语音失败" })
    } finally {
      setBatchRunning(false)
      if (batchAbortRef.current === controller) {
        batchAbortRef.current = null
      }
    }
  }, [batchRunning, pluginName, selectedKeys, cardByKey, skipExisting])

  const retryFailed = useCallback(async () => {
    if (!batchItems || batchRunning) return
    setBatchRunning(true)
    const controller = new AbortController()
    batchAbortRef.current = controller
    try {
      const progress = await retryFailedTtsBatch({
        pluginName,
        items: batchItems,
        mode: skipExisting ? "skip_existing" : "regenerate",
        concurrency: 2,
        signal: controller.signal,
        onProgress: (p) => setBatchProgress({ ...p, items: [...p.items] })
      })
      setBatchProgress(progress)
      setBatchItems([...batchItems])
      orca.notify(
        progress.failed > 0 ? "warn" : "success",
        `重试结束：成功 ${progress.success} · 失败 ${progress.failed}`,
        { title: "批量语音" }
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      console.error("[TTS Batch] 重试失败:", error)
      orca.notify("error", message, { title: "批量语音重试失败" })
    } finally {
      setBatchRunning(false)
      if (batchAbortRef.current === controller) {
        batchAbortRef.current = null
      }
    }
  }, [batchItems, batchRunning, pluginName, skipExisting])

  const cancelBatch = useCallback(() => {
    batchAbortRef.current?.abort()
  }, [])

  const liveProgress =
    batchProgress ??
    (batchItems ? summarizeBatchProgress(batchItems) : null)

  return {
    batchMode,
    setBatchMode,
    selectedKeys,
    batchRunning,
    batchItems,
    skipExisting,
    setSkipExisting,
    basicFilter,
    liveProgress,
    toggleSelect,
    selectAllEligible,
    clearSelection,
    exitBatchMode,
    startBatch,
    retryFailed,
    cancelBatch
  }
}
