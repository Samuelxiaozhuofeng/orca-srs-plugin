/**
 * 图片遮罩编辑器画布：frame + 区域 + 草稿/控制柄。
 * pointer 事件由父组件经 session 状态机处理。
 */

import type { IoRectRegion, IoResizeHandle } from "../../srs/imageOcclusion"
import { regionStylePercent } from "./ioGeometry"
import {
  IO_RESIZE_HANDLES,
  type IoEditorInteraction,
  type IoEditorPreviewPhase,
  type IoEditorToolMode
} from "./ioEditorInteraction"

const { React } = window as any

export type IoEditorCanvasProps = {
  frameRef: { current: HTMLDivElement | null }
  displayUrl: string
  displayRegions: IoRectRegion[]
  selectedIdSet: Set<string>
  previewPhase: IoEditorPreviewPhase
  toolMode: IoEditorToolMode
  showHandles: boolean
  singleSelectedId: string | null
  draftRect: Pick<IoRectRegion, "x" | "y" | "w" | "h"> | null
  interaction: IoEditorInteraction | null
  onFramePointerDown: (e: any) => void
  onFramePointerMove: (e: any) => void
  onFramePointerUp: (e: any) => void
  onFramePointerCancel: (e: any) => void
  onRegionPointerDown: (e: any, region: IoRectRegion) => void
  onRegionDoubleClick: (e: any, region: IoRectRegion) => void
  onHandlePointerDown: (
    e: any,
    region: IoRectRegion,
    handle: IoResizeHandle
  ) => void
}

export function ImageOcclusionEditorCanvas(props: IoEditorCanvasProps) {
  const {
    frameRef,
    displayUrl,
    displayRegions,
    selectedIdSet,
    previewPhase,
    toolMode,
    showHandles,
    singleSelectedId,
    draftRect,
    interaction,
    onFramePointerDown,
    onFramePointerMove,
    onFramePointerUp,
    onFramePointerCancel,
    onRegionPointerDown,
    onRegionDoubleClick,
    onHandlePointerDown
  } = props

  const frameCursorClass =
    previewPhase !== "edit"
      ? "is-preview"
      : toolMode === "select"
        ? "is-select"
        : "is-draw"

  if (!displayUrl) {
    return <div className="srs-io-editor__status">无法加载图片</div>
  }

  return (
    <div
      className={`srs-io-frame ${frameCursorClass}`}
      ref={frameRef}
      onPointerDown={onFramePointerDown}
      onPointerMove={onFramePointerMove}
      onPointerUp={onFramePointerUp}
      onPointerCancel={onFramePointerCancel}
    >
      <img
        className="srs-io-frame__img"
        src={displayUrl}
        alt="遮罩目标"
        draggable={false}
      />
      {displayRegions.map((r: IoRectRegion) => {
        const selected = previewPhase === "edit" && selectedIdSet.has(r.id)
        const isPreview = previewPhase !== "edit"
        return (
          <div
            key={r.id}
            className={
              "srs-io-mask" +
              (selected ? " is-selected" : "") +
              (isPreview ? " srs-io-mask--solid srs-io-mask--preview" : "")
            }
            style={regionStylePercent(r)}
            onPointerDown={
              previewPhase === "edit"
                ? (e: any) => onRegionPointerDown(e, r)
                : undefined
            }
            onDoubleClick={
              previewPhase === "edit"
                ? (e: any) => onRegionDoubleClick(e, r)
                : undefined
            }
          >
            <span className="srs-io-mask__label">c{r.n}</span>
            {showHandles && singleSelectedId === r.id && (
              <>
                {IO_RESIZE_HANDLES.map((h: IoResizeHandle) => (
                  <div
                    key={h}
                    className={`srs-io-handle srs-io-handle--${h}`}
                    onPointerDown={(e: any) => onHandlePointerDown(e, r, h)}
                  />
                ))}
              </>
            )}
          </div>
        )
      })}
      {draftRect && draftRect.w > 0 && draftRect.h > 0 && (
        <div
          className={
            "srs-io-mask is-draft" +
            (interaction?.kind === "marquee" ? " is-marquee" : "")
          }
          style={regionStylePercent(draftRect)}
        />
      )}
    </div>
  )
}
