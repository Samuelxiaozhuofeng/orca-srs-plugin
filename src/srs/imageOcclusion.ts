/**
 * 图片遮罩（Image Occlusion）核心：数据模型、图片源解析、持久化与编号。
 *
 * 卡型 type=image-occlusion，与文字 cloze 分离。
 * 每个遮罩编号 n 复用 srs.c{n}.* FSRS 存储与独立 cardKey `io:{blockId}:c{n}`。
 * 几何使用相对坐标 [0,1]，换图后尽量保留。
 */

import type { Block, ContentFragment, CursorData, DbId } from "../orca.d.ts"
import { BlockWithRepr } from "./blockUtils"
import {
  deleteClozeCardSrsData,
  ensureClozeSrsState,
  invalidateBlockCache,
  moveClozeCardSrsData,
  writeInitialClozeSrsState
} from "./storage"
import { isCardTag } from "./tagUtils"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { buildCardTagData } from "./cardTagDataBuilder"
import { extractCardType } from "./deckUtils"
import {
  isImageOcclusionMode,
  type ImageOcclusionModeSetting
} from "./settings/reviewSettingsSchema"

// ---------------------------------------------------------------------------
// 常量与类型
// ---------------------------------------------------------------------------

export const IO_MASKS_PROP = "srs.io.masks"
export const IO_SRC_PROP = "srs.io.src"
/** 切换到 srs.image-occlusion 前的原 _repr（JSON 字符串），整卡删除时恢复 */
export const IO_PREV_REPR_PROP = "srs.io.prevRepr"
/**
 * masks 已紧凑但 srs.cN.* 迁移尚未完成时的挂起描述。
 * 与 masks 同次写入；迁移成功后删除。崩溃后靠此幂等重放。
 */
export const IO_PENDING_SRS_PROP = "srs.io.pendingSrs"
/**
 * 每图复习模式（Text）：hideOne | hideAll | hideAllRevealAll。
 * 优先于全局 review.imageOcclusionMode；缺失则继承全局。
 */
export const IO_MODE_PROP = "srs.io.mode"
/** 整卡 / 末变体清理时须对称删除的 IO 属性（含 mode，禁止孤儿） */
export const IO_HOST_PROPERTY_NAMES = [
  IO_MASKS_PROP,
  IO_SRC_PROP,
  IO_PREV_REPR_PROP,
  IO_PENDING_SRS_PROP,
  IO_MODE_PROP
] as const
/** 属性类型：Text（JSON 字符串），与选择题统计等一致 */
const PROP_TYPE_TEXT = 1

export const IMAGE_OCCLUSION_CARD_TYPE = "image-occlusion" as const
/** 直接子块图片扫描硬上限（有界扩展，禁止无界 Promise.all / 全库扫） */
export const IO_MAX_CHILD_SCAN = 50

export type IoRectRegion = {
  /** 稳定区域 id（编辑用，不参与 cardKey） */
  id: string
  /** 遮罩编号，同号多区共用一张卡 */
  n: number
  shape: "rect"
  /** 相对图片 natural 尺寸，闭区间约 [0,1] */
  x: number
  y: number
  w: number
  h: number
}

export type IoMasksPayload = {
  version: 1
  regions: IoRectRegion[]
}

export type ImageSourceKind = "block-repr" | "inline-fragment" | "child-block"

export type ResolvedImageSource = {
  /** 稳定候选 key，供 UI 选择 */
  key: string
  kind: ImageSourceKind
  /** 实际持有图片的块（child-block 时为子块） */
  imageBlockId: DbId
  /** 原始 src（仓库相对路径或 URL） */
  src: string
  /** inline 时 fragment 下标 */
  fragmentIndex?: number
  label: string
}

export type SaveImageOcclusionInput = {
  hostBlockId: DbId
  source: ResolvedImageSource
  regions: IoRectRegion[]
  pluginName: string
  /** 每图复习模式；与 masks/src 同次写入 srs.io.mode */
  reviewMode: ImageOcclusionModeSetting
}

export type SaveImageOcclusionResult = {
  hostBlockId: DbId
  numbers: number[]
  createdNumbers: number[]
  /** 本次从 masks 移除、并清理了 srs.cN.* 的编号（按重排前旧编号） */
  removedNumbers: number[]
  /** 保留进度的编号迁移（旧 n → 新 n），已在保存时落地 */
  renames: IoNumberRename[]
  regionCount: number
  addedCardTag: boolean
}

/** 遮罩编号重排：from（旧）→ to（新），仅 from !== to */
export type IoNumberRename = { from: number; to: number }

export type CompactIoMaskResult = {
  regions: IoRectRegion[]
  /** 输入中出现过的旧编号 → 紧凑后编号 */
  numberMap: Record<number, number>
  renames: IoNumberRename[]
  changed: boolean
}

/**
 * 将遮罩编号压成连续的 1..k（保持相对顺序：更小的旧号仍更小）。
 * 例：删掉 c2 后剩余 [1,3,4] → [1,2,3]，renames = [{3→2},{4→3}]。
 * 同号多区一起改 n，region id 不变。
 */
export function compactIoMaskRegions(
  regions: readonly IoRectRegion[]
): CompactIoMaskResult {
  const oldNumbers = getIoMaskNumbers({
    version: 1,
    regions: regions as IoRectRegion[]
  })
  const numberMap: Record<number, number> = {}
  const renames: IoNumberRename[] = []
  oldNumbers.forEach((old, i) => {
    const neu = i + 1
    numberMap[old] = neu
    if (old !== neu) renames.push({ from: old, to: neu })
  })
  const next = regions.map(r => {
    const mapped = numberMap[r.n]
    if (mapped == null || mapped === r.n) return r as IoRectRegion
    return { ...r, n: mapped }
  })
  return {
    regions: next,
    numberMap,
    renames,
    changed: renames.length > 0
  }
}

// ---------------------------------------------------------------------------
// 编辑器纯区域变换（不写后端；保存时再 plan + pending SRS）
// ---------------------------------------------------------------------------

function toIdSet(ids: ReadonlySet<string> | readonly string[]): Set<string> {
  return ids instanceof Set ? new Set(ids) : new Set(ids)
}

/** 轴对齐矩形是否相交（边界相贴视为相交） */
export function ioRectsIntersect(
  a: Pick<IoRectRegion, "x" | "y" | "w" | "h">,
  b: Pick<IoRectRegion, "x" | "y" | "w" | "h">
): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  )
}

/** 组合为一张卡的纯结果（含精确 SRS 进度元数据，供确认文案） */
export type GroupIoRegionsResult = {
  regions: IoRectRegion[]
  /** compact 后的目标编号（界面/保存后的 cN） */
  targetN: number
  /** compact 前的目标编号（所选中的最小现有 n） */
  preCompactTargetN: number
  /**
   * 参与移动的来源 n：被选中且 n ≠ 目标，至少有一个区域改写到目标。
   * 不含目标 n 自身。
   */
  movedFromNs: number[]
  /**
   * 完整并入：该来源 n 的全部区域都被选中并入目标；
   * 保存后该卡不再存在，进度删除（plan deleted）。
   */
  fullyAbsorbedNs: number[]
  /**
   * 部分移动：该来源 n 仍有未选区域留在原编号；
   * 保存后该卡仍在并保留进度，不能声称删除。
   */
  partialSourceNs: number[]
  /**
   * 目标 n 在组合前是否还有未选中区域（它们本来就在目标卡上，不重复也不删除）。
   */
  targetHadUnselected: boolean
  selectedCount: number
  ok: boolean
  reason?: string
}

