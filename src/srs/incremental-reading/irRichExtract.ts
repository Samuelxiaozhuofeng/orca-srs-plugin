/**
 * 富文本 / 跨 fragment / 跨相邻块 Extract 支持
 */

import type { Block, ContentFragment, CursorData, DbId } from "../../orca.d.ts"

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

/**
 * 前序连续区间解析：同一棵树内任意两块的 DFS 前序连续片段。
 *
 * 兄弟链是退化情形（与 `resolveSiblingBlockChain` 的闭区间一致）；
 * 祖先↔后代（如父块 P + 子块 1/2/3）与跨分支也统一覆盖。
 * 只读 `getBlock`（调用方传入 `orca.state.blocks` 读取，不发起后端调用）；
 * 链长度有上界，超限置 `truncatedByStructure` 而非失败。
 */
export const PREORDER_CHAIN_MAX_BLOCKS = 200

export function isAncestorOf(
  ancestorId: DbId,
  descendantId: DbId,
  getBlock: (id: DbId | number) => Block | undefined
): boolean {
  if (Number(ancestorId) === Number(descendantId)) return true
  const seen = new Set<number>()
  let cursor = Number(descendantId)
  while (Number.isFinite(cursor)) {
    if (seen.has(cursor)) return false
    seen.add(cursor)
    if (cursor === Number(ancestorId)) return true
    const block = getBlock(cursor)
    if (!block || block.parent == null) return false
    cursor = Number(block.parent)
  }
  return false
}

export type PreOrderChainResult =
  | { ok: true; chain: DbId[]; truncatedByStructure: boolean }
  | { ok: false; reason: "blocks_missing" | "non_sibling" }

/** 路径上任意块缺失 → 失败；不同根 / 孤立块 / 无法连通 → non_sibling。 */
function buildPathToRoot(
  id: DbId,
  getBlock: (id: DbId | number) => Block | undefined
): { ok: true; path: number[] } | { ok: false } {
  const path: number[] = []
  const seen = new Set<number>()
  let cursor = Number(id)
  while (Number.isFinite(cursor)) {
    if (seen.has(cursor)) return { ok: false }
    seen.add(cursor)
    path.push(cursor)
    const block = getBlock(cursor)
    if (!block) return { ok: false }
    if (block.parent == null) break
    cursor = Number(block.parent)
  }
  return { ok: true, path }
}

function findLca(pathA: number[], pathB: number[]): number | null {
  let i = pathA.length - 1
  let j = pathB.length - 1
  let lca: number | null = null
  while (i >= 0 && j >= 0 && pathA[i] === pathB[j]) {
    lca = pathA[i]
    i -= 1
    j -= 1
  }
  return lca
}

/** ancestor 指向 descendant 路径上的那个 ancestor 的直接子块；路径不连通或块缺失 → null。 */
function childOfAncestorOnPath(
  ancestorId: number,
  descendantId: number,
  getBlock: (id: DbId | number) => Block | undefined
): number | null {
  if (ancestorId === descendantId) return null
  const seen = new Set<number>()
  let cursor = Number(descendantId)
  let childOnPath = cursor
  while (Number.isFinite(cursor)) {
    if (seen.has(cursor)) return null
    seen.add(cursor)
    const block = getBlock(cursor)
    if (!block || block.parent == null) return null
    if (Number(block.parent) === ancestorId) return childOnPath
    childOnPath = Number(block.parent)
    cursor = Number(block.parent)
  }
  return null
}

type ChainAccum = {
  list: number[]
  max: number
  truncated: boolean
  visited: Set<number>
}

function chainAppend(acc: ChainAccum, id: number): void {
  if (acc.list.length >= acc.max) {
    acc.truncated = true
    return
  }
  if (acc.visited.has(id)) return
  acc.visited.add(id)
  acc.list.push(id)
}

/** node 整棵子树的前序（含 node）；缺失块 → false（调用方上报 blocks_missing）。 */
function subtreePreOrder(
  nodeId: number,
  getBlock: (id: DbId | number) => Block | undefined,
  acc: ChainAccum
): boolean {
  if (acc.visited.has(nodeId)) return true
  const block = getBlock(nodeId)
  if (!block) return false
  chainAppend(acc, nodeId)
  if (acc.list.length >= acc.max) {
    acc.truncated = true
    return true
  }
  const children = (block.children ?? []) as DbId[]
  for (const childId of children) {
    if (acc.list.length >= acc.max) {
      acc.truncated = true
      return true
    }
    const ok = subtreePreOrder(Number(childId), getBlock, acc)
    if (!ok) return false
  }
  return true
}

/**
 * rootChild 子树内、从 node 到该子树末尾的前序片段。
 * node 须位于 rootChild 子树内（含 node === rootChild，此时为整棵子树）。
 */
