[**Orca API Documentation**](../README.md) / Orca API Types Index

# Orca Type System Documentation (`types`)

This directory contains complete TypeScript interface definitions, type aliases, and global `orca` API specifications for building Orca plugins.

## 📚 Module Categories

| Category | File | Description |
| :--- | :--- | :--- |
| **Global API** | [**`orca-api.md`**](orca-api.md) | Main global `orca` object, LLM/AI APIs (`orca.ai`), and state management (`orca.state`). |
| **Block Models** | [**`block-types.md`**](block-types.md) | Core `Block` structure, properties (`BlockProperty`), references (`BlockRef`), and content fragments. |
| **Commands & Menu** | [**`command-types.md`**](command-types.md) | Keyboard shortcuts, editor commands, context menus, slash commands, cursor positions, and toolbar extensions. |
| **Queries & Database** | [**`query-types.md`**](query-types.md) | Advanced block queries (`QueryBlock`), journal filters (`QueryJournal`), and all AST `QueryKind` operators. |
| **UI & Layouts** | [**`ui-layout-types.md`**](ui-layout-types.md) | Panels (`ColumnPanel`, `RowPanel`, `ViewPanel`), custom components, themes, and notification toasts. |
| **Plugin Runtime** | [**`plugin-runtime-types.md`**](plugin-runtime-types.md) | Plugin lifecycle, custom renderers, content converters, window broadcasts, navigation, and backend bridges. |

***

## 🔍 Quick Reference

- **Looking for `orca.commands.register()`?** See [command-types.md](command-types.md).
- **Looking for `orca.state.locale` or `orca.ai`?** See [orca-api.md](orca-api.md).
- **Looking for `orca.editor.moveBlocks()` or `Block` properties?** See [block-types.md](block-types.md).
- **Looking for `orca.components.MenuText` or Panel layout?** See [ui-layout-types.md](ui-layout-types.md).
- **Looking for `orca.plugins.getPlugin()` or `ConvertContext`?** See [plugin-runtime-types.md](plugin-runtime-types.md).