/**
 * 组合为一张卡：所选区域改为其中最小现有 n，再 compact。
 * region id 不变。
 *
 * SRS 进度（与 planIoSrsNumberOps 一致）：
 * - 目标 n 保留进度（含目标上未选中的区域，本来就在该卡）
 * - 仅当某来源 n 的**全部**区域都被移走时，该卡才会在保存后删除
 * - 若某来源 n 仍有未选区域，该卡继续存在，进度保留
 */
export function groupIoRegionsToMinNumber(
  regions: readonly IoRectRegion[],
  selectedIds: ReadonlySet<string> | readonly string[]
): GroupIoRegionsResult {
  const empty = (
    partial: Partial<GroupIoRegionsResult> & {
      selectedCount: number
      ok: boolean
      reason?: string
    }
  ): GroupIoRegionsResult => ({
    regions: regions as IoRectRegion[],
    targetN: 0,
    preCompactTargetN: 0,
    movedFromNs: [],
    fullyAbsorbedNs: [],
    partialSourceNs: [],
    targetHadUnselected: false,
    ...partial
  })

  const idSet = toIdSet(selectedIds)
  const selected = regions.filter(r => idSet.has(r.id))
  if (selected.length < 2) {
    return empty({
      selectedCount: selected.length,
      ok: false,
      reason: "至少选中两个区域"
    })
  }
  const ns = Array.from(new Set(selected.map(r => r.n))).sort((a, b) => a - b)
  if (ns.length < 2) {
    return empty({
      preCompactTargetN: ns[0] ?? 0,
      targetN: ns[0] ?? 0,
      selectedCount: selected.length,
      ok: false,
      reason: "所选区域须跨多个编号"
    })
  }
  const preCompactTargetN = ns[0]!
  const movedFromNs = ns.filter(n => n !== preCompactTargetN)

  // 按编号统计：总数 / 被选中数 → 全吸收 vs 部分移动
  const countByN = new Map<number, number>()
  const selectedCountByN = new Map<number, number>()
  for (const r of regions) {
    countByN.set(r.n, (countByN.get(r.n) ?? 0) + 1)
  }
  for (const r of selected) {
    selectedCountByN.set(r.n, (selectedCountByN.get(r.n) ?? 0) + 1)
  }

  const fullyAbsorbedNs: number[] = []
  const partialSourceNs: number[] = []
  for (const n of movedFromNs) {
    const total = countByN.get(n) ?? 0
    const sel = selectedCountByN.get(n) ?? 0
    if (sel >= total && total > 0) fullyAbsorbedNs.push(n)
    else if (sel > 0 && sel < total) partialSourceNs.push(n)
  }

  const targetTotal = countByN.get(preCompactTargetN) ?? 0
  const targetSelected = selectedCountByN.get(preCompactTargetN) ?? 0
  const targetHadUnselected = targetSelected < targetTotal

  const remapped = regions.map(r =>
    idSet.has(r.id) && r.n !== preCompactTargetN
      ? { ...r, n: preCompactTargetN }
      : r
  )
  const compacted = compactIoMaskRegions(remapped)
  return {
    regions: compacted.regions,
    targetN: compacted.numberMap[preCompactTargetN] ?? preCompactTargetN,
    preCompactTargetN,
    movedFromNs,
    fullyAbsorbedNs,
    partialSourceNs,
    targetHadUnselected,
    selectedCount: selected.length,
    ok: true
  }
}

/**
 * 组合确认文案：与 fullyAbsorbed / partial 元数据一致，不得误称「部分移动的卡会删除」。
 */
export function formatIoGroupConfirmMessage(result: GroupIoRegionsResult): string {
  if (!result.ok) {
    return result.reason ?? "无法组合"
  }
  const lines: string[] = [
    `将 ${result.selectedCount} 个区域组合为 c${result.targetN} 一张卡。`,
    `保留 c${result.targetN} 的复习进度。`
  ]
  if (result.targetHadUnselected) {
    lines.push(
      `c${result.targetN} 上未选中的区域本来就在该卡中，保持不变。`
    )
  }
  if (result.fullyAbsorbedNs.length > 0) {
    lines.push(
      `完整并入的卡 c${result.fullyAbsorbedNs.join("、c")} 及其进度会在保存后移除。`
    )
  }
  if (result.partialSourceNs.length > 0) {
    lines.push(
      `仅移动了部分区域的卡 c${result.partialSourceNs.join("、c")} 仍保留（未选区域留在原卡，进度不删）。`
    )
  }
  if (
    result.fullyAbsorbedNs.length === 0 &&
    result.partialSourceNs.length === 0 &&
    result.movedFromNs.length > 0
  ) {
    // 理论上不应出现：moved 必落入 full 或 partial
    lines.push(
      `来源编号 c${result.movedFromNs.join("、c")} 将并入目标（请确认保存后进度）。`
    )
  }
  lines.push("确定组合？")
  return lines.join("\n")
}

/**
 * 解组：聚焦区域保留原 n（及保存后进度），同组其它区域各自成为新编号。
 * 不为多张卡复制同一份 SRS 状态；新编号在保存时 plan 为 created。
 */
export function ungroupIoFocusedGroup(
  regions: readonly IoRectRegion[],
  focusRegionId: string
): {
  regions: IoRectRegion[]
  keptN: number
  focusRegionId: string
  newNumbers: number[]
  releasedCount: number
  ok: boolean
  reason?: string
} {
  const focus = regions.find(r => r.id === focusRegionId)
  if (!focus) {
    return {
      regions: regions as IoRectRegion[],
      keptN: 0,
      focusRegionId,
      newNumbers: [],
      releasedCount: 0,
      ok: false,
      reason: "聚焦区域不存在"
    }
  }
  const group = regions.filter(r => r.n === focus.n)
  if (group.length < 2) {
    return {
      regions: regions as IoRectRegion[],
      keptN: focus.n,
      focusRegionId,
      newNumbers: [],
      releasedCount: 0,
      ok: false,
      reason: "当前组至少两个区域才能解组"
    }
  }
  const used = new Set(getIoMaskNumbers({ version: 1, regions: regions as IoRectRegion[] }))
  let nextFree = used.size > 0 ? Math.max(...used) + 1 : 1
  const newNumbers: number[] = []
  const idToNewN = new Map<string, number>()
  // 稳定顺序：按原 regions 出现顺序，聚焦区跳过
  for (const r of regions) {
    if (r.n !== focus.n || r.id === focusRegionId) continue
    while (used.has(nextFree)) nextFree += 1
    idToNewN.set(r.id, nextFree)
    newNumbers.push(nextFree)
    used.add(nextFree)
    nextFree += 1
  }
  const remapped = regions.map(r => {
    const neu = idToNewN.get(r.id)
    return neu != null ? { ...r, n: neu } : r
  })
  // 本地不强制 compact：新号已连续接在 max 后；保存端再压 1..k
  return {
    regions: remapped,
    keptN: focus.n,
    focusRegionId,
    newNumbers,
    releasedCount: newNumbers.length,
    ok: true
  }
}

