/**
 * 书籍渐进阅读（Book IR）创建模块
 *
 * 场景：用户选择一个“book”块，块内包含多个“章节”块的行内引用（RefType.Inline = 1）。
 * 目标：批量把章节块初始化为 Topic（#card type=topic），并写入 ir.* 属性与分散的到期时间。
 */

import type { Block, DbId } from "../orca.d.ts"
import type { IRPriorityChoice } from "./incrementalReadingScheduler"
import { invalidateIrBlockCache } from "./incrementalReadingStorage"
import { isCardTag } from "./tagUtils"

export type { IRPriorityChoice } from "./incrementalReadingScheduler"

const MS_PER_DAY = 24 * 60 * 60 * 1000

function getTodayMidnight(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function mapPriorityChoiceToNumeric(choice: IRPriorityChoice): number {
  // 与 getIntervalDays 的分段更匹配：高(>=8)、中(4-5)、低(<=3)
  if (choice === "高优先级") return 9
  if (choice === "中优先级") return 5
  return 2
}

/**
 * 从 book 块及其子块中提取章节块 ID（只取行内引用 RefType.Inline = 1）
 * 
 * 支持两种场景：
 * 1. 书籍块本身包含 inline references
 * 2. 书籍块的子块包含 inline references（如标题块下的章节列表）
 */
export function getChapterBlockIds(bookBlock: Block): DbId[] {
  const seen = new Set<DbId>()
  const result: DbId[] = []

  function collectInlineRefs(block: Block): void {
    const refs = block.refs ?? []
    for (const ref of refs) {
      if (ref.type !== 1) continue // RefType.Inline = 1
      const to = ref.to as DbId | undefined
      if (typeof to !== "number") continue
      if (seen.has(to)) continue
      if (to === bookBlock.id) continue // 排除自引用
      seen.add(to)
      result.push(to)
    }
  }

  // 1. 检查书籍块本身
  collectInlineRefs(bookBlock)

  // 2. 检查直接子块
  const childIds = bookBlock.children ?? []
  for (const childId of childIds) {
    const childBlock = orca.state.blocks?.[childId] as Block | undefined
    if (childBlock) {
      collectInlineRefs(childBlock)
    }
  }

  return result
}

/**
 * 异步版本：从 book 块及其子块中提取章节块 ID
 * 会尝试从后端获取未加载的子块
 */
export async function getChapterBlockIdsAsync(bookBlock: Block): Promise<DbId[]> {
  const seen = new Set<DbId>()
  const result: DbId[] = []

  function collectInlineRefs(block: Block): void {
    const refs = block.refs ?? []
    for (const ref of refs) {
      if (ref.type !== 1) continue // RefType.Inline = 1
      const to = ref.to as DbId | undefined
      if (typeof to !== "number") continue
      if (seen.has(to)) continue
      if (to === bookBlock.id) continue // 排除自引用
      seen.add(to)
      result.push(to)
    }
  }

  // 1. 检查书籍块本身
  collectInlineRefs(bookBlock)

  // 2. 检查直接子块（异步获取）
  const childIds = bookBlock.children ?? []
  for (const childId of childIds) {
    let childBlock = orca.state.blocks?.[childId] as Block | undefined
    if (!childBlock) {
      childBlock = await orca.invokeBackend("get-block", childId) as Block | undefined
    }
    if (childBlock) {
      collectInlineRefs(childBlock)
    }
  }

  return result
}

/**
 * 计算章节分散到期时间
 *
 * - 总跨度：totalDays
 * - 均匀分布 + 随机抖动（0-0.5 天），避免同日堆积
 */
export function calculateChapterDueDates(chapterCount: number, totalDays: number): Date[] {
  if (!Number.isFinite(chapterCount) || chapterCount <= 0) {
    return []
  }

  const safeTotalDays = Number.isFinite(totalDays) ? Math.max(0, totalDays) : 0
  const start = getTodayMidnight()

  const stepDays = chapterCount <= 1 ? 0 : safeTotalDays / (chapterCount - 1)

  const dates: Date[] = []
  let prev: Date | null = null

  for (let i = 0; i < chapterCount; i++) {
    const baseDays = i * stepDays
    const jitterDays = Math.random() * 0.5 // 0-0.5 天
    const next = new Date(start.getTime() + (baseDays + jitterDays) * MS_PER_DAY)

    // 保证单调递增（避免抖动导致“倒序”）
    if (prev && next.getTime() <= prev.getTime()) {
      next.setTime(prev.getTime() + 60 * 1000)
    }

    dates.push(next)
    prev = next
  }

  return dates
}

/**
 * 批量为章节块初始化渐进阅读
 *
 * 规则：
 * - 没有 #card 时：插入 #card(type=topic)
 * - 已有 #card 时：至少更新 type=topic；priority 仅在缺失时补齐（避免覆盖用户已选）
 * - 写入 ir.*：priority/lastRead/readCount/due
 */
export async function setupBookIR(
  chapterIds: DbId[],
  priority: IRPriorityChoice,
  totalDays: number
): Promise<{ success: DbId[]; failed: DbId[] }> {
  if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
    return { success: [], failed: [] }
  }

  const dueDates = calculateChapterDueDates(chapterIds.length, totalDays)
  const numericPriority = mapPriorityChoiceToNumeric(priority)

  const success: DbId[] = []
  const failed: DbId[] = []

  for (let i = 0; i < chapterIds.length; i++) {
    const blockId = chapterIds[i]
    const due = dueDates[i] ?? new Date()

    try {
      const block =
        (orca.state.blocks?.[blockId] as Block | undefined)
        || ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)

      if (!block) {
        throw new Error(`未找到章节块 #${blockId}`)
      }

      const hasCardTag = block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false

      if (!hasCardTag) {
        // 插入 #card(type=topic)
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          blockId,
          "card",
          [
            { name: "type", value: "topic" },
            { name: "牌组", value: [] },
            { name: "status", value: "" },
            { name: "priority", value: [priority] }
          ]
        )
      } else {
        // 更新既有 #card：type=topic；priority 仅在缺失时补齐
        const cardRef = block.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
        if (cardRef) {
          const hasPriority = cardRef.data?.some(data => data.name === "priority") ?? false
          const refData: Array<{ name: string; value: any }> = [{ name: "type", value: "topic" }]
          if (!hasPriority) {
            refData.push({ name: "priority", value: [priority] })
          }
          await orca.commands.invokeEditorCommand("core.editor.setRefData", null, cardRef, refData)
        }
      }

      // 写入 ir.* 状态（与 incrementalReadingStorage.ts 一致）
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [blockId],
        [
          { name: "ir.priority", value: numericPriority, type: 3 },
          { name: "ir.lastRead", value: null, type: 5 },
          { name: "ir.readCount", value: 0, type: 3 },
          { name: "ir.due", value: due, type: 5 }
        ]
      )
      invalidateIrBlockCache(blockId)

      success.push(blockId)
    } catch (error) {
      console.error("[BookIR] 初始化章节失败:", blockId, error)
      failed.push(blockId)
    }
  }

  return { success, failed }
}
