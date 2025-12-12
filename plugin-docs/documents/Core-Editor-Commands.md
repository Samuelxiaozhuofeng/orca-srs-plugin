[**Orca API Documentation**](../README.md)

***

[Orca API Documentation](../modules.md) / Core Editor Commands

# Introduction

Orca provides a rich set of editor commands to manipulate blocks, text, and other content. These commands are registered under the `core.editor` namespace and can be invoked programmatically. This document describes all the available editor commands, their parameters, and usage examples.

Editor commands are invoked by calling the `orca.commands.invokeEditorCommand` function.

The commands are organized into several categories:

- Foundational Commands
- Creation Commands
- Deletion Commands
- Indent/Outdent Commands
- Merge/Split Commands
- Text Commands
- Misc Commands

## Foundational Commands

These commands form the basis for manipulating blocks and their content.

### `core.editor.insertBlock`

- **Description**: Inserts a new block with the given arguments.
- **Parameters**:
- `refBlock: Block | null`: The reference block relative to which the new block will be inserted. Can be `null` for inserting at the root level (if applicable).
- `position: "before" | "after" | "firstChild" | "lastChild" | null`: The position relative to `refBlock`. `null` might be used if `refBlock` is also `null`.
- `content?: ContentFragment[]`: Optional initial content for the new block.
- `repr?: Repr`: Optional representation type for the block (defaults to `{ type: "text" }`).
- `created?: Date`: Optional creation timestamp.
- `modified?: Date`: Optional modification timestamp.
- **Usage**: Creates a single new block.

```typescript
// Insert a new text block after block 123
const someBlock = orca.state.blocks[123]
const newBlockId = await orca.commands.invokeEditorCommand(
  "core.editor.insertBlock",
  null, // cursor data (can be null if not needed for context)
  someBlock,
  "after",
  [{ t: "t", v: "New block content" }],
)
```

### `core.editor.batchInsertText`

- **Description**: Batch inserts multiple lines of text with reference to the given block. Each line becomes a new block.
- **Parameters**:
- `refBlock: Block`: The reference block. `DbId` is a number.
- `position: "before" | "after" | "firstChild" | "lastChild"`: The position relative to `refBlock`.
- `text: string`: A string containing lines of text to be inserted as separate blocks.
- `skipMarkdown?: boolean`: Optional flag to skip Markdown parsing (defaults to `false`).
- `skipTags?: boolean`: Optional flag to skip tag extraction (defaults to `false`).
- **Usage**: Useful for pasting multi-line text.

```typescript
const someBlock = orca.state.blocks[123]
const multiLineText = "First line\nSecond line\nThird line"
await orca.commands.invokeEditorCommand(
  "core.editor.batchInsertText",
  cursor,
  someBlock,
  "lastChild",
  multiLineText,
  false, // skipMarkdown
  false, // skipTags
)
```

### `core.editor.batchInsertReprs`

- **Description**: Batch inserts multiple representations with reference to the given block. Each representation becomes a new block.
- **Parameters**:
- `refBlock: Block`: The reference block. `DbId` is a number.
- `position: "before" | "after" | "firstChild" | "lastChild"`: The position relative to `refBlock`.
- `reprs: Repr[]`: An array of representation objects, each defining a block to be inserted.
- **Usage**: For inserting multiple blocks with specific types or initial content structures.

```typescript
const someBlock = orca.state.blocks[123]
const representations = [
  { type: "text", content: [{ t: "t", v: "Block 1" }] },
  { type: "heading", level: 2, content: [{ t: "t", v: "Block 2 Heading" }] },
]
await orca.commands.invokeEditorCommand(
  "core.editor.batchInsertReprs",
  null,
  someBlock,
  "after",
  representations,
)
```

### `core.editor.batchInsertHTML`

- **Description**: Batch inserts HTML content relative to the given block. The HTML is parsed, converted into block representations, and then inserted.
- **Parameters**:
- `refBlock: Block`: The reference block. `DbId` is a number.
- `position: "before" | "after" | "firstChild" | "lastChild"`: The position relative to `refBlock`.
- `html: string`: The HTML string to insert.
- **Usage**: For pasting HTML content.

```typescript
const someBlock = orca.state.blocks[123]
const htmlContent = "<p>Paragraph 1</p><ul><li>Item 1</li><li>Item 2</li></ul>"
await orca.commands.invokeEditorCommand(
  "core.editor.batchInsertHTML",
  null, // Requires panel context, provide appropriate cursor data
  someBlock,
  "firstChild",
  htmlContent,
)
```

### `core.editor.deleteBlocks`

- **Description**: Deletes the given blocks.
- **Parameters**:
- `blockIds: DbId[]`: An array of block IDs (numbers) to delete.
- **Usage**: Removes specified blocks and updates parent/sibling relationships.

```typescript
const blockIdsToDelete: DbId[] = [456, 789]
await orca.commands.invokeEditorCommand(
  "core.editor.deleteBlocks",
  null,
  blockIdsToDelete,
)
```

### `core.editor.setBlocksContent`

- **Description**: Updates the content (`content` and derived `text`) of the given blocks.
- **Parameters**:
- `blocksToUpdate: IdContent[]`: An array of objects, each containing `id` (a number) and `content` for a block to update. `IdContent` is `{ id: DbId, content: ContentFragment[] | null }`.
- `setBackCursor?: boolean`: If `true`, attempts to restore the cursor position after the update (requires valid cursor data in the command invocation).
- **Usage**: Modifies the content fragments of existing blocks.

```typescript
const updates = [
  { id: 501, content: [{ t: "t", v: "Updated content for block 1" }] },
  { id: 502, content: null }, // Clear content for block 2
]
await orca.commands.invokeEditorCommand(
  "core.editor.setBlocksContent",
  null, // Provide cursor data if setBackCursor is true
  updates,
  false,
)
```

### `core.editor.moveBlocks`

- **Description**: Moves the given blocks to a new position relative to a reference block.
- **Parameters**:
- `blockIds: DbId[]`: An array of block IDs (numbers) to move.
- `refBlockId: DbId`: The ID (number) of the reference block.
- `position: "before" | "after" | "firstChild" | "lastChild"`: The target position relative to `refBlockId`.
- **Usage**: Reorders blocks in the hierarchy. Prevents moving a block to be a descendant of itself.

```typescript
const blockIdsToMove: DbId[] = [101]
const targetRefBlockId: DbId = 102
await orca.commands.invokeEditorCommand(
  "core.editor.moveBlocks",
  null,
  blockIdsToMove,
  targetRefBlockId,
  "lastChild", // Move block 101 to be the last child of block 102
)
```

### `core.editor.copyBlocks`

