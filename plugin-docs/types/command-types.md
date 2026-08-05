[**Orca API Documentation**](../README.md) / [types](README.md) / Command Types

# Command & Interaction Types

Types and APIs related to commands, keyboard shortcuts, menus, cursors, and toolbars.


### `orca.blockMenuCommands`

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


### `orca.commands`

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
being monitored (excluding the cursor argument).

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


### `orca.editorSidetools`

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


### `orca.shortcuts`

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


### `orca.slashCommands`

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


### `orca.tagMenuCommands`

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


### `orca.toolbar`

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


***

### ContextMenuProps

Props for the ContextMenu component

***


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

[`SlashCommand`](#slashcommand).[`icon`](#icon-2)

##### pinyin

> **pinyin**: `string`

Pinyin phonetic representation for improved search in Chinese

##### title

> **title**: `string`

Display title for the command

###### Inherited from

[`SlashCommand`](#slashcommand).[`title`](#title-1)

***


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


***

### EditorArg

> **EditorArg** = \[`string`, [`DbId`](#dbid), [`CursorData`](#cursordata) \| `null`, `boolean`\]

Arguments passed to editor commands.

***


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