export type IoUngroupKeeperResult = {
  keeperRegionId: string
  adjustedFromFocus: boolean
  previousNumber: number | null
}

/**
 * 解组前选择真正承载旧进度的区域。
 * 新画区域没有 previous region id，不能声称它会保留既有 SRS；此时优先选择
 * 当前组内、原编号相同的旧区域，其次选择任一旧区域。全新未保存组才保留焦点。
 */
export function chooseIoUngroupProgressKeeper(
  regions: readonly IoRectRegion[],
  focusRegionId: string,
  previous: IoMasksPayload | null | undefined
): IoUngroupKeeperResult {
  const focus = regions.find(r => r.id === focusRegionId)
  if (!focus) {
    throw new Error("解组聚焦区域不存在")
  }
  const group = regions.filter(r => r.n === focus.n)
  const previousNumberById = new Map<string, number>()
  for (const r of previous?.regions ?? []) {
    previousNumberById.set(r.id, r.n)
  }

  const focusPreviousNumber = previousNumberById.get(focusRegionId) ?? null
  let keeper =
    focusPreviousNumber === focus.n
      ? focus
      : group.find(r => previousNumberById.get(r.id) === focus.n)
  if (!keeper && focusPreviousNumber != null) keeper = focus
  if (!keeper) keeper = group.find(r => previousNumberById.has(r.id))
  keeper ??= focus

  return {
    keeperRegionId: keeper.id,
    adjustedFromFocus: keeper.id !== focusRegionId,
    previousNumber: previousNumberById.get(keeper.id) ?? null
  }
}

/**
 * 删除选中区域；若某编号删光则 compact 为 1..k。region id 保留于剩余项。
 */
export function deleteIoRegionsByIds(
  regions: readonly IoRectRegion[],
  ids: ReadonlySet<string> | readonly string[]
): {
  regions: IoRectRegion[]
  deletedIds: string[]
  numberMap: Record<number, number>
  renames: IoNumberRename[]
  emptiedNumbers: number[]
} {
  const idSet = toIdSet(ids)
  const deletedIds = regions.filter(r => idSet.has(r.id)).map(r => r.id)
  const beforeNums = new Set(
    getIoMaskNumbers({ version: 1, regions: regions as IoRectRegion[] })
  )
  const filtered = regions.filter(r => !idSet.has(r.id))
  const compacted = compactIoMaskRegions(filtered)
  const afterNums = new Set(getIoMaskNumbers({ version: 1, regions: compacted.regions }))
  // 删光的旧编号：compact 前已不在 filtered 中
  const emptiedNumbers = Array.from(beforeNums)
    .filter(n => !filtered.some(r => r.n === n))
    .sort((a, b) => a - b)
  return {
    regions: compacted.regions,
    deletedIds,
    numberMap: compacted.numberMap,
    renames: compacted.renames,
    emptiedNumbers
  }
}

/**
 * 整体平移选中区域；所有坐标限制在 [0,1]，不重建 id。
 * 多选时共用同一 delta，按最紧约束 clamp。
 */
export function translateIoRegionsClamped(
  regions: readonly IoRectRegion[],
  ids: ReadonlySet<string> | readonly string[],
  dx: number,
  dy: number
): IoRectRegion[] {
  const idSet = toIdSet(ids)
  const selected = regions.filter(r => idSet.has(r.id))
  if (selected.length === 0 || (!Number.isFinite(dx) && !Number.isFinite(dy))) {
    return regions as IoRectRegion[]
  }
  let cdx = Number.isFinite(dx) ? dx : 0
  let cdy = Number.isFinite(dy) ? dy : 0
  for (const r of selected) {
    cdx = Math.min(cdx, 1 - r.x - r.w)
    cdx = Math.max(cdx, -r.x)
    cdy = Math.min(cdy, 1 - r.y - r.h)
    cdy = Math.max(cdy, -r.y)
  }
  // 浮点边沿（如 0.8+0.2）会产生 1e-16 级噪声，压成 0 避免「看起来没动却改坐标」
  if (Math.abs(cdx) < 1e-12) cdx = 0
  if (Math.abs(cdy) < 1e-12) cdy = 0
  if (cdx === 0 && cdy === 0) return regions as IoRectRegion[]
  return regions.map(r => {
    if (!idSet.has(r.id)) return r
    const x = clamp01(r.x + cdx)
    const y = clamp01(r.y + cdy)
    // 保持 w/h，必要时再收缩以免 x+w 越界
    let w = r.w
    let h = r.h
    if (x + w > 1) w = 1 - x
    if (y + h > 1) h = 1 - y
    return { ...r, x, y, w, h }
  })
}

export type IoResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"

/**
 * 单区角/边缩放；id 不变，结果 clamp 到 [0,1]；过小则保持原几何。
 */
export function resizeIoRegionClamped(
  region: IoRectRegion,
  handle: IoResizeHandle,
  dx: number,
  dy: number
): IoRectRegion {
  let { x, y, w, h } = region
  const adx = Number.isFinite(dx) ? dx : 0
  const ady = Number.isFinite(dy) ? dy : 0
  if (handle.includes("e")) w = w + adx
  if (handle.includes("w")) {
    x = x + adx
    w = w - adx
  }
  if (handle.includes("s")) h = h + ady
  if (handle.includes("n")) {
    y = y + ady
    h = h - ady
  }
  const norm = normalizeRect({ x, y, w, h })
  if (norm.w <= 0 || norm.h <= 0) return region
  return { ...region, ...norm }
}

/**
 * 复习/预览：当前编号 + 模式下，题面/答案应绘制的遮罩区域。
 * 与 ImageOcclusionReviewRenderer / 编辑器预览共用。
 */
export function getVisibleIoMaskRegions(
  regions: readonly IoRectRegion[],
  currentN: number,
  mode: ImageOcclusionModeSetting,
  showAnswer: boolean
): IoRectRegion[] {
  if (!Number.isInteger(currentN) || currentN < 1) return []
  if (mode === "hideOne") {
    if (showAnswer) return []
    return regions.filter(r => r.n === currentN) as IoRectRegion[]
  }
  if (mode === "hideAll") {
    if (!showAnswer) return regions as IoRectRegion[]
    return regions.filter(r => r.n !== currentN) as IoRectRegion[]
  }
  // hideAllRevealAll
  if (!showAnswer) return regions as IoRectRegion[]
  return []
}

/** 短中文标签（编辑器/复习条） */
export function ioModeShortLabel(mode: ImageOcclusionModeSetting): string {
  switch (mode) {
    case "hideOne":
      return "只遮当前"
    case "hideAll":
      return "全遮揭当前"
    case "hideAllRevealAll":
      return "全遮揭全部"
    default:
      return mode
  }
}

/**
 * 解析每图 srs.io.mode 原始值。
 * - 缺失/空：返回 null（调用方继承全局）
 * - 合法：返回该模式
 * - 非法：console.warn 并返回 null（调用方回退全局，不得静默当合法）
 */
