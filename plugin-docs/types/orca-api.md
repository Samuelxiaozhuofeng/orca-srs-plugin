[**Orca API Documentation**](../README.md) / [types](README.md) / Orca Global API

# Orca Global API (`orca`)

The main entry point for Orca plugin API. Access via global `orca` object.

## Core Properties & Sub-modules

### Orca

The main Orca API entry, access it with the global `orca` object.

#### Example

```ts
console.log(orca.state.locale)
```

#### Properties


### `orca.ai`

##### ai

> **ai**: `object`

AI/LLM API, used to send messages to and receive responses from AI models configured in Orca.
Supports both standard (single response) and streaming message exchanges,
with optional custom tools for function calling.

###### sendMessage()

> **sendMessage**: (`messages`, `options?`) => `Promise`\<`any`\>

Sends a list of chat messages to the AI model and returns a complete response.
This is a non-streaming API — the Promise resolves once the full reply is ready.

###### Parameters

###### messages

`ChatCompletionMessageParam`[]

An array of chat completion messages representing the conversation history.
                  Each message includes a `role` ("system", "user", or "assistant") and `content`.

###### options?

Optional configuration for the request.

###### extraTools?

`ChatCompletionFunctionTool`[]

Additional function tools to register for the AI model's use during
                            this conversation turn. Each tool follows the OpenAI function tool schema.

###### Returns

`Promise`\<`any`\>

A Promise resolving to the full chat completion response object, augmented with an
         optional `_request_id` field for tracing purposes.

###### Example

```ts
const res = await orca.ai.sendMessage([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Explain what a Promise is in JavaScript." }
])
console.log(res.choices[0].message.content)
```

###### sendStreamMessage()

> **sendStreamMessage**: (`messages`, `controller`, `options?`) => `AsyncGenerator`\<`any`, `void`, `unknown`\>

Sends a list of chat messages to the AI model and returns an async generator
that yields each content delta (streaming chunk) as it arrives.

This is ideal for real-time display of AI responses character-by-character.
The generator yields `Choice.Delta` objects (with `content`, `role`, or tool-call deltas)
augmented with a `reasoning_content` field for models that support reasoning tokens.

###### Parameters

###### messages

`ChatCompletionMessageParam`[]

An array of chat completion messages representing the conversation history.

###### controller

`AbortController`

An `AbortController` that can be used to cancel the stream mid-flight.

###### options?

Optional configuration for the request.

###### extraTools?

`ChatCompletionFunctionTool`[]

Additional function tools to register for the AI model's use during
                            this conversation turn.

###### Returns

`AsyncGenerator`\<`any`, `void`, `unknown`\>

An AsyncGenerator yielding streamed deltas. Each yielded object contains either
         `content`, `role`, `function_call`, or `tool_calls` fields as produced by the model,
         plus a `reasoning_content` string for models that expose chain-of-thought tokens.

###### Example

```ts
const controller = new AbortController()
const stream = orca.ai.sendStreamMessage(
  [{ role: "user", content: "Count from 1 to 5" }],
  controller
)

for await (const delta of stream) {
  if (delta.content) {
    // Append the incoming content to the UI in real time
    outputElement.textContent += delta.content
  }
}
```

###### Example

```ts
// Send a standard message
const response = await orca.ai.sendMessage([
  { role: "user", content: "Summarize this note" }
])
const reply = response.choices[0].message.content

// Stream a message with an abort controller
const controller = new AbortController()
const stream = orca.ai.sendStreamMessage(
  [{ role: "user", content: "Write a poem" }],
  controller
)
for await (const chunk of stream) {
  if (chunk.content) {
    console.log(chunk.content)
  }
}
```


### `orca.state`

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

###### filterInPages?

> `optional` **filterInPages**: `string`

Optional filter for pages shown in the pages panel.
When set, only pages that match this filter will be displayed.

###### Example

```ts
if (orca.state.filterInPages === "my-page") {
  console.log("Pages panel is filtering to show only matching pages")
}
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

> **inlineConverters**: `Record`\<`string`, `Record`\<`string`, (`content`, `forExport?`, `context?`) => `string` \| `Promise`\<`string`\>\> \| `undefined`\>

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

###### pluginMarketplaceOpened

> **pluginMarketplaceOpened**: `boolean`

Indicates whether the plugin marketplace modal is currently opened.

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

###### repoSwitcherOpened

> **repoSwitcherOpened**: `boolean`

Indicates whether the repo switcher modal is currently opened.
This modal allows switching repos with keyboard navigation and filtering.
Set to `true` to open the modal, `false` to close it.

###### Example

```ts
// Open the repo switcher
orca.state.repoSwitcherOpened = true

// Close the repo switcher
orca.state.repoSwitcherOpened = false
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


***

### Choice

> **Choice** = \{ `c?`: `string`; `n`: `string`; \} \| `string`

Type representing a choice with an optional color.
Can be a string or an object with name and optional color.

***