- **Description**: Copies the given blocks to a new position relative to a reference block.
- **Parameters**:
- `blockIds: DbId[]`: An array of block IDs (numbers) to copy.
- `refBlockId: DbId | null`: The ID (number) of the reference block.
- `position: "before" | "after" | "firstChild" | "lastChild | null"`: The target position relative to `refBlockId`.
- `processVars?: boolean`: Optional flag to process variables during copying (defaults to `false`).
- **Usage**: Duplicates blocks and their descendants.

```typescript
const blockIdsToCopy: DbId[] = [201]
const targetRefBlockId: DbId = 202
const newBlocks = await orca.commands.invokeEditorCommand(
  "core.editor.copyBlocks",
  null,
  blockIdsToCopy,
  targetRefBlockId,
  "after", // Copy block 201 to appear after block 202
)
```

### `core.editor.crossRepoCopyBlocks`

- **Description**: Copies blocks from another repository to the current repository.
- **Parameters**:
- `sourceRepoId: string`: The ID of the source repository.
- `blockIds: DbId[]`: An array of block IDs to copy from the source repository.
- `refBlockId: DbId | null`: The ID of the reference block in the target repository.
- `position: "before" | "after" | "firstChild" | "lastChild" | null`: The target position relative to `refBlockId`.
- **Usage**: Imports blocks from another repository and inserts them at the specified position.

```typescript
const sourceRepoId = "external-repo-id"
const blockIdsToCopy: DbId[] = [201]
const targetRefBlockId: DbId = 202
await orca.commands.invokeEditorCommand(
  "core.editor.crossRepoCopyBlocks",
  null,
  sourceRepoId,
  blockIdsToCopy,
  targetRefBlockId,
  "after",
)
```

### `core.editor.createAlias`

- **Description**: Creates an alias (a named reference) for the specified block.
- **Parameters**:
- `name: string`: The desired alias name.
- `blockId: DbId`: The ID (number) of the block to alias.
- `asPage?: boolean`: Optional flag to create the block as a page alias (defaults to `false`).
- **Usage**: Allows referencing a block by a human-readable name. Returns an error object if the alias name is already taken.

```typescript
const aliasName = "my-important-block"
const blockIdToAlias: DbId = 301
const error = await orca.commands.invokeEditorCommand(
  "core.editor.createAlias",
  null,
  aliasName,
  blockIdToAlias,
  false,
)
if (error) {
  console.error("Failed to create alias:", error)
}
```

### `core.editor.deleteAlias`

- **Description**: Deletes the specified alias.
- **Parameters**:
- `name: string`: The name of the alias to delete.
- **Usage**: Removes a named reference to a block.

```typescript
const aliasToDelete = "my-old-alias"
await orca.commands.invokeEditorCommand(
  "core.editor.deleteAlias",
  null,
  aliasToDelete,
)
```

### `core.editor.renameAlias`

- **Description**: Renames the specified alias. Also updates the `text` field of blocks that reference the alias via properties if necessary.
- **Parameters**:
- `oldName: string`: The current name of the alias.
- `newName: string`: The desired new name for the alias.
- **Usage**: Changes the name of an existing alias.

```typescript
const oldAliasName = "current-alias"
const newAliasName = "new-alias-name"
await orca.commands.invokeEditorCommand(
  "core.editor.renameAlias",
  null,
  oldAliasName,
  newAliasName,
)
```

### `core.editor.createRef`

- **Description**: Creates a reference (link) between two specified blocks.
- **Parameters**:
- `from: DbId`: The ID (number) of the block where the reference originates.
- `to: DbId`: The ID (number) of the block being referenced.
- `type: number`: The type of reference being created. Possible values are:
  - `1` (`RefType.Inline`): An inline reference.
  - `2` (`RefType.Property`): A reference via a block property.
  - `3` (`RefType.RefData`): A reference via a reference data.
  - `4` (`RefType.Whiteboard`): A reference via a whiteboard.
- `alias?: string`: An optional alias for this specific reference instance (often used with `RefType.Property`).
- **Usage**: Establishes relationships between blocks, like properties or embeds.

```typescript
import { RefType } from "@/constants/db"

const sourceBlockId: DbId = 401
const targetBlockId: DbId = 402
const propertyAlias = "relatedDocument"

// Create a property reference from block 401 to block 402 with alias 'relatedDocument'
const refId = await orca.commands.invokeEditorCommand(
  "core.editor.createRef",
  null,
  sourceBlockId,
  targetBlockId,
  RefType.Property,
  propertyAlias,
)
```

### `core.editor.setRefAlias`

- **Description**: Sets or changes the alias used in a specific reference instance.
- **Parameters**:
- `ref: BlockRef`: The reference object (containing `id`, `from`, `to`, etc.) whose alias needs to be set. `id`, `from`, `to` are numbers (`DbId`).
- `alias: string`: The new alias string.
- **Usage**: Modifies the alias associated with an existing reference, typically a property reference.

```typescript
// Assume 'blockRef' is a BlockRef object obtained from a block's 'refs' array
const blockRef = orca.state.blocks[801]?.refs.find(
  (r) => r.type === RefType.Property,
)
if (blockRef) {
  const newAlias = "updatedRelation"
  await orca.commands.invokeEditorCommand(
    "core.editor.setRefAlias",
    null,
    blockRef,
    newAlias,
  )
}
```

### `core.editor.setProperties`

- **Description**: Sets or updates specified properties of the given blocks. Properties are stored as key-value pairs.
- **Parameters**:
- `blockIds: DbId[]`: An array of block IDs (numbers) whose properties are to be set.
- `properties: BlockProperty[]`: An array of property objects (`{ name: string, value: any, type: number }`) to set on the blocks.
  - `name: string`: The property's unique identifier.
  - `value: any`: The data associated with the property. Its type should correspond to the `type` field.
  - `type: number`: Specifies the data type of the property. This influences how the `value` is stored and interpreted. See `PropType` for possible values:
  - `0` (`PropType.JSON`): `value` is any valid JSON object or primitive.
  - `1` (`PropType.Text`): `value` is a string.
  - `2` (`PropType.BlockRefs`): `value` is an array of ref IDs.
  - `3` (`PropType.Number`): `value` is a number.
  - `4` (`PropType.Boolean`): `value` is `true` or `false`.
  - `5` (`PropType.DateTime`): `value` represents a date/time.
  - `6` (`PropType.TextChoices`): `value` is an array of strings representing selected options.
- **Usage**: Attaches metadata or structured data to blocks, allowing for typed properties.

