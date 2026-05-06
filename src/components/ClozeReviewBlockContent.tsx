import type { DbId } from "../orca.d.ts"

const { useEffect, useMemo, useRef } = window.React
const { Block } = orca.components

type ClozeReviewBlockContentProps = {
  blockId: DbId
  panelId?: string
  showAnswer: boolean
  clozeNumber?: number
  fallback: React.ReactNode
}

const ROOT_BLOCK_SELECTOR = ":scope > .orca-block"
const ROOT_CLOZE_SELECTOR = `
  .srs-cloze-review-block > .orca-block > .orca-repr > .orca-repr-main .srs-cloze-inline
`
const ROOT_CHILDREN_SELECTOR = `
  :scope > .orca-block-children,
  :scope > .orca-repr-children,
  :scope > .orca-repr > .orca-block-children,
  :scope > .orca-repr > .orca-repr-children,
  :scope > .orca-repr [data-role='children'],
  :scope > .orca-repr [data-testid='children']
`
const ROOT_COLLAPSE_SELECTOR = `
  :scope > .orca-repr > .orca-repr-collapse,
  :scope > .orca-repr [data-role='collapse'],
  :scope > .orca-repr [data-testid='collapse']
`

function getCollapsedState(el: Element): boolean | null {
  const ariaExpanded = el.getAttribute("aria-expanded")
  if (ariaExpanded === "false") return true
  if (ariaExpanded === "true") return false

  const dataState = el.getAttribute("data-state")
  if (dataState === "closed") return true
  if (dataState === "open") return false

  const dataCollapsed = el.getAttribute("data-collapsed")
  if (dataCollapsed === "true") return true
  if (dataCollapsed === "false") return false

  if (
    el.classList.contains("collapsed") ||
    el.classList.contains("is-collapsed")
  ) {
    return true
  }

  return null
}

function showChildrenContainer(node: HTMLElement) {
  node.style.display = ""
  node.style.visibility = ""
  node.hidden = false
}

function hideChildrenContainer(node: HTMLElement) {
  node.style.display = "none"
  node.hidden = true
}

/**
 * Renders the original Orca block inside the Cloze review card so host inline
 * renderers keep handling page refs, inline code, bold text, and other rich text.
 */
export default function ClozeReviewBlockContent({
  blockId,
  panelId,
  showAnswer,
  clozeNumber,
  fallback
}: ClozeReviewBlockContentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !panelId) return

    const syncRootChildrenVisibility = () => {
      const rootBlock = container.querySelector<HTMLElement>(ROOT_BLOCK_SELECTOR)
      if (!rootBlock) return

      const childrenNodes = rootBlock.querySelectorAll<HTMLElement>(ROOT_CHILDREN_SELECTOR)
      if (childrenNodes.length > 0) {
        childrenNodes.forEach(showAnswer ? showChildrenContainer : hideChildrenContainer)
        return
      }

      if (!showAnswer) return

      const collapseEl = rootBlock.querySelector<HTMLElement>(ROOT_COLLAPSE_SELECTOR)
      if (collapseEl && getCollapsedState(collapseEl) !== false) {
        collapseEl.click()
      }
    }

    syncRootChildrenVisibility()

    const observer = new MutationObserver((mutations) => {
      const shouldCheck = mutations.some((mutation) => (
        mutation.type === "childList" && mutation.addedNodes.length > 0
      ))
      if (shouldCheck) {
        syncRootChildrenVisibility()
      }
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    })

    return () => {
      observer.disconnect()
    }
  }, [panelId, blockId, showAnswer])

  const clozeSelector = useMemo(() => {
    if (typeof clozeNumber === "number") {
      return `.srs-cloze-review-block[data-show-answer="false"] > .orca-block > .orca-repr > .orca-repr-main .srs-cloze-inline[data-cloze-number="${clozeNumber}"]`
    }
    return `.srs-cloze-review-block[data-show-answer="false"] > .orca-block > .orca-repr > .orca-repr-main .srs-cloze-inline`
  }, [clozeNumber])

  if (!panelId) {
    return (
      <div
        style={{
          whiteSpace: "pre-wrap",
          userSelect: "text",
          WebkitUserSelect: "text"
        }}
      >
        {fallback}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="srs-cloze-review-block"
      data-show-answer={showAnswer ? "true" : "false"}
      data-orca-block-root="true"
    >
      <style>{`
        .srs-cloze-review-block .orca-block,
        .srs-cloze-review-block .orca-repr-main {
          max-width: 100%;
        }

        ${ROOT_CLOZE_SELECTOR} {
          background-color: var(--orca-color-primary-1) !important;
          color: var(--orca-color-primary-5) !important;
          font-weight: 600 !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          border-bottom: 2px solid var(--orca-color-primary-5) !important;
        }

        ${clozeSelector} {
          color: transparent !important;
          font-size: 0 !important;
          border-bottom: 0 !important;
          background-color: var(--orca-color-bg-2) !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          border: 1px dashed var(--orca-color-border-1) !important;
          vertical-align: baseline;
        }

        ${clozeSelector}::after {
          content: "[...]";
          color: var(--orca-color-text-2);
          font-size: 16px;
          font-weight: 500;
          line-height: 1.2;
        }
      `}</style>
      <Block
        panelId={panelId}
        blockId={blockId}
        blockLevel={0}
        indentLevel={0}
      />
    </div>
  )
}
