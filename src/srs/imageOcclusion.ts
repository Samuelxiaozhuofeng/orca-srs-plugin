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

/**
 * 解析仓库 assets 目录下的相对资源为绝对文件系统路径。
 * 对齐宿主内部 `getAssetPath$1`：`{repoDir}/assets/{fileName}`。
 *
 * 例：`image-xxx.png` → `/Users/.../orca/repos/{id}/assets/image-xxx.png`
 */
export function resolveRepoAssetAbsolutePath(relativeName: string): string {
  const sep = "/"
  const name = String(relativeName ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^assets\//, "")
  let repoDir = ""
  try {
    if (typeof orca !== "undefined") {
      const state = orca.state as {
        repoDir?: string
        dataDir?: string
        repo?: string
      }
      repoDir =
        (typeof state.repoDir === "string" && state.repoDir) ||
        (typeof state.dataDir === "string" && typeof state.repo === "string"
          ? `${state.dataDir.replace(/[\\/]+$/, "")}${sep}repos${sep}${state.repo}`
          : "")
    }
  } catch (error) {
    console.warn("[imageOcclusion] 读取 repoDir 失败:", error)
  }
  if (!repoDir) {
    throw new Error(
      "无法解析仓库 assets 路径：orca.state.repoDir / dataDir+repo 不可用"
    )
  }
  const base = repoDir.replace(/[\\/]+$/, "")
  if (!name) return `${base}${sep}assets${sep}`
  return `${base}${sep}assets${sep}${name}`
}

/**
 * 将绝对路径转为 img 可用的 file:// URL（与宿主 image 块渲染一致）。
 * 宿主逻辑：`/^(file|https?):/.test(p) ? p : \`file://${p.startsWith("/")?"":"/"}${p}\``
 */
export function absolutePathToFileUrl(absPath: string): string {
  const p = String(absPath ?? "").trim()
  if (!p) return ""
  if (/^(file|https?):/i.test(p)) return p
  // 保留路径中的空格等字符：先规范化分隔符，再按段 encode（避免 encodeURI 漏 # 等）
  const normalized = p.replace(/\\/g, "/")
  const withRoot = normalized.startsWith("/") ? normalized : `/${normalized}`
  // file URL：file:///Users/... ；Windows: file:///C:/...
  const encoded = withRoot
    .split("/")
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join("/")
  return `file://${encoded}`
}

/**
 * 解析展示用 URL，对齐 Orca 原生 image 块：
 * - `./image-xxx.png` / `image-xxx.png` → `{repoDir}/assets/...` → `file://...`
 * - 绝对路径 → `file://...`
 * - http(s)/data/blob/file 原样
 *
 * 注意：`orca.utils.getAssetPath` 在宿主中是恒等函数，不能单独依赖它解析仓库图。
 */
export function resolveImageDisplayUrl(src: string): string {
  if (!src) return ""
  const trimmed = src.trim()
  // 协议大小写不敏感（HTTPS:// 不得被当成仓库相对路径）
  if (/^(https?:|data:|blob:|file:)/i.test(trimmed)) {
    return trimmed
  }

  // 仓库相对资源：`./image-xxx.png`（DB 中最常见）
  const isRepoRelative =
    trimmed.startsWith("./") ||
    trimmed.startsWith("assets/") ||
    (!trimmed.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(trimmed))

  let fsPath = trimmed
  if (isRepoRelative) {
    // repoDir 不可用时必须抛错，禁止生成 file:///./image.png 假 URL
    fsPath = resolveRepoAssetAbsolutePath(trimmed)
  }

  // 绝对路径或已解析的 fs 路径 → file://
  if (
    fsPath.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(fsPath) ||
    fsPath.includes("/assets/") ||
    fsPath.includes("\\assets\\")
  ) {
    return absolutePathToFileUrl(fsPath)
  }

  try {
    if (typeof orca !== "undefined" && orca.utils?.getAssetPath) {
      const via = orca.utils.getAssetPath(fsPath)
      if (via && via !== fsPath && /^(file|https?):/i.test(via)) return via
      if (via && (via.startsWith("/") || /^[A-Za-z]:[\\/]/.test(via))) {
        return absolutePathToFileUrl(via)
      }
    }
  } catch (error) {
    console.warn("[imageOcclusion] getAssetPath 失败:", error)
  }

  throw new Error(
    `无法将图片 src 解析为可展示 URL: ${trimmed.slice(0, 120)}`
  )
}

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
  const { hostBlockId, source, regions, pluginName } = input
  return withIoBlockLock(hostBlockId, async () => {
    // 先恢复上次中断的迁移，避免用脏编号基线做 plan
    await resumePendingIoSrsOps(hostBlockId)

    const block = await loadBlockForIo(hostBlockId, { forceBackend: true })
    assertHostAcceptsImageOcclusion(block)

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

    // masks 与 pending 同次写入：迁移中断后可幂等恢复
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
      // 末变体：只清 IO 几何/挂起；整卡 srs/#card 由调用方处理
      await orca.commands.invokeEditorCommand(
        "core.editor.deleteProperties",
        null,
        [hostBlockId],
        [IO_MASKS_PROP, IO_SRC_PROP, IO_PREV_REPR_PROP, IO_PENDING_SRS_PROP]
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