```typescript
import { PropType } from "@/constants/db" // Assuming PropType is exported

const blockIdsToUpdate: DbId[] = [601, 602]
const propertiesToSet = [
  { name: "status", value: "completed", type: PropType.Text },
  { name: "priority", value: 1, type: PropType.Number },
  { name: "archived", value: false, type: PropType.Boolean },
  { name: "dueDate", value: new Date(), type: PropType.DateTime },
  { name: "relatedTasks", value: [701, 702], type: PropType.BlockRefs },
  {
    name: "settings",
    value: { theme: "dark", notifications: true },
    type: PropType.JSON,
  },
]
await orca.commands.invokeEditorCommand(
  "core.editor.setProperties",
  null,
  blockIdsToUpdate,
  propertiesToSet,
)
```

### `core.editor.deleteProperties`

- **Description**: Deletes specified properties from the given blocks.
- **Parameters**:
- `blockIds: DbId[]`: An array of block IDs (numbers) from which to delete properties.
- `propertyNames: string[]`: An array of property names to delete.
- **Usage**: Removes metadata from blocks.

```typescript
const blockIdsToUpdate: DbId[] = [701]
const propertiesToDelete = ["status", "priority"]
await orca.commands.invokeEditorCommand(
  "core.editor.deleteProperties",
  null,
  blockIdsToUpdate,
  propertiesToDelete,
)
```

### `core.editor.setRefData`

- **Description**: Sets or updates specific data fields associated with a given block reference (usually a property reference). If a date value is provided, ensures a corresponding journal block reference (`RefType.RefData`) exists.
- **Parameters**:
- `ref: BlockRef`: The reference object (containing `id`, `from`, `to`, etc.) to which the data belongs. `id`, `from`, `to` are numbers (`DbId`).
- `data: BlockRefData[]`: An array of data objects (`{ name: string, value: any }`) to associate with the reference.
- **Usage**: Stores detailed information related to a specific reference link, often used for property values like dates or numbers associated with a tag/property reference.

```typescript
// Assume 'propertyRef' is a BlockRef object for a property reference
const propertyRef = orca.state.blocks[801]?.refs.find(
  (r) => r.type === RefType.Property && r.alias === "dueDate",
)
if (propertyRef) {
  const refDataToSet = [
    { name: "date", value: new Date() }, // Will also create a RefType.RefData link to the journal page
    { name: "notes", value: "Due by end of week" },
  ]
  await orca.commands.invokeEditorCommand(
    "core.editor.setRefData",
    null,
    propertyRef,
    refDataToSet,
  )
}
```

### `core.editor.deleteRefData`

- **Description**: Deletes specified data fields associated with a given block reference ID.
- **Parameters**:
- `refId: DbId`: The ID (number) of the reference from which to delete data.
- `names: string[]`: An array of data field names to delete.
- **Usage**: Removes specific data points associated with a reference link.

```typescript
// Assume 'propertyRefId' is the ID of a BlockRef
const propertyRefId: DbId = 901
const refDataNamesToDelete = ["notes"]
await orca.commands.invokeEditorCommand(
  "core.editor.deleteRefData",
  null,
  propertyRefId,
  refDataNamesToDelete,
)
```

### `core.editor.changeTagPropertyName`

- **Description**: Changes a property's name (`oldName` to `newName`) for a specific tag block (`tagBlockId`) across all blocks that reference this tag and have ref data associated with that property name.
- **Parameters**:
- `tagBlockId: DbId`: The ID (number) of the tag block whose associated property name is changing.
- `oldName: string`: The current name of the property within the ref data.
- `newName: string`: The desired new name for the property within the ref data.
- **Usage**: Used for refactoring or renaming properties associated with tags/templates consistently across the knowledge base.

```typescript
const tagBlockId: DbId = 1001 // ID (number) of the block representing the tag/template
const oldPropertyName = "deadline"
const newPropertyName = "dueDate"
await orca.commands.invokeEditorCommand(
  "core.editor.changeTagPropertyName",
  null,
  tagBlockId,
  oldPropertyName,
  newPropertyName,
)
```

### `core.editor.migrateReferencesAndAliases`

- **Description**: Migrates all references and aliases from one block to another block.
- **Parameters**:
- `from: DbId`: The ID of the source block whose references and aliases should be migrated.
- `to: DbId`: The ID of the target block to migrate references and aliases to.
- **Usage**: Useful for merging or consolidating blocks by moving all their references and aliases to another block.

```typescript
const sourceBlockId: DbId = 501
const targetBlockId: DbId = 502
await orca.commands.invokeEditorCommand(
  "core.editor.migrateReferencesAndAliases",
  cursor,
  sourceBlockId,
  targetBlockId,
)
```

## Creation Commands

These commands help you create various types of content blocks.

### `core.editor.newRootChild`

- **Description**: Appends a new block at the end of the current editor.
- **Usage**: Creates a new blank block at the end of the current document, even if the focus is elsewhere in the document.

```typescript
await orca.commands.invokeEditorCommand("core.editor.newRootChild", cursor)
```

### `core.editor.insertBlockBeforeCursor`

- **Description**: Inserts a new block before the block containing the current cursor.
- **Parameters**:
- `moveCursor: boolean`: Whether to move the cursor to the new block after creation.
- `id?: DbId`: Optional block ID to insert before, if cursor is not specified.
- **Usage**: Adds a new block above the current one.

```typescript
// Insert a block before the current one and move cursor to it
await orca.commands.invokeEditorCommand(
  "core.editor.insertBlockBeforeCursor",
  cursor,
  true,
)
```

### `core.editor.appendBlockAfterCursor`

- **Description**: Inserts a new block after the block containing the current cursor.
- **Parameters**:
- `id?: DbId`: Optional block ID to append after, if cursor is not specified.
- `forceAfter: boolean`: Force insertion after the block rather than as its first child.
- **Usage**: Adds a new block below the current one or as its first child if the current block is a parent.

```typescript
// Insert a block after the current one
await orca.commands.invokeEditorCommand(
  "core.editor.appendBlockAfterCursor",
  cursor,
)

// Force insert after even if the block has children
await orca.commands.invokeEditorCommand(
  "core.editor.appendBlockAfterCursor",
  cursor,
  blockId,
  true,
)
```

### `core.editor.insertTag`

- **Description**: Inserts a tag into a block or updates an existing tag.
- **Parameters**:
- `blockId: DbId`: The ID of the block to add the tag to.
- `alias: string`: The alias name of the tag.
- `data?: BlockRefData[]`: Optional data to associate with the tag.
- **Usage**: Adds metadata tags to blocks, optionally with structured data. If the tag has a `_template` property, will also copy template blocks as children.

```typescript
// Add a simple tag
const tagId = await orca.commands.invokeEditorCommand(
  "core.editor.insertTag",
  cursor,
  blockId,
  "project",
)

// Add a tag with associated data
await orca.commands.invokeEditorCommand(
  "core.editor.insertTag",
  cursor,
  blockId,
  "deadline",
  [{ name: "date", value: "2023-12-31" }],
)
```

