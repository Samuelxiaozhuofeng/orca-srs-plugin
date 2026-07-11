/**
 * 书籍渐进阅读（Book IR）兼容门面
 *
 * 新逻辑位于 `src/srs/book-ir/*`。本文件保留：
 * - 章节引用发现（遗留 UI / 右键菜单）
 * - 分散到期计算
 * - setupBookIR → initializeBookIR(distributed) 薄封装
 */

import type { Block, DbId } from "../orca.d.ts"
import { initializeBookIR } from "./book-ir/bookIRService"

const MS_PER_DAY = 24 * 60 * 60 * 1000

function getTodayMidnight(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
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

  collectInlineRefs(bookBlock)

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

  collectInlineRefs(bookBlock)

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

type SetupBookIROptions = {
  pluginName?: string
  sourceBookId?: DbId | null
  sourceBookTitle?: string | null
  /** 新路径：distributed | sequential，默认 distributed */
  mode?: "distributed" | "sequential"
}

/**
 * 批量为章节块初始化渐进阅读（兼容门面 → bookIRService）。
 */
export async function setupBookIR(
  chapterIds: DbId[],
  priority: number,
  totalDays: number,
  options: SetupBookIROptions = {}
): Promise<{ success: DbId[]; failed: DbId[] }> {
  if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
    return { success: [], failed: [] }
  }

  const sourceBookId = typeof options.sourceBookId === "number" ? options.sourceBookId : null
  const sourceBookTitle = typeof options.sourceBookTitle === "string"
    ? (options.sourceBookTitle.trim() || null)
    : null
  const pluginName = options.pluginName || "orca-srs"
  const mode = options.mode ?? "distributed"

  // 无稳定 book id 时仍走 distributed 初始化但不写 plan（兼容旧右键入口）
  if (sourceBookId == null) {
    const { initializeChapterAsTopicIR } = await import("./book-ir/bookIRChapterInit")
    const dueDates = calculateChapterDueDates(chapterIds.length, totalDays)
    const success: DbId[] = []
    const failed: DbId[] = []
    const positionBase = Date.now()
    for (let i = 0; i < chapterIds.length; i++) {
      try {
        await initializeChapterAsTopicIR(chapterIds[i], {
          pluginName,
          sourceBookId: null,
          sourceBookTitle,
          priority,
          due: dueDates[i] ?? new Date(),
          position: positionBase + i,
          batchId: `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          batchCreatedAt: new Date()
        })
        success.push(chapterIds[i])
      } catch (error) {
        console.error("[BookIR] 初始化章节失败:", chapterIds[i], error)
        failed.push(chapterIds[i])
      }
    }
    return { success, failed }
  }

  const result = await initializeBookIR({
    bookBlockId: sourceBookId,
    bookTitle: sourceBookTitle ?? "",
    chapterIds,
    mode,
    priority,
    totalDays,
    pluginName
  })

  return {
    success: result.success,
    failed: result.failed.map((f) => f.chapterId)
  }
}
