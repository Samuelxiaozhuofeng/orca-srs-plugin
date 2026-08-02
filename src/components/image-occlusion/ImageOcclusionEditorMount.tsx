/**
 * 图片遮罩编辑器：Headbar 挂载 + Modal 画框。
 * 入口：斜杠 /io、右键、命令 openImageOcclusionEditor。
 */

import type { DbId } from "../../orca.d.ts"
import {
  createRegionId,
  getIoMaskNumbers,
  normalizeRect,
  readIoMasksFromBlock,
  readStoredIoSrc,
  resolveImageDisplayUrl,
  resolveIoLaunchTarget,
  saveImageOcclusion,
  type IoRectRegion,
  type ResolvedImageSource
} from "../../srs/imageOcclusion"
import { clientToRelOnElement, regionStylePercent } from "./ioGeometry"

const { React, Valtio } = window as any
const { useSnapshot } = Valtio
const { useEffect, useMemo, useRef, useState, useCallback } = React

type DialogState = {
  isOpen: boolean
  hostBlockId: DbId | null
  pluginName: string
}

const dialogState = Valtio.proxy({
  isOpen: false,
  hostBlockId: null,
  pluginName: "orca-srs"
} as DialogState)

export function openImageOcclusionEditor(
  hostBlockId: DbId,
  pluginName: string
): void {
  dialogState.hostBlockId = hostBlockId
  dialogState.pluginName = pluginName
  dialogState.isOpen = true
}

function closeImageOcclusionEditor(): void {
  dialogState.isOpen = false
  dialogState.hostBlockId = null
}