### `core.duplicateTag`

- **Description**: Duplicates the specified tag with a new name.
- **Parameters**:
- `tagBlockId: DbId`: The ID of the tag block to duplicate.
- `newName?: string`: Optional new name for the duplicated tag. If not provided, appends an underscore to the original name.
- **Usage**: Creates a copy of a tag with a new alias, useful for template management.

```typescript
// Duplicate a tag with automatic naming
const newTagId = await orca.commands.invokeEditorCommand(
  "core.duplicateTag",
  null,
  tagBlockId,
)

// Duplicate with a specific name
const newTagId = await orca.commands.invokeEditorCommand(
  "core.duplicateTag",
  null,
  tagBlockId,
  "custom-tag-name",
)
```

### `core.editor.insertLink`

- **Description**: Inserts a link at the current cursor position.
- **Parameters**:
- `isRef: boolean`: Whether this is a reference to another block (`true`) or an external URL (`false`).
- `link: DbId | string`: Either a block ID (for references) or a URL string.
- `text?: string`: Optional display text for the link.
- **Usage**: Adds hyperlinks or block references.

```typescript
// Insert an external link
await orca.commands.invokeEditorCommand(
  "core.editor.insertLink",
  cursor,
  false,
  "https://example.com",
  "Example Website",
)

// Insert a block reference
await orca.commands.invokeEditorCommand(
  "core.editor.insertLink",
  cursor,
  true,
  blockId,
  "Referenced Block",
)
```

### `core.editor.insertQuery`

- **Description**: Inserts a query block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Creates a block to run database queries.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertQuery", cursor)
```

### `core.editor.insertDate`

- **Description**: Inserts a reference to a date (journal page).
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at.
- **Usage**: Creates a link to a journal/calendar page for a specific date.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertDate", cursor)
```

### `core.editor.insertImage`

- **Description**: Inserts an image block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Embeds an image from a URL or local path.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertImage", cursor)
```

### `core.editor.insertVideo`

- **Description**: Inserts a video block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Embeds a video from a URL or local path.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertVideo", cursor)
```

### `core.editor.insertAudio`

- **Description**: Inserts an audio block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Embeds an audio file from a URL or local path.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertAudio", cursor)
```

### `core.editor.insertMediaTimestamp`

- **Description**: Inserts a timestamp reference to the current position in a playing media.
- **Usage**: Creates a clickable timestamp that jumps to a specific point in audio/video when clicked.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.insertMediaTimestamp",
  cursor,
)
```

### `core.editor.insertInlineMath`

- **Description**: Inserts inline math notation at the current cursor position.
- **Usage**: Adds a LaTeX math expression within text.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertInlineMath", cursor)
```

### `core.editor.insertMath`

- **Description**: Inserts a math block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Creates a block for extended LaTeX mathematical expressions.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertMath", cursor)
```

### `core.editor.insertCode`

- **Description**: Inserts a code block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Creates a block for displaying and editing code with syntax highlighting.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertCode", cursor)
```

### `core.editor.insertMermaid`

- **Description**: Inserts a Mermaid diagram block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Creates a block for creating diagrams using Mermaid syntax.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertMermaid", cursor)
```

### `core.editor.insertTable`

- **Description**: Inserts a table block with an initial 2x1 structure.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Creates a table for structured data.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertTable", cursor)
```

### `core.editor.insertQuote`

- **Description**: Inserts a quote block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Creates a block for displaying quoted content.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertQuote", cursor)
```

### `core.editor.insertPDF`

- **Description**: Inserts a PDF block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Embeds a PDF from a URL or local path.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertPDF", cursor)
```

### `core.editor.insertHR`

- **Description**: Inserts a horizontal line (hr) block.
- **Parameters**:
- `id?: DbId`: Optional block ID to insert at or modify.
- **Usage**: Creates a visual separator block and automatically creates a new block after it.

```typescript
await orca.commands.invokeEditorCommand("core.editor.insertHR", cursor)
```

## Deletion Commands

These commands handle the removal and modification of content within blocks.

### `core.editor.deleteSelection`

- **Description**: Deletes the currently selected content within the editor.
- **Parameters**:
- `domDelete: boolean`: Whether to also trigger a DOM-level delete operation (defaults to `false`).
- `text?: string`: Optional text to insert at the deletion point.
- **Usage**: Removes the selected text or block content, optionally replacing it with new text.

```typescript
// Delete the current selection
await orca.commands.invokeEditorCommand("core.editor.deleteSelection", cursor)

// Delete selection and replace with new text
await orca.commands.invokeEditorCommand(
  "core.editor.deleteSelection",
  cursor,
  false,
  "Replacement text",
)
```

### `core.editor.removeTag`

- **Description**: Removes a specific tag from a block.
- **Parameters**:
- `blockId: DbId`: The ID of the block from which to remove the tag.
- `alias: string`: The alias name of the tag to remove.
- **Usage**: Removes metadata tags from blocks.

```typescript
// Remove the "project" tag from a block
await orca.commands.invokeEditorCommand(
  "core.editor.removeTag",
  cursor,
  blockId,
  "project",
)
```

### `core.editor.deleteBlocksInSelection`

- **Description**: Deletes all blocks that are currently selected in the editor.
- **Usage**: Removes multiple blocks at once based on the current selection. Will not delete the only block in a table cell.

```typescript
// Delete all blocks in the current selection
await orca.commands.invokeEditorCommand(
  "core.editor.deleteBlocksInSelection",
  cursor,
)
```

### `core.editor.removeAllInstances`

- **Description**: Removes all instances of a tag from blocks that reference it.
- **Parameters**:
- `tagBlockId: DbId`: The ID of the tag block whose instances should be removed.
- **Usage**: Removes all references to a specific tag throughout the knowledge base.

```typescript
const tagBlockId: DbId = 501
await orca.commands.invokeEditorCommand(
  "core.editor.removeAllInstances",
  null,
  tagBlockId,
)
```

### `core.editor.migrateTagInstances`

- **Description**: Migrates all instances of a tag to another tag, replacing references throughout the knowledge base.
- **Parameters**:
- `sourceTagId: DbId`: The ID of the source tag block whose instances should be migrated.
- `targetTagName: string`: The name of the target tag to migrate instances to.
- **Usage**: Useful for reorganizing tag structures or replacing one tag with another.

```typescript
const sourceTagId: DbId = 501
const targetTagName = "new-project-tag"
await orca.commands.invokeEditorCommand(
  "core.editor.migrateTagInstances",
  null,
  sourceTagId,
  targetTagName,
)
```

## Indent/Outdent Commands

### `core.editor.indentSelection`

- **Description**: Indents the selected blocks by moving them to become children of the blocks immediately before them.
- **Parameters**:
  - `ids?: DbId[]`: Optional array of block IDs to indent. If not provided, will use blocks from the cursor selection.
- **Usage**: Increases the indentation level of selected blocks, making them children of preceding blocks.

```typescript
// Indent specific blocks by ID
const blockIdsToIndent: DbId[] = [123, 124]
await orca.commands.invokeEditorCommand(
  "core.editor.indentSelection",
  cursor,
  blockIdsToIndent,
)

