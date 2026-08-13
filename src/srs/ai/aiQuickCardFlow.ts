/**
 * 快捷制卡：选中文本 → 直接生成 → 以待激活卡片形式插到块下方预览。
 *
 * 与「AI 生成闪卡」弹窗的分工：
 * - 卡型由**命令名**决定（每次都随内容变，不该藏在设置里）
 * - 语言 / 自定义指令 / 专用 model 走持久化偏好（稳定偏好，设一次用很久）
 * - 详细程度固定概要档——块下面挂十几张预览卡没法看也没法选；
 *   要成批生成就该打开弹窗，那是另一个场景
 */

import type { Block, CursorData, DbId } from "../../orca.d.ts"
import {
  AI_CARD_TYPE_LABELS,
  type AICardType,
  type AIDetailLevel
} from "./aiDraftTypes"
import { generateFlashcardDrafts } from "./aiService"
import { resolveBlockBackendFirst, writeAICardDrafts } from "./aiCardWriter"
import { getQuickCardPrefs } from "./aiQuickCardPrefs"
import { collectExistingCardExclusionSummaries } from "./aiQuickCardDedupe"
import { isAIConfigured } from "./aiSettingsSchema"
import {
  collectBoundedSubtreePlainText,
  describeSelectedTextExtractFailure,
  describeSourceTruncation,
  isMultiBlockSourceFailure,
  QUICK_SELECTION_MAX,
  resolveSelectedTextFromCursor
} from "./aiQuickPrompt"
import {
  aiQuickJobsState,
  captureActivePanelViewSnapshot,
  type QuickBackgroundJob
} from "./aiQuickInteractJobs"
import { sanitizePublicError } from "../http/redactSecrets"

const TITLE = "AI 快捷制卡"

/**
 * 快捷制卡的深度档：默认概要档（一眼看完）；当数量由 AI 自主决定（maxCards=0）
 * 时改用「重要观点」档，避免概要档「只取一两点」的措辞与「不限数量」冲突。
 */
function resolveQuickDetailLevel(maxCards: number): AIDetailLevel {
  return maxCards === 0 ? "key" : "summary"
}

/**
 * 写入阶段看门狗。
 *
 * 生成阶段自带超时，写入阶段没有——一旦宿主命令因任何原因不回，
 * 任务就永远停在 generating，用户看到一个转不停且无处可点的圈。
 * 宁可报一个「写入超时」让人有迹可循，也不要静默卡死。
 */
const WRITE_PHASE_TIMEOUT_MS = 30_000

class WritePhaseTimeoutError extends Error {
  constructor() {
    super("写入阶段超时")
    this.name = "WritePhaseTimeoutError"
  }
}

function withWriteTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new WritePhaseTimeoutError()),
      WRITE_PHASE_TIMEOUT_MS
    )
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

let jobSeq = 0
function nextQuickCardJobId(): string {
  jobSeq += 1
  return `aicard_${Date.now().toString(36)}_${jobSeq}`
}

function findJob(jobId: string): QuickBackgroundJob | undefined {
  return (aiQuickJobsState.jobs as QuickBackgroundJob[]).find(
    (j) => j.id === jobId
  )
}

function patchJob(jobId: string, patch: Partial<QuickBackgroundJob>): void {
  aiQuickJobsState.jobs = (aiQuickJobsState.jobs as QuickBackgroundJob[]).map(
    (j) => (j.id === jobId ? { ...j, ...patch } : j)
  )
}

function removeJob(jobId: string): void {
  aiQuickJobsState.jobs = (aiQuickJobsState.jobs as QuickBackgroundJob[]).filter(
    (j) => j.id !== jobId
  )
}

/**
 * 取制卡源文本：优先选区（含同块跨样式 / 同父相邻跨块），没有选区就用锚点块正文。
 *
 * 选区为空不是错误——「光标停在块里直接按快捷键」是最顺手的用法。
 * 跨块时 blockId 为文档阅读方向末块（结果挂在其下）。
 */
