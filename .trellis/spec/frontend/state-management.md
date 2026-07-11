# State Management

## State Categories

| State | Owner | Examples |
| --- | --- | --- |
| Ephemeral view state | Component or feature hook | workspace mode, drawer, filters, selection |
| Host application state | `orca.state`, observed with `window.Valtio.useSnapshot` when rendering | panels and active views in `IncrementalReadingWorkspacePanel.tsx` |
| Domain/session state | `src/srs/` service or state-transition module | review progress, IR queue, scheduling |
| Persisted card state | Orca block properties through storage modules | `storage.ts`, `incrementalReadingStorage.ts` |

## Update Pattern

- Keep ephemeral state local with `useState`, `useRef`, `useMemo`, and `useCallback`.
- Use immutable updater functions for arrays, records, and sets. `IRWorkspaceShell`
  copies filters with `{ ...prev, ...patch }` and creates a new `Set` before edits.
- Derive display data with pure functions or `useMemo`; do not mirror a value in a
  second state variable unless it has an independent lifecycle.
- Subscribe to `orca.state` through Valtio only in rendering boundaries that need
  reactive updates. Plain services may read `orca.state` directly at operation time.
- Persist through the owning SRS storage module rather than calling Orca block APIs
  from arbitrary leaf components.

## Async State

Expose loading, error, data, and retry behavior together from feature hooks. Clear
or replace stale selection when its underlying collection changes. Guard async
responses against unmounted or superseded work when a request can outlive the view.

Avoid introducing a new global store for state that belongs to one panel or one
review session. The existing architecture favors local React state plus explicit
domain services.

