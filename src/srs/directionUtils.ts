/**
 * 方向卡工具模块
 *
 * 职责：
 * - 插入方向标记
 * - 切换方向
 * - 解析方向卡内容
 */

import type { CursorData, Block, ContentFragment, DbId } from "../orca.d.ts"
import type { BlockWithRepr } from "./blockUtils"
import {
  computeLegacyDueFromDaysOffset,
  formatInitialDueHint,
  resolveInitialDue,
  type InitialDueOrigin
} from "./initialDuePolicy"
import { getIrItemCreateOptionsForBlock } from "./irItemCreateContext"
import { getIrItemInitialDueMode } from "./settings/reviewSettingsSchema"
import { ensureDirectionSrsState, invalidateBlockCache } from "./storage"
import { isCardTag } from "./tagUtils"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { buildCardTagData } from "./cardTagDataBuilder"

/** 方向卡首次 due 选项（由调用方判定 IR 来源） */
export type InsertDirectionOptions = {
  initialDueOrigin?: InitialDueOrigin
  irPriority?: number
}

/**
 * 方向类型
 * - forward: 正向（左问右答）
 * - backward: 反向（右问左答）
 * - bidirectional: 双向（生成两张卡片）
 */
export type DirectionType = "forward" | "backward" | "bidirectional"

/** direction 值白名单（块内容是可被外部改写的持久化数据，读取时必须校验） */
const VALID_DIRECTIONS: ReadonlySet<string> = new Set([
  "forward",
  "backward",
  "bidirectional"
])

/**
 * 方向符号映射
 */
const DIRECTION_SYMBOLS: Record<DirectionType, string> = {
  forward: "→",
  backward: "←",
  bidirectional: "↔"
}

/**
 * 在光标位置插入方向标记
 *
 * @param cursor - 当前光标位置
 * @param direction - 方向类型
 * @param pluginName - 插件名称
 * @returns 插入结果，包含块ID和原始内容（用于撤销）
 */
/** insertDirection 返回值（含对称撤销所需标志） */
export type InsertDirectionResult = {
  blockId: DbId
  pluginName: string
  originalContent?: ContentFragment[]
  /** 本次是否新插入了 #card */
  addedCardTag: boolean
  /** 本次是否新写入了 srs.isCard（创建前已有则 false） */
  wroteIsCard: boolean
  /** 本次 ensure 实际新写入初始 SRS 的方向（已有前缀不列入） */
  initializedDirections: Array<"forward" | "backward">
  initialDue?: Date
  initialDueHint?: string
}

function hasSrsIsCardProperty(block: Block | undefined): boolean {
  return (
    block?.properties?.some(p => p.name === "srs.isCard") === true
  )
}

function hasDirectionSrsPrefix(
  block: Block | undefined,
  dir: "forward" | "backward"
): boolean {
  const prefix = `srs.${dir}.`
  return block?.properties?.some(p => p.name.startsWith(prefix)) === true
}

