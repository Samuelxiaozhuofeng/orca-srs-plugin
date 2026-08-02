/**
 * 图片遮罩编辑器状态编排 hook（加载/保存/组操作 + pointer 接线）。
 */
import type { DbId } from "../../orca.d.ts"
import {
  compactIoMaskRegions,
  chooseIoUngroupProgressKeeper,
  deleteIoRegionsByIds,
  formatIoGroupConfirmMessage,
  getIoMaskNumbers,
  getVisibleIoMaskRegions,
  groupIoRegionsToMinNumber,
  readIoMasksFromBlock,
  readIoModeFromBlock,
  readStoredIoSrc,
  resolveEffectiveIoMode,
  resolveImageDisplayUrl,
  resolveIoLaunchTarget,
  saveImageOcclusion,
  ungroupIoFocusedGroup,
  type IoMasksPayload,
  type IoRectRegion,
  type ResolvedImageSource
} from "../../srs/imageOcclusion"
import {
  getImageOcclusionMode,
  type ImageOcclusionModeSetting
} from "../../srs/settings/reviewSettingsSchema"
import type { IoEditorCanvasProps } from "./ImageOcclusionEditorCanvas"
import type {
  IoEditorToolbarActions,
  IoEditorToolbarModel
} from "./ImageOcclusionEditorToolbar"
import {
  getIoInteractionDraftRect,
  type IoEditorInteraction,
  type IoEditorPreviewPhase,
  type IoEditorToolMode,
  type IoInteractionSession
} from "./ioEditorInteraction"
import { useIoEditorPointer } from "./useIoEditorPointer"
import { useIoEditorKeyboard } from "./useIoEditorKeyboard"
const { React } = window as any
const { useEffect, useMemo, useRef, useState, useCallback } = React
export type IoEditorController = {
  loading: boolean
  error: string | null
  srcWarning: string | null
  sources: ResolvedImageSource[]
  sourceKey: string | null
  setSourceKey: (key: string) => void
  activeNumber: number
  numbersInUse: number[]
  reviewMode: ImageOcclusionModeSetting
  saving: boolean
  toolbarModel: IoEditorToolbarModel
  toolbarActions: IoEditorToolbarActions
  canvasProps: IoEditorCanvasProps
  handleSave: () => void
  requestClose: () => void
}

