# Hook Guidelines

## Local Pattern

Custom hooks isolate lifecycle-heavy behavior from rendering. Representative files:

- `useIRShortcuts.ts`: document listeners, enabled gates, and current callbacks.
- `useIRSessionTimer.ts`: timers, visibility changes, and deterministic helpers.
- `useIRWorkspaceLibrary.ts`: async loading and library interaction state.

Obtain hooks from `window.React`, matching the host-provided React runtime.

## Effects And Cleanup

- Every listener, interval, timeout, or subscription installed by an effect must be
  removed in its cleanup function.
- Gate effects with an explicit `enabled` or readiness condition when the behavior
  should be inactive.
- Keep the latest callback in a ref when re-registering a global listener on each
  render would be incorrect or wasteful. `useIRShortcuts` is the reference.
- Include every value read by an effect or callback in its dependency list unless a
  ref deliberately carries the latest value.
- Use `void` at UI call sites when intentionally launching an async callback whose
  error handling lives inside that callback.

## Extract Deterministic Logic

Move keyboard eligibility, time calculations, and state transitions into pure
helpers when they can be tested without React. Examples:

- `irShortcutRules.ts`
- `irSessionTimerUtils.ts`
- `irSessionActionsLogic.ts` under the SRS layer

Test those helpers directly and test hook lifecycle only where cleanup or timing is
the behavior under test (`useIRSessionTimer.test.ts`, `useIRShortcuts.test.ts`).

## Async Data

There is no React Query/SWR cache. Hooks call typed SRS services, track loading and
error state locally, and expose retryable actions to the view. Do not create a
second cache in a hook when the SRS storage module already owns caching.

