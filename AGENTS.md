# Agent Contract

This file is the canonical coding contract for agents working in this repository. Keep it concise; use the linked module documents for detailed behavior. Preserve unrelated user changes in the worktree.

## Non-negotiables

- Read the relevant file in `模块文档/` before changing a feature, and read `plugin-docs/modules.md` plus the relevant Orca reference before using an Orca API. The current code and local references are the evidence; do not invent APIs or paths.
- When a change touches Orca blocks, properties, tags, refs, caches, indexes, editor commands, UI/database consistency, or host DOM/layout/scroll/focus/panel lifecycle, obtain real runtime evidence before editing code. Follow **Console Debugging** below.
- Every block-property write must invalidate the matching cache (`invalidateBlockCache`; IR writes use `invalidateIrBlockCache`) before later reads rely on the value.
- Generate and compare `cardKey` only through `src/srs/cardIdentity.ts`; never hand-build identity strings or match identities with substring checks.
- Review sessions load their frozen descriptor. Do not revive the deprecated global scope/last-session pattern; dynamic requeue must respect the frozen `sessionScope` and daily limits.
- Orca UI runtime React comes from `window.React` (and `window.ReactDOM` where required). Use `import type` for types; do not add a second runtime React import.
- Review logs and reading breakpoints have explicit enqueue/flush semantics. A successful enqueue is not a confirmed write; unload flushes while Orca data APIs are still available, and failures stay visible.
- Keep property namespaces and type codes exactly as documented: `srs.*`, `srs.cN.*`, and `srs.forward|backward.*`. Do not invent aliases or new codes casually.
- FSRS settings must go through the validated algorithm/settings path; a valid weights vector has exactly 21 numbers.
- Bound bulk block reads and child expansion. Do not issue an unbounded `Promise.all` over a repository; respect existing concurrency, depth, and count caps.
- Child-card collection must ignore a legal self back-reference (`from === to === parentBlockId`) while preserving real child refs.
- Errors must remain visible. Do not use empty `catch`, silent fallbacks, or `return null/[]` to hide a failed read/write. Report the error and preserve retryable state where the module requires it.

## Console Debugging

For Orca-dependent bugs and behavior changes that can be inspected in the user's running instance:

1. Before editing, provide the smallest useful read-only Console script by default. First identify the real runtime target and source—such as the current repo/panel, blockId, scroll owner, DOM node, cache, or backend value. Do not assume that the first matching selector or apparent container is the real owner.
2. For state/data issues, compare the relevant `orca.state` value with an independent `orca.invokeBackend` read. Consult `plugin-docs/` for the exact backend message and arguments. Use top-level `await`, return compact copyable JSON, and include `orca.state.repo`.
3. Do not provide a mutating Console script until its impact is stated and the user agrees. `insertTag`, `removeTag`, `setProperties`, and similar command success responses are not final evidence; re-read the backend and report the post-write state.
4. Until runtime evidence is returned, describe explanations only as **candidate causes**. After the fix, distinguish **automated tests passed** from **Orca instance verification passed**, and convert the observed runtime shape into a regression test when practical.

## Layout

- `src/main.ts`: plugin lifecycle, public commands, and entry wiring.
- `src/srs/`: scheduling, storage, card identity/collection, review sessions, settings, statistics, registries, AI, and incremental-reading domains.
- `src/srs/incremental-reading/`: IR state, properties, indexes, scheduling, and persistence.
- `src/srs/book-ir/`: Book IR plans, chapter initialization, and progression.
- `src/importers/epub/` and `src/importers/web/`: source parsing and import services.
- `src/components/`: React UI; `src/panels/`: host panel adapters; `src/hooks/`: reusable hooks; `src/styles/`: CSS; `src/translations/`: locale resources.
- `src/libs/`: local integration helpers; `src/orca.d.ts`: project-facing Orca type declarations; `src/test/`: diagnostics/helpers, not the main Vitest suite.
- Tests live beside their code as `*.test.ts` (use `*.test.tsx` only for JSX tests). `dist/` and `coverage/` are generated output and must not be edited by hand.
- `plugin-docs/` is the Orca API reference. `模块文档/README.md` is the module-document index; `模块文档/问题经验.md` records verified regressions and their tests.

## Orca API Policy

When a task requires Orca APIs, types, commands, editor behavior, backend calls, custom renderers, constants, or lifecycle details, start at `plugin-docs/modules.md` and open the relevant document under `plugin-docs/documents/`, `plugin-docs/types/`, or `plugin-docs/constants/`. Treat the local references and existing code as authoritative for available interfaces. If documentation and runtime disagree, record the discrepancy and use runtime evidence rather than silently assuming either one is correct.

## Documentation Workflow

- `CLAUDE.md` is a short Chinese document gate; it should point here rather than mirror this file.
- Before a behavior change, read the matching module document. After a behavior or workflow change, update that document and its entry in `模块文档/README.md`; new modules need a new indexed document.
- Write implementation documents against current code. Mark plans as planned/landed, keep paths real and repository-relative, and mark duplicate or historical documents as such.
- For a bug learned from real data, record the symptom, confirmed cause, changed path, and regression test in `模块文档/问题经验.md` when useful.

## Build, Test, and Verify

- `npm install`: install the locked dependency set.
- `npm test`: run the Vitest suite once.
- `npx vitest run <path>`: run a focused test file.
- `npx tsc --noEmit`: type-check without producing a bundle.
- `npm run build`: type-check and build **in-repo only** (`dist/`). Local install: `ORCA_PLUGIN_ROOT=/abs/path/to/orca/plugins/orca-srs npm run deploy:local` (basename must be `orca-srs`). Release layout: `release:stage` / `release:verify` / `release:zip`. Default verify requires `release-evidence/release-readiness.json` Go (`go` + `orcaRuntimeVerified` + empty `blockers`); CI structure checks may use `--allow-incomplete-readiness` only. Version confirmation is not Go; formal zip is readiness-gated.
- `npm run dev` / `npm run preview`: optional Vite tooling; `index.html` is a **static note only** (does not load plugin entry). Real development loads the plugin inside Orca after build/deploy.

Run the narrowest relevant tests first, then the broader checks appropriate to the change. Do not claim a fix without an actual check; report blocked commands and their errors plainly. Separate automated verification from manual Orca verification in the final report.

## Style and Tests

Use strict TypeScript, two-space indentation, and the surrounding file's formatting. Name React components/files in PascalCase, hooks with a `use` prefix, and utilities in camelCase. Keep modules focused and prefer immutable transformations in core logic. Mock the global `orca` API explicitly in tests and add deterministic regression coverage for changed scheduling, storage, identity, or failure paths.

## Commits and Handoff

Use scoped conventional prefixes such as `feat:`, `fix:`, `refactor:`, and `docs:` with an imperative summary. Keep commits focused. A handoff should name changed files, verification commands and results, any required Console result, and remaining risks; never imply that an unverified Orca runtime state is confirmed.

## See Also

- `CLAUDE.md` — short Chinese document gate.
- `模块文档/README.md` — module index and document status.
- `模块文档/仓库贡献指南.md` — human-facing contribution workflow.
- `模块文档/问题经验.md` — verified repository-specific failure patterns.
- `plugin-docs/modules.md` — Orca API reference index.
