/**
 * AI 快捷交互：把常见 Markdown 转成 Orca ContentFragment / 多块结构
 *
 * 插入形态：
 *   AI · **提示名**          ← 父块（挂在选中块下）
 *     段落 / 列表项…         ← 缩进子块（不再手写 "• "，避免与大纲圆点叠双重）
 *
 * 支持：
 * - 行级：空行分段、`-`/`*`/`+`/`1.` 列表项、# 标题
 * - 行内：`**bold**` / `__bold__`、`*italic*` / `_italic_`、`` `code` ``
 *
 * Web-search 脚注：`1(https://…)` / `[1](url)` 在 Orca 中会被当成块引用
 * （常见误链到 id=1 Reminder、id=3 AI Prompt 等），插入前需净化。
 */

import type { ContentFragment } from "../../orca.d.ts"

/**
 * 净化 AI 正文中易被 Orca 误解析为块引用的 web 脚注写法。
 *
 * 真机证据（repo 6emicuv1sv76k / block 4457）：
 * `…872.00）1(https://www.jinjia.com.cn/…)` → links:[1]（Reminder 标签页）
 */
export function sanitizeAiTextForOrcaInsert(text: string): string {
  if (!text) return text
  let s = text

  // [[123]] 纯数字 wiki → 全角括号，避免块引用
  s = s.replace(/\[\[(\d+)\]\]/g, "〔$1〕")

  // [1](https://…) → [源1](https://…)  （链接文案不能是纯数字块 id）
  s = s.replace(
    /\[(\d+)\]\((https?:\/\/[^)\s]+)\)/gi,
    "[源$1]($2)"
  )

  // 1(https://…) → [源1](https://…)
  // 不匹配已是 markdown 链接目标里的内容；要求数字前不是 ] 或单词字符
  s = s.replace(
    /(^|[^\]A-Za-z0-9_])(\d+)\((https?:\/\/[^)\s]+)\)/gi,
    "$1[源$2]($3)"
  )

  return s
}

export type MdStructuralBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list_item"; text: string }
  | { kind: "heading"; text: string; level: number }

export type QuickResultInsertPlan = {
  /** 标题块：AI · {label}，label 为粗体 */
  title: ContentFragment[]
  /** 挂在标题下的子块内容（顺序从上到下） */
  children: ContentFragment[][]
  /** 供 batchInsertText 使用的 Markdown 正文（保留列表标记） */
  bodyMarkdown: string
}

function pushPlain(fragments: ContentFragment[], text: string): void {
  if (!text) return
  fragments.push({ t: "t", v: text })
}

function pushFormatted(
  fragments: ContentFragment[],
  text: string,
  format?: string
): void {
  if (!text) return
  if (format) {
    fragments.push({ t: "t", v: text, f: format })
  } else {
    fragments.push({ t: "t", v: text })
  }
}

/**
 * 将一行内联 Markdown 解析为 ContentFragment[]。
 * 优先匹配 ** / __，再 * / _，再 `code`。
 */
export function parseInlineMarkdownToFragments(text: string): ContentFragment[] {
  const source = text ?? ""
  if (!source) return [{ t: "t", v: "" }]

  const fragments: ContentFragment[] = []
  let i = 0

  while (i < source.length) {
    if (source.startsWith("**", i)) {
      const end = source.indexOf("**", i + 2)
      if (end > i + 2) {
        pushFormatted(fragments, source.slice(i + 2, end), "b")
        i = end + 2
        continue
      }
    }

    if (source.startsWith("__", i)) {
      const end = source.indexOf("__", i + 2)
      if (end > i + 2) {
        pushFormatted(fragments, source.slice(i + 2, end), "b")
        i = end + 2
        continue
      }
    }

    if (source[i] === "`") {
      const end = source.indexOf("`", i + 1)
      if (end > i + 1) {
        pushPlain(fragments, source.slice(i + 1, end))
        i = end + 1
        continue
      }
    }

    if (source[i] === "*" && source[i + 1] !== "*") {
      const end = source.indexOf("*", i + 1)
      if (end > i + 1 && source[end + 1] !== "*") {
        pushFormatted(fragments, source.slice(i + 1, end), "i")
        i = end + 1
        continue
      }
    }

    if (source[i] === "_" && source[i + 1] !== "_") {
      const end = source.indexOf("_", i + 1)
      if (end > i + 1 && source[end + 1] !== "_") {
        pushFormatted(fragments, source.slice(i + 1, end), "i")
        i = end + 1
        continue
      }
    }

    let j = i + 1
    while (j < source.length) {
      const ch = source[j]
      if (ch === "*" || ch === "_" || ch === "`") break
      j++
    }
    pushPlain(fragments, source.slice(i, j))
    i = j
  }

  if (fragments.length === 0) return [{ t: "t", v: "" }]
  return fragments
}