export function parseIoModeProperty(raw: unknown): ImageOcclusionModeSetting | null {
  if (raw == null || raw === "") return null
  if (isImageOcclusionMode(raw)) return raw
  console.warn(
    `[imageOcclusion] 无效的 srs.io.mode=${JSON.stringify(raw)}，将回退全局模式`
  )
  return null
}

export function readIoModeFromBlock(
  block: Block | null | undefined
): ImageOcclusionModeSetting | null {
  if (!block?.properties?.length) return null
  const prop = block.properties.find(p => p.name === IO_MODE_PROP)
  if (prop?.value == null || prop.value === "") return null
  return parseIoModeProperty(prop.value)
}

/**
 * 每图优先；缺失或非法回退 globalMode（非法已在 parseIoModeProperty warn）。
 */
export function resolveEffectiveIoMode(
  perImage: ImageOcclusionModeSetting | null | undefined,
  globalMode: ImageOcclusionModeSetting
): ImageOcclusionModeSetting {
  return perImage ?? globalMode
}

/**
 * 按 region id 把「保存后最终编号」对齐到「先前编号」的 SRS 进度。
 * 编辑器可能已在本地 compact，因此不能只靠号码差集。
 */
export function planIoSrsNumberOps(
  previous: IoMasksPayload | null | undefined,
  finalRegions: readonly IoRectRegion[]
): {
  deleted: number[]
  moves: IoNumberRename[]
  keep: number[]
  created: number[]
} {
  const prevRegions = previous?.regions ?? []
  const idToPrevN = new Map<string, number>()
  for (const r of prevRegions) {
    if (r.id && Number.isInteger(r.n) && r.n >= 1) {
      idToPrevN.set(r.id, r.n)
    }
  }
  const prevNumbers = new Set(getIoMaskNumbers(previous))
  const finalNumbers = getIoMaskNumbers({
    version: 1,
    regions: finalRegions as IoRectRegion[]
  })

  const finalToSource = new Map<number, number | null>()
  for (const n of finalNumbers) {
    const sources = new Set<number>()
    for (const r of finalRegions) {
      if (r.n !== n) continue
      const pn = idToPrevN.get(r.id)
      if (pn != null) sources.add(pn)
    }
    if (sources.size === 0) {
      finalToSource.set(n, null)
    } else if (sources.size === 1) {
      finalToSource.set(n, sources.values().next().value as number)
    } else {
      // 同最终编号下混入多个旧编号（异常编辑路径）：取最小旧号，进度可预期
      const pick = Math.min(...sources)
      console.warn(
        `[imageOcclusion] 最终 c${n} 对应多个旧编号 ${[...sources].join(",")}，取 c${pick} 进度`
      )
      finalToSource.set(n, pick)
    }
  }

  const usedSources = new Set<number>()
  const moves: IoNumberRename[] = []
  const keep: number[] = []
  const created: number[] = []

  for (const n of finalNumbers) {
    const src = finalToSource.get(n) ?? null
    if (src == null) {
      created.push(n)
      continue
    }
    if (usedSources.has(src)) {
      console.warn(
        `[imageOcclusion] 旧编号 c${src} 被多个最终编号争用，c${n} 按新建处理`
      )
      created.push(n)
      continue
    }
    usedSources.add(src)
    if (src === n) keep.push(n)
    else moves.push({ from: src, to: n })
  }

  const deleted = Array.from(prevNumbers)
    .filter(n => !usedSources.has(n))
    .sort((a, b) => a - b)

  return { deleted, moves, keep, created }
}

export type IoPendingSrsPayload = {
  version: 1
  deleted: number[]
  moves: IoNumberRename[]
  keep: number[]
  created: number[]
}

export function serializeIoPendingSrs(ops: IoPendingSrsPayload): string {
  return JSON.stringify({
    version: 1 as const,
    deleted: ops.deleted,
    moves: ops.moves,
    keep: ops.keep,
    created: ops.created
  })
}

export function parseIoPendingSrs(raw: unknown): IoPendingSrsPayload | null {
  if (raw == null || raw === "") return null
  let obj: unknown = raw
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw)
    } catch (error) {
      console.error("[imageOcclusion] srs.io.pendingSrs JSON 解析失败:", error)
      throw new Error(
        `图片遮罩挂起迁移数据损坏（srs.io.pendingSrs 不是合法 JSON）: ${String(error)}`
      )
    }
  }
  if (!obj || typeof obj !== "object") {
    throw new Error("图片遮罩挂起迁移数据损坏：srs.io.pendingSrs 不是对象")
  }
  const version = (obj as { version?: unknown }).version
  if (version !== 1) {
    throw new Error(`不支持的 srs.io.pendingSrs 版本: ${String(version)}`)
  }
  const asNums = (v: unknown, label: string): number[] => {
    if (!Array.isArray(v)) {
      throw new Error(`srs.io.pendingSrs.${label} 必须是数组`)
    }
    return v.map((n, i) => {
      const num = Number(n)
      if (!Number.isInteger(num) || num < 1) {
        throw new Error(`srs.io.pendingSrs.${label}[${i}] 非法: ${String(n)}`)
      }
      return num
    })
  }
  const movesRaw = (obj as { moves?: unknown }).moves
  if (!Array.isArray(movesRaw)) {
    throw new Error("srs.io.pendingSrs.moves 必须是数组")
  }
  const moves: IoNumberRename[] = movesRaw.map((m, i) => {
    if (!m || typeof m !== "object") {
      throw new Error(`srs.io.pendingSrs.moves[${i}] 非法`)
    }
    const from = Number((m as { from?: unknown }).from)
    const to = Number((m as { to?: unknown }).to)
    if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < 1) {
      throw new Error(`srs.io.pendingSrs.moves[${i}] from/to 非法`)
    }
    return { from, to }
  })
  return {
    version: 1,
    deleted: asNums((obj as { deleted?: unknown }).deleted, "deleted"),
    moves,
    keep: asNums((obj as { keep?: unknown }).keep, "keep"),
    created: asNums((obj as { created?: unknown }).created, "created")
  }
}

export function readIoPendingSrsFromBlock(
  block: Block | null | undefined
): IoPendingSrsPayload | null {
  if (!block?.properties?.length) return null
  const prop = block.properties.find(p => p.name === IO_PENDING_SRS_PROP)
  if (prop?.value == null || prop.value === "") return null
  return parseIoPendingSrs(prop.value)
}

export async function clearIoPendingSrs(hostBlockId: DbId): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [hostBlockId],
    [IO_PENDING_SRS_PROP]
  )
  invalidateBlockCache(hostBlockId)
}

/** 同块 IO 保存/删除/迁移串行化（进程内；防编辑器与 Flash Home 并发互踩） */
const ioBlockLocks = new Map<string, Promise<unknown>>()

export async function withIoBlockLock<T>(
  hostBlockId: DbId,
  fn: () => Promise<T>
): Promise<T> {
  const key = String(hostBlockId)
  const prev = ioBlockLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const chained = prev.then(() => gate)
  ioBlockLocks.set(key, chained)
  await prev.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
    if (ioBlockLocks.get(key) === chained) {
      ioBlockLocks.delete(key)
    }
  }
}

