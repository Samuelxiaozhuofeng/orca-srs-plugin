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
import { writeInitialDirectionSrsState } from "./storage"
import { isCardTag } from "./tagUtils"

/**
 * 方向类型
 * - forward: 正向（左问右答）
 * - backward: 反向（右问左答）
 * - bidirectional: 双向（生成两张卡片）
 */
export type DirectionType = "forward" | "backward" | "bidirectional"

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
export async function insertDirection(
  cursor: CursorData,
  direction: DirectionType,
  pluginName: string
): Promise<{
  blockId: DbId
  originalContent?: ContentFragment[]
} | null> {
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

  // 验证左右内容不为空
  const leftPart = blockText.substring(0, offset).trim()
  const rightPart = blockText.substring(offset).trim()

  if (!leftPart) {
    orca.notify("warn", "方向标记左侧需要有内容")
    return null
  }

  if (!rightPart) {
    orca.notify("warn", "方向标记右侧需要有内容")
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

  try {
    // 更新块内容
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      cursor,
      [{ id: blockId, content: newContent }],
      false
    )

    // 添加 #card 标签，type=direction
    const hasCardTag = block.refs?.some(
      (ref) => ref.type === 2 && isCardTag(ref.alias)
    )

    if (!hasCardTag) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        cursor,
        blockId,
        "card",
        [{ name: "type", value: "direction" }]
      )
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

    // 设置 _repr
    const finalBlock = orca.state.blocks[blockId] as BlockWithRepr
    finalBlock._repr = {
      type: "srs.direction-card",
      front: leftPart,
      back: rightPart,
      direction: direction
    }

    // 设置 srs.isCard 属性
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: "srs.isCard", value: true, type: 4 }]
    )

    // 初始化 SRS 状态（分天推送）
    if (direction === "bidirectional") {
      await writeInitialDirectionSrsState(blockId, "forward", 0) // 今天
      await writeInitialDirectionSrsState(blockId, "backward", 1) // 明天
    } else {
      await writeInitialDirectionSrsState(blockId, direction, 0)
    }

    const dirLabel =
      direction === "forward"
        ? "正向"
        : direction === "backward"
        ? "反向"
        : "双向"
    orca.notify("success", `已创建${dirLabel}卡片`, { title: "方向卡" })

    return { blockId, originalContent }
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

  // 如果切换到双向，需要初始化反向卡的 SRS 状态
  if (newDirection === "bidirectional") {
    const hasBackward = block.properties?.some((p) =>
      p.name.startsWith("srs.backward.")
    )
    if (!hasBackward) {
      await writeInitialDirectionSrsState(blockId, "backward", 1)
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

  return {
    direction: dirFragment.direction || "forward",
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
  return [direction as "forward" | "backward"]
}
