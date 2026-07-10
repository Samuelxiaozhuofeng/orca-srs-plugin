/**
 * 富文本 / 跨 fragment / 跨相邻块 Extract 支持
 */

import type { ContentFragment, CursorData, DbId } from "../../orca.d.ts"

export type ExtractSelectionPlan =
  | { mode: "single_fragment"; blockId: DbId; fragmentIndex: number; start: number; end: number }
  | { mode: "cross_fragment"; blockId: DbId; startIndex: number; endIndex: number; startOffset: number; endOffset: number }
  | {
      mode: "cross_block"
      isForward: boolean
      startBlockId: DbId
      endBlockId: DbId
      startIndex: number
      startOffset: number
      endIndex: number
      endOffset: number
    }

export type CrossBlockSegment = {
  blockId: DbId
  content: ContentFragment[]
  /** fragment 起始（含） */
  startIndex: number
  startOffset: number
  /** fragment 结束（含） */
  endIndex: number
  endOffset: number
}

export function planExtractSelection(cursor: CursorData): ExtractSelectionPlan | null {
  if (!cursor?.anchor?.blockId || !cursor?.focus?.blockId) return null

  if (cursor.anchor.blockId !== cursor.focus.blockId) {
    // 以 isForward 为准；若缺失则用 id 近似
    const forward = typeof cursor.isForward === "boolean"
      ? cursor.isForward
      : cursor.anchor.blockId <= cursor.focus.blockId

    const start = forward ? cursor.anchor : cursor.focus
    const end = forward ? cursor.focus : cursor.anchor
    return {
      mode: "cross_block",
      isForward: forward,
      startBlockId: start.blockId,
      endBlockId: end.blockId,
      startIndex: start.index,
      startOffset: start.offset,
      endIndex: end.index,
      endOffset: end.offset
    }
  }

  if (cursor.anchor.index === cursor.focus.index) {
    const start = Math.min(cursor.anchor.offset, cursor.focus.offset)
    const end = Math.max(cursor.anchor.offset, cursor.focus.offset)
    if (start === end) return null
    return {
      mode: "single_fragment",
      blockId: cursor.anchor.blockId,
      fragmentIndex: cursor.anchor.index,
      start,
      end
    }
  }

  const startIndex = Math.min(cursor.anchor.index, cursor.focus.index)
  const endIndex = Math.max(cursor.anchor.index, cursor.focus.index)
  const startOffset = cursor.anchor.index <= cursor.focus.index
    ? cursor.anchor.offset
    : cursor.focus.offset
  const endOffset = cursor.anchor.index <= cursor.focus.index
    ? cursor.focus.offset
    : cursor.anchor.offset

  return {
    mode: "cross_fragment",
    blockId: cursor.anchor.blockId,
    startIndex,
    endIndex,
    startOffset,
    endOffset
  }
}

export function extractTextFromFragments(
  content: ContentFragment[],
  plan: ExtractSelectionPlan
): string {
  if (plan.mode === "single_fragment") {
    const frag = content[plan.fragmentIndex]
    if (!frag?.v) return ""
    return String(frag.v).substring(plan.start, plan.end)
  }

  if (plan.mode === "cross_fragment") {
    const parts: string[] = []
    for (let i = plan.startIndex; i <= plan.endIndex; i++) {
      const frag = content[i]
      if (!frag?.v) continue
      const text = String(frag.v)
      if (i === plan.startIndex && i === plan.endIndex) {
        parts.push(text.substring(plan.startOffset, plan.endOffset))
      } else if (i === plan.startIndex) {
        parts.push(text.substring(plan.startOffset))
      } else if (i === plan.endIndex) {
        parts.push(text.substring(0, plan.endOffset))
      } else {
        parts.push(text)
      }
    }
    return parts.join("")
  }

  return ""
}

