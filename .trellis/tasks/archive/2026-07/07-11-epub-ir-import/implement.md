# Implementation Plan

## Guardrails

- Work only in `orca-srs-plugin`; treat `/Users/samdagreat/Documents/vibe coding/orca-epub/` as read-only source evidence.
- Do not start by copying `src/main.ts`; migrate behavior into the boundaries in `design.md`.
- Preserve unrelated dirty changes. Do not delete or alter ordinary note content in removal flows.
- Complete each phase and its focused tests before moving to the next phase.

## Phase 1: Parser And Dependency Parity

- [x] Add locked `jszip` dependency.
- [x] Create `src/importers/epub/` parser, asset, HTML, outline, types, and importer modules.
- [x] Adapt source code to this repository's formatting, Orca types, error rules, and file responsibility limits.
- [x] Add small EPUB fixtures and deterministic parser/HTML/outline tests.
- [x] Verify `npx tsc --noEmit` and focused parser tests.

Rollback: remove the new isolated directory and dependency; no registrations or persisted data exist yet.

## Phase 2: Manifest, Dedupe And Resumable Plain Import

- [x] Implement strict `EpubBookManifestV1` parser/serializer and property constants.
- [x] Implement SHA-256 fingerprinting and exact-match book lookup.
- [x] Implement source EPUB asset upload/reload and fingerprint verification.
- [x] Implement book/chapter creation with per-chapter checkpoints and ordered references.
- [x] Implement partial state, failure list, and resume that skips imported entries.
- [x] Add Orca mock tests for no-write failures, exact dedupe, plain import shape, partial failure, resume, and no duplicate resources/references.

Rollback: unregister nothing; imported test data can remain ordinary notes. Versioned metadata does not create IR state.

## Phase 3: Import UI And Registration

- [x] Build modular React wizard screens for file, title, import chapter selection, progress, and result.
- [x] Register/unregister one command plus appropriate toolbar/slash entry using existing registries.
- [x] Result screen exposes `完成` and `继续创建渐进阅读书籍`.
- [x] Display phase-specific errors and resumable partial state.
- [x] Add view-model tests and accessibility checks for labels, keyboard, disabled and error states.

Review gate: smoke-test plain import in Orca before connecting any IR writes.

## Phase 4: Versioned Book IR Plan And Both Schedule Modes

- [x] Implement strict `BookIRPlanV1` storage and validation on the book block.
- [x] Refactor existing Book IR initialization behind `bookIRService` while preserving distributed due behavior.
- [x] Add the independent second chapter selector, defaulting to all successful imports.
- [x] Implement sequential mode with locked chapters absent from collectors and only one active chapter.
- [x] Implement mode and schedule preview in the setup UI.
- [x] Add deterministic distributed and sequential tests, including partial initialization retry.

Rollback: keep plain EPUB import available; remove/disable the “继续创建” action and IR plan registrations.

## Phase 5: Complete, Skip, Chapter Removal And Whole-Book Removal

- [x] Route Book IR completion through the progression service when a valid book plan exists.
- [x] Add explicit `跳过本章并继续`; distinguish completed/skipped outcomes.
- [x] Prove read, postpone, and priority changes never unlock the next chapter.
- [x] Implement shared chapter/book removal service with `Promise.allSettled`, retry targets, IR index cleanup, and content preservation.
- [x] Wire whole-book removal into book-page context menu and library source-book menu using one confirmation/result model.
- [x] Reuse existing library selection for specific chapters and handle sequential active removal without silent advancement.
- [x] Add service and UI-entry regression tests.

Review gate: inspect all delete/remove editor commands and prove none target book/chapter blocks or `epub.*` provenance.

## Phase 6: Integration, Documentation And Handoff

- [x] Remove superseded duplicate Book IR dialog code only after all callers use the new services.
- [x] Update `.trellis/spec/` if implementation establishes new persisted contracts or patterns.
- [x] Update `模块文档/README.md` and create/update EPUB import + Book IR documentation.
- [x] Run `npx tsc --noEmit`.
- [x] Run every focused new/changed test.
- [x] Run `npm test`.
- [x] Run `npm run build`, accounting for its workstation-specific postbuild copy.
- [x] In Orca, smoke-test: plain import, image import, exact duplicate, partial/resume, IR subset, both modes, complete/skip, chapter removal, whole-book removal, and re-add.
- [x] Compare results against the source plugin before manually retiring it.

## Final Review Checklist

- [x] No product logic accumulated in `src/main.ts`.
- [x] No arbitrary ref scanning or `batchId` book identity remains in new-book flows.
- [x] Every persisted JSON read is version-validated and fails visibly.
- [x] Every long-lived registration has an unregister path.
- [x] Ordinary notes survive all IR failure and removal paths.
- [x] Diff contains no generated `dist/` or `coverage/` output.
