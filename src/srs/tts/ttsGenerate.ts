/**
 * TTS 生成编排：合成 → 校验 → upload asset → insert audio block → 写 manifest。
 *
 * 任一步失败抛出并标明 step；不假装可回滚已上传 asset。
 */

import type { Block, DbId } from "../../orca.d.ts"
import { synthesizeSpeech, TtsClientError } from "./azureTtsClient"
import {
  findMatchingManifestEntry,
  hashTtsText,
  makeTextPreview,
  readTtsManifestFromBlock,
  upsertManifestEntry,
  writeTtsManifest,
  type TtsManifestEntry
} from "./ttsManifest"
import {
  getTtsSettings,
  type TtsSettings
} from "./ttsSettingsSchema"
import { sanitizePublicError } from "../http/redactSecrets"

export type TtsGenerateStep =
  | "config"
  | "skip"
  | "request"
  | "upload"
  | "insert"
  | "manifest"
  | "done"

export type TtsGenerateResult =
  | {
      status: "created"
      entry: TtsManifestEntry
      assetPath: string
      audioBlockId: number
      step: "done"
    }
  | {
      status: "skipped"
      entry: TtsManifestEntry
      reason: "already_exists"
      step: "skip"
    }

export type GenerateTtsAudioOptions = {
  pluginName: string
  /** 写入 manifest 的目标块（卡片根或普通 block） */
  targetBlockId: DbId
  /** cardKey 或 block:{id} */
  targetKey: string
  text: string
  /**
   * 作为子块插入时的父块。默认 targetBlockId；
   * 使用 lastChild，挂在目标块下方（子级），而非同级 after。
   */
  parentBlockId?: DbId
  /** 默认跳过 textHash+voice+format 匹配的已有 entry */
  mode?: "skip_existing" | "regenerate"
  settingsOverride?: Partial<TtsSettings>
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  /** 测试注入 upload */
  uploadAsset?: (mime: string, data: ArrayBuffer) => Promise<string>
  /** 测试注入 insert */
  insertAudioBlock?: (args: {
    parentBlockId: DbId
    assetPath: string
  }) => Promise<DbId>
  /** 测试注入读块 */
  loadBlock?: (blockId: DbId) => Promise<Block | null | undefined>
}

export class TtsGenerateError extends Error {
  readonly step: TtsGenerateStep
  readonly code: string
  /** insert 成功但 manifest 失败时附带，便于用户处理 */
  readonly audioBlockId?: number
  readonly assetPath?: string

