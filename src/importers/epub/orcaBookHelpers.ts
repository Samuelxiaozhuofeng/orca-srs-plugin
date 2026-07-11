/**
 * Orca page helpers for EPUB book/chapter creation (plain notes only).
 */

import type { Block, DbId } from "../../orca.d.ts"
import { importHtmlAsOutline } from "./orcaOutlineImporter"

export async function createBookPage(bookTitle: string): Promise<DbId> {
  const newBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: bookTitle }],
    { type: "heading", level: 1 }
  )

  await orca.commands.invokeEditorCommand(
    "core.editor.createAlias",
    null,
    bookTitle,
    newBlockId,
    true
  )

  return newBlockId
}

export async function createChapterPage(
  chapterTitle: string,
  chapterHtml: string,
  options: { useOutlineImport?: boolean } = {}
): Promise<DbId> {
  const { useOutlineImport = true } = options

  const chapterBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: chapterTitle }],
    { type: "heading", level: 1 }
  )

  await orca.commands.invokeEditorCommand(
    "core.editor.createAlias",
    null,
    chapterTitle,
    chapterBlockId,
    true
  )

  if (chapterHtml.trim()) {
    const chapterBlock = orca.state.blocks[chapterBlockId]
    if (!chapterBlock) {
      throw new Error(`Chapter block not found: ${chapterBlockId}`)
    }

    if (useOutlineImport) {
      await importHtmlAsOutline(chapterBlockId, chapterHtml)
    } else {
      await orca.commands.invokeEditorCommand(
        "core.editor.batchInsertHTML",
        null,
        chapterBlock,
        "lastChild",
        chapterHtml
      )
    }
  }

  return chapterBlockId
}

export async function createInlineReference(
  targetBlockId: DbId,
  parentBlockId: DbId,
  displayText: string,
  existingRefBlockId?: DbId
): Promise<DbId> {
  const parentBlock = (
    (orca.state.blocks?.[parentBlockId] as Block | undefined)
    || ((await orca.invokeBackend("get-block", parentBlockId)) as Block | undefined)
  )
  if (!parentBlock) {
    throw new Error(`Parent block not found: ${parentBlockId}`)
  }

  const refBlockId = existingRefBlockId ?? await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    parentBlock,
    "lastChild",
    [{ t: "t", v: "" }]
  )

  if (existingRefBlockId != null) {
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      null,
      [{ id: refBlockId, content: [{ t: "t", v: "" }] }],
      false
    )
  }

  try {
    const refId = await orca.commands.invokeEditorCommand(
      "core.editor.createRef",
      null,
      refBlockId,
      targetBlockId,
      1,
      displayText
    )
    if (typeof refId !== "number") {
      throw new Error(`Failed to create inline reference: ${refBlockId} -> ${targetBlockId}`)
    }
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      null,
      [{ id: refBlockId, content: [{ t: "r", v: refId, a: displayText }] }],
      false
    )
  } catch (error) {
    try {
      await orca.commands.invokeEditorCommand("core.editor.deleteBlocks", null, [refBlockId])
    } catch (cleanupError) {
      console.error("[epub] Failed to clean up catalog placeholder:", cleanupError)
    }
    throw error
  }

  return refBlockId
}

export function navigateToBlock(blockId: DbId): void {
  orca.nav.goTo("block", { blockId })
}
