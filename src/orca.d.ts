declare global {
  declare const orca: Orca
  interface Window {
    orca: Orca
    React: React
    createRoot: Function
    Valtio: any
  }
}

/** The main Orca API entry, access it with the global `orca` object.
 * @example
 * ```ts
 * console.log(orca.state.locale)
 * ```
 */
export interface Orca {
  /**
   * Invokes a backend API with the specified API type and arguments.
   * This is a core method for plugins to communicate with the Orca backend systems.
   *
   * @param type - The API message type to invoke, which specifies what backend functionality to call
   * @param args - Any additional arguments needed by the specified backend API
   * @returns A Promise that resolves with the result from the backend call
   *
   * @example
   * ```ts
   * // Get a block by its ID
   * const block = await orca.invokeBackend("get-block", 12345)
   * console.log(`Block content: ${block.text}`)
   *
   * // Get blocks with specific tags
   * const taggedBlocks = await orca.invokeBackend(
   *   "get-blocks-with-tags",
   *   ["project", "active"]
   * )
   * console.log(`Found ${taggedBlocks.length} active projects`)
   * ```
   */
  invokeBackend(type: APIMsg, ...args: any[]): Promise<any>

  /**
   * The current state of the Orca Note application.
   * This object contains the reactive state that updates as the application changes.
   * Plugins can read from this state to understand the current context and subscribe to changes.
   */
  state: {
    /**
     * The ID of the currently active (focused) panel.
     * This can be used to target operations to the user's current working context.
     *
     * @example
     * ```ts
     * // Get the currently active panel
     * const activePanelId = orca.state.activePanel
     *
     * // Open a block in the currently active panel
     * orca.nav.goTo("block", { blockId: 123 }, activePanelId)
     * ```
     */
    activePanel: string

    /**
     * Registry of block converters that transform block content to different formats.
     * Organized as a nested record with format as the first key and block type as the second.
     *
     * @example
     * ```ts
     * // Check if a converter exists for HTML format and custom block type
     * const hasConverter = !!orca.state.blockConverters?.["html"]?.["myplugin.customBlock"]
     * ```
     */
    blockConverters: Record<
      string,
      | Record<
          string,
          | ((
              blockContent: BlockForConversion,
              repr: Repr,
              block?: Block,
              forExport?: boolean,
            ) => string | Promise<string>)
          | undefined
        >
      | undefined
    >

    /**
     * Registry of block renderer components used to render different block types.
     * Each key is a block type, and the value is the React component used to render it.
     *
     * @example
     * ```ts
     * // Get the renderer for a specific block type
     * const codeBlockRenderer = orca.state.blockRenderers["code"]
     * ```
     */
    blockRenderers: Record<string, any>

    /**
     * Map of all blocks currently loaded in memory, indexed by their database IDs.
     * This provides quick access to block data without needing backend queries.
     *
     * @example
     * ```ts
     * // Get a block by its ID
     * const block = orca.state.blocks[123]
     * if (block) {
     *   console.log(`Block content: ${block.text}`)
     * }
     * ```
     */
    blocks: Record<string | DbId, Block | undefined>

    /**
     * Registry of all registered commands in the application, indexed by their IDs.
     * Each command includes pinyin data for search functionality.
     *
     * @example
     * ```ts
     * // Check if a command exists
     * if (orca.state.commands["core.createBlock"]) {
     *   console.log("Create block command is available")
     * }
     * ```
     */
    commands: Record<string, CommandWithPinyin | undefined>

    /**
     * The absolute path to the application data directory.
     * This is where Orca stores configuration and other application-level data.
     *
     * @example
     * ```ts
     * console.log(`Application data directory: ${orca.state.dataDir}`)
     * ```
     */
    dataDir: string

    /**
     * The absolute path to the current repository directory, if a repository is added from non-standard location.
     * This is where the current note repository is stored on the file system.
     *
     * @example
     * ```ts
     * if (orca.state.repoDir) {
     *   console.log(`Current repository directory: ${orca.state.repoDir}`)
     * }
     * ```
     */
    repoDir?: string

    /**
     * Registry of inline content converters that transform inline content to different formats.
     * Organized as a nested record with format as the first key and content type as the second.
     *
     * @example
     * ```ts
     * // Check if a converter exists for Markdown format and highlight content
     * const hasConverter = !!orca.state.inlineConverters?.["markdown"]?.["highlight"]
     * ```
     */
    inlineConverters: Record<
      string,
      | Record<string, (content: ContentFragment) => string | Promise<string>>
      | undefined
    >

    /**
     * Registry of inline renderer components used to render different inline content types.
     * Each key is a content type, and the value is the React component used to render it.
     *
     * @example
     * ```ts
     * // Get the renderer for a specific inline content type
     * const codeInlineRenderer = orca.state.inlineRenderers["code"]
     * ```
     */
    inlineRenderers: Record<string, any>

    /**
     * Registry of panel renderer components used to render different panel types.
     * Each key is a panel type (e.g., "journal", "block"), and the value is the React component used to render it.
     *
     * @example
     * ```ts
     * // Get the renderer for a specific panel type
     * const journalPanelRenderer = orca.state.panelRenderers["journal"]
     * ```
     */
    panelRenderers: Record<string, any>

    /**
     * The current locale of the application (e.g., "en" for English, "zh-CN" for Chinese).
     * This determines the language used for the UI and can be used for localization.
     *
     * @example
     * ```ts
     * if (orca.state.locale === "zh-CN") {
     *   console.log("Chinese language is active")
     * }
     * ```
     */
    locale: string

    /**
     * Array of active notifications currently displayed to the user.
     * Each notification includes a type, message, and optional title and action.
     *
     * @example
     * ```ts
     * // Check if there are any error notifications active
     * const hasErrors = orca.state.notifications.some(n => n.type === "error")
     * ```
     */
    notifications: Notification[]

    /**
     * History of past panel states for backward navigation.
     * This is used to implement the back button functionality in the UI.
     *
     * @example
     * ```ts
     * // Check if there are states to navigate back to
     * const canGoBack = orca.state.panelBackHistory.length > 0
     * ```
     */
    panelBackHistory: PanelHistory[]

    /**
     * History of forward panel states for forward navigation after going back.
     * This is used to implement the forward button functionality in the UI.
     *
     * @example
     * ```ts
     * // Check if there are states to navigate forward to
     * const canGoForward = orca.state.panelForwardHistory.length > 0
     * ```
     */
    panelForwardHistory: PanelHistory[]

    /**
     * The root panel structure that defines the current layout of the application.
     * This contains all panels and their arrangement in rows and columns.
     *
     * @example
     * ```ts
     * // Access the structure of all panels
     * const rootPanel = orca.state.panels
     * console.log(`Root panel ID: ${rootPanel.id}`)
     * console.log(`Number of child panels: ${rootPanel.children.length}`)
     * ```
     */
    panels: RowPanel

    /**
     * Registry of all installed plugins, indexed by their names.
     * Each entry contains the plugin metadata and its loaded module if active.
     *
     * @example
     * ```ts
     * // Check if a plugin is installed and enabled
     * const myPlugin = orca.state.plugins["my-plugin"]
     * if (myPlugin && myPlugin.enabled) {
     *   console.log("My plugin is installed and enabled")
     * }
     * ```
     */
    plugins: Record<string, Plugin | undefined>

    /**
     * The name of the current repository.
     * This is the identifier for the currently open note repository.
     *
     * @example
     * ```ts
     * console.log(`Current repository: ${orca.state.repo}`)
     * ```
     */
    repo: string

    /**
     * Application and repository settings, indexed by their numeric IDs.
     * Contains configuration values for both the application and the current repository.
     *
     * @example
     * ```ts
     * // Access a specific setting by its ID
     * const editorFontSize = orca.state.settings[12345]
     * ```
     */
    settings: Record<number, any>

    /**
     * Indicates whether the settings panel is currently opened.
     * This can be used to conditionally change behavior when settings are being edited.
     *
     * @example
     * ```ts
     * if (orca.state.settingsOpened) {
     *   console.log("Settings panel is currently open")
     * }
     * ```
     */
    settingsOpened: boolean

    /**
     * Indicates whether the command palette is currently opened.
     * This can be used to conditionally change behavior when the command palette is active.
     *
     * @example
     * ```ts
     * if (orca.state.commandPaletteOpened) {
     *   console.log("Command palette is currently open")
     * }
     * ```
     */
    commandPaletteOpened: boolean

    /**
     * Indicates whether the global search panel is currently opened.
     * This can be used to conditionally change behavior when search is active.
     *
     * @example
     * ```ts
     * if (orca.state.globalSearchOpened) {
     *   console.log("Global search is currently open")
     * }
     * ```
     */
    globalSearchOpened: boolean

    /**
     * Registry of keyboard shortcuts, mapping shortcut strings to command IDs.
     * This defines the current keyboard bindings in the application.
     *
     * @example
     * ```ts
     * // Find the command bound to a specific shortcut
     * const boundCommand = orca.state.shortcuts["ctrl+shift+p"]
     * if (boundCommand) {
     *   console.log(`Command ${boundCommand} is bound to Ctrl+Shift+P`)
     * }
     * ```
     */
    shortcuts: Record<string, string | undefined>

    /**
     * The current theme mode of the application ("light" or "dark").
     * This determines whether the light or dark theme variant is active.
     *
     * @example
     * ```ts
     * if (orca.state.themeMode === "dark") {
     *   console.log("Dark theme is active")
     * }
     * ```
     */
    themeMode: "light" | "dark"

    /**
     * Registry of installed themes, mapping theme names to CSS file paths.
     * This defines all available themes that can be selected.
     *
     * @example
     * ```ts
     * // Get the CSS file path for a specific theme
     * const oceanThemePath = orca.state.themes["Ocean Blue"]
     * ```
     */
    themes: Record<string, string | undefined>

    /**
     * Registry of custom buttons registered for the header bar.
     * Each entry contains a render function that returns a React element.
     *
     * @example
     * ```ts
     * // Check if a specific headbar button is registered
     * const hasMyButton = !!orca.state.headbarButtons["myplugin.syncButton"]
     * ```
     */
    headbarButtons: Record<string, (() => React.ReactElement) | undefined>

    /**
     * Registry of toolbar buttons or button groups registered for the editor toolbar.
     * Each entry can be a single button configuration or an array of related buttons.
     *
     * @example
     * ```ts
     * // Check if a specific toolbar button is registered
     * const hasFormatButton = !!orca.state.toolbarButtons["myplugin.formatButton"]
     * ```
     */
    toolbarButtons: Record<
      string,
      (ToolbarButton | ToolbarButton[]) | undefined
    >

    /**
     * Registry of slash commands available in the editor, indexed by their IDs.
     * Each command includes pinyin data for search functionality.
     *
     * @example
     * ```ts
     * // Check if a specific slash command is registered
     * const hasInsertChartCommand = !!orca.state.slashCommands["myplugin.insertChart"]
     * ```
     */
    slashCommands: Record<string, SlashCommandWithPinyin | undefined>

    /**
     * Registry of block menu commands that appear in block context menus.
     * These commands provide custom actions for blocks.
     *
     * @example
     * ```ts
     * // Check if a specific block menu command is registered
     * const hasExportCommand = !!orca.state.blockMenuCommands["myplugin.exportBlock"]
     * ```
     */
    blockMenuCommands: Record<string, BlockMenuCommand | undefined>

    /**
     * Registry of tag menu commands that appear in tag context menus.
     * These commands provide custom actions for tags.
     *
     * @example
     * ```ts
     * // Check if a specific tag menu command is registered
     * const hasTagStatsCommand = !!orca.state.tagMenuCommands["myplugin.tagStats"]
     * ```
     */
    tagMenuCommands: Record<string, TagMenuCommand | undefined>

    /**
     * Registry of editor sidetools that appear in the block editor's sidebar.
     * These tools provide additional functionality in the editor sidebar.
     *
     * @example
     * ```ts
     * // Check if a specific editor sidetool is registered
     * const hasTocTool = !!orca.state.editorSidetools["myplugin.toc"]
     * ```
     */
    editorSidetools: Record<string, EditorSidetool | undefined>

    /**
     * The currently active tab in the sidebar.
     * This indicates which sidebar section is currently displayed.
     *
     * @example
     * ```ts
     * if (orca.state.sidebarTab === "tags") {
     *   console.log("Tags tab is currently active in sidebar")
     * }
     * ```
     */
    sidebarTab: string

    /**
     * Optional filter for tags shown in the tags panel.
     * When set, only tags that match this filter will be displayed.
     *
     * @example
     * ```ts
     * if (orca.state.filterInTags === "project") {
     *   console.log("Tag panel is filtering to show only project tags")
     * }
     * ```
     */
    filterInTags?: string
  }

  /**
   * Commands API, used to register, invoke, and manage commands in Orca.
   * Commands are the primary way to add functionality to Orca, and can be bound to shortcuts,
   * toolbar buttons, slash commands, and more.
   *
   * @example
   * ```ts
   * // Register a simple command
   * orca.commands.registerCommand(
   *   "myplugin.sayHello",
   *   (name) => {
   *     orca.notify("info", `Hello, ${name || "world"}!`)
   *   },
   *   "Say Hello"
   * )
   *
   * // Invoke a command
   * await orca.commands.invokeCommand("myplugin.sayHello", "User")
   * ```
   */
  commands: {
    /**
     * Registers a new command with Orca.
     *
     * @param id - A unique identifier for the command
     * @param fn - The function to execute when the command is invoked
     * @param label - A human-readable label for the command
     *
     * @example
     * ```ts
     * // Register a simple command
     * orca.commands.registerCommand(
     *   "myplugin.exportAsPDF",
     *   async () => {
     *     // Command implementation
     *     const result = await exportCurrentDocumentAsPDF()
     *     orca.notify("success", "Document exported as PDF successfully")
     *   },
     *   "Export as PDF"
     * )
     * ```
     */
    registerCommand(id: string, fn: CommandFn, label: string): void

    /**
     * Unregisters a previously registered command.
     *
     * @param id - The identifier of the command to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.commands.unregisterCommand("myplugin.exportAsPDF")
     * ```
     */
    unregisterCommand(id: string): void

    /**
     * Registers an editor command that can be undone/redone in the editor.
     * Editor commands are automatically added to the undo/redo stack.
     *
     * @param id - A unique identifier for the command
     * @param doFn - The function to execute when the command is invoked
     * @param undoFn - The function to execute when the command is undone
     * @param opts - Options for the command including label, whether it has arguments, and if focus is needed
     *
     * @example
     * ```ts
     * // Register an editor command to format text
     * orca.commands.registerEditorCommand(
     *   "myplugin.formatSelectedText",
     *   // Do function
     *   ([panelId, rootBlockId, cursor]) => {
     *     // Get the selected text
     *     const selection = window.getSelection()
     *     if (!selection || selection.isCollapsed) return null
     *
     *     // const formattedText = ...
     *
     *     // Return undo arguments
     *     return {
     *       ret: formattedText,
     *       undoArgs: { text: formattedText }
     *     }
     *   },
     *   // Undo function
     *   (panelId, { text }) => {
     *     // ...
     *   },
     *   {
     *     label: "Format Selected Text",
     *     hasArgs: false
     *   }
     * )
     * ```
     */
    registerEditorCommand(
      id: string,
      doFn: EditorCommandFn,
      undoFn: CommandFn,
      opts: { label: string; hasArgs?: boolean; noFocusNeeded?: boolean },
    ): void

    /**
     * Unregisters a previously registered editor command.
     *
     * @param id - The identifier of the editor command to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.commands.unregisterEditorCommand("myplugin.formatSelectedText")
     * ```
     */
    unregisterEditorCommand(id: string): void

    /**
     * Invokes a command by its ID with optional arguments.
     *
     * @param id - The identifier of the command to invoke
     * @param args - Optional arguments to pass to the command
     * @returns A Promise that resolves to the result of the command execution
     *
     * @example
     * ```ts
     * // Invoke a command without arguments
     * await orca.commands.invokeCommand("myplugin.refreshData")
     *
     * // Invoke a command with arguments
     * const result = await orca.commands.invokeCommand(
     *   "myplugin.searchDocuments",
     *   "search query",
     * )
     * ```
     */
    invokeCommand(id: string, ...args: any[]): Promise<any>

    /**
     * Invokes an editor command by its ID with cursor context and optional arguments.
     *
     * @param id - The identifier of the editor command to invoke
     * @param cursor - The cursor data context for the command, or null
     * @param args - Optional arguments to pass to the command
     * @returns A Promise that resolves to the result of the command execution
     *
     * @example
     * ```ts
     * // Invoke an editor command
     * await orca.commands.invokeEditorCommand(
     *   "core.editor.insertFragments",
     *   null,
     *   [{t: "t", v: "Text to insert"}]
     * )
     * ```
     */
    invokeEditorCommand(
      id: string,
      cursor: CursorData | null,
      ...args: any[]
    ): Promise<any>

    /**
     * Invokes an editor command (as a top command) by its ID with cursor context and optional arguments.
     *
     * @param id - The identifier of the editor command to invoke
     * @param cursor - The cursor data context for the command, or null
     * @param args - Optional arguments to pass to the command
     * @returns A Promise that resolves to the result of the command execution
     *
     * @example
     * ```ts
     * // Invoke an editor command
     * await orca.commands.invokeEditorCommand(
     *   "core.editor.insertFragments",
     *   null,
     *   [{t: "t", v: "Text to insert"}]
     * )
     * ```
     */
    invokeTopEditorCommand(
      id: string,
      cursor: CursorData | null,
      ...args: any[]
    ): Promise<any>

    /**
     * Executes a group of commands as a single undoable operation.
     * This is useful when multiple commands should be treated as a single step in the undo/redo history.
     *
     * @param callback - An async function that will perform multiple command operations
     * @param options - Optional configuration for the command group
     * @param options.undoable - Whether the command group should be undoable (defaults to true)
     * @param options.topGroup - Whether this is a top-level command group not nested in another group (defaults to false)
     *
     * @example
     * ```ts
     * // Group multiple editor commands as one undoable operation
     * await orca.commands.invokeGroup(async () => {
     *   // Create a heading block
     *   const headingId = await orca.commands.invokeEditorCommand(
     *     "core.editor.insertBlock",
     *     null,
     *     null, // If there is no reference block, this is null
     *     null, // Since it's null, the position parameter here is also null
     *     null, // No content
     *     { type: "heading", level: 1 }, // repr parameter, defines this as a level 1 heading
     *   )
     *
     *   // Add a content block under the heading block
     *   await orca.commands.invokeEditorCommand(
     *     "core.editor.insertBlock",
     *     null,
     *     orca.state.blocks[headingId], // Reference block (heading block)
     *     "lastChild", // Position: as the last child of the heading block
     *     [{ t: "t", v: "This is the first paragraph." }], // Content
     *     { type: "text" } // repr parameter
     *   )
     *
     *   // Add another content block
     *   await orca.commands.invokeEditorCommand(
     *     "core.editor.insertBlock",
     *     null,
     *     orca.state.blocks[headingId], // Reference block (heading block)
     *     "lastChild", // Position: as the last child of the heading block
     *     [{ t: "t", v: "This is the second paragraph." }], // Content
     *     { type: "text" } // repr parameter
     *   )
     * })
     * ```
     */
    invokeGroup(
      callback: () => Promise<void>,
      options?: {
        undoable?: boolean
        topGroup?: boolean
      },
    ): Promise<void>

    /**
     * Registers a "before command" hook to conditionally prevent a command from executing.
     *
     * @param id - The identifier of the command to hook into
     * @param pred - A predicate function that returns true if the command should proceed, false to cancel.
     * The first parameter is the command ID, followed by the arguments of the command being monitored.
     *
     * @example
     * ```ts
     * // Prevent deletion of locked blocks
     * orca.commands.registerBeforeCommand(
     *   "core.editor.deleteBlocks",
     *   (cmdId, blockIds) => {
     *     // Check if any of the blocks are locked
     *     const hasLockedBlock = blockIds.some(id => isBlockLocked(id))
     *
     *     if (hasLockedBlock) {
     *       orca.notify("error", "Cannot delete locked blocks")
     *       return false // Prevent the command from executing
     *     }
     *
     *     return true // Allow the command to proceed
     *   }
     * )
     * ```
     */
    registerBeforeCommand(id: string, pred: BeforeHookPred): void

    /**
     * Unregisters a previously registered "before command" hook.
     *
     * @param id - The identifier of the command
     * @param pred - The predicate function to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.commands.unregisterBeforeCommand(
     *   "core.editor.deleteBlocks",
     *   myBeforeDeleteHook
     * )
     * ```
     */
    unregisterBeforeCommand(id: string, pred: BeforeHookPred): void

    /**
     * Registers an "after command" hook to execute code after a command completes.
     *
     * @param id - The identifier of the command to hook into
     * @param fn - The function to execute after the command completes. The first
     * parameter is the command ID, followed by the arguments of the command
     * being monitored.
     *
     * @example
     * ```ts
     * // Log when blocks are deleted
     * orca.commands.registerAfterCommand(
     *   "core.editor.deleteBlocks",
     *   (cmdId, blockIds) => {
     *     console.log(`Deleted blocks: ${blockIds.join(", ")}`)
     *
     *     // Update UI or perform additional operations
     *     updateBlockCountDisplay()
     *   }
     * )
     * ```
     */
    registerAfterCommand(id: string, fn: AfterHook): void

    /**
     * Unregisters a previously registered "after command" hook.
     *
     * @param id - The identifier of the command
     * @param fn - The function to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.commands.unregisterAfterCommand(
     *   "core.editor.deleteBlocks",
     *   myAfterDeleteHook
     * )
     * ```
     */
    unregisterAfterCommand(id: string, fn: AfterHook): void
  }

