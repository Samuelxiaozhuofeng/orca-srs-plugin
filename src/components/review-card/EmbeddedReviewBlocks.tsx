import type { DbId } from "../../orca.d.ts"

const { useEffect, useRef } = window.React
const { Block, BlockBreadcrumb } = orca.components

type EmbeddedQuestionBlockProps = {
  blockId?: DbId
  panelId?: string
  fallback: string
}

/** 渲染题目父块，并移除其子块 DOM，避免答案与光标进入题目区域。 */
export function EmbeddedQuestionBlock({
  blockId,
  panelId,
  fallback
}: EmbeddedQuestionBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !blockId) return

    const childrenSelector = [
      ".orca-block-children",
      ".orca-repr-children",
      "[data-role='children']",
      "[data-testid='children']"
    ].join(", ")
    const removeChildrenContainers = () => {
      container.querySelectorAll<HTMLElement>(childrenSelector).forEach((node: HTMLElement) => {
        node.remove()
      })
    }

    removeChildrenContainers()
    const observer = new MutationObserver((mutations) => {
      const mayContainChildren = mutations.some(
        (mutation) => mutation.type === "childList" && mutation.addedNodes.length > 0
      )
      if (mayContainChildren) removeChildrenContainers()
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [blockId])

  if (!blockId || !panelId) {
    return (
      <div style={{
        padding: "12px",
        fontSize: "16px",
        color: "var(--orca-color-text-1)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap"
      }}>
        {fallback}
      </div>
    )
  }

  return (
    <>
      <BlockBreadcrumb key={blockId} blockId={blockId} />
      <div
        ref={containerRef}
        className="srs-question-block"
        data-orca-block-root="true"
      >
        <Block panelId={panelId} blockId={blockId} blockLevel={0} indentLevel={0} />
      </div>
    </>
  )
}

type EmbeddedAnswerBlockProps = EmbeddedQuestionBlockProps

/** 渲染完整父块，但隐藏父块内容，只保留可编辑的答案子块层级。 */
export function EmbeddedAnswerBlock({
  blockId,
  panelId,
  fallback
}: EmbeddedAnswerBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !blockId) return

    const getCollapsedState = (element: Element): boolean | null => {
      const ariaExpanded = element.getAttribute("aria-expanded")
      if (ariaExpanded === "false") return true
      if (ariaExpanded === "true") return false
      const dataState = element.getAttribute("data-state")
      if (dataState === "closed") return true
      if (dataState === "open") return false
      const dataCollapsed = element.getAttribute("data-collapsed")
      if (dataCollapsed === "true") return true
      if (dataCollapsed === "false") return false
      if (
        element.classList.contains("collapsed") ||
        element.classList.contains("is-collapsed")
      ) return true
      return null
    }

    const ensureChildrenVisible = () => {
      const rootBlock = container.querySelector<HTMLElement>(":scope > .orca-block")
      if (rootBlock) {
        const children = rootBlock.querySelector<HTMLElement>(
          ":scope > .orca-block-children, :scope > .orca-repr-children, " +
          ":scope [data-role='children'], :scope [data-testid='children']"
        )
        if (children) {
          children.style.display = ""
          children.style.visibility = ""
          children.hidden = false
        } else {
          const collapse = rootBlock.querySelector<HTMLElement>(
            ":scope > .orca-repr > .orca-repr-collapse, " +
            ":scope > .orca-repr [data-role='collapse'], " +
            ":scope > .orca-repr [data-testid='collapse']"
          )
          if (collapse && getCollapsedState(collapse) !== false) collapse.click()
        }
      }

      container.querySelectorAll<HTMLElement>(
        ".orca-block-children, .orca-repr-children, " +
        "[data-role='children'], [data-testid='children']"
      ).forEach((node: HTMLElement) => {
        node.style.display = ""
        node.style.visibility = ""
        node.hidden = false
      })
    }

    const hideParentContent = () => {
      ensureChildrenVisible()
      const mainContent = container.querySelector<HTMLElement>(
        ":scope > .orca-block > .orca-repr > .orca-repr-main"
      )
      if (mainContent) mainContent.style.display = "none"

      container.querySelectorAll<HTMLElement>([
        ":scope > .orca-block > .orca-block-handle",
        ":scope > .orca-block > .orca-block-bullet",
        ":scope > .orca-block > .orca-repr > .orca-repr-handle",
        ":scope > .orca-block > .orca-repr > .orca-repr-collapse"
      ].join(", ")).forEach((node: HTMLElement) => {
        node.style.display = "none"
        node.style.width = "0"
        node.style.height = "0"
        node.style.overflow = "hidden"
      })
    }

    const scheduleHide = () => {
      if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        hideParentContent()
        debounceTimerRef.current = null
      }, 100)
    }

    hideParentContent()
    const observer = new MutationObserver(scheduleHide)
    observer.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [blockId])

  if (!blockId || !panelId) {
    return (
      <div style={{
        padding: "12px",
        fontSize: "20px",
        fontWeight: "500",
        color: "var(--orca-color-text-1)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap"
      }}>
        {fallback}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="srs-answer-block"
      style={{ marginLeft: "-25.6px" }}
      data-orca-block-root="true"
    >
      <Block
        panelId={panelId}
        blockId={blockId}
        blockLevel={0}
        indentLevel={0}
        initiallyCollapsed={false}
      />
    </div>
  )
}
