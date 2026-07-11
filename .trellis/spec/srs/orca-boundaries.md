# Orca Integration Boundaries

## Host Access

The global `orca` contract is declared in `src/orca.d.ts`. Treat backend responses,
view arguments, settings, block properties, and optional host state as external
input. Validate or normalize before converting them to domain types.

Registries under `src/srs/registry/` are the canonical place for Orca registration.
Keep command callbacks thin and delegate collection, conversion, persistence, and
session logic to focused modules.

## Failure Behavior

- User-triggered failures should log diagnostic context and notify through
  `orca.notify` with a useful title.
- Optional startup work may warn and allow the plugin to continue when failure is
  explicitly non-fatal, as in settings schema and shortcut registration in
  `src/main.ts`.
- Do not silently return empty data for an unexpected backend failure. Preserve the
  distinction between "no results" and "request failed".
- Include plugin or subsystem context in logs.

## Async And Cleanup

Await writes whose ordering affects persisted state. Background startup cleanup may
be intentionally deferred, but its async body must catch and report errors. Pair
watchers, subscriptions, renderers, commands, panels, converters, and menus with
unregister/stop behavior on unload.

