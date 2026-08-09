/**
 * 制卡命令对称撤销
 *
 * 原则：撤销只能删除本次创建新增的内容（标签 / 初始 SRS / IR / _repr），
 * 不得误删用户创建前已有的 #card、复习进度或其它卡种状态。
 */

import type { Block, DbId } from "../../orca.d.ts"
import { cleanupSrsProperties } from "../tagCleanup"
import {
  deleteClozeCardSrsData,
  deleteDirectionCardSrsData,
  invalidateBlockCache
} from "../storage"
import { deleteIRState } from "../incrementalReadingStorage"

/** makeCard / 选择题共用 */
export type BasicCardCreationUndoArgs = {
  blockId: DbId
  pluginName?: string
  originalRepr?: unknown
  originalText?: string
  /** 本次是否新插入了 #card */
  addedCardTag?: boolean
  /** 本次是否走 cleanup + writeInitialSrsState（新卡路径） */
  wroteInitialSrs?: boolean
  /** 选择题：本次是否新插入了 #choice */
  addedChoiceTag?: boolean
}

export type ClozeCardCreationUndoArgs = {
  blockId: DbId
  clozeNumber: number
  pluginName?: string
  /** 本次是否新插入了 #card */
  addedCardTag?: boolean
  /** 本次是否写入了 srs.c{N}.* 初始状态 */
  wroteInitialClozeSrs?: boolean
  /**
   * 本次是否是块首次成为 cloze 卡（创建前无 #card）。
   * 仅此时才摘 #card、清理顶层 srs.* 与 _repr。
   */
  isFirstClozeCard?: boolean
  /**
   * 挖空前 content 深拷贝。存在时 undo 先 setBlocksContent 还原正文，
   * 避免残留 .cloze fragment 导致编号错乱（c1 撤销后再挖变成 c2）。
   */
  originalContent?: unknown
}

export type TopicCardCreationUndoArgs = {
  blockId: DbId
  pluginName?: string
  addedCardTag?: boolean
  /** 创建前无 #card，本次完整初始化 Topic */
  createdFreshTopic?: boolean
  wroteIRState?: boolean
}

export type ListCardCreationUndoArgs = {
  blockId: DbId
  pluginName?: string
  addedCardTag?: boolean
  wroteRootIsCard?: boolean
  /** 本次真正 writeInitialSrsState 的条目子块 */
  initializedItemIds?: DbId[]
  originalRepr?: unknown
}

/** 方向卡创建撤销（insertDirection） */
export type DirectionCardCreationUndoArgs = {
  blockId: DbId
  pluginName?: string
  /** 插入方向标记前的 content 快照 */
  originalContent?: unknown
  /** 本次是否新插入了 #card */
  addedCardTag?: boolean
  /** 本次是否新写入了 srs.isCard */
  wroteIsCard?: boolean
  /** 本次 ensure 实际新写入初始 SRS 的方向 */
  initializedDirections?: Array<"forward" | "backward">
}

function resolvePluginName(args: { pluginName?: string }): string {
  return args.pluginName || "orca-srs"
}

function restoreOrClearRepr(
  blockId: DbId,
  originalRepr: unknown | undefined,
  shouldTouchRepr: boolean
): void {
  if (!shouldTouchRepr) return
  const block = orca.state.blocks?.[blockId] as (Block & { _repr?: unknown }) | undefined
  if (!block) return

  if (originalRepr !== undefined) {
    block._repr = originalRepr as any
  } else if (block._repr) {
    delete block._repr
  }
}

/**
 * 撤销 basic / 选择题创建（makeCardFromBlock、createChoiceCardFromBlock）
 */
