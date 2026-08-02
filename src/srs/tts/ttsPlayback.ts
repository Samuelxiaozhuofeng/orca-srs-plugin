/**
 * 复习界面 TTS 播放：根据 manifest 解析 asset 并播放。
 * 失败可见，但不阻断评分。
 */

import type { Block, DbId } from "../../orca.d.ts"
import { resolveRepoAssetDisplayUrl } from "../repoAssetPath"
import {
  findLatestEntryForCardKey,
  readTtsManifestFromBlock,
  TtsManifestError,
  type TtsManifestEntry
} from "./ttsManifest"

export type ResolveTtsPlaybackResult =
  | { ok: true; entry: TtsManifestEntry; playUrl: string }
  | { ok: false; reason: string }

/**
 * 从块读取 manifest 并解析可播放 URL。
 * 使用 repoDir 解析仓库相对路径；不得只依赖恒等 getAssetPath。
 */
export function resolveTtsPlayback(
  block: Pick<Block, "properties"> | null | undefined,
  cardKey: string,
  blockId?: DbId
): ResolveTtsPlaybackResult {
  if (!cardKey.trim()) {
    return { ok: false, reason: "缺少 cardKey" }
  }

  let manifest
  try {
    manifest = readTtsManifestFromBlock(block, blockId)
  } catch (error) {
    const reason =
      error instanceof TtsManifestError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error)
    return { ok: false, reason: `读取 TTS manifest 失败：${reason}` }
  }

  const entry = findLatestEntryForCardKey(manifest, cardKey)
  if (!entry) {
    return { ok: false, reason: "此卡尚无关联语音" }
  }
  if (!entry.assetPath?.trim()) {
    return { ok: false, reason: "manifest 中 assetPath 为空" }
  }

  try {
    const playUrl = resolveRepoAssetDisplayUrl(entry.assetPath)
    if (!playUrl) {
      return {
        ok: false,
        reason: `无法解析资源路径：${entry.assetPath}`
      }
    }
    return { ok: true, entry, playUrl }
  } catch (error) {
    return {
      ok: false,
      reason: `解析资源路径失败：${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }
}

/**
 * 加载目标块并解析播放路径（异步 get-block 兜底）。
 */
export async function loadTtsPlaybackForCard(
  blockId: DbId,
  cardKey: string
): Promise<ResolveTtsPlaybackResult> {
  let block =
    (orca.state.blocks?.[blockId] as Block | undefined) ?? undefined
  if (!block) {
    try {
      block = (await orca.invokeBackend("get-block", blockId)) as
        | Block
        | undefined
    } catch (error) {
      return {
        ok: false,
        reason: `读取卡片块失败：${
          error instanceof Error ? error.message : String(error)
        }`
      }
    }
  }
  if (!block) {
    return { ok: false, reason: `卡片块不存在（#${blockId}）` }
  }
  return resolveTtsPlayback(block, cardKey, blockId)
}

export type PlayTtsAudioOptions = {
  playUrl: string
  /** 复用同一个 Audio 元素以便停止/重播 */
  audioEl?: HTMLAudioElement
}

/**
 * 播放（或重播）音频。返回 HTMLAudioElement 供调用方 stop。
 * 播放失败抛出可见错误。
 */
export async function playTtsAudio(
  options: PlayTtsAudioOptions
): Promise<HTMLAudioElement> {
  const audio =
    options.audioEl ??
    (typeof Audio !== "undefined"
      ? new Audio()
      : (() => {
          throw new Error("当前环境不支持 Audio 播放")
        })())

  try {
    audio.pause()
  } catch (error) {
    console.warn("[TTS Playback] 暂停旧音频失败:", error)
  }

  audio.src = options.playUrl
  try {
    await audio.play()
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error)
    throw new Error(`播放语音失败：${msg}`)
  }
  return audio
}