export async function insertDirection(
  cursor: CursorData,
  direction: DirectionType,
  pluginName: string,
  options?: InsertDirectionOptions
): Promise<InsertDirectionResult | null> {
  if (!cursor?.anchor?.blockId) {
    orca.notify("error", "无法获取光标位置")
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block

  if (!block) {
    orca.notify("error", "未找到当前块")
    return null
  }

  // 检查是否已有方向标记
  const hasDirection = block.content?.some(
    (f) => f.t === `${pluginName}.direction`
  )
  if (hasDirection) {
    orca.notify("warn", "当前块已有方向标记，请点击箭头切换方向")
    return null
  }

  // 检查是否有 Cloze（暂不支持混用）
  const hasCloze = block.content?.some((f) => f.t === `${pluginName}.cloze`)
  if (hasCloze) {
    orca.notify("warn", "方向卡暂不支持与填空卡混用")
    return null
  }

  const offset = cursor.anchor.offset
  const blockText = block.text || ""

  // 验证左侧内容不为空（允许先插入符号再输入右侧答案）
  const leftPart = blockText.substring(0, offset).trim()
  const rightPart = blockText.substring(offset).trim()

  if (!leftPart) {
    orca.notify("warn", "方向标记左侧需要有内容")
    return null
  }

  // 构建新的 content 数组
  const symbol = DIRECTION_SYMBOLS[direction]
  const newContent: ContentFragment[] = [
    { t: "t", v: leftPart + " " },
    {
      t: `${pluginName}.direction`,
      v: symbol,
      direction: direction,
    } as ContentFragment,
    { t: "t", v: " " + rightPart }
  ]

  // 保存原始内容供撤销使用
  const originalContent = block.content ? [...block.content] : undefined
  const hadCardTag = block.refs?.some(
    (ref) => ref.type === 2 && isCardTag(ref.alias)
  ) === true
  const hadIsCard = hasSrsIsCardProperty(block)

  try {
    // 更新块内容
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      cursor,
      [{ id: blockId, content: newContent }],
      false
    )

    // 添加 #card 标签，type=direction
    const addedCardTag = !hadCardTag
    if (addedCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        blockId,
        "card",
        await buildCardTagData(pluginName, blockId, "direction")
      )
      
      // 确保 #card 标签块有属性定义（首次使用时自动初始化）
      await ensureCardTagProperties(pluginName)
    } else {
      // 更新已有标签的 type 属性
      const cardRef = block.refs?.find(
        (ref) => ref.type === 2 && isCardTag(ref.alias)
      )
      if (cardRef) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          cardRef,
          [{ name: "type", value: "direction" }]
        )
      }
    }

    // 注意：Direction 卡片保持为普通可编辑文本块（不设置 srs.direction-card _repr），
    // 以支持“先插入符号，再输入右侧答案”的单行编辑体验。

    // 设置 srs.isCard 属性（创建前已有则仍写入 true，但 undo 不得删除）
    const wroteIsCard = !hadIsCard
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: "srs.isCard", value: true, type: 4 }]
    )
    invalidateBlockCache(blockId)

    // 初始化 SRS 状态（legacy 分天；IR Item 走 initialDuePolicy）
    const createdAt = new Date()
    const origin: InitialDueOrigin = options?.initialDueOrigin ?? "standard"
    const mode = getIrItemInitialDueMode(pluginName)
    let firstHint: string | undefined
    let firstDue: Date | undefined
    const initializedDirections: Array<"forward" | "backward"> = []

    const writeDir = async (
      dir: "forward" | "backward",
      legacyOffset: number
    ) => {
      const live = orca.state.blocks?.[blockId] as Block | undefined
      const alreadyHad = hasDirectionSrsPrefix(live, dir)
      const legacyDue = computeLegacyDueFromDaysOffset(createdAt, legacyOffset)
      const resolved = resolveInitialDue({
        origin,
        mode,
        identity: {
          blockId,
          cardType: "direction",
          directionType: dir
        },
        createdAt,
        legacyDue,
        priority: options?.irPriority
      })
      if (firstDue == null) {
        firstDue = resolved.due
        firstHint = formatInitialDueHint(resolved, createdAt)
      }
      // ensure：已有该方向前缀则不覆盖真进度
      await ensureDirectionSrsState(
        blockId,
        dir,
        legacyOffset,
        origin === "ir_item" ? resolved.due : undefined
      )
      if (!alreadyHad) {
        initializedDirections.push(dir)
      }
    }

    if (direction === "bidirectional") {
      await writeDir("forward", 0)
      await writeDir("backward", 1)
    } else {
      await writeDir(direction, 0)
    }

    // 将光标移动到方向标记右侧，方便继续输入答案
    try {
      const nextCursor: CursorData = {
        ...cursor,
        isForward: true,
        anchor: {
          ...cursor.anchor,
          blockId,
          isInline: true,
          index: 2,
          offset: 1
        },
        focus: {
          ...cursor.focus,
          blockId,
          isInline: true,
          index: 2,
          offset: 1
        }
      }
      await orca.utils.setSelectionFromCursorData(nextCursor)
    } catch (e) {
      console.warn(`[${pluginName}] 设置光标位置失败:`, e)
    }

    const dirLabel =
      direction === "forward"
        ? "正向"
        : direction === "backward"
        ? "反向"
        : "双向"
    const dueSuffix =
      origin === "ir_item" && firstHint ? `（${firstHint}）` : ""
    orca.notify("success", `已创建${dirLabel}卡片${dueSuffix}`, {
      title: "方向卡"
    })

    return {
      blockId,
      pluginName,
      originalContent,
      addedCardTag,
      wroteIsCard,
      initializedDirections,
      initialDue: firstDue,
      initialDueHint: firstHint
    }
  } catch (error) {
    console.error(`[${pluginName}] 创建方向卡失败:`, error)
    orca.notify("error", `创建方向卡失败: ${error}`)
    return null
  }
}

