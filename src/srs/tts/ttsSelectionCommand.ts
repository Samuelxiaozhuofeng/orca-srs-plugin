/**
 * 编辑器选区 → 单条 TTS 命令流程 + 对称 undo。
 */

import type { Block, CursorData, DbId } from "../../orca.d.ts"
import {
  describeSelectedTextExtractFailure,
  QUICK_SELECTION_MAX,
  resolveSelectedTextFromCursor
} from "../ai/aiQuickPrompt"
import { buildCardKey } from "../cardIdentity"
import { extractCardType } from "../deckUtils"
import { isCardTag } from "../tagUtils"
import { invalidateBlockCache } from "../storage"
import {
  generateTtsAudio,
  TtsGenerateError
} from "./ttsGenerate"
import {
  blockTargetKey,
  getTtsManifestPropertySnapshot,
  restoreTtsManifestProperty,
  TTS_MANIFEST_PROP,
  type TtsManifestPropSnapshot
} from "./ttsManifest"
import {
  isTtsConfigured,
  getTtsSettings
} from "./ttsSettingsSchema"
import { sanitizePublicError } from "../http/redactSecrets"

/** 选区单条防重复 in-flight */
let selectionInFlight = false

export function isTtsSelectionInFlight(): boolean {
  return selectionInFlight
}

/**
 * 目标 key：
 * - 带真实 #card 且 extractCardType === basic → cardIdentity basic cardKey
 * - 否则（普通块 / 其它卡型）→ block:{id}
 *
 * 不得用 srs.isCard 启发式；不得把无 #card 却 extractCardType 默认 basic 的块当成 Basic 卡。
 */
export function resolveTargetKeyForBlock(blockId: DbId): string {
  const block = orca.state.blocks?.[blockId] as Block | undefined
  if (!block?.refs || !Array.isArray(block.refs)) {
    return blockTargetKey(blockId)
  }

  const hasCardTag = block.refs.some(
    (ref) => ref.type === 2 && isCardTag(ref.alias)
  )
  if (!hasCardTag) {
    return blockTargetKey(blockId)
  }

  if (extractCardType(block) === "basic") {
    return buildCardKey({ blockId, cardType: "basic" })
  }

  return blockTargetKey(blockId)
}

/** 选区 TTS 成功创建时的 undo 载荷（skipped/失败不得带此结构去删内容） */
export type TtsSelectionUndoArgs = {
  targetBlockId: number
  audioBlockId: number
  /**
   * 生成前 target 块上 srs.tts.manifest 的原始属性。
   * null = 生成前不存在该属性 → undo 时 deleteProperties。
   */
  previousManifestProp: TtsManifestPropSnapshot | null
  /**
   * 上传的 asset 路径（仅文档/诊断；undo **不**删除 asset，宿主无可靠 API）。
   */
  assetPath?: string
}

export type RunSelectionTtsResult =
  | {
      ok: true
      status: "created"
      audioBlockId: number
      undoArgs: TtsSelectionUndoArgs
    }
  | {
      ok: true
      status: "skipped"
      audioBlockId?: number
    }
  | { ok: false; reason: string; openSettings?: boolean }

/**
 * 从当前光标选区生成 TTS 并插入 audio 块。
 * 成功 created 时返回 undoArgs 供 registerEditorCommand 对称撤销。
 */
