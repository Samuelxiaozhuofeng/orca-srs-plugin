/**
 * 「读到文末」确认门闩（纯逻辑 + 文案）
 *
 * 定义（本版落地的探测信号）：
 * - `bottom`：滚动 owner 触底（`scrollTop + clientHeight >= scrollHeight - ε`）
 * - `fits`：全文一屏装下（`scrollHeight <= clientHeight + ε`），视为已见末尾
 * 离开末区（往回滚）即取消门闩：`enteredAt` 归零，重新进入才重新计时。
 *
 * 停留时长是必需条件，用于压掉「扫一眼就走」的误报——短摘录几乎都能一屏装下，
 * 没有停留门槛会把主路径（下一篇）变成每篇一次确认。
 *
 * 边界：未读到文末与非「下一篇」的动作（摘录 / 挖空 / 重要性 / 推后）一律不拦截。
 */

/** 触底判定容差（px） */
export const END_OF_CONTENT_EPSILON_PX = 24

/** 进入末区后至少停留多久才允许弹确认（ms） */
export const END_ZONE_DWELL_MS = 4000

export type EndZoneMetrics = {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

/** null 表示不在末区 */
export type EndZoneReason = "bottom" | "fits" | null

export function resolveEndZoneReason(
  metrics: EndZoneMetrics,
  epsilonPx: number = END_OF_CONTENT_EPSILON_PX
): EndZoneReason {
  const { scrollTop, clientHeight, scrollHeight } = metrics
  if (
    !Number.isFinite(scrollTop) ||
    !Number.isFinite(clientHeight) ||
    !Number.isFinite(scrollHeight) ||
    clientHeight <= 0
  ) {
    return null
  }
  if (scrollHeight <= clientHeight + epsilonPx) return "fits"
  if (scrollTop + clientHeight >= scrollHeight - epsilonPx) return "bottom"
  return null
}

export type EndZoneState = {
  reason: EndZoneReason
  /** 进入末区的时间戳；不在末区时为 null */
  enteredAt: number | null
}

/**
 * 依据新一次测量推进末区状态：进入时开始计时，离开时清零，持续在末区则保留原计时。
 * `fits` 与 `bottom` 之间切换（内容展开/收起）不重置计时——用户始终看得到末尾。
 */
export function advanceEndZoneState(
  previous: EndZoneState,
  reason: EndZoneReason,
  now: number
): EndZoneState {
  if (reason === null) return { reason: null, enteredAt: null }
  if (previous.reason === null || previous.enteredAt == null) {
    return { reason, enteredAt: now }
  }
  return { reason, enteredAt: previous.enteredAt }
}

/**
 * 是否应在「下一篇」前弹确认。
 * `suppressed` 为会话级一次性抑制：用户已明确处理过一次门闩后不再反复打断。
 */
export function shouldGateNext(params: {
  state: EndZoneState
  now: number
  suppressed: boolean
  dwellMsRequired?: number
}): boolean {
  const { state, now, suppressed } = params
  if (suppressed) return false
  if (state.reason === null || state.enteredAt == null) return false
  const required = params.dwellMsRequired ?? END_ZONE_DWELL_MS
  return now - state.enteredAt >= required
}

export function formatEndOfContentTitle(): string {
  return "看起来你已经读到这篇的末尾"
}

/** 主推「以后再复习」，次推「完成」，避免误归档 */
export function formatEndOfContentLaterHint(isSequentialActive: boolean): string {
  return isSequentialActive
    ? "以后再复习：保存阅读位置，本章按当前节奏再次回到队列。"
    : "以后再复习：保存阅读位置，间隔增长后再回到队列。"
}

export function formatEndOfContentCompleteHint(isSequentialActive: boolean): string {
  return isSequentialActive
    ? "完成，移出队列：完成本章并解锁下一章（仍会再确认解锁时间）。"
    : "完成，移出队列：退出本条阅读队列，正文与已有卡片保留（仍会再确认）。"
}

export const END_OF_CONTENT_LATER_LABEL = "以后再复习"
export const END_OF_CONTENT_COMPLETE_LABEL = "完成，移出队列"
export const END_OF_CONTENT_CANCEL_LABEL = "取消"