export function resolveQuickCardSource(
  cursor: CursorData
): {
  blockId: number
  text: string
  fromSelection: boolean
  multiBlock: boolean
  truncated: boolean
  charTruncated: boolean
  structureTruncated: boolean
} | null {
  const selection = resolveSelectedTextFromCursor(cursor)
  if (selection.ok && selection.extract.selectedText.trim()) {
    return {
      blockId: selection.extract.blockId,
      text: selection.extract.selectedText.trim(),
      fromSelection: true,
      multiBlock: selection.extract.multiBlock,
      truncated: selection.extract.truncated,
      charTruncated: selection.extract.charTruncated,
      structureTruncated: selection.extract.structureTruncated
    }
  }

  // 跨块相关失败（含 empty_selection）不得退回锚点全文
  if (isMultiBlockSourceFailure(cursor, selection)) {
    return null
  }

  const blockId = Number(cursor?.anchor?.blockId)
  if (!Number.isFinite(blockId)) return null
  // 无选区时：锚点块全文 + 有界子树（缩进），排除 #card / AI 结果预览
  const subtree = collectBoundedSubtreePlainText(blockId)
  const text = subtree.text.trim()
  if (!text) return null
  const charTruncated = text.length > QUICK_SELECTION_MAX
  const cappedText = charTruncated
    ? text.slice(0, QUICK_SELECTION_MAX)
    : text
  const structureTruncated = subtree.truncatedByStructure
  return {
    blockId,
    text: cappedText,
    fromSelection: false,
    multiBlock: false,
    truncated: charTruncated || structureTruncated,
    charTruncated,
    structureTruncated
  }
}

/** 预览标题 / 任务标签用的卡型名：单类型用其名，多类型统一「闪卡」。 */
function quickCardTypeLabel(cardTypes: readonly AICardType[]): string {
  return cardTypes.length === 1 ? AI_CARD_TYPE_LABELS[cardTypes[0]] : "闪卡"
}

/** 预览包装块标题。 */
export function buildQuickCardRootText(
  cardTypes: readonly AICardType[],
  count: number
): string {
  return `AI 快捷制卡 · ${quickCardTypeLabel(cardTypes)}（${count} 张，待确认）`
}

export type StartQuickCardOptions = {
  pluginName: string
  cursor: CursorData
  /** 允许的卡型集合；单个即锁定一种，多个让模型按内容自行分配。 */
  cardTypes: AICardType[]
}

/**
 * 启动一次快捷制卡。返回 job id；失败时抛出（调用方已 notify）。
 */
