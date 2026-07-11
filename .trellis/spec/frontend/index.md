# Frontend Development Guidelines

These rules cover React UI, panels, hooks, and CSS under `src/components/`,
`src/panels/`, `src/hooks/`, and `src/styles/`. SRS scheduling, storage, and Orca
data access are documented separately in `../srs/`.

## Pre-Development Checklist

- Identify whether the change belongs in a component, panel adapter, hook, or SRS service.
- Read the topic-specific guide below and two nearby source examples.
- Keep Orca host integration at panel, renderer, registry, or service boundaries.
- Plan a colocated `*.test.ts` for extracted stateful or deterministic logic.

## Guidelines Index

| Guide | Use it for |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Choosing ownership and file locations |
| [Component Guidelines](./component-guidelines.md) | Components, props, composition, styling, accessibility |
| [Hook Guidelines](./hook-guidelines.md) | Effects, event listeners, timers, and reusable UI behavior |
| [State Management](./state-management.md) | Local, host, and persisted state boundaries |
| [Type Safety](./type-safety.md) | Type placement, boundary parsing, and assertions |
| [Quality Guidelines](./quality-guidelines.md) | Tests, verification, error states, and review |

## Quality Check

- `npx tsc --noEmit`
- Run focused Vitest files beside changed logic, then `npm test` for broad changes.
- Confirm listeners, timers, and subscriptions are cleaned up.
- Check loading, empty, error, disabled, keyboard, and narrow-panel states when relevant.

