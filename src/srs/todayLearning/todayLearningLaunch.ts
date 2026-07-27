/**
 * 今日学习启动路由：按受信任的精确 remaining 决定 mixed / 独立 SRS / 只读 IR。
 * remaining 为 null 表示该侧不可信（加载失败/partial），不得当 0 用。
 */

export type TodayLearningLaunchDecision =
  | { kind: "mixed" }
  | { kind: "srs-independent" }
  | { kind: "ir-read-only" }
  | { kind: "none" }

export type TodayLearningTrustedRemaining = {
  readonly ir: number | null
  readonly srs: number | null
}

function isExactNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isExactPositive(value: number | null | undefined): boolean {
  return isExactNumber(value) && value > 0
}

/**
 * 纯路由决策（新鲜开始与 IR-marker 继续共用）。
 *
 * - 两侧都是精确 number（含 0），且至少一侧 > 0 → mixed 统一工作区
 * - 仅 SRS 精确且 > 0、IR 为 null → 独立 startReviewSession
 * - 仅 IR 精确且 > 0、SRS 为 null → IR 工作区 read-only
 * - 无受信任正任务 → 不启动
 */
export function decideTodayLearningLaunch(
  remaining: TodayLearningTrustedRemaining
): TodayLearningLaunchDecision {
  const irExact = isExactNumber(remaining.ir)
  const srsExact = isExactNumber(remaining.srs)
  const irPos = isExactPositive(remaining.ir)
  const srsPos = isExactPositive(remaining.srs)

  if (irExact && srsExact) {
    if (irPos || srsPos) return { kind: "mixed" }
    return { kind: "none" }
  }

  if (srsPos && remaining.ir == null) {
    return { kind: "srs-independent" }
  }

  if (irPos && remaining.srs == null) {
    return { kind: "ir-read-only" }
  }

  // 一侧 exact 0、另一侧 null：无正任务
  if (irPos || srsPos) {
    // 理论上 irPos 且 srs exact 0 已在双 exact 分支；此处兜底
    if (irExact && srsExact) return { kind: "mixed" }
    if (srsPos && irExact) return { kind: "mixed" }
    if (irPos && srsExact) return { kind: "mixed" }
  }

  return { kind: "none" }
}