/**
 * 从有序兄弟块链中切出跨块选区文本。
 * - 首块：从 startIndex/offset 到内容末尾
 * - 中间块：全文
 * - 末块：从内容开头到 endIndex/offset
 */
export function extractTextFromCrossBlockSegments(segments: CrossBlockSegment[]): string {
  if (segments.length === 0) return ""
  const parts: string[] = []
  for (const seg of segments) {
    const plan: ExtractSelectionPlan = {
      mode: "cross_fragment",
      blockId: seg.blockId,
      startIndex: seg.startIndex,
      endIndex: seg.endIndex,
      startOffset: seg.startOffset,
      endOffset: seg.endOffset
    }
    // 单 fragment 优化
    if (seg.startIndex === seg.endIndex) {
      const single: ExtractSelectionPlan = {
        mode: "single_fragment",
        blockId: seg.blockId,
        fragmentIndex: seg.startIndex,
        start: seg.startOffset,
        end: seg.endOffset
      }
      parts.push(extractTextFromFragments(seg.content, single))
    } else {
      parts.push(extractTextFromFragments(seg.content, plan))
    }
  }
  return parts.filter(Boolean).join("\n")
}

/**
 * 根据父子 children 顺序，解析跨块选区涉及的块 ID 列表（含中间块）
 */
export function resolveSiblingBlockChain(
  startBlockId: DbId,
  endBlockId: DbId,
  siblingIds: DbId[]
): DbId[] | null {
  const i0 = siblingIds.indexOf(startBlockId)
  const i1 = siblingIds.indexOf(endBlockId)
  if (i0 < 0 || i1 < 0) return null
  const from = Math.min(i0, i1)
  const to = Math.max(i0, i1)
  return siblingIds.slice(from, to + 1)
}

export function buildCrossBlockSegments(
  plan: ExtractSelectionPlan & { mode: "cross_block" },
  chain: Array<{ id: DbId; content: ContentFragment[] }>
): CrossBlockSegment[] {
  if (chain.length === 0) return []
  return chain.map((block, index) => {
    const content = block.content ?? []
    const lastIndex = Math.max(0, content.length - 1)
    const lastFrag = content[lastIndex]
    const lastOffset = lastFrag?.v ? String(lastFrag.v).length : 0

    if (chain.length === 1) {
      return {
        blockId: block.id,
        content,
        startIndex: plan.startIndex,
        startOffset: plan.startOffset,
        endIndex: plan.endIndex,
        endOffset: plan.endOffset
      }
    }
    if (index === 0) {
      return {
        blockId: block.id,
        content,
        startIndex: plan.startIndex,
        startOffset: plan.startOffset,
        endIndex: lastIndex,
        endOffset: lastOffset
      }
    }
    if (index === chain.length - 1) {
      return {
        blockId: block.id,
        content,
        startIndex: 0,
        startOffset: 0,
        endIndex: plan.endIndex,
        endOffset: plan.endOffset
      }
    }
    return {
      blockId: block.id,
      content,
      startIndex: 0,
      startOffset: 0,
      endIndex: lastIndex,
      endOffset: lastOffset
    }
  })
}

export function collectInlineAssets(content: ContentFragment[]): {
  imageCount: number
  linkCount: number
  highlightCount: number
} {
  let imageCount = 0
  let linkCount = 0
  let highlightCount = 0
  for (const frag of content) {
    const t = (frag as any)?.t
    if (t === "i" || t === "img" || t === "image") imageCount += 1
    if (t === "a" || t === "link") linkCount += 1
    if (t === "h" || (frag as any)?.f?.includes?.("highlight")) highlightCount += 1
  }
  return { imageCount, linkCount, highlightCount }
}

export function planRemoveReadRange(
  contentLength: number,
  startIndex: number,
  endIndex: number
): { keepBefore: number; keepAfter: number } {
  return {
    keepBefore: Math.max(0, startIndex),
    keepAfter: Math.max(0, contentLength - endIndex - 1)
  }
}
