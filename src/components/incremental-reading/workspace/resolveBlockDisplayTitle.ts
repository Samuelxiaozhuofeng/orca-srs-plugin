/**
 * 解析块的展示标题：页面 alias 优先于 Block.text。
 *
 * Orca 页面改名后，页面根块的 text 可能仍保留旧编号/大纲号，
 * 而当前页面名写在 aliases 中；资料库标题应优先用 alias。
 */

export type BlockTitleSource = {
  aliases?: readonly string[] | null
  text?: string | null
} | null | undefined

/**
 * @param block 含 aliases / text 的块或块状对象
 * @param fallback 都无有效值时的兜底（默认「(无标题)」）
 */
export function resolveBlockDisplayTitle(
  block: BlockTitleSource,
  fallback = "(无标题)"
): string {
  const aliases = block?.aliases
  if (Array.isArray(aliases)) {
    for (const alias of aliases) {
      if (typeof alias !== "string") continue
      const trimmed = alias.trim()
      if (trimmed) return trimmed
    }
  }

  if (typeof block?.text === "string") {
    const trimmed = block.text.trim()
    if (trimmed) return trimmed
  }

  return fallback
}
