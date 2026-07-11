# Frontend Quality Guidelines

## Required Checks

- Type-check with `npx tsc --noEmit`.
- Run the focused colocated Vitest file for changed helpers or hooks.
- Run `npm test` when shared behavior, registries, scheduling, or storage changes.
- Build with `npm run build` only after noting that `postbuild` copies `dist/` to a
  workstation-specific Orca plugin path.

There is no configured lint or formatter command. Preserve the surrounding file's
two-space indentation and quote/semicolon style instead of applying repository-wide
formatting.

## Test Shape

Vitest uses the Node environment and global APIs. Tests use `describe`/`it`, reset
mocks in `beforeEach`, and explicitly mock `globalThis.orca` when host behavior is
needed. Prefer deterministic tests for extracted functions; examples include
`irQueuePolicy.test.ts`, `panelViewArgs.test.ts`, and `useIRShortcuts.test.ts`.

Bug fixes need a regression test that fails for the original condition. Cover
invalid boundary input and failure paths, not only the successful case.

## UI Review

- Check loading, empty, error, retry, disabled, and destructive-action states.
- Check keyboard access, accessible names, focus visibility, and stateful ARIA.
- Check narrow Orca panels as well as wide layouts; stable flex/grid constraints
  should prevent controls and text from overlapping.
- Use `SrsErrorBoundary` around substantial renderer or panel subtrees, while still
  handling expected service errors in normal UI state.

## Avoid

- Silent catch blocks. If fallback is intentional, keep it narrow and make the user
  or console outcome explicit, as panel plugin-name fallback does.
- Weakening assertions to make tests pass.
- Testing generated `dist/` output or committing `coverage/`.
- Expanding legacy inline-style or `any` patterns when touching modern workspace UI.