export async function startQuickCardJob(
  options: StartQuickCardOptions
): Promise<string | null> {
  const { pluginName, cursor, cardTypes } = options

  if (!isAIConfigured(pluginName)) {
    try {
      const { openAIServiceSettings } = await import(
        "./aiServiceSettingsState"
      )
      await openAIServiceSettings(pluginName)
    } catch (error) {
      console.error("[AI 快捷制卡] 打开连接设置失败:", error)
      orca.notify("error", "打开连接设置失败，请从插件设置中重试", {
        title: TITLE
      })
    }
    return null
  }

  const source = resolveQuickCardSource(cursor)
  if (!source) {
    const failed = resolveSelectedTextFromCursor(cursor)
    if (!failed.ok && isMultiBlockSourceFailure(cursor, failed)) {
      orca.notify("warn", describeSelectedTextExtractFailure(failed.reason), {
        title: TITLE
      })
      return null
    }
    orca.notify("warn", "请选中文本，或把光标放在有内容的块上", { title: TITLE })
    return null
  }

  if (source.truncated) {
    orca.notify(
      "info",
      describeSourceTruncation({
        truncated: source.truncated,
        charTruncated: source.charTruncated,
        structureTruncated: source.structureTruncated
      }),
      { title: TITLE }
    )
  }

  const prefs = getQuickCardPrefs(pluginName)
  // 去重：把源块子树里已有的 basic/cloze/choice 卡片摘要喂给模型，
  // 只出覆盖新内容的卡，避免对同一段文字反复制卡一遍遍重复。
  const excludeSummaries = collectExistingCardExclusionSummaries(
    source.blockId,
    pluginName
  )
  const panelSnap = captureActivePanelViewSnapshot()
  const jobId = nextQuickCardJobId()

  const job: QuickBackgroundJob = {
    id: jobId,
    kind: "card",
    pluginName,
    sourceBlockId: source.blockId,
    selectedText: source.text,
    blockText: source.text,
    promptLabel: quickCardTypeLabel(cardTypes),
    promptText: "",
    includeBlockContext: false,
    model: prefs.model,
    status: "generating",
    resultText: "",
    errorMessage: null,
    canOpenConnectionSettings: false,
    resultRootBlockId: null,
    cardBlockIds: [],
    selectedResultBlockIds: [],
    createdAt: Date.now(),
    panelId: panelSnap.panelId,
    panelViewKey: panelSnap.panelViewKey
  }
  aiQuickJobsState.jobs = [...aiQuickJobsState.jobs, job]

  try {
    const generated = await generateFlashcardDrafts({
      pluginName,
      sourceText: source.text,
      cardTypes,
      detailLevel: resolveQuickDetailLevel(prefs.maxCards),
      // 单次上限由偏好控制：>0 硬上限；0 = 由 AI 根据内容自主决定。
      cardCap: prefs.maxCards,
      cardLanguage: prefs.cardLanguage,
      customInstruction: prefs.customInstruction,
      excludeSummaries
    })

    if (!findJob(jobId)) return null // 已被取消/卸载

    if (!generated.success) {
      const message = sanitizePublicError(generated.error.message)
      patchJob(jobId, {
        status: "error",
        errorMessage: message,
        canOpenConnectionSettings:
          generated.error.code === "HTTP_401" ||
          generated.error.code === "HTTP_403"
      })
      orca.notify("error", message, { title: TITLE })
      return jobId
    }

    if (generated.cards.length === 0) {
      removeJob(jobId)
      orca.notify("info", "这段内容没能产出合格的卡片", { title: TITLE })
      return null
    }

    // 包装块：给预览一个可挂罩层与操作栏的单一根，保留时再把卡片提出来
    const sourceBlock = await resolveBlockBackendFirst(source.blockId)
    if (!sourceBlock) {
      removeJob(jobId)
      orca.notify("error", "源块已不存在", { title: TITLE })
      return null
    }

    let cardBlockIds: number[] = []

    /*
     * 单条插入不再自己开 invokeGroup：writeAICardDrafts 内部已有一个
     * 顶层组，连开两个顶层组会让后一个等不到提交。撤销粒度也更合理——
     * 一次快捷制卡本就该是一个撤销单元。
     */
    const createdRoot = (await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      sourceBlock,
      "lastChild",
      [{ t: "t", v: buildQuickCardRootText(cardTypes, generated.cards.length) }]
    )) as number | null

    if (typeof createdRoot !== "number") {
      removeJob(jobId)
      orca.notify("error", "创建预览块失败", { title: TITLE })
      return null
    }
    const rootId: DbId = createdRoot

    const written = await withWriteTimeout(
      writeAICardDrafts({
        pluginName,
        sourceBlockId: rootId,
        // 接地复校必须对着生成用的文本，包装块正文只是个标题
        sourceText: source.text,
        drafts: generated.cards,
        // 预览期间不进复习队列；「保留」时才激活
        startPending: true
      })
    )

    if (!written.success) {
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          [rootId]
        )
      } catch (cleanupError) {
        console.error("[AI 快捷制卡] 清理预览块失败:", cleanupError)
      }
      removeJob(jobId)
      orca.notify("error", written.error.message, { title: TITLE })
      return null
    }

    cardBlockIds = written.createdBlockIds

    if (!findJob(jobId)) {
      // 生成期间用户已离场：不留下未确认的预览
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          [rootId]
        )
      } catch (cleanupError) {
        console.error("[AI 快捷制卡] 离场清理失败:", cleanupError)
      }
      return null
    }

    patchJob(jobId, {
      status: "ready",
      resultRootBlockId: rootId,
      cardBlockIds,
      resultText: `${cardBlockIds.length} 张${quickCardTypeLabel(cardTypes)}`
    })
    return jobId
  } catch (error) {
    if (error instanceof WritePhaseTimeoutError) {
      // 写入可能仍在后台推进，此时删块会与它打架——只报告，不清理
      const message = `写入超时（${Math.round(
        WRITE_PHASE_TIMEOUT_MS / 1000
      )} 秒）。卡片可能已部分写入，请检查块下方是否残留「AI 快捷制卡」预览块。`
      if (findJob(jobId)) {
        patchJob(jobId, { status: "error", errorMessage: message })
      }
      console.error("[AI 快捷制卡] 写入阶段超时")
      orca.notify("error", message, { title: TITLE })
      return jobId
    }

    const message = sanitizePublicError(
      error instanceof Error ? error.message : "快捷制卡失败"
    )
    if (findJob(jobId)) {
      patchJob(jobId, { status: "error", errorMessage: message })
    }
    console.error("[AI 快捷制卡] 失败:", error)
    orca.notify("error", message, { title: TITLE })
    return jobId
  }
}
