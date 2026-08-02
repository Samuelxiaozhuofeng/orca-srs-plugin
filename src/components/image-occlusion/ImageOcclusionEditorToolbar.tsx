/**
 * 图片遮罩编辑器工具栏：绘制/选择、组合/解组、画笔编号、复习模式与预览相位。
 */

import {
  ioModeShortLabel
} from "../../srs/imageOcclusion"
import {
  IMAGE_OCCLUSION_MODE_VALUES,
  type ImageOcclusionModeSetting
} from "../../srs/settings/reviewSettingsSchema"
import type {
  IoEditorPreviewPhase,
  IoEditorToolMode
} from "./ioEditorInteraction"

const { React } = window as any

export type IoEditorToolbarModel = {
  toolMode: IoEditorToolMode
  previewPhase: IoEditorPreviewPhase
  reviewMode: ImageOcclusionModeSetting
  geometryEditable: boolean
  selectionSummary: string
  canGroup: boolean
  canUngroup: boolean
  hasSelection: boolean
  numbersInUse: number[]
  activeNumber: number
  nextNewNumber: number
  previewCurrentN: number
  regionCount: number
}

export type IoEditorToolbarActions = {
  setToolMode: (mode: IoEditorToolMode) => void
  setPreviewPhase: (phase: IoEditorPreviewPhase) => void
  setReviewMode: (mode: ImageOcclusionModeSetting) => void
  setActiveNumber: (n: number) => void
  onGroup: () => void
  onUngroup: () => void
  onDeleteSelected: () => void
}

export function ImageOcclusionEditorToolbar({
  model,
  actions
}: {
  model: IoEditorToolbarModel
  actions: IoEditorToolbarActions
}) {
  return (
    <>
      <div className="srs-io-editor__toolbar srs-io-editor__toolbar--tools">
        <button
          type="button"
          className={
            "srs-io-editor__icon-btn" +
            (model.toolMode === "draw" ? " is-active" : "")
          }
          title="绘制模式：拖拽新建矩形"
          disabled={!model.geometryEditable}
          onClick={() => actions.setToolMode("draw")}
        >
          <i className="ti ti-pencil" />
          <span>绘制</span>
        </button>
        <button
          type="button"
          className={
            "srs-io-editor__icon-btn" +
            (model.toolMode === "select" ? " is-active" : "")
          }
          title="选择模式：单击/Shift 多选/框选，拖动与缩放"
          disabled={!model.geometryEditable}
          onClick={() => actions.setToolMode("select")}
        >
          <i className="ti ti-pointer" />
          <span>选择</span>
        </button>

        <span className="srs-io-editor__sel-slot" title="选中区域">
          {model.selectionSummary}
        </span>

        <button
          type="button"
          className="srs-io-editor__icon-btn"
          title="组合为一张卡（保留最小编号进度）"
          disabled={!model.canGroup}
          onClick={actions.onGroup}
        >
          <i className="ti ti-link" />
          <span>组合</span>
        </button>
        <button
          type="button"
          className="srs-io-editor__icon-btn"
          title="解组：聚焦区保留进度，其余成新卡"
          disabled={!model.canUngroup}
          onClick={actions.onUngroup}
        >
          <i className="ti ti-unlink" />
          <span>解组</span>
        </button>
        <button
          type="button"
          className="srs-io-editor__icon-btn srs-io-editor__icon-btn--danger"
          title="删除选中区域"
          disabled={!model.hasSelection || !model.geometryEditable}
          onClick={actions.onDeleteSelected}
        >
          <i className="ti ti-trash" />
          <span>删除</span>
        </button>
      </div>

      <div className="srs-io-editor__toolbar">
        <span className="srs-io-editor__label">画笔编号</span>
        {model.numbersInUse.map((n: number) => (
          <button
            key={n}
            type="button"
            className={
              "srs-io-editor__num-btn" +
              (model.activeNumber === n ? " is-active" : "")
            }
            disabled={model.previewPhase !== "edit"}
            onClick={() => actions.setActiveNumber(n)}
          >
            c{n}
          </button>
        ))}
        <button
          type="button"
          className={
            "srs-io-editor__num-btn" +
            (model.activeNumber === model.nextNewNumber ? " is-active" : "")
          }
          disabled={model.previewPhase !== "edit"}
          onClick={() => actions.setActiveNumber(model.nextNewNumber)}
        >
          + c{model.nextNewNumber}
        </button>
      </div>

      <div className="srs-io-editor__toolbar srs-io-editor__toolbar--modes">
        <span className="srs-io-editor__label">复习模式</span>
        <div className="srs-io-editor__seg">
          {IMAGE_OCCLUSION_MODE_VALUES.map((m: ImageOcclusionModeSetting) => (
            <button
              key={m}
              type="button"
              className={
                "srs-io-editor__seg-btn" +
                (model.reviewMode === m ? " is-active" : "")
              }
              title={m}
              onClick={() => actions.setReviewMode(m)}
            >
              {ioModeShortLabel(m)}
            </button>
          ))}
        </div>
        <span className="srs-io-editor__label srs-io-editor__label--gap">
          预览
        </span>
        <div className="srs-io-editor__seg">
          {(
            [
              ["edit", "编辑"],
              ["question", "题面"],
              ["answer", "答案"]
            ] as const
          ).map(([phase, label]) => (
            <button
              key={phase}
              type="button"
              className={
                "srs-io-editor__seg-btn" +
                (model.previewPhase === phase ? " is-active" : "")
              }
              disabled={
                (phase === "question" || phase === "answer") &&
                (model.regionCount === 0 || !model.previewCurrentN)
              }
              title={
                phase === "edit"
                  ? "编辑：可选、绘制、组合"
                  : phase === "question"
                    ? "题面：按复习模式渲染遮罩"
                    : "答案：按复习模式揭开"
              }
              onClick={() => actions.setPreviewPhase(phase)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
