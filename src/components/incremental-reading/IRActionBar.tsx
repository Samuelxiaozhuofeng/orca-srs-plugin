/**
 * 右侧竖排阅读动作栏：返回(可选)、下一篇、摘录|记住、重要性、更多。
 * position:fixed，跟随所属 `.ir-reading` 面板的可视区域垂直居中，
 * 并按面板宽度三档（wide / medium / narrow）缩放；不覆盖正文。
 */

import {
  computeIRActionBarLayout,
  type IRActionBarTier
} from "./irActionBarLayout"

const { Button } = orca.components
const { useLayoutEffect, useRef, useState } = window.React

export type IRActionBarProps = {
  isTopic: boolean
  isWorking?: boolean
  onNext: () => void
  onExtract?: () => void
  onItemize?: () => void
  onImportance: () => void
  importanceOpen?: boolean
  /** Compact tier label for the importance control, e.g. 低/中/高 */
  importanceTierLabel?: string
  onMore: () => void
  moreOpen?: boolean
  /** Chapter browse mode: show return-to-excerpt control (parent via shouldShowReturnButton). */
  showReturn?: boolean
  onReturn?: () => void
}

const CSS_TOP = "--ir-action-bar-top"
const CSS_RIGHT = "--ir-action-bar-right"
const CSS_WIDTH = "--ir-action-bar-width"
const CSS_SAFE = "--ir-content-safe-right"
const TIER_ATTR = "irActionBarTier"

function clearPanelActionBarChrome(panel: HTMLElement): void {
  panel.style.removeProperty(CSS_TOP)
  panel.style.removeProperty(CSS_RIGHT)
  panel.style.removeProperty(CSS_WIDTH)
  panel.style.removeProperty(CSS_SAFE)
  delete panel.dataset[TIER_ATTR]
}

function applyPanelActionBarChrome(
  panel: HTMLElement,
  footer: HTMLElement,
  tier: IRActionBarTier,
  top: number,
  right: number,
  contentSafePadding: number
): void {
  panel.dataset[TIER_ATTR] = tier
  panel.style.setProperty(CSS_TOP, `${top}px`)
  panel.style.setProperty(CSS_RIGHT, `${right}px`)
  panel.style.setProperty(CSS_SAFE, `${contentSafePadding}px`)

  const fallbackWidth = tier === "narrow" ? 38 : tier === "medium" ? 58 : 80
  const measured = footer.getBoundingClientRect().width
  const barWidth = measured > 0 ? measured : fallbackWidth
  panel.style.setProperty(CSS_WIDTH, `${barWidth}px`)
}

