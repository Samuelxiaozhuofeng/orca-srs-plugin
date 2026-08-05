[**Orca API Documentation**](../README.md)

***

[Orca API Documentation](../modules.md) / Quick Start

# Introduction

The Orca Note plugin system is a powerful extension mechanism that allows developers to add new features, customize interface components, or integrate external services. Through plugins, you can:

- Add new block types and inline content renderers
- Register custom commands and shortcuts
- Extend the application user interface (such as adding toolbar buttons, menu items, etc.)
- Implement integration with external services
- Customize themes and styles
- Enhance existing features or add entirely new functionality

This guide will help you quickly get started with Orca Note plugin development, from setting up your environment to developing your first plugin.

# Environment Requirements

To develop Orca Note plugins, you'll need the following environment and tools:

- **Node.js**: LTS version recommended
- **Editor**: Visual Studio Code recommended
- **Orca Note**: Latest version of Orca Note application installed

# File Structure

A typical Orca Note plugin project structure is as follows:

```
my-orca-plugin/
├── dist/                     # Compiled code
│   ├── index.js              # Compiled plugin file
├── src/
│   ├── main.ts               # Entry file, contains plugin registration and initialization logic
│   ├── orca.d.ts             # Plugin API type definition file
│   └── styles/               # CSS style files
├── icon.png                  # Plugin icon image
├── package.json              # Project configuration
├── tsconfig.json             # TypeScript configuration
├── vite.config.js            # Vite build configuration (if using Vite)
└── README.md                 # Plugin documentation
```

The plugin name is the name of its containing folder. To deploy a plugin, place the plugin folder containing the above files into the `orca/plugins` directory.

## Minimum Required Files

The following files are the minimum required for a functional Orca Note plugin:

- `dist/index.js`: The compiled JavaScript file containing the plugin logic.
- `icon.png`: An icon representing the plugin in the Orca Note interface.

Ensure these files are present in your plugin folder before deployment.

## Main File Descriptions

### package.json

```json
{
  "name": "my-orca-plugin",
  "version": "1.0.0",
  "description": "My Orca Note Plugin",
  "peerDependencies": {
    "react": "^18.2.0",
    "valtio": "^1.13.2"
  }
}
```

### Entry File (main.ts)

The entry file needs to expose the following functions:

- `load`: Called when the plugin is enabled
- `unload`: Called when the plugin is disabled

For example:

```typescript
export async function load(pluginName: string) {
  // Plugin enable logic
  console.log("Plugin enabled")
}

export async function unload() {
  // Plugin disable logic
  console.log("Plugin disabled")
}
```

# Lifecycle

Orca Note plugins follow a simple and clear lifecycle pattern, mainly including the following phases:

## Loading Phase

The plugin package is discovered and loaded into Orca Note but not yet enabled. Plugin metadata is parsed at this time.

## Enable Phase

When a user enables the plugin or the application automatically enables it at startup, the plugin's `load` function is called. This is the main entry point for plugin initialization, typically used to:

- Register commands, renderers, converters, etc.
- Set up event listeners
- Initialize plugin state
- Add UI elements (such as toolbar buttons, sidebars, etc.)

```typescript
export async function load(pluginName: string) {
  // Register command
  orca.commands.registerCommand(
    `${pluginName}.helloWorld`,
    () => {
      orca.notify("info", "Hello from My Plugin!")
    },
    "Show welcome message",
  )

  // Register block renderer
  orca.renderers.registerBlock("myblock", false, MyCustomBlockRenderer)

  // Add toolbar button
  orca.toolbar.registerToolbarButton(`${pluginName}.toolbarButton`, {
    icon: "ti ti-star",
    tooltip: "My Tool Button",
    command: `${pluginName}.helloWorld`,
  })
}
```

## Disable Phase

When a user disables the plugin or the application closes, the plugin's `unload` function is called. At this time, you should:

- Remove all registered commands, renderers, etc.
- Clean up event listeners
- Release resources
- Remove added UI elements

```typescript
export async function unload() {
  // Unregister command
  orca.commands.unregisterCommand(`${pluginName}.helloWorld`)

  // Unregister block renderer
  orca.renderers.unregisterBlock("myblock")

  // Remove toolbar button
  orca.toolbar.unregisterToolbarButton(`${pluginName}.toolbarButton`)
}
```

# Plugin Settings Management

