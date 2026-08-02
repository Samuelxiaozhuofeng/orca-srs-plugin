/**
 * TTS 音频关联 manifest（块属性 srs.tts.manifest）。
 *
 * 用 cardKey / block 目标 key 关联 asset，不依赖 audio block 树位置。
 * 禁止写入 API Key。
 *
 * 读写契约（严格）：
 * - 属性不存在 → 空 manifest
 * - 属性存在但 JSON/版本/entries/entry 非法 → **抛错**（禁止静默成空后覆盖旧数据）
 * - 写入仅 type 0 JSON；失败不 fallback Text、不 invalidate 缓存
 */

import type { Block, DbId } from "../../orca.d.ts"
import { invalidateBlockCache } from "../storage"

export const TTS_MANIFEST_PROP = "srs.tts.manifest" as const
export const TTS_MANIFEST_VERSION = 1 as const

/** textPreview 最大字符（仅辅助展示，不做匹配） */
export const TTS_TEXT_PREVIEW_MAX = 80

export type TtsManifestEntry = {
  /** cardIdentity.cardKey，或普通块 `block:{id}` */
  cardKey: string
  assetPath: string
  audioBlockId: number
  textHash: string
  textPreview?: string
  provider: string
  voice: string
  format: string
  createdAt: string
}

export type TtsManifest = {
  version: typeof TTS_MANIFEST_VERSION
  entries: TtsManifestEntry[]
}

/** 写入/撤销时保存的原始属性快照 */
export type TtsManifestPropSnapshot = {
  type: number
  value: unknown
}

export class TtsManifestError extends Error {
  readonly code: string
  readonly blockId?: DbId

