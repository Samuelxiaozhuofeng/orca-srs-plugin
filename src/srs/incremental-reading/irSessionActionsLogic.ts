/**
 * 会话动作纯逻辑：与 UI 解耦，便于组件行为测试
 */

export type IRSessionActionKind =
  | "next"
  | "extract"
  | "itemize"
  | "postpone"
  | "archive"
  | "delete"
  | "priority"

export type IRSessionActionResult =
  | { ok: true; leavesCard: boolean; kind: IRSessionActionKind }
  | { ok: false; kind: IRSessionActionKind; error: string; leavesCard: false }

export function describePrimaryActions(cardType: "topic" | "extracts"): string[] {
  // 主界面不超过 3 个高频动作
  if (cardType === "topic") {
    return ["next", "extract", "postpone"]
  }
  return ["next", "itemize", "postpone"]
}

export function shouldLeaveCardAfterAction(kind: IRSessionActionKind): boolean {
  return kind === "next" || kind === "postpone" || kind === "archive" || kind === "delete" || kind === "itemize"
}

export function buildActionSuccess(kind: IRSessionActionKind): IRSessionActionResult {
  return {
    ok: true,
    kind,
    leavesCard: shouldLeaveCardAfterAction(kind)
  }
}

export function buildActionFailure(kind: IRSessionActionKind, error: string): IRSessionActionResult {
  return {
    ok: false,
    kind,
    error,
    leavesCard: false
  }
}

/**
 * 制卡失败时不得离开当前 Extract，也不应清除其 IR 身份。
 */
export function resolveItemizeFailure(
  extractStillExists: boolean,
  irStateIntact: boolean,
  error: string
): IRSessionActionResult & { preserveExtract: boolean } {
  const base = buildActionFailure("itemize", error)
  return {
    ...base,
    preserveExtract: extractStillExists && irStateIntact
  }
}