Plugins can define their own settings and provide an UI interface for user configuration:

```typescript
// Define settings schema
const settingsSchema = {
  enableFeatureX: {
    label: "Enable Feature X",
    type: "boolean",
    defaultValue: true,
  },
  userName: {
    label: "Username",
    type: "string",
    defaultValue: "",
  },
}

export async function load(pluginName: string) {
  // Register settings schema
  await orca.plugins.setSettingsSchema(pluginName, settingsSchema)

  // Get settings value
  const settings = orca.state.plugins[pluginName]?.settings
  if (settings?.enableFeatureX) {
    // Execute related logic
  }
}
```

# Model Overview

The Orca Note plugin API provides rich functional interfaces. Here's an overview of the most commonly used models and APIs:

## Core Objects

### orca

The global object `orca` is the main entry point for the plugin system, providing access to all plugin functionality.

### state

`orca.state` contains the current state of the application, including current panels, block data, settings, etc.

```typescript
// Example: Get current language
const currentLocale = orca.state.locale

// Example: Get loaded block data
const currentBlock = orca.state.blocks[blockId]

// Example: Get application settings
const themeMode = orca.state.themeMode // "light" or "dark"
```

Orca Note uses the `valtio` library to manage application state (mounted to `window.Valtio`). You can listen to state changes using the `subscribe` function provided by `valtio` or other supported mechanisms.

## Main API Categories

### Command System

The command system is the most basic extension point for plugins, allowing registration of executable function units:

```typescript
// Register normal command
orca.commands.registerCommand(
  "myplugin.command", // Command ID
  () => {
    /* Command logic */
  }, // Command function
  "Command Display Name", // Command label
)

// Register editor command (supports undo)
orca.commands.registerEditorCommand(
  "myplugin.editorCommand", // Command ID
  doFn, // Execute function
  undoFn, // Undo function
  { label: "Editor Command" }, // Configuration
)

// Execute command
await orca.commands.invokeCommand("core.toggleThemeMode")

// Execute editor command
await orca.commands.invokeEditorCommand("myplugin.editorCommand", cursor)
```

### Render System

Allows registration of custom block types and inline content renderers:

```typescript
// Register block renderer
orca.renderers.registerBlock(
  "myplugin.customBlock", // Block type
  true, // Is editable
  CustomBlockRenderer, // React component
  { assetFields: ["src"] }, // Optional renderer settings
)

// Register inline content renderer
orca.renderers.registerInline(
  "myplugin.customInline", // Inline type
  true, // Is editable
  CustomInlineRenderer, // React component
)
```

Orca Note's UI is based on React 18 (mounted to `window.React`). If you need to develop custom UI components, you can use the globally exposed React directly without importing the React library separately.

### Converter System

Responsible for converting block content between different formats:

```typescript
// Register block converter
orca.converters.registerBlock(
  "html", // Target format
  "myplugin.customBlock", // Block type
  (block, repr) => {
    // Convert function
    return `<div>${block.text}</div>`
  },
)

// Register inline content converter
orca.converters.registerInline(
  "plain", // Target format
  "myplugin.customInline", // Inline type
  (content) => {
    // Convert function
    return content.v.toString()
  },
)
```

### UI Extensions

Allows adding custom UI elements:

```typescript
// Add toolbar button
orca.toolbar.registerToolbarButton("myplugin.toolbarButton", {
  icon: "ti ti-star",
  tooltip: "My Tool Button",
  command: "myplugin.helloWorld",
})

// Add header bar button
orca.headbar.registerHeadbarButton("myplugin.headbarButton", () => (
  <MyHeadbarButtonComponent />
))
```

### Data Storage

Plugins can persistently store data:

```typescript
// Set plugin data
await orca.plugins.setData("myplugin", "key", "value")

// Get plugin data
const value = await orca.plugins.getData("myplugin", "key")

// Remove plugin data
await orca.plugins.removeData("myplugin", "key")
```

### Notification System

Display notification messages:

```typescript
orca.notify(
  "info", // Type: "info" | "success" | "warn" | "error"
  "This is a notification message", // Message content
  {
    // Optional configuration
    title: "Notification Title",
    action: () => {
      /* Execute when notification is clicked */
    },
  },
)
```

## Main Data Models

### Block

Blocks are the basic structural units of Orca Note:

