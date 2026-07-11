/**
 * Import HTML as nested Orca heading/content outline.
 *
 * Heading ownership rules (stable, level-based stack):
 * - The chapter/page root is virtual level 0.
 * - An hN heading becomes a child of the nearest open heading with level < N
 *   (or the root). Equal or deeper open headings are closed first.
 * - Content after a heading belongs to that heading until a same-or-higher
 *   level heading appears.
 * - Level jumps (e.g. h1 → h3) attach to the nearest strictly shallower
 *   ancestor; missing intermediate levels are not synthesized.
 *
 * Page-title dedupe of a leading h1 is handled by getChapterContent before
 * this importer runs; remaining h2/h3 nesting still follows the same rules.
 */

import type { Block, DbId } from "../../orca.d.ts"
import {
  parseHtmlOutlineTokens,
  stripBlankHtml,
  type HtmlOutlineToken
} from "./htmlOutline"

interface HeadingStackItem {
  level: number
  blockId: DbId
}

export async function importHtmlAsOutline(
  parentBlockId: DbId,
  html: string
): Promise<void> {
  if (!html.trim()) {
    return
  }

  const tokens = parseHtmlOutlineTokens(html)
  if (tokens.length === 0) {
    return
  }

  await insertOutlineTokens(parentBlockId, tokens)
}

async function insertOutlineTokens(
  parentBlockId: DbId,
  tokens: HtmlOutlineToken[]
): Promise<void> {
  const stack: HeadingStackItem[] = [{ level: 0, blockId: parentBlockId }]

  for (const token of tokens) {
    if (token.kind === "heading") {
      const parent = findHeadingParent(stack, token.level)
      const headingBlockId = await insertHeadingBlock(parent.blockId, token)
      stack.push({ level: token.level, blockId: headingBlockId })
      continue
    }

    const currentParent = stack[stack.length - 1]
    await insertHtmlContent(currentParent.blockId, token.html)
  }
}

/**
 * Pop headings until the top is strictly shallower than `level`.
 * Mutates `stack` in place — intentional for sequential outline walks.
 */
export function findHeadingParent(
  stack: HeadingStackItem[],
  level: number
): HeadingStackItem {
  while (stack.length > 1 && stack[stack.length - 1].level >= level) {
    stack.pop()
  }

  return stack[stack.length - 1]
}

async function insertHeadingBlock(
  parentBlockId: DbId,
  heading: Extract<HtmlOutlineToken, { kind: "heading" }>
): Promise<DbId> {
  return await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    getRequiredBlock(parentBlockId),
    "lastChild",
    [{ t: "t", v: heading.text }],
    { type: "heading", level: heading.level }
  )
}

async function insertHtmlContent(parentBlockId: DbId, html: string): Promise<void> {
  const cleanedHtml = stripBlankHtml(html)
  if (!cleanedHtml) {
    return
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.batchInsertHTML",
    null,
    getRequiredBlock(parentBlockId),
    "lastChild",
    cleanedHtml
  )
}

function getRequiredBlock(blockId: DbId): Block {
  const block = orca.state.blocks[blockId]
  if (!block) {
    throw new Error(`Block not found: ${blockId}`)
  }

  return block
}