export async function undoBasicCardCreation(
  undoArgs: BasicCardCreationUndoArgs
): Promise<void> {
  if (!undoArgs?.blockId) return

  const pluginName = resolvePluginName(undoArgs)
  const blockId = undoArgs.blockId

  try {
    if (undoArgs.wroteInitialSrs) {
      await cleanupSrsProperties(blockId, pluginName)
    }

    if (undoArgs.addedChoiceTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        blockId,
        "choice"
      )
    }

    if (undoArgs.addedCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        blockId,
        "card"
      )
    }

    // 本次写了 _repr 时还原；新卡路径通常有 originalRepr
    restoreOrClearRepr(blockId, undoArgs.originalRepr, true)

    if (undoArgs.originalText !== undefined) {
      const block = orca.state.blocks?.[blockId] as Block | undefined
      if (block) {
        block.text = undoArgs.originalText
      }
    }

    console.log(`[${pluginName}] 已撤销制卡：块 #${blockId}`)
  } catch (error) {
    console.error(`[${pluginName}] 撤销制卡失败（块 #${blockId}）:`, error)
    orca.notify("error", `撤销制卡失败: ${error}`, { title: "SRS" })
    throw error
  }
}

/**
 * 撤销 cloze 挖空：
 * 1. 若有 originalContent → 先还原正文（首次与非首次都要做）
 * 2. 再删本次 srs.c{N}.*
 * 3. 若是首次成为 cloze 卡，再摘 #card 并清理顶层 srs / _repr
 */
export async function undoClozeCardCreation(
  undoArgs: ClozeCardCreationUndoArgs
): Promise<void> {
  if (!undoArgs?.blockId || undoArgs.clozeNumber == null) return

  const pluginName = resolvePluginName(undoArgs)
  const { blockId, clozeNumber } = undoArgs
  const isFirst = !!undoArgs.isFirstClozeCard

  try {
    // 正文必须先还原：编号枚举来自 content 中的 .cloze fragment
    if (undoArgs.originalContent != null) {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: blockId, content: undoArgs.originalContent }],
        false
      )
      invalidateBlockCache(blockId)
    }

    if (undoArgs.wroteInitialClozeSrs !== false) {
      await deleteClozeCardSrsData(blockId, clozeNumber)
      invalidateBlockCache(blockId)
    }

    if (isFirst) {
      // 首次 cloze：清理顶层 srs.isCard 等（不含其它 cN，因仅有本次编号）
      await cleanupSrsProperties(blockId, pluginName)

      if (undoArgs.addedCardTag !== false) {
        await orca.commands.invokeEditorCommand(
          "core.editor.removeTag",
          null,
          blockId,
          "card"
        )
      }

      const block = orca.state.blocks?.[blockId] as (Block & { _repr?: unknown }) | undefined
      if (block?._repr) {
        delete block._repr
      }
    }

    console.log(
      `[${pluginName}] 已撤销 Cloze：块 #${blockId}，c${clozeNumber}` +
        (isFirst ? "（含 #card / 顶层 srs / 正文）" : "（正文 + 本次编号）")
    )
  } catch (error) {
    console.error(
      `[${pluginName}] 撤销 Cloze 失败（块 #${blockId} c${clozeNumber}）:`,
      error
    )
    orca.notify("error", `撤销 Cloze 失败: ${error}`, { title: "Cloze" })
    throw error
  }
}

/**
 * 撤销 Topic 创建：仅当本次完整新建（创建前无 #card）时清理 IR / 标签 / _repr。
 * 已有 #card 仅改 type 时不做破坏性清理。
 */
export async function undoTopicCardCreation(
  undoArgs: TopicCardCreationUndoArgs
): Promise<void> {
  if (!undoArgs?.blockId) return

  const pluginName = resolvePluginName(undoArgs)
  const blockId = undoArgs.blockId
  const fresh = !!undoArgs.createdFreshTopic

  if (!fresh) {
    console.log(
      `[${pluginName}] Topic 撤销跳过破坏性清理：块 #${blockId} 创建前已有 #card`
    )
    return
  }

  try {
    if (undoArgs.wroteIRState !== false) {
      await deleteIRState(blockId)
    }

    if (undoArgs.addedCardTag !== false) {
      await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        blockId,
        "card"
      )
    }

    const block = orca.state.blocks?.[blockId] as (Block & { _repr?: unknown }) | undefined
    if (block?._repr) {
      delete block._repr
    }

    console.log(`[${pluginName}] 已撤销 Topic：块 #${blockId}`)
  } catch (error) {
    console.error(`[${pluginName}] 撤销 Topic 失败（块 #${blockId}）:`, error)
    orca.notify("error", `撤销 Topic 失败: ${error}`, { title: "渐进阅读" })
    throw error
  }
}

