/**
 * 标签属性初始化模块
 *
 * 确保仓库存在可作为 #card 使用的 alias 标签块，并补齐标签 schema 属性定义。
 * 全新安装在插件 load 时后台准备；制卡 / Book IR 路径仍作同步兜底。
 */

import type { Block, BlockProperty, DbId } from "../orca.d.ts"
import { invalidateBlockCache } from "./storage"

/**
 * PropType 常量（根据 Orca 文档）
 *
 * 参考 Core-Editor-Commands.md setProperties 文档：
 * - 0: PropType.JSON
 * - 1: PropType.Text
 * - 2: PropType.BlockRefs
 * - 3: PropType.Number
 * - 4: PropType.Boolean
 * - 5: PropType.DateTime
 * - 6: PropType.TextChoices
 */
const PropType = {
  JSON: 0,
  Text: 1,
  BlockRefs: 2,
  Number: 3,
  Boolean: 4,
  DateTime: 5,
  TextChoices: 6
} as const

const DEFAULT_IR_PRIORITY = 50
const CARD_TAG_ALIAS = "card"

/**
 * card 标签需要的属性定义
 *
 * 根据 Orca 的标签属性系统：
 * - type 和 status 使用"文本"类型（PropType.Text = 1）
 * - 牌组 使用"块引用"类型（PropType.BlockRefs = 2）
 * - priority 使用"数字"类型（PropType.Number = 3）
 * - 不强制每个 ref 都有默认值；priority 由插件按需写入到 ref.data
 */
const CARD_TAG_PROPERTY_DEFINITIONS: BlockProperty[] = [
  {
    name: "type",
    type: PropType.Text,
    value: ""
  },
  {
    name: "牌组",
    type: PropType.BlockRefs,
    // 空数组会被 Orca 静默忽略，必须用 undefined
    value: undefined as any
  },
  {
    name: "status",
    type: PropType.Text,
    value: ""
  },
  {
    name: "priority",
    type: PropType.Number,
    value: DEFAULT_IR_PRIORITY
  }
]

/** 缓存：全部必要属性已成功写入后才为 true */
let cardTagInitialized = false

/** 同一轮初始化的共享 Promise；失败后清空以便重试 */
let initializationPromise: Promise<void> | null = null

function isValidBlockId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 若本轮新建了块但未能成为 `card` alias，删除孤立块。
 * 清理失败只记录，不覆盖原始错误。
 */
async function cleanupOrphanCreatedBlock(
  pluginName: string,
  blockId: DbId,
  originalError: unknown
): Promise<void> {
  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [blockId]
    )
  } catch (cleanupError) {
    console.error(
      `[${pluginName}] [tagPropertyInit] 创建 #card 标签失败后清理孤立块 #${blockId} 也失败（可手动删除）。原错误: ${formatError(originalError)}`,
      cleanupError
    )
  }
}

/**
 * 确保存在 alias 为 `card` 的标签块。
 * 不存在时：insertBlock → createAlias(asPage) → backend 重新确认。
 * 仅当本轮新建的块未能成为 card alias 时清理该孤立块；不得删除既有 card 标签。
 */
