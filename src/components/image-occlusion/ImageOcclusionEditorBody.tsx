/**
 * 图片遮罩编辑器主体 UI：组合 Toolbar / Canvas / 操作按钮。
 * 状态与 pointer 见 useIoEditorController。
 */

import type { DbId } from "../../orca.d.ts"
import { ioModeShortLabel } from "../../srs/imageOcclusion"
import type { ResolvedImageSource } from "../../srs/imageOcclusion"
import { ImageOcclusionEditorCanvas } from "./ImageOcclusionEditorCanvas"
import { ImageOcclusionEditorToolbar } from "./ImageOcclusionEditorToolbar"
import { useIoEditorController } from "./useIoEditorController"

const { React } = window as any

export function ImageOcclusionEditorBody({
  hostBlockId,
  pluginName,
  onClose
}: {
  hostBlockId: DbId
  pluginName: string
  onClose: () => void
}) {
  const { Button } = orca.components
  const c = useIoEditorController(hostBlockId, pluginName, onClose)

  if (c.loading) {
    return <div className="srs-io-editor__status">加载图片中…</div>
  }
  if (c.error) {
    return (
      <div className="srs-io-editor">
        <div className="srs-io-editor__error">{c.error}</div>
        <div className="srs-io-editor__actions">
          <Button variant="outline" onClick={c.requestClose}>
            关闭
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="srs-io-editor">
      <div className="srs-io-editor__header">
        <div>
          <h2 className="srs-io-editor__title">图片遮罩</h2>
          <div className="srs-io-editor__subtitle">
            画笔 <strong>c{c.activeNumber}</strong>
            {c.numbersInUse.length > 0
              ? ` · IO×${c.numbersInUse.length}`
              : ""}
            {" · "}
            {ioModeShortLabel(c.reviewMode)}
          </div>
        </div>
      </div>

      {c.srcWarning && (
        <div className="srs-io-editor__warn">{c.srcWarning}</div>
      )}

      {c.sources.length > 1 && (
        <div className="srs-io-editor__sources">
          <span className="srs-io-editor__label">图片来源</span>
          <div className="srs-io-editor__source-list">
            {c.sources.map((s: ResolvedImageSource) => (
              <button
                key={s.key}
                type="button"
                className={
                  "srs-io-editor__source-btn" +
                  (s.key === c.sourceKey ? " is-active" : "")
                }
                onClick={() => c.setSourceKey(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <ImageOcclusionEditorToolbar
        model={c.toolbarModel}
        actions={c.toolbarActions}
      />

      <div className="srs-io-editor__scroll">
        <ImageOcclusionEditorCanvas {...c.canvasProps} />
      </div>

      <div className="srs-io-editor__hint">
        双击区域选中整组 · Shift 多选 · 空白拖拽框选 · Delete 删除 · Esc
        取消交互/关闭
      </div>

      <div className="srs-io-editor__actions">
        <Button
          variant="outline"
          onClick={() => {
            if (!c.saving) c.requestClose()
          }}
        >
          取消
        </Button>
        <Button
          variant="solid"
          onClick={() => {
            if (!c.saving) c.handleSave()
          }}
        >
          {c.saving ? "保存中…" : "保存遮罩"}
        </Button>
      </div>
    </div>
  )
}
