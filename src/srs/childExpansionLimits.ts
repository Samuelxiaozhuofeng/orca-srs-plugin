/** 子卡递归展开的限制、校验与用户提示。 */

export const DEFAULT_MAX_CHILD_DEPTH = 10
export const DEFAULT_MAX_AUX_CHILD_CARDS = 200
export const MAX_CHILD_DEPTH_CAP = 100
export const MAX_AUX_CHILD_CARDS_CAP = 10_000

export type ChildExpandLimits = {
  readonly maxDepth: number
  readonly maxAuxChildCards: number
}

export type ChildExpandTruncationReason = "max_depth" | "max_count" | "cycle"

export type ChildExpandDiagnostic = {
  readonly truncated: true
  readonly reason: ChildExpandTruncationReason
  readonly rootKey: string
  readonly depth?: number
  readonly count?: number
  readonly message: string
}

export type ResolveChildExpandLimitsOptions = {
  warn?: (message: string) => void
  defaultMaxDepth?: number
  defaultMaxAuxChildCards?: number
  maxDepthCap?: number
  maxAuxCap?: number
}

export type ResolvedChildExpandLimits = ChildExpandLimits & {
  readonly warnings: readonly string[]
  readonly usedDefaults: boolean
}

export function isValidChildExpandLimit(
  value: unknown,
  maxCap: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maxCap
  )
}

/** 从原始设置解析有限非负整数；无效值告警并回退默认值。 */
export function resolveChildExpandLimits(
  raw: Partial<ChildExpandLimits> | ChildExpandLimits | null | undefined = undefined,
  options: ResolveChildExpandLimitsOptions = {}
): ResolvedChildExpandLimits {
  const warn = options.warn ?? ((message: string) => console.warn(message))
  const defaultMaxDepth = options.defaultMaxDepth ?? DEFAULT_MAX_CHILD_DEPTH
  const defaultMaxAux =
    options.defaultMaxAuxChildCards ?? DEFAULT_MAX_AUX_CHILD_CARDS
  const maxDepthCap = options.maxDepthCap ?? MAX_CHILD_DEPTH_CAP
  const maxAuxCap = options.maxAuxCap ?? MAX_AUX_CHILD_CARDS_CAP
  const warnings: string[] = []
  let usedDefaults = false

  let maxDepth = defaultMaxDepth
  let maxAuxChildCards = defaultMaxAux
  if (raw == null) {
    return Object.freeze({
      maxDepth,
      maxAuxChildCards,
      warnings: Object.freeze(warnings),
      usedDefaults: false
    })
  }

  const rawDepth = raw.maxDepth
  const rawCount = raw.maxAuxChildCards

  if (rawDepth !== undefined) {
    if (!isValidChildExpandLimit(rawDepth, maxDepthCap)) {
      const message =
        `[SRS] 无效的 childExpand.maxDepth=${String(rawDepth)}，` +
        `仅接受 0..${maxDepthCap} 的有限非负整数；已回退默认值 ${defaultMaxDepth}`
      warnings.push(message)
      warn(message)
      usedDefaults = true
    } else {
      maxDepth = rawDepth
    }
  }

  if (rawCount !== undefined) {
    if (!isValidChildExpandLimit(rawCount, maxAuxCap)) {
      const message =
        `[SRS] 无效的 childExpand.maxAuxChildCards=${String(rawCount)}，` +
        `仅接受 0..${maxAuxCap} 的有限非负整数；已回退默认值 ${defaultMaxAux}`
      warnings.push(message)
      warn(message)
      usedDefaults = true
    } else {
      maxAuxChildCards = rawCount
    }
  }

  return Object.freeze({
    maxDepth,
    maxAuxChildCards,
    warnings: Object.freeze(warnings),
    usedDefaults
  })
}

/** 将详细诊断压缩为会话顶部的短提示。 */
export function formatChildExpandWarning(
  diagnostics: readonly ChildExpandDiagnostic[]
): string | null {
  if (diagnostics.length === 0) return null

  const reasons = new Set(diagnostics.map((diagnostic) => diagnostic.reason))
  const limitParts: string[] = []
  if (reasons.has("max_depth")) limitParts.push("深度")
  if (reasons.has("max_count")) limitParts.push("数量")
  const hasCycle = reasons.has("cycle")

  if (limitParts.length === 0 && hasCycle) {
    return `子卡展开遇循环引用，已安全截断（${diagnostics.length} 处）`
  }
  if (limitParts.length > 0 && hasCycle) {
    return `子卡展开已达${limitParts.join("/")}上限或遇循环，部分链路已截断（${diagnostics.length} 处）`
  }
  if (limitParts.length > 0) {
    return `子卡展开已达${limitParts.join("/")}上限，部分链路已截断（${diagnostics.length} 处）`
  }
  return `子卡展开已截断（${diagnostics.length} 处）`
}
