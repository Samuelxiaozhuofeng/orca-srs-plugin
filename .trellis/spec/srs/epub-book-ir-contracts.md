# EPUB Import And Book IR Contracts

## When To Use

- Adding or changing `epub.*` book/chapter properties
- Changing `ir.bookPlan` schema or IR removal/progression

## Rules

1. Persist only versioned JSON documents; parse with strict validators (`parseEpubManifest`, `parseBookIRPlan`). Never string-patch.
2. Exact book identity is `epub.fingerprint` / `bookBlockId`. Never use `ir.batchId` as book membership.
3. Plain EPUB import must not write `#card`, `srs.*`, or IR scheduling. IR is a second stage.
4. IR removal clears card/scheduling only; keep blocks, content, assets, references, and `epub.*`.
5. Sequential unlock advances only via complete/skip progression service—not read, postpone, or priority.
6. Chapter selection excludes semantic cover wrappers (`guide type=cover` or cover-named manifest items).
7. Chapter title precedence is content heading, TOC/nav label, meaningful document `<title>`, first short visible text, then `未命名章节 N`. Never expose synthetic `Chapter N` labels.
8. Parse well-formed XHTML documents as `application/xhtml+xml` so self-closing script/style elements do not swallow body content; fall back to `text/html` for non-XML HTML.
9. Chapter body import uses heading-stack outline ownership (`htmlOutline` + `orcaOutlineImporter`): content belongs to the nearest open heading of lower level; do not flatten all body blocks under the chapter page.
10. Strip blank-only nodes (whitespace, NBSP, meaningless `<br>`, empty layout containers) before Orca insert; keep `<hr>`, media, lists, quotes, footnote-bearing content, and `<br>` inside non-blank content.
11. Remove a chapter-body title only when the first heading is `h1` and its normalized text equals the chapter page title. Preserve lower-level or mismatched headings.

## Scenario: Chapter Body Outline Normalization

### 1. Scope / Trigger

- Applies when sanitized EPUB chapter HTML is converted into Orca child blocks.

### 2. Signatures

```ts
getChapterContent(href: string, pageTitle: string): Promise<string>
parseHtmlOutlineTokens(html: string): HtmlOutlineToken[]
importHtmlAsOutline(parentBlockId: DbId, html: string): Promise<void>
```

### 3. Contracts

- The chapter page is virtual heading level 0.
- Each `hN` belongs to the nearest preceding heading whose level is lower than `N`; missing levels are not synthesized.
- Content belongs to the current heading until a same-level or higher-level heading closes it.
- Blank block containers are removed, while semantic elements and inline formatting remain in source order.
- Page-title dedupe may remove only a matching first `h1`.

### 4. Validation & Error Matrix

- Whitespace, NBSP, or `<p><br></p>` only -> emit no content token.
- `<p>line 1<br>line 2</p>` -> preserve the `<br>` in the content token.
- Matching first `h1` -> chapter page carries its meaning; remove that `h1`.
- First heading is `h2` through `h6`, or `h1` text differs -> preserve it.
- `<hr>`, image, list, quote, footnote marker, or semantic inline wrapper -> preserve it.

### 5. Good, Base And Bad Cases

- Good: `h1 -> h3 -> h2` imports as one `h1` with sibling `h3` and `h2` children in source order.
- Base: content before any heading becomes a direct child of the chapter page.
- Bad: recursively deleting every `<br>` merges visible lines; removing the first heading without checking its level changes the source hierarchy.

### 6. Tests Required

- Assert heading `insertBlock` calls use the expected parent IDs and source order.
- Assert content insert calls target the active heading and contain no blank-only top-level elements.
- Assert meaningful `<br>`, `<hr>`, images, lists, quotes, footnote markers, inline wrappers, and figures survive cleanup.
- Assert only a normalized-title-matching first `h1` is removed.

### 7. Wrong vs Correct

```ts
// Wrong: removes semantic line breaks and any first heading.
stripBlankNodesIncludingEveryBr(root)
removeMatchingTopHeading(root, extractTopHeadingTitle(root))

// Correct: removes blank containers but keeps br inside non-blank content,
// and compares the first h1 with the actual chapter page title.
stripBlankNodes(root)
removeMatchingTopHeading(root, pageTitle)
```

## Tests

- `src/importers/epub/*.test.ts`
- `src/srs/book-ir/bookIRService.test.ts`

## Scenario: Background Chapter Catalog References

### 1. Scope / Trigger

- Applies when an importer or batch job writes an inline block reference without a rendered editor block.
- Never use selection-driven commands (`setSelectionFromCursorData`, `insertLink`) in this path; they require live DOM nodes.

### 2. Signatures

```ts
createRef(null, fromBlockId, targetBlockId, 1, displayText): Promise<DbId>
setBlocksContent(null, [{ id: fromBlockId, content: [{ t: "r", v: refId, a: displayText }] }], false)
```

### 3. Contracts

- `RefType.Inline` is numeric value `1`.
- `createRef` must return a numeric `refId`; boolean/undefined results are failures.
- The catalog block content stores the returned reference ID in `fragment.v`, not the target block ID.
- A chapter page is recoverable by the pair `epub.bookId` + `epub.chapterKey` even if its manifest `blockId` checkpoint is missing.

### 4. Validation & Error Matrix

- `createRef` rejects or returns a non-number -> delete the catalog placeholder and fail the chapter explicitly.
- content write fails -> delete the catalog placeholder so its reference is cascaded and resume can retry.
- matching inline ref exists but `t="r"` content is missing -> repair content using the existing ref ID.
- manifest entry is pending with no block ID -> search by stable chapter identity before creating a page.

### 5. Good/Base/Bad Cases

- Good: multiple chapters import while none of the catalog blocks are mounted in the DOM.
- Base: an existing valid catalog reference is detected and left unchanged.
- Bad: import calls `insertLink` with a synthetic cursor and hangs in Orca's DOM observer.

### 6. Tests Required

- Assert each imported catalog row has a type-1 ref to its chapter and a `t="r"` fragment containing the numeric ref ID.
- Assert no selection or `insertLink` call occurs.
- Assert resume reuses a chapter found by `epub.bookId` + `epub.chapterKey` when manifest `blockId` is null.

### 7. Wrong vs Correct

```ts
// Wrong: depends on a rendered editor node.
await orca.utils.setSelectionFromCursorData(cursor)
await orca.commands.invokeEditorCommand("core.editor.insertLink", cursor, true, targetId, title)

// Correct: persists the relation and its visible fragment directly.
const refId = await orca.commands.invokeEditorCommand(
  "core.editor.createRef", null, catalogRowId, targetId, 1, title
)
await orca.commands.invokeEditorCommand(
  "core.editor.setBlocksContent",
  null,
  [{ id: catalogRowId, content: [{ t: "r", v: refId, a: title }] }],
  false
)
```
