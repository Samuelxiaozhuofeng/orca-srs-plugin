/**
 * 完成 Topic 后「章末小测停留」(postCompleteQuizHold) 期间的交互门闩。
 *
 * 写库已完成：hold 期间不得再产生 ir.* 写入（断点、下一篇 perform、
 * 推后、重要性等）。允许的交互仅：开始小测 / 继续下一篇（只推进 UI）。
 */

export type IRSessionInteractionGuardInput = {
  hasCurrentCard: boolean
  showSummary: boolean
  loadFailed: boolean
  isReviewEntry: boolean
  endGateOpen: boolean
  completeChapterOpen: boolean
  archiveConfirmOpen: boolean
  chapterQuizConfirmOpen: boolean
  postCompleteQuizHold: boolean
  /** 阅读上下文 mode；chapter_browse 本就不写断点 */
  contextMode: string
}

export type IRSessionInteractionGuards = {
  /** useIRReadingBreakpoint.enabled */
  breakpointEnabled: boolean
  /** useIRReadingBreakpoint.allowCapture */
  allowCapture: boolean
  /** useIRReadingEndZone.enabled */
  endZoneEnabled: boolean
  /** useIRShortcuts.enabled */
  shortcutsEnabled: boolean
  /**
   * 会写 ir.* 的排期动作是否可走：
   * 推后 / 重要性 / performNext / 完成归档 / 挖空转化 / 文末门闩分支 等。
   * hold 时为 false；「继续下一篇」只推进 UI，不走此门闩。
   */
  scheduleActionsEnabled: boolean
}

export function resolveIRSessionInteractionGuards(
  input: IRSessionInteractionGuardInput
): IRSessionInteractionGuards {
  const hold = input.postCompleteQuizHold

  return {
    breakpointEnabled:
      input.hasCurrentCard &&
      !input.showSummary &&
      !input.isReviewEntry &&
      !hold,
    allowCapture: input.contextMode !== "chapter_browse" && !hold,
    endZoneEnabled:
      input.hasCurrentCard &&
      !input.showSummary &&
      !input.isReviewEntry &&
      !hold,
    shortcutsEnabled:
      !input.showSummary &&
      !input.loadFailed &&
      !input.isReviewEntry &&
      !input.endGateOpen &&
      !input.completeChapterOpen &&
      !input.archiveConfirmOpen &&
      !input.chapterQuizConfirmOpen &&
      !hold,
    scheduleActionsEnabled: !hold
  }
}