/**
 * 写序安全地应用 cloze 编号迁移：先删 deleted，再按 to 升序 move。
 * 调用方须已成功写入 masks（及 pending）。可幂等重放。
 */
export async function applyIoClozeNumberOps(
  hostBlockId: DbId,
  ops: {
    deleted: number[]
    moves: IoNumberRename[]
    keep: number[]
    created: number[]
  }
): Promise<void> {
  for (const n of ops.deleted) {
    await deleteClozeCardSrsData(hostBlockId, n)
  }
  // 压号只向更小编号移动；按 to 升序保证目标槽已空
  const moves = [...ops.moves].sort((a, b) => a.to - b.to || a.from - b.from)
  for (const { from, to } of moves) {
    await moveClozeCardSrsData(hostBlockId, from, to, {
      requireSource: true,
      overwriteTarget: false
    })
  }
  for (const n of ops.keep) {
    await ensureClozeSrsState(hostBlockId, n, n - 1)
  }
  for (const n of ops.created) {
    await writeInitialClozeSrsState(hostBlockId, n, n - 1)
  }
}

/**
 * 若存在 srs.io.pendingSrs，幂等重放 SRS 迁移后清除挂起标记。
 * @returns 是否执行了恢复
 */
export async function resumePendingIoSrsOps(
  hostBlockId: DbId,
  options?: { backendBlock?: Block }
): Promise<boolean> {
  const block =
    options?.backendBlock ??
    (await loadBlockForIo(hostBlockId, { forceBackend: true }))
  let pending: IoPendingSrsPayload | null
  try {
    pending = readIoPendingSrsFromBlock(block)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`读取挂起迁移失败，请先修复块 #${hostBlockId}：${msg}`)
  }
  if (!pending) return false
  console.warn(
    `[imageOcclusion] 恢复未完成的 SRS 编号迁移 block=#${hostBlockId} deleted=${pending.deleted.join(",")} moves=${pending.moves.map(m => `${m.from}→${m.to}`).join(",")}`
  )
  await applyIoClozeNumberOps(hostBlockId, pending)
  await clearIoPendingSrs(hostBlockId)
  return true
}

/**
 * Flash Home 本地列表：删掉指定 IO 编号后，按 renames 一次性改写同块剩余 clozeNumber。
 * renames 必须按 from→to 单次映射（禁止链式就地改写导致 c4→c3→c2）。
 */
export function applyIoVariantDeleteToCardList<
  T extends { id: unknown; cardType?: string; clozeNumber?: number }
>(
  cards: readonly T[],
  blockId: T["id"],
  deletedClozeNumber: number,
  renames: readonly IoNumberRename[]
): T[] {
  const map = new Map<number, number>()
  for (const r of renames) map.set(r.from, r.to)
  return cards
    .filter(
      c =>
        !(
          c.id === blockId &&
          c.cardType === IMAGE_OCCLUSION_CARD_TYPE &&
          c.clozeNumber === deletedClozeNumber
        )
    )
    .map(c => {
      if (
        c.id !== blockId ||
        c.cardType !== IMAGE_OCCLUSION_CARD_TYPE ||
        c.clozeNumber == null
      ) {
        return c
      }
      const nextN = map.get(c.clozeNumber)
      if (nextN == null || nextN === c.clozeNumber) return c
      return { ...c, clozeNumber: nextN }
    })
}

// ---------------------------------------------------------------------------
// 几何 / JSON
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function normalizeRect(
  partial: Pick<IoRectRegion, "x" | "y" | "w" | "h">
): Pick<IoRectRegion, "x" | "y" | "w" | "h"> {
  let x = Number(partial.x)
  let y = Number(partial.y)
  let w = Number(partial.w)
  let h = Number(partial.h)
  if (![x, y, w, h].every(Number.isFinite)) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  // 允许从任意角拖：先归一负宽高，再 clamp 到 [0,1]
  if (w < 0) {
    x = x + w
    w = Math.abs(w)
  }
  if (h < 0) {
    y = y + h
    h = Math.abs(h)
  }
  x = clamp01(x)
  y = clamp01(y)
  if (x + w > 1) w = 1 - x
  if (y + h > 1) h = 1 - y
  w = Math.max(0, w)
  h = Math.max(0, h)
  // 过小区域视为无效
  if (w < 0.005 || h < 0.005) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  return { x, y, w, h }
}

export function createRegionId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function parseIoMasksPayload(raw: unknown): IoMasksPayload | null {
  if (raw == null || raw === "") return null
  let obj: unknown = raw
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw)
    } catch (error) {
      console.error("[imageOcclusion] srs.io.masks JSON 解析失败:", error)
      throw new Error(`图片遮罩数据损坏（srs.io.masks 不是合法 JSON）: ${String(error)}`)
    }
  }
  if (!obj || typeof obj !== "object") {
    throw new Error("图片遮罩数据损坏：srs.io.masks 不是对象")
  }
  const version = (obj as { version?: unknown }).version
  const regionsRaw = (obj as { regions?: unknown }).regions
  if (version !== 1) {
    throw new Error(`不支持的图片遮罩数据版本: ${String(version)}`)
  }
  if (!Array.isArray(regionsRaw)) {
    throw new Error("图片遮罩数据损坏：regions 不是数组")
  }

  const regions: IoRectRegion[] = []
  for (const item of regionsRaw) {
    if (!item || typeof item !== "object") continue
    const n = Number((item as { n?: unknown }).n)
    const shape = (item as { shape?: unknown }).shape
    if (!Number.isInteger(n) || n < 1) continue
    if (shape !== "rect") continue
    const rect = normalizeRect({
      x: Number((item as { x?: unknown }).x),
      y: Number((item as { y?: unknown }).y),
      w: Number((item as { w?: unknown }).w),
      h: Number((item as { h?: unknown }).h)
    })
    if (rect.w <= 0 || rect.h <= 0) continue
    const idRaw = (item as { id?: unknown }).id
    const id =
      typeof idRaw === "string" && idRaw.length > 0 ? idRaw : createRegionId()
    regions.push({ id, n, shape: "rect", ...rect })
  }
  return { version: 1, regions }
}

export function serializeIoMasksPayload(payload: IoMasksPayload): string {
  return JSON.stringify({
    version: 1 as const,
    regions: payload.regions.map(r => ({
      id: r.id,
      n: r.n,
      shape: "rect" as const,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h
    }))
  })
}

export function getIoMaskNumbers(payload: IoMasksPayload | null | undefined): number[] {
  if (!payload?.regions?.length) return []
  const set = new Set<number>()
  for (const r of payload.regions) {
    if (Number.isInteger(r.n) && r.n >= 1) set.add(r.n)
  }
  return Array.from(set).sort((a, b) => a - b)
}

export function readIoMasksFromBlock(block: Block | null | undefined): IoMasksPayload | null {
  if (!block?.properties?.length) return null
  const prop = block.properties.find(p => p.name === IO_MASKS_PROP)
  if (prop?.value == null || prop.value === "") return null
  return parseIoMasksPayload(prop.value)
}

