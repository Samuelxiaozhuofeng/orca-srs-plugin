/**
 * 正文优先阅读区：近上下文 / 章节浏览由 contextState 驱动；
 * 弱化面包屑；单一滚动由外层承担。
 */

import type { DbId } from "../../orca.d.ts"
import IncrementalReadingBreadcrumb from "../IncrementalReadingBreadcrumb"
import {
  resolveBodyBlockId,
  resolveNearContextRenderId,
  type IRReadingContextState
} from "./irReadingContextModel"
import {
  clearLocateHighlight,
  scheduleLocateBlock
} from "./irReadingContextLocate"
import { expandReadingModeBlocks } from "./irReadingExpand"
import { applyContextHideSelf } from "./irReadingContextSuppress"
import IRBlockExplainController from "./IRBlockExplainController"

const { useEffect } = window.React
const { Block: OrcaBlock } = orca.components

export type IRReadingPaneProps = {
  cardId: DbId
  panelId: string
  cardType: "topic" | "extracts"
  contextState: IRReadingContextState
  containerRef: { current: HTMLDivElement | null }
  previewContainerRef: { current: HTMLDivElement | null }
  /** Optional locate/scroll root for chapter_browse (falls back to body) */
  scrollContainerRef?: { current: HTMLDivElement | null }
  onBreadcrumbClick: (id: DbId) => void
  onToggleNearContext: () => void
  sourceLabel?: string | null
  /** 外层已提供滚动时，正文不再自建 overflow */
  nestedScroll?: boolean
  /** 阅读模式强制展开；编辑模式不干预折叠 */
  viewMode?: "reading" | "edit"
  /** AI 块解释（复用插件 AI 设置）；默认启用 */
  pluginName?: string
  enableBlockExplain?: boolean
}

function observeExpand(root: HTMLElement): () => void {
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
}

export default function IRReadingPane({
  cardId,
  panelId,
  cardType,
  contextState,
  containerRef,
  previewContainerRef,
  scrollContainerRef,
  onBreadcrumbClick,
  onToggleNearContext,
  sourceLabel,
  nestedScroll = false,
  viewMode = "reading",
  pluginName = "orca-srs",
  enableBlockExplain = true
}: IRReadingPaneProps) {
  const nearRenderId = resolveNearContextRenderId(contextState, cardId)
  const bodyBlockId = resolveBodyBlockId(contextState, cardId)
  const showNearToggle =
    cardType === "extracts" &&
    contextState.nearContextBlockId != null &&
    contextState.mode === "extract_focus"

  // Body expand (reading mode)
  useEffect(() => {
    if (viewMode !== "reading") return
    const root = containerRef.current
    if (!root) return
    return observeExpand(root)
  }, [cardId, bodyBlockId, containerRef, viewMode])

  // Near-context expand when panel is visible
  useEffect(() => {
    if (viewMode !== "reading") return
    if (nearRenderId == null) return
    const root = previewContainerRef.current
    if (!root) return
    return observeExpand(root)
  }, [cardId, nearRenderId, previewContainerRef, viewMode])

  // Hide extract self under near-context parent render
  useEffect(() => {
    if (nearRenderId == null) return
    const root = previewContainerRef.current
    if (!root) return

    const run = () => {
      applyContextHideSelf(root, cardId)
    }
    run()

    // childList only: class toggles must not re-enter the observer
    const observer = new MutationObserver(run)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [cardId, nearRenderId, previewContainerRef])

  // chapter_browse: locate extract inside ancestor body after mount
  useEffect(() => {
    if (contextState.mode !== "chapter_browse") return
    if (contextState.browseBlockId == null) return

    const root = scrollContainerRef?.current ?? containerRef.current
    if (!root) return

    const cancel = scheduleLocateBlock(root, cardId)
    return () => {
      cancel()
      clearLocateHighlight(root)
    }
  }, [
    cardId,
    bodyBlockId,
    contextState.mode,
    contextState.browseBlockId,
    containerRef,
    scrollContainerRef
  ])

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
        {showNearToggle ? (
          <button
            type="button"
            className="ir-reading__context-toggle"
            aria-expanded={contextState.contextOpen}
            onClick={onToggleNearContext}
          >
            {contextState.contextOpen ? "收起上下文" : "展开上下文"}
          </button>
        ) : null}
      </div>

      {nearRenderId != null ? (
        <div
          className="ir-reading__context"
          ref={previewContainerRef}
          data-ir-near-context={String(nearRenderId)}
        >
          <OrcaBlock
            panelId={panelId}
            blockId={nearRenderId}
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
        data-ir-body-block={String(bodyBlockId)}
        data-ir-browse-mode={contextState.mode}
      >
        <OrcaBlock
          panelId={panelId}
          blockId={bodyBlockId}
          blockLevel={0}
          indentLevel={0}
          initiallyCollapsed={viewMode === "reading" ? false : undefined}
        />
        <IRBlockExplainController
          enabled={enableBlockExplain}
          pluginName={pluginName}
          cardId={cardId}
          bodyRef={containerRef}
        />
      </div>
    </div>
  )
}
