/**
 * 当前内容、可选上下文预览
 */

import type { DbId } from "../../orca.d.ts"
import IncrementalReadingBreadcrumb from "../IncrementalReadingBreadcrumb"

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
}

export default function IRReadingPane({
  cardId,
  panelId,
  cardType,
  previewBlockId,
  containerRef,
  previewContainerRef,
  onBreadcrumbClick,
  sourceLabel
}: Props) {
  const shouldShowPreview = Boolean(previewBlockId && previewBlockId !== cardId)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, minHeight: 0 }}>
      <div style={{
        padding: "10px 12px",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        background: "var(--orca-color-bg-2)"
      }}>
        <IncrementalReadingBreadcrumb
          blockId={cardId}
          panelId={panelId}
          cardType={cardType}
          onItemClick={onBreadcrumbClick}
        />
        {sourceLabel ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--orca-color-text-3)" }}>
            {sourceLabel}
          </div>
        ) : null}
      </div>

      {shouldShowPreview ? (
        <div style={{
          border: "1px solid var(--orca-color-border-1)",
          borderRadius: "8px",
          padding: "12px",
          background: "var(--orca-color-bg-2)"
        }} ref={previewContainerRef}>
          <div style={{ fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 8 }}>上下文</div>
          <OrcaBlock panelId={panelId} blockId={previewBlockId!} blockLevel={0} indentLevel={0} />
        </div>
      ) : null}

      <div style={{
        flex: 1,
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "12px",
        background: "var(--orca-color-bg-1)",
        overflow: "auto"
      }} ref={containerRef}>
        <OrcaBlock panelId={panelId} blockId={cardId} blockLevel={0} indentLevel={0} />
      </div>
    </div>
  )
}
