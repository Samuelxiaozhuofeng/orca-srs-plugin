/**
 * ir.stage 真实动作推进（不阻止用户操作，仅推荐/统计）
 */

import type { IRLastAction, IRStage } from "./irTypes"

export type StageTriggerAction =
  | "next"
  | "extract"
  | "edit_leave"
  | "open_card_tools"
  | "cancel_itemize"
  | "itemize"
  | "archive"
  | "complete"

export type StageTransitionResult = {
  nextStage: IRStage | null
  /** null 表示清除 IR 阶段（归档/完成转化） */
  clearIR: boolean
  lastAction: IRLastAction
}

const STAGE_TABLE: Record<string, Partial<Record<StageTriggerAction, StageTransitionResult>>> = {
  "topic.preview": {
    next: { nextStage: "topic.work", clearIR: false, lastAction: "next" },
    extract: { nextStage: "topic.work", clearIR: false, lastAction: "extract" },
    archive: { nextStage: null, clearIR: true, lastAction: "complete" }
  },
  "topic.work": {
    next: { nextStage: "topic.work", clearIR: false, lastAction: "next" },
    extract: { nextStage: "topic.work", clearIR: false, lastAction: "extract" },
    archive: { nextStage: null, clearIR: true, lastAction: "complete" }
  },
  "extract.raw": {
    edit_leave: { nextStage: "extract.refined", clearIR: false, lastAction: "refine" },
    next: { nextStage: "extract.raw", clearIR: false, lastAction: "next" },
    open_card_tools: { nextStage: "extract.item_candidate", clearIR: false, lastAction: "itemize" },
    itemize: { nextStage: null, clearIR: true, lastAction: "itemize" },
    archive: { nextStage: null, clearIR: true, lastAction: "complete" }
  },
  "extract.refined": {
    open_card_tools: { nextStage: "extract.item_candidate", clearIR: false, lastAction: "itemize" },
    next: { nextStage: "extract.refined", clearIR: false, lastAction: "next" },
    itemize: { nextStage: null, clearIR: true, lastAction: "itemize" },
    archive: { nextStage: null, clearIR: true, lastAction: "complete" }
  },
  "extract.item_candidate": {
    cancel_itemize: { nextStage: "extract.refined", clearIR: false, lastAction: "refine" },
    itemize: { nextStage: null, clearIR: true, lastAction: "itemize" },
    next: { nextStage: "extract.item_candidate", clearIR: false, lastAction: "next" },
    archive: { nextStage: null, clearIR: true, lastAction: "complete" }
  }
}

export function advanceIRStage(
  current: IRStage | string,
  action: StageTriggerAction
): StageTransitionResult {
  const row = STAGE_TABLE[current]
  const hit = row?.[action]
  if (hit) return hit

  if (action === "archive" || action === "complete" || action === "itemize") {
    return { nextStage: null, clearIR: true, lastAction: action === "itemize" ? "itemize" : "complete" }
  }

  return {
    nextStage: current as IRStage,
    clearIR: false,
    lastAction: action === "extract" ? "extract" : action === "next" ? "next" : "read"
  }
}

export function initialStageForCardType(cardType: "topic" | "extracts"): IRStage {
  return cardType === "extracts" ? "extract.raw" : "topic.preview"
}
