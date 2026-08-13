/**
 * 快捷制卡去重线索收集（纯只读、有界）。
 *
 * 快捷制卡每次都是「选中文字 → 直接生成」，对同一段文字反复点命令会一遍遍
 * 产出高度重复的卡。弹窗路径在「再生成一批」时会用 `excludeSummaries` 做跨批
 * 去重，快捷路径此前漏了——本模块补齐：生成前扫描源块子树里**已有的**
 * basic / cloze / choice 卡片，抽出题干 / 挖空目标作为排除线索，喂给
 * `generateFlashcardDrafts` 的 `excludeSummaries`，让模型只出覆盖新内容的卡。
 *
 * 与 `convertBlockToReviewCards` 不同，这里刻意**不做任何 SRS 状态写入**
 * （不调 `ensureClozeSrsState` 等），也不走 backend get-block——只读
 * `orca.state.blocks`，且深度 / 块数 / 摘要数都有硬上限，避免在长文子树下
 * 触发无界遍历。
 */

import type { Block, ContentFragment, DbId } from "../../orca.d.ts"
import { isCardTag } from "../tagUtils"
import { extractCardType } from "../deckUtils"

/** 扫描的最大块数（跨整个子树累计）。 */
export const EXISTING_CARD_DEDUPE_MAX_BLOCKS = 200
/** 扫描的最大深度（根 = 0）。卡片是源块的直接子块，少数情况藏在包装块下一层。 */
export const EXISTING_CARD_DEDUPE_MAX_DEPTH = 4
/** 最多产出的排除线索数；与 aiService 的 `.slice(0, 30)` 对齐并留出余量。 */
export const EXISTING_CARD_DEDUPE_MAX_SUMMARIES = 30

export interface ExistingCardDedupeOptions {
  maxBlocks?: number
  maxDepth?: number
  maxSummaries?: number
}

function plainTextOf(block: Block): string {
  if (typeof block.text === "string" && block.text.trim()) return block.text
  const content = (block.content ?? []) as ContentFragment[]
  return content
    .map((f) => (typeof f?.v === "string" ? f.v : ""))
    .join("")
}

/** 宽松匹配 cloze fragment（与 clozeUtils.isClozeFragment 同规则，本地内联避免重依赖）。 */
function isClozeFragmentLike(
  fragment: ContentFragment,
  pluginName: string
): boolean {
  return (
    fragment.t === `${pluginName}.cloze` ||
    (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
  )
}

/** 取块内第一个挖空目标词（无则空串）。 */
function firstClozeTarget(block: Block, pluginName: string): string {
  const content = (block.content ?? []) as ContentFragment[]
  for (const fragment of content) {
    if (!fragment) continue
    if (
      isClozeFragmentLike(fragment, pluginName) &&
      typeof fragment.v === "string" &&
      fragment.v.trim()
    ) {
      return fragment.v.trim()
    }
  }
  return ""
}

/**
 * 与 `draftExclusionSummary`（aiDialogState）对齐：
 * basic / choice 用题干，cloze 用「挖空目标 + 上下文首段」。
 */
function summaryForCard(
  block: Block,
  cardType: "basic" | "cloze" | "choice",
  pluginName: string
): string {
  const text = plainTextOf(block).trim()
  if (!text) return ""
  if (cardType === "cloze") {
    const target = firstClozeTarget(block, pluginName)
    return target ? `${target}（出自：${text.slice(0, 60)}）` : text.slice(0, 200)
  }
  return text.slice(0, 200)
}

function isCardBlock(block: Block): boolean {
  return (
    block.refs?.some(
      (ref) => ref?.type === 2 && isCardTag(ref?.alias)
    ) ?? false
  )
}

/**
 * 收集源块子树里已有 basic / cloze / choice 卡片的去重摘要。
 *
 * 只读 `orca.state.blocks`；深度、块数、摘要数均有界。卡片块本身不进其子块
 * （答案 / 选项子块不是独立卡片）。其它卡型（direction / list / excerpt /
 * topic / extracts / image-occlusion）不会与 AI 生成重复，直接跳过。
 */
export function collectExistingCardExclusionSummaries(
  sourceBlockId: number,
  pluginName: string,
  options: ExistingCardDedupeOptions = {}
): string[] {
  const maxBlocks =
    options.maxBlocks ?? EXISTING_CARD_DEDUPE_MAX_BLOCKS
  const maxDepth = options.maxDepth ?? EXISTING_CARD_DEDUPE_MAX_DEPTH
  const maxSummaries =
    options.maxSummaries ?? EXISTING_CARD_DEDUPE_MAX_SUMMARIES

  const summaries: string[] = []
  const seen = new Set<string>()
  const visited = new Set<number>()
  let blocksUsed = 0

  const walk = (id: number, depth: number): void => {
    if (
      blocksUsed >= maxBlocks ||
      depth > maxDepth ||
      summaries.length >= maxSummaries
    ) {
      return
    }
    const n = Number(id)
    if (!Number.isFinite(n) || visited.has(n)) return
    visited.add(n)

    const block = orca.state.blocks?.[n] as Block | undefined
    if (!block) return
    blocksUsed += 1

    if (isCardBlock(block)) {
      const cardType = extractCardType(block)
      if (
        cardType === "basic" ||
        cardType === "cloze" ||
        cardType === "choice"
      ) {
        const summary = summaryForCard(block, cardType, pluginName)
        const key = summary.replace(/\s+/g, " ").trim().toLowerCase()
        if (summary && !seen.has(key)) {
          seen.add(key)
          summaries.push(summary)
        }
      }
      // 卡片块不下钻
      return
    }

    for (const childId of (block.children ?? []) as DbId[]) {
      walk(Number(childId), depth + 1)
    }
  }

  walk(sourceBlockId, 0)
  return summaries
}