/**
 * 切换方向标记（循环：forward → backward → bidirectional → forward）
 *
 * @param current - 当前方向
 * @returns 下一个方向
 */
export function cycleDirection(current: DirectionType): DirectionType {
  const cycle: DirectionType[] = ["forward", "backward", "bidirectional"]
  const idx = cycle.indexOf(current)
  return cycle[(idx + 1) % cycle.length]
}

/**
 * 更新块中的方向标记
 *
 * @param blockId - 块ID
 * @param newDirection - 新方向
 * @param pluginName - 插件名称
 */
export async function updateBlockDirection(
  blockId: DbId,
  newDirection: DirectionType,
  pluginName: string
): Promise<void> {
  const block = orca.state.blocks[blockId] as Block
  if (!block?.content) return

  const newContent = block.content.map((fragment) => {
    if (fragment.t === `${pluginName}.direction`) {
      return {
        ...fragment,
        v: DIRECTION_SYMBOLS[newDirection],
        direction: newDirection,
      }
    }
    return fragment
  })

  await orca.commands.invokeEditorCommand(
    "core.editor.setBlocksContent",
    null,
    [{ id: blockId, content: newContent }],
    false
  )

  // 更新 _repr
  const blockWithRepr = block as BlockWithRepr
  if (blockWithRepr._repr) {
    blockWithRepr._repr = {
      ...blockWithRepr._repr,
      direction: newDirection
    }
  }

  // 如果切换到双向，需要初始化反向卡的 SRS 状态（接入 IR Item 首次 due）
  if (newDirection === "bidirectional") {
    const hasBackward = block.properties?.some((p) =>
      p.name.startsWith("srs.backward.")
    )
    if (!hasBackward) {
      const createdAt = new Date()
      const irOpts = await getIrItemCreateOptionsForBlock(block, blockId)
      const origin = irOpts?.initialDueOrigin ?? "standard"
      const legacyDue = computeLegacyDueFromDaysOffset(createdAt, 1)
      const resolved = resolveInitialDue({
        origin,
        mode: getIrItemInitialDueMode(pluginName),
        identity: {
          blockId,
          cardType: "direction",
          directionType: "backward"
        },
        createdAt,
        legacyDue,
        priority: irOpts?.irPriority
      })
      await ensureDirectionSrsState(
        blockId,
        "backward",
        1,
        origin === "ir_item" ? resolved.due : undefined
      )
    }
  }
}

/**
 * 从 content 中提取方向标记信息
 *
 * @param content - 块内容数组
 * @param pluginName - 插件名称
 * @returns 方向标记信息，包含方向类型和左右文本
 */
export function extractDirectionInfo(
  content: ContentFragment[] | undefined,
  pluginName: string
): {
  direction: DirectionType
  leftText: string
  rightText: string
} | null {
  if (!content || content.length === 0) return null

  const dirIdx = content.findIndex((f) => f.t === `${pluginName}.direction`)
  if (dirIdx === -1) return null

  const dirFragment = content[dirIdx] as any
  const leftParts = content.slice(0, dirIdx)
  const rightParts = content.slice(dirIdx + 1)

  const leftText = leftParts
    .map((f) => f.v || "")
    .join("")
    .trim()
  const rightText = rightParts
    .map((f) => f.v || "")
    .join("")
    .trim()

  // fragment 来自持久化块内容（不可信）：direction 必须落在白名单内。
  // 缺失（falsy）沿用既有回退 "forward"，不告警；契约外的脏值告警后回退 "forward"，
  // 确保下游属性写入只会收到合法方向字面量。
  const rawDirection = dirFragment.direction
  let direction: DirectionType
  if (typeof rawDirection === "string" && VALID_DIRECTIONS.has(rawDirection)) {
    direction = rawDirection as DirectionType
  } else {
    if (rawDirection) {
      console.warn(
        `[srs] direction fragment 含非法方向值（${JSON.stringify(rawDirection)}），已回退为 "forward"（合法值：forward/backward/bidirectional）`
      )
    }
    direction = "forward"
  }

  return {
    direction,
    leftText,
    rightText
  }
}