  /**
   * Keyboard shortcuts management API, used to assign, reset and reload keyboard shortcuts.
   *
   * @example
   * ```ts
   * // Assign a new keyboard shortcut
   * await orca.shortcuts.assign("ctrl+shift+k", "myplugin.myCommand")
   *
   * // Reset a command to its default shortcut
   * await orca.shortcuts.reset("myplugin.myCommand")
   * ```
   */
  shortcuts: {
    /**
     * Reloads all keyboard shortcuts from the database.
     * Usually not needed to be called directly as the system handles this automatically.
     *
     * @returns A Promise that resolves when shortcuts are reloaded
     */
    reload(): Promise<void>

    /**
     * Assigns a keyboard shortcut to a command.
     * If the shortcut is empty, it will remove the shortcut from the command.
     *
     * @param shortcut - The keyboard shortcut string (e.g., "ctrl+shift+k" or "meta+p")
     * @param command - The command ID to bind the shortcut to
     * @returns A Promise that resolves when the shortcut is assigned
     *
     * @example
     * ```ts
     * // Assign a shortcut
     * await orca.shortcuts.assign("ctrl+shift+k", "myplugin.myCommand")
     *
     * // Remove a shortcut
     * await orca.shortcuts.assign("", "myplugin.myCommand")
     * ```
     */
    assign(shortcut: string, command: string): Promise<void>

    /**
     * Resets a command to its default keyboard shortcut.
     *
     * @param command - The command ID to reset
     * @returns A Promise that resolves when the shortcut is reset
     *
     * @example
     * ```ts
     * await orca.shortcuts.reset("core.toggleThemeMode")
     * ```
     */
    reset(command: string): Promise<void>
  }

  /**
   * Navigation API, used to control Orca's panel navigation and layout.
   * Provides methods for managing panels, navigating between views, and handling navigation history.
   *
   * @example
   * ```ts
   * // Open a block in the current panel
   * orca.nav.goTo("block", { blockId: 123 })
   *
   * // Open a block in a new panel
   * orca.nav.openInLastPanel("block", { blockId: 123 })
   * ```
   */
  nav: {
    /**
     * Adds a new panel next to an existing panel in the specified direction.
     *
     * @param id - The ID of the existing panel to add the new panel next to
     * @param dir - The direction to add the panel ("top", "bottom", "left", or "right")
     * @param src - Optional parameters for the new panel's view, view arguments, and state
     * @returns The ID of the newly created panel, or null if the panel couldn't be created
     *
     * @example
     * ```ts
     * // Add a new panel to the right of the current panel
     * const newPanelId = orca.nav.addTo(orca.state.activePanel, "right")
     * ```
     */
    addTo(
      id: string,
      dir: "top" | "bottom" | "left" | "right",
      src?: Pick<ViewPanel, "view" | "viewArgs" | "viewState">,
    ): string | null

    /**
     * Moves a panel from one location to another in the specified direction.
     *
     * @param from - The ID of the panel to move
     * @param to - The ID of the destination panel
     * @param dir - The direction to move the panel relative to the destination panel
     *
     * @example
     * ```ts
     * // Move panel1 to the bottom of panel2
     * orca.nav.move("panel1", "panel2", "bottom")
     * ```
     */
    move(
      from: string,
      to: string,
      dir: "top" | "bottom" | "left" | "right",
    ): void

    /**
     * Closes a panel by its ID.
     *
     * @param id - The ID of the panel to close
     *
     * @example
     * ```ts
     * // Close the current panel
     * orca.nav.close(orca.state.activePanel)
     * ```
     */
    close(id: string): void

    /**
     * Closes all panels except the specified one.
     *
     * @param id - The ID of the panel to keep open
     *
     * @example
     * ```ts
     * // Close all panels except the current one
     * orca.nav.closeAllBut(orca.state.activePanel)
     * ```
     */
    closeAllBut(id: string): void

    /**
     * Changes the sizes of panels starting from the specified panel.
     *
     * @param startPanelId - The ID of the starting panel
     * @param values - Array of new size values
     *
     * @example
     * ```ts
     * // Resize panels starting from the current panel
     * orca.nav.changeSizes(orca.state.activePanel, [300, 700])
     * ```
     */
    changeSizes(startPanelId: string, values: number[]): void

    /**
     * Switches focus to the specified panel.
     *
     * @param id - The ID of the panel to focus
     *
     * @example
     * ```ts
     * orca.nav.switchFocusTo("panel1")
     * ```
     */
    switchFocusTo(id: string): void

    /**
     * Navigates back to the previous panel state in history.
     *
     * @param withRedo - Whether to allow redo (forward navigation) after going back
     *
     * @example
     * ```ts
     * // Go back with redo support
     * orca.nav.goBack(true)
     * ```
     */
    goBack(withRedo?: boolean): void

    /**
     * Navigates forward to the next panel state in history.
     *
     * @example
     * ```ts
     * orca.nav.goForward()
     * ```
     */
    goForward(): void

    /**
     * Navigates to a specific view in the specified panel or current active panel.
     *
     * @param view - The type of view to navigate to ("journal" or "block")
     * @param viewArgs - Arguments for the view, such as blockId or date
     * @param panelId - Optional panel ID to navigate in, defaults to active panel
     *
     * @example
     * ```ts
     * // Open a specific block in the current panel
     * orca.nav.goTo("block", { blockId: 123 })
     *
     * // Open today's journal in a specific panel
     * orca.nav.goTo("journal", { date: new Date() }, "panel1")
     * ```
     */
    goTo(
      view: PanelView,
      viewArgs?: Record<string, any>,
      panelId?: string,
    ): void

    /**
     * Replace the view of a panel without recording history.
     *
     * This updates the specified panel's view and its view arguments in-place.
     * If `panelId` is omitted, the currently active panel is used. This method
     * does not push an entry into the panel back/forward history stacks (unlike
     * `nav.goTo`).
     *
     * @param view - The view type to display in the panel (e.g. "journal" | "block").
     * @param viewArgs - Optional arguments passed to the view. Usually an object
     *   containing identifiers such as `{ blockId }` or `{ date }`.
     * @param panelId - Optional panel id to target. Defaults to the active panel.
     * @returns void
     *
     * @example
     * ```ts
     * // Replace the active panel with a block view
     * orca.nav.replace("block", { blockId: 123 })
     *
     * // Replace a specific panel by id
     * orca.nav.replace("journal", { date: new Date() }, panelId)
     * ```
     */
    replace(
      view: PanelView,
      viewArgs?: Record<string, any>,
      panelId?: string,
    ): void

    /**
     * Opens a view in the last used panel or creates a new one if needed.
     * Useful for opening content in a separate panel.
     *
     * @param view - The type of view to open ("journal" or "block")
     * @param viewArgs - Arguments for the view, such as blockId or date
     *
     * @example
     * ```ts
     * // Open a block in a new or last used panel
     * orca.nav.openInLastPanel("block", { blockId: 123 })
     * ```
     */
    openInLastPanel(view: PanelView, viewArgs?: Record<string, any>): void

    /**
     * Finds a view panel by its ID within the panel structure.
     *
     * @param id - The ID of the panel to find
     * @param panels - The root panel structure to search in
     * @returns The found ViewPanel or null if not found
     *
     * @example
     * ```ts
     * const panel = orca.nav.findViewPanel("panel1", orca.state.panels)
     * if (panel) {
     *   console.log("Panel view:", panel.view)
     * }
     * ```
     */
    findViewPanel(id: string, panels: RowPanel): ViewPanel | null

    /**
     * Checks if there is more than one view panel open.
     *
     * @returns True if there is more than one view panel, false otherwise
     *
     * @example
     * ```ts
     * if (orca.nav.isThereMoreThanOneViewPanel()) {
     *   console.log("Multiple panels are open")
     * }
     * ```
     */
    isThereMoreThanOneViewPanel(): boolean

    /**
     * Focuses the next panel in the tab order.
     *
     * @example
     * ```ts
     * orca.nav.focusNext()
     * ```
     */
    focusNext(): void

    /**
     * Focuses the previous panel in the tab order.
     *
     * @example
     * ```ts
     * orca.nav.focusPrev()
     * ```
     */
    focusPrev(): void
  }

  /**
   * Plugin management API, used to register, enable, disable, and manage plugin data and settings.
   *
   * @example
   * ```ts
   * // Register a plugin
   * await orca.plugins.register("my-plugin")
   *
   * // Set plugin settings schema
   * await orca.plugins.setSettingsSchema("my-plugin", {
   *   apiKey: {
   *     label: "API Key",
   *     description: "Your API key for the service",
   *     type: "string"
   *   }
   * })
   * ```
   */
  plugins: {
    /**
     * Registers a plugin with Orca.
     * This is typically called automatically when a plugin is installed.
     *
     * @param name - The name of the plugin to register
     * @returns A Promise that resolves when the plugin is registered
     *
     * @example
     * ```ts
     * await orca.plugins.register("my-plugin")
     * ```
     */
    register(name: string): Promise<void>

    /**
     * Unregisters a plugin from Orca.
     * This is typically called automatically when a plugin is uninstalled.
     *
     * @param name - The name of the plugin to unregister
     * @returns A Promise that resolves when the plugin is unregistered
     *
     * @example
     * ```ts
     * await orca.plugins.unregister("my-plugin")
     * ```
     */
    unregister(name: string): Promise<void>

    /**
     * Enables a previously disabled plugin.
     *
     * @param name - The name of the plugin to enable
     * @returns A Promise that resolves when the plugin is enabled
     *
     * @example
     * ```ts
     * await orca.plugins.enable("my-plugin")
     * ```
     */
    enable(name: string): Promise<void>

    /**
     * Disables a plugin without unregistering it.
     * The plugin will remain installed but won't be loaded until enabled again.
     *
     * @param name - The name of the plugin to disable
     * @returns A Promise that resolves when the plugin is disabled
     *
     * @example
     * ```ts
     * await orca.plugins.disable("my-plugin")
     * ```
     */
    disable(name: string): Promise<void>

    /**
     * Sets the settings schema for a plugin, defining what settings are available
     * and how they should be presented in the UI.
     *
     * @param name - The name of the plugin
     * @param schema - The settings schema defining available settings
     * @returns A Promise that resolves when the schema is set
     *
     * @example
     * ```ts
     * await orca.plugins.setSettingsSchema("my-plugin", {
     *   apiKey: {
     *     label: "API Key",
     *     description: "Your API key for the service",
     *     type: "string"
     *   },
     *   enableFeature: {
     *     label: "Enable Feature",
     *     description: "Turn on advanced features",
     *     type: "boolean",
     *     defaultValue: false
     *   }
     * })
     * ```
     */
    setSettingsSchema(name: string, schema: PluginSettingsSchema): Promise<void>

    /**
     * Sets settings for a plugin at either the application or repository level.
     *
     * @param to - The scope of the settings ("app" for application-wide or "repo" for repository-specific)
     * @param name - The name of the plugin
     * @param settings - The settings to set
     * @returns A Promise that resolves when settings are saved
     *
     * @example
     * ```ts
     * // Save app-level settings
     * await orca.plugins.setSettings("app", "my-plugin", {
     *   apiKey: "sk-123456789",
     *   theme: "dark"
     * })
     *
     * // Save repo-specific settings
     * await orca.plugins.setSettings("repo", "my-plugin", {
     *   customTemplates: ["template1", "template2"]
     * })
     * ```
     */
    setSettings(
      to: "app" | "repo",
      name: string,
      settings: Record<string, any>,
    ): Promise<void>

    /**
     * Loads a plugin with the given schema and settings.
     * This is typically called internally by the plugin system.
     *
     * @param name - The name of the plugin to load
     * @param schema - The settings schema for the plugin
     * @param settings - The current settings for the plugin
     * @returns A Promise that resolves when the plugin is loaded
     */
    load(
      name: string,
      schema: PluginSettingsSchema,
      settings: Record<string, any>,
    ): Promise<void>

    /**
     * Unloads a plugin. This is called when disabling or unregistering a plugin.
     * This is typically called internally by the plugin system.
     *
     * @param name - The name of the plugin to unload
     * @returns A Promise that resolves when the plugin is unloaded
     */
    unload(name: string): Promise<void>

    /**
     * Gets all data keys stored by a plugin.
     *
     * @param name - The name of the plugin
     * @returns A Promise that resolves to an array of key strings
     *
     * @example
     * ```ts
     * const keys = await orca.plugins.getDataKeys("my-plugin")
     * console.log("Stored data keys:", keys)
     * ```
     */
    getDataKeys(name: string): Promise<string[]>

    /**
     * Retrieves data stored by a plugin.
     *
     * @param name - The name of the plugin
     * @param key - The key of the data to retrieve
     * @returns A Promise that resolves to the stored data
     *
     * @example
     * ```ts
     * const userData = await orca.plugins.getData("my-plugin", "user-preferences")
     * console.log("User preferences:", userData)
     * ```
     */
    getData(name: string, key: string): Promise<any>

    /**
     * Stores data for a plugin.
     *
     * @param name - The name of the plugin
     * @param key - The key to store the data under
     * @param value - The data to store (string, number, ArrayBuffer, or null)
     * @returns A Promise that resolves when the data is stored
     *
     * @example
     * ```ts
     * await orca.plugins.setData(
     *   "my-plugin",
     *   "user-preferences",
     *   JSON.stringify({ theme: "dark", fontSize: 14 })
     * )
     * ```
     */
    setData(
      name: string,
      key: string,
      value: string | number | ArrayBuffer | null,
    ): Promise<void>

    /**
     * Removes a specific piece of data stored by a plugin.
     *
     * @param name - The name of the plugin
     * @param key - The key of the data to remove
     * @returns A Promise that resolves when the data is removed
     *
     * @example
     * ```ts
     * await orca.plugins.removeData("my-plugin", "cached-results")
     * ```
     */
    removeData(name: string, key: string): Promise<void>

    /**
     * Removes all data stored by a plugin.
     *
     * @param name - The name of the plugin
     * @returns A Promise that resolves when all data is cleared
     *
     * @example
     * ```ts
     * await orca.plugins.clearData("my-plugin")
     * ```
     */
    clearData(name: string): Promise<void>
  }

