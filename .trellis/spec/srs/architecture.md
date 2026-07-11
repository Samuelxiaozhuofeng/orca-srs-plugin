# SRS Architecture

## Module Boundaries

- `src/srs/types.ts` defines shared review and statistics contracts.
- Pure helpers and policies live in focused camelCase modules. Incremental-reading
  logic is grouped under `src/srs/incremental-reading/`.
- Storage modules translate between typed state and Orca block properties.
- `src/srs/registry/` owns commands, renderers, converters, panels, and context-menu
  registration. Every registration family has a matching unregister path.
- `src/main.ts` sequences plugin load/unload and delegates to registries/services.

UI may call SRS services and consume SRS types. Domain modules should not import
React components except dedicated registry adapters that register those components
with Orca.

## File Responsibility

Add a new module when logic has an independent contract or can be tested separately.
Examples include `irQueuePolicy.ts`, `irConversionBlockState.ts`, and
`panelViewArgs.ts`, each with a colocated test. Avoid growing `src/main.ts`,
`storage.ts`, or another large manager with unrelated behavior.

## Lifecycle Symmetry

Anything started or registered during `load` must be stopped or unregistered during
`unload`. See the registry pairs and recent-deck/auto-mark watcher pairs in
`src/main.ts`. Long-lived listeners and caches need an explicit cleanup or
invalidation function.