```typescript
interface Block {
  id: DbId // Block ID
  content?: ContentFragment[] // Block content
  text?: string // Plain text content
  created: Date // Creation time
  modified: Date // Modification time
  parent?: DbId // Parent block ID
  left?: DbId // Left block ID
  children: DbId[] // Child block ID list
  aliases: string[] // Alias list
  properties: BlockProperty[] // Property list
  refs: BlockRef[] // Reference list
  backRefs: BlockRef[] // Back reference list
}
```

The `_repr` property is a special object that defines the block's type and stores additional metadata used by renderers and converters. It is stored as an object of type `Repr` named `_repr` within the block's `properties` array. When implementing custom block renderers, the fields within `_repr` are automatically passed as props to your React component.

### Panel

Panels are the main organizational units of the UI:

```typescript
interface ViewPanel {
  id: string // Panel ID
  view: PanelView // View type ("journal" | "block")
  viewArgs: Record<string, any> // View parameters
  viewState: Record<string, any> // View state
  width?: number // Width
  height?: number // Height
  locked?: boolean // Is locked
  wide?: boolean // Is wide screen
}
```

# Conventions

When developing plugins for Orca Note, please adhere to the following conventions to ensure compatibility and maintainability:

1. **Avoid Reserved Names**: Any name starting with an underscore (`_`) is reserved for system use. Plugin developers should not use such names for commands, renderers, settings, or any other identifiers.

2. **Use Unique Prefixes**: To avoid conflicts with other plugins, always include a unique prefix related to your plugin in the names of commands, renderers, and other identifiers. For example, if your plugin is named `myplugin`, use a prefix like `myplugin.` for all identifiers (e.g., `myplugin.commandName`, `myplugin.rendererName`).

3. **Follow Naming Standards**: Use descriptive and consistent naming conventions for all identifiers. This improves readability and helps other developers understand your code.

4. **Respect System Behavior**: Do not override or interfere with system-level commands, renderers, or UI elements unless explicitly allowed by the API.

By following these conventions, you can ensure that your plugin integrates seamlessly with Orca Note and coexists harmoniously with other plugins.

# Project Template

To quickly start development, you can use the following project template:

