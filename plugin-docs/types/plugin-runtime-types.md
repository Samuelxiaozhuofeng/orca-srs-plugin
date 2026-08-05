[**Orca API Documentation**](../README.md) / [types](README.md) / Plugin Runtime Types

# Plugin Runtime & Utility Types

Types and interfaces for plugin lifecycle, custom renderers, content converters, broadcasts, and backend calls.


### `orca.broadcasts`

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


### `orca.converters`

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

> **inlineConvert**(`format`, `type`, `content`, `forExport?`, `context?`): `Promise`\<`string`\>

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

###### context?

[`ConvertContext`](#convertcontext)

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

(`content`, `forExport?`, `context?`) => `string` \| `Promise`\<`string`\>

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


### `orca.nav`

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

`"left"` | `"top"` | `"bottom"` | `"right"`

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

> **goBack**(`options?`): `void`

Navigates back to a previous panel state in history.

###### Parameters

###### options?

Optional navigation settings

###### steps?

`number`

Number of valid history steps to go back

###### withRedo?

`boolean`

Whether to allow redo (forward navigation) after going back

###### Returns

`void`

###### Example

```ts
// Go back one step with redo support
orca.nav.goBack({ withRedo: true })

// Go back three valid history steps
orca.nav.goBack({ withRedo: true, steps: 3 })
```

###### goForward()

> **goForward**(`options?`): `void`

Navigates forward to a later panel state in history.

###### Parameters

###### options?

Optional navigation settings

###### steps?

`number`

Number of valid history steps to go forward

###### Returns

`void`

###### Example

```ts
orca.nav.goForward()
orca.nav.goForward({ steps: 2 })
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

`"left"` | `"top"` | `"bottom"` | `"right"`

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


### `orca.notify()`

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


### `orca.plugins`

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

###### deployMarketplacePlugin()

> **deployMarketplacePlugin**(`id`, `zipUrl`): `Promise`\<`void`\>

Downloads and deploys a marketplace plugin zip package into the local plugins directory.

###### Parameters

###### id

`string`

###### zipUrl

`string`

###### Returns

`Promise`\<`void`\>

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

###### existsFile()

> **existsFile**(`name`, `filePath`, `pluginAsRoot?`): `Promise`\<`boolean`\>

Checks if a file exists in the plugin's data directory.

###### Parameters

###### name

`string`

The name of the plugin

###### filePath

`string`

The path to the file relative to the plugin's data directory

###### pluginAsRoot?

`boolean`

Whether to use the plugin's directory as the root (defaults to false, which uses the repo's plugin data directory)

###### Returns

`Promise`\<`boolean`\>

A Promise that resolves to true if the file exists, false otherwise

###### Example

```ts
const exists = await orca.plugins.existsFile("my-plugin", "data.json")
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

###### getInstalledVersions()

> **getInstalledVersions**(`ids`): `Promise`\<`Record`\<`string`, `string`\>\>

Reads installed plugin versions from local plugin folders.

###### Parameters

###### ids

`string`[]

###### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

###### listFiles()

> **listFiles**(`name`, `pluginAsRoot?`): `Promise`\<`string`[]\>

Lists all files in the plugin's data directory recursively.

###### Parameters

###### name

`string`

The name of the plugin

###### pluginAsRoot?

`boolean`

Whether to use the plugin's directory as the root (defaults to false, which uses the repo's plugin data directory)

###### Returns

`Promise`\<`string`[]\>

A Promise that resolves to an array of relative file paths

###### Example

```ts
const files = await orca.plugins.listFiles("my-plugin")
console.log("Plugin files:", files)
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

###### readFile()

> **readFile**(`name`, `filePath`, `type?`, `pluginAsRoot?`): `Promise`\<`string` \| `ArrayBuffer`\>

Reads a file from the plugin's data directory in the current repository.

###### Parameters

###### name

`string`

The name of the plugin

###### filePath

`string`

The path to the file relative to the plugin's data directory

###### type?

The expected return type, either "string" or "buffer" (defaults to "string")

`"string"` | `"buffer"`

###### pluginAsRoot?

`boolean`

Whether to use the plugin's directory as the root (defaults to false, which uses the repo's plugin data directory)

###### Returns

`Promise`\<`string` \| `ArrayBuffer`\>

A Promise that resolves to the file content as a string or ArrayBuffer, or null if not found

###### Example

```ts
// Read as string
const config = await orca.plugins.readFile("my-plugin", "config.json")

// Read as binary
const imgData = await orca.plugins.readFile("my-plugin", "icon.png", "buffer")
```

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

###### removeFile()

> **removeFile**(`name`, `filePath`, `pluginAsRoot?`): `Promise`\<`void`\>

Removes a file from the plugin's data directory.

###### Parameters

###### name

`string`

The name of the plugin

###### filePath

`string`

The path to the file relative to the plugin's data directory

###### pluginAsRoot?

`boolean`

Whether to use the plugin's directory as the root (defaults to false, which uses the repo's plugin data directory)

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the file is removed

###### Example

```ts
await orca.plugins.removeFile("my-plugin", "temp-log.txt")
```

###### removeFolder()

> **removeFolder**(`name`, `folderPath`, `pluginAsRoot?`): `Promise`\<`void`\>

Removes a folder from the plugin's data directory.

###### Parameters

###### name

`string`

The name of the plugin

###### folderPath

`string`

The path to the folder relative to the plugin's data directory

###### pluginAsRoot?

`boolean`

Whether to use the plugin's directory as the root (defaults to false, which uses the repo's plugin data directory)

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the folder is removed

###### Example

```ts
await orca.plugins.removeFolder("my-plugin", "temp-folder")
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

###### writeFile()

> **writeFile**(`name`, `filePath`, `data`, `pluginAsRoot?`): `Promise`\<`void`\>

