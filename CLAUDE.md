# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**`AGENTS.md` 是本仓库的权威 agent 契约（Non-negotiables、Orca API 政策、发布流程、提交规范），修改代码前必须遵守。本文件只做入口索引，不重复其内容。**

## 文档规则（必须遵守）

本项目在 `模块文档/` 目录下维护各功能模块的详细中文技术文档：

1. **修改前阅读文档**：修改代码前，先阅读 `模块文档/` 下的相关文档（索引见 `模块文档/README.md`）
2. **修改后更新文档**：修改代码后，同步更新对应模块文档及其在 `模块文档/README.md` 中的条目
3. **新模块需配套文档**：新增模块时在 `模块文档/` 下创建对应文档
4. **使用 Orca API 前**：先查 `plugin-docs/modules.md` 及 `plugin-docs/documents|types|constants/` 下的对应参考；本地参考与现有代码是唯一证据，不得臆造 API
5. `模块文档/问题经验.md` 记录已验证的回归问题及其测试，排查 bug 时先查它

## Commands

```bash
npm test                                # run the Vitest suite once
npx vitest run <path>                   # run a single test file
npx tsc --noEmit                        # type-check only
npm run build                           # type-check + Vite library build → dist/ (in-repo only)
npm run test:release                    # node --test suite for release scripts
ORCA_PLUGIN_ROOT=/abs/path/orca/plugins/orca-srs npm run deploy:local   # install into Orca (basename must be orca-srs)
```

- Node **20.19+** required. `npm run dev`/`preview` are optional Vite tooling; `index.html` is a static note and does **not** load the plugin — real verification happens inside Orca after build/deploy.
- Release: `release:stage` → `release:verify` → `release:zip`; verify is gated on `release-evidence/release-readiness.json` being Go.
- **After any code-changing task, run `npm run build` and report the result** (skip only for pure docs/config changes).

## Architecture (big picture)

This is an **Orca Notes plugin** (间隔重复/SRS 闪卡 + 渐进阅读), built as a single ES-module library (`src/main.ts` → `dist/index.js`). Key structural facts that span multiple files:

- **Host runtime**: React and valtio are **not bundled** — they are externals mapped to `window.React` / `window.Valtio` (see `vite.config.ts`). Use `import type` for React types; never add a runtime React import. The global `orca` API is the host surface; tests mock it explicitly.
- **Data lives in block properties**, namespaced `srs.*`, `srs.cN.*` (cloze fragments), `srs.forward|backward.*` (direction cards). Cards are Orca blocks with tags; there is no separate database. Every block-property write must invalidate the matching cache (`invalidateBlockCache` / `invalidateIrBlockCache`) before later reads.
- **Card identity** is generated and compared only via `src/srs/cardIdentity.ts` (`cardKey`) — never hand-built strings or substring matching.
- **Scheduling** uses FSRS via `ts-fsrs` (`src/srs/algorithm.ts`); settings go through the validated schema in `src/srs/settings/` (a valid weights vector has exactly 21 numbers).
- **Review sessions** are frozen descriptors written to the session block (`reviewSessionDescriptor.ts`); scope/queue decisions load from the descriptor, not global state. Dynamic requeue must respect the frozen `sessionScope` and daily limits.
- **Registration** is centralized in `src/srs/registry/` (commands, renderers, converters, UI components, context menus), wired by `src/main.ts` lifecycle; unload runs `pluginUnloadSequence.ts`, which flushes queued review logs / reading breakpoints while Orca APIs are still available — an enqueue is not a confirmed write.
- **Incremental reading (渐进阅读)** is a parallel domain: `src/srs/incremental-reading/` (state, properties, scheduling, persistence), `src/srs/book-ir/` (book plans/chapters), importers in `src/importers/epub/` and `src/importers/web/`, UI under `src/components/incremental-reading/`. IR has its own queue and does not affect SRS review scheduling.
- **UI layering**: `src/components/` (React) ← mounted through renderers/panels in `src/panels/` and `*Renderer.tsx` wrappers; reusable logic in `src/hooks/`; localization via `src/libs/l10n.ts` + `src/translations/`.
- Tests live beside their code as `*.test.ts`; `src/test/` is diagnostics/helpers, not the main suite. `dist/` and `coverage/` are generated — never hand-edit.

## Hard rules (summary — full list in AGENTS.md)

- Errors stay visible: no empty `catch`, no silent `return null/[]` on failed reads/writes.
- Bound bulk block reads/child expansion — no unbounded `Promise.all` over the repository.
- Child-card collection ignores a self back-reference (`from === to === parentBlockId`) but keeps real child refs.
- Keep the documented property namespaces/type codes exactly; do not invent aliases.
- Commits use scoped conventional prefixes (`feat:`, `fix:`, `refactor:`, `docs:`) with imperative summaries.
