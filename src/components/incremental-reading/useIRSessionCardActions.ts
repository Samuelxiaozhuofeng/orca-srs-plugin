/**
 * IR session card actions: next / postpone / extract / itemize(挖空) / complete / skip.
 * Keeps IRSessionShell under the line-budget by housing withWork handlers here.
 */

import type { CursorData } from "../../orca.d.ts"
import type { IRCard } from "../../srs/incrementalReadingCollector"
import { createExtract } from "../../srs/extractUtils"
import { convertExtractToItem } from "../../srs/incremental-reading/irConversionService"
import type { IRSessionMetrics } from "../../srs/incremental-reading/irMetrics"
import {
  performArchive,
  performNext,
  performPostpone,
  performPriorityAdjust,
  performSkipChapter
} from "../../srs/incremental-reading/irSessionService"
import type { NextChapterSchedule } from "../../importers/epub/types"
import {
  applyImportanceNudge,
  formatImportanceTierLabel,
  type ImportanceNudgeDirection
} from "../../srs/incremental-reading/irImportance"
import { recordDwellSample } from "../../srs/incremental-reading/irCostCalibration"
import {
  formatItemizeNeedInExtract,
  formatItemizeNeedSelection,
  formatItemizeStaySuccess,
  formatNonSequentialCompleteSuccess
} from "../../srs/incremental-reading/irSessionCompleteCopy"
import { postponeDaysForChoice } from "../../srs/incrementalReadingStorage"
import type { IRSessionEntry } from "../../srs/incremental-reading/irMixedQueuePolicy"
import type { PostponeChoice } from "./IRPostponeMenu"

export type IRSessionCardActionsDeps = {
  currentCard: IRCard | null | undefined
  currentIndex: number
  isTopic: boolean
  isWorking: boolean
  isSequentialActive: boolean
  pluginName: string
  metricsRef: { current: IRSessionMetrics }
  cardEnteredAtRef: { current: number }
  breakpoint: { flush: () => Promise<void> }
  setIsWorking: (v: boolean) => void
  setQueue: (updater: (prev: IRSessionEntry[]) => IRSessionEntry[]) => void
  setPostponeOpen: (v: boolean) => void
  setImportanceOpen: (v: boolean) => void
  setMoreOpen: (v: boolean) => void
  setCompleteChapterOpen: (v: boolean) => void
  setArchiveConfirmOpen: (v: boolean) => void
  removeCurrent: (options?: { metric?: "action.review" }) => void
}

export type IRSessionCardActions = {
  handleNext: () => void
  handlePostpone: (choice?: PostponeChoice) => void
  handleExtract: () => void
  handleItemize: () => void
  handleArchive: (options?: { nextChapterSchedule?: NextChapterSchedule }) => void
  handleCompleteRequest: () => void
  handleSkipChapter: () => void
  handleImportanceNudge: (direction: ImportanceNudgeDirection) => void
}