  /**
   * Theme management API, used to register, unregister, and manage visual themes.
   *
   * @example
   * ```ts
   * // Register a theme from a plugin
   * orca.themes.register("my-plugin", "Dark Ocean", "themes/dark-ocean.css")
   * ```
   */
  themes: {
    /**
     * Registers a theme with Orca.
     *
     * @param pluginName - The name of the plugin registering the theme
     * @param themeName - The display name of the theme
     * @param themeFileName - The file path to the theme CSS file (relative to plugin directory)
     *
     * @example
     * ```ts
     * orca.themes.register("my-plugin", "Dark Ocean", "themes/dark-ocean.css")
     * ```
     */
    register(pluginName: string, themeName: string, themeFileName: string): void

    /**
     * Unregisters a theme.
     *
     * @param themeName - The name of the theme to unregister
     *
     * @example
     * ```ts
     * orca.themes.unregister("Dark Ocean")
     * ```
     */
    unregister(themeName: string): void

    /**
     * Injects a CSS resource into the application.
     * Useful for adding styles that are not part of a theme but are needed by a plugin.
     *
     * @param url - The URL or path to the CSS resource
     * @param role - A unique identifier for the resource to allow for later removal
     *
     * @example
     * ```ts
     * orca.themes.injectCSSResource("styles/my-plugin-styles.css", "my-plugin-ui")
     * ```
     */
    injectCSSResource(url: string, role: string): void

    /**
     * Removes previously injected CSS resources with the specified role.
     *
     * @param role - The role identifier of the CSS resources to remove
     *
     * @example
     * ```ts
     * orca.themes.removeCSSResources("my-plugin-ui")
     * ```
     */
    removeCSSResources(role: string): void
  }

  /**
   * Renderer management API, used to register custom block and inline content renderers.
   *
   * @example
   * ```ts
   * // Register a custom block renderer
   * orca.renderers.registerBlock(
   *   "myplugin.customBlock",
   *   true,
   *   CustomBlockRenderer,
   *   ["image", "attachmentUrl"]
   * )
   * ```
   */
  renderers: {
    /**
     * Registers a custom inline content renderer.
     *
     * @param type - The type identifier for the inline content (e.g., "myplugin.special")
     * @param isEditable - Whether this inline content should be editable
     * @param renderer - The React component that renders the inline content
     *
     * @example
     * ```ts
     * import SpecialInline from "./SpecialInline"
     *
     * orca.renderers.registerInline(
     *   "myplugin.special",
     *   true,
     *   SpecialInline
     * )
     * ```
     */
    registerInline(type: string, isEditable: boolean, renderer: any): void

    /**
     * Unregisters a previously registered inline content renderer.
     *
     * @param type - The type identifier of the inline content renderer to remove
     *
     * @example
     * ```ts
     * orca.renderers.unregisterInline("myplugin.special")
     * ```
     */
    unregisterInline(type: string): void

    /**
     * Registers a custom block renderer.
     *
     * @param type - The type identifier for the block (e.g., "myplugin.diagram")
     * @param isEditable - Whether this block type should be editable
     * @param renderer - The React component that renders the block
     * @param assetFields - Optional array of property names that may contain asset references
     *                     (used for proper asset handling during import/export)
     * @param useChildren - Whether this block type uses the children for rendering.
     *                      When true, the block's children will be passed to the renderer component
     *                      for custom rendering instead of being rendered by the default children renderer.
     *                      This is useful for blocks that need to control how their children are displayed
     *                      (e.g., custom layouts, tabs, or accordion blocks).
     *
     * @example
     * ```ts
     * import DiagramBlock from "./DiagramBlock"
     *
     * // Register a block renderer without asset fields
     * orca.renderers.registerBlock(
     *   "myplugin.diagram",
     *   true,
     *   DiagramBlock
     * )
     *
     * // Register a block renderer with asset fields
     * orca.renderers.registerBlock(
     *   "myplugin.attachment",
     *   true,
     *   AttachmentBlock,
     *   ["url", "thumbnailUrl"]
     * )
     *
     * // Register a block renderer that uses children for custom layout
     * orca.renderers.registerBlock(
     *   "myplugin.tabs",
     *   false,
     *   TabsBlock,
     *   undefined,
     *   true  // useChildren flag
     * )
     * ```
     */
    registerBlock(
      type: string,
      isEditable: boolean,
      renderer: any,
      assetFields?: string[],
      useChildren: boolean = false,
    ): void

    /**
     * Unregisters a previously registered block renderer.
     *
     * @param type - The type identifier of the block renderer to remove
     *
     * @example
     * ```ts
     * orca.renderers.unregisterBlock("myplugin.diagram")
     * ```
     */
    unregisterBlock(type: string): void
  }

  /**
   * Panel renderer API, used to register custom panel types.
   * Panels are the main views in the application (e.g., journal panel, block panel).
   *
   * @example
   * ```ts
   * import CustomPanel from "./CustomPanel"
   *
   * orca.panels.registerPanel(
   *   "myplugin.customPanel",
   *   CustomPanel
   * )
   * ```
   */
  panels: {
    /**
     * Registers a custom panel renderer.
     *
     * @param type - The type identifier for the panel (e.g., "myplugin.customPanel")
     * @param renderer - The React component that renders the panel
     *
     * @example
     * ```ts
     * import TimelinePanel from "./TimelinePanel"
     *
     * orca.panels.registerPanel(
     *   "myplugin.timeline",
     *   TimelinePanel
     * )
     * ```
     */
    registerPanel(type: string, renderer: any): void

    /**
     * Unregisters a previously registered panel renderer.
     *
     * @param type - The type identifier of the panel renderer to remove
     *
     * @example
     * ```ts
     * orca.panels.unregisterPanel("myplugin.timeline")
     * ```
     */
    unregisterPanel(type: string): void
  }

  /**
   * Content converter API, used to register converters for transforming blocks and inline content
   * between different formats (e.g., HTML, plain text, Markdown).
   *
   * @example
   * ```ts
   * // Register a block converter
   * orca.converters.registerBlock(
   *   "html",
   *   "myplugin.customBlock",
   *   (blockContent, repr) => {
   *     return `<div class="custom-block">${blockContent.text}</div>`
   *   }
   * )
   * ```
   */
  converters: {
    /**
     * Registers a block converter for transforming a block type to a specific format.
     *
     * @param format - The target format (e.g., "plain", "html", "markdown")
     * @param type - The block type to convert from
     * @param fn - Conversion function that transforms block content to the target format
     *
     * @example
     * ```ts
     * // Convert a countdown block to HTML
     * orca.converters.registerBlock(
     *   "html",
     *   "myplugin.countdown",
     *   (blockContent, repr, block, forExport, context) => {
     *     const date = new Date(repr.date)
     *     return `<div class="countdown" data-date="${date.toISOString()}">
     *       <span class="label">${repr.label}</span>
     *       <span class="date">${date.toLocaleDateString()}</span>
     *     </div>`
     *   }
     * )
     * ```
     */
    registerBlock(
      format: string,
      type: string,
      fn: (
        blockContent: BlockForConversion,
        repr: Repr,
        block?: Block,
        forExport?: boolean,
        context?: ConvertContext,
      ) => string | Promise<string>,
    ): void

    /**
     * Registers an inline content converter for transforming inline content to a specific format.
     *
     * @param format - The target format (e.g., "plain", "html", "markdown")
     * @param type - The inline content type to convert from
     * @param fn - Conversion function that transforms inline content to the target format
     *
     * @example
     * ```ts
     * // Convert a custom highlight inline content to Markdown
     * orca.converters.registerInline(
     *   "markdown",
     *   "myplugin.highlight",
     *   (content) => {
     *     return `==${content.v}==`
     *   }
     * )
     *
     * // Convert a user mention to HTML
     * orca.converters.registerInline(
     *   "html",
     *   "myplugin.userMention",
     *   (content) => {
     *     return `<span class="user-mention" data-user-id="${content.id}">@${content.v}</span>`
     *   }
     * )
     * ```
     */
    registerInline(
      format: string,
      type: string,
      fn: (
        content: ContentFragment,
        forExport?: boolean,
      ) => string | Promise<string>,
    ): void

    /**
     * Unregisters a block converter.
     *
     * @param format - The target format the converter was registered for
     * @param type - The block type the converter was registered for
     *
     * @example
     * ```ts
     * orca.converters.unregisterBlock("html", "myplugin.countdown")
     * ```
     */
    unregisterBlock(format: string, type: string): void

    /**
     * Unregisters an inline content converter.
     *
     * @param format - The target format the converter was registered for
     * @param type - The inline content type the converter was registered for
     *
     * @example
     * ```ts
     * orca.converters.unregisterInline("markdown", "myplugin.highlight")
     * ```
     */
    unregisterInline(format: string, type: string): void

    /**
     * Converts a block to a specific format.
     * This is typically used internally by the system when exporting content.
     *
     * @param format - The target format to convert to
     * @param blockContent - The block content to convert
     * @param repr - The block representation object
     * @param block - Optional full block data
     * @param forExport - Whether the conversion is for export purposes
     * @param context - Optional conversion context with export scope information
     * @returns A Promise that resolves to the converted string
     *
     * @example
     * ```ts
     * const htmlContent = await orca.converters.blockConvert(
     *   "html",
     *   blockContent,
     *   { type: "myplugin.customBlock", data: { key: "value" } },
     *   block,
     *   true,
     *   { exportRootId: block.id }
     * )
     * ```
     */
    blockConvert(
      format: string,
      blockContent: BlockForConversion,
      repr: Repr,
      block?: Block,
      forExport?: boolean,
      context?: ConvertContext,
    ): Promise<string>

    /**
     * Converts an inline content fragment to a specific format.
     * This is typically used internally by the system when exporting content.
     *
     * @param format - The target format to convert to
     * @param type - The type of the inline content
     * @param content - The inline content fragment to convert
     * @returns A Promise that resolves to the converted string
     *
     * @example
     * ```ts
     * const markdownText = await orca.converters.inlineConvert(
     *   "markdown",
     *   "myplugin.highlight",
     *   { t: "myplugin.highlight", v: "Important note" }
     * )
     * ```
     */
    inlineConvert(
      format: string,
      type: string,
      content: ContentFragment,
      forExport?: boolean,
    ): Promise<string>
  }