// Or indent the current selection
await orca.commands.invokeEditorCommand("core.editor.indentSelection", cursor)
```

### `core.editor.outdentSelection`

- **Description**: Outdents the selected blocks by moving them to become siblings of their parent blocks, positioned after their parents.
- **Parameters**:
  - `ids?: DbId[]`: Optional array of block IDs to outdent. If not provided, will use blocks from the cursor selection.
- **Usage**: Decreases the indentation level of selected blocks, moving them out one level in the hierarchy. Blocks that already have zero indentation will not be affected.

```typescript
// Outdent specific blocks by ID
const blockIdsToOutdent: DbId[] = [123, 124]
await orca.commands.invokeEditorCommand(
  "core.editor.outdentSelection",
  cursor,
  blockIdsToOutdent,
)

// Or outdent the current selection
await orca.commands.invokeEditorCommand("core.editor.outdentSelection", cursor)
```

## Merge/Split Commands

### `core.editor.mergeBlocks`

- **Description**: Merges the content of a source block into a destination block, then deletes the source block. If the source block has children, these are moved to the destination block.
- **Parameters**:
  - `srcId: DbId`: The ID of the source block (content to merge from).
  - `destId: DbId`: The ID of the destination block (content to merge into).
  - `srcContent?: ContentFragment[]`: Optional content to merge instead of using the source block's content.
- **Usage**: Combines two blocks into one, preserving all content.

```typescript
// Merge block 123's content into block 124
await orca.commands.invokeEditorCommand(
  "core.editor.mergeBlocks",
  cursor,
  123, // source block ID
  124, // destination block ID
)
```

### `core.editor.mergePrecedingBlock`

- **Description**: Merges the current block with the block immediately preceding it in the document.
- **Parameters**:
  - `srcContent?: ContentFragment[]`: Optional content to merge instead of using the current block's content.
- **Usage**: Combines the current block with the block above it.

```typescript
// Merge the current block with the preceding block
await orca.commands.invokeEditorCommand(
  "core.editor.mergePrecedingBlock",
  cursor,
)
```

### `core.editor.mergeFollowingBlock`

- **Description**: Merges the current block with the block immediately following it in the document.
- **Usage**: Combines the current block with the block below it.

```typescript
// Merge the current block with the following block
await orca.commands.invokeEditorCommand(
  "core.editor.mergeFollowingBlock",
  cursor,
)
```

### `core.editor.splitBlock`

- **Description**: Splits the current block into two blocks at the cursor position. The content before the cursor stays in the current block, and the content after the cursor is moved to a new block.
- **Usage**: Creates a new block from the latter portion of the current block. If the block has children, the new block is inserted as the first child.

```typescript
// Split the current block at the cursor position
const newBlockId = await orca.commands.invokeEditorCommand(
  "core.editor.splitBlock",
  cursor,
)
```

## Text Commands

These commands control text formatting and block type conversion.

### `core.editor.formatSelectedText`

- **Description**: Applies a specific format to the currently selected text.
- **Parameters**:
  - `formatType: string`: The format to apply (e.g., "b" for bold, "i" for italic).
  - `formatArgs: Record<string, any>`: Optional arguments for the format (e.g., color values).
- **Usage**: Used to format selected text with styles like bold, italic, etc.

```typescript
// Make selected text bold
await orca.commands.invokeEditorCommand(
  "core.editor.formatSelectedText",
  cursor,
  "b",
)

// Apply custom text color
await orca.commands.invokeEditorCommand(
  "core.editor.formatSelectedText",
  cursor,
  "fc",
  { fcc: "red" },
)
```

### `core.editor.formatBold`

- **Description**: Formats the selected text as bold or toggles bold formatting.
- **Usage**: Applies bold formatting to selected text, or inserts bold formatting at cursor position.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatBold", cursor)
```

### `core.editor.formatItalic`

- **Description**: Formats the selected text as italic or toggles italic formatting.
- **Usage**: Applies italic formatting to selected text, or inserts italic formatting at cursor position.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatItalic", cursor)
```

### `core.editor.formatStrikethrough`

- **Description**: Formats the selected text with strikethrough or toggles strikethrough formatting.
- **Usage**: Applies strikethrough formatting to selected text, or inserts strikethrough formatting at cursor position.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatStrikethrough",
  cursor,
)
```

### `core.editor.formatUnderlineSolid`

- **Description**: Formats the selected text with a solid underline or toggles solid underline formatting.
- **Usage**: Applies solid underline formatting to selected text, or inserts solid underline formatting at cursor position.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatUnderlineSolid",
  cursor,
)
```

### `core.editor.formatUderlineCustomColor`

- **Description**: Formats the selected text with an underline in a custom color.
- **Parameters**:
  - `color?: string`: Optional color value. If not provided, shows a color picker.
- **Usage**: Applies an underline with custom color to selected text.

```typescript
// With color picker
await orca.commands.invokeEditorCommand(
  "core.editor.formatUderlineCustomColor",
  cursor,
)

// With predefined color
await orca.commands.invokeEditorCommand(
  "core.editor.formatUderlineCustomColor",
  cursor,
  "#FF5500",
)
```

### `core.editor.formatUderlineWavyCustomColor` (note the typo in command name)

- **Description**: Formats the selected text with a wavy underline with custom color.
- **Parameters**:
  - `color?: string`: Optional color value. If not provided, shows a color picker.
- **Usage**: Applies a wavy underline with custom color to selected text.

```typescript
// With color picker
await orca.commands.invokeEditorCommand(
  "core.editor.formatUderlineWavyCustomColor",
  cursor,
)

// With predefined color
await orca.commands.invokeEditorCommand(
  "core.editor.formatUderlineWavyCustomColor",
  cursor,
  "#FF5500",
)
```

### `core.editor.formatUnderlineWavyRed`

- **Description**: Formats the selected text with a red wavy underline.
- **Usage**: Applies a red wavy underline to selected text, useful for highlighting errors.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatUnderlineWavyRed",
  cursor,
)
```

### `core.editor.formatUnderlineWavyGreen`

- **Description**: Formats the selected text with a green wavy underline.
- **Usage**: Applies a green wavy underline to selected text.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatUnderlineWavyGreen",
  cursor,
)
```

### `core.editor.formatUnderlineWavyBlue`

- **Description**: Formats the selected text with a blue wavy underline.
- **Usage**: Applies a blue wavy underline to selected text.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatUnderlineWavyBlue",
  cursor,
)
```

