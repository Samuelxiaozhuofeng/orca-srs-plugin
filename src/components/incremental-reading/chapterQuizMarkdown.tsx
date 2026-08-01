/**
 * Light Markdown for chapter-quiz AI follow-up answers (no extra dependency).
 * Supports: #–####, **bold**, *italic*, `code`, ```fences```, -/* lists, 1. lists
 */

import type { ReactNode } from "react"

const { Fragment } = window.React

function isMdBlockStart(line: string): boolean {
  return (
    /^#{1,4}\s+\S/.test(line) ||
    /^```/.test(line) ||
    /^[-*]\s+\S/.test(line) ||
    /^\d+\.\s+\S/.test(line)
  )
}

function renderMdInline(text: string): ReactNode[] {
  // **bold** | *italic* | `code` — left-to-right, non-overlapping
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g
  const nodes: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index))
    }
    const token = m[0]
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`b${k++}`} className="chapter-quiz__md-strong">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code key={`c${k++}`} className="chapter-quiz__md-code">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`i${k++}`} className="chapter-quiz__md-em">
          {token.slice(1, -1)}
        </em>
      )
    } else {
      nodes.push(token)
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length > 0 ? nodes : [text]
}

/** Render a safe subset of Markdown as React nodes (no HTML injection). */
export function renderLightMarkdown(source: string): ReactNode {
  const text = source.replace(/\r\n/g, "\n")
  if (!text.trim()) return null

  const lines = text.split("\n")
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i] ?? ""

    // fenced code block
    if (/^```/.test(line)) {
      i += 1
      const codeLines: string[] = []
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        codeLines.push(lines[i] ?? "")
        i += 1
      }
      if (i < lines.length) i += 1 // closing ```
      blocks.push(
        <pre key={`pre${key++}`} className="chapter-quiz__md-pre">
          <code className="chapter-quiz__md-code-block">
            {codeLines.join("\n")}
          </code>
        </pre>
      )
      continue
    }

    // heading
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const content = heading[2]!.trim()
      const className = `chapter-quiz__md-h chapter-quiz__md-h${level}`
      const kids = renderMdInline(content)
      if (level === 1) {
        blocks.push(
          <h1 key={`h${key++}`} className={className}>
            {kids}
          </h1>
        )
      } else if (level === 2) {
        blocks.push(
          <h2 key={`h${key++}`} className={className}>
            {kids}
          </h2>
        )
      } else if (level === 3) {
        blocks.push(
          <h3 key={`h${key++}`} className={className}>
            {kids}
          </h3>
        )
      } else {
        blocks.push(
          <h4 key={`h${key++}`} className={className}>
            {kids}
          </h4>
        )
      }
      i += 1
      continue
    }

    // unordered list
    if (/^[-*]\s+\S/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^[-*]\s+\S/.test(lines[i] ?? "")) {
        const itemText = (lines[i] ?? "").replace(/^[-*]\s+/, "")
        items.push(
          <li key={items.length} className="chapter-quiz__md-li">
            {renderMdInline(itemText)}
          </li>
        )
        i += 1
      }
      blocks.push(
        <ul key={`ul${key++}`} className="chapter-quiz__md-ul">
          {items}
        </ul>
      )
      continue
    }

    // ordered list
    if (/^\d+\.\s+\S/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\d+\.\s+\S/.test(lines[i] ?? "")) {
        const itemText = (lines[i] ?? "").replace(/^\d+\.\s+/, "")
        items.push(
          <li key={items.length} className="chapter-quiz__md-li">
            {renderMdInline(itemText)}
          </li>
        )
        i += 1
      }
      blocks.push(
        <ol key={`ol${key++}`} className="chapter-quiz__md-ol">
          {items}
        </ol>
      )
      continue
    }

    // blank line
    if (line.trim() === "") {
      i += 1
      continue
    }

    // paragraph (soft-break with <br /> for mid-paragraph newlines)
    const paraLines: string[] = [line]
    i += 1
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !isMdBlockStart(lines[i] ?? "")
    ) {
      paraLines.push(lines[i] ?? "")
      i += 1
    }
    blocks.push(
      <p key={`p${key++}`} className="chapter-quiz__md-p">
        {paraLines.map((pl, j) => (
          <Fragment key={j}>
            {j > 0 ? <br /> : null}
            {renderMdInline(pl)}
          </Fragment>
        ))}
      </p>
    )
  }

  return <div className="chapter-quiz__md">{blocks}</div>
}