  /**
   * Broadcasts API, used for application-wide event messaging between different windows of Orca.
   * This is useful for communication between different windows of the same plugin.
   *
   * @example
   * ```ts
   * // Register a handler for a specific broadcast type
   * orca.broadcasts.registerHandler("myplugin.dataUpdated", (data) => {
   *   console.log("Data was updated:", data)
   *   // Update UI or perform other actions
   * })
   *
   * // Broadcast an event
   * orca.broadcasts.broadcast("myplugin.dataUpdated", { key: "value" })
   * ```
   */
  broadcasts: {
    /**
     * Checks if a handler is registered for a specific broadcast type.
     *
     * @param type - The broadcast type to check
     * @returns True if a handler is registered, false otherwise
     *
     * @example
     * ```ts
     * if (!orca.broadcasts.isHandlerRegistered("myplugin.dataUpdated")) {
     *   orca.broadcasts.registerHandler("myplugin.dataUpdated", handleDataUpdate)
     * }
     * ```
     */
    isHandlerRegistered(type: string): boolean

    /**
     * Registers a handler function for a specific broadcast type.
     *
     * @param type - The broadcast type to listen for
     * @param handler - The function to execute when the broadcast is received
     *
     * @example
     * ```ts
     * orca.broadcasts.registerHandler("core.themeChanged", (theme) => {
     *   console.log("Theme changed to:", theme)
     *   updateUIForTheme(theme)
     * })
     * ```
     */
    registerHandler(type: string, handler: CommandFn): void

    /**
     * Unregisters a previously registered handler for a specific broadcast type.
     *
     * @param type - The broadcast type of the handler to remove
     * @param handler - The handler function to unregister
     *
     * @example
     * ```ts
     * // When the component unmounts or plugin unloads
     * orca.broadcasts.unregisterHandler("core.themeChanged", handleThemeChange)
     * ```
     */
    unregisterHandler(type: string, handler: CommandFn): void

    /**
     * Broadcasts an event of a specific type with optional arguments to all registered handlers.
     *
     * @param type - The broadcast type to emit
     * @param args - Any arguments to pass to the handlers
     *
     * @example
     * ```ts
     * // Simple notification
     * orca.broadcasts.broadcast("myplugin.processCompleted")
     *
     * // With data
     * orca.broadcasts.broadcast("myplugin.dataFetched", {
     *   items: dataItems,
     *   timestamp: Date.now()
     * })
     * ```
     */
    broadcast(type: string, ...args: any[]): void
  }
  /**
   * Pre-built UI components from Orca that can be used in plugin development.
   * These components follow Orca's design system and provide consistent UI patterns.
   *
   * @example
   * ```tsx
   * import * as React from "react"
   *
   * function MyPluginUI() {
   *   const Button = orca.components.Button
   *   return (
   *     <Button
   *       variant="solid"
   *       onClick={() => console.log("Clicked!")}>
   *       Click Me
   *     </Button>
   *   )
   * }
   * ```
   */
  components: {
    /**
     * Provides an editor interface for managing aliases/tags, including adding/removing aliases,
     * formatting options, template selection, and inclusion relationships.
     *
     * @example
     * ```tsx
     * // Edit aliases for a block
     * <orca.components.AliasEditor
     *   blockId={123}
     * >
     *   {(open) => (
     *     <orca.components.Button variant="outline" onClick={open}>
     *       Edit Alias
     *     </orca.components.Button>
     *   )}
     * </orca.components.AliasEditor>
     *
     * // With custom container
     * <orca.components.AliasEditor
     *   blockId={456}
     *   container={containerRef}
     * >
     *   {(open) => (
     *     <span onClick={open}>Configure Tag Settings</span>
     *   )}
     * </orca.components.AliasEditor>
     * ```
     */
    AliasEditor: (
      props: {
        blockId: DbId
      } & Partial<{
        className?: string
        style?: CSSProperties
        menu: (close: () => void, state?: any) => ReactNode
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
        container?: RefObject<HTMLElement>
        alignment?: "left" | "top" | "center" | "bottom" | "right"
        placement?: "vertical" | "horizontal"
        defaultPlacement?: "top" | "bottom" | "left" | "right"
        allowBeyondContainer?: boolean
        noPointerLogic?: boolean
        keyboardNav?: boolean
        navDirection?: "vertical" | "both"
        menuAttr?: Record<string, any>
        offset?: number
        crossOffset?: number
        escapeToClose?: boolean
        onOpened?: () => void
        onClosed?: () => void
      }>,
    ) => JSX.Element | null
    /**
     * Renders a block with all its content and children
     *
     * @example
     * ```tsx
     * // Render a regular block
     * <orca.components.Block
     *   panelId="main-panel"
     *   blockId={123}
     *   blockLevel={0}
     *   indentLevel={0}
     * />
     * ```
     */
    Block: (
      props: {
        panelId: string
        blockId: DbId
        blockLevel: number
        indentLevel: number
        initiallyCollapsed?: boolean
        renderingMode?: BlockRenderingMode
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Renders a breadcrumb trail for a block's ancestors
     *
     * @example
     * ```tsx
     * // Basic usage
     * <orca.components.BlockBreadcrumb blockId={123} />
     *
     * // With custom styles
     * <orca.components.BlockBreadcrumb
     *   blockId={456}
     *   className="custom-breadcrumb"
     *   style={{ marginBottom: '10px' }}
     * />
     * ```
     */
    BlockBreadcrumb: (props: {
      blockId: DbId
      className?: string
      style?: React.CSSProperties
    }) => JSX.Element | null
    /**
     * Renders a block's children
     *
     * @example
     * ```tsx
     * // Standard usage
     * <orca.components.BlockChildren
     *   block={blockObject}
     *   panelId="main-panel"
     *   blockLevel={1}
     *   indentLevel={1}
     * />
     *
     * // Using simplified rendering mode
     * <orca.components.BlockChildren
     *   block={blockObject}
     *   panelId="panel-2"
     *   blockLevel={2}
     *   indentLevel={3}
     *   renderingMode="simple"
     * />
     * ```
     */
    BlockChildren: (props: {
      block: Block
      panelId: string
      blockLevel: number
      indentLevel: number
      renderingMode?: BlockRenderingMode
    }) => JSX.Element | null
    /**
     * Provides block selection functionality
     *
     * @example
     * ```tsx
     * // Block selection
     * <orca.components.BlockSelect
     *   mode="block"
     *   selected={[123, 456]}
     *   onChange={async (selected) => {
     *     console.log("Selected blocks:", selected);
     *   }}
     * />
     *
     * // Reference selection with scope restriction
     * <orca.components.BlockSelect
     *   mode="ref"
     *   scope="project-blocks"
     *   selected={[789]}
     *   onChange={handleSelectionChange}
     * />
     * ```
     */
    BlockSelect: (
      props: {
        mode: "block" | "ref"
        scope?: string
        selected: DbId[]
        onChange?: (selected: string[]) => void | Promise<void>
      } & Omit<
        SelectProps,
        | "options"
        | "selected"
        | "filter"
        | "filterPlaceholder"
        | "filterFunction"
        | "onChange"
      >,
    ) => JSX.Element | null
    /**
     * Core component for block rendering with common UI elements
     *
     * @example
     * ```tsx
     * // Basic text block
     * <orca.components.BlockShell
     *   panelId="main-panel"
     *   blockId={123}
     *   rndId="unique-rand-id"
     *   blockLevel={0}
     *   indentLevel={0}
     *   reprClassName="orca-repr-text"
     *   contentJsx={<div>This is text content</div>}
     *   childrenJsx={<ChildrenComponent />}
     * />
     *
     * // Code block example
     * <orca.components.BlockShell
     *   panelId="code-panel"
     *   blockId={456}
     *   rndId="code-rand-id"
     *   blockLevel={1}
     *   indentLevel={2}
     *   reprClassName="orca-repr-code"
     *   contentClassName="orca-repr-code-content"
     *   contentAttrs={{ contentEditable: false }}
     *   contentJsx={<CodeEditor />}
     *   childrenJsx={childrenBlocks}
     * />
     * ```
     */
    BlockShell: (props: {
      panelId: string
      blockId: DbId
      rndId: string
      mirrorId?: DbId
      blockLevel: number
      indentLevel: number
      initiallyCollapsed?: boolean
      renderingMode?: BlockRenderingMode
      reprClassName: string
      reprAttrs?: Record<string, any>
      contentTag?: any
      contentClassName?: string
      contentStyle?: React.CSSProperties
      contentAttrs?: Record<string, any>
      contentJsx: React.ReactNode
      childrenJsx: React.ReactNode
      droppable?: boolean
    }) => JSX.Element | null
    /**
     * Displays a block preview in a popup on hover
     *
     * When hovering over the child element, a popup appears showing a preview of the referenced block.
     * The preview can be made interactive by pressing the configured keyboard shortcut,
     * allowing users to edit the block content directly in the preview.
     *
     * @example
     * ```tsx
     * // Basic block preview on link hover
     * <BlockPreviewPopup blockId={123}>
     *   <a href="#block-123">Block Reference</a>
     * </BlockPreviewPopup>
     *
     * // With custom delay and event handlers
     * <BlockPreviewPopup
     *   blockId={456}
     *   delay={500}
     *   onClose={() => console.log("Preview closed")}
     *   className="custom-preview"
     * >
     *   <span>Hover me for block preview</span>
     * </BlockPreviewPopup>
     *
     * // Programmatically controlled visibility
     * <BlockPreviewPopup
     *   blockId={789}
     *   visible={isPreviewOpen}
     *   onClosed={() => setPreviewOpen(false)}
     * >
     *   <button>Show Preview</button>
     * </BlockPreviewPopup>
     * ```
     */
    BlockPreviewPopup: (
      props: {
        /** The ID of the block to display in the preview */
        blockId: DbId
        /** Delay in milliseconds before showing the preview on hover (default: 200) */
        delay?: number
        /** Reference element to anchor the popup positioning */
        refElement?: React.RefObject<HTMLElement>
        /** Whether the preview popup is visible (controlled mode) */
        visible?: boolean
        /** Callback fired when the preview should close */
        onClose?: () => void
        /** Callback fired after the preview has finished closing animation */
        onClosed?: () => void
        /** CSS class name for the popup container */
        className?: string
        /** Inline styles for the popup container */
        style?: React.CSSProperties
        /** The child element that triggers the preview on hover */
        children?: React.ReactElement
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Renders a generic breadcrumb navigation
     *
     * @example
     * ```tsx
     * // Simple breadcrumb
     * <orca.components.Breadcrumb
     *   items={["Home", "Projects", "Document"]}
     * />
     *
     * // Breadcrumb with links and icons
     * <orca.components.Breadcrumb
     *   items={[
     *     <a href="#home">Home <i className="ti ti-home" /></a>,
     *     <a href="#projects">Projects</a>,
     *     "Current Document"
     *   ]}
     *   className="custom-breadcrumb"
     * />
     * ```
     */
    Breadcrumb: (props: {
      items: React.ReactNode[]
      className?: string
      style?: React.CSSProperties
    }) => JSX.Element | null
    /**
     * Standard button component with multiple variants
     *
     * @example
     * ```tsx
     * // Basic button
     * <orca.components.Button variant="solid" onClick={handleClick}>
     *   Save
     * </orca.components.Button>
     *
     * // Dangerous action button
     * <orca.components.Button variant="dangerous" onClick={handleDelete}>
     *   <i className="ti ti-trash" /> Delete
     * </orca.components.Button>
     *
     * // Outline button with disabled state
     * <orca.components.Button variant="outline" disabled={true}>
     *   Edit
     * </orca.components.Button>
     *
     * // Simple icon button
     * <orca.components.Button variant="plain" onClick={handleRefresh}>
     *   <i className="ti ti-refresh" />
     * </orca.components.Button>
     * ```
     */
    Button: (
      props: React.HTMLAttributes<HTMLButtonElement> & {
        variant: "solid" | "soft" | "dangerous" | "outline" | "plain"
      },
    ) => JSX.Element | null
    /**
     * Checkbox form element
     *
     * @example
     * ```tsx
     * // Basic checkbox
     * <orca.components.Checkbox
     *   checked={isChecked}
     *   onChange={({ checked }) => setIsChecked(checked)}
     * />
     *
     * // Disabled checkbox
     * <orca.components.Checkbox checked={true} disabled={true} />
     *
     * // Indeterminate state checkbox
     * <orca.components.Checkbox
     *   indeterminate={true}
     *   onChange={handleSelectionChange}
     * />
     * ```
     */
    Checkbox: (
      props: {
        checked?: boolean
        indeterminate?: boolean
        disabled?: boolean
        onChange?: (e: { checked: boolean }) => void | Promise<void>
      } & Omit<React.HTMLAttributes<HTMLSpanElement>, "onChange">,
    ) => JSX.Element | null
    /**
     * Input that handles IME composition events properly
     *
     * @example
     * ```tsx
     * // Basic input
     * <orca.components.CompositionInput
     *   placeholder="Enter text"
     *   value={inputValue}
     *   onChange={(e) => setInputValue(e.target.value)}
     * />
     *
     * // Input with prefix and suffix
     * <orca.components.CompositionInput
     *   pre={<i className="ti ti-search" />}
     *   post={<Button onClick={clearInput}>Clear</Button>}
     *   placeholder="Search..."
     * />
     *
     * // Input with validation error
     * <orca.components.CompositionInput
     *   value={email}
     *   onChange={handleEmailChange}
     *   error={emailError ? <span className="error">{emailError}</span> : null}
     * />
     * ```
     */
    CompositionInput: (
      props: React.HTMLAttributes<HTMLInputElement> & {
        pre?: React.ReactElement
        post?: React.ReactElement
        error?: React.ReactNode
      },
    ) => JSX.Element | null
    /**
     * Textarea that handles IME composition events properly
     *
     * @example
     * ```tsx
     * // Basic multiline text input
     * <orca.components.CompositionTextArea
     *   placeholder="Enter multiline text"
     *   value={textValue}
     *   onChange={(e) => setTextValue(e.target.value)}
     * />
     *
     * // Set rows and auto-grow
     * <orca.components.CompositionTextArea
     *   rows={5}
     *   style={{ minHeight: '100px' }}
     *   placeholder="Enter notes..."
     * />
     * ```
     */
    CompositionTextArea: (
      props: React.HTMLAttributes<HTMLTextAreaElement>,
    ) => JSX.Element | null
    /**
     * Displays a confirmation dialog
     *
     * @example
     * ```tsx
     * // Basic confirmation dialog
     * <orca.components.ConfirmBox
     *   text="Are you sure you want to delete this item?"
     *   onConfirm={(e, close) => {
     *     deleteItem();
     *     close();
     *   }}
     * >
     *   {(open) => (
     *     <orca.components.Button variant="dangerous" onClick={open}>
     *       Delete
     *     </orca.components.Button>
     *   )}
     * </orca.components.ConfirmBox>
     *
     * // Confirmation dialog with state
     * <orca.components.ConfirmBox
     *   text="Are you sure you want to move this block?"
     *   onConfirm={(e, close, state) => {
     *     moveBlock(state.blockId, state.destination);
     *     close();
     *   }}
     * >
     *   {(open) => (
     *     <orca.components.Button
     *       variant="soft"
     *       onClick={(e) => open(e, { blockId: 123, destination: 'section-1' })}
     *     >
     *       Move
     *     </orca.components.Button>
     *   )}
     * </orca.components.ConfirmBox>
     * ```
     */
    ConfirmBox: (
      props: {
        text: string
        onConfirm: (
          e: React.UIEvent,
          close: () => void,
          state?: any,
        ) => void | Promise<void>
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
      } & Partial<{
        className?: string
        style?: CSSProperties
        menu: (close: () => void, state?: any) => ReactNode
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
        container?: RefObject<HTMLElement>
        alignment?: "left" | "top" | "center" | "bottom" | "right"
        placement?: "vertical" | "horizontal"
        defaultPlacement?: "top" | "bottom" | "left" | "right"
        allowBeyondContainer?: boolean
        noPointerLogic?: boolean
        keyboardNav?: boolean
        navDirection?: "vertical" | "both"
        menuAttr?: Record<string, any>
        offset?: number
        crossOffset?: number
        escapeToClose?: boolean
        onOpened?: () => void
        onClosed?: () => void
      }>,
    ) => JSX.Element | null
    /**
     * Creates a context menu attached to an element
     *
     * @example
     * ```tsx
     * // Basic context menu
     * <orca.components.ContextMenu
     *   menu={(close) => (
     *     <orca.components.Menu>
     *       <orca.components.MenuText
     *         title="Edit"
     *         onClick={() => { editItem(); close(); }}
     *       />
     *       <orca.components.MenuText
     *         title="Delete"
     *         dangerous={true}
     *         onClick={() => { deleteItem(); close(); }}
     *       />
     *     </orca.components.Menu>
     *   )}
     * >
     *   {(open) => (
     *     <div onContextMenu={open}>Right-click here to show the menu</div>
     *   )}
     * </orca.components.ContextMenu>
     *
     * // Custom position and alignment menu
     * <orca.components.ContextMenu
     *   placement="horizontal"
     *   alignment="top"
     *   defaultPlacement="right"
     *   menu={(close) => (
     *     <orca.components.Menu>
     *       <orca.components.MenuText title="Option 1" onClick={close} />
     *       <orca.components.MenuText title="Option 2" onClick={close} />
     *     </orca.components.Menu>
     *   )}
     * >
     *   {(open) => (
     *     <orca.components.Button variant="soft" onClick={open}>
     *       Show Menu
     *     </orca.components.Button>
     *   )}
     * </orca.components.ContextMenu>
     * ```
     */
    ContextMenu: (props: {
      className?: string
      style?: React.CSSProperties
      menu: (close: () => void, state?: any) => React.ReactNode
      children: (
        openMenu: (e: React.UIEvent, state?: any) => void,
        closeMenu: () => void,
      ) => React.ReactNode
      container?: React.RefObject<HTMLElement>
      alignment?: "left" | "top" | "center" | "bottom" | "right"
      placement?: "vertical" | "horizontal"
      defaultPlacement?: "top" | "bottom" | "left" | "right"
      allowBeyondContainer?: boolean
      noPointerLogic?: boolean
      keyboardNav?: boolean
      navDirection?: "vertical" | "both"
      menuAttr?: Record<string, any>
      offset?: number
      crossOffset?: number
      escapeToClose?: boolean
      onOpened?: () => void
      onClosed?: () => void
    }) => JSX.Element | null
    /**
     * Calendar date picker
     *
     * @example
     * ```tsx
     * // Basic date picker
     * const [date, setDate] = useState(new Date());
     * <orca.components.DatePicker
     *   value={date}
     *   onChange={(newDate) => setDate(newDate)}
     * />
     *
     * // Date-time picker
     * <orca.components.DatePicker
     *   mode="datetime"
     *   value={dateTime}
     *   onChange={handleDateTimeChange}
     * />
     *
     * // Date range picker
     * const [dateRange, setDateRange] = useState([new Date(), new Date(Date.now() + 86400000)]);
     * <orca.components.DatePicker
     *   range={true}
     *   value={dateRange}
     *   onChange={(newRange) => setDateRange(newRange)}
     * />
     * ```
     */
    DatePicker: (props: {
      mode?: "date" | "time" | "datetime"
      range?: boolean
      value: Date | [Date, Date]
      onChange: (v: Date | [Date, Date]) => void | Promise<void>
      alignment?: "left" | "center" | "right"
      menuContainer?: React.RefObject<HTMLElement>
      visible?: boolean
      refElement?: React.RefObject<HTMLElement>
      rect?: DOMRect
      onClose?: () => void | Promise<void>
      onClosed?: () => void | Promise<void>
      className?: string
      style?: React.CSSProperties
    }) => JSX.Element | null
    /**
     * Context menu that appears on hover
     *
     * @example
     * ```tsx
     * // Basic hover menu
     * <orca.components.HoverContextMenu
     *   menu={(close) => (
     *     <orca.components.Menu>
     *       <orca.components.MenuText
     *         title="View"
     *         preIcon="ti ti-eye"
     *         onClick={close}
     *       />
     *       <orca.components.MenuText
     *         title="Edit"
     *         preIcon="ti ti-pencil"
     *         onClick={close}
     *       />
     *     </orca.components.Menu>
     *   )}
     * >
     *   <div className="hoverable-element">Hover to show menu</div>
     * </orca.components.HoverContextMenu>
     *
     * // Custom positioned hover menu
     * <orca.components.HoverContextMenu
     *   placement="horizontal"
     *   defaultPlacement="right"
     *   menu={(close) => (
     *     <orca.components.Menu>
     *       <orca.components.MenuText
     *         title="View Details"
     *         preIcon="ti ti-info-circle"
     *         onClick={() => { viewDetails(); close(); }}
     *       />
     *     </orca.components.Menu>
     *   )}
     * >
     *   <i className="ti ti-info-circle" />
     * </orca.components.HoverContextMenu>
     * ```
     */
    HoverContextMenu: (
      props: {
        children: React.ReactElement
      } & Omit<ContextMenuProps, "children">,
    ) => JSX.Element | null
    /**
     * Image component with loading states
     *
     * @example
     * ```tsx
     * // Basic image
     * <orca.components.Image
     *   src="/path/to/image.jpg"
     *   alt="Description"
     * />
     *
     * // Styled image
     * <orca.components.Image
     *   src="/path/to/image.png"
     *   alt="Logo"
     *   className="profile-image"
     *   style={{ width: 100, height: 100, borderRadius: '50%' }}
     * />
     *
     * // Handle loading events
     * <orca.components.Image
     *   src="/path/to/large-image.jpg"
     *   alt="Large Image"
     *   onLoad={() => setImageLoaded(true)}
     *   onError={() => handleImageError()}
     * />
     * ```
     */
    Image: (props: React.HTMLAttributes<HTMLImageElement>) => JSX.Element | null
    /**
     * Standard text input component
     *
     * @example
     * ```tsx
     * // Basic input field
     * <orca.components.Input
     *   placeholder="Enter text"
     *   value={inputValue}
     *   onChange={(e) => setInputValue(e.target.value)}
     * />
     *
     * // Input field with prefix and suffix
     * <orca.components.Input
     *   pre={<i className="ti ti-user" />}
     *   post={<orca.components.Button variant="plain">Clear</orca.components.Button>}
     *   placeholder="Username"
     * />
     *
     * // Input field with error message
     * <orca.components.Input
     *   value={email}
     *   onChange={handleEmailChange}
     *   error={emailError ? "Please enter a valid email address" : undefined}
     * />
     * ```
     */
    Input: (
      props: React.HTMLAttributes<HTMLInputElement> & {
        pre?: React.ReactElement
        post?: React.ReactElement
        error?: React.ReactNode
      },
    ) => JSX.Element | null
    /**
     * Input dialog with label and actions
     *
     * @example
     * ```tsx
     * // Basic input dialog
     * <orca.components.InputBox
     *   label="Enter name"
     *   defaultValue="Default value"
     *   onConfirm={(value, e, close) => {
     *     if (value) {
     *       saveName(value);
     *       close();
     *     }
     *   }}
     * >
     *   {(open) => (
     *     <orca.components.Button variant="soft" onClick={open}>
     *       Edit Name
     *     </orca.components.Button>
     *   )}
     * </orca.components.InputBox>
     *
     * // Input dialog with validation
     * <orca.components.InputBox
     *   label="Enter URL"
     *   error={urlError}
     *   onConfirm={(url, e, close) => {
     *     if (isValidUrl(url)) {
     *       addUrl(url);
     *       close();
     *     } else {
     *       setUrlError("Please enter a valid URL");
     *     }
     *   }}
     * >
     *   {(open) => (
     *     <orca.components.Button variant="outline" onClick={open}>
     *       Add Link
     *     </orca.components.Button>
     *   )}
     * </orca.components.InputBox>
     * ```
     */
    InputBox: (
      props: {
        label: string
        onConfirm: (
          value: string | undefined,
          e: React.UIEvent,
          close: () => void,
        ) => void | Promise<void>
        defaultValue?: string
        error?: React.ReactNode
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
      } & Partial<{
        className?: string
        style?: CSSProperties
        menu: (close: () => void, state?: any) => ReactNode
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
        container?: RefObject<HTMLElement>
        alignment?: "left" | "top" | "center" | "bottom" | "right"
        placement?: "vertical" | "horizontal"
        defaultPlacement?: "top" | "bottom" | "left" | "right"
        allowBeyondContainer?: boolean
        noPointerLogic?: boolean
        keyboardNav?: boolean
        navDirection?: "vertical" | "both"
        menuAttr?: Record<string, any>
        offset?: number
        crossOffset?: number
        escapeToClose?: boolean
        onOpened?: () => void
        onClosed?: () => void
      }>,
    ) => JSX.Element | null
    /**
     * Component for loading more items in paginated lists
     *
     * @example
     * ```tsx
     * // Basic Load More component
     * <orca.components.LoadMore
     *   onLoadMore={async () => {
     *     await fetchMoreItems();
     *   }}
     * />
     *
     * // Custom message and debounce time
     * <orca.components.LoadMore
     *   message="Loading more results..."
     *   debounceTime={500}
     *   onLoadMore={loadMoreResults}
     *   className="custom-load-more"
     * />
     * ```
     */
    LoadMore: (
      props: {
        message?: string
        onLoadMore: () => void | Promise<void>
        debounceTime?: number
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Efficient view container for switching between components
     *
     * @example
     * ```tsx
     * // Basic view switching container
     * <orca.components.MemoizedViews
     *   name="main-views"
     *   active="details"
     *   views={{
     *     "list": <ListView items={items} />,
     *     "details": <DetailsView itemId={123} />,
     *     "settings": <SettingsView />
     *   }}
     * />
     *
     * // Horizontally arranged views
     * <orca.components.MemoizedViews
     *   name="side-views"
     *   active={currentTab}
     *   orientation="horizontal"
     *   className="side-panel"
     *   views={{
     *     "info": <InfoPanel />,
     *     "history": <HistoryPanel />,
     *     "comments": <CommentsPanel />
     *   }}
     * />
     * ```
     */
    MemoizedViews: (props: {
      name: string
      active: string
      views: { [key: string]: React.ReactElement | null }
      orientation?: "horizontal" | "vertical"
      className?: string
      style?: React.CSSProperties
    }) => JSX.Element | null
    /**
     * Standard menu container
     *
     * @example
     * ```tsx
     * // Basic menu
     * <orca.components.Menu>
     *   <orca.components.MenuText title="Option 1" onClick={() => handleOption(1)} />
     *   <orca.components.MenuText title="Option 2" onClick={() => handleOption(2)} />
     *   <orca.components.MenuSeparator />
     *   <orca.components.MenuText
     *     title="Exit"
     *     dangerous={true}
     *     onClick={() => handleExit(0)}
     *   />
     * </orca.components.Menu>
     *
     * // Menu with keyboard navigation enabled
     * <orca.components.Menu
     *   keyboardNav={true}
     *   navDirection="both"
     *   onKeyboardNav={(el) => scrollToElement(el)}
     *   className="keyboard-nav-menu"
     * >
     *   <orca.components.MenuTitle title="Actions" />
     *   <orca.components.MenuText title="Edit" onClick={() => handleEdit(123)} />
     *   <orca.components.MenuText title="Copy" onClick={() => handleCopy(456)} />
     *   <orca.components.MenuText title="Delete" onClick={() => handleDelete(789)} />
     * </orca.components.Menu>
     * ```
     */
    Menu: (
      props: {
        children?: React.ReactNode
        keyboardNav?: boolean
        navDirection?: "vertical" | "both"
        onKeyboardNav?: (el: HTMLElement) => void | Promise<void>
        refocus?: boolean
        container?: React.RefObject<HTMLElement>
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Menu item component
     *
     * @example
     * ```tsx
     * // Basic menu item
     * <orca.components.MenuItem
     *   jsx={<div>Option 1</div>}
     *   onClick={() => handleOption(1)}
     * />
     *
     * // Menu item with nested content
     * <orca.components.MenuItem
     *   jsx={<div className="menu-item-header">Display Settings</div>}
     *   onClick={() => handleSettingsClick(123)}
     * >
     *   <div className="submenu">
     *     <div>Theme: {currentTheme}</div>
     *     <div>Font Size: {fontSize}</div>
     *   </div>
     * </orca.components.MenuItem>
     *
     * // Menu item with custom styles
     * <orca.components.MenuItem
     *   jsx={<div className="icon-item"><i className="ti ti-user"/> User</div>}
     *   className="highlighted-item"
     *   style={{ fontWeight: 'bold' }}
     *   onClick={() => handleUserClick(456)}
     * />
     * ```
     */
    MenuItem: (
      props: {
        jsx: React.ReactElement
        children?: React.ReactElement
        onClick?: (e: React.MouseEvent) => void | Promise<void>
        className?: string
        style?: React.CSSProperties
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Visual separator for menus
     *
     * @example
     * ```tsx
     * // Add a separator between menu items
     * <orca.components.Menu>
     *   <orca.components.MenuText title="Edit" onClick={() => handleEdit(123)} />
     *   <orca.components.MenuText title="Copy" onClick={() => handleCopy(456)} />
     *   <orca.components.MenuSeparator />
     *   <orca.components.MenuText
     *     title="Delete"
     *     dangerous={true}
     *     onClick={() => handleDelete(789)}
     *   />
     * </orca.components.Menu>
     * ```
     */
    MenuSeparator: (props: {}) => JSX.Element | null
    /**
     * Text-based menu item
     *
     * @example
     * ```tsx
     * // Basic text menu item
     * <orca.components.MenuText
     *   title="Save Document"
     *   onClick={handleSave}
     * />
     *
     * // Menu item with icon and shortcut
     * <orca.components.MenuText
     *   title="Copy"
     *   preIcon="ti ti-copy"
     *   shortcut="⌘C"
     *   onClick={handleCopy}
     * />
     *
     * // Menu item with subtitle
     * <orca.components.MenuText
     *   title="Export as PDF"
     *   subtitle="Export the current document as a PDF file"
     *   preIcon="ti ti-file-export"
     *   onClick={handleExport}
     * />
     *
     * // Disabled menu item
     * <orca.components.MenuText
     *   title="Delete"
     *   preIcon="ti ti-trash"
     *   dangerous={true}
     *   disabled={!hasSelection}
     *   onClick={handleDelete}
     * />
     *
     * // Menu item with context menu
     * <orca.components.MenuText
     *   title="Share"
     *   preIcon="ti ti-share"
     *   contextMenu={(close) => (
     *     <orca.components.Menu>
     *       <orca.components.MenuText title="Copy Link" onClick={() => { copyLink(); close(); }} />
     *       <orca.components.MenuText title="Send Email" onClick={() => { sendEmail(); close(); }} />
     *     </orca.components.Menu>
     *   )}
     * />
     * ```
     */
    MenuText: (
      props: {
        title: string
        subtitle?: string
        raw?: boolean
        centered?: boolean
        preIcon?: string
        postIcon?: string
        shortcut?: string
        disabled?: boolean
        dangerous?: boolean
        children?: React.ReactElement
        onClick?: (e: React.MouseEvent) => void | Promise<void>
        contextMenu?: (close: () => void) => React.ReactNode
        className?: string
        style?: React.CSSProperties
      } & Omit<React.HTMLAttributes<HTMLDivElement>, "contextMenu">,
    ) => JSX.Element | null
    /**
     * Menu section title
     *
     * @example
     * ```tsx
     * // Basic menu title
     * <orca.components.Menu>
     *   <orca.components.MenuTitle title="File Operations" />
     *   <orca.components.MenuText title="New" onClick={handleNew} />
     *   <orca.components.MenuText title="Open" onClick={handleOpen} />
     *   <orca.components.MenuSeparator />
     *   <orca.components.MenuTitle title="Edit Operations" />
     *   <orca.components.MenuText title="Copy" onClick={handleCopy} />
     *   <orca.components.MenuText title="Paste" onClick={handlePaste} />
     * </orca.components.Menu>
     *
     * // Menu title with additional info
     * <orca.components.Menu>
     *   <orca.components.MenuTitle
     *     title="Recent Documents"
     *     info={<span className="count">{recentDocs.length}</span>}
     *   />
     *   {recentDocs.map(doc => (
     *     <orca.components.MenuText
     *       key={doc.id}
     *       title={doc.name}
     *       onClick={() => openDoc(doc.id)}
     *     />
     *   ))}
     * </orca.components.Menu>
     * ```
     */
    MenuTitle: (props: {
      title: string
      info?: React.ReactNode
      className?: string
      style?: React.CSSProperties
    }) => JSX.Element | null
    /**
     * Full-screen modal overlay
     *
     * @example
     * ```tsx
     * // Basic modal
     * const [isVisible, setIsVisible] = useState(false);
     * <orca.components.Button onClick={() => setIsVisible(true)}>
     *   Open Modal
     * </orca.components.Button>
     *
     * <orca.components.ModalOverlay
     *   visible={isVisible}
     *   canClose={true}
     *   onClose={() => setIsVisible(false)}
     * >
     *   <div className="modal-content">
     *     <h2>Modal Title</h2>
     *     <p>This is the content of the modal...</p>
     *     <orca.components.Button onClick={() => setIsVisible(false)}>
     *       Close
     *     </orca.components.Button>
     *   </div>
     * </orca.components.ModalOverlay>
     *
     * // Modal with blur effect
     * <orca.components.ModalOverlay
     *   visible={isImportant}
     *   blurred={true}
     *   canClose={false}
     *   className="important-modal"
     * >
     *   <div className="confirmation-dialog">
     *     <h3>Important Action Confirmation</h3>
     *     <p>Are you sure you want to proceed? This action cannot be undone.</p>
     *     <div className="actions">
     *       <orca.components.Button variant="outline" onClick={handleCancel}>
     *         Cancel
     *       </orca.components.Button>
     *       <orca.components.Button variant="dangerous" onClick={handleConfirm}>
     *         Confirm
     *       </orca.components.Button>
     *     </div>
     *   </div>
     * </orca.components.ModalOverlay>
     * ```
     */
    ModalOverlay: (
      props: {
        className?: string
        style?: React.CSSProperties
        blurred?: boolean
        visible: boolean
        canClose?: boolean
        onClose?: () => void | Promise<void>
        onClosed?: () => void
        children: React.ReactNode
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Popup panel attached to an element.
     *
     * The popup is positioned automatically relative to a target `refElement` (or explicit
     * `rect`) and can be constrained by an optional `boundary` element. You can also provide
     * `relativePosition` to explicitly set `top/left/bottom/right` CSS strings. The popup
     * supports vertical and horizontal placement, alignment, offsets, and boundary
     * adjustments (via `boundary*Offset` props). When `replacement` is enabled (default),
     * the popup observes size changes and updates placement automatically.
     *
     * Default values: `placement: "vertical"`, `defaultPlacement: "bottom"`,
     * `alignment: "center"`, `offset: 4`, `crossOffset: 0`, `replacement: true`.
     *
     * @example
     * ```tsx
     * // Basic popup panel
     * const [isVisible, setIsVisible] = useState(false);
     * const buttonRef = useRef(null);
     *
     * <orca.components.Button
     *   ref={buttonRef}
     *   onClick={() => setIsVisible(true)}
     * >
     *   Show Popup
     * </orca.components.Button>
     *
     * <orca.components.Popup
     *   refElement={buttonRef}
     *   visible={isVisible}
     *   onClose={() => setIsVisible(false)}
     * >
     *   <div className="popup-content">
     *     <p>This is the popup content</p>
     *   </div>
     * </orca.components.Popup>
     *
     * // Custom positioned and aligned popup panel
     * <orca.components.Popup
     *   refElement={anchorRef}
     *   visible={showPopup}
     *   placement="horizontal"
     *   defaultPlacement="right"
     *   alignment="center"
     *   offset={10}
     *   onClose={closePopup}
     *   className="custom-popup"
     * >
     *   <div className="info-card">
     *     <h3>Details</h3>
     *     <p>Here is more detailed content...</p>
     *   </div>
     * </orca.components.Popup>
     * ```
     */
    Popup: (
      props: {
        /**
         * Container element to render the popup into. If omitted, the popup will be
         * appended to the `refElement`'s offsetParent.
         */
        container?: React.RefObject<HTMLElement>
        /**
         * Optional boundary element used to constrain popup placement. Defaults to the container.
         */
        boundary?: React.RefObject<HTMLElement>
        /**
         * Additional offsets to adjust the boundary used for placement.
         * Useful when you need to keep the popup away from fixed elements (e.g. headers).
         */
        boundaryTopOffset?: number
        boundaryBottomOffset?: number
        boundaryLeftOffset?: number
        boundaryRightOffset?: number
        /**
         * The target element to anchor the popup to.
         */
        refElement?: React.RefObject<HTMLElement>
        /**
         * Alternative explicit rect to anchor to. If provided, `refElement` will be ignored.
         */
        rect?: DOMRect
        /**
         * Directly set CSS properties for positioning using top/left/bottom/right strings
         * (e.g. `"8px"`, `"1rem"`). When present, `relativePosition` takes precedence
         * over automatic placement.
         */
        relativePosition?: {
          top?: string
          left?: string
          bottom?: string
          right?: string
        }
        /**
         * Controls whether the popup is visible (must be controlled externally).
         */
        visible: boolean
        /**
         * Called when the popup should request to close (e.g. clicking outside or pressing Escape).
         * Return a Promise if asynchronous cleanup is required.
         */
        onClose?: () => void | Promise<void>
        /**
         * Called after the popup finished its exit animation and has been removed.
         */
        onClosed?: () => void
        /**
         * When true, the popup will not toggle container pointer logic. Use for specialized UIs.
         * Default: false
         */
        noPointerLogic?: boolean
        /**
         * Popup content. The child should be a single React element.
         */
        children?: React.ReactElement
        /**
         * Whether the popup places vertically (top/bottom) or horizontally (left/right). Default: "vertical"
         */
        placement?: "vertical" | "horizontal"
        /**
         * Preferred placement direction when there is space (top/bottom/left/right). Default: "bottom"
         */
        defaultPlacement?: "top" | "bottom" | "left" | "right"
        /**
         * Alignment relative to the anchor when placed (e.g. center/left/right for vertical placement).
         * Default: "center"
         */
        alignment?: "left" | "top" | "center" | "bottom" | "right"
        /**
         * If true, the popup is allowed to extend beyond the container/boundary.
         */
        allowBeyondContainer?: boolean
        /**
         * When true, the Escape key will close the popup (controlled via onClose).
         * Also supports proper IME composition handling to avoid accidental closes.
         */
        escapeToClose?: boolean
        /**
         * CSS class names to pass to the popup container.
         */
        className?: string
        style?: React.CSSProperties
        /**
         * Distance (in px) between anchor and the popup. Default: 4
         */
        offset?: number
        /**
         * Cross-axis offset (in px) to shift popup relative to anchor. Default: 0
         */
        crossOffset?: number
        /**
         * If set to true (default), the popup will observe content size changes and
         * update its placement accordingly. Set to false for performance-sensitive use-cases.
         */
        replacement?: boolean
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Segmented control for selecting from options
     *
     * @example
     * ```tsx
     * // Basic segmented control
     * const [selected, setSelected] = useState("list");
     * <orca.components.Segmented
     *   selected={selected}
     *   options={[
     *     { value: "list", label: "List" },
     *     { value: "grid", label: "Grid" },
     *     { value: "table", label: "Table" }
     *   ]}
     *   onChange={(value) => setSelected(value)}
     * />
     *
     * // Segmented control with custom JSX
     * <orca.components.Segmented
     *   selected={viewMode}
     *   options={[
     *     { value: "day", jsx: <i className="ti ti-calendar-day" /> },
     *     { value: "week", jsx: <i className="ti ti-calendar-week" /> },
     *     { value: "month", jsx: <i className="ti ti-calendar-month" /> }
     *   ]}
     *   onChange={setViewMode}
     *   className="calendar-mode-selector"
     * />
     * ```
     */
    Segmented: (
      props: {
        selected: string
        options: { label?: string; value: string; jsx?: React.ReactElement }[]
        onChange: (value: string) => void | Promise<void>
        className?: string
        style?: React.CSSProperties
      } & Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    ) => JSX.Element | null
    /**
     * Dropdown select component
     *
     * @example
     * ```tsx
     * // Basic dropdown selector
     * const [selected, setSelected] = useState(["option1"]);
     * <orca.components.Select
     *   selected={selected}
     *   options={[
     *     { value: "option1", label: "Option 1" },
     *     { value: "option2", label: "Option 2" },
     *     { value: "option3", label: "Option 3" }
     *   ]}
     *   onChange={(newSelected) => setSelected(newSelected)}
     * />
     *
     * // Multi-select dropdown with filtering
     * <orca.components.Select
     *   selected={selectedTags}
     *   options={availableTags}
     *   multiSelection={true}
     *   filter={true}
     *   filterPlaceholder="Search tags..."
     *   placeholder="Select tags"
     *   onChange={handleTagsChange}
     * />
     *
     * // Grouped dropdown selector
     * <orca.components.Select
     *   selected={[selectedLanguage]}
     *   options={[
     *     { value: "js", label: "JavaScript", group: "Frontend" },
     *     { value: "ts", label: "TypeScript", group: "Frontend" },
     *     { value: "py", label: "Python", group: "Backend" },
     *     { value: "go", label: "Golang", group: "Backend" }
     *   ]}
     *   pre={<i className="ti ti-code" />}
     *   alignment="left"
     *   width="200px"
     *   onChange={(selected) => setSelectedLanguage(selected[0])}
     * />
     * ```
     */
    Select: (props: {
      selected: string[]
      options: { value: string; label: string; group?: string }[]
      onChange?: (
        selected: string[],
        filterKeyword?: string,
      ) => void | Promise<void>
      menuContainer?: React.RefObject<HTMLElement>
      width?: number | string
      placeholder?: string
      multiSelection?: boolean
      withClear?: boolean
      filter?: boolean
      filterPlaceholder?: string
      filterFunction?: (
        keyword: string,
      ) => Promise<{ value: string; label: string; group?: string }[]>
      alignment?: "left" | "center" | "right"
      pre?: React.ReactElement
      buttonClassName?: string
      menuClassName?: string
      disabled?: boolean
      readOnly?: boolean
      onMouseEnter?: (e: React.MouseEvent) => void
      onMouseLeave?: (e: React.MouseEvent) => void
    }) => JSX.Element | null
    /**
     * Loading placeholder
     *
     * @example
     * ```tsx
     * // Basic loading placeholder
     * <div className="loading-container">
     *   <orca.components.Skeleton />
     * </div>
     *
     * // Layout during content loading
     * <div className="content-card">
     *   <div className="header">
     *     {isLoading ? <orca.components.Skeleton /> : <h2>{title}</h2>}
     *   </div>
     *   <div className="body">
     *     {isLoading ? (
     *       <>
     *         <orca.components.Skeleton />
     *         <orca.components.Skeleton />
     *         <orca.components.Skeleton />
     *       </>
     *     ) : (
     *       <p>{content}</p>
     *     )}
     *   </div>
     * </div>
     * ```
     */
    Skeleton: (props: {}) => JSX.Element | null
    /**
     * Toggle switch component
     *
     * @example
     * ```tsx
     * // Basic switch
     * const [isOn, setIsOn] = useState(false);
     * <orca.components.Switch
     *   on={isOn}
     *   onChange={(newValue) => setIsOn(newValue)}
     * />
     *
     * // Read-only switch
     * <orca.components.Switch
     *   on={featureEnabled}
     *   readonly={true}
     * />
     *
     * // Unset state switch
     * <orca.components.Switch
     *   unset={true}
     *   onChange={handleInheritedSetting}
     * />
     *
     * // Switch with label
     * <div className="setting-row">
     *   <label>Enable Notifications</label>
     *   <orca.components.Switch
     *     on={notificationsEnabled}
     *     onChange={toggleNotifications}
     *   />
     * </div>
     * ```
     */
    Switch: (
      props: {
        on?: boolean
        unset?: boolean
        onChange?: (on: boolean) => void | Promise<void>
        readonly?: boolean
      } & Omit<React.HTMLAttributes<HTMLButtonElement>, "onChange">,
    ) => JSX.Element | null
    /**
     * Data table component
     *
     * @example
     * ```tsx
     * // Basic data table
     * <orca.components.Table
     *   columns={[
     *     { name: "Name", icon: "ti ti-file" },
     *     { name: "Size", icon: "ti ti-ruler" },
     *     { name: "Modified Date", icon: "ti ti-calendar" }
     *   ]}
     *   items={files}
     *   initialColumnSizes="2fr 1fr 1fr"
     *   rowRenderer={(item, className, index) => (
     *     <tr key={item.id} className={className}>
     *       <td>{item.name}</td>
     *       <td>{item.size}</td>
     *       <td>{item.modifiedDate}</td>
     *     </tr>
     *   )}
     * />
     *
     * // Table with pinned column and resizable columns
     * <orca.components.Table
     *   columns={[
     *     { name: "ID" },
     *     { name: "Product Name" },
     *     { name: "Price" },
     *     { name: "Stock" }
     *   ]}
     *   items={products}
     *   initialColumnSizes="80px 2fr 1fr 1fr"
     *   pinColumn={true}
     *   onColumnResize={handleColumnResize}
     *   className="products-table"
     *   rowRenderer={(product, className, index) => (
     *     <tr key={product.id} className={className} onClick={() => selectProduct(product.id)}>
     *       <td>{product.id}</td>
     *       <td>{product.name}</td>
     *       <td>{formatCurrency(product.price)}</td>
     *       <td>{product.stock}</td>
     *     </tr>
     *   )}
     * />
     * ```
     */
    Table: (
      props: {
        columns: { name: string; icon?: string }[]
        items: { _type: string; [key: string]: any }[]
        rowRenderer: (
          item: { _type: string; [key: string]: any },
          className: string,
          index: number,
        ) => React.ReactNode
        initialColumnSizes: string
        pinColumn?: boolean
        onColumnResize?: (value: string) => void | Promise<void>
      } & React.HTMLAttributes<HTMLDivElement>,
    ) => JSX.Element | null
    /**
     * Provides a popup menu for tag selection and creation.
     * Allows users to search, select existing tags, or create new ones.
     *
     * @example
     * ```tsx
     * // Basic usage
     * <orca.components.TagPopup
     *   blockId={123}
     *   closeMenu={() => setMenuVisible(false)}
     *   onTagClick={(tag) => console.log(`Selected tag: ${tag}`)}
     * >
     *   {(open) => (
     *     <orca.components.Button variant="outline" onClick={open}>
     *       Add Tag
     *     </orca.components.Button>
     *   )}
     * </orca.components.TagPopup>
     *
     * // Custom placeholder text
     * <orca.components.TagPopup
     *   blockId={456}
     *   closeMenu={handleClose}
     *   onTagClick={handleTagSelect}
     *   placeholder="Search or create a new tag..."
     *   container={containerRef}
     * >
     *   {(open) => (
     *     <span onClick={open}>Manage Tags</span>
     *   )}
     * </orca.components.TagPopup>
     * ```
     */
    TagPopup: (
      props: {
        blockId: DbId
        closeMenu: () => void
        onTagClick: (alias: string) => void | Promise<void>
        placeholder?: string
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
      } & Partial<{
        className?: string
        style?: CSSProperties
        menu: (close: () => void, state?: any) => ReactNode
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
        container?: RefObject<HTMLElement>
        alignment?: "left" | "top" | "center" | "bottom" | "right"
        placement?: "vertical" | "horizontal"
        defaultPlacement?: "top" | "bottom" | "left" | "right"
        allowBeyondContainer?: boolean
        noPointerLogic?: boolean
        keyboardNav?: boolean
        navDirection?: "vertical" | "both"
        menuAttr?: Record<string, any>
        offset?: number
        crossOffset?: number
        escapeToClose?: boolean
        onOpened?: () => void
        onClosed?: () => void
      }>,
    ) => JSX.Element | null
    /**
     * Provides an editor interface for managing and configuring tag properties.
     * Allows users to add, edit, and delete tag properties, set property types and values.
     *
     * @example
     * ```tsx
     * // Basic usage
     * <orca.components.TagPropsEditor
     *   blockId={123}
     * >
     *   {(open) => (
     *     <orca.components.Button variant="outline" onClick={open}>
     *       Edit Tag Properties
     *     </orca.components.Button>
     *   )}
     * </orca.components.TagPropsEditor>
     *
     * // With custom container
     * <orca.components.TagPropsEditor
     *   blockId={456}
     *   container={containerRef}
     * >
     *   {(open) => (
     *     <span onClick={open}>Configure Properties</span>
     *   )}
     * </orca.components.TagPropsEditor>
     *
     * // Combined with other components
     * <div className="tag-controls">
     *   <orca.components.TagPropsEditor blockId={789}>
     *     {(open) => (
     *       <orca.components.Button
     *         variant="plain"
     *         onClick={open}
     *         className="property-button"
     *       >
     *         <i className="ti ti-settings" />
     *       </orca.components.Button>
     *     )}
     *   </orca.components.TagPropsEditor>
     * </div>
     * ```
     */
    TagPropsEditor: (
      props: {
        blockId: DbId
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
      } & Partial<{
        className?: string
        style?: CSSProperties
        menu: (close: () => void, state?: any) => ReactNode
        children: (
          openMenu: (e: React.UIEvent, state?: any) => void,
          closeMenu: () => void,
        ) => ReactNode
        container?: RefObject<HTMLElement>
        alignment?: "left" | "top" | "center" | "bottom" | "right"
        placement?: "vertical" | "horizontal"
        defaultPlacement?: "top" | "bottom" | "left" | "right"
        allowBeyondContainer?: boolean
        noPointerLogic?: boolean
        keyboardNav?: boolean
        navDirection?: "vertical" | "both"
        menuAttr?: Record<string, any>
        offset?: number
        crossOffset?: number
        escapeToClose?: boolean
        onOpened?: () => void
        onClosed?: () => void
      }>,
    ) => JSX.Element | null
    /**
     * Tooltip component
     *
     * @example
     * ```tsx
     * // Basic text tooltip
     * <orca.components.Tooltip text="Delete this item">
     *   <button><i className="ti ti-trash" /></button>
     * </orca.components.Tooltip>
     *
     * // Tooltip with shortcut
     * <orca.components.Tooltip
     *   text="Save document"
     *   shortcut="⌘S"
     *   defaultPlacement="bottom"
     * >
     *   <orca.components.Button variant="solid">
     *     <i className="ti ti-device-floppy" />
     *   </orca.components.Button>
     * </orca.components.Tooltip>
     *
     * // Tooltip with image preview
     * <orca.components.Tooltip
     *   text="View original image"
     *   image="/path/to/preview.jpg"
     *   placement="horizontal"
     *   alignment="top"
     *   delay={500}
     * >
     *   <div className="thumbnail">
     *     <img src="/path/to/thumbnail.jpg" alt="Thumbnail" />
     *   </div>
     * </orca.components.Tooltip>
     * ```
     */
    Tooltip: (props: {
      text: React.ReactNode
      shortcut?: string
      image?: string
      children: React.ReactElement
      placement?: "vertical" | "horizontal"
      alignment?: "left" | "top" | "center" | "bottom" | "right"
      defaultPlacement?: "top" | "bottom" | "left" | "right"
      allowBeyondContainer?: boolean
      modifier?: "shift" | "ctrl" | "alt" | "meta"
      delay?: number
      [key: string]: any
    }) => JSX.Element | null
  }

  /**
   * Headbar API for registering custom buttons in the application's header bar.
   *
   * @example
   * ```ts
   * // Register a custom button in the headbar
   * orca.headbar.registerHeadbarButton("myplugin.syncButton", () => (
   *   <orca.components.Button
   *     variant="plain"
   *     onClick={() => syncData()}
   *   >
   *     <i className="ti ti-refresh" />
   *   </orca.components.Button>
   * ))
   * ```
   */
  headbar: {
    /**
     * Registers a custom button in the Orca headbar.
     *
     * @param id - A unique identifier for the button
     * @param render - A function that returns a React element to render
     *
     * @example
     * ```tsx
     * orca.headbar.registerHeadbarButton("myplugin.settingsButton", () => (
     *   <orca.components.Button
     *     variant="plain"
     *     onClick={() => orca.commands.invokeCommand("myplugin.openSettings")}
     *   >
     *     <i className="ti ti-settings-filled" />
     *   </orca.components.Button>
     * ))
     * ```
     */
    registerHeadbarButton(id: string, render: () => React.ReactElement): void

    /**
     * Unregisters a previously registered headbar button.
     *
     * @param id - The identifier of the button to unregister
     *
     * @example
     * ```ts
     * // When unloading the plugin
     * orca.headbar.unregisterHeadbarButton("myplugin.settingsButton")
     * ```
     */
    unregisterHeadbarButton(id: string): void
  }

  /**
   * Toolbar API for registering custom buttons in the block editor toolbar.
   *
   * @example
   * ```ts
   * // Register a simple toolbar button
   * orca.toolbar.registerToolbarButton("myplugin.formatButton", {
   *   icon: "ti ti-wand",
   *   tooltip: "Format selection",
   *   command: "myplugin.formatText"
   * })
   * ```
   */
  toolbar: {
    /**
     * Registers a toolbar button or group of buttons.
     *
     * @param id - A unique identifier for the button
     * @param button - Button configuration or array of button configurations
     *
     * @example
     * ```ts
     * // Register a single button with a command
     * orca.toolbar.registerToolbarButton("myplugin.formatButton", {
     *   icon: "ti ti-wand",
     *   tooltip: "Format text",
     *   command: "myplugin.formatText"
     * })
     *
     * // Register a button with a dropdown menu
     * const MenuText = orca.components.MenuText
     * orca.toolbar.registerToolbarButton("myplugin.insertButton", {
     *   icon: "ti ti-plus",
     *   tooltip: "Insert special content",
     *   menu: (close) => (
     *     <>
     *       <MenuText
     *         title="Insert Table"
     *         onClick={() => {
     *           close()
     *           orca.commands.invokeCommand("myplugin.insertTable")
     *         }}
     *       />
     *       <MenuText
     *         title="Insert Chart"
     *         onClick={() => {
     *           close()
     *           orca.commands.invokeCommand("myplugin.insertChart")
     *         }}
     *       />
     *     </>
     *   )
     * })
     *
     * // Register a group of related buttons
     * orca.toolbar.registerToolbarButton("myplugin.formattingTools", [
     *   {
     *     icon: "ti ti-bold",
     *     tooltip: "Bold",
     *     command: "myplugin.makeBold"
     *   },
     *   {
     *     icon: "ti ti-italic",
     *     tooltip: "Italic",
     *     command: "myplugin.makeItalic"
     *   }
     * ])
     * ```
     */
    registerToolbarButton(
      id: string,
      button: ToolbarButton | ToolbarButton[],
    ): void

    /**
     * Unregisters a previously registered toolbar button or button group.
     *
     * @param id - The identifier of the button or button group to unregister
     *
     * @example
     * ```ts
     * // When unloading the plugin
     * orca.toolbar.unregisterToolbarButton("myplugin.formatButton")
     * ```
     */
    unregisterToolbarButton(id: string): void
  }

  /**
   * Slash commands API for registering custom commands that appear when a user types '/' in the editor.
   * Slash commands provide quick access to actions directly from the editor.
   *
   * @example
   * ```ts
   * // Register a slash command
   * orca.slashCommands.registerSlashCommand("myplugin.insertTemplate", {
   *   icon: "ti ti-template",
   *   group: "Templates",
   *   title: "Insert Project Template",
   *   command: "myplugin.insertProjectTemplate"
   * })
   * ```
   */
  slashCommands: {
    /**
     * Registers a slash command that appears in the slash command menu.
     *
     * @param id - A unique identifier for the command
     * @param command - The slash command configuration
     *
     * @example
     * ```ts
     * orca.slashCommands.registerSlashCommand("myplugin.insertChart", {
     *   icon: "ti ti-chart-bar",
     *   group: "Insert",        // Group name for organization in the menu
     *   title: "Insert Chart",  // Display name in the menu
     *   command: "myplugin.insertChartCommand" // Command ID to execute
     * })
     * ```
     */
    registerSlashCommand(id: string, command: SlashCommand): void

    /**
     * Unregisters a previously registered slash command.
     *
     * @param id - The identifier of the slash command to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.slashCommands.unregisterSlashCommand("myplugin.insertChart")
     * ```
     */
    unregisterSlashCommand(id: string): void
  }
  /**
   * Block menu commands API for adding custom commands to block context menus.
   * This allows plugins to add custom actions that appear when users right-click on blocks' handle.
   *
   * @example
   * ```ts
   * // Register a command for single block selection
   * orca.blockMenuCommands.registerBlockMenuCommand("myplugin.analyzeBlock", {
   *   worksOnMultipleBlocks: false,
   *   render: (blockId, rootBlockId, close) => (
   *     <orca.components.MenuText
   *       title="Analyze Block"
   *       onClick={() => {
   *         close()
   *         analyzeBlockContent(blockId)
   *       }}
   *     />
   *   )
   * })
   * ```
   */
  blockMenuCommands: {
    /**
     * Registers a custom command in the block context menu.
     *
     * @param id - A unique identifier for the command
     * @param command - The command configuration, including whether it works with multiple blocks
     *                  and a render function that returns a React element
     *
     * @example
     * ```tsx
     * // Command that works on a single block
     * orca.blockMenuCommands.registerBlockMenuCommand("myplugin.exportBlock", {
     *   worksOnMultipleBlocks: false,
     *   render: (blockId, rootBlockId, close) => (
     *     <orca.components.MenuText
     *       preIcon="ti ti-file-export"
     *       title="Export as JSON"
     *       onClick={() => {
     *         close()
     *         exportBlockAsJson(blockId)
     *       }}
     *     />
     *   )
     * })
     *
     * // Command that works on multiple selected blocks
     * orca.blockMenuCommands.registerBlockMenuCommand("myplugin.mergeBlocks", {
     *   worksOnMultipleBlocks: true,
     *   render: (blockIds, rootBlockId, close) => (
     *     <orca.components.MenuText
     *       preIcon="ti ti-combine"
     *       title={`Merge ${blockIds.length} Blocks`}
     *       onClick={() => {
     *         close()
     *         mergeSelectedBlocks(blockIds)
     *       }}
     *     />
     *   )
     * })
     * ```
     */
    registerBlockMenuCommand(id: string, command: BlockMenuCommand): void

    /**
     * Unregisters a previously registered block menu command.
     *
     * @param id - The identifier of the block menu command to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.blockMenuCommands.unregisterBlockMenuCommand("myplugin.exportBlock")
     * ```
     */
    unregisterBlockMenuCommand(id: string): void
  }
  /**
   * Tag menu commands API for adding custom commands to tag context menus.
   * This allows plugins to add custom actions that appear when users open the tag's context menu.
   *
   * @example
   * ```ts
   * // Register a command for the tag context menu
   * const MenuText = orca.components.MenuText
   * orca.tagMenuCommands.registerTagMenuCommand("myplugin.tagStats", {
   *   render: (tagBlock, close) => (
   *     <MenuText
   *       title="Show Tag Statistics"
   *       onClick={() => {
   *         close()
   *         showTagStatistics(tagBlock)
   *       }}
   *     />
   *   )
   * })
   * ```
   */
  tagMenuCommands: {
    /**
     * Registers a custom command in the tag context menu.
     *
     * @param id - A unique identifier for the command
     * @param command - The command configuration, including a render function
     *                  that returns a React element
     *
     * @example
     * ```tsx
     * orca.tagMenuCommands.registerTagMenuCommand("myplugin.exportTaggedBlocks", {
     *   render: (tagBlock, close) => (
     *     <orca.components.MenuText
     *       preIcon="ti ti-file-export"
     *       title="Export Tagged Blocks"
     *       onClick={() => {
     *         close()
     *         exportTaggedBlocks(tagBlock)
     *       }}
     *     />
     *   )
     * })
     * ```
     */
    registerTagMenuCommand(id: string, command: TagMenuCommand): void

    /**
     * Unregisters a previously registered tag menu command.
     *
     * @param id - The identifier of the tag menu command to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.tagMenuCommands.unregisterTagMenuCommand("myplugin.exportTaggedBlocks")
     * ```
     */
    unregisterTagMenuCommand(id: string): void
  }
  /**
   * Editor sidetools API for adding custom tools to the block editor's sidebar.
   * This allows plugins to add custom utilities and functionality in the editor sidebar.
   *
   * @example
   * ```ts
   * // Register a custom sidetool
   * orca.editorSidetools.registerEditorSidetool("myplugin.outlineViewer", {
   *   render: (rootBlockId, panelId) => (
   *     <Tooltip
   *       text={t("Outline Viewer")}
   *       shortcut={orca.state.shortcuts["toggleOutlineViewer"]}
   *       placement="horizontal"
   *     >
   *       <Button
   *         className={`orca-block-editor-sidetools-btn ${isViewerOpened ? "orca-opened" : ""}`}
   *         variant="plain"
   *         onClick={toggleOutlineViewer}
   *       >
   *         <i className="ti ti-align-justified" />
   *       </Button>
   *     </Tooltip>
   *   )
   * })
   * ```
   */
  editorSidetools: {
    /**
     * Registers a custom tool in the editor sidebar.
     *
     * @param id - A unique identifier for the sidetool
     * @param tool - The sidetool configuration with a render function
     *
     * @example
     * ```tsx
     * // Register a custom sidetool
     * orca.editorSidetools.registerEditorSidetool("myplugin.outlineViewer", {
     *   render: (rootBlockId, panelId) => (
     *     <Tooltip
     *       text={t("Outline Viewer")}
     *       shortcut={orca.state.shortcuts["toggleOutlineViewer"]}
     *       placement="horizontal"
     *     >
     *       <Button
     *         className={`orca-block-editor-sidetools-btn ${isViewerOpened ? "orca-opened" : ""}`}
     *         variant="plain"
     *         onClick={toggleOutlineViewer}
     *       >
     *         <i className="ti ti-align-justified" />
     *       </Button>
     *     </Tooltip>
     *   )
     * })
     * ```
     */
    registerEditorSidetool(id: string, tool: EditorSidetool): void

    /**
     * Unregisters a previously registered editor sidetool.
     *
     * @param id - The identifier of the editor sidetool to unregister
     *
     * @example
     * ```ts
     * // When unloading a plugin
     * orca.editorSidetools.unregisterEditorSidetool("myplugin.outlineViewer")
     * ```
     */
    unregisterEditorSidetool(id: string): void
  }

  /**
   * Utility functions.
   *
   * These methods help plugins and extensions interact with the editor's selection and cursor state,
   * enabling advanced text manipulation and integration with Orca's block-based editing model.
   */
  utils: {
    /**
     * Converts a DOM Selection object into Orca's internal CursorData format.
     *
     * @param selection - The DOM Selection object (e.g., from window.getSelection())
     * @returns The corresponding CursorData object, or null if the selection is invalid or outside the editor.
     *
     * @example
     * ```ts
     * const selection = window.getSelection();
     * const cursorData = orca.utils.getCursorDataFromSelection(selection);
     * if (cursorData) {
     *   // Use cursorData for editor commands
     * }
     * ```
     */
    getCursorDataFromSelection: (
      selection: Selection | null,
    ) => CursorData | null

    /**
     * Converts a DOM Range object into Orca's internal CursorData format.
     *
     * @param range - The DOM Range object (e.g., from selection.getRangeAt(0))
     * @returns The corresponding CursorData object, or null if the range is invalid or outside the editor.
     *
     * @example
     * ```ts
     * const selection = window.getSelection();
     * if (selection && selection.rangeCount > 0) {
     *   const range = selection.getRangeAt(0);
     *   const cursorData = orca.utils.getCursorDataFromRange(range);
     * }
     * ```
     */
    getCursorDataFromRange: (range: Range | undefined) => CursorData | null

    /**
     * Sets the editor's selection and caret position based on Orca's CursorData.
     *
     * @param cursorData - The CursorData object specifying the desired selection/cursor position.
     * @returns A Promise that resolves when the selection has been updated.
     *
     * @example
     * ```ts
     * // Move the caret to a specific block and offset
     * await orca.utils.setSelectionFromCursorData(cursorData);
     * ```
     */
    setSelectionFromCursorData: (cursorData: CursorData) => Promise<void>

    /**
     * Resolves the absolute URL or file path for an asset used by a plugin or the application.
     * You can override it to provide a mapping.
     *
     * @param assetPath - The absolute path to the asset.
     * @returns The absolute URL or file path to the asset, suitable for use in image, video or other resources.
     *
     * @example
     * ```ts
     * // Get the full path to a plugin image asset
     * const iconUrl = orca.utils.getAssetPath(iconSrc)
     *
     * // Use in a React component
     * <img src={orca.utils.getAssetPath(iconSrc)} alt="Logo" />
     * ```
     */
    getAssetPath: (assetPath: string) => string
  }

  /**
   * Display a notification to the user. Notifications appear in the bottom right corner of the application
   * and can be used to inform users about events, actions, or state changes.
   *
   * @param type - The type of notification, which determines its appearance and icon
   * @param message - The main notification message to display
   * @param options - Optional configuration including title and action callback
   *
   * @example
   * ```ts
   * // Simple info notification
   * orca.notify("info", "Processing complete")
   *
   * // Error notification with title
   * orca.notify("error", "Failed to connect to API", {
   *   title: "Connection Error"
   * })
   *
   * // Success notification with action button
   * orca.notify("success", "File exported successfully", {
   *   title: "Export Complete",
   *   action: () => {
   *     orca.commands.invokeCommand("myplugin.openExportedFile")
   *   }
   * })
   * ```
   */
  notify: (
    type: "info" | "success" | "warn" | "error",
    message: string,
    options?: {
      title?: string
      action?: () => void | Promise<void>
    },
  ) => void
}

// Backend API
/**
 * Supported backend API message types for communicating with the Orca backend.
 * These message types are used with the `invokeBackend` method to perform
 * various operations on blocks, tags, journals, and other repository data.
 */
export type APIMsg =
  /** Changes the single/multi choice property value */
  | "change-tag-property-choice"
  /** Exports the specified block as a PNG image. */
  | "export-png"
  /** Retrieves all blocks with the specified alias. */
  | "get-aliased-blocks"
  /** Retrieves all aliases in the repository. */
  | "get-aliases"
  /** Retrieves block IDs for a list of aliases. */
  | "get-aliases-ids"
  /** Retrieves a block by its ID. */
  | "get-block"
  /** Retrieves a block by its alias. */
  | "get-block-by-alias"
  /** Retrieves the ID of a block by its alias. */
  | "get-blockid-by-alias"
  /** Retrieves multiple blocks by their IDs. */
  | "get-blocks"
  /** Retrieves blocks with specific tags. */
  | "get-blocks-with-tags"
  /** Retrieves a block and all its nested child blocks (tree structure). */
  | "get-block-tree"
  /** Retrieves child tags of a parent tag block. */
  | "get-children-tags"
  /** Retrieves the journal block for a specific date. */
  | "get-journal-block"
  /** Retrieves all remindings for a specific date range */
  | "get-remindings"
  /** Executes a complex query to search and filter blocks. */
  | "query"
  /** Searches for aliases containing specific text. */
  | "search-aliases"
  /** Searches for blocks containing specific text. */
  | "search-blocks-by-text"
  /** Sets an application-level configuration option. */
  | "set-app-config"
  /** Sets a repository-level configuration option. */
  | "set-config"
  /** Opens a URL or file using the system's default application. */
  | "shell-open"
  /** Displays a file in the system's file explorer (e.g., Finder on macOS, Explorer on Windows). */
  | "show-in-folder"
  /** Uploads a binary asset (e.g., an image) to the repository. */
  | "upload-asset-binary"
  /** Upload multiple asset files to the repository. */
  | "upload-assets"
  /** Perform OCR on an image. */
  | "image-ocr"
  | string

// Panels
/**
 * Types of views that can be displayed in a panel.
 * Currently supports journal view (for displaying daily notes) and block view (for displaying block content).
 */
export type PanelView = string

/**
 * Represents a panel container that arranges its children in a row.
 * Used for horizontal panel layouts.
 */
export interface RowPanel {
  /** Unique identifier for the row panel */
  id: string
  /** Specifies that children are arranged horizontally */
  direction: "row"
  /** Child panels contained within this row */
  children: (ColumnPanel | ViewPanel)[]
  /** Height of the row panel in pixels */
  height: number
}

/**
 * Represents a panel container that arranges its children in a column.
 * Used for vertical panel layouts.
 */
export interface ColumnPanel {
  /** Unique identifier for the column panel */
  id: string
  /** Specifies that children are arranged vertically */
  direction: "column"
  /** Child panels contained within this column */
  children: (RowPanel | ViewPanel)[]
  /** Width of the column panel in pixels */
  width: number
}

/**
 * Represents a view panel that displays content (journal or block).
 * These are the leaf panels in the panel hierarchy that actually render content.
 */
export interface ViewPanel {
  /** Unique identifier for the view panel */
  id: string
  /** Type of view displayed in this panel (journal or block) */
  view: PanelView
  /** Arguments for the view, such as blockId for block views or date for journal views */
  viewArgs: Record<string, any>
  /** State of the view, used to preserve UI state like scroll position or editor selections */
  viewState: Record<string, any>
  /** Optional width of the panel in pixels */
  width?: number
  /** Optional height of the panel in pixels */
  height?: number
  /** Whether the panel is locked and cannot be closed or resized */
  locked?: boolean
  /** Whether the panel should take up extra space when available */
  wide?: boolean
}

/**
 * Represents an entry in the panel navigation history.
 * Used to implement back/forward navigation between panel states.
 */
export interface PanelHistory {
  /** ID of the panel that was active at this history point */
  activePanel: string
  /** The view type that was displayed */
  view: PanelView
  /** Arguments for the view at this history point */
  viewArgs?: Record<string, any>
}

/**
 * Configuration for saved panel layouts.
 * Allows users to save and restore different workspace arrangements.
 */
export interface PanelLayouts {
  /** The key of the default layout to use */
  default: string
  /** Map of named layouts with their panel configurations */
  layouts: Record<string, { activePanel: string; panels: RowPanel }>
}

/**
 * Properties for rendering a panel component.
 */
export type PanelProps = {
  panelId: string
  active: boolean
  preview?: "content" | "backRef"
  customQuery?: BlockCustomQuery
}

// Commands
/**
 * Basic command function type that defines functions that can be executed as commands.
 * Can be synchronous or asynchronous.
 */
export type CommandFn = (...args: any[]) => void | Promise<void>

/**
 * Editor command function type that defines functions that can be executed in the editor context.
 * These commands support undo/redo functionality by returning undo arguments.
 */
export type EditorCommandFn = (
  editor: EditorArg,
  ...args: any[]
) =>
  | { ret?: any; undoArgs: any }
  | null
  | Promise<{ ret?: any; undoArgs?: any } | null>

/**
 * Defines a command's properties including its label, function, and behavioral flags.
 */
export interface Command {
  /** Human-readable name for the command */
  label: string
  /** The function to execute when the command is invoked, or a pair of do/undo functions */
  fn: CommandFn | [EditorCommandFn, CommandFn]
  /** Whether the command accepts arguments */
  hasArgs?: boolean
  /** Whether the command can be executed when no panel has focus */
  noFocusNeeded?: boolean
}

/**
 * Command with additional pinyin data for search functionality in non-Latin languages.
 */
export interface CommandWithPinyin extends Command {
  /** Pinyin phonetic representation for improved search in Chinese */
  pinyin: string
}

/**
 * Arguments passed to editor commands.
 */
export type EditorArg = [
  /** ID of the panel where the command is being executed */
  string,
  /** ID of the root block in the editor */
  DbId,
  /** Cursor position data or null if no selection */
  CursorData | null,
  /** Whether this is a redo operation */
  boolean,
]

/**
 * Predicate function type used for "before command" hooks.
 * Returns true to allow the command to proceed, false to cancel it.
 */
export type BeforeHookPred = (id: string, ...args: any[]) => boolean

/**
 * Function type used for "after command" hooks.
 * Called after a command has been executed.
 */
export type AfterHook = (id: string, ...args: any[]) => void | Promise<void>

/**
 * Represents the current cursor position in the editor.
 * Contains both anchor (start) and focus (end) positions.
 */
export interface CursorData {
  /** Start position of the selection */
  anchor: CursorNodeData
  /** End position of the selection */
  focus: CursorNodeData
  /** Whether the selection direction is forward (anchor comes before focus) */
  isForward: boolean
  /** ID of the panel containing the cursor */
  panelId: string
  /** ID of the root block in the editor */
  rootBlockId: DbId
}

/**
 * Detailed cursor position within a specific block.
 */
export interface CursorNodeData {
  /** ID of the block where the cursor is located */
  blockId: DbId
  /** Whether the cursor is in inline content */
  isInline: boolean
  /** Index within the block's content array */
  index: number
  /** Character offset within the content item */
  offset: number
}

// Notifications
/**
 * Represents a notification displayed to the user.
 * Notifications provide feedback about operations or important information.
 */
export interface Notification {
  /** Unique identifier for the notification */
  id: number
  /** Type of notification that determines its visual appearance and severity */
  type: "info" | "success" | "warn" | "error"
  /** Optional title text for the notification */
  title?: string
  /** Main message content of the notification */
  message: string
  /** Optional action callback that can be triggered from the notification */
  action?: () => void | Promise<void>
}

// Plugins
/**
 * Represents a plugin installed in Orca.
 * Plugins extend the functionality of Orca with additional features.
 */
export interface Plugin {
  /** Whether the plugin is currently enabled */
  enabled: boolean
  /** Icon identifier for the plugin */
  icon: string
  /** Optional settings schema defining available configuration options */
  schema?: PluginSettingsSchema
  /** Current settings values for the plugin */
  settings?: Record<string, any>
  /** The loaded plugin module when enabled */
  module?: any
}

/**
 * Schema that defines the settings available for a plugin and how they should be presented in the UI.
 * Each key represents a setting name with its configuration.
 */
export interface PluginSettingsSchema {
  [key: string]: {
    /** Human-readable label for the setting */
    label: string
    /** Optional description explaining the purpose of the setting */
    description?: string
    /** Data type of the setting, which determines how it is edited in the UI */
    type:
      | "string"
      | "number"
      | "boolean"
      | "date"
      | "time"
      | "datetime"
      | "dateRange"
      | "datetimeRange"
      | "color"
      | "singleChoice"
      | "multiChoices"
      | "array"
    /** Default value for the setting if not explicitly set */
    defaultValue?: any
    /** For choice types, the available options */
    choices?: { label: string; value: string }[]
    /** For array types, the schema for each item in the array */
    arrayItemSchema?: PluginSettingsSchema
  }
}

// Toolbar
/**
 * Configuration for a toolbar button in the editor toolbar.
 * Buttons can execute commands or display menus with additional options.
 */
export interface ToolbarButton {
  /** Icon identifier (usually a Tabler Icons class) */
  icon: string
  /** Tooltip text displayed on hover */
  tooltip: string
  /** Optional command ID to execute when clicked */
  command?: string
  /** Optional function to render a dropdown menu when clicked */
  menu?: (close: () => void, state?: any) => React.ReactNode
  /** Optional text color for the button */
  color?: string
  /** Optional background color for the button */
  background?: string
}

// Slash Command
/**
 * Configuration for a slash command that appears in the editor's slash menu.
 * Slash commands provide quick access to actions from within the editor.
 */
export interface SlashCommand {
  /** Icon identifier for the command */
  icon: string
  /** Group name for organizing commands in the slash menu */
  group: string
  /** Display title for the command */
  title: string
  /** Command ID to execute when selected */
  command: string
}

/**
 * Slash command with additional pinyin data for search functionality in Chinese.
 */
export interface SlashCommandWithPinyin extends SlashCommand {
  /** Pinyin phonetic representation for improved search in Chinese */
  pinyin: string
}

// Block Menu Command
/**
 * Command configuration for the block context menu.
 * Can be configured to work with single blocks or multiple selected blocks.
 */
export type BlockMenuCommand =
  | {
      /** Indicates this command works only on a single block */
      worksOnMultipleBlocks: false
      /** Function to render the menu item, receiving the block ID and context */
      render: (
        blockId: DbId,
        rootBlockId: DbId,
        close: () => void,
      ) => React.ReactNode
    }
  | {
      /** Indicates this command works on multiple selected blocks */
      worksOnMultipleBlocks: true
      /** Function to render the menu item, receiving an array of block IDs and context */
      render: (
        blockIds: DbId[],
        rootBlockId: DbId,
        close: () => void,
      ) => React.ReactNode
    }

// Tag Menu Command
/**
 * Command configuration for the tag context menu.
 * Adds custom actions to tag right-click menus.
 */
export type TagMenuCommand = {
  /**
   * Function to render the menu item, receiving the tag block, the close function
   * and the tag reference if called on a tag instance.
   */
  render: (
    tagBlock: Block,
    close: () => void,
    tagRef?: BlockRef,
  ) => React.ReactElement
}

// Editor Sidetool
/**
 * Configuration for an editor sidetool that appears in the block editor's sidebar.
 * Sidetools provide additional functionality and utilities in the editor sidebar.
 */
export type EditorSidetool = {
  /**
   * Function to render the sidetool, receiving the root block ID and panel ID.
   */
  render: (rootBlockId: DbId, panelId: string) => React.ReactNode
}

// Blocks
/**
 * Database ID type used to uniquely identify blocks and other entities in the database.
 */
export type DbId = number

/**
 * Core block data structure that represents a single note, section, or other content unit.
 * Blocks are the primary building blocks of content in Orca.
 */
export interface Block {
  /** Unique identifier for the block */
  id: DbId
  /** Optional array of content fragments for rich text content */
  content?: ContentFragment[]
  /** Optional plain text content, used along with the content array */
  text?: string
  /** Timestamp when the block was created */
  created: Date
  /** Timestamp when the block was last modified */
  modified: Date
  /** ID of the parent block, if any */
  parent?: DbId
  /** ID of the block to the left in the content flow, used for ordering siblings */
  left?: DbId
  /** Array of child block IDs */
  children: DbId[]
  /** Array of aliases (alternative names) for the block */
  aliases: string[]
  /** Array of named properties attached to the block */
  properties: BlockProperty[]
  /** Array of outgoing references from this block to other blocks */
  refs: BlockRef[]
  /** Array of incoming references from other blocks to this block */
  backRefs: BlockRef[]
}

/**
 * Represents a fragment of rich text content within a block.
 * Different fragment types allow for various content formats like text, links, code, etc.
 */
export type ContentFragment = {
  /** The type of content fragment (e.g., "text", "code", "link") */
  t: string
  /** The value of the content fragment */
  v: any
  /** Optional formatting information */
  f?: string
  /** Optional formatting arguments */
  fa?: Record<string, any>
  /** Additional properties can be included based on content type */
  [key: string]: any
}

/**
 * Represents a block's structure and type information.
 * Used by converters and renderers to determine how to handle a block.
 */
export type Repr = {
  /** The type of the block (e.g., "text", "code", "heading") */
  type: string
  /** Additional properties specific to the block type */
  [key: string]: any
}

/**
 * Represents a named property attached to a block.
 * Properties can store metadata and structured data associated with blocks.
 */
export interface BlockProperty {
  /** Name of the property */
  name: string
  /** Type code for the property (determines how the value is interpreted) */
  type: number
  /** Optional arguments specific to the property type */
  typeArgs?: any
  /** The property value */
  value?: any
  /** Optional position for visual ordering of properties */
  pos?: number
}

/**
 * Represents a reference from one block to another.
 * References create connections between different blocks in the knowledge graph.
 */
export interface BlockRef {
  /** Unique identifier for the reference */
  id: DbId
  /** ID of the block containing the reference */
  from: DbId
  /** ID of the block being referenced */
  to: DbId
  /** Type code for the reference */
  type: number
  /** Optional alias name used for the reference */
  alias?: string
  /** Optional additional properties for the reference */
  data?: BlockProperty[]
}

/**
 * Simplified type for block reference data.
 */
export type BlockRefData = Pick<BlockProperty, "name" | "type" | "value">

/**
 * Simplified block structure used when converting blocks to other formats.
 */
export type BlockForConversion = {
  /** Content fragments in the block */
  content?: ContentFragment[]
  /** IDs of child blocks */
  children?: DbId[]
  sub?: [BlockForConversion, Repr, Block][]
}

/**
 * Context for block conversion, used to track export scope.
 */
export type ConvertContext = {
  /** The root block ID of the export scope */
  exportRootId?: DbId
}

/** Block rendering modes */
export type BlockRenderingMode = "normal" | "simple" | "simple-children"

// Query
/**
 * Describes a query for searching and filtering blocks.
 * Used to construct complex queries that can combine multiple conditions.
 */
export interface QueryDescription {
  /** The main query group with conditions */
  q?: QueryGroup
  /** Optional block ID to exclude from results */
  excludeId?: DbId
  /** Array of sort specifications for ordering results */
  sort?: QuerySort[]
  /** For paginated results, the page number (0-based) */
  page?: number
  /** For paginated results, the number of items per page */
  pageSize?: number
  /** Filters results to blocks with a specific tag */
  tagName?: string
  /** Field to group results by */
  groupBy?: string
  /** Specifies which group to return results for */
  group?: string
  /** Statistical calculations to perform on results */
  stats?: QueryStat[]
  /** Whether to format results as a table */
  asTable?: boolean
  /** Calendar view configuration if results should be displayed in calendar format */
  asCalendar?: {
    /** Field to use for calendar date (created/modified/journal date) */
    field: "created" | "modified" | "journal"
    /** Start date for the calendar range */
    start: Date
    /** End date for the calendar range */
    end: Date
  }
}

/**
 * Union type representing all possible query condition items.
 * Each item represents a different type of condition that can be used in queries.
 */
export type QueryItem =
  | QueryGroup
  | QueryText
  | QueryTag
  | QueryRef
  | QueryJournal
  | QueryBlock
  | QueryNoText
  | QueryNoTag
  | QueryNoRef

/**
 * A group of query conditions combined with a logical operator.
 * Used to create complex queries with multiple conditions.
 */
export interface QueryGroup {
  /** Kind of group: 1 for AND, 2 for OR */
  kind: QueryKindAnd | QueryKindOr
  /** Array of conditions within this group */
  conditions: QueryItem[]
  /** Whether to include descendant blocks in results */
  includeDescendants?: boolean
  /** Optional conditions that apply to descendant blocks */
  subConditions?: QueryGroup
}

/**
 * Query condition that matches blocks with a specific tag.
 * Can also match based on tag properties.
 */
export interface QueryTag {
  /** Kind identifier for tag queries (4) */
  kind: QueryKindTag
  /** The tag name to match */
  name: string
  /** Optional property conditions for the tag */
  properties?: QueryTagProperty[]
  /** Whether to include descendant blocks in results */
  includeDescendants?: boolean
}

/**
 * Query condition that matches blocks without a specific tag.
 */
export interface QueryNoTag {
  /** Kind identifier for no-tag queries (5) */
  kind: QueryKindNoTag
  /** The tag name that should not be present */
  name: string
}

/**
 * Query condition that matches journal blocks in a date range.
 */
export interface QueryJournal {
  /** Kind identifier for journal queries (3) */
  kind: QueryKindJournal
  /** Start date for the journal range */
  start: QueryJournalDate
  /** End date for the journal range */
  end: QueryJournalDate
  /** Whether to include descendant blocks in results */
  includeDescendants?: boolean
}

/**
 * Represents a date specification for journal queries.
 * Can be relative (e.g., "2 days ago") or absolute.
 */
export interface QueryJournalDate {
  /** Type of date: 1 for relative, 2 for full/absolute date */
  t: QueryJournalRelative | QueryJournalFull
  /** For relative dates, the numeric value (e.g., 2 in "2 days ago") */
  v?: number
  /** For relative dates, the unit (s=seconds, m=minutes, h=hours, d=days, w=weeks, M=months, y=years) */
  u?: "s" | "m" | "h" | "d" | "w" | "M" | "y"
}

/**
 * Query condition that matches blocks referencing a specific block.
 */
export interface QueryRef {
  /** Kind identifier for reference queries (6) */
  kind: QueryKindRef
  /** ID of the block that should be referenced */
  blockId: DbId
  /** Whether to include descendant blocks in results */
  includeDescendants?: boolean
}

/**
 * Query condition that matches blocks not referencing a specific block.
 */
export interface QueryNoRef {
  /** Kind identifier for no-reference queries (7) */
  kind: QueryKindNoRef
  /** ID of the block that should not be referenced */
  blockId: DbId
}

/**
 * Query condition that matches blocks containing specific text.
 */
export interface QueryText {
  /** Kind identifier for text queries (8) */
  kind: QueryKindText
  /** The text to search for */
  text: string
  /** Whether to perform raw text search (no stemming/normalization) */
  raw?: boolean
  /** Whether to include descendant blocks in results */
  includeDescendants?: boolean
}

export interface QueryNoText {
  /** Kind identifier for no-text queries (10) */
  kind: QueryKindNoText
  /** The text to exclude */
  text: string
  /** Whether to perform raw text search */
  raw?: boolean
}

/**
 * Query condition that matches blocks according their properties.
 */
export interface QueryBlock {
  /** Kind identifier for block queries (9) */
  kind: QueryKindBlock
  /** The block types to match or not match */
  types?: {
    op?: QueryHas | QueryNotHas
    value?: string[]
  }
  /** Whether to match blocks with a parent */
  hasParent?: boolean
  /** Whether to match blocks with a child */
  hasChild?: boolean
  /** Whether to match blocks with tags */
  hasTags?: boolean
  /** Whether to match blocks with back references */
  hasBackRefs?: boolean
  /** Whether to match blocks with aliases */
  hasAliases?: boolean
  /** Whether to match blocks with a specific creation date */
  created?: {
    op?: QueryEq | QueryNotEq | QueryGt | QueryLt | QueryGe | QueryLe
    value?: Date | QueryJournalDate
  }
  /** Whether to match blocks with a specific modification date */
  modified?: {
    op?: QueryEq | QueryNotEq | QueryGt | QueryLt | QueryGe | QueryLe
    value?: Date | QueryJournalDate
  }
  /** Whether to include descendant blocks in results */
  includeDescendants?: boolean
}

/** Query condition that matches task blocks */
export interface QueryTask {
  /** Kind identifier for task queries (11) */
  kind: QueryKindTask
  /** Whether the task is completed */
  completed?: boolean
}

/**
 * Condition for querying tag properties with specific values.
 */
export interface QueryTagProperty {
  /** Name of the tag property */
  name: string
  /** Optional type code for the property */
  type?: number
  /** Optional type arguments */
  typeArgs?: any
  /** Operation to perform (equals, not equals, etc.) */
  op?:
    | QueryEq
    | QueryNotEq
    | QueryIncludes
    | QueryNotIncludes
    | QueryHas
    | QueryNotHas
    | QueryGt
    | QueryLt
    | QueryGe
    | QueryLe
    | QueryNull
    | QueryNotNull
  /** Value to compare against */
  value?: any
}

/**
 * Specifies sorting for query results.
 * A tuple of field name and direction.
 */
export type QuerySort = [string, "ASC" | "DESC"]

/**
 * Types of statistical operations that can be performed on query results.
 */
export type QueryStat =
  | "" // No statistics
  | "count" // Count of all items
  | "count_e" // Count of items with non-empty values
  | "count_ne" // Count of items with empty values
  | "sum" // Sum of all values
  | "avg" // Average of all values
  | "min" // Minimum value
  | "max" // Maximum value
  | "percent_e" // Percentage of items with non-empty values
  | "percent_ne" // Percentage of items with empty values

/**
 * Constant for the AND query group type.
 * All conditions must match for the group to match.
 */
export type QueryKindAnd = 1

/**
 * Constant for the OR query group type.
 * At least one condition must match for the group to match.
 */
export type QueryKindOr = 2

/**
 * Constant for the journal query type.
 * Matches blocks in journal date range.
 */
export type QueryKindJournal = 3

/**
 * Constant for the tag query type.
 * Matches blocks with specific tags.
 */
export type QueryKindTag = 4

/**
 * Constant for the no-tag query type.
 * Matches blocks without specific tags.
 */
export type QueryKindNoTag = 5

/**
 * Constant for the reference query type.
 * Matches blocks referencing other blocks.
 */
export type QueryKindRef = 6

/**
 * Constant for the no-reference query type.
 * Matches blocks not referencing other blocks.
 */
export type QueryKindNoRef = 7

/**
 * Constant for the text query type.
 * Matches blocks containing specific text.
 */
export type QueryKindText = 8

/**
 * Constant for the block query type.
 * Matches blocks according to their properties.
 */
export type QueryKindBlock = 9

/**
 * Constant for the no-text query type.
 * Matches blocks without specific text.
 */
export type QueryKindNoText = 10

/**
 * Constant for the task query type.
 * Matches blocks that are tasks, optionally filtering by completion status.
 */
export type QueryKindTask = 11

/**
 * Constant for the block match query type.
 * Matches specific blocks by their ID.
 */
export type QueryKindBlockMatch = 12

/**
 * Operation constant: equals.
 * Matches if a value is equal to the specified value.
 */
export type QueryEq = 1

/**
 * Operation constant: not equals.
 * Matches if a value is not equal to the specified value.
 */
export type QueryNotEq = 2

/**
 * Operation constant: includes.
 * Matches if an array value includes the specified value.
 */
export type QueryIncludes = 3

/**
 * Operation constant: not includes.
 * Matches if an array value doesn't include the specified value.
 */
export type QueryNotIncludes = 4

/**
 * Operation constant: has property.
 * Matches if an object has the specified property.
 */
export type QueryHas = 5

/**
 * Operation constant: doesn't have property.
 * Matches if an object doesn't have the specified property.
 */
export type QueryNotHas = 6

/**
 * Operation constant: greater than.
 * Matches if a value is greater than the specified value.
 */
export type QueryGt = 7

/**
 * Operation constant: less than.
 * Matches if a value is less than the specified value.
 */
export type QueryLt = 8

/**
 * Operation constant: greater than or equal to.
 * Matches if a value is greater than or equal to the specified value.
 */
export type QueryGe = 9

/**
 * Operation constant: less than or equal to.
 * Matches if a value is less than or equal to the specified value.
 */
export type QueryLe = 10

/**
 * Operation constant: is null.
 * Matches if a value is null or undefined.
 */
export type QueryNull = 11

/**
 * Operation constant: is not null.
 * Matches if a value is neither null nor undefined.
 */
export type QueryNotNull = 12

/**
 * Constant for relative date specification in journal queries.
 * Used for dates like "2 days ago" or "next week".
 */
export type QueryJournalRelative = 1

/**
 * Constant for absolute date specification in journal queries.
 * Used for specific dates.
 */
export type QueryJournalFull = 2

/**
 * Describes a query for searching and filtering blocks.
 * Used to construct complex queries that can combine multiple conditions.
 */
export interface QueryDescription2 {
  /** The main query group with conditions */
  q?: QueryGroup2
  /** Optional block ID to exclude from results */
  excludeId?: DbId
  /** Array of sort specifications for ordering results */
  sort?: QuerySort[]
  /** For paginated results, the page number (0-based) */
  page?: number
  /** For paginated results, the number of items per page */
  pageSize?: number
  /** Filters results to blocks with a specific tag */
  tagName?: string
  /** Field to group results by */
  groupBy?: string
  /** Specifies which group to return results for */
  group?: string
  /** Statistical calculations to perform on results */
  stats?: QueryStat[]
  /** Whether to format results as a table */
  asTable?: boolean
  /** Calendar view configuration if results should be displayed in calendar format */
  asCalendar?: {
    /** Field to use for calendar date (created/modified/journal date) */
    field: "created" | "modified" | "journal"
    /** Start date for the calendar range */
    start: Date
    /** End date for the calendar range */
    end: Date
  }
}

/**
 * Union type representing all possible query condition items.
 * Each item represents a different type of condition that can be used in queries.
 */
export type QueryItem2 =
  | QueryGroup2
  | QueryText2
  | QueryTag2
  | QueryRef2
  | QueryJournal2
  | QueryBlock2
  | QueryBlockMatch2
  | QueryTask

/**
 * A group of query conditions combined with a logical operator.
 * Used to create complex queries with multiple conditions.
 */
export interface QueryGroup2 {
  /** Kind of group: self/ancestor/descendant/chain */
  kind:
    | QueryKindSelfAnd
    | QueryKindSelfOr
    | QueryKindAncestorAnd
    | QueryKindAncestorOr
    | QueryKindDescendantAnd
    | QueryKindDescendantOr
    | QueryKindChainAnd
  /** Array of conditions within this group */
  conditions: QueryItem2[]
  /** Whether to negate the conditions in this group */
  negate?: boolean
}

/**
 * Query condition that matches blocks containing specific text.
 */
export interface QueryText2 {
  /** Kind identifier for text queries (8) */
  kind: QueryKindText
  /** The text to search for */
  text: string
  /** Whether to perform raw text search (no stemming/normalization) */
  raw?: boolean
}

/**
 * Query condition that matches blocks with a specific tag.
 * Can also match based on tag properties.
 */
export interface QueryTag2 {
  /** Kind identifier for tag queries (4) */
  kind: QueryKindTag
  /** The tag name to match */
  name: string
  /** Optional property conditions for the tag */
  properties?: QueryTagProperty[]
  /** Only show direct tag references, not references to included tags */
  selfOnly?: boolean
}

/**
 * Query condition that matches blocks referencing a specific block.
 */
export interface QueryRef2 {
  /** Kind identifier for reference queries (6) */
  kind: QueryKindRef
  /** ID of the block that should be referenced */
  blockId?: DbId
  /** Only show direct references, not references to included tags */
  selfOnly?: boolean
}

/**
 * Query condition that matches journal blocks in a date range.
 */
export interface QueryJournal2 {
  /** Kind identifier for journal queries (3) */
  kind: QueryKindJournal
  /** Start date for the journal range */
  start: QueryJournalDate
  /** End date for the journal range */
  end: QueryJournalDate
}

/**
 * Query condition that matches blocks according their properties.
 */
export interface QueryBlock2 {
  /** Kind identifier for block queries (9) */
  kind: QueryKindBlock
  /** The block types to match or not match */
  types?: {
    op?: QueryHas | QueryNotHas
    value?: string[]
  }
  /** Whether to match blocks with a parent */
  hasParent?: boolean
  /** Whether to match blocks with a child */
  hasChild?: boolean
  /** Whether to match blocks with tags */
  hasTags?: boolean
  /** Whether to match blocks with aliases */
  hasAliases?: boolean
  /** Whether to match blocks with a specific number of back references */
  backRefs?: {
    op?: QueryEq | QueryNotEq | QueryGt | QueryLt | QueryGe | QueryLe
    value?: number
  }
  /** Whether to match blocks with a specific creation date */
  created?: {
    op?: QueryEq | QueryNotEq | QueryGt | QueryLt | QueryGe | QueryLe
    value?: Date | QueryJournalDate
  }
  /** Whether to match blocks with a specific modification date */
  modified?: {
    op?: QueryEq | QueryNotEq | QueryGt | QueryLt | QueryGe | QueryLe
    value?: Date | QueryJournalDate
  }
}

/**
 * Query condition that matches specific blocks by their ID.
 */
export interface QueryBlockMatch2 {
  /** Kind identifier for block match queries (12) */
  kind: QueryKindBlockMatch
  /** ID of the specific block to match */
  blockId?: DbId
}

/** Constant for the self AND group type. */
export type QueryKindSelfAnd = 100

/** Constant for the self OR group type. */
export type QueryKindSelfOr = 101

/** Constant for the ancestor AND group type. */
export type QueryKindAncestorAnd = 102

/** Constant for the ancestor OR group type. */
export type QueryKindAncestorOr = 103

/** Constant for the descendant AND group type. */
export type QueryKindDescendantAnd = 104

/** Constant for the descendant OR group type. */
export type QueryKindDescendantOr = 105

/** Constant for the chain AND group type. */
export type QueryKindChainAnd = 106

// Misc
/**
 * Simple structure containing a block ID and its content.
 * Used when only ID and content are needed without full block metadata.
 */
export interface IdContent {
  /** The block ID */
  id: DbId
  /** The block's content fragments, or null if no content */
  content: ContentFragment[] | null
}

/**
 * Type representing a choice with an optional color.
 * Can be a string or an object with name and optional color.
 */
export type Choice = { n: string; c?: string } | string

/**
 * Configuration for custom queries (used in block previews primarily).
 */
export interface BlockCustomQuery {
  /** The query description */
  q: QueryDescription2
  /** Optional extra SQL to append to the query defined in `q` */
  extraSql?: string
}
