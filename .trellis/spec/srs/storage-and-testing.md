# Storage And Testing

## Persistence Contract

Storage modules own property keys, serialization, defaults, cache invalidation, and
compatibility with missing or older values. Callers use typed load/save/update
functions rather than manipulating Orca properties independently.

Examples:

- `src/srs/storage.ts` for review state.
- `src/srs/incrementalReadingStorage.ts` for incremental-reading state and cache.
- `src/srs/settings/*Schema.ts` for typed settings defaults and parsing.

Preserve unrelated block properties when updating one concern. Invalidate the
module's cache after writes or external events that can make it stale.

## Tests

Use deterministic unit tests for transformations and explicit Orca mocks for I/O.
Reset mocks and module-level state in `beforeEach`. Cover:

- Missing properties and default initialization.
- Legacy or malformed persisted values.
- Cache invalidation after a write.
- Backend rejection and partial-operation failure.
- Boundary values for timestamps, priority, intervals, and empty collections.

Reference suites include `incrementalReadingStorage.test.ts`,
`irConversionBlockState.test.ts`, `reviewLogStorage.test.ts`, and
`blockCardCollector.test.ts`.

Do not change a persisted key or serialized shape without an explicit compatibility
plan and regression coverage for existing notes.