export function readStoredIoSrc(block: Block | null | undefined): string | null {
  if (!block?.properties?.length) return null
  const prop = block.properties.find(p => p.name === IO_SRC_PROP)
  if (typeof prop?.value === "string" && prop.value.length > 0) return prop.value
  return null
}

// ---------------------------------------------------------------------------
// 图片源解析
// ---------------------------------------------------------------------------

const INLINE_IMAGE_TYPES = new Set(["i", "img", "image"])

function getRepr(block: Block | BlockWithRepr | null | undefined): Record<string, any> | null {
  if (!block) return null
  const live = (block as BlockWithRepr)._repr
  if (live && typeof live === "object") return live as Record<string, any>
  const prop = block.properties?.find(p => p.name === "_repr")
  if (prop?.value && typeof prop.value === "object") {
    return prop.value as Record<string, any>
  }
  return null
}

function extractSrcFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    for (const key of ["src", "url", "path", "href", "attachmentUrl"]) {
      if (typeof o[key] === "string" && (o[key] as string).trim()) {
        return (o[key] as string).trim()
      }
    }
  }
  return null
}

/** 从块 _repr / 属性中取图片 src（原生 image 块） */
export function getBlockImageSrc(block: Block | null | undefined): string | null {
  if (!block) return null
  const repr = getRepr(block)
  if (repr) {
    const type = String(repr.type ?? "").toLowerCase()
    if (
      type === "image" ||
      type === "img" ||
      type === "srs.image-occlusion" ||
      type.endsWith(".image")
    ) {
      const fromRepr = extractSrcFromUnknown(repr.src) ?? extractSrcFromUnknown(repr)
      if (fromRepr) return fromRepr
    }
    // 部分宿主可能 type 不同但有 src
    if (typeof repr.src === "string" && repr.src.trim()) {
      if (type === "image" || type === "img" || type === "srs.image-occlusion") {
        return repr.src.trim()
      }
    }
  }
  for (const name of ["src", "attachmentUrl", "image"]) {
    const prop = block.properties?.find(p => p.name === name)
    const src = extractSrcFromUnknown(prop?.value)
    if (src) return src
  }
  return null
}

export function isImageLikeBlock(block: Block | null | undefined): boolean {
  if (!block) return false
  if (getBlockImageSrc(block)) return true
  const repr = getRepr(block)
  if (!repr) return false
  const type = String(repr.type ?? "").toLowerCase()
  return (
    type === "image" ||
    type === "img" ||
    type === "srs.image-occlusion" ||
    type.endsWith(".image")
  )
}

function fragmentImageSrc(fragment: ContentFragment): string | null {
  const t = String(fragment.t ?? "").toLowerCase()
  if (!INLINE_IMAGE_TYPES.has(t) && t !== "image") return null
  return (
    extractSrcFromUnknown(fragment.v) ??
    extractSrcFromUnknown((fragment as any).src) ??
    extractSrcFromUnknown(fragment)
  )
}

// 路径解析实现已抽到 repoAssetPath.ts（TTS 播放共用）；此处 re-export 保持原导入路径稳定。
export {
  absolutePathToFileUrl,
  resolveImageDisplayUrl,
  resolveRepoAssetAbsolutePath,
  resolveRepoAssetDisplayUrl
} from "./repoAssetPath"

/**
 * 从宿主块收集可选图片：自身 image 块、content 内 inline 图、直接子 image 块。
 */
export function collectImageSources(hostBlock: Block): ResolvedImageSource[] {
  const out: ResolvedImageSource[] = []
  const seen = new Set<string>()

  const push = (item: ResolvedImageSource) => {
    if (!item.src || seen.has(item.key)) return
    seen.add(item.key)
    out.push(item)
  }

  const selfSrc = getBlockImageSrc(hostBlock)
  if (selfSrc) {
    push({
      key: `block:${hostBlock.id}`,
      kind: "block-repr",
      imageBlockId: hostBlock.id,
      src: selfSrc,
      label: `本块图片`
    })
  }

  const content = hostBlock.content ?? []
  content.forEach((frag, index) => {
    const src = fragmentImageSrc(frag)
    if (!src) return
    push({
      key: `inline:${hostBlock.id}:${index}`,
      kind: "inline-fragment",
      imageBlockId: hostBlock.id,
      src,
      fragmentIndex: index,
      label: `行内图片 #${index + 1}`
    })
  })

  // 与 resolveIoLaunchTarget 同一有界上限，避免 state 里无限扫子块
  const children = (hostBlock.children ?? []).slice(0, IO_MAX_CHILD_SCAN)
  for (const childId of children) {
    const child =
      (typeof orca !== "undefined"
        ? (orca.state?.blocks?.[childId] as Block | undefined)
        : undefined) ?? undefined
    if (!child) continue
    const src = getBlockImageSrc(child)
    if (!src) continue
    push({
      key: `child:${childId}`,
      kind: "child-block",
      imageBlockId: childId,
      src,
      label: `子块图片 #${childId}`
    })
  }

  return out
}

export type LoadBlockForIoOptions = {
  /** true：强制后端 get-block，避免 orca.state 陈旧覆盖（删除/改 masks 路径必须） */
  forceBackend?: boolean
}

export async function loadBlockForIo(
  blockId: DbId,
  options?: LoadBlockForIoOptions
): Promise<Block> {
  if (!options?.forceBackend) {
    const live =
      typeof orca !== "undefined" ? orca.state?.blocks?.[blockId] : undefined
    if (live) return live as Block
  }
  const block = (await orca.invokeBackend("get-block", blockId)) as
    | Block
    | null
    | undefined
  if (!block) {
    throw new Error(`无法读取块 #${blockId}`)
  }
  return block
}

