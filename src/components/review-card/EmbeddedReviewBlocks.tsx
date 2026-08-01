import type { Block, DbId } from "../../orca.d.ts"

const { useEffect, useRef } = window.React
const { useSnapshot } = window.Valtio
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
      <div className="srs-review-face__text">
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
 * 渲染卡根的直接子块作为答案区：每个子块一个 live `<Block>`（initiallyCollapsed={false}
 * 保证复习面板局部展开），子块的 inline 渲染（字体样式、页面引用、标签等）完整保留。
 * **不**挂卡根本身，避免与题目区同 panelId+blockId 双实例抢 selection / 破坏编辑会话
 * （卡根只由题目区 EmbeddedQuestionBlock live 渲染）。
 * 不使用长期 MutationObserver / collapse.click / 宿主 style 重写。
 */
export function EmbeddedAnswerBlock({
  blockId,
  panelId,
  fallback
}: EmbeddedAnswerBlockProps) {
  const { blocks } = useSnapshot(orca.state)
  const block = blockId ? (blocks[blockId] as Block | undefined) : undefined
  const childIds = block?.children ?? []

  if (!blockId || !panelId || childIds.length === 0) {
    return (
      <div className="srs-review-face__text srs-review-face__text--answer">
        {fallback}
      </div>
    )
  }

  return (
    <div
      className="srs-answer-block"
      data-orca-block-root="true"
    >
      {childIds.map((childId) => (
        <Block
          key={childId}
          panelId={panelId}
          blockId={childId}
          blockLevel={1}
          indentLevel={1}
          initiallyCollapsed={false}
        />
      ))}
    </div>
  )
}