### `core.editor.formatInlineCode`

- **Description**: Formats the selected text as inline code or toggles inline code formatting.
- **Usage**: Applies a monospace font and background to selected text for code snippets within regular text.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatInlineCode", cursor)
```

### `core.editor.formatTextBlue`

- **Description**: Changes the selected text color to blue.
- **Usage**: Applies blue color to selected text.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatTextBlue", cursor)
```

### `core.editor.formatTextGreen`

- **Description**: Changes the selected text color to green.
- **Usage**: Applies green color to selected text.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatTextGreen", cursor)
```

### `core.editor.formatTextRed`

- **Description**: Changes the selected text color to red.
- **Usage**: Applies red color to selected text.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatTextRed", cursor)
```

### `core.editor.formatHighlightYellow`

- **Description**: Highlights the selected text with a yellow background.
- **Usage**: Applies yellow highlighting to selected text.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatHighlightYellow",
  cursor,
)
```

### `core.editor.formatHighlightBlue`

- **Description**: Highlights the selected text with a blue background.
- **Usage**: Applies blue highlighting to selected text.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatHighlightBlue",
  cursor,
)
```

### `core.editor.formatHighlightGreen`

- **Description**: Highlights the selected text with a green background.
- **Usage**: Applies green highlighting to selected text.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatHighlightGreen",
  cursor,
)
```

### `core.editor.formatHighlightRed`

- **Description**: Highlights the selected text with a red background.
- **Usage**: Applies red highlighting to selected text.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatHighlightRed",
  cursor,
)
```

### `core.editor.formatTextCustomColor`

- **Description**: Changes the selected text to a custom color.
- **Parameters**:
  - `color?: string`: Optional color value. If not provided, shows a color picker.
- **Usage**: Applies a custom color to selected text.

```typescript
// With color picker
await orca.commands.invokeEditorCommand(
  "core.editor.formatTextCustomColor",
  cursor,
)

// With predefined color
await orca.commands.invokeEditorCommand(
  "core.editor.formatTextCustomColor",
  cursor,
  "#7700FF",
)
```

### `core.editor.formatHighlightCustomColor`

- **Description**: Highlights the selected text with a custom background color.
- **Parameters**:
  - `color?: string`: Optional color value. If not provided, shows a color picker.
- **Usage**: Applies a custom highlight color to selected text.

```typescript
// With color picker
await orca.commands.invokeEditorCommand(
  "core.editor.formatHighlightCustomColor",
  cursor,
)

// With predefined color
await orca.commands.invokeEditorCommand(
  "core.editor.formatHighlightCustomColor",
  cursor,
  "#FFFFAA",
)
```

### `core.editor.formatSup`

- **Description**: Formats the selected text as superscript or toggles superscript formatting.
- **Usage**: Makes the selected text appear as superscript.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatSup", cursor)
```

### `core.editor.formatSub`

- **Description**: Formats the selected text as subscript or toggles subscript formatting.
- **Usage**: Makes the selected text appear as subscript.

```typescript
await orca.commands.invokeEditorCommand("core.editor.formatSub", cursor)
```

### `core.editor.formatIncreaseFontSize`

- **Description**: Increases the font size of the selected text.
- **Usage**: Makes the selected text larger by one font size step.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatIncreaseFontSize",
  cursor,
)
```

### `core.editor.formatDecreaseFontSize`

- **Description**: Decreases the font size of the selected text.
- **Usage**: Makes the selected text smaller by one font size step.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatDecreaseFontSize",
  cursor,
)
```

### `core.editor.formatResetFontSize`

- **Description**: Resets the font size of the selected text to the default size.
- **Usage**: Removes any custom font size formatting from selected text.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.formatResetFontSize",
  cursor,
)
```

### `core.editor.copyFormatting`

- **Description**: Copies the formatting from the current selection to be applied to future selections (format painter).
- **Usage**: Select text with formatting, invoke this command, then select another text to apply the same formatting.

```typescript
await orca.commands.invokeEditorCommand("core.editor.copyFormatting", cursor)
```

### `core.editor.convertSelectionIntoLink`

- **Description**: Converts the currently selected text into a link.
- **Usage**: Opens a dialog to create either an URL link or a reference to another block.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.convertSelectionIntoLink",
  cursor,
)
```

### `core.editor.convertSelectionIntoMath`

- **Description**: Converts the selected text (assumed to be LaTeX) into inline math notation.
- **Usage**: Transform selected LaTeX text into rendered mathematical expressions.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.convertSelectionIntoMath",
  cursor,
)
```

### `core.editor.convertSelectionIntoReference`

- **Description**: Converts the selected text into a reference link to a tag or block.
- **Usage**: Creates or finds a block with the selected text as its alias and inserts a reference to it.

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.convertSelectionIntoReference",
  cursor,
)
```

### `core.editor.clearFormatting`

- **Description**: Removes all formatting from the selected text.
- **Usage**: Strips bold, italic, colors, highlighting, and other formatting from selected text.

```typescript
await orca.commands.invokeEditorCommand("core.editor.clearFormatting", cursor)
```

### `core.editor.selectAll`

- **Description**: Selects all text in the current block or, if already selected, all blocks in the document.
- **Usage**: Progressively expands selection from current block to all content.

```typescript
await orca.commands.invokeEditorCommand("core.editor.selectAll", cursor)
```

### `core.editor.makeText`

- **Description**: Converts the selected block(s) to text blocks.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert. If not provided, uses blocks from cursor selection.
- **Usage**: Converts blocks to simple text blocks.

```typescript
// Convert current selection to text blocks
await orca.commands.invokeEditorCommand("core.editor.makeText", cursor)

// Convert specific block to text
await orca.commands.invokeEditorCommand("core.editor.makeText", cursor, 123)
```

### `core.editor.makeHeading1`

- **Description**: Converts the selected block(s) to level 1 heading blocks.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Converts blocks to heading 1 format.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeHeading1", cursor)
```

### `core.editor.makeHeading2`

- **Description**: Converts the selected block(s) to level 2 heading blocks.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Converts blocks to heading 2 format.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeHeading2", cursor)
```

### `core.editor.makeHeading3`

- **Description**: Converts the selected block(s) to level 3 heading blocks.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Converts blocks to heading 3 format.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeHeading3", cursor)
```

### `core.editor.makeHeading4`

- **Description**: Converts the selected block(s) to level 4 heading blocks.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Converts blocks to heading 4 format.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeHeading4", cursor)
```

### `core.editor.makeNumberedList`

- **Description**: Converts the selected block(s) to numbered list items.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
  - `start?: number`: Optional starting number for the list.
- **Usage**: Converts blocks to ordered list items.

```typescript
// Standard numbered list
await orca.commands.invokeEditorCommand("core.editor.makeNumberedList", cursor)