const LIST_RE = /^([-*+]|\d+\.)\s+(.+)$/
const HEADING_RE = /^(#{1,6})\s+(.+)$/

/**
 * 把 Markdown 正文拆成结构块：段落 / 列表项 / 标题。
 * 连续非列表行合并为一段（空格连接）。
 */
export function splitMarkdownIntoStructuralBlocks(md: string): MdStructuralBlock[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n")
  const result: MdStructuralBlock[] = []
  let paraBuf: string[] = []

  const flushPara = () => {
    if (paraBuf.length === 0) return
    const text = paraBuf.join(" ").replace(/\s+/g, " ").trim()
    paraBuf = []
    if (text) result.push({ kind: "paragraph", text })
  }

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) {
      flushPara()
      continue
    }

    const listMatch = trimmed.match(LIST_RE)
    if (listMatch) {
      flushPara()
      const itemText = listMatch[2].trim()
      if (itemText) result.push({ kind: "list_item", text: itemText })
      continue
    }

    const headMatch = trimmed.match(HEADING_RE)
    if (headMatch) {
      flushPara()
      const level = headMatch[1].length
      const text = headMatch[2].trim()
      if (text) result.push({ kind: "heading", text, level })
      continue
    }

    paraBuf.push(trimmed)
  }
  flushPara()
  return result
}

/**
 * 结构块 → 一块的 ContentFragment[]。
 * 列表项不再加 "• "（大纲块本身已有圆点，避免双重黑点）。
 */
export function structuralBlockToFragments(
  block: MdStructuralBlock
): ContentFragment[] {
  if (block.kind === "heading") {
    return parseInlineMarkdownToFragments(block.text).map((frag) => {
      if (frag.t === "t" && !frag.f) return { ...frag, f: "b" }
      return frag
    })
  }

  return parseInlineMarkdownToFragments(block.text)
}

/**
 * 生成插入计划：标题块 + 缩进子块。
 */
export function buildQuickResultInsertPlan(
  promptLabel: string,
  resultMarkdown: string,
  selectedText?: string
): QuickResultInsertPlan {
  const titleLabel =
    promptLabel.trim().length > 0 ? promptLabel.trim() : "快捷交互"
  const title: ContentFragment[] = [
    { t: "t", v: "AI · " },
    { t: "t", v: titleLabel, f: "b" }
  ]
  if (selectedText?.trim()) {
    const text = selectedText.trim()
    const clipped = text.length > 30 ? `${text.slice(0, 30)}…` : text
    title.push({ t: "t", v: " · " }, { t: "t", v: clipped, f: "i" })
  }

  const bodyMarkdown = sanitizeAiTextForOrcaInsert(
    (resultMarkdown ?? "").trim()
  )
  const bodyBlocks = splitMarkdownIntoStructuralBlocks(bodyMarkdown)
  const children = bodyBlocks.map(structuralBlockToFragments)

  return { title, children, bodyMarkdown }
}

/** @deprecated 使用 buildQuickResultInsertPlan */
export function buildQuickResultBlockContents(
  promptLabel: string,
  resultMarkdown: string
): ContentFragment[][] {
  const plan = buildQuickResultInsertPlan(promptLabel, resultMarkdown)
  return [plan.title, ...plan.children]
}
