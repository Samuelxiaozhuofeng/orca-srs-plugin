import type { DbId } from "../../../orca.d.ts"
import type { IRWorkspaceMode } from "./irWorkspaceTypes"
import type { IRSessionLaunchMode } from "./irSessionLaunchMode"

export const IR_WORKSPACE_MODE_EVENT = "orca-srs:ir-workspace-mode"

/**
 * 一次性启动请求：兼容旧 API（仅 mode），并可携带 autoStart + mixed。
 * 消费后即清除；不得残留跨次启动。
 */
export type IRWorkspaceLaunchRequest = {
  mode: IRWorkspaceMode
  autoStart?: boolean
  sessionLaunchMode?: IRSessionLaunchMode
}

export type IRWorkspaceModeEventDetail = {
  panelId: string
  mode: IRWorkspaceMode
  /** 完整请求（含 autoStart 等）；旧事件可能仅有 mode */
  request?: IRWorkspaceLaunchRequest
}

const pendingRequests = new Map<string, IRWorkspaceLaunchRequest>()
const pendingRequestsByBlockId = new Map<DbId, IRWorkspaceLaunchRequest>()

function normalizeLaunchRequest(
  modeOrRequest: IRWorkspaceMode | IRWorkspaceLaunchRequest
): IRWorkspaceLaunchRequest {
  if (typeof modeOrRequest === "string") {
    return { mode: modeOrRequest }
  }
  const request: IRWorkspaceLaunchRequest = { mode: modeOrRequest.mode }
  if (modeOrRequest.autoStart === true) {
    request.autoStart = true
  }
  if (modeOrRequest.sessionLaunchMode !== undefined) {
    request.sessionLaunchMode = modeOrRequest.sessionLaunchMode
  }
  return request
}

/** @deprecated 优先 setPendingIRWorkspaceLaunch；保留 mode 字符串 API 兼容 */
export function setPendingIRWorkspaceMode(
  panelId: string,
  mode: IRWorkspaceMode
): void {
  setPendingIRWorkspaceLaunch(panelId, { mode })
}

export function setPendingIRWorkspaceLaunch(
  panelId: string,
  modeOrRequest: IRWorkspaceMode | IRWorkspaceLaunchRequest
): void {
  pendingRequests.set(panelId, normalizeLaunchRequest(modeOrRequest))
}

export function clearPendingIRWorkspaceMode(panelId: string): void {
  pendingRequests.delete(panelId)
}

/** @deprecated 优先 setPendingIRWorkspaceLaunchForBlock */
export function setPendingIRWorkspaceModeForBlock(
  blockId: DbId,
  mode: IRWorkspaceMode
): void {
  setPendingIRWorkspaceLaunchForBlock(blockId, { mode })
}

export function setPendingIRWorkspaceLaunchForBlock(
  blockId: DbId,
  modeOrRequest: IRWorkspaceMode | IRWorkspaceLaunchRequest
): void {
  pendingRequestsByBlockId.set(blockId, normalizeLaunchRequest(modeOrRequest))
}

export function clearPendingIRWorkspaceModeForBlock(blockId: DbId): void {
  pendingRequestsByBlockId.delete(blockId)
}

export function movePendingIRWorkspaceModeToPanel(
  blockId: DbId,
  panelId: string
): void {
  const request = pendingRequestsByBlockId.get(blockId)
  if (!request) return
  pendingRequestsByBlockId.delete(blockId)
  pendingRequests.set(panelId, request)
}

/**
 * 一次性消费 pending launch request。
 * 无 pending 时返回仅含 fallback mode 的请求（无 autoStart）。
 */
export function consumePendingIRWorkspaceLaunch(
  panelId: string,
  blockId: DbId | undefined,
  fallback: IRWorkspaceMode
): IRWorkspaceLaunchRequest {
  if (pendingRequests.has(panelId)) {
    const request = pendingRequests.get(panelId)!
    pendingRequests.delete(panelId)
    if (blockId !== undefined) {
      pendingRequestsByBlockId.delete(blockId)
    }
    return request
  }

  if (blockId !== undefined && pendingRequestsByBlockId.has(blockId)) {
    const request = pendingRequestsByBlockId.get(blockId)!
    pendingRequestsByBlockId.delete(blockId)
    return request
  }

  return { mode: fallback }
}

/** 兼容旧调用：只返回 mode */
export function consumePendingIRWorkspaceMode(
  panelId: string,
  blockId: DbId | undefined,
  fallback: IRWorkspaceMode
): IRWorkspaceMode {
  return consumePendingIRWorkspaceLaunch(panelId, blockId, fallback).mode
}

export function dispatchIRWorkspaceMode(
  panelId: string,
  mode: IRWorkspaceMode
): void {
  dispatchIRWorkspaceLaunch(panelId, { mode })
}

export function dispatchIRWorkspaceLaunch(
  panelId: string,
  modeOrRequest: IRWorkspaceMode | IRWorkspaceLaunchRequest
): void {
  const request = normalizeLaunchRequest(modeOrRequest)
  window.dispatchEvent(
    new CustomEvent<IRWorkspaceModeEventDetail>(IR_WORKSPACE_MODE_EVENT, {
      detail: { panelId, mode: request.mode, request }
    })
  )
}
