# SRS Domain Guidelines

These rules cover scheduling, storage, collection, conversion, settings, and Orca
integration under `src/srs/`.

## Pre-Development Checklist

- Identify whether the change is pure domain logic, persistence, or host integration.
- Read the relevant guide and adjacent tests before editing.
- Preserve persisted property compatibility and explicit defaults.
- Inject time or other volatile inputs into deterministic logic when practical.

## Guidelines Index

| Guide | Use it for |
| --- | --- |
| [Architecture](./architecture.md) | Module boundaries and dependency direction |
| [Domain Logic](./domain-logic.md) | Immutable calculations, scheduling, and transitions |
| [Orca Boundaries](./orca-boundaries.md) | Host APIs, registration, errors, and lifecycle |
| [Storage And Testing](./storage-and-testing.md) | Persistence contracts, caches, and regression tests |

## Quality Check

- Run the closest `src/srs/**/*.test.ts` files.
- Run `npx tsc --noEmit`; run `npm test` for shared or persistence changes.
- Verify old/missing persisted values, invalid inputs, and error paths.

