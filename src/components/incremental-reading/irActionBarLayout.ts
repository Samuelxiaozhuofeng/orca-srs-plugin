/**
 * Pure layout math for the fixed IR reading action bar.
 * Positions against the owning `.ir-reading` panel's visible viewport rectangle.
 */

export type IRActionBarTier = "wide" | "medium" | "narrow"

export type PanelRectLike = {
  top: number
  bottom: number
  right: number
  width: number
}

export type ViewportSize = {
  width: number
  height: number
}

export type IRActionBarLayout = {
  top: number
  right: number
  tier: IRActionBarTier
  inset: number
  /** Right padding applied to `.ir-reading__inner` so the bar does not cover body text. */
  contentSafePadding: number
}

/** Panel width breakpoints (px). */
export const IR_ACTION_BAR_WIDE_MIN = 1040
export const IR_ACTION_BAR_MEDIUM_MIN = 700

const INSET_BY_TIER: Record<IRActionBarTier, number> = {
  wide: 16,
  medium: 8,
  narrow: 4
}

/** Right safe padding on reading inner for medium / narrow tiers. */
const SAFE_PADDING_BY_TIER: Record<IRActionBarTier, number> = {
  wide: 0,
  medium: 82,
  narrow: 58
}

export function resolveIRActionBarTier(panelWidth: number): IRActionBarTier {
  if (panelWidth >= IR_ACTION_BAR_WIDE_MIN) return "wide"
  if (panelWidth >= IR_ACTION_BAR_MEDIUM_MIN) return "medium"
  return "narrow"
}

export function resolveIRActionBarInset(tier: IRActionBarTier): number {
  return INSET_BY_TIER[tier]
}

export function resolveIRActionBarContentSafePadding(tier: IRActionBarTier): number {
  return SAFE_PADDING_BY_TIER[tier]
}

/**
 * Compute fixed `top` / `right` for the action bar from the reading panel rect.
 *
 * - Vertical: midpoint of the panel's intersection with the window viewport.
 * - Horizontal: inset from the panel's right edge (not viewport center / 50vw).
 */
export function computeIRActionBarLayout(
  panelRect: PanelRectLike,
  viewport: ViewportSize
): IRActionBarLayout {
  const tier = resolveIRActionBarTier(panelRect.width)
  const inset = resolveIRActionBarInset(tier)
  const contentSafePadding = resolveIRActionBarContentSafePadding(tier)

  const visibleTop = Math.max(0, panelRect.top)
  const visibleBottom = Math.min(viewport.height, panelRect.bottom)
  const hasVisibleBand = visibleBottom > visibleTop
  const top = hasVisibleBand
    ? (visibleTop + visibleBottom) / 2
    : viewport.height / 2

  const right = Math.max(inset, viewport.width - panelRect.right + inset)

  return { top, right, tier, inset, contentSafePadding }
}