/** 读取保存 IO 前备份的原生 _repr（若有） */
export function readIoPrevRepr(
  block: Block | null | undefined
): Record<string, unknown> | null {
  if (!block?.properties?.length) return null
  const prop = block.properties.find(p => p.name === IO_PREV_REPR_PROP)
  if (prop?.value == null || prop.value === "") return null
  try {
    const raw =
      typeof prop.value === "string" ? JSON.parse(prop.value) : prop.value
    if (raw && typeof raw === "object") return raw as Record<string, unknown>
  } catch (error) {
    console.error("[imageOcclusion] srs.io.prevRepr 解析失败:", error)
    throw new Error(
      `图片遮罩 prevRepr 损坏: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return null
}

/**
 * 纯图片宿主：切换 _repr 为 srs.image-occlusion 以便笔记内实心遮罩预览；
 * 首次切换时备份原 image _repr 到 srs.io.prevRepr。
 * 行内图 / 子块图宿主：不改 _repr（v1 预览合同：仅纯图片块笔记内保留遮罩）。
 */
async function applyImageOcclusionBlockPreview(
  hostBlockId: DbId,
  source: ResolvedImageSource
): Promise<void> {
  if (source.kind !== "block-repr" || source.imageBlockId !== hostBlockId) {
    return
  }
  const liveAfter = (await loadBlockForIo(hostBlockId, {
    forceBackend: true
  })) as BlockWithRepr
  if (!isImageLikeBlock(liveAfter)) return

  const prevRepr = getRepr(liveAfter) ?? { type: "image", src: source.src }
  const alreadyIo = String(prevRepr.type ?? "") === "srs.image-occlusion"
  const props: Array<{ name: string; value: unknown; type: number }> = []

  if (!alreadyIo && !readIoPrevRepr(liveAfter)) {
    props.push({
      name: IO_PREV_REPR_PROP,
      value: JSON.stringify(prevRepr),
      type: PROP_TYPE_TEXT
    })
  }

  // 写属性（prevRepr）+ live _repr 供渲染器
  if (props.length > 0) {
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [hostBlockId],
      props
    )
    invalidateBlockCache(hostBlockId)
  }

  const fresh = (await loadBlockForIo(hostBlockId, {
    forceBackend: true
  })) as BlockWithRepr
  fresh._repr = {
    ...(getRepr(fresh) ?? prevRepr),
    type: "srs.image-occlusion",
    src: source.src
  }
}

/**
 * 整卡删除后恢复原生 image 渲染。
 *
 * 安全规则（Sol 复核 High）：
 * - **仅**当曾切到 `srs.image-occlusion`（有 prevRepr，或 live 仍是该 type）才改 `_repr`
 * - 行内图 / 子块图宿主创建时不改 `_repr`、也无 prevRepr → **禁止**用 srs.io.src 强行写成 image
 * - 调用方须在 deleteCardSrsData **之前**读出 prevRepr/src
 *
 * @returns 是否实际改写了 _repr
 */
export async function restoreImageBlockReprAfterIoRemoval(
  hostBlockId: DbId,
  options?: {
    prevRepr?: Record<string, unknown> | null
    fallbackSrc?: string | null
  }
): Promise<{ restored: boolean; reason: string }> {
  const live = (await loadBlockForIo(hostBlockId, {
    forceBackend: true
  })) as BlockWithRepr
  const prev = options?.prevRepr
  const fallbackSrc = options?.fallbackSrc
  const currentType = String(getRepr(live)?.type ?? "")

  if (prev && typeof prev === "object") {
    live._repr = { ...prev } as any
    return { restored: true, reason: "prevRepr" }
  }

  // 仅当宿主当前仍是插件接管的 IO 预览块时，才用 fallback 回到 image
  if (currentType === "srs.image-occlusion") {
    if (fallbackSrc) {
      live._repr = { type: "image", src: fallbackSrc }
      return { restored: true, reason: "fallbackSrc-on-io-repr" }
    }
    live._repr = { type: "image" }
    console.warn(
      `[imageOcclusion] 块 #${hostBlockId} 为 srs.image-occlusion 但无 prevRepr/src，已降级为 type=image`
    )
    return { restored: true, reason: "io-repr-without-src" }
  }

  // 文本/行内/子块宿主：从未改 _repr，整卡删除只清 srs 属性即可
  return {
    restored: false,
    reason: `skip-non-io-host(type=${currentType || "none"})`
  }
}

// ---------------------------------------------------------------------------
// 持久化 / 制卡
// ---------------------------------------------------------------------------

const CONFLICTING_TYPES = new Set([
  "cloze",
  "direction",
  "list",
  "choice",
  "topic",
  "extracts"
])

export function assertHostAcceptsImageOcclusion(block: Block): void {
  const type = extractCardType(block)
  if (type === IMAGE_OCCLUSION_CARD_TYPE || type === "basic" || type === "excerpt") {
    return
  }
  if (CONFLICTING_TYPES.has(type)) {
    throw new Error(
      `当前块已是 ${type} 卡，不能与图片遮罩混用。请换一块或先删除该卡类型。`
    )
  }
}

/**
 * 写入遮罩并确保 #card type=image-occlusion + 各编号 FSRS。
 * 保存时强制编号紧凑为 1..k；按 region id 迁移/删除 srs.cN.*（删洞后后续编号前移且保留进度）。
 * 写序：resume pending → masks+pending 同写 → apply SRS → 清 pending。
 * 损坏的 srs.io.masks 直接抛错（错误可见）。
 */
export async function saveImageOcclusion(
  input: SaveImageOcclusionInput
): Promise<SaveImageOcclusionResult> {
  const { hostBlockId, source, regions, pluginName, reviewMode } = input
  return withIoBlockLock(hostBlockId, async () => {
    // 先恢复上次中断的迁移，避免用脏编号基线做 plan
    await resumePendingIoSrsOps(hostBlockId)

    const block = await loadBlockForIo(hostBlockId, { forceBackend: true })
    assertHostAcceptsImageOcclusion(block)

    if (!isImageOcclusionMode(reviewMode)) {
      throw new Error(`非法图片遮罩复习模式: ${String(reviewMode)}`)
    }

    const normalizedRegions: IoRectRegion[] = []
    for (const r of regions) {
      const rect = normalizeRect(r)
      if (rect.w <= 0 || rect.h <= 0) continue
      if (!Number.isInteger(r.n) || r.n < 1) {
        throw new Error(`非法遮罩编号: ${r.n}`)
      }
      normalizedRegions.push({
        id: r.id || createRegionId(),
        n: r.n,
        shape: "rect",
        ...rect
      })
    }
    if (normalizedRegions.length === 0) {
      throw new Error("请至少绘制一个遮罩矩形")
    }

    // 强制 1..k，避免洞号（编辑器本地也会 compact，此处再保证一次）
    const compacted = compactIoMaskRegions(normalizedRegions)
    const payload: IoMasksPayload = { version: 1, regions: compacted.regions }
    const numbers = getIoMaskNumbers(payload)
    // 损坏 masks：readIoMasksFromBlock 抛错，不得吞成 null
    const previous = readIoMasksFromBlock(block)
    const srsOps = planIoSrsNumberOps(previous, compacted.regions)
    const pending: IoPendingSrsPayload = {
      version: 1,
      deleted: srsOps.deleted,
      moves: srsOps.moves,
      keep: srsOps.keep,
      created: srsOps.created
    }

    const hasCardTag =
      block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false
    let addedCardTag = false

    if (!hasCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        null,
        hostBlockId,
        "card",
        await buildCardTagData(pluginName, hostBlockId, IMAGE_OCCLUSION_CARD_TYPE)
      )
      await ensureCardTagProperties(pluginName)
      addedCardTag = true
    } else {
      const live = (await loadBlockForIo(hostBlockId, {
        forceBackend: true
      })) as Block
      const cardRef = live.refs?.find(
        ref => ref.type === 2 && isCardTag(ref.alias)
      )
      if (!cardRef) {
        throw new Error("已有 #card 标签但无法读取其引用数据")
      }
      await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        cardRef,
        [{ name: "type", value: IMAGE_OCCLUSION_CARD_TYPE }]
      )
    }

    // masks / src / mode / pending 同次写入：迁移中断后可幂等恢复；mode 不留孤儿
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [hostBlockId],
      [
        { name: "srs.isCard", value: true, type: 4 },
        {
          name: IO_MASKS_PROP,
          value: serializeIoMasksPayload(payload),
          type: PROP_TYPE_TEXT
        },
        { name: IO_SRC_PROP, value: source.src, type: PROP_TYPE_TEXT },
        {
          name: IO_MODE_PROP,
          value: reviewMode,
          type: PROP_TYPE_TEXT
        },
        {
          name: IO_PENDING_SRS_PROP,
          value: serializeIoPendingSrs(pending),
          type: PROP_TYPE_TEXT
        }
      ]
    )
    invalidateBlockCache(hostBlockId)

    await applyImageOcclusionBlockPreview(hostBlockId, source)

    await applyIoClozeNumberOps(hostBlockId, pending)
    await clearIoPendingSrs(hostBlockId)

    return {
      hostBlockId,
      numbers,
      createdNumbers: srsOps.created,
      removedNumbers: srsOps.deleted,
      renames: srsOps.moves,
      regionCount: compacted.regions.length,
      addedCardTag
    }
  })
}

