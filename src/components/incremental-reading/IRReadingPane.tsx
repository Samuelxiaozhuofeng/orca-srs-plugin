/**
 * 正文优先阅读区：弱化面包屑，上下文可折叠，单一滚动由外层承担
 */

import type { DbId } from "../../orca.d.ts"
import IncrementalReadingBreadcrumb from "../IncrementalReadingBreadcrumb"
import { expandReadingModeBlocks } from "./irReadingExpand"

const { useEffect, useState } = window.React
const { Block: OrcaBlock } = orca.components

type Props = {
  cardId: DbId
  panelId: string
  cardType: "topic" | "extracts"
  previewBlockId: DbId | null
  containerRef: { current: HTMLDivElement | null }
  previewContainerRef: { current: HTMLDivElement | null }
  onBreadcrumbClick: (id: DbId) => void
  sourceLabel?: string | null
  /** 外层已提供滚动时，正文不再自建 overflow */
  nestedScroll?: boolean
  /** 阅读模式强制展开；编辑模式不干预折叠 */
  viewMode?: "reading" | "edit"
}

export default function IRReadingPane({
  cardId,
  panelId,
  cardType,
  previewBlockId,
  containerRef,
  previewContainerRef,
  onBreadcrumbClick,
  sourceLabel,
  nestedScroll = false,
  viewMode = "reading"
}: Props) {
  const shouldShowPreview = Boolean(previewBlockId && previewBlockId !== cardId)
  const [contextOpen, setContextOpen] = useState(true)

  useEffect(() => {
    if (viewMode !== "reading") return
    const root = containerRef.current
    if (!root) return

    const runExpand = () => {
      expandReadingModeBlocks(root)
    }

    runExpand()

    let debounceId: number | null = null
    const observer = new MutationObserver(() => {
      if (debounceId != null) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        debounceId = null
        runExpand()
      }, 80)
    })
    observer.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (debounceId != null) window.clearTimeout(debounceId)
    }
  }, [cardId, containerRef, viewMode])

  return (
    <div className="ir-reading__inner">
      <div className="ir-reading__meta">
        <div className="ir-reading__meta-line">
          <IncrementalReadingBreadcrumb
            blockId={cardId}
            panelId={panelId}
            cardType={cardType}
            onItemClick={onBreadcrumbClick}
          />
        </div>
        {sourceLabel ? <span className="ir-reading__meta-line">{sourceLabel}</span> : null}
        {shouldShowPreview ? (
          <button
            type="button"
            className="ir-reading__context-toggle"
            aria-expanded={contextOpen}
            onClick={() => setContextOpen((v: boolean) => !v)}
          >
            {contextOpen ? "收起上下文" : "展开上下文"}
          </button>
        ) : null}
      </div>

      {shouldShowPreview && contextOpen ? (
        <div className="ir-reading__context" ref={previewContainerRef}>
          <OrcaBlock
            panelId={panelId}
            blockId={previewBlockId!}
            blockLevel={0}
            indentLevel={0}
            initiallyCollapsed={viewMode === "reading" ? false : undefined}
          />
        </div>
      ) : (
        <div ref={previewContainerRef} style={{ display: "none" }} />
      )}

      <div
        className="ir-reading__body"
        ref={containerRef}
        style={nestedScroll ? { overflow: "auto", flex: 1, minHeight: 0 } : undefined}
      >
        <OrcaBlock
          panelId={panelId}
          blockId={cardId}
          blockLevel={0}
          indentLevel={0}
          initiallyCollapsed={viewMode === "reading" ? false : undefined}
        />
      </div>
    </div>
  )
}
