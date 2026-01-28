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

export type IRCardStats = {
  total: number
  newCount: number
  overdueCount: number
  todayCount: number
  upcoming7Count: number
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

export function groupIRCardsByDate(cards: IRCard[], now: Date = new Date()): IRCardGroup[] {
  const groups = new Map<IRDateGroupKey, IRCard[]>(IR_GROUP_ORDER.map(key => [key, []]))

  for (const card of cards) {
    const key = getIRDateGroup(card, now)
    const target = groups.get(key)
    if (target) {
      target.push(card)
    }
  }

  return IR_GROUP_ORDER
    .map(key => {
      const groupCards = groups.get(key) ?? []
      groupCards.sort((a, b) => a.due.getTime() - b.due.getTime())
      return {
        key,
        title: key,
        cards: groupCards
      }
    })
    .filter(group => group.cards.length > 0)
}

export function calculateIRStats(cards: IRCard[], now: Date = new Date()): IRCardStats {
  let newCount = 0
  let overdueCount = 0
  let todayCount = 0
  let upcoming7Count = 0

  for (const card of cards) {
    const group = getIRDateGroup(card, now)
    if (group === "新卡") {
      newCount += 1
    } else if (group === "已逾期") {
      overdueCount += 1
    } else if (group === "今天") {
      todayCount += 1
    } else if (group === "明天" || group === "未来7天") {
      upcoming7Count += 1
    }
  }

  return {
    total: cards.length,
    newCount,
    overdueCount,
    todayCount,
    upcoming7Count
  }
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

export async function openIRManager(pluginName: string): Promise<void> {
  try {
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "渐进阅读" })
      return
    }

    const blockId = await getOrCreateIncrementalReadingManagerBlock(pluginName)

    const panels = orca.state.panels
    for (const [panelId, panel] of Object.entries(panels)) {
      if (panel.viewArgs?.blockId === blockId) {
        orca.nav.switchFocusTo(panelId)
        return
      }
    }

    orca.nav.goTo("block", { blockId }, activePanelId)
    orca.notify("success", "渐进阅读管理面板已打开", { title: "渐进阅读" })
  } catch (error) {
    console.error(`[${pluginName}] 打开渐进阅读管理面板失败:`, error)
    orca.notify("error", "打开渐进阅读管理面板失败", { title: "渐进阅读" })
  }
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