async function ensureCardTagBlock(pluginName: string): Promise<Block> {
  const existing = (await orca.invokeBackend(
    "get-block-by-alias",
    CARD_TAG_ALIAS
  )) as Block | null | undefined

  if (existing && isValidBlockId(existing.id)) {
    return existing
  }

  const newBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: CARD_TAG_ALIAS }],
    { type: "heading", level: 1 }
  )

  if (!isValidBlockId(newBlockId)) {
    throw new Error(
      `[${pluginName}] [tagPropertyInit] 创建 #card 标签块失败：insertBlock 未返回有效块 ID（得到 ${String(newBlockId)}）`
    )
  }

  let aliasCommandError: unknown = null
  let aliasResult: unknown = undefined
  try {
    // createAlias 在名称已被占用时可能返回 error 对象（见 Core-Editor-Commands.md）
    aliasResult = await orca.commands.invokeEditorCommand(
      "core.editor.createAlias",
      null,
      CARD_TAG_ALIAS,
      newBlockId,
      true
    )
  } catch (error) {
    aliasCommandError = error
  }

  let confirmed: Block | null | undefined
  try {
    confirmed = (await orca.invokeBackend(
      "get-block-by-alias",
      CARD_TAG_ALIAS
    )) as Block | null | undefined
  } catch (readError) {
    const combined = new Error(
      `[${pluginName}] [tagPropertyInit] createAlias 后读取 alias "card" 失败: ${formatError(readError)}`,
      { cause: readError }
    )
    await cleanupOrphanCreatedBlock(pluginName, newBlockId, combined)
    throw combined
  }

  if (confirmed && isValidBlockId(confirmed.id)) {
    if (confirmed.id !== newBlockId) {
      // 既有/竞态 alias：本轮新建块不是真正的 card 标签，清理孤立块后使用已确认块
      await cleanupOrphanCreatedBlock(
        pluginName,
        newBlockId,
        new Error(
          `alias "card" 已指向块 #${confirmed.id}，本轮新建块 #${newBlockId} 未成为标签`
        )
      )
    } else if (aliasCommandError != null) {
      console.warn(
        `[${pluginName}] [tagPropertyInit] createAlias 抛错但 backend 已确认 alias "card" → #${confirmed.id}`,
        aliasCommandError
      )
    } else if (aliasResult != null && aliasResult !== undefined) {
      // 命令返回了非空结果但仍可读到本块——以 backend 确认为准
      console.warn(
        `[${pluginName}] [tagPropertyInit] createAlias 返回了非空结果，但 backend 已确认 alias "card" → #${confirmed.id}`,
        aliasResult
      )
    }
    return confirmed
  }

  // 未能成为 card alias：清理本轮孤立块并抛出可见错误
  const detail = aliasCommandError != null
    ? formatError(aliasCommandError)
    : aliasResult != null && aliasResult !== undefined
      ? `createAlias 返回: ${formatError(aliasResult)}`
      : "createAlias 后 get-block-by-alias(\"card\") 仍为空"
  const error = new Error(
    `[${pluginName}] [tagPropertyInit] 未能建立 #card 标签 alias：${detail}`,
    { cause: aliasCommandError ?? undefined }
  )
  await cleanupOrphanCreatedBlock(pluginName, newBlockId, error)
  throw error
}

/**
 * 将标签块上缺失的 schema 属性全部写入。任一属性失败则抛出，不缓存成功。
 */
async function ensureMissingProperties(
  pluginName: string,
  cardTagBlock: Block
): Promise<void> {
  const existingPropNames = new Set(
    (cardTagBlock.properties ?? []).map(p => p.name)
  )
  const missingProps = CARD_TAG_PROPERTY_DEFINITIONS.filter(
    propDef => !existingPropNames.has(propDef.name)
  )

  if (missingProps.length === 0) {
    return
  }

  for (const prop of missingProps) {
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [cardTagBlock.id],
        [prop]
      )
      // 标签 schema 块通常不经 getBlockCached 进入 SRS blockCache，
      // 但属性写入后仍按契约精确失效，避免将来被 preheat 后读到陈旧 schema。
      invalidateBlockCache(cardTagBlock.id)
    } catch (propError) {
      const message = formatError(propError)
      console.error(
        `[${pluginName}] [tagPropertyInit] 属性 "${prop.name}" 添加失败:`,
        propError
      )
      throw new Error(
        `[${pluginName}] [tagPropertyInit] 属性 "${prop.name}" 添加失败: ${message}`,
        { cause: propError }
      )
    }
  }
}

async function runEnsureCardTagProperties(pluginName: string): Promise<void> {
  const cardTagBlock = await ensureCardTagBlock(pluginName)
  await ensureMissingProperties(pluginName, cardTagBlock)
  cardTagInitialized = true
}

/**
 * 确保 #card 标签块存在且具备必要的属性定义（幂等）。
 *
 * 工作流程：
 * 1. 已成功初始化则直接返回
 * 2. 并发调用共享同一轮 Promise，全部等待完成
 * 3. 若 alias 不存在：insertBlock + createAlias，backend 确认后再补属性
 * 4. 补齐全部缺失属性；任一失败抛出且不缓存「已初始化」
 *
 * @param pluginName - 插件名称（用于日志）
 * @throws 创建标签或写入属性失败时 reject（调用方可重试）
 */
export async function ensureCardTagProperties(pluginName: string): Promise<void> {
  if (cardTagInitialized) {
    return
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    try {
      await runEnsureCardTagProperties(pluginName)
    } catch (error) {
      console.error(`[${pluginName}] [tagPropertyInit] 初始化失败:`, error)
      throw error
    } finally {
      // 无论成败都清空 in-flight，失败后允许下次重试
      initializationPromise = null
    }
  })()

  return initializationPromise
}

/**
 * 重置初始化状态（用于测试或重新加载插件）
 */
export function resetCardTagInitState(): void {
  cardTagInitialized = false
  initializationPromise = null
}