// Numbered list starting from 5
await orca.commands.invokeEditorCommand(
  "core.editor.makeNumberedList",
  cursor,
  undefined,
  5,
)
```

### `core.editor.makeBulletedList`

- **Description**: Converts the selected block(s) to bulleted list items.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Converts blocks to unordered list items.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeBulletedList", cursor)
```

### `core.editor.makeQuote`

- **Description**: Converts selected block(s) into a quote block.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Creates a quote block with the selected blocks as its content.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeQuote", cursor)
```

### `core.editor.makeMath`

- **Description**: Converts the selected block(s) to math blocks.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Converts blocks to mathematical expression blocks that render LaTeX.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeMath", cursor)
```

### `core.editor.makeTask`

- **Description**: Converts the selected block(s) to task blocks.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Converts blocks to checkable task items.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeTask", cursor)
```

### `core.editor.insertFragments`

- **Description**: Inserts content fragments at the cursor position.
- **Parameters**:
  - `fragments: ContentFragment[]`: Array of content fragments to insert.
- **Usage**: Low-level command to insert formatted content without using the UI.

```typescript
// Insert bold text
await orca.commands.invokeEditorCommand("core.editor.insertFragments", cursor, [
  { t: "t", v: "Important note", f: "b" },
])

// Insert link
await orca.commands.invokeEditorCommand("core.editor.insertFragments", cursor, [
  { t: "r", v: "Orca Documentation", u: "https://orca.so/docs" },
])
```

### `core.editor.toggleTask`

- **Description**: Toggles the completion status of a task block.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to toggle.
- **Usage**: Marks task blocks as complete/incomplete.

```typescript
// Toggle task on current block
await orca.commands.invokeEditorCommand("core.editor.toggleTask", cursor)

// Toggle task on specific block
await orca.commands.invokeEditorCommand("core.editor.toggleTask", null, blockId)
```

### `core.editor.makeAliased`

- **Description**: Converts the selected block into an aliased block (a block with a named reference).
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to convert.
- **Usage**: Makes a block aliased so it can be referenced by name throughout the document.

```typescript
await orca.commands.invokeEditorCommand("core.editor.makeAliased", cursor)
```

## Misc Commands

These commands provide miscellaneous functionality for manipulating blocks and UI elements.

### `core.editor.toggleShowAsLongForm`

- **Description**: Toggles whether a block is shown as long-form content.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Changes the display style of a block to show extended content.

```typescript
// Toggle long-form display for the current block
await orca.commands.invokeEditorCommand(
  "core.editor.toggleShowAsLongForm",
  cursor,
)

// Toggle long-form display for a specific block
await orca.commands.invokeEditorCommand(
  "core.editor.toggleShowAsLongForm",
  cursor,
  123,
)
```

### `core.editor.toggleAsTemplate`

- **Description**: Toggles whether a block is marked as a template by adding or removing a template tag.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Marks or unmarks a block as a template. Uses the template tag defined in settings (defaults to "Template").

```typescript
// Toggle template status for the current block
await orca.commands.invokeEditorCommand("core.editor.toggleAsTemplate", cursor)

// Toggle template status for a specific block
await orca.commands.invokeEditorCommand(
  "core.editor.toggleAsTemplate",
  cursor,
  123,
)
```

### `core.editor.toggleFavorite`

- **Description**: Adds or removes a block from the favorites list.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Toggles whether a block is in the user's favorites.

```typescript
// Toggle favorite status for the current block
await orca.commands.invokeEditorCommand("core.editor.toggleFavorite", cursor)
```

### `core.editor.toggleReadOnly`

- **Description**: Toggles the read-only mode for the current editor.
- **Usage**: Enables or disables editing in the current document. No focus is needed for this command.

```typescript
// Toggle read-only mode for the current editor
await orca.commands.invokeEditorCommand("core.editor.toggleReadOnly", cursor)
```

### `core.editor.showBlockMenu`

- **Description**: Shows the context menu for the current block.
- **Usage**: Displays the block menu at the current block position.

```typescript
// Show menu for the current block
await orca.commands.invokeEditorCommand("core.editor.showBlockMenu", cursor)
```

### `core.editor.focusIn`

- **Description**: Navigates into the current block, making it the root of the editor view.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: "Zooms in" to focus on a specific block and its children.

```typescript
// Focus in on the current block
await orca.commands.invokeEditorCommand("core.editor.focusIn", cursor)

// Focus in on a specific block
await orca.commands.invokeEditorCommand("core.editor.focusIn", cursor, 123)
```

### `core.editor.focusOut`

- **Description**: Exits the current focused block and moves back to its parent scope.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID to focus out from. If not provided, uses the current focused block.
- **Usage**: Navigates up one level in the document hierarchy.

```typescript
// Focus out from the current block
await orca.commands.invokeEditorCommand("core.editor.focusOut", cursor)
```

### `core.editor.openOnTheSide`

- **Description**: Opens the current block in a separate panel on the side.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Creates a split view with the selected block open in a new panel.

```typescript
// Open current block on the side
await orca.commands.invokeEditorCommand("core.editor.openOnTheSide", cursor)
```

### `core.editor.copyBlockLink`

- **Description**: Copies a link to the current block to the clipboard.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Creates a reference link that can be pasted elsewhere.

```typescript
// Copy link to current block
await orca.commands.invokeEditorCommand("core.editor.copyBlockLink", cursor)
```

### `core.editor.foldAll`

- **Description**: Folds all top-level blocks in the current document.
- **Usage**: Collapses all blocks to show only their first line.

```typescript
// Fold all blocks
await orca.commands.invokeEditorCommand("core.editor.foldAll", cursor)
```

### `core.editor.unfoldAll`

- **Description**: Unfolds all blocks in the current document.
- **Usage**: Expands all collapsed blocks to show their full content.

```typescript
// Unfold all blocks
await orca.commands.invokeEditorCommand("core.editor.unfoldAll", cursor)
```

### `core.editor.foldBlock`

- **Description**: Folds the current block or a specific block.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Collapses a single block to show only its first line.

```typescript
// Fold the current block
await orca.commands.invokeEditorCommand("core.editor.foldBlock", cursor)
```

### `core.editor.unfoldBlock`

- **Description**: Unfolds the current block or a specific block.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Expands a collapsed block to show its full content.

```typescript
// Unfold the current block
await orca.commands.invokeEditorCommand("core.editor.unfoldBlock", cursor)
```

### `core.editor.moveBlockUp`

- **Description**: Moves the current block or specified blocks up in the document.
- **Parameters**:
  - `ids?: DbId[]`: Optional array of block IDs to move. If not provided, uses the block at cursor position.
- **Usage**: Repositions blocks higher in the document structure.

```typescript
// Move current block up
await orca.commands.invokeEditorCommand("core.editor.moveBlockUp", cursor)