export function useIoEditorController(
  hostBlockId: DbId,
  pluginName: string,
  onClose: () => void
): IoEditorController {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null as string | null)
  const [sources, setSources] = useState([] as ResolvedImageSource[])
  const [sourceKey, setSourceKey] = useState(null as string | null)
  const [regions, setRegions] = useState([] as IoRectRegion[])
  const [activeNumber, setActiveNumber] = useState(1)
  const [selectedIds, setSelectedIds] = useState([] as string[])
  const [focusRegionId, setFocusRegionId] = useState(null as string | null)
  const [toolMode, setToolModeState] = useState("draw" as IoEditorToolMode)
  const [previewPhase, setPreviewPhaseState] = useState(
    "edit" as IoEditorPreviewPhase
  )
  const [reviewMode, setReviewMode] = useState(
    "hideOne" as ImageOcclusionModeSetting
  )
  const [interaction, setInteraction] = useState(
    null as IoEditorInteraction | null
  )
  const [saving, setSaving] = useState(false)
  const [srcWarning, setSrcWarning] = useState(null as string | null)
  const initialMasksRef = useRef(null as IoMasksPayload | null)

  const readSession = useCallback((): IoInteractionSession => {
    return {
      interaction,
      regions,
      selectedIds: selectedIds as string[],
      focusRegionId,
      activeNumber
    }
  }, [interaction, regions, selectedIds, focusRegionId, activeNumber])

  const applySession = useCallback((next: IoInteractionSession) => {
    setInteraction(next.interaction)
    setRegions(next.regions)
    setSelectedIds(next.selectedIds)
    setFocusRegionId(next.focusRegionId)
    setActiveNumber(next.activeNumber)
  }, [])

  const selectedIdSet = useMemo(
    () => new Set(selectedIds as string[]),
    [selectedIds]
  )

  const geometryEditable = previewPhase === "edit" && !saving

  const pointer = useIoEditorPointer({
    geometryEditable,
    toolMode,
    selectedIds: selectedIds as string[],
    selectedIdSet,
    regions,
    readSession,
    applySession,
    setActiveNumber,
    setSelectedIds,
    setFocusRegionId,
    setToolModeSelect: () => setToolModeState("select")
  })

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
        const masks = readIoMasksFromBlock(hostBlock)
        initialMasksRef.current = masks
        setRegions(masks?.regions ?? [])
        const nums = getIoMaskNumbers(masks)
        setActiveNumber(nums.length > 0 ? Math.max(...nums) : 1)
        const globalMode = getImageOcclusionMode(pluginName)
        setReviewMode(
          resolveEffectiveIoMode(readIoModeFromBlock(hostBlock), globalMode)
        )
        let preferred = found[0]
        if (storedSrc) {
          const match = found.find(
            (s: ResolvedImageSource) => s.src === storedSrc
          )
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
          setError(e instanceof Error ? e.message : String(e))
          console.error("[ImageOcclusionEditor] 加载失败:", e)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostBlockId, pluginName])

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

  const nextNewNumber =
    numbersInUse.length === 0 ? 1 : Math.max(...numbersInUse) + 1

  const selectedRegions = useMemo(
    () => regions.filter((r: IoRectRegion) => selectedIdSet.has(r.id)),
    [regions, selectedIdSet]
  )
  const selectedNs = useMemo(() => {
    const set = new Set<number>()
    for (const r of selectedRegions) set.add(r.n)
    return Array.from(set).sort((a, b) => a - b)
  }, [selectedRegions])

  const canGroup =
    previewPhase === "edit" &&
    selectedRegions.length >= 2 &&
    selectedNs.length >= 2
  const focusForUngroup =
    focusRegionId && selectedIdSet.has(focusRegionId)
      ? focusRegionId
      : selectedIds.length === 1
        ? selectedIds[0]
        : null
  const ungroupFocusRegion = focusForUngroup
    ? regions.find((r: IoRectRegion) => r.id === focusForUngroup)
    : null
  const canUngroup =
    previewPhase === "edit" &&
    !!ungroupFocusRegion &&
    regions.filter((r: IoRectRegion) => r.n === ungroupFocusRegion.n).length >=
      2

  const canSelectInteract = geometryEditable && toolMode === "select"
  const previewCurrentN = useMemo(() => {
    if (activeNumber && numbersInUse.includes(activeNumber)) return activeNumber
    return numbersInUse[0] ?? 0
  }, [activeNumber, numbersInUse])

  const displayRegions = useMemo(() => {
    if (previewPhase === "edit") return regions
    return getVisibleIoMaskRegions(
      regions,
      previewCurrentN,
      reviewMode,
      previewPhase === "answer"
    )
  }, [previewPhase, regions, previewCurrentN, reviewMode])

  const cancelActiveInteraction = pointer.cancelActiveInteraction

  const setToolMode = useCallback(
    (mode: IoEditorToolMode) => {
      cancelActiveInteraction()
      setToolModeState(mode)
    },
    [cancelActiveInteraction]
  )
  const setPreviewPhase = useCallback(
    (phase: IoEditorPreviewPhase) => {
      cancelActiveInteraction()
      setPreviewPhaseState(phase)
    },
    [cancelActiveInteraction]
  )
  const requestClose = useCallback(() => {
    cancelActiveInteraction()
    onClose()
  }, [cancelActiveInteraction, onClose])

  const removeSelected = useCallback(() => {
    if (selectedIds.length === 0 || !geometryEditable) return
    const rolledBack = cancelActiveInteraction()
    const baseRegions = rolledBack?.regions ?? regions
    const baseSelectedIds = rolledBack?.selectedIds ?? selectedIds
    const ok = window.confirm(
      baseSelectedIds.length === 1
        ? "删除选中的 1 个遮罩区域？若该编号被删光，保存后将移除对应复习进度。"
        : `删除选中的 ${baseSelectedIds.length} 个遮罩区域？若某些编号被删光，保存后将移除对应复习进度。`
    )
    if (!ok) return
    try {
      const result = deleteIoRegionsByIds(baseRegions, baseSelectedIds)
      setRegions(result.regions)
      const nums = getIoMaskNumbers({ version: 1, regions: result.regions })
      const mappedActive = result.numberMap[activeNumber]
      setActiveNumber(
        mappedActive != null && nums.includes(mappedActive)
          ? mappedActive
          : nums.length > 0
            ? Math.max(...nums)
            : 1
      )
      setSelectedIds([])
      setFocusRegionId(null)
    } catch (err) {
      console.error("[ImageOcclusionEditor] 批量删除失败:", err)
      orca.notify("error", err instanceof Error ? err.message : String(err), {
        title: "图片遮罩"
      })
    }
  }, [
    selectedIds,
    geometryEditable,
    regions,
    activeNumber,
    cancelActiveInteraction
  ])

  const handleGroup = useCallback(() => {
    if (!canGroup) return
    const rolledBack = cancelActiveInteraction()
    const baseRegions = rolledBack?.regions ?? regions
    const baseSelectedIds = rolledBack?.selectedIds ?? selectedIds
    const probe = groupIoRegionsToMinNumber(baseRegions, baseSelectedIds)
    if (!probe.ok) {
      orca.notify("warn", probe.reason ?? "无法组合", { title: "图片遮罩" })
      return
    }
    if (!window.confirm(formatIoGroupConfirmMessage(probe))) return
    try {
      const result = groupIoRegionsToMinNumber(baseRegions, baseSelectedIds)
      if (!result.ok) throw new Error(result.reason ?? "组合失败")
      setRegions(result.regions)
      setActiveNumber(result.targetN)
      setSelectedIds(
        (baseSelectedIds as string[]).filter((id: string) =>
          result.regions.some((r: IoRectRegion) => r.id === id)
        )
      )
    } catch (err) {
      console.error("[ImageOcclusionEditor] 组合失败:", err)
      orca.notify("error", err instanceof Error ? err.message : String(err), {
        title: "图片遮罩"
      })
    }
  }, [canGroup, regions, selectedIds, cancelActiveInteraction])

  const handleUngroup = useCallback(() => {
    if (!canUngroup || !focusForUngroup) return
    const rolledBack = cancelActiveInteraction()
    const baseRegions = rolledBack?.regions ?? regions
    const baseFocusRegionId = rolledBack?.focusRegionId ?? focusForUngroup
    if (!baseFocusRegionId) return
    const keeper = chooseIoUngroupProgressKeeper(
      baseRegions,
      baseFocusRegionId,
      initialMasksRef.current
    )
    const probe = ungroupIoFocusedGroup(baseRegions, keeper.keeperRegionId)
    if (!probe.ok) {
      orca.notify("warn", probe.reason ?? "无法解组", { title: "图片遮罩" })
      return
    }
    if (
      !window.confirm(
        `解组 c${probe.keptN}：一个区域保留原进度（聚焦区），其余 ${probe.releasedCount} 个成为新卡。\n` +
          (keeper.adjustedFromFocus
            ? "当前聚焦区是新绘制区域；已改由组内已有区域承接原复习进度。\n"
            : "") +
          `不会把同一份复习状态复制给多张卡。保存后编号会压成连续。\n` +
          `确定解组？`
      )
    ) {
      return
    }
    try {
      const result = ungroupIoFocusedGroup(baseRegions, keeper.keeperRegionId)
      if (!result.ok) throw new Error(result.reason ?? "解组失败")
      setRegions(result.regions)
      setActiveNumber(result.keptN)
      setSelectedIds([result.focusRegionId])
      setFocusRegionId(result.focusRegionId)
    } catch (err) {
      console.error("[ImageOcclusionEditor] 解组失败:", err)
      orca.notify("error", err instanceof Error ? err.message : String(err), {
        title: "图片遮罩"
      })
    }
  }, [canUngroup, focusForUngroup, regions, cancelActiveInteraction])

  const hasActiveInteraction = useCallback(
    () => !!pointer.sessionRef.current?.interaction,
    [pointer.sessionRef]
  )
  useIoEditorKeyboard({
    selectedCount: selectedIds.length,
    geometryEditable,
    hasActiveInteraction,
    cancelActiveInteraction,
    requestClose,
    removeSelected
  })

  const handleSave = useCallback(async () => {
    if (!selectedSource) {
      orca.notify("error", "请选择一张图片", { title: "图片遮罩" })
      return
    }
    const rolledBack = cancelActiveInteraction()
    const saveRegions = rolledBack?.regions ?? regions
    if (saveRegions.length === 0) {
      orca.notify("warn", "请至少绘制一个遮罩矩形", { title: "图片遮罩" })
      return
    }
    setSaving(true)
    try {
      const compacted = compactIoMaskRegions(saveRegions)
      const result = await saveImageOcclusion({
        hostBlockId,
        source: selectedSource,
        regions: compacted.regions,
        pluginName,
        reviewMode
      })
      orca.notify(
        "success",
        `已保存 ${result.regionCount} 个区域，编号 c${result.numbers.join("、c")}`,
        { title: "图片遮罩" }
      )
      onClose()
    } catch (e) {
      console.error("[ImageOcclusionEditor] 保存失败:", e)
      orca.notify("error", e instanceof Error ? e.message : String(e), {
        title: "图片遮罩"
      })
    } finally {
      setSaving(false)
    }
  }, [
    selectedSource,
    regions,
    cancelActiveInteraction,
    hostBlockId,
    pluginName,
    reviewMode,
    onClose
  ])

  const draftRect = getIoInteractionDraftRect(interaction)
  const singleSelected =
    selectedIds.length === 1
      ? regions.find((r: IoRectRegion) => r.id === selectedIds[0])
      : null
  const showHandles =
    canSelectInteract && singleSelected && interaction?.kind !== "move"
  const selectionSummary =
    selectedIds.length === 0
      ? "未选"
      : selectedNs.length === 1
        ? `${selectedIds.length} 区 · c${selectedNs[0]}`
        : `${selectedIds.length} 区 · c${selectedNs.join("/")}`

  return {
    loading,
    error,
    srcWarning,
    sources,
    sourceKey,
    setSourceKey,
    activeNumber,
    numbersInUse,
    reviewMode,
    saving,
    toolbarModel: {
      toolMode,
      previewPhase,
      reviewMode,
      geometryEditable,
      selectionSummary,
      canGroup,
      canUngroup,
      hasSelection: selectedIds.length > 0,
      numbersInUse,
      activeNumber,
      nextNewNumber,
      previewCurrentN,
      regionCount: regions.length
    },
    toolbarActions: {
      setToolMode,
      setPreviewPhase,
      setReviewMode,
      setActiveNumber,
      onGroup: handleGroup,
      onUngroup: handleUngroup,
      onDeleteSelected: removeSelected
    },
    canvasProps: {
      frameRef: pointer.frameRef,
      displayUrl,
      displayRegions,
      selectedIdSet,
      previewPhase,
      toolMode,
      showHandles: !!showHandles,
      singleSelectedId: singleSelected?.id ?? null,
      draftRect,
      interaction,
      onFramePointerDown: pointer.onFramePointerDown,
      onFramePointerMove: pointer.onFramePointerMove,
      onFramePointerUp: pointer.onFramePointerUp,
      onFramePointerCancel: pointer.onFramePointerCancel,
      onRegionPointerDown: pointer.onRegionPointerDown,
      onRegionDoubleClick: pointer.onRegionDoubleClick,
      onHandlePointerDown: pointer.onHandlePointerDown
    },
    handleSave: () => void handleSave(),
    requestClose
  }
}