- [Plugin Template](https://github.com/sethyuan/orca-plugin-template) - Plugin template with documentation and l10n set up.

# Examples

Here are several common plugin development examples to help you quickly get started with Orca Note plugin development:

## 1. Simple Command Plugin

This example shows how to create a simple command that inserts a new block with the current time after the current block:

```tsx
// src/main.ts
export async function load(pluginName: string) {
  // Register command
  orca.commands.registerEditorCommand(
    "myplugin.insertTimeBlock",
    async ([_panelId, _rootBlockId, cursor]) => {
      if (!cursor || !cursor.anchor) return null

      const currentBlock = orca.state.blocks[cursor.anchor.blockId]
      if (!currentBlock) return null

      // Get current time
      const now = new Date()
      const timeStr = now.toLocaleTimeString()

      // Create new block content
      const content = [{ t: "t", v: `Current time is: ${timeStr}` }]

      // Call editor command to insert new block
      await orca.commands.invokeEditorCommand(
        "core.editor.insertBlock",
        null,
        currentBlock,
        "after",
        content,
      )

      return null
    },
    () => {},
    { label: "Insert Time Block" },
  )

  // Register slash command
  orca.slashCommands.registerSlashCommand("myplugin.insertTimeBlock", {
    icon: "ti ti-clock",
    group: "Utilities",
    title: "Insert Time Block",
    command: "myplugin.insertTimeBlock",
  })
}

export async function unload() {
  // Unregister command
  orca.commands.unregisterCommand("myplugin.insertTimeBlock")

  // Remove slash command
  orca.slashCommands.unregisterSlashCommand("myplugin.insertTimeBlock")
}
```

## 2. Custom Block Renderer

This example shows how to create a custom map block renderer:

```tsx
// src/MapBlock.tsx
import type { Block, DbId } from "./orca.d.ts"

const { useRef, useMemo } = window.React
const { useSnapshot } = window.Valtio
const { BlockShell, BlockChildren } = orca.components

type Props = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
  keyword: string // Prop to receive from _repr
}

export default function MapBlockRenderer({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  initiallyCollapsed,
  renderingMode,
  keyword, // Received from _repr
}: Props) {
  const { blocks } = useSnapshot(orca.state)
  const block = blocks[mirrorId ?? blockId]

  const childrenBlocks = useMemo(
    () => (
      <BlockChildren
        blockId={blockId}
        panelId={panelId}
        blockLevel={blockLevel}
        indentLevel={indentLevel}
        renderingMode={renderingMode}
      />
    ),
    [
      blockId,
      panelId,
      blockLevel,
      indentLevel,
      renderingMode,
    ],
  )

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="myplugin-repr-map" // Custom class for the block shell
      contentClassName="myplugin-repr-map-content" // Custom class for the content area
      contentAttrs={{ contentEditable: false }} // Prevent editing the iframe itself
      contentJsx={
        <iframe
          src={`https://ditu.amap.com/search?query=${encodeURIComponent(
            keyword,
          )}`}
          width="100%" // Example width
          height="400" // Example height
          style={{ border: 0 }} // Basic styling
          allow="geolocation" // Permissions for the iframe
        />
      }
      childrenJsx={childrenBlocks}
    />
  )
}

// src/main.ts
import MapBlockRenderer from "./MapBlock"

export async function load(pluginName: string) {
  // Register block renderer
  orca.renderers.registerBlock("myplugin.map", false, MapBlockRenderer)

  // Register block converter
  orca.converters.registerBlock("plain", "myplugin.map", (block, repr) => {
    return `Map of: ${repr.keyword}`
  })

  // Register editor command to insert the map block
  orca.commands.registerEditorCommand(
    "myplugin.insertMapBlockCommand",
    async ([_panelId, _rootBlockId, cursor]) => {
      if (!cursor || !cursor.anchor) return null
      const currentBlock = orca.state.blocks[cursor.anchor.blockId]
      if (!currentBlock) return null

      // Define the representation for the new map block
      const repr = { type: "myplugin.map", keyword: "Beijing" }

      // Insert the new map block after the current block using core.editor.insertBlock
      const newBlockId = await orca.commands.invokeEditorCommand(
        "core.editor.insertBlock",
        null, // No initial content needed
        currentBlock, // Reference block
        "after", // Position
        null, // No content fragments
        repr, // Representation object
      )

      return null // Indicate success
    },
    () => {},
    { label: "Insert Map Block" },
  )

  // Register slash command to trigger the map block insertion
  orca.slashCommands.registerSlashCommand("myplugin.insertMapBlock", {
    icon: "ti ti-map-pin", // Icon for the slash command
    group: "Insert", // Group in the slash command menu
    title: "Insert Map Block", // Title displayed in the menu
    command: "myplugin.insertMapBlockCommand", // The editor command to execute
  })
}

export async function unload() {
  // Unregister block renderer
  orca.renderers.unregisterBlock("myplugin.map")

  // Unregister block converter
  orca.converters.unregisterBlock("plain", "myplugin.map")

  // Unregister the editor command
  orca.commands.unregisterCommand("myplugin.insertMapBlockCommand")

  // Unregister the slash command
  orca.slashCommands.unregisterSlashCommand("myplugin.insertMapBlock")
}
```

## 3. Theme Plugin

This example shows how to create a custom theme:

```typescript
// public/sand-yellow.css
@media (prefers-color-scheme: dark) {
  :root {
    /* Sand Yellow Dark Theme */
    --orca-color-bg-1: #3a3226; /* Dark sand/brown */
    --orca-color-bg-2: #4f4639; /* Slightly lighter sand/brown */
    --orca-color-text-1: #f0e6d6; /* Light sand/beige */
    --orca-color-text-2: #bfae90; /* Muted sand/light brown */
    --orca-color-primary-5: #d4ac0d; /* Golden yellow */
    --orca-color-dangerous-5: #e74c3c; /* Standard danger red, or adjust if needed */
    --orca-color-border: #6b5f4e; /* Mid-tone sand/brown */
    --orca-color-selection: oklch(from var(--orca-color-primary-5) l c h / 50%); /* Selection based on primary */
  }
}

// src/index.ts
export async function load(pluginName: string) {
  // Register custom theme
  orca.themes.register(
    "myplugin",           // Plugin name
    "sand-yellow",          // Theme name
    "sand-yellow.css"  // Theme CSS file path
  )
}

export async function unload() {
  // Unregister custom theme
  orca.themes.unregister("sand-yellow")
}
```