/**
 * 从 masks 中移除某一编号的全部区域，压成 1..k，并完成 SRS 删除/迁移。
 * - 目标编号必须存在于 masks，否则抛错（陈旧 UI 不得 silent no-op）
 * - 写序：masks+pending 同写 → apply SRS → 清 pending
 * - 无剩余区域：clearedAll=true，**不**在此删整卡 SRS（由调用方整卡删除）
 */
export async function removeIoNumberFromMasks(
  hostBlockId: DbId,
  clozeNumber: number,
  options?: {
    /** 已从 backend 读出的块；传入则不再二次 get-block（仍会先 resume） */
    backendBlock?: Block
  }
): Promise<{
  remainingNumbers: number[]
  clearedAll: boolean
  /** 过滤被删编号后、紧凑重排产生的 from→to（旧号仍为删前编号体系） */
  renames: IoNumberRename[]
}> {
  return withIoBlockLock(hostBlockId, async () => {
    await resumePendingIoSrsOps(hostBlockId)

    const block =
      options?.backendBlock ??
      (await loadBlockForIo(hostBlockId, { forceBackend: true }))
    // resume 可能已改属性；强制再读一次 masks 基线
    const fresh = await loadBlockForIo(hostBlockId, { forceBackend: true })
    const payload = readIoMasksFromBlock(fresh)
    if (!payload) {
      throw new Error(
        `块 #${hostBlockId} 缺少 srs.io.masks，无法删除遮罩编号 c${clozeNumber}`
      )
    }
    const numbers = getIoMaskNumbers(payload)
    if (!numbers.includes(clozeNumber)) {
      throw new Error(
        `遮罩编号 c${clozeNumber} 不存在于 masks（当前: c${numbers.join("、c") || "无"}），拒绝删除（列表可能已过期）`
      )
    }

    const nextRegions = payload.regions.filter(r => r.n !== clozeNumber)
    if (nextRegions.length === 0) {
      // 末变体：对称清全部 IO 宿主属性（含 srs.io.mode）；整卡 srs/#card 由调用方处理
      await orca.commands.invokeEditorCommand(
        "core.editor.deleteProperties",
        null,
        [hostBlockId],
        [...IO_HOST_PROPERTY_NAMES]
      )
      invalidateBlockCache(hostBlockId)
      return { remainingNumbers: [], clearedAll: true, renames: [] }
    }

    const compacted = compactIoMaskRegions(nextRegions)
    const next: IoMasksPayload = { version: 1, regions: compacted.regions }
    const remainingNumbers = getIoMaskNumbers(next)
    const keep = remainingNumbers.filter(n => {
      // 未参与 rename 的最终号 = 旧号仍等于新号
      return !compacted.renames.some(r => r.to === n)
    })
    const pending: IoPendingSrsPayload = {
      version: 1,
      deleted: [clozeNumber],
      moves: compacted.renames,
      keep,
      created: []
    }

    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [hostBlockId],
      [
        {
          name: IO_MASKS_PROP,
          value: serializeIoMasksPayload(next),
          type: PROP_TYPE_TEXT
        },
        {
          name: IO_PENDING_SRS_PROP,
          value: serializeIoPendingSrs(pending),
          type: PROP_TYPE_TEXT
        }
      ]
    )
    invalidateBlockCache(hostBlockId)

    await applyIoClozeNumberOps(hostBlockId, pending)
    await clearIoPendingSrs(hostBlockId)

    return {
      remainingNumbers,
      clearedAll: false,
      renames: compacted.renames
    }
  })
}

/**
 * 从光标 / 块 ID 打开编辑流程的前置解析。
 * 直接子块扫描有界（IO_MAX_CHILD_SCAN）；读失败汇总可见错误。
 */
export async function resolveIoLaunchTarget(
  blockId: DbId
): Promise<{ hostBlock: Block; sources: ResolvedImageSource[] }> {
  const hostBlock = await loadBlockForIo(blockId, { forceBackend: true })
  assertHostAcceptsImageOcclusion(hostBlock)

  const allChildIds = hostBlock.children ?? []
  const childIds = allChildIds.slice(0, IO_MAX_CHILD_SCAN)
  if (allChildIds.length > IO_MAX_CHILD_SCAN) {
    console.warn(
      `[imageOcclusion] 子块 ${allChildIds.length} 个超过扫描上限 ${IO_MAX_CHILD_SCAN}，仅扫描前 ${IO_MAX_CHILD_SCAN} 个`
    )
  }

  const childLoadErrors: string[] = []
  // 批量预取缺失子块（有界）
  const missing = childIds.filter(id => !orca.state?.blocks?.[id])
  if (missing.length > 0) {
    const batchSize = 50
    for (let i = 0; i < missing.length; i += batchSize) {
      const slice = missing.slice(i, i + batchSize)
      try {
        await orca.invokeBackend("get-blocks", slice)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        childLoadErrors.push(`批量预取失败: ${msg}`)
        console.error("[imageOcclusion] 预取子块失败:", error)
      }
    }
  }

  // 后端再扫子块图（不依赖 state 是否回写）
  let sources = collectImageSources(hostBlock)
  for (const childId of childIds) {
    const key = `child:${childId}`
    if (sources.some(s => s.key === key)) continue
    try {
      const child = await loadBlockForIo(childId, { forceBackend: true })
      const src = getBlockImageSrc(child)
      if (!src) continue
      sources = [
        ...sources,
        {
          key,
          kind: "child-block",
          imageBlockId: childId,
          src,
          label: `子块图片 #${childId}`
        }
      ]
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      childLoadErrors.push(`#${childId}: ${msg}`)
      console.error(`[imageOcclusion] 读取子块 #${childId} 失败:`, error)
    }
  }

  if (sources.length === 0) {
    const detail =
      childLoadErrors.length > 0
        ? `；子块读取问题：${childLoadErrors.slice(0, 3).join("；")}`
        : ""
    throw new Error(
      `当前块及直接子块中未找到图片（支持图片块、行内图、子块图）${detail}`
    )
  }

  if (childLoadErrors.length > 0) {
    console.warn(
      `[imageOcclusion] 部分子块未能读取（${childLoadErrors.length}）：`,
      childLoadErrors
    )
  }

  const fresh = await loadBlockForIo(blockId, { forceBackend: true })
  return { hostBlock: fresh, sources }
}

export function getCursorBlockId(cursor: CursorData | null | undefined): DbId | null {
  if (!cursor?.anchor?.blockId) return null
  return cursor.anchor.blockId
}
