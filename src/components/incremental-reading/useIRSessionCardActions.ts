/**
 * IR session card actions: next / postpone / extract / itemize(挖空) / complete / skip.
 * Keeps IRSessionShell under the line-budget by housing withWork handlers here.
 */

import type { CursorData } from "../../orca.d.ts"
import type { IRCard } from "../../srs/incrementalReadingCollector"
import { createExtract } from "../../srs/extractUtils"
import {
  convertExtractToDirection,
  convertExtractToItem,
  convertExtractToQA
} from "../../srs/incremental-reading/irConversionService"
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
  formatDirectionNeedCursor,
  formatDirectionNeedInExtract,
  formatDirectionStaySuccess,
  formatItemizeNeedInExtract,
  formatItemizeNeedSelection,
  formatItemizeStaySuccess,
  formatNonSequentialCompleteSuccess,
  formatQANeedAnswerChild,
  formatQAStaySuccess
} from "../../srs/incremental-reading/irSessionCompleteCopy"
import { postponeDaysForChoice } from "../../srs/incrementalReadingStorage"
import type { IRSessionEntry } from "../../srs/incremental-reading/irMixedQueuePolicy"
import {
  createNextUndoRecord,
  type IRNextUndoRecord
} from "../../srs/incremental-reading/irNextUndo"
import type { PostponeChoice } from "./IRPostponeMenu"

export type IRSessionCardActionsDeps = {
  currentCard: IRCard | null | undefined
  /** 当前队列条目：撤销上一篇需要原条目与其 key */
  currentEntry: IRSessionEntry | null | undefined
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
  /**
   * 会话内「撤销上一篇」单步记录。
   * 「下一篇」写入；任何其它会写库的动作清空（撤销只覆盖最近一次且无后续污染的情况）。
   */
  setUndoRecord: (record: IRNextUndoRecord | null) => void
  removeCurrent: (options?: { metric?: "action.review" }) => void
}

export type IRSessionCardActions = {
  handleNext: () => void
  handlePostpone: (choice?: PostponeChoice) => void
  handleExtract: () => void
  handleItemize: () => void
  handleConvertToQA: () => void
  handleConvertToDirection: () => void
  handleArchive: (options?: { nextChapterSchedule?: NextChapterSchedule }) => void
  handleCompleteRequest: () => void
  handleSkipChapter: () => void
  handleImportanceNudge: (direction: ImportanceNudgeDirection) => void
}

export function createIRSessionCardActions(deps: IRSessionCardActionsDeps): IRSessionCardActions {
  const {
    currentCard,
    currentEntry,
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
    setUndoRecord,
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

  /**
   * 当前篇一旦发生会写库的动作，就不再提供「撤销上一篇」——
   * 撤销只保证回滚最近一次「下一篇」，不承诺清理其后的写入。
   */
  const invalidateUndo = () => setUndoRecord(null)

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
      const outcome = await performNext(currentCard.id, { dwellMs })
      metricsRef.current.record("action.next", dwellMs, { cardType: currentCard.cardType })
      removeCurrent()
      // 单步撤销：只有拿到动作前快照才可回滚排期，否则不提供入口（不做只回 UI 的假撤销）
      const undoRecord = outcome.previousState && currentEntry
        ? createNextUndoRecord({
          entry: currentEntry,
          index: currentIndex,
          snapshot: outcome.previousState
        })
        : null
      setUndoRecord(undoRecord)
      orca.notify(
        "success",
        undoRecord ? "已进入下一篇（顶部可撤销上一篇）" : "已进入下一篇",
        { title: "渐进阅读" }
      )
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "next" })
      console.error("[IR Session] 下一篇失败:", error)
      orca.notify("error", "下一篇失败", { title: "渐进阅读" })
    }
  })

  const handlePostpone = (choice?: PostponeChoice) => withWork(async () => {
    if (!currentCard) return
    invalidateUndo()
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
    invalidateUndo()
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
    invalidateUndo()
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

  const handleConvertToQA = () => withWork(async () => {
    if (!currentCard || isTopic) return
    invalidateUndo()
    try {
      await breakpoint.flush()
      setMoreOpen(false)
      const result = await convertExtractToQA({
        extractId: currentCard.id,
        pluginName,
        strategy: "keep_extract"
      })
      if (!result.ok) {
        metricsRef.current.record("action.failure", undefined, { kind: "qa" })
        if (result.step === "validate" && result.error.includes("答案子块")) {
          orca.notify("warn", formatQANeedAnswerChild(), { title: "渐进阅读" })
        } else {
          orca.notify("error", `问答失败（${result.step}）：${result.error}`, { title: "渐进阅读" })
        }
        return
      }
      metricsRef.current.record("action.itemize", undefined, { kind: "qa" })
      orca.notify("success", formatQAStaySuccess(), { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "qa" })
      console.error("[IR Session] 问答转化失败:", error)
      orca.notify("error", "问答转化失败，摘录已保留", { title: "渐进阅读" })
    }
  })

  const handleConvertToDirection = () => withWork(async () => {
    if (!currentCard || isTopic) return
    const selection = window.getSelection()
    const cursor = orca.utils.getCursorDataFromSelection(selection) as CursorData | null
    if (!cursor) {
      orca.notify("warn", formatDirectionNeedCursor(), { title: "渐进阅读" })
      return
    }
    if (cursor.anchor.blockId !== currentCard.id && cursor.rootBlockId !== currentCard.id) {
      orca.notify("warn", formatDirectionNeedInExtract(), { title: "渐进阅读" })
      return
    }
    invalidateUndo()
    try {
      await breakpoint.flush()
      setMoreOpen(false)
      const result = await convertExtractToDirection({
        extractId: currentCard.id,
        cursor,
        pluginName,
        strategy: "keep_extract",
        direction: "forward"
      })
      if (!result.ok) {
        metricsRef.current.record("action.failure", undefined, { kind: "direction" })
        orca.notify("error", `方向卡失败（${result.step}）：${result.error}`, { title: "渐进阅读" })
        return
      }
      metricsRef.current.record("action.itemize", undefined, { kind: "direction" })
      orca.notify("success", formatDirectionStaySuccess(), { title: "渐进阅读" })
    } catch (error) {
      metricsRef.current.record("action.failure", undefined, { kind: "direction" })
      console.error("[IR Session] 方向卡转化失败:", error)
      orca.notify("error", "方向卡转化失败，摘录已保留", { title: "渐进阅读" })
    }
  })

  const handleArchive = (options?: { nextChapterSchedule?: NextChapterSchedule }) => withWork(async () => {
    if (!currentCard) return
    invalidateUndo()
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
    invalidateUndo()
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
      invalidateUndo()
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
    handleConvertToQA,
    handleConvertToDirection,
    handleArchive,
    handleCompleteRequest,
    handleSkipChapter,
    handleImportanceNudge
  }
}

