/**
 * 块解释：把文本写成目标块的普通子块（可撤销）；已存在相同正文则跳过。
 */

import type { Block } from "../../orca.d.ts"
import { resolveBlockBackendFirst } from "./aiCardWriter"

export function normalizeChildText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function formatTermChildText(term: string, gloss: string): string {
  return `${term.trim()} — ${gloss.trim()}`
}

async function loadDirectChildTexts(parentBlockId: number): Promise<string[]> {
  const parent = await resolveBlockBackendFirst(parentBlockId)
  if (!parent?.children?.length) return []

  const ids = parent.children.filter((id): id is number => typeof id === "number")
  if (ids.length === 0) return []

  let blocks: Block[] = []
  try {
    const result = (await orca.invokeBackend("get-blocks", ids)) as
      | Block[]
      | null
      | undefined
    if (Array.isArray(result)) {
      blocks = result.filter(Boolean)
    }
  } catch (error) {
    console.error("[IR BlockExplain] get-blocks 子块失败:", error)
    // fallback: state
    blocks = ids
      .map((id) => orca.state.blocks[id] as Block | undefined)
      .filter((b): b is Block => Boolean(b))
  }

  return blocks
    .map((b) => (typeof b.text === "string" ? b.text : ""))
    .filter((t) => t.trim().length > 0)
}

export type AppendPlainChildResult =
  | { success: true; alreadyExisted: true; blockId: null }
  | { success: true; alreadyExisted: false; blockId: number }
  | { success: false; error: string }

/**
 * 在 parent 下 lastChild 插入纯文本子块。
 * 若任一直接子块正文规范化后与目标相同 → alreadyExisted，不写入。
 */
export async function appendPlainChildIfNew(
  parentBlockId: number,
  text: string
): Promise<AppendPlainChildResult> {
  const body = text.trim()
  const normalized = normalizeChildText(body)
  if (!normalized) {
    return { success: false, error: "写入内容为空" }
  }

  try {
    const existing = await loadDirectChildTexts(parentBlockId)
    if (existing.some((t) => normalizeChildText(t) === normalized)) {
      return { success: true, alreadyExisted: true, blockId: null }
    }

    const parent = await resolveBlockBackendFirst(parentBlockId)
    if (!parent) {
      return { success: false, error: "找不到目标块，无法写入" }
    }

    let createdId: number | null = null
    await orca.commands.invokeGroup(
      async () => {
        const id = (await orca.commands.invokeEditorCommand(
          "core.editor.insertBlock",
          null,
          parent,
          "lastChild",
          [{ t: "t", v: body }]
        )) as number | null
        if (id == null || !Number.isFinite(id)) {
          throw new Error("insertBlock 未返回有效块 ID")
        }
        createdId = id
      },
      { undoable: true, topGroup: true }
    )

    if (createdId == null) {
      return { success: false, error: "创建子块失败" }
    }
    return { success: true, alreadyExisted: false, blockId: createdId }
  } catch (error) {
    console.error("[IR BlockExplain] 写入子块失败:", error)
    const message = error instanceof Error ? error.message : "写入子块失败"
    return { success: false, error: message }
  }
}
