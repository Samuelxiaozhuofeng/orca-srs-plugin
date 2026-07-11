# Type Safety

## Compiler Contract

TypeScript runs in strict, isolated-module, bundler mode (`tsconfig.json`). Use
`import type` for type-only dependencies and keep changes compatible with
`npx tsc --noEmit`.

## Type Placement

- Shared SRS entities live in `src/srs/types.ts`; incremental-reading contracts live
  near that feature, including `irTypes.ts` and `incrementalReadingStorage.ts`.
- Orca host contracts and `DbId` live in `src/orca.d.ts`.
- Props and view-only unions live beside their component or feature.
- Registry boundary types live in `src/srs/registry/`, as shown by
  `panelTypes.ts` and `panelViewArgs.ts`.

## Boundary Validation

External data is not trusted merely because it has a TypeScript annotation.
Normalize host view arguments, plugin settings, parsed JSON, and block properties at
their boundary. `parseIRWorkspacePanelArgs` accepts `unknown`-shaped input and
returns safe defaults; its tests cover invalid mode and empty plugin names.

Use narrow string unions for finite domain values (`Grade`, `CardType`, `IRStage`)
and explicit type guards or parsing functions before assertions. Keep assertions
close to Orca APIs whose upstream declarations are broad.

## Avoid

- Adding new `any` to application code when `unknown` plus validation is possible.
- Duplicating a shared domain type in a component.
- Casting invalid external data directly to a domain union.
- Mutating an input object to satisfy a target type.

`src/orca.d.ts` contains broad `any` declarations because it mirrors the host API;
that compatibility boundary is not a precedent for feature code.

