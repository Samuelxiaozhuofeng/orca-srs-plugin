# Repository Guidelines

## Project Structure & Module Organization

The plugin entry point is `src/main.ts`. Keep scheduling, storage, card collection, and other domain logic in `src/srs/`; React UI belongs in `src/components/` or `src/panels/`, reusable behavior in `src/hooks/`, and CSS in `src/styles/`. Translation resources live in `src/translations/`. Place tests beside the code they cover as `*.test.ts` or `*.test.tsx`. Orca API references are under `plugin-docs/`, feature specifications under `openspec/`, and maintained Chinese feature documentation under `模块文档/`. Treat `dist/` and `coverage/` as generated output.

## Build, Test, and Development Commands

- `npm install`: install the locked dependency set.
- `npm run dev`: start Vite in development mode.
- `npm test`: run the complete Vitest suite once.
- `npx vitest run src/srs/clozeUtils.test.ts`: run one focused test file.
- `npx vitest run --coverage`: generate V8 text, JSON, and HTML coverage reports.
- `npm run build`: type-check and create the production bundle. Its `postbuild` step copies `dist/` to a workstation-specific Orca plugin path; verify or adjust that path before relying on deployment.
- `npm run preview`: serve the built bundle for local inspection.

## Coding Style & Naming Conventions

Use TypeScript in strict mode and preserve the surrounding file's formatting; the codebase generally uses two-space indentation. Name React components and their files in PascalCase, hooks with a `use` prefix, and utilities in camelCase. Keep each file focused on one responsibility and prefer immutable transformations in core logic. There is no configured lint or formatter command, so use `npx tsc --noEmit` and the test suite as the baseline checks.

## Testing Guidelines

Vitest runs in the Node environment with global test APIs. Use `describe`/`it`, reset mocks in `beforeEach`, and mock the global Orca API explicitly when needed. Add regression tests for bug fixes and deterministic unit tests for scheduling or storage behavior. No coverage threshold is enforced; cover changed branches and failure paths.

## Commit & Pull Request Guidelines

Follow the history's conventional prefixes, such as `feat:`, `fix:`, `refactor:`, and `docs:`, followed by a concise imperative summary. Keep commits scoped. Pull requests should explain behavior changes, list verification commands, link relevant issues or OpenSpec changes, and include screenshots for UI changes. Update the matching file in `模块文档/` and its README index whenever behavior or workflows change.