// Move specific blocks up
await orca.commands.invokeEditorCommand(
  "core.editor.moveBlockUp",
  cursor,
  [123, 124],
)
```

### `core.editor.moveBlockDown`

- **Description**: Moves the current block or specified blocks down in the document.
- **Parameters**:
  - `ids?: DbId[]`: Optional array of block IDs to move. If not provided, uses the block at cursor position.
- **Usage**: Repositions blocks lower in the document structure.

```typescript
// Move current block down
await orca.commands.invokeEditorCommand("core.editor.moveBlockDown", cursor)
```

### `core.editor.export.pdf`

- **Description**: Exports the current block as a PDF file.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
  - `landscape?: boolean`: Optional flag to use landscape orientation (defaults to `false`).
- **Usage**: Creates a PDF file from the block's content.

```typescript
// Export current block as PDF
await orca.commands.invokeEditorCommand("core.editor.export.pdf", cursor)

// Export in landscape mode
await orca.commands.invokeEditorCommand(
  "core.editor.export.pdf",
  cursor,
  123,
  true,
)
```

### `core.editor.export.png`

- **Description**: Exports the current block as a PNG image file.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Creates a PNG image from the block's content.

```typescript
// Export current block as PNG
await orca.commands.invokeEditorCommand("core.editor.export.png", cursor)
```

### `core.editor.export.txt`

- **Description**: Exports the current block as a plain text file.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Creates a text file from the block's content.

```typescript
// Export current block as text
await orca.commands.invokeEditorCommand("core.editor.export.txt", cursor)
```

### `core.editor.pasteText`

- **Description**: Pastes plain text from the clipboard, handling multi-line text appropriately.
- **Usage**: Pastes text without formatting, creating new blocks for line breaks.

```typescript
// Paste text from clipboard
await orca.commands.invokeEditorCommand("core.editor.pasteText", cursor)
```

### `core.editor.pasteAsReference`

- **Description**: Pastes a copied block as an inline reference.
- **Usage**: Creates a reference link to the block in the clipboard.

```typescript
// Paste block as reference
await orca.commands.invokeEditorCommand("core.editor.pasteAsReference", cursor)
```

### `core.editor.pasteAsMirror`

- **Description**: Pastes a copied block as a mirror block.
- **Usage**: Creates a mirror of the block in the clipboard.

```typescript
// Paste block as mirror
await orca.commands.invokeEditorCommand("core.editor.pasteAsMirror", cursor)
```

### `core.editor.pasteAsMove`

- **Description**: Moves copied blocks to the current cursor position (cut and paste).
- **Usage**: Relocates blocks from their original position to the cursor position.

```typescript
// Move blocks to current position
await orca.commands.invokeEditorCommand("core.editor.pasteAsMove", cursor)
```

### `core.editor.pasteAsCopy`

- **Description**: Pastes copied blocks as new copies (duplicate).
- **Usage**: Creates duplicates of blocks at the cursor position.

```typescript
// Paste as copy
await orca.commands.invokeEditorCommand("core.editor.pasteAsCopy", cursor)
```

### `core.editor.showAIMenu`

- **Description**: Shows the AI assistant menu at the current cursor position.
- **Usage**: Displays contextual AI actions for the selected content.

```typescript
// Show AI menu
await orca.commands.invokeEditorCommand("core.editor.showAIMenu", cursor)
```

### `core.editor.insertCurrentTime`

- **Description**: Inserts the current time at the cursor position.
- **Usage**: Adds a timestamp using the current system time and formatting based on user settings.

```typescript
// Insert current time
await orca.commands.invokeEditorCommand("core.editor.insertCurrentTime", cursor)
```

### `core.editor.copyBlockID`

- **Description**: Copies the ID of the current block to the clipboard.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Gets the numeric block ID for use in formulas or references.

```typescript
// Copy the ID of the current block
await orca.commands.invokeEditorCommand("core.editor.copyBlockID", cursor)
```

### `core.editor.export.md`

- **Description**: Exports the current block as a Markdown file.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Creates a Markdown formatted file from the block's content.

```typescript
// Export current block as Markdown
await orca.commands.invokeEditorCommand("core.editor.export.md", cursor)
```

### `core.editor.export.html`

- **Description**: Exports the current block as an HTML file.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Creates an HTML formatted file from the block's content.

```typescript
// Export current block as HTML
await orca.commands.invokeEditorCommand("core.editor.export.html", cursor)
```

### `core.editor.pasteHTML`

- **Description**: Pastes HTML content from the clipboard, converting it to blocks.
- **Usage**: Handles HTML clipboard content and converts it to appropriate block structures.

```typescript
// Paste HTML from clipboard
await orca.commands.invokeEditorCommand("core.editor.pasteHTML", cursor)
```

### `core.editor.extractPage`

- **Description**: Extracts the current block and opens it as a separate page/document.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Separates a block from its parent and opens it as an independent document.

```typescript
// Extract current block as page
await orca.commands.invokeEditorCommand("core.editor.extractPage", cursor)
```

### `core.editor.inlinePage`

- **Description**: Inlines a reference block's content directly into the current document.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Converts a page reference to inline content.

```typescript
// Inline a page reference
await orca.commands.invokeEditorCommand("core.editor.inlinePage", cursor)
```

### `core.editor.toggleFold`

- **Description**: Toggles the folding state of the current block (fold if expanded, unfold if folded).
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Switches the collapse/expand state of a block.

```typescript
// Toggle fold state for current block
await orca.commands.invokeEditorCommand("core.editor.toggleFold", cursor)
```

### `core.editor.toggleTaskState`

- **Description**: Toggles the completion state of a task block.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Marks a task as complete/incomplete. Similar to `toggleTask` but more explicit about task state.

```typescript
// Toggle task state
await orca.commands.invokeEditorCommand("core.editor.toggleTaskState", cursor)
```

### `core.editor.showAliasEditor`

- **Description**: Opens the alias editor for the current block.
- **Parameters**:
  - `id?: DbId`: Optional specific block ID. If not provided, uses the block at cursor position.
- **Usage**: Displays a dialog to create or edit the alias for a block.

```typescript
// Show alias editor for current block
await orca.commands.invokeEditorCommand("core.editor.showAliasEditor", cursor)
```

### `core.editor.showTagInsertion`

- **Description**: Shows a tag insertion menu at the current cursor position.
- **Usage**: Displays options to select and insert tags into the current block.

```typescript
// Show tag insertion menu
await orca.commands.invokeEditorCommand("core.editor.showTagInsertion", cursor)
```