/**
 * 获取块中的方向类型列表
 *
 * forward/backward 返回 [自身]
 * bidirectional 返回 ["forward", "backward"]
 *
 * @param direction - 方向类型
 * @returns 需要生成卡片的方向数组
 */
export function getDirectionList(
  direction: DirectionType
): ("forward" | "backward")[] {
  if (direction === "bidirectional") {
    return ["forward", "backward"]
  }
  if (direction === "forward" || direction === "backward") {
    return [direction]
  }
  // 返回值会流入 srs.<dir>.* 属性名构建（storage.ts buildDirectionPropertyName），
  // 契约要求命名空间只能是 srs.forward.* / srs.backward.*：
  // 白名单外的脏值（运行时可能来自持久化数据）告警后跳过，绝不进入属性写入。
  console.warn(
    `[srs] 非法方向值（${JSON.stringify(direction)}），已跳过该方向（合法值：forward/backward/bidirectional）`
  )
  return []
}

export type DirectionStructureAction = "downgraded" | "removed" | "noop"

/**
 * 删除某一方向后的 content 结构变换（纯函数，不写库）。
 *
 * - 双向删一向 → 降级为剩余单向（更新 fragment 的 `direction` 与符号 `v`）
 * - 删最后一向 → 移除 direction fragment，左右片段原样保留（不合并相邻文本）
 * - 块内无 direction / 要删的方向本就不在列表中 → noop
 */
export function removeOrDowngradeDirectionInContent(
  content: ContentFragment[] | undefined,
  removeDirection: "forward" | "backward",
  pluginName: string
): {
  content: ContentFragment[]
  action: DirectionStructureAction
  remainingDirection?: "forward" | "backward"
} {
  if (!content || content.length === 0) {
    return { content: content ? [...content] : [], action: "noop" }
  }

  const dirIdx = content.findIndex((f) => f.t === `${pluginName}.direction`)
  if (dirIdx === -1) {
    return { content: [...content], action: "noop" }
  }

  const info = extractDirectionInfo(content, pluginName)
  if (!info) {
    return { content: [...content], action: "noop" }
  }

  const list = getDirectionList(info.direction)
  if (!list.includes(removeDirection)) {
    return { content: [...content], action: "noop" }
  }

  const remaining = list.filter((d) => d !== removeDirection)
  if (remaining.length === 0) {
    // 最后一向：去掉 direction fragment，左右文字原样保留
    const next = [...content.slice(0, dirIdx), ...content.slice(dirIdx + 1)]
    return { content: next, action: "removed" }
  }

  const remainingDirection = remaining[0]
  const next = content.map((fragment, index) => {
    if (index !== dirIdx) return fragment
    return {
      ...fragment,
      v: DIRECTION_SYMBOLS[remainingDirection],
      direction: remainingDirection
    } as ContentFragment
  })
  return {
    content: next,
    action: "downgraded",
    remainingDirection
  }
}

/**
 * 删除某一方向后写回块 content（降级或移除 direction fragment）。
 * 写入成功后立即 `invalidateBlockCache`。
 *
 * @param content - 可选：调用方已从 backend 读到的 content
 * @throws setBlocksContent 失败时抛错（错误可见）
 */
export async function applyDirectionVariantRemoval(
  blockId: DbId,
  removeDirection: "forward" | "backward",
  pluginName: string,
  content?: ContentFragment[]
): Promise<{
  action: DirectionStructureAction
  remainingDirection?: "forward" | "backward"
  content: ContentFragment[]
}> {
  let source = content
  if (!source) {
    const block = orca.state.blocks?.[blockId] as Block | undefined
    if (!block) {
      throw new Error(
        `删除方向结构失败：块 #${blockId} 不存在于 state`
      )
    }
    source = block.content ?? []
  }

  const result = removeOrDowngradeDirectionInContent(
    source,
    removeDirection,
    pluginName
  )

  if (result.action === "noop") {
    return result
  }

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      null,
      [{ id: blockId, content: result.content }],
      false
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(
      `更新方向卡结构失败（块 #${blockId}，删除 ${removeDirection}）：${msg}。SRS 属性尚未删除，可重试。`
    )
  }

  invalidateBlockCache(blockId)
  return result
}
