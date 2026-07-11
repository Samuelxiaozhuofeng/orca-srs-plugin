# Component Guidelines

## Runtime Model

React and Valtio are host-provided externals (`vite.config.ts`). Components use
`window.React`, `window.Valtio`, and `orca.components` rather than bundling another
runtime. See `IRWorkspaceShell.tsx`, `IncrementalReadingWorkspacePanel.tsx`, and
`SrsErrorBoundary.tsx`.

## Component Shape

- Use one exported component per file. Feature-private helper functions may remain
  local when they only support that component.
- Type props near the component with `type` or `interface`; use a named exported
  props type when another module needs it. Examples: `IRWorkspaceShellProps` and
  the private `Props` in `IRLibraryToolbar.tsx`.
- Prefer controlled leaf components. Containers own state and pass typed values and
  callbacks, as `IRWorkspaceShell` does for `IRLibraryView` and `IRReadingView`.
- Keep panel and renderer adapters thin; use `SrsErrorBoundary` around substantial
  feature trees.
- Use stable item IDs for React keys. Do not use array indexes for mutable lists.

## Interaction And Accessibility

The newer workspace UI is the reference pattern:

- Native `button`, `input`, `select`, and `label` elements carry behavior.
- Icon-only controls have `title` and `aria-label`; decorative icons use
  `aria-hidden="true"`.
- Stateful controls expose `aria-expanded`, `aria-controls`, `aria-selected`, or
  `aria-pressed` as applicable.
- Keyboard focus is visible in CSS with `:focus-visible`.
- Use `type="button"` unless a button intentionally submits a form.

Reference: `IRLibraryToolbar.tsx` and `src/styles/ir-workspace.css`.

## Styling

Use class-based CSS and Orca tokens for new or substantially changed UI. The
workspace uses BEM-like `ir-workspace__...` names and token fallbacks such as
`var(--orca-color-bg-1, #ffffff)`. Inline styles still exist in legacy components
such as `DeckCardCompact.tsx`; do not extend that pattern for feature-sized UI.

## Common Mistakes

- Importing React as a bundled runtime instead of using the host external.
- Calling storage or scheduling code directly from many leaf components. Route it
  through a container hook or SRS service.
- Adding a large second component to an existing file instead of creating a focused
  component file.
- Omitting loading, empty, or failure rendering for an async view.

