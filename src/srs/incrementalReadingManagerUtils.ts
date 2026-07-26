import type { DbId } from "../orca.d.ts"
import type { IRCard } from "./incrementalReadingCollector"

/**
 * 渐进阅读管理面板工具函数
 *
 * 包含：面板块管理、分组与统计计算
 */

export type IRDateGroupKey = "已逾期" | "今天" | "明天" | "未来7天" | "新卡" | "7天后"

export const IR_GROUP_ORDER: IRDateGroupKey[] = [
  "已逾期",
  "今天",
  "明天",
  "未来7天",
  "新卡",
  "7天后"
]

export const IR_GROUP_DEFAULT_EXPANDED: Record<IRDateGroupKey, boolean> = {
  "已逾期": true,
  "今天": true,
  "明天": true,
  "未来7天": true,
  "新卡": true,
  "7天后": false
}

const DAY_MS = 24 * 60 * 60 * 1000

export type IRCardGroup = {
  key: IRDateGroupKey
  title: string
  cards: IRCard[]
}

function toStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getIRDateGroup(card: IRCard, now: Date = new Date()): IRDateGroupKey {
  if (card.isNew) {
    return "新卡"
  }

  const today = toStartOfDay(now)
  const dueDay = toStartOfDay(card.due)
  const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / DAY_MS)

  if (diffDays < 0) return "已逾期"
  if (diffDays === 0) return "今天"
  if (diffDays === 1) return "明天"
  if (diffDays <= 7) return "未来7天"
  return "7天后"
}

// ======================================================================
// 管理面板块管理器
// ======================================================================

let irManagerBlockId: DbId | null = null
const STORAGE_KEY = "incrementalReadingManagerBlockId"

export async function getOrCreateIncrementalReadingManagerBlock(
  pluginName: string
): Promise<DbId> {
  if (irManagerBlockId) {
    const existing = await resolveBlock(irManagerBlockId)
    if (existing) return irManagerBlockId
  }

  const storedId = await orca.plugins.getData(pluginName, STORAGE_KEY)
  if (typeof storedId === "number") {
    const existing = await resolveBlock(storedId)
    if (existing) {
      irManagerBlockId = storedId
      return storedId
    }
  }

  const newId = await createIncrementalReadingManagerBlock(pluginName)
  await orca.plugins.setData(pluginName, STORAGE_KEY, newId)
  irManagerBlockId = newId
  return newId
}

async function createIncrementalReadingManagerBlock(pluginName: string): Promise<DbId> {
  const blockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[渐进阅读管理面板 - ${pluginName}]` }],
    { type: "srs.ir-manager" }
  ) as DbId

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [
      { name: "ir.isManagerBlock", value: true, type: 4 },
      { name: "ir.pluginName", value: pluginName, type: 2 }
    ]
  )

  const block = orca.state.blocks?.[blockId] as any
  if (block) {
    block._repr = {
      type: "srs.ir-manager"
    }
  }

  console.log(`[${pluginName}] 创建渐进阅读管理面板块: #${blockId}`)
  return blockId
}

export async function cleanupIncrementalReadingManagerBlock(pluginName: string): Promise<void> {
  if (irManagerBlockId) {
    const block = orca.state.blocks?.[irManagerBlockId] as any
    if (block && block._repr?.type === "srs.ir-manager") {
      delete block._repr
    }
    irManagerBlockId = null
  }

  await orca.plugins.removeData(pluginName, STORAGE_KEY)
}

async function resolveBlock(blockId: DbId) {
  const fromState = orca.state.blocks?.[blockId]
  if (fromState) return fromState
  try {
    const fetched = await orca.invokeBackend("get-block", blockId)
    return fetched
  } catch (error) {
    console.warn("[ir-manager] 无法从后端获取管理面板块:", error)
    return null
  }
}
