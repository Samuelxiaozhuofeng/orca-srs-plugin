[**Orca API Documentation**](../README.md)

***

[Orca API Documentation](../modules.md) / types/orca

# types/orca

## Interfaces

### Block

Core block data structure that represents a single note, section, or other content unit.
Blocks are the primary building blocks of content in Orca.

#### Properties

##### aliases

> **aliases**: `string`[]

Array of aliases (alternative names) for the block

##### backRefs

> **backRefs**: [`BlockRef`](#blockref)[]

Array of incoming references from other blocks to this block

##### children

> **children**: `number`[]

Array of child block IDs

##### content?

> `optional` **content**: [`ContentFragment`](#contentfragment)[]

Optional array of content fragments for rich text content

##### created

> **created**: `Date`

Timestamp when the block was created

##### id

> **id**: `number`

Unique identifier for the block

##### left?

> `optional` **left**: `number`

ID of the block to the left in the content flow, used for ordering siblings

##### modified

> **modified**: `Date`

Timestamp when the block was last modified

##### parent?

> `optional` **parent**: `number`

ID of the parent block, if any

##### properties

> **properties**: [`BlockProperty`](#blockproperty)[]

Array of named properties attached to the block

##### refs

> **refs**: [`BlockRef`](#blockref)[]

Array of outgoing references from this block to other blocks

##### text?

> `optional` **text**: `string`

Optional plain text content, used along with the content array

***

### BlockCustomQuery

Configuration for custom queries (used in block previews primarily).

#### Properties

##### extraSql?

> `optional` **extraSql**: `string`

Optional extra SQL to append to the query defined in `q`

##### q

> **q**: [`QueryDescription2`](#querydescription2)

The query description

***

### BlockProperty

Represents a named property attached to a block.
Properties can store metadata and structured data associated with blocks.

#### Properties

##### name

> **name**: `string`

Name of the property

##### pos?

> `optional` **pos**: `number`

Optional position for visual ordering of properties

##### type

> **type**: `number`

Type code for the property (determines how the value is interpreted)

##### typeArgs?

> `optional` **typeArgs**: `any`

Optional arguments specific to the property type

##### value?

> `optional` **value**: `any`

The property value

***

### BlockRef

Represents a reference from one block to another.
References create connections between different blocks in the knowledge graph.

#### Properties

##### alias?

> `optional` **alias**: `string`

Optional alias name used for the reference

##### data?

> `optional` **data**: [`BlockProperty`](#blockproperty)[]

Optional additional properties for the reference

##### from

> **from**: `number`

ID of the block containing the reference

##### id

> **id**: `number`

Unique identifier for the reference

##### to

> **to**: `number`

ID of the block being referenced

##### type

> **type**: `number`

Type code for the reference

***

### ColumnPanel

Represents a panel container that arranges its children in a column.
Used for vertical panel layouts.

#### Properties

##### children

> **children**: ([`RowPanel`](#rowpanel) \| [`ViewPanel`](#viewpanel))[]

Child panels contained within this column

##### direction

> **direction**: `"column"`

Specifies that children are arranged vertically

##### id

> **id**: `string`

Unique identifier for the column panel

##### width

> **width**: `number`

Width of the column panel in pixels

***

### Command

Defines a command's properties including its label, function, and behavioral flags.

#### Extended by

- [`CommandWithPinyin`](#commandwithpinyin)

#### Properties

##### fn

> **fn**: [`CommandFn`](#commandfn-1) \| \[[`EditorCommandFn`](#editorcommandfn), [`CommandFn`](#commandfn-1)\]

The function to execute when the command is invoked, or a pair of do/undo functions

##### hasArgs?

> `optional` **hasArgs**: `boolean`

Whether the command accepts arguments

##### label

> **label**: `string`

Human-readable name for the command

##### noFocusNeeded?

> `optional` **noFocusNeeded**: `boolean`

Whether the command can be executed when no panel has focus

***

### CommandWithPinyin

Command with additional pinyin data for search functionality in non-Latin languages.

#### Extends

- [`Command`](#command)

#### Properties

##### fn

> **fn**: [`CommandFn`](#commandfn-1) \| \[[`EditorCommandFn`](#editorcommandfn), [`CommandFn`](#commandfn-1)\]

The function to execute when the command is invoked, or a pair of do/undo functions

###### Inherited from

[`Command`](#command).[`fn`](#fn)

##### hasArgs?

> `optional` **hasArgs**: `boolean`

Whether the command accepts arguments

###### Inherited from

[`Command`](#command).[`hasArgs`](#hasargs)

##### label

> **label**: `string`

Human-readable name for the command

###### Inherited from

[`Command`](#command).[`label`](#label)

##### noFocusNeeded?

> `optional` **noFocusNeeded**: `boolean`

Whether the command can be executed when no panel has focus

###### Inherited from

[`Command`](#command).[`noFocusNeeded`](#nofocusneeded)

##### pinyin

> **pinyin**: `string`

Pinyin phonetic representation for improved search in Chinese

***

### CursorData

Represents the current cursor position in the editor.
Contains both anchor (start) and focus (end) positions.

#### Properties

##### anchor

> **anchor**: [`CursorNodeData`](#cursornodedata)

Start position of the selection

##### focus

> **focus**: [`CursorNodeData`](#cursornodedata)

End position of the selection

##### isForward

> **isForward**: `boolean`

Whether the selection direction is forward (anchor comes before focus)

##### panelId

> **panelId**: `string`

ID of the panel containing the cursor

##### rootBlockId

> **rootBlockId**: `number`

ID of the root block in the editor

***

### CursorNodeData

Detailed cursor position within a specific block.

#### Properties

##### blockId

> **blockId**: `number`

ID of the block where the cursor is located

##### index

> **index**: `number`

Index within the block's content array

##### isInline

> **isInline**: `boolean`

Whether the cursor is in inline content

##### offset

> **offset**: `number`

Character offset within the content item

***

### IdContent

Simple structure containing a block ID and its content.
Used when only ID and content are needed without full block metadata.

#### Properties

##### content

> **content**: [`ContentFragment`](#contentfragment)[]

The block's content fragments, or null if no content

##### id

> **id**: `number`

The block ID

***

### Notification

Represents a notification displayed to the user.
Notifications provide feedback about operations or important information.

#### Properties

##### action()?

> `optional` **action**: () => `void` \| `Promise`\<`void`\>

Optional action callback that can be triggered from the notification

###### Returns

`void` \| `Promise`\<`void`\>

##### id

> **id**: `number`

Unique identifier for the notification

##### message

> **message**: `string`

Main message content of the notification

##### title?

> `optional` **title**: `string`

Optional title text for the notification

##### type

> **type**: `"info"` \| `"success"` \| `"warn"` \| `"error"`

Type of notification that determines its visual appearance and severity

***

### Orca

The main Orca API entry, access it with the global `orca` object.

#### Example

```ts
console.log(orca.state.locale)
```

#### Properties

##### blockMenuCommands

> **blockMenuCommands**: `object`

Block menu commands API for adding custom commands to block context menus.
This allows plugins to add custom actions that appear when users right-click on blocks' handle.

###### registerBlockMenuCommand()

> **registerBlockMenuCommand**(`id`, `command`): `void`

Registers a custom command in the block context menu.

###### Parameters

###### id

`string`

A unique identifier for the command

###### command

[`BlockMenuCommand`](#blockmenucommand)

The command configuration, including whether it works with multiple blocks
                 and a render function that returns a React element

###### Returns

`void`

###### Example

```tsx
// Command that works on a single block
orca.blockMenuCommands.registerBlockMenuCommand("myplugin.exportBlock", {
  worksOnMultipleBlocks: false,
  render: (blockId, rootBlockId, close) => (
    <orca.components.MenuText
      preIcon="ti ti-file-export"
      title="Export as JSON"
      onClick={() => {
        close()
        exportBlockAsJson(blockId)
      }}
    />
  )
})

// Command that works on multiple selected blocks
orca.blockMenuCommands.registerBlockMenuCommand("myplugin.mergeBlocks", {
  worksOnMultipleBlocks: true,
  render: (blockIds, rootBlockId, close) => (
    <orca.components.MenuText
      preIcon="ti ti-combine"
      title={`Merge ${blockIds.length} Blocks`}
      onClick={() => {
        close()
        mergeSelectedBlocks(blockIds)
      }}
    />
  )
})
```

###### unregisterBlockMenuCommand()

> **unregisterBlockMenuCommand**(`id`): `void`

Unregisters a previously registered block menu command.

###### Parameters

###### id

`string`

The identifier of the block menu command to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.blockMenuCommands.unregisterBlockMenuCommand("myplugin.exportBlock")
```

###### Example

```ts
// Register a command for single block selection
orca.blockMenuCommands.registerBlockMenuCommand("myplugin.analyzeBlock", {
  worksOnMultipleBlocks: false,
  render: (blockId, rootBlockId, close) => (
    <orca.components.MenuText
      title="Analyze Block"
      onClick={() => {
        close()
        analyzeBlockContent(blockId)
      }}
    />
  )
})
```

##### broadcasts

> **broadcasts**: `object`

Broadcasts API, used for application-wide event messaging between different windows of Orca.
This is useful for communication between different windows of the same plugin.

###### broadcast()

> **broadcast**(`type`, ...`args`): `void`

Broadcasts an event of a specific type with optional arguments to all registered handlers.

###### Parameters

###### type

`string`

The broadcast type to emit

###### args

...`any`[]

Any arguments to pass to the handlers

###### Returns

`void`

###### Example

```ts
// Simple notification
orca.broadcasts.broadcast("myplugin.processCompleted")

// With data
orca.broadcasts.broadcast("myplugin.dataFetched", {
  items: dataItems,
  timestamp: Date.now()
})
```

###### isHandlerRegistered()

> **isHandlerRegistered**(`type`): `boolean`

Checks if a handler is registered for a specific broadcast type.

###### Parameters

###### type

`string`

The broadcast type to check

###### Returns

`boolean`

True if a handler is registered, false otherwise

###### Example

```ts
if (!orca.broadcasts.isHandlerRegistered("myplugin.dataUpdated")) {
  orca.broadcasts.registerHandler("myplugin.dataUpdated", handleDataUpdate)
}
```

###### registerHandler()

> **registerHandler**(`type`, `handler`): `void`

Registers a handler function for a specific broadcast type.

###### Parameters

###### type

`string`

The broadcast type to listen for

###### handler

[`CommandFn`](#commandfn-1)

The function to execute when the broadcast is received

###### Returns

`void`

###### Example

```ts
orca.broadcasts.registerHandler("core.themeChanged", (theme) => {
  console.log("Theme changed to:", theme)
  updateUIForTheme(theme)
})
```

###### unregisterHandler()

> **unregisterHandler**(`type`, `handler`): `void`

Unregisters a previously registered handler for a specific broadcast type.

###### Parameters

###### type

`string`

The broadcast type of the handler to remove

###### handler

[`CommandFn`](#commandfn-1)

The handler function to unregister

###### Returns

`void`

###### Example

```ts
// When the component unmounts or plugin unloads
orca.broadcasts.unregisterHandler("core.themeChanged", handleThemeChange)
```

###### Example

```ts
// Register a handler for a specific broadcast type
orca.broadcasts.registerHandler("myplugin.dataUpdated", (data) => {
  console.log("Data was updated:", data)
  // Update UI or perform other actions
})

// Broadcast an event
orca.broadcasts.broadcast("myplugin.dataUpdated", { key: "value" })
```

##### commands

> **commands**: `object`

Commands API, used to register, invoke, and manage commands in Orca.
Commands are the primary way to add functionality to Orca, and can be bound to shortcuts,
toolbar buttons, slash commands, and more.

###### invokeCommand()

> **invokeCommand**(`id`, ...`args`): `Promise`\<`any`\>

Invokes a command by its ID with optional arguments.

###### Parameters

###### id

`string`

The identifier of the command to invoke

###### args

...`any`[]

Optional arguments to pass to the command

###### Returns

`Promise`\<`any`\>

A Promise that resolves to the result of the command execution

###### Example

```ts
// Invoke a command without arguments
await orca.commands.invokeCommand("myplugin.refreshData")

// Invoke a command with arguments
const result = await orca.commands.invokeCommand(
  "myplugin.searchDocuments",
  "search query",
)
```

###### invokeEditorCommand()

> **invokeEditorCommand**(`id`, `cursor`, ...`args`): `Promise`\<`any`\>

Invokes an editor command by its ID with cursor context and optional arguments.

###### Parameters

###### id

`string`

The identifier of the editor command to invoke

###### cursor

[`CursorData`](#cursordata)

The cursor data context for the command, or null

###### args

...`any`[]

Optional arguments to pass to the command

###### Returns

`Promise`\<`any`\>

A Promise that resolves to the result of the command execution

###### Example

```ts
// Invoke an editor command
await orca.commands.invokeEditorCommand(
  "core.editor.insertFragments",
  null,
  [{t: "t", v: "Text to insert"}]
)
```

###### invokeGroup()

> **invokeGroup**(`callback`, `options?`): `Promise`\<`void`\>

Executes a group of commands as a single undoable operation.
This is useful when multiple commands should be treated as a single step in the undo/redo history.

###### Parameters

###### callback

() => `Promise`\<`void`\>

An async function that will perform multiple command operations

###### options?

Optional configuration for the command group

###### topGroup?

`boolean`

Whether this is a top-level command group not nested in another group (defaults to false)

###### undoable?

`boolean`

Whether the command group should be undoable (defaults to true)

###### Returns

`Promise`\<`void`\>

###### Example

```ts
// Group multiple editor commands as one undoable operation
await orca.commands.invokeGroup(async () => {
  // Create a heading block
  const headingId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null, // If there is no reference block, this is null
    null, // Since it's null, the position parameter here is also null
    null, // No content
    { type: "heading", level: 1 }, // repr parameter, defines this as a level 1 heading
  )

  // Add a content block under the heading block
  await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    orca.state.blocks[headingId], // Reference block (heading block)
    "lastChild", // Position: as the last child of the heading block
    [{ t: "t", v: "This is the first paragraph." }], // Content
    { type: "text" } // repr parameter
  )

  // Add another content block
  await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    orca.state.blocks[headingId], // Reference block (heading block)
    "lastChild", // Position: as the last child of the heading block
    [{ t: "t", v: "This is the second paragraph." }], // Content
    { type: "text" } // repr parameter
  )
})
```

###### invokeTopEditorCommand()

> **invokeTopEditorCommand**(`id`, `cursor`, ...`args`): `Promise`\<`any`\>

Invokes an editor command (as a top command) by its ID with cursor context and optional arguments.

###### Parameters

###### id

`string`

The identifier of the editor command to invoke

###### cursor

[`CursorData`](#cursordata)

The cursor data context for the command, or null

###### args

...`any`[]

Optional arguments to pass to the command

###### Returns

`Promise`\<`any`\>

A Promise that resolves to the result of the command execution

###### Example

```ts
// Invoke an editor command
await orca.commands.invokeEditorCommand(
  "core.editor.insertFragments",
  null,
  [{t: "t", v: "Text to insert"}]
)
```

###### registerAfterCommand()

> **registerAfterCommand**(`id`, `fn`): `void`

Registers an "after command" hook to execute code after a command completes.

###### Parameters

###### id

`string`

The identifier of the command to hook into

###### fn

[`AfterHook`](#afterhook)

The function to execute after the command completes. The first
parameter is the command ID, followed by the arguments of the command
being monitored.

###### Returns

`void`

###### Example

```ts
// Log when blocks are deleted
orca.commands.registerAfterCommand(
  "core.editor.deleteBlocks",
  (cmdId, blockIds) => {
    console.log(`Deleted blocks: ${blockIds.join(", ")}`)

    // Update UI or perform additional operations
    updateBlockCountDisplay()
  }
)
```

###### registerBeforeCommand()

> **registerBeforeCommand**(`id`, `pred`): `void`

Registers a "before command" hook to conditionally prevent a command from executing.

###### Parameters

###### id

`string`

The identifier of the command to hook into

###### pred

[`BeforeHookPred`](#beforehookpred)

A predicate function that returns true if the command should proceed, false to cancel.
The first parameter is the command ID, followed by the arguments of the command being monitored.

###### Returns

`void`

###### Example

```ts
// Prevent deletion of locked blocks
orca.commands.registerBeforeCommand(
  "core.editor.deleteBlocks",
  (cmdId, blockIds) => {
    // Check if any of the blocks are locked
    const hasLockedBlock = blockIds.some(id => isBlockLocked(id))

    if (hasLockedBlock) {
      orca.notify("error", "Cannot delete locked blocks")
      return false // Prevent the command from executing
    }

    return true // Allow the command to proceed
  }
)
```

###### registerCommand()

> **registerCommand**(`id`, `fn`, `label`): `void`

Registers a new command with Orca.

###### Parameters

###### id

`string`

A unique identifier for the command

###### fn

[`CommandFn`](#commandfn-1)

The function to execute when the command is invoked

###### label

`string`

A human-readable label for the command

###### Returns

`void`

###### Example

```ts
// Register a simple command
orca.commands.registerCommand(
  "myplugin.exportAsPDF",
  async () => {
    // Command implementation
    const result = await exportCurrentDocumentAsPDF()
    orca.notify("success", "Document exported as PDF successfully")
  },
  "Export as PDF"
)
```

###### registerEditorCommand()

> **registerEditorCommand**(`id`, `doFn`, `undoFn`, `opts`): `void`

Registers an editor command that can be undone/redone in the editor.
Editor commands are automatically added to the undo/redo stack.

###### Parameters

###### id

`string`

A unique identifier for the command

###### doFn

[`EditorCommandFn`](#editorcommandfn)

The function to execute when the command is invoked

###### undoFn

[`CommandFn`](#commandfn-1)

The function to execute when the command is undone

###### opts

Options for the command including label, whether it has arguments, and if focus is needed

###### hasArgs?

`boolean`

###### label

`string`

###### noFocusNeeded?

`boolean`

###### Returns

`void`

###### Example

```ts
// Register an editor command to format text
orca.commands.registerEditorCommand(
  "myplugin.formatSelectedText",
  // Do function
  ([panelId, rootBlockId, cursor]) => {
    // Get the selected text
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return null

    // const formattedText = ...

    // Return undo arguments
    return {
      ret: formattedText,
      undoArgs: { text: formattedText }
    }
  },
  // Undo function
  (panelId, { text }) => {
    // ...
  },
  {
    label: "Format Selected Text",
    hasArgs: false
  }
)
```

###### unregisterAfterCommand()

> **unregisterAfterCommand**(`id`, `fn`): `void`

Unregisters a previously registered "after command" hook.

###### Parameters

###### id

`string`

The identifier of the command

###### fn

[`AfterHook`](#afterhook)

The function to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.commands.unregisterAfterCommand(
  "core.editor.deleteBlocks",
  myAfterDeleteHook
)
```

###### unregisterBeforeCommand()

> **unregisterBeforeCommand**(`id`, `pred`): `void`

Unregisters a previously registered "before command" hook.

###### Parameters

###### id

`string`

The identifier of the command

###### pred

[`BeforeHookPred`](#beforehookpred)

The predicate function to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.commands.unregisterBeforeCommand(
  "core.editor.deleteBlocks",
  myBeforeDeleteHook
)
```

###### unregisterCommand()

> **unregisterCommand**(`id`): `void`

Unregisters a previously registered command.

###### Parameters

###### id

`string`

The identifier of the command to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.commands.unregisterCommand("myplugin.exportAsPDF")
```

###### unregisterEditorCommand()

> **unregisterEditorCommand**(`id`): `void`

Unregisters a previously registered editor command.

###### Parameters

###### id

`string`

The identifier of the editor command to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.commands.unregisterEditorCommand("myplugin.formatSelectedText")
```

###### Example

```ts
// Register a simple command
orca.commands.registerCommand(
  "myplugin.sayHello",
  (name) => {
    orca.notify("info", `Hello, ${name || "world"}!`)
  },
  "Say Hello"
)

// Invoke a command
await orca.commands.invokeCommand("myplugin.sayHello", "User")
```

##### components

> **components**: `object`

Pre-built UI components from Orca that can be used in plugin development.
These components follow Orca's design system and provide consistent UI patterns.

###### AliasEditor()

> **AliasEditor**: (`props`) => `Element`

Provides an editor interface for managing aliases/tags, including adding/removing aliases,
formatting options, template selection, and inclusion relationships.

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"` \| `"center"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Edit aliases for a block
<orca.components.AliasEditor
  blockId={123}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Edit Alias
    </orca.components.Button>
  )}
</orca.components.AliasEditor>

// With custom container
<orca.components.AliasEditor
  blockId={456}
  container={containerRef}
>
  {(open) => (
    <span onClick={open}>Configure Tag Settings</span>
  )}
</orca.components.AliasEditor>
```

###### Block()

> **Block**: (`props`) => `Element`

Renders a block with all its content and children

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Render a regular block
<orca.components.Block
  panelId="main-panel"
  blockId={123}
  blockLevel={0}
  indentLevel={0}
/>
```

###### BlockBreadcrumb()

> **BlockBreadcrumb**: (`props`) => `Element`

Renders a breadcrumb trail for a block's ancestors

###### Parameters

###### props

###### blockId

`number`

###### className?

`string`

###### style?

`CSSProperties`

###### Returns

`Element`

###### Example

```tsx
// Basic usage
<orca.components.BlockBreadcrumb blockId={123} />

// With custom styles
<orca.components.BlockBreadcrumb
  blockId={456}
  className="custom-breadcrumb"
  style={{ marginBottom: '10px' }}
/>
```

###### BlockChildren()

> **BlockChildren**: (`props`) => `Element`

Renders a block's children

###### Parameters

###### props

###### block

[`Block`](#block)

###### blockLevel

`number`

###### indentLevel

`number`

###### panelId

`string`

###### renderingMode?

[`BlockRenderingMode`](#blockrenderingmode)

###### Returns

`Element`

###### Example

```tsx
// Standard usage
<orca.components.BlockChildren
  block={blockObject}
  panelId="main-panel"
  blockLevel={1}
  indentLevel={1}
/>

// Using simplified rendering mode
<orca.components.BlockChildren
  block={blockObject}
  panelId="panel-2"
  blockLevel={2}
  indentLevel={3}
  renderingMode="simple"
/>
```

###### BlockPreviewPopup()

> **BlockPreviewPopup**: (`props`) => `Element`

Displays a block preview in a popup on hover

When hovering over the child element, a popup appears showing a preview of the referenced block.
The preview can be made interactive by pressing the configured keyboard shortcut,
allowing users to edit the block content directly in the preview.

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic block preview on link hover
<BlockPreviewPopup blockId={123}>
  <a href="#block-123">Block Reference</a>
</BlockPreviewPopup>

// With custom delay and event handlers
<BlockPreviewPopup
  blockId={456}
  delay={500}
  onClose={() => console.log("Preview closed")}
  className="custom-preview"
>
  <span>Hover me for block preview</span>
</BlockPreviewPopup>

// Programmatically controlled visibility
<BlockPreviewPopup
  blockId={789}
  visible={isPreviewOpen}
  onClosed={() => setPreviewOpen(false)}
>
  <button>Show Preview</button>
</BlockPreviewPopup>
```

###### BlockSelect()

> **BlockSelect**: (`props`) => `Element`

Provides block selection functionality

###### Parameters

###### props

`object` & `Omit`\<`SelectProps`, `"options"` \| `"selected"` \| `"filter"` \| `"filterPlaceholder"` \| `"filterFunction"` \| `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Block selection
<orca.components.BlockSelect
  mode="block"
  selected={[123, 456]}
  onChange={async (selected) => {
    console.log("Selected blocks:", selected);
  }}
/>

// Reference selection with scope restriction
<orca.components.BlockSelect
  mode="ref"
  scope="project-blocks"
  selected={[789]}
  onChange={handleSelectionChange}
/>
```

###### BlockShell()

> **BlockShell**: (`props`) => `Element`

Core component for block rendering with common UI elements

###### Parameters

###### props

###### blockId

`number`

###### blockLevel

`number`

###### childrenJsx

`ReactNode`

###### contentAttrs?

`Record`\<`string`, `any`\>

###### contentClassName?

`string`

###### contentJsx

`ReactNode`

###### contentStyle?

`CSSProperties`

###### contentTag?

`any`

###### droppable?

`boolean`

###### indentLevel

`number`

###### initiallyCollapsed?

`boolean`

###### mirrorId?

`number`

###### panelId

`string`

###### renderingMode?

[`BlockRenderingMode`](#blockrenderingmode)

###### reprAttrs?

`Record`\<`string`, `any`\>

###### reprClassName

`string`

###### rndId

`string`

###### Returns

`Element`

###### Example

```tsx
// Basic text block
<orca.components.BlockShell
  panelId="main-panel"
  blockId={123}
  rndId="unique-rand-id"
  blockLevel={0}
  indentLevel={0}
  reprClassName="orca-repr-text"
  contentJsx={<div>This is text content</div>}
  childrenJsx={<ChildrenComponent />}
/>

// Code block example
<orca.components.BlockShell
  panelId="code-panel"
  blockId={456}
  rndId="code-rand-id"
  blockLevel={1}
  indentLevel={2}
  reprClassName="orca-repr-code"
  contentClassName="orca-repr-code-content"
  contentAttrs={{ contentEditable: false }}
  contentJsx={<CodeEditor />}
  childrenJsx={childrenBlocks}
/>
```

###### Breadcrumb()

> **Breadcrumb**: (`props`) => `Element`

Renders a generic breadcrumb navigation

###### Parameters

###### props

###### className?

`string`

###### items

`ReactNode`[]

###### style?

`CSSProperties`

###### Returns

`Element`

###### Example

```tsx
// Simple breadcrumb
<orca.components.Breadcrumb
  items={["Home", "Projects", "Document"]}
/>

// Breadcrumb with links and icons
<orca.components.Breadcrumb
  items={[
    <a href="#home">Home <i className="ti ti-home" /></a>,
    <a href="#projects">Projects</a>,
    "Current Document"
  ]}
  className="custom-breadcrumb"
/>
```

###### Button()

> **Button**: (`props`) => `Element`

Standard button component with multiple variants

###### Parameters

###### props

`HTMLAttributes`\<`HTMLButtonElement`\> & `object`

###### Returns

`Element`

###### Example

```tsx
// Basic button
<orca.components.Button variant="solid" onClick={handleClick}>
  Save
</orca.components.Button>

// Dangerous action button
<orca.components.Button variant="dangerous" onClick={handleDelete}>
  <i className="ti ti-trash" /> Delete
</orca.components.Button>

// Outline button with disabled state
<orca.components.Button variant="outline" disabled={true}>
  Edit
</orca.components.Button>

// Simple icon button
<orca.components.Button variant="plain" onClick={handleRefresh}>
  <i className="ti ti-refresh" />
</orca.components.Button>
```

###### Checkbox()

> **Checkbox**: (`props`) => `Element`

Checkbox form element

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLSpanElement`\>, `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic checkbox
<orca.components.Checkbox
  checked={isChecked}
  onChange={({ checked }) => setIsChecked(checked)}
/>

// Disabled checkbox
<orca.components.Checkbox checked={true} disabled={true} />

// Indeterminate state checkbox
<orca.components.Checkbox
  indeterminate={true}
  onChange={handleSelectionChange}
/>
```

###### CompositionInput()

> **CompositionInput**: (`props`) => `Element`

Input that handles IME composition events properly

###### Parameters

###### props

`HTMLAttributes`\<`HTMLInputElement`\> & `object`

###### Returns

`Element`

###### Example

```tsx
// Basic input
<orca.components.CompositionInput
  placeholder="Enter text"
  value={inputValue}
  onChange={(e) => setInputValue(e.target.value)}
/>

// Input with prefix and suffix
<orca.components.CompositionInput
  pre={<i className="ti ti-search" />}
  post={<Button onClick={clearInput}>Clear</Button>}
  placeholder="Search..."
/>

// Input with validation error
<orca.components.CompositionInput
  value={email}
  onChange={handleEmailChange}
  error={emailError ? <span className="error">{emailError}</span> : null}
/>
```

###### CompositionTextArea()

> **CompositionTextArea**: (`props`) => `Element`

Textarea that handles IME composition events properly

###### Parameters

###### props

`HTMLAttributes`\<`HTMLTextAreaElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic multiline text input
<orca.components.CompositionTextArea
  placeholder="Enter multiline text"
  value={textValue}
  onChange={(e) => setTextValue(e.target.value)}
/>

// Set rows and auto-grow
<orca.components.CompositionTextArea
  rows={5}
  style={{ minHeight: '100px' }}
  placeholder="Enter notes..."
/>
```

###### ConfirmBox()

> **ConfirmBox**: (`props`) => `Element`

Displays a confirmation dialog

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"` \| `"center"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic confirmation dialog
<orca.components.ConfirmBox
  text="Are you sure you want to delete this item?"
  onConfirm={(e, close) => {
    deleteItem();
    close();
  }}
>
  {(open) => (
    <orca.components.Button variant="dangerous" onClick={open}>
      Delete
    </orca.components.Button>
  )}
</orca.components.ConfirmBox>

// Confirmation dialog with state
<orca.components.ConfirmBox
  text="Are you sure you want to move this block?"
  onConfirm={(e, close, state) => {
    moveBlock(state.blockId, state.destination);
    close();
  }}
>
  {(open) => (
    <orca.components.Button
      variant="soft"
      onClick={(e) => open(e, { blockId: 123, destination: 'section-1' })}
    >
      Move
    </orca.components.Button>
  )}
</orca.components.ConfirmBox>
```

###### ContextMenu()

> **ContextMenu**: (`props`) => `Element`

Creates a context menu attached to an element

###### Parameters

###### props

###### alignment?

`"top"` \| `"bottom"` \| `"left"` \| `"right"` \| `"center"`

###### allowBeyondContainer?

`boolean`

###### children

(`openMenu`, `closeMenu`) => `ReactNode`

###### className?

`string`

###### container?

`RefObject`\<`HTMLElement`\>

###### crossOffset?

`number`

###### defaultPlacement?

`"top"` \| `"bottom"` \| `"left"` \| `"right"`

###### escapeToClose?

`boolean`

###### keyboardNav?

`boolean`

###### menu

(`close`, `state?`) => `ReactNode`

###### menuAttr?

`Record`\<`string`, `any`\>

###### navDirection?

`"vertical"` \| `"both"`

###### noPointerLogic?

`boolean`

###### offset?

`number`

###### onClosed?

() => `void`

###### onOpened?

() => `void`

###### placement?

`"vertical"` \| `"horizontal"`

###### style?

`CSSProperties`

###### Returns

`Element`

###### Example

```tsx
// Basic context menu
<orca.components.ContextMenu
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText
        title="Edit"
        onClick={() => { editItem(); close(); }}
      />
      <orca.components.MenuText
        title="Delete"
        dangerous={true}
        onClick={() => { deleteItem(); close(); }}
      />
    </orca.components.Menu>
  )}
>
  {(open) => (
    <div onContextMenu={open}>Right-click here to show the menu</div>
  )}
</orca.components.ContextMenu>

// Custom position and alignment menu
<orca.components.ContextMenu
  placement="horizontal"
  alignment="top"
  defaultPlacement="right"
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText title="Option 1" onClick={close} />
      <orca.components.MenuText title="Option 2" onClick={close} />
    </orca.components.Menu>
  )}
>
  {(open) => (
    <orca.components.Button variant="soft" onClick={open}>
      Show Menu
    </orca.components.Button>
  )}
</orca.components.ContextMenu>
```

###### DatePicker()

> **DatePicker**: (`props`) => `Element`

Calendar date picker

###### Parameters

###### props

###### alignment?

`"left"` \| `"right"` \| `"center"`

###### className?

`string`

###### menuContainer?

`RefObject`\<`HTMLElement`\>

###### mode?

`"date"` \| `"time"` \| `"datetime"`

###### onChange

(`v`) => `void` \| `Promise`\<`void`\>

###### onClose?

() => `void` \| `Promise`\<`void`\>

###### onClosed?

() => `void` \| `Promise`\<`void`\>

###### range?

`boolean`

###### rect?

`DOMRect`

###### refElement?

`RefObject`\<`HTMLElement`\>

###### style?

`CSSProperties`

###### value

`Date` \| \[`Date`, `Date`\]

###### visible?

`boolean`

###### Returns

`Element`

###### Example

```tsx
// Basic date picker
const [date, setDate] = useState(new Date());
<orca.components.DatePicker
  value={date}
  onChange={(newDate) => setDate(newDate)}
/>

// Date-time picker
<orca.components.DatePicker
  mode="datetime"
  value={dateTime}
  onChange={handleDateTimeChange}
/>

// Date range picker
const [dateRange, setDateRange] = useState([new Date(), new Date(Date.now() + 86400000)]);
<orca.components.DatePicker
  range={true}
  value={dateRange}
  onChange={(newRange) => setDateRange(newRange)}
/>
```

###### HoverContextMenu()

> **HoverContextMenu**: (`props`) => `Element`

Context menu that appears on hover

###### Parameters

###### props

`object` & `Omit`\<`ContextMenuProps`, `"children"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic hover menu
<orca.components.HoverContextMenu
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText
        title="View"
        preIcon="ti ti-eye"
        onClick={close}
      />
      <orca.components.MenuText
        title="Edit"
        preIcon="ti ti-pencil"
        onClick={close}
      />
    </orca.components.Menu>
  )}
>
  <div className="hoverable-element">Hover to show menu</div>
</orca.components.HoverContextMenu>

// Custom positioned hover menu
<orca.components.HoverContextMenu
  placement="horizontal"
  defaultPlacement="right"
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText
        title="View Details"
        preIcon="ti ti-info-circle"
        onClick={() => { viewDetails(); close(); }}
      />
    </orca.components.Menu>
  )}
>
  <i className="ti ti-info-circle" />
</orca.components.HoverContextMenu>
```

###### Image()

> **Image**: (`props`) => `Element`

Image component with loading states

###### Parameters

###### props

`HTMLAttributes`\<`HTMLImageElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic image
<orca.components.Image
  src="/path/to/image.jpg"
  alt="Description"
/>

// Styled image
<orca.components.Image
  src="/path/to/image.png"
  alt="Logo"
  className="profile-image"
  style={{ width: 100, height: 100, borderRadius: '50%' }}
/>

// Handle loading events
<orca.components.Image
  src="/path/to/large-image.jpg"
  alt="Large Image"
  onLoad={() => setImageLoaded(true)}
  onError={() => handleImageError()}
/>
```

###### Input()

> **Input**: (`props`) => `Element`

Standard text input component

###### Parameters

###### props

`HTMLAttributes`\<`HTMLInputElement`\> & `object`

###### Returns

`Element`

###### Example

```tsx
// Basic input field
<orca.components.Input
  placeholder="Enter text"
  value={inputValue}
  onChange={(e) => setInputValue(e.target.value)}
/>

// Input field with prefix and suffix
<orca.components.Input
  pre={<i className="ti ti-user" />}
  post={<orca.components.Button variant="plain">Clear</orca.components.Button>}
  placeholder="Username"
/>

// Input field with error message
<orca.components.Input
  value={email}
  onChange={handleEmailChange}
  error={emailError ? "Please enter a valid email address" : undefined}
/>
```

###### InputBox()

> **InputBox**: (`props`) => `Element`

Input dialog with label and actions

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"` \| `"center"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic input dialog
<orca.components.InputBox
  label="Enter name"
  defaultValue="Default value"
  onConfirm={(value, e, close) => {
    if (value) {
      saveName(value);
      close();
    }
  }}
>
  {(open) => (
    <orca.components.Button variant="soft" onClick={open}>
      Edit Name
    </orca.components.Button>
  )}
</orca.components.InputBox>

// Input dialog with validation
<orca.components.InputBox
  label="Enter URL"
  error={urlError}
  onConfirm={(url, e, close) => {
    if (isValidUrl(url)) {
      addUrl(url);
      close();
    } else {
      setUrlError("Please enter a valid URL");
    }
  }}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Add Link
    </orca.components.Button>
  )}
</orca.components.InputBox>
```

###### LoadMore()

> **LoadMore**: (`props`) => `Element`

Component for loading more items in paginated lists

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic Load More component
<orca.components.LoadMore
  onLoadMore={async () => {
    await fetchMoreItems();
  }}
/>

// Custom message and debounce time
<orca.components.LoadMore
  message="Loading more results..."
  debounceTime={500}
  onLoadMore={loadMoreResults}
  className="custom-load-more"
/>
```

###### MemoizedViews()

> **MemoizedViews**: (`props`) => `Element`

Efficient view container for switching between components

###### Parameters

###### props

###### active

`string`

###### className?

`string`

###### name

`string`

###### orientation?

`"vertical"` \| `"horizontal"`

###### style?

`CSSProperties`

###### views

\{\[`key`: `string`\]: `ReactElement`\<`any`, `string` \| `JSXElementConstructor`\<`any`\>\>; \}

###### Returns

`Element`

###### Example

```tsx
// Basic view switching container
<orca.components.MemoizedViews
  name="main-views"
  active="details"
  views={{
    "list": <ListView items={items} />,
    "details": <DetailsView itemId={123} />,
    "settings": <SettingsView />
  }}
/>

// Horizontally arranged views
<orca.components.MemoizedViews
  name="side-views"
  active={currentTab}
  orientation="horizontal"
  className="side-panel"
  views={{
    "info": <InfoPanel />,
    "history": <HistoryPanel />,
    "comments": <CommentsPanel />
  }}
/>
```

###### Menu()

> **Menu**: (`props`) => `Element`

Standard menu container

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic menu
<orca.components.Menu>
  <orca.components.MenuText title="Option 1" onClick={() => handleOption(1)} />
  <orca.components.MenuText title="Option 2" onClick={() => handleOption(2)} />
  <orca.components.MenuSeparator />
  <orca.components.MenuText
    title="Exit"
    dangerous={true}
    onClick={() => handleExit(0)}
  />
</orca.components.Menu>

// Menu with keyboard navigation enabled
<orca.components.Menu
  keyboardNav={true}
  navDirection="both"
  onKeyboardNav={(el) => scrollToElement(el)}
  className="keyboard-nav-menu"
>
  <orca.components.MenuTitle title="Actions" />
  <orca.components.MenuText title="Edit" onClick={() => handleEdit(123)} />
  <orca.components.MenuText title="Copy" onClick={() => handleCopy(456)} />
  <orca.components.MenuText title="Delete" onClick={() => handleDelete(789)} />
</orca.components.Menu>
```

###### MenuItem()

> **MenuItem**: (`props`) => `Element`

Menu item component

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic menu item
<orca.components.MenuItem
  jsx={<div>Option 1</div>}
  onClick={() => handleOption(1)}
/>

// Menu item with nested content
<orca.components.MenuItem
  jsx={<div className="menu-item-header">Display Settings</div>}
  onClick={() => handleSettingsClick(123)}
>
  <div className="submenu">
    <div>Theme: {currentTheme}</div>
    <div>Font Size: {fontSize}</div>
  </div>
</orca.components.MenuItem>

// Menu item with custom styles
<orca.components.MenuItem
  jsx={<div className="icon-item"><i className="ti ti-user"/> User</div>}
  className="highlighted-item"
  style={{ fontWeight: 'bold' }}
  onClick={() => handleUserClick(456)}
/>
```

###### MenuSeparator()

> **MenuSeparator**: (`props`) => `Element`

Visual separator for menus

###### Parameters

###### props

###### Returns

`Element`

###### Example

```tsx
// Add a separator between menu items
<orca.components.Menu>
  <orca.components.MenuText title="Edit" onClick={() => handleEdit(123)} />
  <orca.components.MenuText title="Copy" onClick={() => handleCopy(456)} />
  <orca.components.MenuSeparator />
  <orca.components.MenuText
    title="Delete"
    dangerous={true}
    onClick={() => handleDelete(789)}
  />
</orca.components.Menu>
```

###### MenuText()

> **MenuText**: (`props`) => `Element`

Text-based menu item

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLDivElement`\>, `"contextMenu"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic text menu item
<orca.components.MenuText
  title="Save Document"
  onClick={handleSave}
/>

// Menu item with icon and shortcut
<orca.components.MenuText
  title="Copy"
  preIcon="ti ti-copy"
  shortcut="⌘C"
  onClick={handleCopy}
/>

// Menu item with subtitle
<orca.components.MenuText
  title="Export as PDF"
  subtitle="Export the current document as a PDF file"
  preIcon="ti ti-file-export"
  onClick={handleExport}
/>

// Disabled menu item
<orca.components.MenuText
  title="Delete"
  preIcon="ti ti-trash"
  dangerous={true}
  disabled={!hasSelection}
  onClick={handleDelete}
/>

// Menu item with context menu
<orca.components.MenuText
  title="Share"
  preIcon="ti ti-share"
  contextMenu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText title="Copy Link" onClick={() => { copyLink(); close(); }} />
      <orca.components.MenuText title="Send Email" onClick={() => { sendEmail(); close(); }} />
    </orca.components.Menu>
  )}
/>
```

###### MenuTitle()

> **MenuTitle**: (`props`) => `Element`

Menu section title

###### Parameters

###### props

###### className?

`string`

###### info?

`ReactNode`

###### style?

`CSSProperties`

###### title

`string`

###### Returns

`Element`

###### Example

```tsx
// Basic menu title
<orca.components.Menu>
  <orca.components.MenuTitle title="File Operations" />
  <orca.components.MenuText title="New" onClick={handleNew} />
  <orca.components.MenuText title="Open" onClick={handleOpen} />
  <orca.components.MenuSeparator />
  <orca.components.MenuTitle title="Edit Operations" />
  <orca.components.MenuText title="Copy" onClick={handleCopy} />
  <orca.components.MenuText title="Paste" onClick={handlePaste} />
</orca.components.Menu>

// Menu title with additional info
<orca.components.Menu>
  <orca.components.MenuTitle
    title="Recent Documents"
    info={<span className="count">{recentDocs.length}</span>}
  />
  {recentDocs.map(doc => (
    <orca.components.MenuText
      key={doc.id}
      title={doc.name}
      onClick={() => openDoc(doc.id)}
    />
  ))}
</orca.components.Menu>
```

###### ModalOverlay()

> **ModalOverlay**: (`props`) => `Element`

Full-screen modal overlay

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic modal
const [isVisible, setIsVisible] = useState(false);
<orca.components.Button onClick={() => setIsVisible(true)}>
  Open Modal
</orca.components.Button>

<orca.components.ModalOverlay
  visible={isVisible}
  canClose={true}
  onClose={() => setIsVisible(false)}
>
  <div className="modal-content">
    <h2>Modal Title</h2>
    <p>This is the content of the modal...</p>
    <orca.components.Button onClick={() => setIsVisible(false)}>
      Close
    </orca.components.Button>
  </div>
</orca.components.ModalOverlay>

// Modal with blur effect
<orca.components.ModalOverlay
  visible={isImportant}
  blurred={true}
  canClose={false}
  className="important-modal"
>
  <div className="confirmation-dialog">
    <h3>Important Action Confirmation</h3>
    <p>Are you sure you want to proceed? This action cannot be undone.</p>
    <div className="actions">
      <orca.components.Button variant="outline" onClick={handleCancel}>
        Cancel
      </orca.components.Button>
      <orca.components.Button variant="dangerous" onClick={handleConfirm}>
        Confirm
      </orca.components.Button>
    </div>
  </div>
</orca.components.ModalOverlay>
```

###### Popup()

> **Popup**: (`props`) => `Element`

Popup panel attached to an element.

The popup is positioned automatically relative to a target `refElement` (or explicit
`rect`) and can be constrained by an optional `boundary` element. You can also provide
`relativePosition` to explicitly set `top/left/bottom/right` CSS strings. The popup
supports vertical and horizontal placement, alignment, offsets, and boundary
adjustments (via `boundary*Offset` props). When `replacement` is enabled (default),
the popup observes size changes and updates placement automatically.

Default values: `placement: "vertical"`, `defaultPlacement: "bottom"`,
`alignment: "center"`, `offset: 4`, `crossOffset: 0`, `replacement: true`.

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic popup panel
const [isVisible, setIsVisible] = useState(false);
const buttonRef = useRef(null);

<orca.components.Button
  ref={buttonRef}
  onClick={() => setIsVisible(true)}
>
  Show Popup
</orca.components.Button>

<orca.components.Popup
  refElement={buttonRef}
  visible={isVisible}
  onClose={() => setIsVisible(false)}
>
  <div className="popup-content">
    <p>This is the popup content</p>
  </div>
</orca.components.Popup>

// Custom positioned and aligned popup panel
<orca.components.Popup
  refElement={anchorRef}
  visible={showPopup}
  placement="horizontal"
  defaultPlacement="right"
  alignment="center"
  offset={10}
  onClose={closePopup}
  className="custom-popup"
>
  <div className="info-card">
    <h3>Details</h3>
    <p>Here is more detailed content...</p>
  </div>
</orca.components.Popup>
```

###### Segmented()

> **Segmented**: (`props`) => `Element`

Segmented control for selecting from options

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLDivElement`\>, `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic segmented control
const [selected, setSelected] = useState("list");
<orca.components.Segmented
  selected={selected}
  options={[
    { value: "list", label: "List" },
    { value: "grid", label: "Grid" },
    { value: "table", label: "Table" }
  ]}
  onChange={(value) => setSelected(value)}
/>

// Segmented control with custom JSX
<orca.components.Segmented
  selected={viewMode}
  options={[
    { value: "day", jsx: <i className="ti ti-calendar-day" /> },
    { value: "week", jsx: <i className="ti ti-calendar-week" /> },
    { value: "month", jsx: <i className="ti ti-calendar-month" /> }
  ]}
  onChange={setViewMode}
  className="calendar-mode-selector"
/>
```

###### Select()

> **Select**: (`props`) => `Element`

Dropdown select component

###### Parameters

###### props

###### alignment?

`"left"` \| `"right"` \| `"center"`

###### buttonClassName?

`string`

###### disabled?

`boolean`

###### filter?

`boolean`

###### filterFunction?

(`keyword`) => `Promise`\<`object`[]\>

###### filterPlaceholder?

`string`

###### menuClassName?

`string`

###### menuContainer?

`RefObject`\<`HTMLElement`\>

###### multiSelection?

`boolean`

###### onChange?

(`selected`, `filterKeyword?`) => `void` \| `Promise`\<`void`\>

###### onMouseEnter?

(`e`) => `void`

###### onMouseLeave?

(`e`) => `void`

###### options

`object`[]

###### placeholder?

`string`

###### pre?

`ReactElement`

###### readOnly?

`boolean`

###### selected

`string`[]

###### width?

`string` \| `number`

###### withClear?

`boolean`

###### Returns

`Element`

###### Example

```tsx
// Basic dropdown selector
const [selected, setSelected] = useState(["option1"]);
<orca.components.Select
  selected={selected}
  options={[
    { value: "option1", label: "Option 1" },
    { value: "option2", label: "Option 2" },
    { value: "option3", label: "Option 3" }
  ]}
  onChange={(newSelected) => setSelected(newSelected)}
/>

// Multi-select dropdown with filtering
<orca.components.Select
  selected={selectedTags}
  options={availableTags}
  multiSelection={true}
  filter={true}
  filterPlaceholder="Search tags..."
  placeholder="Select tags"
  onChange={handleTagsChange}
/>

// Grouped dropdown selector
<orca.components.Select
  selected={[selectedLanguage]}
  options={[
    { value: "js", label: "JavaScript", group: "Frontend" },
    { value: "ts", label: "TypeScript", group: "Frontend" },
    { value: "py", label: "Python", group: "Backend" },
    { value: "go", label: "Golang", group: "Backend" }
  ]}
  pre={<i className="ti ti-code" />}
  alignment="left"
  width="200px"
  onChange={(selected) => setSelectedLanguage(selected[0])}
/>
```

###### Skeleton()

> **Skeleton**: (`props`) => `Element`

Loading placeholder

###### Parameters

###### props

###### Returns

`Element`

###### Example

```tsx
// Basic loading placeholder
<div className="loading-container">
  <orca.components.Skeleton />
</div>

// Layout during content loading
<div className="content-card">
  <div className="header">
    {isLoading ? <orca.components.Skeleton /> : <h2>{title}</h2>}
  </div>
  <div className="body">
    {isLoading ? (
      <>
        <orca.components.Skeleton />
        <orca.components.Skeleton />
        <orca.components.Skeleton />
      </>
    ) : (
      <p>{content}</p>
    )}
  </div>
</div>
```

###### Switch()

> **Switch**: (`props`) => `Element`

Toggle switch component

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLButtonElement`\>, `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic switch
const [isOn, setIsOn] = useState(false);
<orca.components.Switch
  on={isOn}
  onChange={(newValue) => setIsOn(newValue)}
/>

// Read-only switch
<orca.components.Switch
  on={featureEnabled}
  readonly={true}
/>

// Unset state switch
<orca.components.Switch
  unset={true}
  onChange={handleInheritedSetting}
/>

// Switch with label
<div className="setting-row">
  <label>Enable Notifications</label>
  <orca.components.Switch
    on={notificationsEnabled}
    onChange={toggleNotifications}
  />
</div>
```

###### Table()

> **Table**: (`props`) => `Element`

Data table component

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic data table
<orca.components.Table
  columns={[
    { name: "Name", icon: "ti ti-file" },
    { name: "Size", icon: "ti ti-ruler" },
    { name: "Modified Date", icon: "ti ti-calendar" }
  ]}
  items={files}
  initialColumnSizes="2fr 1fr 1fr"
  rowRenderer={(item, className, index) => (
    <tr key={item.id} className={className}>
      <td>{item.name}</td>
      <td>{item.size}</td>
      <td>{item.modifiedDate}</td>
    </tr>
  )}
/>

// Table with pinned column and resizable columns
<orca.components.Table
  columns={[
    { name: "ID" },
    { name: "Product Name" },
    { name: "Price" },
    { name: "Stock" }
  ]}
  items={products}
  initialColumnSizes="80px 2fr 1fr 1fr"
  pinColumn={true}
  onColumnResize={handleColumnResize}
  className="products-table"
  rowRenderer={(product, className, index) => (
    <tr key={product.id} className={className} onClick={() => selectProduct(product.id)}>
      <td>{product.id}</td>
      <td>{product.name}</td>
      <td>{formatCurrency(product.price)}</td>
      <td>{product.stock}</td>
    </tr>
  )}
/>
```

###### TagPopup()

> **TagPopup**: (`props`) => `Element`

Provides a popup menu for tag selection and creation.
Allows users to search, select existing tags, or create new ones.

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"` \| `"center"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic usage
<orca.components.TagPopup
  blockId={123}
  closeMenu={() => setMenuVisible(false)}
  onTagClick={(tag) => console.log(`Selected tag: ${tag}`)}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Add Tag
    </orca.components.Button>
  )}
</orca.components.TagPopup>

// Custom placeholder text
<orca.components.TagPopup
  blockId={456}
  closeMenu={handleClose}
  onTagClick={handleTagSelect}
  placeholder="Search or create a new tag..."
  container={containerRef}
>
  {(open) => (
    <span onClick={open}>Manage Tags</span>
  )}
</orca.components.TagPopup>
```

###### TagPropsEditor()

> **TagPropsEditor**: (`props`) => `Element`

Provides an editor interface for managing and configuring tag properties.
Allows users to add, edit, and delete tag properties, set property types and values.

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"` \| `"center"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"top"` \| `"bottom"` \| `"left"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic usage
<orca.components.TagPropsEditor
  blockId={123}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Edit Tag Properties
    </orca.components.Button>
  )}
</orca.components.TagPropsEditor>

// With custom container
<orca.components.TagPropsEditor
  blockId={456}
  container={containerRef}
>
  {(open) => (
    <span onClick={open}>Configure Properties</span>
  )}
</orca.components.TagPropsEditor>

// Combined with other components
<div className="tag-controls">
  <orca.components.TagPropsEditor blockId={789}>
    {(open) => (
      <orca.components.Button
        variant="plain"
        onClick={open}
        className="property-button"
      >
        <i className="ti ti-settings" />
      </orca.components.Button>
    )}
  </orca.components.TagPropsEditor>
</div>
```

###### Tooltip()

> **Tooltip**: (`props`) => `Element`

Tooltip component

###### Parameters

###### props

###### alignment?

`"top"` \| `"bottom"` \| `"left"` \| `"right"` \| `"center"`

###### allowBeyondContainer?

`boolean`

###### children

`ReactElement`

###### defaultPlacement?

`"top"` \| `"bottom"` \| `"left"` \| `"right"`

###### delay?

`number`

###### image?

`string`

###### modifier?

`"shift"` \| `"ctrl"` \| `"alt"` \| `"meta"`

###### placement?

`"vertical"` \| `"horizontal"`

###### shortcut?

`string`

###### text

`ReactNode`

###### Returns

`Element`

###### Example

```tsx
// Basic text tooltip
<orca.components.Tooltip text="Delete this item">
  <button><i className="ti ti-trash" /></button>
</orca.components.Tooltip>

// Tooltip with shortcut
<orca.components.Tooltip
  text="Save document"
  shortcut="⌘S"
  defaultPlacement="bottom"
>
  <orca.components.Button variant="solid">
    <i className="ti ti-device-floppy" />
  </orca.components.Button>
</orca.components.Tooltip>

// Tooltip with image preview
<orca.components.Tooltip
  text="View original image"
  image="/path/to/preview.jpg"
  placement="horizontal"
  alignment="top"
  delay={500}
>
  <div className="thumbnail">
    <img src="/path/to/thumbnail.jpg" alt="Thumbnail" />
  </div>
</orca.components.Tooltip>
```

###### Example

```tsx
import * as React from "react"

function MyPluginUI() {
  const Button = orca.components.Button
  return (
    <Button
      variant="solid"
      onClick={() => console.log("Clicked!")}>
      Click Me
    </Button>
  )
}
```

##### converters

> **converters**: `object`

Content converter API, used to register converters for transforming blocks and inline content
between different formats (e.g., HTML, plain text, Markdown).

###### blockConvert()

> **blockConvert**(`format`, `blockContent`, `repr`, `block?`, `forExport?`, `context?`): `Promise`\<`string`\>

Converts a block to a specific format.
This is typically used internally by the system when exporting content.

###### Parameters

###### format

`string`

The target format to convert to

###### blockContent

[`BlockForConversion`](#blockforconversion)

The block content to convert

###### repr

[`Repr`](#repr)

The block representation object

###### block?

[`Block`](#block)

Optional full block data

###### forExport?

`boolean`

Whether the conversion is for export purposes

###### context?

[`ConvertContext`](#convertcontext)

Optional conversion context with export scope information

###### Returns

`Promise`\<`string`\>

A Promise that resolves to the converted string

###### Example

```ts
const htmlContent = await orca.converters.blockConvert(
  "html",
  blockContent,
  { type: "myplugin.customBlock", data: { key: "value" } },
  block,
  true,
  { exportRootId: block.id }
)
```

###### inlineConvert()

> **inlineConvert**(`format`, `type`, `content`, `forExport?`): `Promise`\<`string`\>

Converts an inline content fragment to a specific format.
This is typically used internally by the system when exporting content.

###### Parameters

###### format

`string`

The target format to convert to

###### type

`string`

The type of the inline content

###### content

[`ContentFragment`](#contentfragment)

The inline content fragment to convert

###### forExport?

`boolean`

###### Returns

`Promise`\<`string`\>

A Promise that resolves to the converted string

###### Example

```ts
const markdownText = await orca.converters.inlineConvert(
  "markdown",
  "myplugin.highlight",
  { t: "myplugin.highlight", v: "Important note" }
)
```

###### registerBlock()

> **registerBlock**(`format`, `type`, `fn`): `void`

Registers a block converter for transforming a block type to a specific format.

###### Parameters

###### format

`string`

The target format (e.g., "plain", "html", "markdown")

###### type

`string`

The block type to convert from

###### fn

(`blockContent`, `repr`, `block?`, `forExport?`, `context?`) => `string` \| `Promise`\<`string`\>

Conversion function that transforms block content to the target format

###### Returns

`void`

###### Example

```ts
// Convert a countdown block to HTML
orca.converters.registerBlock(
  "html",
  "myplugin.countdown",
  (blockContent, repr, block, forExport, context) => {
    const date = new Date(repr.date)
    return `<div class="countdown" data-date="${date.toISOString()}">
      <span class="label">${repr.label}</span>
      <span class="date">${date.toLocaleDateString()}</span>
    </div>`
  }
)
```

###### registerInline()

> **registerInline**(`format`, `type`, `fn`): `void`

Registers an inline content converter for transforming inline content to a specific format.

###### Parameters

###### format

`string`

The target format (e.g., "plain", "html", "markdown")

###### type

`string`

The inline content type to convert from

###### fn

(`content`, `forExport?`) => `string` \| `Promise`\<`string`\>

Conversion function that transforms inline content to the target format

###### Returns

`void`

###### Example

```ts
// Convert a custom highlight inline content to Markdown
orca.converters.registerInline(
  "markdown",
  "myplugin.highlight",
  (content) => {
    return `==${content.v}==`
  }
)

// Convert a user mention to HTML
orca.converters.registerInline(
  "html",
  "myplugin.userMention",
  (content) => {
    return `<span class="user-mention" data-user-id="${content.id}">@${content.v}</span>`
  }
)
```

###### unregisterBlock()

> **unregisterBlock**(`format`, `type`): `void`

Unregisters a block converter.

###### Parameters

###### format

`string`

The target format the converter was registered for

###### type

`string`

The block type the converter was registered for

###### Returns

`void`

###### Example

```ts
orca.converters.unregisterBlock("html", "myplugin.countdown")
```

###### unregisterInline()

> **unregisterInline**(`format`, `type`): `void`

Unregisters an inline content converter.

###### Parameters

###### format

`string`

The target format the converter was registered for

###### type

`string`

The inline content type the converter was registered for

###### Returns

`void`

###### Example

```ts
orca.converters.unregisterInline("markdown", "myplugin.highlight")
```

###### Example

```ts
// Register a block converter
orca.converters.registerBlock(
  "html",
  "myplugin.customBlock",
  (blockContent, repr) => {
    return `<div class="custom-block">${blockContent.text}</div>`
  }
)
```

##### editorSidetools

> **editorSidetools**: `object`

Editor sidetools API for adding custom tools to the block editor's sidebar.
This allows plugins to add custom utilities and functionality in the editor sidebar.

###### registerEditorSidetool()

> **registerEditorSidetool**(`id`, `tool`): `void`

Registers a custom tool in the editor sidebar.

###### Parameters

###### id

`string`

A unique identifier for the sidetool

###### tool

[`EditorSidetool`](#editorsidetool)

The sidetool configuration with a render function

###### Returns

`void`

###### Example

```tsx
// Register a custom sidetool
orca.editorSidetools.registerEditorSidetool("myplugin.outlineViewer", {
  render: (rootBlockId, panelId) => (
    <Tooltip
      text={t("Outline Viewer")}
      shortcut={orca.state.shortcuts["toggleOutlineViewer"]}
      placement="horizontal"
    >
      <Button
        className={`orca-block-editor-sidetools-btn ${isViewerOpened ? "orca-opened" : ""}`}
        variant="plain"
        onClick={toggleOutlineViewer}
      >
        <i className="ti ti-align-justified" />
      </Button>
    </Tooltip>
  )
})
```

###### unregisterEditorSidetool()

> **unregisterEditorSidetool**(`id`): `void`

Unregisters a previously registered editor sidetool.

###### Parameters

###### id

`string`

The identifier of the editor sidetool to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.editorSidetools.unregisterEditorSidetool("myplugin.outlineViewer")
```

###### Example

```ts
// Register a custom sidetool
orca.editorSidetools.registerEditorSidetool("myplugin.outlineViewer", {
  render: (rootBlockId, panelId) => (
    <Tooltip
      text={t("Outline Viewer")}
      shortcut={orca.state.shortcuts["toggleOutlineViewer"]}
      placement="horizontal"
    >
      <Button
        className={`orca-block-editor-sidetools-btn ${isViewerOpened ? "orca-opened" : ""}`}
        variant="plain"
        onClick={toggleOutlineViewer}
      >
        <i className="ti ti-align-justified" />
      </Button>
    </Tooltip>
  )
})
```

##### headbar

> **headbar**: `object`

Headbar API for registering custom buttons in the application's header bar.

###### registerHeadbarButton()

> **registerHeadbarButton**(`id`, `render`): `void`

Registers a custom button in the Orca headbar.

###### Parameters

###### id

`string`

A unique identifier for the button

###### render

() => `ReactElement`

A function that returns a React element to render

###### Returns

`void`

###### Example

```tsx
orca.headbar.registerHeadbarButton("myplugin.settingsButton", () => (
  <orca.components.Button
    variant="plain"
    onClick={() => orca.commands.invokeCommand("myplugin.openSettings")}
  >
    <i className="ti ti-settings-filled" />
  </orca.components.Button>
))
```

###### unregisterHeadbarButton()

> **unregisterHeadbarButton**(`id`): `void`

Unregisters a previously registered headbar button.

###### Parameters

###### id

`string`

The identifier of the button to unregister

###### Returns

`void`

###### Example

```ts
// When unloading the plugin
orca.headbar.unregisterHeadbarButton("myplugin.settingsButton")
```

###### Example

```ts
// Register a custom button in the headbar
orca.headbar.registerHeadbarButton("myplugin.syncButton", () => (
  <orca.components.Button
    variant="plain"
    onClick={() => syncData()}
  >
    <i className="ti ti-refresh" />
  </orca.components.Button>
))
```

##### nav

> **nav**: `object`

Navigation API, used to control Orca's panel navigation and layout.
Provides methods for managing panels, navigating between views, and handling navigation history.

###### addTo()

> **addTo**(`id`, `dir`, `src?`): `string`

Adds a new panel next to an existing panel in the specified direction.

###### Parameters

###### id

`string`

The ID of the existing panel to add the new panel next to

###### dir

The direction to add the panel ("top", "bottom", "left", or "right")

`"top"` | `"bottom"` | `"left"` | `"right"`

###### src?

`Pick`\<[`ViewPanel`](#viewpanel), `"view"` \| `"viewArgs"` \| `"viewState"`\>

Optional parameters for the new panel's view, view arguments, and state

###### Returns

`string`

The ID of the newly created panel, or null if the panel couldn't be created

###### Example

```ts
// Add a new panel to the right of the current panel
const newPanelId = orca.nav.addTo(orca.state.activePanel, "right")
```

###### changeSizes()

> **changeSizes**(`startPanelId`, `values`): `void`

Changes the sizes of panels starting from the specified panel.

###### Parameters

###### startPanelId

`string`

The ID of the starting panel

###### values

`number`[]

Array of new size values

###### Returns

`void`

###### Example

```ts
// Resize panels starting from the current panel
orca.nav.changeSizes(orca.state.activePanel, [300, 700])
```

###### close()

> **close**(`id`): `void`

Closes a panel by its ID.

###### Parameters

###### id

`string`

The ID of the panel to close

###### Returns

`void`

###### Example

```ts
// Close the current panel
orca.nav.close(orca.state.activePanel)
```

###### closeAllBut()

> **closeAllBut**(`id`): `void`

Closes all panels except the specified one.

###### Parameters

###### id

`string`

The ID of the panel to keep open

###### Returns

`void`

###### Example

```ts
// Close all panels except the current one
orca.nav.closeAllBut(orca.state.activePanel)
```

###### findViewPanel()

> **findViewPanel**(`id`, `panels`): [`ViewPanel`](#viewpanel)

Finds a view panel by its ID within the panel structure.

###### Parameters

###### id

`string`

The ID of the panel to find

###### panels

[`RowPanel`](#rowpanel)

The root panel structure to search in

###### Returns

[`ViewPanel`](#viewpanel)

The found ViewPanel or null if not found

###### Example

```ts
const panel = orca.nav.findViewPanel("panel1", orca.state.panels)
if (panel) {
  console.log("Panel view:", panel.view)
}
```

###### focusNext()

> **focusNext**(): `void`

Focuses the next panel in the tab order.

###### Returns

`void`

###### Example

```ts
orca.nav.focusNext()
```

###### focusPrev()

> **focusPrev**(): `void`

Focuses the previous panel in the tab order.

###### Returns

`void`

###### Example

```ts
orca.nav.focusPrev()
```

###### goBack()

> **goBack**(`withRedo?`): `void`

Navigates back to the previous panel state in history.

###### Parameters

###### withRedo?

`boolean`

Whether to allow redo (forward navigation) after going back

###### Returns

`void`

###### Example

```ts
// Go back with redo support
orca.nav.goBack(true)
```

###### goForward()

> **goForward**(): `void`

Navigates forward to the next panel state in history.

###### Returns

`void`

###### Example

```ts
orca.nav.goForward()
```

###### goTo()

> **goTo**(`view`, `viewArgs?`, `panelId?`): `void`

Navigates to a specific view in the specified panel or current active panel.

###### Parameters

###### view

`string`

The type of view to navigate to ("journal" or "block")

###### viewArgs?

`Record`\<`string`, `any`\>

Arguments for the view, such as blockId or date

###### panelId?

`string`

Optional panel ID to navigate in, defaults to active panel

###### Returns

`void`

###### Example

```ts
// Open a specific block in the current panel
orca.nav.goTo("block", { blockId: 123 })

// Open today's journal in a specific panel
orca.nav.goTo("journal", { date: new Date() }, "panel1")
```

###### isThereMoreThanOneViewPanel()

> **isThereMoreThanOneViewPanel**(): `boolean`

Checks if there is more than one view panel open.

###### Returns

`boolean`

True if there is more than one view panel, false otherwise

###### Example

```ts
if (orca.nav.isThereMoreThanOneViewPanel()) {
  console.log("Multiple panels are open")
}
```

###### move()

> **move**(`from`, `to`, `dir`): `void`

Moves a panel from one location to another in the specified direction.

###### Parameters

###### from

`string`

The ID of the panel to move

###### to

`string`

The ID of the destination panel

###### dir

The direction to move the panel relative to the destination panel

`"top"` | `"bottom"` | `"left"` | `"right"`

###### Returns

`void`

###### Example

```ts
// Move panel1 to the bottom of panel2
orca.nav.move("panel1", "panel2", "bottom")
```

###### openInLastPanel()

> **openInLastPanel**(`view`, `viewArgs?`): `void`

Opens a view in the last used panel or creates a new one if needed.
Useful for opening content in a separate panel.

###### Parameters

###### view

`string`

The type of view to open ("journal" or "block")

###### viewArgs?

`Record`\<`string`, `any`\>

Arguments for the view, such as blockId or date

###### Returns

`void`

###### Example

```ts
// Open a block in a new or last used panel
orca.nav.openInLastPanel("block", { blockId: 123 })
```

###### replace()

> **replace**(`view`, `viewArgs?`, `panelId?`): `void`

Replace the view of a panel without recording history.

This updates the specified panel's view and its view arguments in-place.
If `panelId` is omitted, the currently active panel is used. This method
does not push an entry into the panel back/forward history stacks (unlike
`nav.goTo`).

###### Parameters

###### view

`string`

The view type to display in the panel (e.g. "journal" | "block").

###### viewArgs?

`Record`\<`string`, `any`\>

Optional arguments passed to the view. Usually an object
  containing identifiers such as `{ blockId }` or `{ date }`.

###### panelId?

`string`

Optional panel id to target. Defaults to the active panel.

###### Returns

`void`

void

###### Example

```ts
// Replace the active panel with a block view
orca.nav.replace("block", { blockId: 123 })

// Replace a specific panel by id
orca.nav.replace("journal", { date: new Date() }, panelId)
```

###### switchFocusTo()

> **switchFocusTo**(`id`): `void`

Switches focus to the specified panel.

###### Parameters

###### id

`string`

The ID of the panel to focus

###### Returns

`void`

###### Example

```ts
orca.nav.switchFocusTo("panel1")
```

###### Example

```ts
// Open a block in the current panel
orca.nav.goTo("block", { blockId: 123 })

// Open a block in a new panel
orca.nav.openInLastPanel("block", { blockId: 123 })
```

##### notify()

> **notify**: (`type`, `message`, `options?`) => `void`

Display a notification to the user. Notifications appear in the bottom right corner of the application
and can be used to inform users about events, actions, or state changes.

###### Parameters

###### type

The type of notification, which determines its appearance and icon

`"info"` | `"success"` | `"warn"` | `"error"`

###### message

`string`

The main notification message to display

###### options?

Optional configuration including title and action callback

###### action?

() => `void` \| `Promise`\<`void`\>

###### title?

`string`

###### Returns

`void`

###### Example

```ts
// Simple info notification
orca.notify("info", "Processing complete")

// Error notification with title
orca.notify("error", "Failed to connect to API", {
  title: "Connection Error"
})

// Success notification with action button
orca.notify("success", "File exported successfully", {
  title: "Export Complete",
  action: () => {
    orca.commands.invokeCommand("myplugin.openExportedFile")
  }
})
```

##### panels

> **panels**: `object`

Panel renderer API, used to register custom panel types.
Panels are the main views in the application (e.g., journal panel, block panel).

###### registerPanel()

> **registerPanel**(`type`, `renderer`): `void`

Registers a custom panel renderer.

###### Parameters

###### type

`string`

The type identifier for the panel (e.g., "myplugin.customPanel")

###### renderer

`any`

The React component that renders the panel

###### Returns

`void`

###### Example

```ts
import TimelinePanel from "./TimelinePanel"

orca.panels.registerPanel(
  "myplugin.timeline",
  TimelinePanel
)
```

###### unregisterPanel()

> **unregisterPanel**(`type`): `void`

Unregisters a previously registered panel renderer.

###### Parameters

###### type

`string`

The type identifier of the panel renderer to remove

###### Returns

`void`

###### Example

```ts
orca.panels.unregisterPanel("myplugin.timeline")
```

###### Example

```ts
import CustomPanel from "./CustomPanel"

orca.panels.registerPanel(
  "myplugin.customPanel",
  CustomPanel
)
```

##### plugins

> **plugins**: `object`

Plugin management API, used to register, enable, disable, and manage plugin data and settings.

###### clearData()

> **clearData**(`name`): `Promise`\<`void`\>

Removes all data stored by a plugin.

###### Parameters

###### name

`string`

The name of the plugin

###### Returns

`Promise`\<`void`\>

A Promise that resolves when all data is cleared

###### Example

```ts
await orca.plugins.clearData("my-plugin")
```

###### disable()

> **disable**(`name`): `Promise`\<`void`\>

Disables a plugin without unregistering it.
The plugin will remain installed but won't be loaded until enabled again.

###### Parameters

###### name

`string`

The name of the plugin to disable

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the plugin is disabled

###### Example

```ts
await orca.plugins.disable("my-plugin")
```

###### enable()

> **enable**(`name`): `Promise`\<`void`\>

Enables a previously disabled plugin.

###### Parameters

###### name

`string`

The name of the plugin to enable

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the plugin is enabled

###### Example

```ts
await orca.plugins.enable("my-plugin")
```

###### getData()

> **getData**(`name`, `key`): `Promise`\<`any`\>

Retrieves data stored by a plugin.

###### Parameters

###### name

`string`

The name of the plugin

###### key

`string`

The key of the data to retrieve

###### Returns

`Promise`\<`any`\>

A Promise that resolves to the stored data

###### Example

```ts
const userData = await orca.plugins.getData("my-plugin", "user-preferences")
console.log("User preferences:", userData)
```

###### getDataKeys()

> **getDataKeys**(`name`): `Promise`\<`string`[]\>

Gets all data keys stored by a plugin.

###### Parameters

###### name

`string`

The name of the plugin

###### Returns

`Promise`\<`string`[]\>

A Promise that resolves to an array of key strings

###### Example

```ts
const keys = await orca.plugins.getDataKeys("my-plugin")
console.log("Stored data keys:", keys)
```

###### load()

> **load**(`name`, `schema`, `settings`): `Promise`\<`void`\>

Loads a plugin with the given schema and settings.
This is typically called internally by the plugin system.

###### Parameters

###### name

`string`

The name of the plugin to load

###### schema

[`PluginSettingsSchema`](#pluginsettingsschema)

The settings schema for the plugin

###### settings

`Record`\<`string`, `any`\>

The current settings for the plugin

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the plugin is loaded

###### register()

> **register**(`name`): `Promise`\<`void`\>

Registers a plugin with Orca.
This is typically called automatically when a plugin is installed.

###### Parameters

###### name

`string`

The name of the plugin to register

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the plugin is registered

###### Example

```ts
await orca.plugins.register("my-plugin")
```

###### removeData()

> **removeData**(`name`, `key`): `Promise`\<`void`\>

Removes a specific piece of data stored by a plugin.

###### Parameters

###### name

`string`

The name of the plugin

###### key

`string`

The key of the data to remove

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the data is removed

###### Example

```ts
await orca.plugins.removeData("my-plugin", "cached-results")
```

###### setData()

> **setData**(`name`, `key`, `value`): `Promise`\<`void`\>

Stores data for a plugin.

###### Parameters

###### name

`string`

The name of the plugin

###### key

`string`

The key to store the data under

###### value

The data to store (string, number, ArrayBuffer, or null)

`string` | `number` | `ArrayBuffer`

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the data is stored

###### Example

```ts
await orca.plugins.setData(
  "my-plugin",
  "user-preferences",
  JSON.stringify({ theme: "dark", fontSize: 14 })
)
```

###### setSettings()

> **setSettings**(`to`, `name`, `settings`): `Promise`\<`void`\>

Sets settings for a plugin at either the application or repository level.

###### Parameters

###### to

The scope of the settings ("app" for application-wide or "repo" for repository-specific)

`"app"` | `"repo"`

###### name

`string`

The name of the plugin

###### settings

`Record`\<`string`, `any`\>

The settings to set

###### Returns

`Promise`\<`void`\>

A Promise that resolves when settings are saved

###### Example

```ts
// Save app-level settings
await orca.plugins.setSettings("app", "my-plugin", {
  apiKey: "sk-123456789",
  theme: "dark"
})

// Save repo-specific settings
await orca.plugins.setSettings("repo", "my-plugin", {
  customTemplates: ["template1", "template2"]
})
```

###### setSettingsSchema()

> **setSettingsSchema**(`name`, `schema`): `Promise`\<`void`\>

Sets the settings schema for a plugin, defining what settings are available
and how they should be presented in the UI.

###### Parameters

###### name

`string`

The name of the plugin

###### schema

[`PluginSettingsSchema`](#pluginsettingsschema)

The settings schema defining available settings

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the schema is set

###### Example

```ts
await orca.plugins.setSettingsSchema("my-plugin", {
  apiKey: {
    label: "API Key",
    description: "Your API key for the service",
    type: "string"
  },
  enableFeature: {
    label: "Enable Feature",
    description: "Turn on advanced features",
    type: "boolean",
    defaultValue: false
  }
})
```

###### unload()

> **unload**(`name`): `Promise`\<`void`\>

Unloads a plugin. This is called when disabling or unregistering a plugin.
This is typically called internally by the plugin system.

###### Parameters

###### name

`string`

The name of the plugin to unload

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the plugin is unloaded

###### unregister()

> **unregister**(`name`): `Promise`\<`void`\>

Unregisters a plugin from Orca.
This is typically called automatically when a plugin is uninstalled.

###### Parameters

###### name

`string`

The name of the plugin to unregister

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the plugin is unregistered

###### Example

```ts
await orca.plugins.unregister("my-plugin")
```

###### Example

```ts
// Register a plugin
await orca.plugins.register("my-plugin")

// Set plugin settings schema
await orca.plugins.setSettingsSchema("my-plugin", {
  apiKey: {
    label: "API Key",
    description: "Your API key for the service",
    type: "string"
  }
})
```

##### renderers

> **renderers**: `object`

Renderer management API, used to register custom block and inline content renderers.

###### registerBlock()

> **registerBlock**(`type`, `isEditable`, `renderer`, `assetFields?`, `useChildren?`): `void`

Registers a custom block renderer.

###### Parameters

###### type

`string`

The type identifier for the block (e.g., "myplugin.diagram")

###### isEditable

`boolean`

Whether this block type should be editable

###### renderer

`any`

The React component that renders the block

###### assetFields?

`string`[]

Optional array of property names that may contain asset references
                    (used for proper asset handling during import/export)

###### useChildren?

`boolean` = `false`

Whether this block type uses the children for rendering.
                     When true, the block's children will be passed to the renderer component
                     for custom rendering instead of being rendered by the default children renderer.
                     This is useful for blocks that need to control how their children are displayed
                     (e.g., custom layouts, tabs, or accordion blocks).

###### Returns

`void`

###### Example

```ts
import DiagramBlock from "./DiagramBlock"

// Register a block renderer without asset fields
orca.renderers.registerBlock(
  "myplugin.diagram",
  true,
  DiagramBlock
)

// Register a block renderer with asset fields
orca.renderers.registerBlock(
  "myplugin.attachment",
  true,
  AttachmentBlock,
  ["url", "thumbnailUrl"]
)

// Register a block renderer that uses children for custom layout
orca.renderers.registerBlock(
  "myplugin.tabs",
  false,
  TabsBlock,
  undefined,
  true  // useChildren flag
)
```

###### registerInline()

> **registerInline**(`type`, `isEditable`, `renderer`): `void`

Registers a custom inline content renderer.

###### Parameters

###### type

`string`

The type identifier for the inline content (e.g., "myplugin.special")

###### isEditable

`boolean`

Whether this inline content should be editable

###### renderer

`any`

The React component that renders the inline content

###### Returns

`void`

###### Example

```ts
import SpecialInline from "./SpecialInline"

orca.renderers.registerInline(
  "myplugin.special",
  true,
  SpecialInline
)
```

###### unregisterBlock()

> **unregisterBlock**(`type`): `void`

Unregisters a previously registered block renderer.

###### Parameters

###### type

`string`

The type identifier of the block renderer to remove

###### Returns

`void`

###### Example

```ts
orca.renderers.unregisterBlock("myplugin.diagram")
```

###### unregisterInline()

> **unregisterInline**(`type`): `void`

Unregisters a previously registered inline content renderer.

###### Parameters

###### type

`string`

The type identifier of the inline content renderer to remove

###### Returns

`void`

###### Example

```ts
orca.renderers.unregisterInline("myplugin.special")
```

###### Example

```ts
// Register a custom block renderer
orca.renderers.registerBlock(
  "myplugin.customBlock",
  true,
  CustomBlockRenderer,
  ["image", "attachmentUrl"]
)
```

##### shortcuts

> **shortcuts**: `object`

Keyboard shortcuts management API, used to assign, reset and reload keyboard shortcuts.

###### assign()

> **assign**(`shortcut`, `command`): `Promise`\<`void`\>

Assigns a keyboard shortcut to a command.
If the shortcut is empty, it will remove the shortcut from the command.

###### Parameters

###### shortcut

`string`

The keyboard shortcut string (e.g., "ctrl+shift+k" or "meta+p")

###### command

`string`

The command ID to bind the shortcut to

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the shortcut is assigned

###### Example

```ts
// Assign a shortcut
await orca.shortcuts.assign("ctrl+shift+k", "myplugin.myCommand")

// Remove a shortcut
await orca.shortcuts.assign("", "myplugin.myCommand")
```

###### reload()

> **reload**(): `Promise`\<`void`\>

Reloads all keyboard shortcuts from the database.
Usually not needed to be called directly as the system handles this automatically.

###### Returns

`Promise`\<`void`\>

A Promise that resolves when shortcuts are reloaded

###### reset()

> **reset**(`command`): `Promise`\<`void`\>

Resets a command to its default keyboard shortcut.

###### Parameters

###### command

`string`

The command ID to reset

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the shortcut is reset

###### Example

```ts
await orca.shortcuts.reset("core.toggleThemeMode")
```

###### Example

```ts
// Assign a new keyboard shortcut
await orca.shortcuts.assign("ctrl+shift+k", "myplugin.myCommand")

// Reset a command to its default shortcut
await orca.shortcuts.reset("myplugin.myCommand")
```

##### slashCommands

> **slashCommands**: `object`

Slash commands API for registering custom commands that appear when a user types '/' in the editor.
Slash commands provide quick access to actions directly from the editor.

###### registerSlashCommand()

> **registerSlashCommand**(`id`, `command`): `void`

Registers a slash command that appears in the slash command menu.

###### Parameters

###### id

`string`

A unique identifier for the command

###### command

[`SlashCommand`](#slashcommand)

The slash command configuration

###### Returns

`void`

###### Example

```ts
orca.slashCommands.registerSlashCommand("myplugin.insertChart", {
  icon: "ti ti-chart-bar",
  group: "Insert",        // Group name for organization in the menu
  title: "Insert Chart",  // Display name in the menu
  command: "myplugin.insertChartCommand" // Command ID to execute
})
```

###### unregisterSlashCommand()

> **unregisterSlashCommand**(`id`): `void`

Unregisters a previously registered slash command.

###### Parameters

###### id

`string`

The identifier of the slash command to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.slashCommands.unregisterSlashCommand("myplugin.insertChart")
```

###### Example

```ts
// Register a slash command
orca.slashCommands.registerSlashCommand("myplugin.insertTemplate", {
  icon: "ti ti-template",
  group: "Templates",
  title: "Insert Project Template",
  command: "myplugin.insertProjectTemplate"
})
```

##### state

> **state**: `object`

The current state of the Orca Note application.
This object contains the reactive state that updates as the application changes.
Plugins can read from this state to understand the current context and subscribe to changes.

###### activePanel

> **activePanel**: `string`

The ID of the currently active (focused) panel.
This can be used to target operations to the user's current working context.

###### Example

```ts
// Get the currently active panel
const activePanelId = orca.state.activePanel

// Open a block in the currently active panel
orca.nav.goTo("block", { blockId: 123 }, activePanelId)
```

###### blockConverters

> **blockConverters**: `Record`\<`string`, `Record`\<`string`, (`blockContent`, `repr`, `block?`, `forExport?`) => `string` \| `Promise`\<`string`\> \| `undefined`\> \| `undefined`\>

Registry of block converters that transform block content to different formats.
Organized as a nested record with format as the first key and block type as the second.

###### Example

```ts
// Check if a converter exists for HTML format and custom block type
const hasConverter = !!orca.state.blockConverters?.["html"]?.["myplugin.customBlock"]
```

###### blockMenuCommands

> **blockMenuCommands**: `Record`\<`string`, [`BlockMenuCommand`](#blockmenucommand) \| `undefined`\>

Registry of block menu commands that appear in block context menus.
These commands provide custom actions for blocks.

###### Example

```ts
// Check if a specific block menu command is registered
const hasExportCommand = !!orca.state.blockMenuCommands["myplugin.exportBlock"]
```

###### blockRenderers

> **blockRenderers**: `Record`\<`string`, `any`\>

Registry of block renderer components used to render different block types.
Each key is a block type, and the value is the React component used to render it.

###### Example

```ts
// Get the renderer for a specific block type
const codeBlockRenderer = orca.state.blockRenderers["code"]
```

###### blocks

> **blocks**: `Record`\<`string` \| [`DbId`](#dbid), [`Block`](#block) \| `undefined`\>

Map of all blocks currently loaded in memory, indexed by their database IDs.
This provides quick access to block data without needing backend queries.

###### Example

```ts
// Get a block by its ID
const block = orca.state.blocks[123]
if (block) {
  console.log(`Block content: ${block.text}`)
}
```

###### commandPaletteOpened

> **commandPaletteOpened**: `boolean`

Indicates whether the command palette is currently opened.
This can be used to conditionally change behavior when the command palette is active.

###### Example

```ts
if (orca.state.commandPaletteOpened) {
  console.log("Command palette is currently open")
}
```

###### commands

> **commands**: `Record`\<`string`, [`CommandWithPinyin`](#commandwithpinyin) \| `undefined`\>

Registry of all registered commands in the application, indexed by their IDs.
Each command includes pinyin data for search functionality.

###### Example

```ts
// Check if a command exists
if (orca.state.commands["core.createBlock"]) {
  console.log("Create block command is available")
}
```

###### dataDir

> **dataDir**: `string`

The absolute path to the application data directory.
This is where Orca stores configuration and other application-level data.

###### Example

```ts
console.log(`Application data directory: ${orca.state.dataDir}`)
```

###### editorSidetools

> **editorSidetools**: `Record`\<`string`, [`EditorSidetool`](#editorsidetool) \| `undefined`\>

Registry of editor sidetools that appear in the block editor's sidebar.
These tools provide additional functionality in the editor sidebar.

###### Example

```ts
// Check if a specific editor sidetool is registered
const hasTocTool = !!orca.state.editorSidetools["myplugin.toc"]
```

###### filterInTags?

> `optional` **filterInTags**: `string`

Optional filter for tags shown in the tags panel.
When set, only tags that match this filter will be displayed.

###### Example

```ts
if (orca.state.filterInTags === "project") {
  console.log("Tag panel is filtering to show only project tags")
}
```

###### globalSearchOpened

> **globalSearchOpened**: `boolean`

Indicates whether the global search panel is currently opened.
This can be used to conditionally change behavior when search is active.

###### Example

```ts
if (orca.state.globalSearchOpened) {
  console.log("Global search is currently open")
}
```

###### headbarButtons

> **headbarButtons**: `Record`\<`string`, () => `React.ReactElement` \| `undefined`\>

Registry of custom buttons registered for the header bar.
Each entry contains a render function that returns a React element.

###### Example

```ts
// Check if a specific headbar button is registered
const hasMyButton = !!orca.state.headbarButtons["myplugin.syncButton"]
```

###### inlineConverters

> **inlineConverters**: `Record`\<`string`, `Record`\<`string`, (`content`) => `string` \| `Promise`\<`string`\>\> \| `undefined`\>

Registry of inline content converters that transform inline content to different formats.
Organized as a nested record with format as the first key and content type as the second.

###### Example

```ts
// Check if a converter exists for Markdown format and highlight content
const hasConverter = !!orca.state.inlineConverters?.["markdown"]?.["highlight"]
```

###### inlineRenderers

> **inlineRenderers**: `Record`\<`string`, `any`\>

Registry of inline renderer components used to render different inline content types.
Each key is a content type, and the value is the React component used to render it.

###### Example

```ts
// Get the renderer for a specific inline content type
const codeInlineRenderer = orca.state.inlineRenderers["code"]
```

###### locale

> **locale**: `string`

The current locale of the application (e.g., "en" for English, "zh-CN" for Chinese).
This determines the language used for the UI and can be used for localization.

###### Example

```ts
if (orca.state.locale === "zh-CN") {
  console.log("Chinese language is active")
}
```

###### notifications

> **notifications**: [`Notification`](#notification)[]

Array of active notifications currently displayed to the user.
Each notification includes a type, message, and optional title and action.

###### Example

```ts
// Check if there are any error notifications active
const hasErrors = orca.state.notifications.some(n => n.type === "error")
```

###### panelBackHistory

> **panelBackHistory**: [`PanelHistory`](#panelhistory)[]

History of past panel states for backward navigation.
This is used to implement the back button functionality in the UI.

###### Example

```ts
// Check if there are states to navigate back to
const canGoBack = orca.state.panelBackHistory.length > 0
```

###### panelForwardHistory

> **panelForwardHistory**: [`PanelHistory`](#panelhistory)[]

History of forward panel states for forward navigation after going back.
This is used to implement the forward button functionality in the UI.

###### Example

```ts
// Check if there are states to navigate forward to
const canGoForward = orca.state.panelForwardHistory.length > 0
```

###### panelRenderers

> **panelRenderers**: `Record`\<`string`, `any`\>

Registry of panel renderer components used to render different panel types.
Each key is a panel type (e.g., "journal", "block"), and the value is the React component used to render it.

###### Example

```ts
// Get the renderer for a specific panel type
const journalPanelRenderer = orca.state.panelRenderers["journal"]
```

###### panels

> **panels**: [`RowPanel`](#rowpanel)

The root panel structure that defines the current layout of the application.
This contains all panels and their arrangement in rows and columns.

###### Example

```ts
// Access the structure of all panels
const rootPanel = orca.state.panels
console.log(`Root panel ID: ${rootPanel.id}`)
console.log(`Number of child panels: ${rootPanel.children.length}`)
```

###### plugins

> **plugins**: `Record`\<`string`, [`Plugin`](#plugin) \| `undefined`\>

Registry of all installed plugins, indexed by their names.
Each entry contains the plugin metadata and its loaded module if active.

###### Example

```ts
// Check if a plugin is installed and enabled
const myPlugin = orca.state.plugins["my-plugin"]
if (myPlugin && myPlugin.enabled) {
  console.log("My plugin is installed and enabled")
}
```

###### repo

> **repo**: `string`

The name of the current repository.
This is the identifier for the currently open note repository.

###### Example

```ts
console.log(`Current repository: ${orca.state.repo}`)
```

###### repoDir?

> `optional` **repoDir**: `string`

The absolute path to the current repository directory, if a repository is added from non-standard location.
This is where the current note repository is stored on the file system.

###### Example

```ts
if (orca.state.repoDir) {
  console.log(`Current repository directory: ${orca.state.repoDir}`)
}
```

###### settings

> **settings**: `Record`\<`number`, `any`\>

Application and repository settings, indexed by their numeric IDs.
Contains configuration values for both the application and the current repository.

###### Example

```ts
// Access a specific setting by its ID
const editorFontSize = orca.state.settings[12345]
```

###### settingsOpened

> **settingsOpened**: `boolean`

Indicates whether the settings panel is currently opened.
This can be used to conditionally change behavior when settings are being edited.

###### Example

```ts
if (orca.state.settingsOpened) {
  console.log("Settings panel is currently open")
}
```

###### shortcuts

> **shortcuts**: `Record`\<`string`, `string` \| `undefined`\>

Registry of keyboard shortcuts, mapping shortcut strings to command IDs.
This defines the current keyboard bindings in the application.

###### Example

```ts
// Find the command bound to a specific shortcut
const boundCommand = orca.state.shortcuts["ctrl+shift+p"]
if (boundCommand) {
  console.log(`Command ${boundCommand} is bound to Ctrl+Shift+P`)
}
```

###### sidebarTab

> **sidebarTab**: `string`

The currently active tab in the sidebar.
This indicates which sidebar section is currently displayed.

###### Example

```ts
if (orca.state.sidebarTab === "tags") {
  console.log("Tags tab is currently active in sidebar")
}
```

###### slashCommands

> **slashCommands**: `Record`\<`string`, [`SlashCommandWithPinyin`](#slashcommandwithpinyin) \| `undefined`\>

Registry of slash commands available in the editor, indexed by their IDs.
Each command includes pinyin data for search functionality.

###### Example

```ts
// Check if a specific slash command is registered
const hasInsertChartCommand = !!orca.state.slashCommands["myplugin.insertChart"]
```

###### tagMenuCommands

> **tagMenuCommands**: `Record`\<`string`, [`TagMenuCommand`](#tagmenucommand) \| `undefined`\>

Registry of tag menu commands that appear in tag context menus.
These commands provide custom actions for tags.

###### Example

```ts
// Check if a specific tag menu command is registered
const hasTagStatsCommand = !!orca.state.tagMenuCommands["myplugin.tagStats"]
```

###### themeMode

> **themeMode**: `"light"` \| `"dark"`

The current theme mode of the application ("light" or "dark").
This determines whether the light or dark theme variant is active.

###### Example

```ts
if (orca.state.themeMode === "dark") {
  console.log("Dark theme is active")
}
```

###### themes

> **themes**: `Record`\<`string`, `string` \| `undefined`\>

Registry of installed themes, mapping theme names to CSS file paths.
This defines all available themes that can be selected.

###### Example

```ts
// Get the CSS file path for a specific theme
const oceanThemePath = orca.state.themes["Ocean Blue"]
```

###### toolbarButtons

> **toolbarButtons**: `Record`\<`string`, [`ToolbarButton`](#toolbarbutton) \| [`ToolbarButton`](#toolbarbutton)[] \| `undefined`\>

Registry of toolbar buttons or button groups registered for the editor toolbar.
Each entry can be a single button configuration or an array of related buttons.

###### Example

```ts
// Check if a specific toolbar button is registered
const hasFormatButton = !!orca.state.toolbarButtons["myplugin.formatButton"]
```

##### tagMenuCommands

> **tagMenuCommands**: `object`

Tag menu commands API for adding custom commands to tag context menus.
This allows plugins to add custom actions that appear when users open the tag's context menu.

###### registerTagMenuCommand()

> **registerTagMenuCommand**(`id`, `command`): `void`

Registers a custom command in the tag context menu.

###### Parameters

###### id

`string`

A unique identifier for the command

###### command

[`TagMenuCommand`](#tagmenucommand)

The command configuration, including a render function
                 that returns a React element

###### Returns

`void`

###### Example

```tsx
orca.tagMenuCommands.registerTagMenuCommand("myplugin.exportTaggedBlocks", {
  render: (tagBlock, close) => (
    <orca.components.MenuText
      preIcon="ti ti-file-export"
      title="Export Tagged Blocks"
      onClick={() => {
        close()
        exportTaggedBlocks(tagBlock)
      }}
    />
  )
})
```

###### unregisterTagMenuCommand()

> **unregisterTagMenuCommand**(`id`): `void`

Unregisters a previously registered tag menu command.

###### Parameters

###### id

`string`

The identifier of the tag menu command to unregister

###### Returns

`void`

###### Example

```ts
// When unloading a plugin
orca.tagMenuCommands.unregisterTagMenuCommand("myplugin.exportTaggedBlocks")
```

###### Example

```ts
// Register a command for the tag context menu
const MenuText = orca.components.MenuText
orca.tagMenuCommands.registerTagMenuCommand("myplugin.tagStats", {
  render: (tagBlock, close) => (
    <MenuText
      title="Show Tag Statistics"
      onClick={() => {
        close()
        showTagStatistics(tagBlock)
      }}
    />
  )
})
```

##### themes

> **themes**: `object`

Theme management API, used to register, unregister, and manage visual themes.

###### injectCSSResource()

> **injectCSSResource**(`url`, `role`): `void`

Injects a CSS resource into the application.
Useful for adding styles that are not part of a theme but are needed by a plugin.

###### Parameters

###### url

`string`

The URL or path to the CSS resource

###### role

`string`

A unique identifier for the resource to allow for later removal

###### Returns

`void`

###### Example

```ts
orca.themes.injectCSSResource("styles/my-plugin-styles.css", "my-plugin-ui")
```

###### register()

> **register**(`pluginName`, `themeName`, `themeFileName`): `void`

Registers a theme with Orca.

###### Parameters

###### pluginName

`string`

The name of the plugin registering the theme

###### themeName

`string`

The display name of the theme

###### themeFileName

`string`

The file path to the theme CSS file (relative to plugin directory)

###### Returns

`void`

###### Example

```ts
orca.themes.register("my-plugin", "Dark Ocean", "themes/dark-ocean.css")
```

###### removeCSSResources()

> **removeCSSResources**(`role`): `void`

Removes previously injected CSS resources with the specified role.

###### Parameters

###### role

`string`

The role identifier of the CSS resources to remove

###### Returns

`void`

###### Example

```ts
orca.themes.removeCSSResources("my-plugin-ui")
```

###### unregister()

> **unregister**(`themeName`): `void`

Unregisters a theme.

###### Parameters

###### themeName

`string`

The name of the theme to unregister

###### Returns

`void`

###### Example

```ts
orca.themes.unregister("Dark Ocean")
```

###### Example

```ts
// Register a theme from a plugin
orca.themes.register("my-plugin", "Dark Ocean", "themes/dark-ocean.css")
```

##### toolbar

> **toolbar**: `object`

Toolbar API for registering custom buttons in the block editor toolbar.

###### registerToolbarButton()

> **registerToolbarButton**(`id`, `button`): `void`

Registers a toolbar button or group of buttons.

###### Parameters

###### id

`string`

A unique identifier for the button

###### button

Button configuration or array of button configurations

[`ToolbarButton`](#toolbarbutton) | [`ToolbarButton`](#toolbarbutton)[]

###### Returns

`void`

###### Example

```ts
// Register a single button with a command
orca.toolbar.registerToolbarButton("myplugin.formatButton", {
  icon: "ti ti-wand",
  tooltip: "Format text",
  command: "myplugin.formatText"
})

// Register a button with a dropdown menu
const MenuText = orca.components.MenuText
orca.toolbar.registerToolbarButton("myplugin.insertButton", {
  icon: "ti ti-plus",
  tooltip: "Insert special content",
  menu: (close) => (
    <>
      <MenuText
        title="Insert Table"
        onClick={() => {
          close()
          orca.commands.invokeCommand("myplugin.insertTable")
        }}
      />
      <MenuText
        title="Insert Chart"
        onClick={() => {
          close()
          orca.commands.invokeCommand("myplugin.insertChart")
        }}
      />
    </>
  )
})

// Register a group of related buttons
orca.toolbar.registerToolbarButton("myplugin.formattingTools", [
  {
    icon: "ti ti-bold",
    tooltip: "Bold",
    command: "myplugin.makeBold"
  },
  {
    icon: "ti ti-italic",
    tooltip: "Italic",
    command: "myplugin.makeItalic"
  }
])
```

###### unregisterToolbarButton()

> **unregisterToolbarButton**(`id`): `void`

Unregisters a previously registered toolbar button or button group.

###### Parameters

###### id

`string`

The identifier of the button or button group to unregister

###### Returns

`void`

###### Example

```ts
// When unloading the plugin
orca.toolbar.unregisterToolbarButton("myplugin.formatButton")
```

###### Example

```ts
// Register a simple toolbar button
orca.toolbar.registerToolbarButton("myplugin.formatButton", {
  icon: "ti ti-wand",
  tooltip: "Format selection",
  command: "myplugin.formatText"
})
```

##### utils

> **utils**: `object`

Utility functions.

These methods help plugins and extensions interact with the editor's selection and cursor state,
enabling advanced text manipulation and integration with Orca's block-based editing model.

###### getAssetPath()

> **getAssetPath**: (`assetPath`) => `string`

Resolves the absolute URL or file path for an asset used by a plugin or the application.
You can override it to provide a mapping.

###### Parameters

###### assetPath

`string`

The absolute path to the asset.

###### Returns

`string`

The absolute URL or file path to the asset, suitable for use in image, video or other resources.

###### Example

```ts
// Get the full path to a plugin image asset
const iconUrl = orca.utils.getAssetPath(iconSrc)

// Use in a React component
<img src={orca.utils.getAssetPath(iconSrc)} alt="Logo" />
```

###### getCursorDataFromRange()

> **getCursorDataFromRange**: (`range`) => [`CursorData`](#cursordata)

Converts a DOM Range object into Orca's internal CursorData format.

###### Parameters

###### range

`Range`

The DOM Range object (e.g., from selection.getRangeAt(0))

###### Returns

[`CursorData`](#cursordata)

The corresponding CursorData object, or null if the range is invalid or outside the editor.

###### Example

```ts
const selection = window.getSelection();
if (selection && selection.rangeCount > 0) {
  const range = selection.getRangeAt(0);
  const cursorData = orca.utils.getCursorDataFromRange(range);
}
```

###### getCursorDataFromSelection()

> **getCursorDataFromSelection**: (`selection`) => [`CursorData`](#cursordata)

Converts a DOM Selection object into Orca's internal CursorData format.

###### Parameters

###### selection

`Selection`

The DOM Selection object (e.g., from window.getSelection())

###### Returns

[`CursorData`](#cursordata)

The corresponding CursorData object, or null if the selection is invalid or outside the editor.

###### Example

```ts
const selection = window.getSelection();
const cursorData = orca.utils.getCursorDataFromSelection(selection);
if (cursorData) {
  // Use cursorData for editor commands
}
```

###### setSelectionFromCursorData()

> **setSelectionFromCursorData**: (`cursorData`) => `Promise`\<`void`\>

Sets the editor's selection and caret position based on Orca's CursorData.

###### Parameters

###### cursorData

[`CursorData`](#cursordata)

The CursorData object specifying the desired selection/cursor position.

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the selection has been updated.

###### Example

```ts
// Move the caret to a specific block and offset
await orca.utils.setSelectionFromCursorData(cursorData);
```

#### Methods

##### invokeBackend()

> **invokeBackend**(`type`, ...`args`): `Promise`\<`any`\>

Invokes a backend API with the specified API type and arguments.
This is a core method for plugins to communicate with the Orca backend systems.

###### Parameters

###### type

`string`

The API message type to invoke, which specifies what backend functionality to call

###### args

...`any`[]

Any additional arguments needed by the specified backend API

###### Returns

`Promise`\<`any`\>

A Promise that resolves with the result from the backend call

###### Example

```ts
// Get a block by its ID
const block = await orca.invokeBackend("get-block", 12345)
console.log(`Block content: ${block.text}`)

// Get blocks with specific tags
const taggedBlocks = await orca.invokeBackend(
  "get-blocks-with-tags",
  ["project", "active"]
)
console.log(`Found ${taggedBlocks.length} active projects`)
```

***

### PanelHistory

Represents an entry in the panel navigation history.
Used to implement back/forward navigation between panel states.

#### Properties

##### activePanel

> **activePanel**: `string`

ID of the panel that was active at this history point

##### view

> **view**: `string`

The view type that was displayed

##### viewArgs?

> `optional` **viewArgs**: `Record`\<`string`, `any`\>

Arguments for the view at this history point

***

### PanelLayouts

Configuration for saved panel layouts.
Allows users to save and restore different workspace arrangements.

#### Properties

##### default

> **default**: `string`

The key of the default layout to use

##### layouts

> **layouts**: `Record`\<`string`, \{ `activePanel`: `string`; `panels`: [`RowPanel`](#rowpanel); \}\>

Map of named layouts with their panel configurations

***

### Plugin

Represents a plugin installed in Orca.
Plugins extend the functionality of Orca with additional features.

#### Properties

##### enabled

> **enabled**: `boolean`

Whether the plugin is currently enabled

##### icon

> **icon**: `string`

Icon identifier for the plugin

##### module?

> `optional` **module**: `any`

The loaded plugin module when enabled

##### schema?

> `optional` **schema**: [`PluginSettingsSchema`](#pluginsettingsschema)

Optional settings schema defining available configuration options

##### settings?

> `optional` **settings**: `Record`\<`string`, `any`\>

Current settings values for the plugin

***

### PluginSettingsSchema

Schema that defines the settings available for a plugin and how they should be presented in the UI.
Each key represents a setting name with its configuration.

***

### QueryBlock

Query condition that matches blocks according their properties.

#### Properties

##### created?

> `optional` **created**: `object`

Whether to match blocks with a specific creation date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### hasAliases?

> `optional` **hasAliases**: `boolean`

Whether to match blocks with aliases

##### hasBackRefs?

> `optional` **hasBackRefs**: `boolean`

Whether to match blocks with back references

##### hasChild?

> `optional` **hasChild**: `boolean`

Whether to match blocks with a child

##### hasParent?

> `optional` **hasParent**: `boolean`

Whether to match blocks with a parent

##### hasTags?

> `optional` **hasTags**: `boolean`

Whether to match blocks with tags

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `9`

Kind identifier for block queries (9)

##### modified?

> `optional` **modified**: `object`

Whether to match blocks with a specific modification date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### types?

> `optional` **types**: `object`

The block types to match or not match

###### op?

> `optional` **op**: `5` \| `6`

###### value?

> `optional` **value**: `string`[]

***

### QueryBlock2

Query condition that matches blocks according their properties.

#### Properties

##### backRefs?

> `optional` **backRefs**: `object`

Whether to match blocks with a specific number of back references

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `number`

##### created?

> `optional` **created**: `object`

Whether to match blocks with a specific creation date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### hasAliases?

> `optional` **hasAliases**: `boolean`

Whether to match blocks with aliases

##### hasChild?

> `optional` **hasChild**: `boolean`

Whether to match blocks with a child

##### hasParent?

> `optional` **hasParent**: `boolean`

Whether to match blocks with a parent

##### hasTags?

> `optional` **hasTags**: `boolean`

Whether to match blocks with tags

##### kind

> **kind**: `9`

Kind identifier for block queries (9)

##### modified?

> `optional` **modified**: `object`

Whether to match blocks with a specific modification date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### types?

> `optional` **types**: `object`

The block types to match or not match

###### op?

> `optional` **op**: `5` \| `6`

###### value?

> `optional` **value**: `string`[]

***

### QueryBlockMatch2

Query condition that matches specific blocks by their ID.

#### Properties

##### blockId?

> `optional` **blockId**: `number`

ID of the specific block to match

##### kind

> **kind**: `12`

Kind identifier for block match queries (12)

***

### QueryDescription

Describes a query for searching and filtering blocks.
Used to construct complex queries that can combine multiple conditions.

#### Properties

##### asCalendar?

> `optional` **asCalendar**: `object`

Calendar view configuration if results should be displayed in calendar format

###### end

> **end**: `Date`

End date for the calendar range

###### field

> **field**: `"created"` \| `"modified"` \| `"journal"`

Field to use for calendar date (created/modified/journal date)

###### start

> **start**: `Date`

Start date for the calendar range

##### asTable?

> `optional` **asTable**: `boolean`

Whether to format results as a table

##### excludeId?

> `optional` **excludeId**: `number`

Optional block ID to exclude from results

##### group?

> `optional` **group**: `string`

Specifies which group to return results for

##### groupBy?

> `optional` **groupBy**: `string`

Field to group results by

##### page?

> `optional` **page**: `number`

For paginated results, the page number (0-based)

##### pageSize?

> `optional` **pageSize**: `number`

For paginated results, the number of items per page

##### q?

> `optional` **q**: [`QueryGroup`](#querygroup)

The main query group with conditions

##### sort?

> `optional` **sort**: [`QuerySort`](#querysort)[]

Array of sort specifications for ordering results

##### stats?

> `optional` **stats**: [`QueryStat`](#querystat)[]

Statistical calculations to perform on results

##### tagName?

> `optional` **tagName**: `string`

Filters results to blocks with a specific tag

***

### QueryDescription2

Describes a query for searching and filtering blocks.
Used to construct complex queries that can combine multiple conditions.

#### Properties

##### asCalendar?

> `optional` **asCalendar**: `object`

Calendar view configuration if results should be displayed in calendar format

###### end

> **end**: `Date`

End date for the calendar range

###### field

> **field**: `"created"` \| `"modified"` \| `"journal"`

Field to use for calendar date (created/modified/journal date)

###### start

> **start**: `Date`

Start date for the calendar range

##### asTable?

> `optional` **asTable**: `boolean`

Whether to format results as a table

##### excludeId?

> `optional` **excludeId**: `number`

Optional block ID to exclude from results

##### group?

> `optional` **group**: `string`

Specifies which group to return results for

##### groupBy?

> `optional` **groupBy**: `string`

Field to group results by

##### page?

> `optional` **page**: `number`

For paginated results, the page number (0-based)

##### pageSize?

> `optional` **pageSize**: `number`

For paginated results, the number of items per page

##### q?

> `optional` **q**: [`QueryGroup2`](#querygroup2)

The main query group with conditions

##### sort?

> `optional` **sort**: [`QuerySort`](#querysort)[]

Array of sort specifications for ordering results

##### stats?

> `optional` **stats**: [`QueryStat`](#querystat)[]

Statistical calculations to perform on results

##### tagName?

> `optional` **tagName**: `string`

Filters results to blocks with a specific tag

***

### QueryGroup

A group of query conditions combined with a logical operator.
Used to create complex queries with multiple conditions.

#### Properties

##### conditions

> **conditions**: [`QueryItem`](#queryitem)[]

Array of conditions within this group

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `1` \| `2`

Kind of group: 1 for AND, 2 for OR

##### subConditions?

> `optional` **subConditions**: [`QueryGroup`](#querygroup)

Optional conditions that apply to descendant blocks

***

### QueryGroup2

A group of query conditions combined with a logical operator.
Used to create complex queries with multiple conditions.

#### Properties

##### conditions

> **conditions**: [`QueryItem2`](#queryitem2)[]

Array of conditions within this group

##### kind

> **kind**: `100` \| `101` \| `102` \| `103` \| `104` \| `105` \| `106`

Kind of group: self/ancestor/descendant/chain

##### negate?

> `optional` **negate**: `boolean`

Whether to negate the conditions in this group

***

### QueryJournal

Query condition that matches journal blocks in a date range.

#### Properties

##### end

> **end**: [`QueryJournalDate`](#queryjournaldate)

End date for the journal range

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `3`

Kind identifier for journal queries (3)

##### start

> **start**: [`QueryJournalDate`](#queryjournaldate)

Start date for the journal range

***

### QueryJournal2

Query condition that matches journal blocks in a date range.

#### Properties

##### end

> **end**: [`QueryJournalDate`](#queryjournaldate)

End date for the journal range

##### kind

> **kind**: `3`

Kind identifier for journal queries (3)

##### start

> **start**: [`QueryJournalDate`](#queryjournaldate)

Start date for the journal range

***

### QueryJournalDate

Represents a date specification for journal queries.
Can be relative (e.g., "2 days ago") or absolute.

#### Properties

##### t

> **t**: `1` \| `2`

Type of date: 1 for relative, 2 for full/absolute date

##### u?

> `optional` **u**: `"s"` \| `"m"` \| `"h"` \| `"d"` \| `"w"` \| `"M"` \| `"y"`

For relative dates, the unit (s=seconds, m=minutes, h=hours, d=days, w=weeks, M=months, y=years)

##### v?

> `optional` **v**: `number`

For relative dates, the numeric value (e.g., 2 in "2 days ago")

***

### QueryNoRef

Query condition that matches blocks not referencing a specific block.

#### Properties

##### blockId

> **blockId**: `number`

ID of the block that should not be referenced

##### kind

> **kind**: `7`

Kind identifier for no-reference queries (7)

***

### QueryNoTag

Query condition that matches blocks without a specific tag.

#### Properties

##### kind

> **kind**: `5`

Kind identifier for no-tag queries (5)

##### name

> **name**: `string`

The tag name that should not be present

***

### QueryRef

Query condition that matches blocks referencing a specific block.

#### Properties

##### blockId

> **blockId**: `number`

ID of the block that should be referenced

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `6`

Kind identifier for reference queries (6)

***

### QueryRef2

Query condition that matches blocks referencing a specific block.

#### Properties

##### blockId?

> `optional` **blockId**: `number`

ID of the block that should be referenced

##### kind

> **kind**: `6`

Kind identifier for reference queries (6)

##### selfOnly?

> `optional` **selfOnly**: `boolean`

Only show direct references, not references to included tags

***

### QueryTag

Query condition that matches blocks with a specific tag.
Can also match based on tag properties.

#### Properties

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `4`

Kind identifier for tag queries (4)

##### name

> **name**: `string`

The tag name to match

##### properties?

> `optional` **properties**: [`QueryTagProperty`](#querytagproperty)[]

Optional property conditions for the tag

***

### QueryTag2

Query condition that matches blocks with a specific tag.
Can also match based on tag properties.

#### Properties

##### kind

> **kind**: `4`

Kind identifier for tag queries (4)

##### name

> **name**: `string`

The tag name to match

##### properties?

> `optional` **properties**: [`QueryTagProperty`](#querytagproperty)[]

Optional property conditions for the tag

##### selfOnly?

> `optional` **selfOnly**: `boolean`

Only show direct tag references, not references to included tags

***

### QueryTagProperty

Condition for querying tag properties with specific values.

#### Properties

##### name

> **name**: `string`

Name of the tag property

##### op?

> `optional` **op**: `1` \| `2` \| `3` \| `4` \| `5` \| `6` \| `7` \| `8` \| `9` \| `10` \| `11` \| `12`

Operation to perform (equals, not equals, etc.)

##### type?

> `optional` **type**: `number`

Optional type code for the property

##### typeArgs?

> `optional` **typeArgs**: `any`

Optional type arguments

##### value?

> `optional` **value**: `any`

Value to compare against

***

### QueryTask

Query condition that matches task blocks

#### Properties

##### completed?

> `optional` **completed**: `boolean`

Whether the task is completed

##### kind

> **kind**: `11`

Kind identifier for task queries (11)

***

### QueryText

Query condition that matches blocks containing specific text.

#### Properties

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `8`

Kind identifier for text queries (8)

##### raw?

> `optional` **raw**: `boolean`

Whether to perform raw text search (no stemming/normalization)

##### text

> **text**: `string`

The text to search for

***

### QueryText2

Query condition that matches blocks containing specific text.

#### Properties

##### kind

> **kind**: `8`

Kind identifier for text queries (8)

##### raw?

> `optional` **raw**: `boolean`

Whether to perform raw text search (no stemming/normalization)

##### text

> **text**: `string`

The text to search for

***

### RowPanel

Represents a panel container that arranges its children in a row.
Used for horizontal panel layouts.

#### Properties

##### children

> **children**: ([`ViewPanel`](#viewpanel) \| [`ColumnPanel`](#columnpanel))[]

Child panels contained within this row

##### direction

> **direction**: `"row"`

Specifies that children are arranged horizontally

##### height

> **height**: `number`

Height of the row panel in pixels

##### id

> **id**: `string`

Unique identifier for the row panel

***

### SlashCommand

Configuration for a slash command that appears in the editor's slash menu.
Slash commands provide quick access to actions from within the editor.

#### Extended by

- [`SlashCommandWithPinyin`](#slashcommandwithpinyin)

#### Properties

##### command

> **command**: `string`

Command ID to execute when selected

##### group

> **group**: `string`

Group name for organizing commands in the slash menu

##### icon

> **icon**: `string`

Icon identifier for the command

##### title

> **title**: `string`

Display title for the command

***

### SlashCommandWithPinyin

Slash command with additional pinyin data for search functionality in Chinese.

#### Extends

- [`SlashCommand`](#slashcommand)

#### Properties

##### command

> **command**: `string`

Command ID to execute when selected

###### Inherited from

[`SlashCommand`](#slashcommand).[`command`](#command-1)

##### group

> **group**: `string`

Group name for organizing commands in the slash menu

###### Inherited from

[`SlashCommand`](#slashcommand).[`group`](#group-2)

##### icon

> **icon**: `string`

Icon identifier for the command

###### Inherited from

[`SlashCommand`](#slashcommand).[`icon`](#icon-1)

##### pinyin

> **pinyin**: `string`

Pinyin phonetic representation for improved search in Chinese

##### title

> **title**: `string`

Display title for the command

###### Inherited from

[`SlashCommand`](#slashcommand).[`title`](#title-1)

***

### ToolbarButton

Configuration for a toolbar button in the editor toolbar.
Buttons can execute commands or display menus with additional options.

#### Properties

##### background?

> `optional` **background**: `string`

Optional background color for the button

##### color?

> `optional` **color**: `string`

Optional text color for the button

##### command?

> `optional` **command**: `string`

Optional command ID to execute when clicked

##### icon

> **icon**: `string`

Icon identifier (usually a Tabler Icons class)

##### menu()?

> `optional` **menu**: (`close`, `state?`) => `ReactNode`

Optional function to render a dropdown menu when clicked

###### Parameters

###### close

() => `void`

###### state?

`any`

###### Returns

`ReactNode`

##### tooltip

> **tooltip**: `string`

Tooltip text displayed on hover

***

### ViewPanel

Represents a view panel that displays content (journal or block).
These are the leaf panels in the panel hierarchy that actually render content.

#### Properties

##### height?

> `optional` **height**: `number`

Optional height of the panel in pixels

##### id

> **id**: `string`

Unique identifier for the view panel

##### locked?

> `optional` **locked**: `boolean`

Whether the panel is locked and cannot be closed or resized

##### view

> **view**: `string`

Type of view displayed in this panel (journal or block)

##### viewArgs

> **viewArgs**: `Record`\<`string`, `any`\>

Arguments for the view, such as blockId for block views or date for journal views

##### viewState

> **viewState**: `Record`\<`string`, `any`\>

State of the view, used to preserve UI state like scroll position or editor selections

##### wide?

> `optional` **wide**: `boolean`

Whether the panel should take up extra space when available

##### width?

> `optional` **width**: `number`

Optional width of the panel in pixels

## Type Aliases

### AfterHook()

> **AfterHook** = (`id`, ...`args`) => `void` \| `Promise`\<`void`\>

Function type used for "after command" hooks.
Called after a command has been executed.

#### Parameters

##### id

`string`

##### args

...`any`[]

#### Returns

`void` \| `Promise`\<`void`\>

***

### APIMsg

> **APIMsg** = `"change-tag-property-choice"` \| `"export-png"` \| `"get-aliased-blocks"` \| `"get-aliases"` \| `"get-aliases-ids"` \| `"get-block"` \| `"get-block-by-alias"` \| `"get-blockid-by-alias"` \| `"get-blocks"` \| `"get-blocks-with-tags"` \| `"get-block-tree"` \| `"get-children-tags"` \| `"get-journal-block"` \| `"get-remindings"` \| `"query"` \| `"search-aliases"` \| `"search-blocks-by-text"` \| `"set-app-config"` \| `"set-config"` \| `"shell-open"` \| `"show-in-folder"` \| `"upload-asset-binary"` \| `"upload-assets"` \| `"image-ocr"` \| `string`

Supported backend API message types for communicating with the Orca backend.
These message types are used with the `invokeBackend` method to perform
various operations on blocks, tags, journals, and other repository data.

***

### BeforeHookPred()

> **BeforeHookPred** = (`id`, ...`args`) => `boolean`

Predicate function type used for "before command" hooks.
Returns true to allow the command to proceed, false to cancel it.

#### Parameters

##### id

`string`

##### args

...`any`[]

#### Returns

`boolean`

***

### BlockForConversion

> **BlockForConversion** = `object`

Simplified block structure used when converting blocks to other formats.

#### Properties

##### children?

> `optional` **children**: [`DbId`](#dbid)[]

IDs of child blocks

##### content?

> `optional` **content**: [`ContentFragment`](#contentfragment)[]

Content fragments in the block

***

### BlockMenuCommand

> **BlockMenuCommand** = \{ `render`: (`blockId`, `rootBlockId`, `close`) => `React.ReactNode`; `worksOnMultipleBlocks`: `false`; \} \| \{ `render`: (`blockIds`, `rootBlockId`, `close`) => `React.ReactNode`; `worksOnMultipleBlocks`: `true`; \}

Command configuration for the block context menu.
Can be configured to work with single blocks or multiple selected blocks.

#### Type Declaration

\{ `render`: (`blockId`, `rootBlockId`, `close`) => `React.ReactNode`; `worksOnMultipleBlocks`: `false`; \}

##### render()

> **render**: (`blockId`, `rootBlockId`, `close`) => `React.ReactNode`

Function to render the menu item, receiving the block ID and context

###### Parameters

###### blockId

[`DbId`](#dbid)

###### rootBlockId

[`DbId`](#dbid)

###### close

() => `void`

###### Returns

`React.ReactNode`

##### worksOnMultipleBlocks

> **worksOnMultipleBlocks**: `false`

Indicates this command works only on a single block

\{ `render`: (`blockIds`, `rootBlockId`, `close`) => `React.ReactNode`; `worksOnMultipleBlocks`: `true`; \}

##### render()

> **render**: (`blockIds`, `rootBlockId`, `close`) => `React.ReactNode`

Function to render the menu item, receiving an array of block IDs and context

###### Parameters

###### blockIds

[`DbId`](#dbid)[]

###### rootBlockId

[`DbId`](#dbid)

###### close

() => `void`

###### Returns

`React.ReactNode`

##### worksOnMultipleBlocks

> **worksOnMultipleBlocks**: `true`

Indicates this command works on multiple selected blocks

***

### BlockRefData

> **BlockRefData** = `Pick`\<[`BlockProperty`](#blockproperty), `"name"` \| `"type"` \| `"value"`\>

Simplified type for block reference data.

***

### BlockRenderingMode

> **BlockRenderingMode** = `"normal"` \| `"simple"` \| `"simple-children"`

Block rendering modes

***

### Choice

> **Choice** = \{ `c?`: `string`; `n`: `string`; \} \| `string`

Type representing a choice with an optional color.
Can be a string or an object with name and optional color.

***

### CommandFn()

> **CommandFn** = (...`args`) => `void` \| `Promise`\<`void`\>

Basic command function type that defines functions that can be executed as commands.
Can be synchronous or asynchronous.

#### Parameters

##### args

...`any`[]

#### Returns

`void` \| `Promise`\<`void`\>

***

### ContentFragment

> **ContentFragment** = `object`

Represents a fragment of rich text content within a block.
Different fragment types allow for various content formats like text, links, code, etc.

#### Indexable

\[`key`: `string`\]: `any`

Additional properties can be included based on content type

#### Properties

##### f?

> `optional` **f**: `string`

Optional formatting information

##### fa?

> `optional` **fa**: `Record`\<`string`, `any`\>

Optional formatting arguments

##### t

> **t**: `string`

The type of content fragment (e.g., "text", "code", "link")

##### v

> **v**: `any`

The value of the content fragment

***

### ConvertContext

> **ConvertContext** = `object`

Context for block conversion, used to track export scope.

#### Properties

##### exportRootId?

> `optional` **exportRootId**: [`DbId`](#dbid)

The root block ID of the export scope

***

### DbId

> **DbId** = `number`

Database ID type used to uniquely identify blocks and other entities in the database.

***

### EditorArg

> **EditorArg** = \[`string`, [`DbId`](#dbid), [`CursorData`](#cursordata) \| `null`, `boolean`\]

Arguments passed to editor commands.

***

### EditorCommandFn()

> **EditorCommandFn** = (`editor`, ...`args`) => \{ `ret?`: `any`; `undoArgs`: `any`; \} \| `null` \| `Promise`\<\{ `ret?`: `any`; `undoArgs?`: `any`; \} \| `null`\>

Editor command function type that defines functions that can be executed in the editor context.
These commands support undo/redo functionality by returning undo arguments.

#### Parameters

##### editor

[`EditorArg`](#editorarg)

##### args

...`any`[]

#### Returns

\{ `ret?`: `any`; `undoArgs`: `any`; \} \| `null` \| `Promise`\<\{ `ret?`: `any`; `undoArgs?`: `any`; \} \| `null`\>

***

### EditorSidetool

> **EditorSidetool** = `object`

Configuration for an editor sidetool that appears in the block editor's sidebar.
Sidetools provide additional functionality and utilities in the editor sidebar.

#### Properties

##### render()

> **render**: (`rootBlockId`, `panelId`) => `React.ReactNode`

Function to render the sidetool, receiving the root block ID and panel ID.

###### Parameters

###### rootBlockId

[`DbId`](#dbid)

###### panelId

`string`

###### Returns

`React.ReactNode`

***

### PanelProps

> **PanelProps** = `object`

Properties for rendering a panel component.

***

### PanelView

> **PanelView** = `string`

Types of views that can be displayed in a panel.
Currently supports journal view (for displaying daily notes) and block view (for displaying block content).

***

### QueryEq

> **QueryEq** = `1`

Operation constant: equals.
Matches if a value is equal to the specified value.

***

### QueryGe

> **QueryGe** = `9`

Operation constant: greater than or equal to.
Matches if a value is greater than or equal to the specified value.

***

### QueryGt

> **QueryGt** = `7`

Operation constant: greater than.
Matches if a value is greater than the specified value.

***

### QueryHas

> **QueryHas** = `5`

Operation constant: has property.
Matches if an object has the specified property.

***

### QueryIncludes

> **QueryIncludes** = `3`

Operation constant: includes.
Matches if an array value includes the specified value.

***

### QueryItem

> **QueryItem** = [`QueryGroup`](#querygroup) \| [`QueryText`](#querytext) \| [`QueryTag`](#querytag) \| [`QueryRef`](#queryref) \| [`QueryJournal`](#queryjournal) \| [`QueryBlock`](#queryblock) \| `QueryNoText` \| [`QueryNoTag`](#querynotag) \| [`QueryNoRef`](#querynoref)

Union type representing all possible query condition items.
Each item represents a different type of condition that can be used in queries.

***

### QueryItem2

> **QueryItem2** = [`QueryGroup2`](#querygroup2) \| [`QueryText2`](#querytext2) \| [`QueryTag2`](#querytag2) \| [`QueryRef2`](#queryref2) \| [`QueryJournal2`](#queryjournal2) \| [`QueryBlock2`](#queryblock2) \| [`QueryBlockMatch2`](#queryblockmatch2) \| [`QueryTask`](#querytask)

Union type representing all possible query condition items.
Each item represents a different type of condition that can be used in queries.

***

### QueryJournalFull

> **QueryJournalFull** = `2`

Constant for absolute date specification in journal queries.
Used for specific dates.

***

### QueryJournalRelative

> **QueryJournalRelative** = `1`

Constant for relative date specification in journal queries.
Used for dates like "2 days ago" or "next week".

***

### QueryKindAncestorAnd

> **QueryKindAncestorAnd** = `102`

Constant for the ancestor AND group type.

***

### QueryKindAncestorOr

> **QueryKindAncestorOr** = `103`

Constant for the ancestor OR group type.

***

### QueryKindAnd

> **QueryKindAnd** = `1`

Constant for the AND query group type.
All conditions must match for the group to match.

***

### QueryKindBlock

> **QueryKindBlock** = `9`

Constant for the block query type.
Matches blocks according to their properties.

***

### QueryKindBlockMatch

> **QueryKindBlockMatch** = `12`

Constant for the block match query type.
Matches specific blocks by their ID.

***

### QueryKindChainAnd

> **QueryKindChainAnd** = `106`

Constant for the chain AND group type.

***

### QueryKindDescendantAnd

> **QueryKindDescendantAnd** = `104`

Constant for the descendant AND group type.

***

### QueryKindDescendantOr

> **QueryKindDescendantOr** = `105`

Constant for the descendant OR group type.

***

### QueryKindJournal

> **QueryKindJournal** = `3`

Constant for the journal query type.
Matches blocks in journal date range.

***

### QueryKindNoRef

> **QueryKindNoRef** = `7`

Constant for the no-reference query type.
Matches blocks not referencing other blocks.

***

### QueryKindNoTag

> **QueryKindNoTag** = `5`

Constant for the no-tag query type.
Matches blocks without specific tags.

***

### QueryKindNoText

> **QueryKindNoText** = `10`

Constant for the no-text query type.
Matches blocks without specific text.

***

### QueryKindOr

> **QueryKindOr** = `2`

Constant for the OR query group type.
At least one condition must match for the group to match.

***

### QueryKindRef

> **QueryKindRef** = `6`

Constant for the reference query type.
Matches blocks referencing other blocks.

***

### QueryKindSelfAnd

> **QueryKindSelfAnd** = `100`

Constant for the self AND group type.

***

### QueryKindSelfOr

> **QueryKindSelfOr** = `101`

Constant for the self OR group type.

***

### QueryKindTag

> **QueryKindTag** = `4`

Constant for the tag query type.
Matches blocks with specific tags.

***

### QueryKindTask

> **QueryKindTask** = `11`

Constant for the task query type.
Matches blocks that are tasks, optionally filtering by completion status.

***

### QueryKindText

> **QueryKindText** = `8`

Constant for the text query type.
Matches blocks containing specific text.

***

### QueryLe

> **QueryLe** = `10`

Operation constant: less than or equal to.
Matches if a value is less than or equal to the specified value.

***

### QueryLt

> **QueryLt** = `8`

Operation constant: less than.
Matches if a value is less than the specified value.

***

### QueryNotEq

> **QueryNotEq** = `2`

Operation constant: not equals.
Matches if a value is not equal to the specified value.

***

### QueryNotHas

> **QueryNotHas** = `6`

Operation constant: doesn't have property.
Matches if an object doesn't have the specified property.

***

### QueryNotIncludes

> **QueryNotIncludes** = `4`

Operation constant: not includes.
Matches if an array value doesn't include the specified value.

***

### QueryNotNull

> **QueryNotNull** = `12`

Operation constant: is not null.
Matches if a value is neither null nor undefined.

***

### QueryNull

> **QueryNull** = `11`

Operation constant: is null.
Matches if a value is null or undefined.

***

### QuerySort

> **QuerySort** = \[`string`, `"ASC"` \| `"DESC"`\]

Specifies sorting for query results.
A tuple of field name and direction.

***

### QueryStat

> **QueryStat** = `""` \| `"count"` \| `"count_e"` \| `"count_ne"` \| `"sum"` \| `"avg"` \| `"min"` \| `"max"` \| `"percent_e"` \| `"percent_ne"`

Types of statistical operations that can be performed on query results.

***

### Repr

> **Repr** = `object`

Represents a block's structure and type information.
Used by converters and renderers to determine how to handle a block.

#### Indexable

\[`key`: `string`\]: `any`

Additional properties specific to the block type

#### Properties

##### type

> **type**: `string`

The type of the block (e.g., "text", "code", "heading")

***

### TagMenuCommand

> **TagMenuCommand** = `object`

Command configuration for the tag context menu.
Adds custom actions to tag right-click menus.

#### Properties

##### render()

> **render**: (`tagBlock`, `close`, `tagRef?`) => `React.ReactElement`

Function to render the menu item, receiving the tag block, the close function
and the tag reference if called on a tag instance.

###### Parameters

###### tagBlock

[`Block`](#block)

###### close

() => `void`

###### tagRef?

[`BlockRef`](#blockref)

###### Returns

`React.ReactElement`