export default function IRActionBar({
  isTopic,
  isWorking,
  onNext,
  onExtract,
  onItemize,
  onImportance,
  importanceOpen,
  importanceTierLabel,
  onMore,
  moreOpen,
  showReturn = false,
  onReturn
}: IRActionBarProps) {
  const footerRef = useRef<HTMLDivElement | null>(null)
  const [tier, setTier] = useState<IRActionBarTier>("wide")
  const style = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined
  const compact = tier === "narrow"

  useLayoutEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const panel = footer.closest(".ir-reading") as HTMLElement | null
    if (!panel) {
      console.warn("[IRActionBar] 未找到所属 .ir-reading 容器，动作栏将使用默认定位")
      return
    }

    let frame = 0
    let warnedMissing = false

    const update = () => {
      const host = footer.closest(".ir-reading") as HTMLElement | null
      if (!host) {
        if (!warnedMissing) {
          console.warn("[IRActionBar] 所属 .ir-reading 容器已丢失")
          warnedMissing = true
        }
        return
      }
      warnedMissing = false

      const rect = host.getBoundingClientRect()
      const layout = computeIRActionBarLayout(
        {
          top: rect.top,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width
        },
        { width: window.innerWidth, height: window.innerHeight }
      )

      applyPanelActionBarChrome(
        host,
        footer,
        layout.tier,
        layout.top,
        layout.right,
        layout.contentSafePadding
      )
      setTier((prev: IRActionBarTier) => (prev === layout.tier ? prev : layout.tier))
    }

    const scheduleUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }

    update()

    const ro = new ResizeObserver(scheduleUpdate)
    ro.observe(panel)

    window.addEventListener("resize", scheduleUpdate)
    // Capture phase: nested scroll containers (e.g. .ir-reading__scroll) bubble here.
    window.addEventListener("scroll", scheduleUpdate, true)

    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener("resize", scheduleUpdate)
      vv.addEventListener("scroll", scheduleUpdate)
    }

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      ro.disconnect()
      window.removeEventListener("resize", scheduleUpdate)
      window.removeEventListener("scroll", scheduleUpdate, true)
      if (vv) {
        vv.removeEventListener("resize", scheduleUpdate)
        vv.removeEventListener("scroll", scheduleUpdate)
      }
      clearPanelActionBarChrome(panel)
    }
  }, [])

  // Compact labels / optional return control change footer width; remeasure for secondary menus.
  useLayoutEffect(() => {
    const footer = footerRef.current
    if (!footer) return
    const panel = footer.closest(".ir-reading") as HTMLElement | null
    if (!panel) return
    const measured = footer.getBoundingClientRect().width
    if (measured > 0) {
      panel.style.setProperty(CSS_WIDTH, `${measured}px`)
    }
  }, [tier, showReturn, importanceTierLabel, importanceOpen, moreOpen])

  const returnLabel = compact ? "↩" : "返回"
  const nextLabel = compact ? "→" : "下一篇"
  const secondLabel = compact ? "+" : isTopic ? "摘录" : "记住"
  const importanceLabel = compact
    ? (importanceTierLabel ?? "中")
    : "重要性"
  const moreLabel = compact ? "⋯" : moreOpen ? "收起" : "更多"

  return (
    <div
      ref={footerRef}
      className="ir-reading__footer"
      role="toolbar"
      aria-label="阅读动作"
      data-ir-action-bar-tier={tier}
    >
      <div className="ir-reading__footer-inner">
        {showReturn ? (
          <Button
            tabIndex={0}
            variant="outline"
            onClick={isWorking ? undefined : onReturn}
            onMouseDown={(e: { preventDefault: () => void }) => e.preventDefault()}
            style={style}
            aria-disabled={isWorking}
            aria-label="返回摘录"
            title="返回摘录"
          >
            {returnLabel}
          </Button>
        ) : null}
        <Button
          tabIndex={0}
          variant="solid"
          onClick={isWorking ? undefined : onNext}
          onMouseDown={(e: { preventDefault: () => void }) => e.preventDefault()}
          style={style}
          aria-disabled={isWorking}
          aria-label="下一篇"
          title="下一篇 Enter"
        >
          {nextLabel}
        </Button>
        {isTopic ? (
          <Button
            tabIndex={0}
            variant="plain"
            onClick={isWorking ? undefined : onExtract}
            onMouseDown={(e: { preventDefault: () => void }) => e.preventDefault()}
            style={style}
            aria-disabled={isWorking}
            aria-label="摘录"
            title="摘录 Alt+X"
          >
            {secondLabel}
          </Button>
        ) : (
          <Button
            tabIndex={0}
            variant="plain"
            onClick={isWorking ? undefined : onItemize}
            onMouseDown={(e: { preventDefault: () => void }) => e.preventDefault()}
            style={style}
            aria-disabled={isWorking}
            aria-label="记住"
            title="记住 Alt+Z"
          >
            {secondLabel}
          </Button>
        )}
        <Button
          tabIndex={0}
          variant="plain"
          data-ir-importance-toggle=""
          onClick={isWorking ? undefined : onImportance}
          onMouseDown={(e: { preventDefault: () => void }) => e.preventDefault()}
          style={style}
          aria-disabled={isWorking}
          aria-expanded={importanceOpen}
          aria-label="重要性"
          title="重要性 Alt+P"
        >
          {importanceLabel}
        </Button>
        <Button
          tabIndex={0}
          variant="outline"
          data-ir-more-toggle=""
          onClick={isWorking ? undefined : onMore}
          onMouseDown={(e: { preventDefault: () => void }) => e.preventDefault()}
          style={style}
          aria-disabled={isWorking}
          aria-expanded={moreOpen}
          aria-label={moreOpen ? "收起更多操作" : "更多操作"}
          title="更多操作"
        >
          {moreLabel}
        </Button>
      </div>
    </div>
  )
}
