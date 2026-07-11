# Frontend Directory Structure

## Ownership Boundaries

```text
src/
├── components/                  reusable renderers and feature UI
│   ├── incremental-reading/     incremental-reading session UI
│   │   └── workspace/           library/reading workspace feature
│   └── charts/                  chart components and barrel exports
├── panels/                      thin Orca custom-panel adapters
├── hooks/                       reusable React lifecycle and interaction behavior
├── styles/                      plugin CSS loaded by `src/main.ts`
├── translations/               locale resources
└── srs/                        domain logic and Orca persistence/integration
```

`src/panels/IncrementalReadingWorkspacePanel.tsx` is the preferred panel shape:
it parses host arguments, obtains host state, wraps the feature in
`SrsErrorBoundary`, and delegates the actual UI to `IRWorkspaceShell`.

## Placement Rules

- Put reusable feature views in `src/components/<feature>/`.
- Put a feature's private components, hooks, and pure view helpers together in its
  feature folder. `components/incremental-reading/workspace/` is the main example.
- Put behavior shared by multiple features in `src/hooks/`; keep pure helpers next
  to the hook, as in `irShortcutRules.ts` and `irSessionTimerUtils.ts`.
- Keep Orca panel entry components in `src/panels/` and registration in
  `src/srs/registry/`.
- Put scheduling, card collection, storage, and conversions in `src/srs/`, even
  when a component is their caller.
- Put global plugin CSS in `src/styles/` and import it once from `src/main.ts`.

## Naming

- React components and component files use PascalCase.
- Hooks start with `use`; utilities, services, and registries use camelCase.
- Tests are colocated as `*.test.ts` or `*.test.tsx`.
- Feature CSS uses a stable prefix. The current incremental-reading workspace uses
  `ir-`; shared review UI uses `srs-`.

Avoid adding feature implementation to `src/main.ts`. It is already the lifecycle
and registration entry point; new behavior belongs behind a registry, service,
component, or hook.