  constructor(
    message: string,
    options?: { code?: string; blockId?: DbId; cause?: unknown }
  ) {
    super(message)
    this.name = "TtsManifestError"
    this.code = options?.code ?? "MANIFEST_INVALID"
    this.blockId = options?.blockId
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export function blockTargetKey(blockId: DbId): string {
  return `block:${blockId}`
}

/**
 * 同步文本 hash（FNV-1a 32-bit hex），确定性、无外部依赖。
 * 仅用于跳过重复；不声称密码学强度。
 */
export function hashTtsText(text: string): string {
  const normalized = text.normalize("NFC").trim()
  let h = 0x811c9dc5
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

export function makeTextPreview(text: string): string {
  const t = text.trim().replace(/\s+/g, " ")
  if (t.length <= TTS_TEXT_PREVIEW_MAX) return t
  return `${t.slice(0, TTS_TEXT_PREVIEW_MAX)}…`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function parseEntry(raw: unknown, index: number): TtsManifestEntry {
  if (!isPlainObject(raw)) {
    throw new TtsManifestError(
      `${TTS_MANIFEST_PROP} entries[${index}] 不是对象`,
      { code: "ENTRY_INVALID" }
    )
  }
  const cardKey = typeof raw.cardKey === "string" ? raw.cardKey.trim() : ""
  const assetPath =
    typeof raw.assetPath === "string" ? raw.assetPath.trim() : ""
  const audioBlockId =
    typeof raw.audioBlockId === "number" &&
    Number.isFinite(raw.audioBlockId) &&
    raw.audioBlockId > 0
      ? Math.floor(raw.audioBlockId)
      : null
  const textHash =
    typeof raw.textHash === "string" ? raw.textHash.trim() : ""
  const provider =
    typeof raw.provider === "string" ? raw.provider.trim() : ""
  const voice = typeof raw.voice === "string" ? raw.voice.trim() : ""
  const format = typeof raw.format === "string" ? raw.format.trim() : ""
  const createdAt =
    typeof raw.createdAt === "string" ? raw.createdAt.trim() : ""

  if (
    !cardKey ||
    !assetPath ||
    audioBlockId == null ||
    !textHash ||
    !provider ||
    !voice ||
    !format ||
    !createdAt
  ) {
    throw new TtsManifestError(
      `${TTS_MANIFEST_PROP} entries[${index}] 缺少必填字段（cardKey/assetPath/audioBlockId/textHash/provider/voice/format/createdAt）`,
      { code: "ENTRY_INVALID" }
    )
  }

  const entry: TtsManifestEntry = {
    cardKey,
    assetPath,
    audioBlockId,
    textHash,
    provider,
    voice,
    format,
    createdAt
  }
  if (typeof raw.textPreview === "string" && raw.textPreview.trim()) {
    entry.textPreview = raw.textPreview
      .trim()
      .slice(0, TTS_TEXT_PREVIEW_MAX + 1)
  }
  return entry
}

/**
 * 严格解析 manifest。非法输入抛 TtsManifestError（不返回 null/空）。
 * 空字符串视为非法（属性已存在但值为空串）。
 */
export function parseTtsManifest(raw: unknown): TtsManifest {
  let value: unknown = raw
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) {
      throw new TtsManifestError(
        `${TTS_MANIFEST_PROP} 值为空字符串，无法解析`,
        { code: "EMPTY_STRING" }
      )
    }
    try {
      value = JSON.parse(trimmed)
    } catch (error) {
      throw new TtsManifestError(
        `${TTS_MANIFEST_PROP} JSON 解析失败：${
          error instanceof Error ? error.message : String(error)
        }`,
        { code: "JSON_PARSE", cause: error }
      )
    }
  }
  if (!isPlainObject(value)) {
    throw new TtsManifestError(
      `${TTS_MANIFEST_PROP} 根值必须是对象`,
      { code: "NOT_OBJECT" }
    )
  }
  if (value.version !== TTS_MANIFEST_VERSION && value.version !== 1) {
    throw new TtsManifestError(
      `${TTS_MANIFEST_PROP} 未知 version=${String(value.version)}（仅支持 ${TTS_MANIFEST_VERSION}）`,
      { code: "UNKNOWN_VERSION" }
    )
  }
  if (!Array.isArray(value.entries)) {
    throw new TtsManifestError(
      `${TTS_MANIFEST_PROP} entries 必须是数组`,
      { code: "ENTRIES_NOT_ARRAY" }
    )
  }
  const entries: TtsManifestEntry[] = []
  for (let i = 0; i < value.entries.length; i++) {
    entries.push(parseEntry(value.entries[i], i))
  }
  return { version: TTS_MANIFEST_VERSION, entries }
}

export function emptyTtsManifest(): TtsManifest {
  return { version: TTS_MANIFEST_VERSION, entries: [] }
}

/**
 * 读取目标块上 manifest 属性的原始快照（用于 undo）。
 * 仅属性不存在时返回 null；属性存在时完整保留原值，供 undo 精确恢复。
 */
export function getTtsManifestPropertySnapshot(
  block: Pick<Block, "properties"> | null | undefined
): TtsManifestPropSnapshot | null {
  if (!block?.properties || !Array.isArray(block.properties)) return null
  const prop = block.properties.find((p) => p?.name === TTS_MANIFEST_PROP)
  if (prop == null) return null
  const type =
    typeof prop.type === "number" && Number.isFinite(prop.type)
      ? prop.type
      : 0
  return { type, value: prop.value }
}

/**
 * 从块 properties 读取 manifest。
 * - 属性不存在 → 空 manifest
 * - 属性存在但损坏 → **抛出** TtsManifestError（不得静默清空后覆盖）
 */
export function readTtsManifestFromBlock(
  block: Pick<Block, "properties"> | null | undefined,
  blockId?: DbId
): TtsManifest {
  if (!block?.properties || !Array.isArray(block.properties)) {
    return emptyTtsManifest()
  }
  const prop = block.properties.find((p) => p?.name === TTS_MANIFEST_PROP)
  if (prop == null) {
    return emptyTtsManifest()
  }
  try {
    return parseTtsManifest(prop.value)
  } catch (error) {
    if (error instanceof TtsManifestError) {
      throw new TtsManifestError(
        `${error.message}${
          blockId != null ? `（blockId=${blockId}）` : ""
        }`,
        { code: error.code, blockId, cause: error }
      )
    }
    throw error
  }
}

export function findMatchingManifestEntry(
  manifest: TtsManifest,
  match: {
    cardKey: string
    textHash: string
    voice: string
    format: string
  }
): TtsManifestEntry | undefined {
  return manifest.entries.find(
    (e) =>
      e.cardKey === match.cardKey &&
      e.textHash === match.textHash &&
      e.voice === match.voice &&
      e.format === match.format
  )
}

export function findLatestEntryForCardKey(
  manifest: TtsManifest,
  cardKey: string
): TtsManifestEntry | undefined {
  let latest: TtsManifestEntry | undefined
  for (const e of manifest.entries) {
    if (e.cardKey !== cardKey) continue
    if (!latest || e.createdAt > latest.createdAt) latest = e
  }
  return latest
}

/**
 * 合并 entry：同 cardKey 替换为新 entry（保留其它卡的条目）。
 * 不删除旧 audio block（宿主无可靠 asset 删除 API）。
 */
export function upsertManifestEntry(
  manifest: TtsManifest,
  entry: TtsManifestEntry
): TtsManifest {
  const others = manifest.entries.filter((e) => e.cardKey !== entry.cardKey)
  return {
    version: TTS_MANIFEST_VERSION,
    entries: [...others, entry]
  }
}

function toPlainJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 写入 manifest 属性（仅 type 0 JSON）并 invalidate 缓存。
 * 写失败抛出明确错误（含 blockId / 属性名），**不** Text fallback，**不** invalidate。
 */
export async function writeTtsManifest(
  blockId: DbId,
  manifest: TtsManifest
): Promise<void> {
  const stored = toPlainJsonValue({
    version: TTS_MANIFEST_VERSION,
    entries: manifest.entries.map((e) => ({
      cardKey: e.cardKey,
      assetPath: e.assetPath,
      audioBlockId: e.audioBlockId,
      textHash: e.textHash,
      ...(e.textPreview ? { textPreview: e.textPreview } : {}),
      provider: e.provider,
      voice: e.voice,
      format: e.format,
      createdAt: e.createdAt
    }))
  })

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: TTS_MANIFEST_PROP, type: 0, value: stored }]
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new TtsManifestError(
      `写入 ${TTS_MANIFEST_PROP} 失败（blockId=${blockId}）：${msg}`,
      { code: "WRITE_FAILED", blockId, cause: error }
    )
  }

  invalidateBlockCache(blockId)
}

/**
 * 恢复 manifest 属性到生成前快照（undo 用）。
 * previous == null → deleteProperties；否则按原 type/value setProperties。
 * 成功后 invalidate。
 */
export async function restoreTtsManifestProperty(
  blockId: DbId,
  previous: TtsManifestPropSnapshot | null
): Promise<void> {
  try {
    if (previous == null) {
      await orca.commands.invokeEditorCommand(
        "core.editor.deleteProperties",
        null,
        [blockId],
        [TTS_MANIFEST_PROP]
      )
    } else {
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [blockId],
        [
          {
            name: TTS_MANIFEST_PROP,
            type: previous.type,
            value: previous.value
          }
        ]
      )
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new TtsManifestError(
      `恢复 ${TTS_MANIFEST_PROP} 失败（blockId=${blockId}）：${msg}`,
      { code: "RESTORE_FAILED", blockId, cause: error }
    )
  }
  invalidateBlockCache(blockId)
}