  constructor(
    step: TtsGenerateStep,
    message: string,
    options?: {
      code?: string
      audioBlockId?: number
      assetPath?: string
      cause?: unknown
    }
  ) {
    super(message)
    this.name = "TtsGenerateError"
    this.step = step
    this.code = options?.code ?? "GENERATE_FAILED"
    this.audioBlockId = options?.audioBlockId
    this.assetPath = options?.assetPath
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

async function defaultLoadBlock(
  blockId: DbId
): Promise<Block | null | undefined> {
  const fromState = orca.state.blocks?.[blockId] as Block | undefined
  if (fromState) return fromState
  return (await orca.invokeBackend("get-block", blockId)) as
    | Block
    | null
    | undefined
}

async function defaultUploadAsset(
  mime: string,
  data: ArrayBuffer
): Promise<string> {
  const assetPath = await orca.invokeBackend(
    "upload-asset-binary",
    mime,
    data
  )
  if (typeof assetPath !== "string" || assetPath.length === 0) {
    throw new Error("upload-asset-binary 未返回有效路径")
  }
  return assetPath
}

async function defaultInsertAudioBlock(args: {
  parentBlockId: DbId
  assetPath: string
}): Promise<DbId> {
  const parentBlock =
    (orca.state.blocks?.[args.parentBlockId] as Block | undefined) ??
    ((await orca.invokeBackend("get-block", args.parentBlockId)) as
      | Block
      | undefined)

  if (!parentBlock) {
    throw new Error(`父块不存在（#${args.parentBlockId}）`)
  }

  const content = `audio: ${args.assetPath}`
  // lastChild：挂在目标块子级末尾，而不是同级 after
  const rawId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    parentBlock,
    "lastChild",
    [{ t: "t", v: content }],
    { type: "audio", src: args.assetPath }
  )

  if (
    typeof rawId !== "number" ||
    !Number.isFinite(rawId) ||
    rawId <= 0
  ) {
    throw new Error(
      `insertBlock 未返回有效音频块 ID（${String(rawId)}）`
    )
  }
  return rawId
}

/**
 * 为一段文本生成语音并关联到 target 块的 manifest。
 */
export async function generateTtsAudio(
  options: GenerateTtsAudioOptions
): Promise<TtsGenerateResult> {
  const mode = options.mode ?? "skip_existing"
  const text = options.text.trim()
  if (!text) {
    throw new TtsGenerateError("config", "合成文本为空", {
      code: "EMPTY_TEXT"
    })
  }

  const baseSettings = getTtsSettings(options.pluginName)
  const settings: TtsSettings = {
    ...baseSettings,
    ...(options.settingsOverride ?? {})
  }
  if (!settings.apiKey.trim()) {
    throw new TtsGenerateError(
      "config",
      "未配置 Azure TTS。请在「AI 与导入服务」→「语音 TTS」中填写 API Key。",
      { code: "NO_API_KEY" }
    )
  }

  const loadBlock = options.loadBlock ?? defaultLoadBlock
  const targetBlock = await loadBlock(options.targetBlockId)
  if (!targetBlock) {
    throw new TtsGenerateError(
      "config",
      `目标块不存在（#${options.targetBlockId}）`,
      { code: "BLOCK_MISSING" }
    )
  }

  const textHash = hashTtsText(text)
  // 损坏 manifest 必须抛出，禁止静默成空后覆盖旧数据
  const manifest = readTtsManifestFromBlock(
    targetBlock,
    options.targetBlockId
  )
  const existing = findMatchingManifestEntry(manifest, {
    cardKey: options.targetKey,
    textHash,
    voice: settings.voice,
    format: settings.format
  })

  if (existing && mode === "skip_existing") {
    return {
      status: "skipped",
      entry: existing,
      reason: "already_exists",
      step: "skip"
    }
  }

  // ── 1. 请求音频 ──
  let audioResult
  try {
    audioResult = await synthesizeSpeech({
      settings,
      text,
      signal: options.signal,
      fetchImpl: options.fetchImpl
    })
  } catch (error) {
    if (error instanceof TtsClientError) {
      throw new TtsGenerateError(
        error.step === "validate" ? "request" : (error.step as TtsGenerateStep),
        sanitizePublicError(error.message, settings.apiKey),
        { code: error.code, cause: error }
      )
    }
    throw new TtsGenerateError(
      "request",
      sanitizePublicError(
        error instanceof Error ? error.message : String(error),
        settings.apiKey
      ),
      { code: "REQUEST_FAILED", cause: error }
    )
  }

  // ── 2. 上传 asset ──
  const upload = options.uploadAsset ?? defaultUploadAsset
  let assetPath: string
  try {
    assetPath = await upload("audio/mpeg", audioResult.audio)
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error)
    throw new TtsGenerateError(
      "upload",
      `上传音频资源失败：${sanitizePublicError(msg, settings.apiKey)}`,
      { code: "UPLOAD_FAILED", cause: error }
    )
  }

  // ── 3. 插入原生 audio block（目标块 lastChild 子块） ──
  const parentBlockId = options.parentBlockId ?? options.targetBlockId
  const insertFn = options.insertAudioBlock ?? defaultInsertAudioBlock
  let audioBlockId: number
  try {
    audioBlockId = await insertFn({
      parentBlockId,
      assetPath
    })
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error)
    throw new TtsGenerateError(
      "insert",
      `插入音频块失败（asset 已上传：${assetPath}）：${msg}`,
      { code: "INSERT_FAILED", assetPath, cause: error }
    )
  }

  // ── 4. 写 manifest ──
  const entry: TtsManifestEntry = {
    cardKey: options.targetKey,
    assetPath,
    audioBlockId,
    textHash,
    textPreview: makeTextPreview(text),
    provider: settings.provider,
    voice: settings.voice,
    format: settings.format,
    createdAt: new Date().toISOString()
  }

  const nextManifest = upsertManifestEntry(manifest, entry)
  try {
    await writeTtsManifest(options.targetBlockId, nextManifest)
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error)
    throw new TtsGenerateError(
      "manifest",
      `manifest 写入失败（音频块已创建 #${audioBlockId}，asset=${assetPath}）：${msg}`,
      {
        code: "MANIFEST_FAILED",
        audioBlockId,
        assetPath,
        cause: error
      }
    )
  }

  return {
    status: "created",
    entry,
    assetPath,
    audioBlockId,
    step: "done"
  }
}
