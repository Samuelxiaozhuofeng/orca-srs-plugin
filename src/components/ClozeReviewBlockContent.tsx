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

const CHILDREN_SELECTOR = `
  .orca-block-children,
  .orca-repr-children,
  [data-role='children'],
  [data-testid='children']
`

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

    const removeChildrenContainers = () => {
      const childrenNodes = container.querySelectorAll<HTMLElement>(CHILDREN_SELECTOR)
      childrenNodes.forEach((node: HTMLElement) => {
        node.remove()
      })
    }

    removeChildrenContainers()

    const observer = new MutationObserver((mutations) => {
      const shouldCheck = mutations.some((mutation) => (
        mutation.type === "childList" && mutation.addedNodes.length > 0
      ))
      if (shouldCheck) {
        removeChildrenContainers()
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
  }, [panelId, blockId])

  const clozeSelector = useMemo(() => {
    if (typeof clozeNumber === "number") {
      return `.srs-cloze-review-block[data-show-answer="false"] .srs-cloze-inline[data-cloze-number="${clozeNumber}"]`
    }
    return `.srs-cloze-review-block[data-show-answer="false"] .srs-cloze-inline`
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

        .srs-cloze-review-block .srs-cloze-inline {
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