type DragState = {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function ImageOcclusionEditorBody({
  hostBlockId,
  pluginName,
  onClose
}: {
  hostBlockId: DbId
  pluginName: string
  onClose: () => void
}) {
  const { Button } = orca.components
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null as string | null)
  const [sources, setSources] = useState([] as ResolvedImageSource[])
  const [sourceKey, setSourceKey] = useState(null as string | null)
  const [regions, setRegions] = useState([] as IoRectRegion[])
  const [activeNumber, setActiveNumber] = useState(1)
  const [selectedId, setSelectedId] = useState(null as string | null)
  const [drag, setDrag] = useState(null as DragState | null)
  const [saving, setSaving] = useState(false)
  const [srcWarning, setSrcWarning] = useState(null as string | null)
  /** 紧贴图片的坐标系根节点（非外层滚动容器） */
  const frameRef = useRef(null as HTMLDivElement | null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { hostBlock, sources: found } = await resolveIoLaunchTarget(
          hostBlockId
        )
        if (cancelled) return
        setSources(found)
        const storedSrc = readStoredIoSrc(hostBlock)
        let masks = null as ReturnType<typeof readIoMasksFromBlock>
        try {
          masks = readIoMasksFromBlock(hostBlock)
        } catch (e) {
          throw e
        }
        const existing = masks?.regions ?? []
        setRegions(existing)
        const nums = getIoMaskNumbers(masks)
        setActiveNumber(nums.length > 0 ? Math.max(...nums) : 1)

        // 优先匹配已存 src，否则第一张
        let preferred = found[0]
        if (storedSrc) {
          const match = found.find(s => s.src === storedSrc)
          if (match) preferred = match
          else if (found[0] && found[0].src !== storedSrc) {
            setSrcWarning(
              "图片路径已变化，遮罩按相对坐标尽量保留；请确认区域是否仍准确。"
            )
          }
        }
        setSourceKey(preferred?.key ?? null)
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          console.error("[ImageOcclusionEditor] 加载失败:", e)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostBlockId])

  const selectedSource = useMemo(
    () => sources.find((s: ResolvedImageSource) => s.key === sourceKey) ?? null,
    [sources, sourceKey]
  )

  const displayUrl = selectedSource
    ? resolveImageDisplayUrl(selectedSource.src)
    : ""

  const numbersInUse = useMemo(() => {
    const set = new Set<number>()
    for (const r of regions) set.add(r.n)
    return Array.from(set).sort((a, b) => a - b)
  }, [regions])

  const nextNewNumber = useMemo(() => {
    if (numbersInUse.length === 0) return 1
    return Math.max(...numbersInUse) + 1
  }, [numbersInUse])

  const onPointerDown = useCallback(
    (e: any) => {
      if (!frameRef.current || saving) return
      e.preventDefault()
      const p = clientToRelOnElement(e.clientX, e.clientY, frameRef.current)
      setSelectedId(null)
      setDrag({
        startX: p.x,
        startY: p.y,
        currentX: p.x,
        currentY: p.y
      })
    },
    [saving]
  )

  const onPointerMove = useCallback((e: any) => {
    if (!drag || !frameRef.current) return
    const p = clientToRelOnElement(e.clientX, e.clientY, frameRef.current)
    setDrag({ ...drag, currentX: p.x, currentY: p.y })
  }, [drag])

  const onPointerUp = useCallback(() => {
    if (!drag) return
    const rect = normalizeRect({
      x: Math.min(drag.startX, drag.currentX),
      y: Math.min(drag.startY, drag.currentY),
      w: Math.abs(drag.currentX - drag.startX),
      h: Math.abs(drag.currentY - drag.startY)
    })
    setDrag(null)
    if (rect.w <= 0 || rect.h <= 0) return
    const id = createRegionId()
    setRegions((prev: IoRectRegion[]) => [
      ...prev,
      { id, n: activeNumber, shape: "rect", ...rect }
    ])
    setSelectedId(id)
  }, [drag, activeNumber])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault()
        setRegions((prev: IoRectRegion[]) =>
          prev.filter(r => r.id !== selectedId)
        )
        setSelectedId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, onClose])

  const handleSave = async () => {
    if (!selectedSource) {
      orca.notify("error", "请选择一张图片", { title: "图片遮罩" })
      return
    }
    if (regions.length === 0) {
      orca.notify("warn", "请至少绘制一个遮罩矩形", { title: "图片遮罩" })
      return
    }
    setSaving(true)
    try {
      const result = await saveImageOcclusion({
        hostBlockId,
        source: selectedSource,
        regions,
        pluginName
      })
      orca.notify(
        "success",
        `已保存 ${result.regionCount} 个区域，编号 c${result.numbers.join("、c")}`,
        { title: "图片遮罩" }
      )
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[ImageOcclusionEditor] 保存失败:", e)
      orca.notify("error", msg, { title: "图片遮罩" })
    } finally {
      setSaving(false)
    }
  }

  const draftRect = drag
    ? normalizeRect({
        x: Math.min(drag.startX, drag.currentX),
        y: Math.min(drag.startY, drag.currentY),
        w: Math.abs(drag.currentX - drag.startX),
        h: Math.abs(drag.currentY - drag.startY)
      })
    : null

  if (loading) {
    return <div className="srs-io-editor__status">加载图片中…</div>
  }
  if (error) {
    return (
      <div className="srs-io-editor">
        <div className="srs-io-editor__error">{error}</div>
        <div className="srs-io-editor__actions">
          <Button variant="outline" onClick={onClose}>
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
            拖拽绘制矩形；同编号可多区。当前画笔{" "}
            <strong>c{activeNumber}</strong>
            {numbersInUse.length > 0
              ? ` · 已有 IO×${numbersInUse.length}`
              : ""}
          </div>
        </div>
      </div>

      {srcWarning && (
        <div className="srs-io-editor__warn">{srcWarning}</div>
      )}

      {sources.length > 1 && (
        <div className="srs-io-editor__sources">
          <span className="srs-io-editor__label">图片来源</span>
          <div className="srs-io-editor__source-list">
            {sources.map((s: ResolvedImageSource) => (
              <button
                key={s.key}
                type="button"
                className={
                  "srs-io-editor__source-btn" +
                  (s.key === sourceKey ? " is-active" : "")
                }
                onClick={() => setSourceKey(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="srs-io-editor__toolbar">
        <span className="srs-io-editor__label">画笔编号</span>
        {numbersInUse.map((n: number) => (
          <button
            key={n}
            type="button"
            className={
              "srs-io-editor__num-btn" +
              (activeNumber === n ? " is-active" : "")
            }
            onClick={() => setActiveNumber(n)}
          >
            c{n}
          </button>
        ))}
        <button
          type="button"
          className={
            "srs-io-editor__num-btn" +
            (activeNumber === nextNewNumber ? " is-active" : "")
          }
          onClick={() => setActiveNumber(nextNewNumber)}
        >
          + c{nextNewNumber}
        </button>
        {selectedId && (
          <button
            type="button"
            className="srs-io-editor__num-btn srs-io-editor__num-btn--danger"
            onClick={() => {
              setRegions((prev: IoRectRegion[]) =>
                prev.filter(r => r.id !== selectedId)
              )
              setSelectedId(null)
            }}
          >
            删除选中
          </button>
        )}
      </div>

      <div className="srs-io-editor__scroll">
        {displayUrl ? (
          <div
            className="srs-io-frame"
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <img
              className="srs-io-frame__img"
              src={displayUrl}
              alt="遮罩目标"
              draggable={false}
            />
            {regions.map((r: IoRectRegion) => (
              <div
                key={r.id}
                className={
                  "srs-io-mask" +
                  (r.id === selectedId ? " is-selected" : "")
                }
                style={regionStylePercent(r)}
                onPointerDown={(e: any) => {
                  e.stopPropagation()
                  setSelectedId(r.id)
                  setActiveNumber(r.n)
                }}
              >
                <span className="srs-io-mask__label">c{r.n}</span>
              </div>
            ))}
            {draftRect && draftRect.w > 0 && draftRect.h > 0 && (
              <div
                className="srs-io-mask is-draft"
                style={regionStylePercent(draftRect)}
              />
            )}
          </div>
        ) : (
          <div className="srs-io-editor__status">无法加载图片</div>
        )}
      </div>

      <div className="srs-io-editor__hint">
        Delete / Backspace 删除选中 · Esc 关闭 · 坐标相对图片本身（保存后笔记中保留实心遮罩）
      </div>

      <div className="srs-io-editor__actions">
        <Button
          variant="outline"
          onClick={() => {
            if (!saving) onClose()
          }}
        >
          取消
        </Button>
        <Button
          variant="solid"
          onClick={() => {
            if (!saving) void handleSave()
          }}
        >
          {saving ? "保存中…" : "保存遮罩"}
        </Button>
      </div>
    </div>
  )
}

export function ImageOcclusionEditorMount({
  pluginName
}: {
  pluginName: string
}) {
  const snap = useSnapshot(dialogState)
  const { ModalOverlay } = orca.components

  // 保持 mount 的 pluginName 与打开时一致
  useEffect(() => {
    if (!dialogState.pluginName) {
      dialogState.pluginName = pluginName
    }
  }, [pluginName])

  if (!snap.isOpen || snap.hostBlockId == null) return null

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={closeImageOcclusionEditor}
    >
      <div className="srs-io-editor-shell">
        <ImageOcclusionEditorBody
          hostBlockId={snap.hostBlockId as DbId}
          pluginName={snap.pluginName || pluginName}
          onClose={closeImageOcclusionEditor}
        />
      </div>
    </ModalOverlay>
  )
}
