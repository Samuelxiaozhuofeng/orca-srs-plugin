# Domain Logic

## Deterministic Functions

Scheduling, filtering, queue policy, and state transitions should be pure whenever
possible. Return new values instead of mutating input cards or state. Representative
modules include:

- `incremental-reading/irQueuePolicy.ts`
- `incremental-reading/irSessionProgress.ts`
- `incrementalReadingScheduler.ts`
- `sessionProgressTracker.ts`

Accept volatile inputs such as `Date` or timestamps as parameters with a convenient
default when tests need control. `getIRDateGroup(card, now)` and related statistics
functions demonstrate this pattern.

## Domain Values

Use explicit unions and named constants for grades, card types, stages, priorities,
and storage keys. Normalize numbers at the boundary before calculations; priority
helpers clamp values rather than allowing invalid values to spread.

State-transition helpers must define behavior for missing, legacy, and terminal
states. Keep a transition's invariants in one module instead of duplicating them in
components and storage callers.

## Side Effects

Keep notifications, Orca writes, logging, and navigation outside pure calculations.
A service may orchestrate those effects, but the underlying calculation should
remain directly testable. Never hide an Orca write inside a formatting or predicate
helper.

