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
        {/* 复习面板局部展开：不沿用原笔记折叠态，否则题目不可见；不写 block 属性 */}
        <Block
          panelId={panelId}
          blockId={blockId}
          blockLevel={0}
          indentLevel={0}
          initiallyCollapsed={false}
        />
      </div>
    </>
  )
}

type EmbeddedAnswerBlockProps = EmbeddedQuestionBlockProps

/**
 * 渲染完整父块树，父正文/句柄由 CSS 精确隐藏（见 srs-review.css），
 * 不使用长期 MutationObserver / collapse.click / 宿主 style 重写，避免破坏编辑会话。
 */
export function EmbeddedAnswerBlock({
  blockId,
  panelId,
  fallback
}: EmbeddedAnswerBlockProps) {
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