/**
 * 撤销列表卡创建：清理本次初始化的条目 srs.*、可选根 isCard / #card。
 * 未设置 _repr 时不碰用户原有 _repr。
 */
export async function undoListCardCreation(
  undoArgs: ListCardCreationUndoArgs
): Promise<void> {
  if (!undoArgs?.blockId) return

  const pluginName = resolvePluginName(undoArgs)
  const blockId = undoArgs.blockId

  try {
    const itemIds = undoArgs.initializedItemIds ?? []
    for (const itemId of itemIds) {
      await cleanupSrsProperties(itemId, pluginName)
    }

    if (undoArgs.wroteRootIsCard) {
      // 列表根只写了 srs.isCard 时优先只删该属性；无属性则 cleanup 为 no-op
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteProperties",
          null,
          [blockId],
          ["srs.isCard"]
        )
        invalidateBlockCache(blockId)
      } catch (error) {
        console.warn(
          `[${pluginName}] 撤销列表卡根 srs.isCard 失败，尝试全量 cleanup:`,
          error
        )
        await cleanupSrsProperties(blockId, pluginName)
      }
    }

    if (undoArgs.addedCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        blockId,
        "card"
      )
    }

    // 列表卡创建路径当前不写 _repr；仅当 undoArgs 显式带 originalRepr 时还原
    if (undoArgs.originalRepr !== undefined) {
      restoreOrClearRepr(blockId, undoArgs.originalRepr, true)
    }

    console.log(`[${pluginName}] 已撤销列表卡：块 #${blockId}`)
  } catch (error) {
    console.error(`[${pluginName}] 撤销列表卡失败（块 #${blockId}）:`, error)
    orca.notify("error", `撤销列表卡失败: ${error}`, { title: "列表卡" })
    throw error
  }
}

/**
 * 撤销方向卡创建：
 * 1. 还原 originalContent（去掉方向 fragment）
 * 2. 仅删除本次新写的 srs.forward|backward.*
 * 3. 仅当本次新增时删除 srs.isCard / #card
 *
 * 创建前已是卡的块：保留 #card、srs.isCard 与既有方向进度。
 */
export async function undoDirectionCardCreation(
  undoArgs: DirectionCardCreationUndoArgs
): Promise<void> {
  if (!undoArgs?.blockId) return

  const pluginName = resolvePluginName(undoArgs)
  const blockId = undoArgs.blockId

  try {
    if (undoArgs.originalContent != null) {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: blockId, content: undoArgs.originalContent }],
        false
      )
      invalidateBlockCache(blockId)
    }

    const dirs = undoArgs.initializedDirections ?? []
    for (const dir of dirs) {
      await deleteDirectionCardSrsData(blockId, dir)
      invalidateBlockCache(blockId)
    }

    if (undoArgs.wroteIsCard) {
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteProperties",
          null,
          [blockId],
          ["srs.isCard"]
        )
        invalidateBlockCache(blockId)
      } catch (error) {
        // 与列表卡对称：单属性失败时尝试全量 cleanup（仅当本次写了 isCard）
        console.warn(
          `[${pluginName}] 撤销方向卡 srs.isCard 失败，尝试全量 cleanup:`,
          error
        )
        await cleanupSrsProperties(blockId, pluginName)
      }
    }

    if (undoArgs.addedCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        blockId,
        "card"
      )
    }

    console.log(
      `[${pluginName}] 已撤销方向卡：块 #${blockId}` +
        (dirs.length ? `（方向 ${dirs.join(",")}）` : "") +
        (undoArgs.addedCardTag ? "（含 #card）" : "")
    )
  } catch (error) {
    console.error(`[${pluginName}] 撤销方向卡失败（块 #${blockId}）:`, error)
    orca.notify("error", `撤销方向卡失败: ${error}`, { title: "方向卡" })
    throw error
  }
}