function preOrderTail(
  rootChild: number,
  node: number,
  getBlock: (id: DbId | number) => Block | undefined,
  acc: ChainAccum
): boolean {
  if (!subtreePreOrder(node, getBlock, acc)) return false
  if (rootChild === node) return true
  let cursor = node
  let parent = getBlock(cursor)?.parent
  while (parent != null && Number(parent) !== rootChild) {
    const parentBlock = getBlock(parent)
    if (!parentBlock) return false
    const siblings = (parentBlock.children ?? []) as DbId[]
    const idx = siblings.indexOf(cursor)
    if (idx >= 0) {
      for (let i = idx + 1; i < siblings.length; i++) {
        if (acc.list.length >= acc.max) {
          acc.truncated = true
          return true
        }
        const ok = subtreePreOrder(Number(siblings[i]), getBlock, acc)
        if (!ok) return false
      }
    }
    cursor = Number(parent)
    parent = getBlock(cursor)?.parent
  }
  const rootBlock = getBlock(rootChild)
  if (!rootBlock) return false
  const rootSiblings = (rootBlock.children ?? []) as DbId[]
  const rootIdx = rootSiblings.indexOf(cursor)
  if (rootIdx >= 0) {
    for (let i = rootIdx + 1; i < rootSiblings.length; i++) {
      if (acc.list.length >= acc.max) {
        acc.truncated = true
        return true
      }
      const ok = subtreePreOrder(Number(rootSiblings[i]), getBlock, acc)
      if (!ok) return false
    }
  }
  return true
}

/**
 * ancestor → descendant 的前序前缀（含两端）：ancestor 全量、descendant 分支前的兄弟整棵子树、递归进入 descendant 分支。
 */
function preOrderPrefix(
  ancestorId: number,
  descendantId: number,
  getBlock: (id: DbId | number) => Block | undefined,
  acc: ChainAccum
): boolean {
  const block = getBlock(ancestorId)
  if (!block) return false
  chainAppend(acc, ancestorId)
  if (ancestorId === descendantId) return true
  if (acc.list.length >= acc.max) {
    acc.truncated = true
    return true
  }
  const childOnPath = childOfAncestorOnPath(ancestorId, descendantId, getBlock)
  if (childOnPath == null) return false
  const children = (block.children ?? []) as DbId[]
  for (const childId of children) {
    if (acc.list.length >= acc.max) {
      acc.truncated = true
      return true
    }
    const n = Number(childId)
    if (n === childOnPath) {
      return preOrderPrefix(n, descendantId, getBlock, acc)
    }
    const ok = subtreePreOrder(n, getBlock, acc)
    if (!ok) return false
  }
  return false
}

export function resolvePreOrderChain(
  startId: DbId,
  endId: DbId,
  getBlock: (id: DbId | number) => Block | undefined,
  maxBlocks = PREORDER_CHAIN_MAX_BLOCKS
): PreOrderChainResult {
  const s = Number(startId)
  const e = Number(endId)
  if (!Number.isFinite(s) || !Number.isFinite(e)) {
    return { ok: false, reason: "blocks_missing" }
  }
  if (s === e) {
    if (!getBlock(s)) return { ok: false, reason: "blocks_missing" }
    return { ok: true, chain: [s], truncatedByStructure: false }
  }

  const pathStart = buildPathToRoot(s, getBlock)
  if (!pathStart.ok) return { ok: false, reason: "blocks_missing" }
  const pathEnd = buildPathToRoot(e, getBlock)
  if (!pathEnd.ok) return { ok: false, reason: "blocks_missing" }

  const lca = findLca(pathStart.path, pathEnd.path)
  if (lca == null) return { ok: false, reason: "non_sibling" }

  const acc: ChainAccum = {
    list: [],
    max: maxBlocks,
    truncated: false,
    visited: new Set<number>()
  }

  let ok: boolean
  if (lca === s) {
    ok = preOrderPrefix(s, e, getBlock, acc)
  } else if (lca === e) {
    ok = preOrderPrefix(e, s, getBlock, acc)
    if (ok) acc.list.reverse()
  } else {
    const startSide = childOfAncestorOnPath(lca, s, getBlock)
    const endSide = childOfAncestorOnPath(lca, e, getBlock)
    if (startSide == null || endSide == null) {
      return { ok: false, reason: "blocks_missing" }
    }
    const lcaBlock = getBlock(lca)
    if (!lcaBlock) return { ok: false, reason: "blocks_missing" }
    const children = (lcaBlock.children ?? []) as DbId[]
    const iStart = children.indexOf(startSide)
    const iEnd = children.indexOf(endSide)
    if (iStart < 0 || iEnd < 0) return { ok: false, reason: "non_sibling" }

    if (iStart < iEnd) {
      ok = preOrderTail(children[iStart], s, getBlock, acc)
      for (let i = iStart + 1; i < iEnd && ok; i++) {
        ok = subtreePreOrder(Number(children[i]), getBlock, acc)
      }
      if (ok) ok = preOrderPrefix(Number(children[iEnd]), e, getBlock, acc)
    } else {
      ok = preOrderTail(children[iEnd], e, getBlock, acc)
      for (let i = iEnd + 1; i < iStart && ok; i++) {
        ok = subtreePreOrder(Number(children[i]), getBlock, acc)
      }
      if (ok) ok = preOrderPrefix(Number(children[iStart]), s, getBlock, acc)
      if (ok) acc.list.reverse()
    }
  }

  if (!ok) return { ok: false, reason: "blocks_missing" }
  return { ok: true, chain: acc.list, truncatedByStructure: acc.truncated }
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