export async function runSelectionTtsCommand(
  cursor: CursorData,
  pluginName: string
): Promise<RunSelectionTtsResult> {
  if (selectionInFlight) {
    return { ok: false, reason: "语音生成进行中，请稍候" }
  }

  // TTS 只读选区/块正文，不展开 AI 子树、不套制卡排除语义以外的扩展
  const resolved = resolveSelectedTextFromCursor(cursor, {
    expandSubtree: false
  })
  if (!resolved.ok) {
    return {
      ok: false,
      reason: describeSelectedTextExtractFailure(resolved.reason)
    }
  }
  const extracted = resolved.extract

  if (!isTtsConfigured(pluginName)) {
    return {
      ok: false,
      reason: "尚未配置 Azure TTS，请先打开服务设置填写 API Key 与区域",
      openSettings: true
    }
  }

  const text = extracted.selectedText.trim()
  if (!text) {
    return { ok: false, reason: "选中文本为空" }
  }

  // 共用选区字数上限；截断必须可见
  if (extracted.truncated) {
    orca.notify(
      "info",
      `选区过长，已截断至 ${QUICK_SELECTION_MAX} 字后朗读`,
      { title: "TTS" }
    )
  }

  const targetKey = resolveTargetKeyForBlock(extracted.blockId)
  const settings = getTtsSettings(pluginName)

  // 生成前快照：用于 undo 恢复 manifest
  const targetBlock =
    (orca.state.blocks?.[extracted.blockId] as Block | undefined) ??
    undefined
  const previousManifestProp = getTtsManifestPropertySnapshot(targetBlock)

  selectionInFlight = true

  try {
    orca.notify("info", "正在生成语音…", { title: "TTS" })
    const result = await generateTtsAudio({
      pluginName,
      targetBlockId: extracted.blockId,
      targetKey,
      text,
      // 音频作为选中文本所在块的子块插入
      parentBlockId: extracted.blockId,
      mode: "skip_existing"
    })

    if (result.status === "skipped") {
      orca.notify(
        "info",
        "已存在相同文本与音色的语音，已跳过",
        { title: "TTS" }
      )
      return {
        ok: true,
        status: "skipped",
        audioBlockId: result.entry.audioBlockId
      }
    }

    orca.notify(
      "success",
      `语音已添加（块 #${result.audioBlockId}）`,
      { title: "TTS" }
    )
    return {
      ok: true,
      status: "created",
      audioBlockId: result.audioBlockId,
      undoArgs: {
        targetBlockId: extracted.blockId,
        audioBlockId: result.audioBlockId,
        previousManifestProp,
        assetPath: result.assetPath
      }
    }
  } catch (error) {
    const raw =
      error instanceof TtsGenerateError
        ? `[${error.step}] ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error)
    const message = sanitizePublicError(raw, settings.apiKey)
    console.error("[TTS Selection]", message, error)
    orca.notify("error", message, { title: "TTS 失败" })
    return { ok: false, reason: message }
  } finally {
    selectionInFlight = false
  }
}

/**
 * 对称撤销选区 TTS：
 * 1. 删除本次创建的 audio block
 * 2. 恢复 target 块上 srs.tts.manifest 原始属性（无则 delete）
 * 3. invalidateBlockCache
 *
 * 不删除 asset（宿主无可靠 API）；失败 console.error + notify + 抛出。
 */
export async function undoSelectionTts(
  undoArgs: TtsSelectionUndoArgs | null | undefined
): Promise<void> {
  if (
    !undoArgs ||
    typeof undoArgs.targetBlockId !== "number" ||
    typeof undoArgs.audioBlockId !== "number" ||
    !Number.isFinite(undoArgs.targetBlockId) ||
    !Number.isFinite(undoArgs.audioBlockId) ||
    undoArgs.audioBlockId <= 0
  ) {
    return
  }

  const { targetBlockId, audioBlockId, previousManifestProp, assetPath } =
    undoArgs

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [audioBlockId]
    )
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error)
    console.error(
      `[TTS Undo] 删除音频块 #${audioBlockId} 失败:`,
      error
    )
    orca.notify("error", `撤销 TTS 失败（删除音频块 #${audioBlockId}）：${msg}`, {
      title: "TTS 撤销"
    })
    throw error
  }

  try {
    await restoreTtsManifestProperty(targetBlockId, previousManifestProp)
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error)
    console.error(
      `[TTS Undo] 恢复 ${TTS_MANIFEST_PROP}（block #${targetBlockId}）失败:`,
      error
    )
    orca.notify(
      "error",
      `撤销 TTS 失败（恢复 manifest block #${targetBlockId}）：${msg}`,
      { title: "TTS 撤销" }
    )
    throw error
  }

  // restore 已 invalidate target；audio 块删除后再清一次 target 更保险
  invalidateBlockCache(targetBlockId)

  if (assetPath) {
    console.info(
      `[TTS Undo] 已删除音频块 #${audioBlockId} 并恢复 manifest；asset 未删除（${assetPath}，宿主无可靠删除 API）`
    )
  }
}