Writes a file to the plugin's data directory in the current repository.
Automatically creates parent directories if they don't exist.

###### Parameters

###### name

`string`

The name of the plugin

###### filePath

`string`

The path to the file relative to the plugin's data directory

###### data

The data to write, either a string or an ArrayBuffer

`string` | `ArrayBuffer`

###### pluginAsRoot?

`boolean`

Whether to use the plugin's directory as the root (defaults to false, which uses the repo's plugin data directory)

###### Returns

`Promise`\<`void`\>

A Promise that resolves when the file is written

###### Example

```ts
await orca.plugins.writeFile("my-plugin", "notes.txt", "Hello Orca!")
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


### `orca.renderers`

##### renderers

> **renderers**: `object`

Renderer management API, used to register custom block and inline content renderers.

###### registerBlock()

> **registerBlock**(`type`, `isEditable`, `renderer`, `opts?`): `void`

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

###### opts?

Optional settings for block rendering.
              - `assetFields`: property names that may contain asset references
                (used for proper asset handling during import/export)
              - `useChildren`: whether this block type renders its children itself
              - `foldInQuery`: whether this block type should be folded in query contexts

###### assetFields?

`string`[]

###### foldInQuery?

`boolean`

###### useChildren?

`boolean`

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
  { assetFields: ["url", "thumbnailUrl"] }
)

// Register a block renderer that uses children for custom layout
orca.renderers.registerBlock(
  "myplugin.tabs",
  false,
  TabsBlock,
  { useChildren: true }
)

// Register a block renderer with query folding metadata
orca.renderers.registerBlock(
  "myplugin.queryCard",
  false,
  QueryCardBlock,
  { foldInQuery: true }
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
  { assetFields: ["image", "attachmentUrl"] }
)
```


### `orca.utils`

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

###### hashArray()

> **hashArray**: (`arr?`) => `number`

Computes a numeric hash from an array of numbers (e.g., block IDs).

This is commonly used in React components as a dependency for memoization
or as a key to detect changes in a block's children structure.

###### Parameters

###### arr?

`number`[]

An array of numbers (e.g., block IDs) to hash, or undefined.
             `undefined` values in the array are treated as 0.

###### Returns

`number`

A signed 32-bit integer hash value. Returns 0 if the array is
         empty, undefined, or falsy.

###### Example

```ts
// Hash an array of block IDs to use as a React dependency
const childrenHash = orca.utils.hashArray(block?.children as any)

// Use in a React hook to detect changes
React.useEffect(() => {
  // Re-run when children structure changes
}, [childrenHash])
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

###### showBlockPreview()

> **showBlockPreview**: (`blockId`, `refElement?`, `rect?`, `interactive?`, `blockEditorActive?`) => () => `void`

Shows a preview popup for a specific block.

###### Parameters

###### blockId

`number`

The ID of the block to preview.

###### refElement?

`HTMLElement`

Optional element to anchor the preview to.

###### rect?

`DOMRect`

Optional bounding rectangle to anchor the preview to if refElement is not provided.

###### interactive?

`boolean`

Whether the preview should be interactive (allow editing).

###### blockEditorActive?

`boolean`

Whether the preview should render with block editor context active (default: false).

###### Returns

A function that, when called, will close the preview.

> (): `void`

###### Returns

`void`

###### Example

```ts
// Show a preview when hovering over a link
const close = orca.utils.showBlockPreview(12345, linkElement)

// Close it later
close()
```

#### Methods


### `orca.invokeBackend()`

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


***

### PluginSettingsSchema

Schema that defines the settings available for a plugin and how they should be presented in the UI.
Each key represents a setting name with its configuration.

***


***

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


***

### APIMsg

> **APIMsg** = `"change-tag-property-choice"` \| `"export-png"` \| `"get-aliased-blocks"` \| `"get-aliases"` \| `"get-aliases-ids"` \| `"get-block"` \| `"get-block-by-alias"` \| `"get-blockid-by-alias"` \| `"get-blocks"` \| `"get-blocks-with-tags"` \| `"get-block-tree"` \| `"get-children-tags"` \| `"get-journal-block"` \| `"get-remindings"` \| `"query"` \| `"search-aliases"` \| `"search-blocks-by-text"` \| `"set-app-config"` \| `"set-config"` \| `"shell-open"` \| `"show-in-folder"` \| `"upload-asset-binary"` \| `"upload-assets"` \| `"image-ocr"` \| `string`

Supported backend API message types for communicating with the Orca backend.
These message types are used with the `invokeBackend` method to perform
various operations on blocks, tags, journals, and other repository data.

***


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


***

### ConvertContext

> **ConvertContext** = `object`

Context for block conversion, used to track export scope.

#### Properties

##### exportRootId?

> `optional` **exportRootId**: [`DbId`](#dbid)

The root block ID of the export scope

##### getBlockById()?

> `optional` **getBlockById**: (`blockId`) => [`Block`](#block) \| `undefined`

Resolve a block from a temporary conversion context before falling back to global state.

###### Parameters

###### blockId

[`DbId`](#dbid)

###### Returns

[`Block`](#block) \| `undefined`

##### getRefById()?

> `optional` **getRefById**: (`refId`) => `Promise`\<\{ `alias?`: `string`; `to`: [`DbId`](#dbid); \} \| `undefined`\>

Resolve an inline reference from a temporary conversion context before hitting the backend.

###### Parameters

###### refId

[`DbId`](#dbid)

###### Returns

`Promise`\<\{ `alias?`: `string`; `to`: [`DbId`](#dbid); \} \| `undefined`\>

***


***

### DbId

> **DbId** = `number`

Database ID type used to uniquely identify blocks and other entities in the database.

***

