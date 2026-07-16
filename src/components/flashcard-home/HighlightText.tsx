type HighlightTextProps = { text: string; query: string }

/** 安全地按查询词分片高亮，避免把用户输入当作正则表达式。 */
export default function HighlightText({ text, query }: HighlightTextProps) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return <>{text}</>

  const lowerText = text.toLocaleLowerCase()
  const lowerQuery = normalizedQuery.toLocaleLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let matchIndex = lowerText.indexOf(lowerQuery)

  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex))
    parts.push(
      <span key={matchIndex} style={{
        backgroundColor: "var(--orca-color-warning-2)",
        color: "var(--orca-color-warning-7)",
        fontWeight: 600,
        padding: "0 2px",
        borderRadius: "2px"
      }}>
        {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </span>
    )
    cursor = matchIndex + normalizedQuery.length
    matchIndex = lowerText.indexOf(lowerQuery, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}