export function createIRSessionCardActions(deps: IRSessionCardActionsDeps): IRSessionCardActions {
  const {
    currentCard,
    currentIndex,
    isTopic,
    isWorking,
    isSequentialActive,
    pluginName,
    metricsRef,
    cardEnteredAtRef,
    breakpoint,
    setIsWorking,
    setQueue,
    setPostponeOpen,
    setImportanceOpen,
    setMoreOpen,
    setCompleteChapterOpen,
    setArchiveConfirmOpen,
    removeCurrent
  } = deps

  const withWork = async (fn: () => Promise<void>) => {
    if (isWorking) return
    setIsWorking(true)
    try {
      await fn()
    } finally {
      setIsWorking(false)
    }
  }

  const recordDwell = (card: IRCard) => {
    const dwellMs = Math.max(0, Date.now() - cardEnteredAtRef.current)
    recordDwellSample({
      cardType: card.cardType,
      isLong: !card.isNew && card.readCount > 1,
      dwellMs
    })
    return dwellMs
  }

  const handleNext = () => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      const dwellMs = recordDwell(currentCard)
      await performNext(currentCard.id, { dwellMs })
      metricsRef.current.record("action.next", dwellMs, { cardType: currentCard.cardType })
      removeCurrent()
      orca.notify("success", "已进入下一篇", { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "next" })
      console.error("[IR Session] 下一篇失败:", error)
      orca.notify("error", "下一篇失败", { title: "渐进阅读" })
    }
  })

  const handlePostpone = (choice?: PostponeChoice) => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      recordDwell(currentCard)
      const days = choice ? postponeDaysForChoice(choice) : undefined
      const result = await performPostpone(currentCard.id, days)
      metricsRef.current.record("action.postpone")
      removeCurrent()
      setPostponeOpen(false)
      orca.notify("success", `已推后 ${result.days} 天`, { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "postpone" })
      console.error("[IR Session] 推后失败:", error)
      orca.notify("error", "推后失败", { title: "渐进阅读" })
    }
  })

  const handleExtract = () => withWork(async () => {
    if (!currentCard) return
    const selection = window.getSelection()
    const cursor = orca.utils.getCursorDataFromSelection(selection) as CursorData | null
    if (!cursor) {
      orca.notify("warn", "请先选择要摘录的文本", { title: "渐进阅读" })
      return
    }
    try {
      const result = await createExtract(cursor, pluginName)
      if (!result) {
        metricsRef.current.record("action.failure", undefined, { kind: "extract" })
        return
      }
      await breakpoint.flush()
      metricsRef.current.record("action.extract")
      // 成功文案由 createExtract 按真实 due 推送（约 N 天后回来）；此处不再覆盖
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "extract" })
      console.error("[IR Session] 摘录失败:", error)
      orca.notify("error", "摘录失败", { title: "渐进阅读" })
    }
  })

  const handleItemize = () => withWork(async () => {
    if (!currentCard || isTopic) return
    const selection = window.getSelection()
    const cursor = orca.utils.getCursorDataFromSelection(selection) as CursorData | null
    if (!cursor) {
      orca.notify("warn", formatItemizeNeedSelection(), { title: "渐进阅读" })
      return
    }
    if (cursor.rootBlockId !== currentCard.id) {
      orca.notify("warn", formatItemizeNeedInExtract(), { title: "渐进阅读" })
      return
    }
    try {
      await breakpoint.flush()
      const result = await convertExtractToItem({
        extractId: currentCard.id,
        cursor,
        pluginName,
        strategy: "keep_extract"
      })
      if (!result.ok) {
        metricsRef.current.record("action.failure", undefined, { kind: "itemize" })
        orca.notify("error", `挖空失败（${result.step}）：${result.error}`, { title: "渐进阅读" })
        return
      }
      metricsRef.current.record("action.itemize")
      orca.notify("success", formatItemizeStaySuccess(), { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "itemize" })
      console.error("[IR Session] 挖空失败:", error)
      orca.notify("error", "挖空失败，摘录已保留", { title: "渐进阅读" })
    }
  })

  const handleArchive = (options?: { nextChapterSchedule?: NextChapterSchedule }) => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      const outcome = await performArchive(currentCard.id, pluginName, options)
      metricsRef.current.record("action.archive")
      setCompleteChapterOpen(false)
      setArchiveConfirmOpen(false)
      if (outcome.leftCard) {
        removeCurrent()
      }
      if (!outcome.sequential) {
        orca.notify("success", formatNonSequentialCompleteSuccess(), { title: "渐进阅读" })
      }
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "archive" })
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[IR Session] 完成/归档失败:", error)
      orca.notify("error", `完成失败：${msg}`, { title: "渐进阅读" })
    }
  })

  const handleCompleteRequest = () => {
    if (isWorking) return
    setMoreOpen(false)
    setImportanceOpen(false)
    setPostponeOpen(false)
    if (isSequentialActive) {
      setArchiveConfirmOpen(false)
      setCompleteChapterOpen(true)
    } else {
      setCompleteChapterOpen(false)
      setArchiveConfirmOpen(true)
    }
  }

  const handleSkipChapter = () => withWork(async () => {
    if (!currentCard) return
    try {
      await breakpoint.flush()
      const outcome = await performSkipChapter(currentCard.id, pluginName)
      metricsRef.current.record("action.archive")
      if (outcome.leftCard) {
        removeCurrent()
      }
    } catch (error) {
      console.error("[IR Session] 跳过章节失败:", error)
      orca.notify("error", error instanceof Error ? error.message : "跳过章节失败", {
        title: "渐进阅读"
      })
    }
  })

  const handleImportanceNudge = (direction: ImportanceNudgeDirection) => withWork(async () => {
    if (!currentCard) return
    try {
      const nudge = applyImportanceNudge(currentCard.priority, direction)
      if (nudge.blockedAtBound) {
        orca.notify(
          "info",
          direction === "down" ? "已经最低" : "已经最高",
          { title: "渐进阅读" }
        )
        setImportanceOpen(false)
        return
      }
      if (!nudge.changed) {
        orca.notify("info", "已是正常", { title: "渐进阅读" })
        setImportanceOpen(false)
        return
      }
      const next = await performPriorityAdjust(currentCard.id, nudge.nextPriority)
      setQueue((prev: IRSessionEntry[]) => prev.map((entry: IRSessionEntry, i: number) => {
        if (i !== currentIndex || entry.kind !== "reading") return entry
        return {
          ...entry,
          card: {
            ...entry.card,
            priority: next.priority,
            intervalDays: next.intervalDays,
            due: next.due,
            lastAction: next.lastAction
          }
        }
      }))
      orca.notify(
        "success",
        `重要性：${formatImportanceTierLabel(nudge.tier)}`,
        { title: "渐进阅读" }
      )
      setImportanceOpen(false)
    } catch (error) {
      console.error("[IR Session] 调整重要性失败:", error)
      orca.notify("error", "调整重要性失败", { title: "渐进阅读" })
    }
  })

  return {
    handleNext,
    handlePostpone,
    handleExtract,
    handleItemize,
    handleArchive,
    handleCompleteRequest,
    handleSkipChapter,
    handleImportanceNudge
  }
}

