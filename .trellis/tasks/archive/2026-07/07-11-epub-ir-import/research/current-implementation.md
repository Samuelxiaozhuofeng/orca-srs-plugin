# Current Implementation Evidence

## Source EPUB Plugin

- `/Users/samdagreat/Documents/vibe coding/orca-epub/src/main.ts`: file input, title/section selection, grouped import, progress, book/section orchestration.
- `/Users/samdagreat/Documents/vibe coding/orca-epub/src/libs/epub-parser.ts`: JSZip, container.xml, OPF, EPUB 3 nav and EPUB 2 NCX.
- `/Users/samdagreat/Documents/vibe coding/orca-epub/src/libs/epub-assets.ts`: image upload and caching.
- `/Users/samdagreat/Documents/vibe coding/orca-epub/src/libs/epub-html.ts`: image URL rewriting.
- `/Users/samdagreat/Documents/vibe coding/orca-epub/src/libs/html-outline.ts` and `orca-outline-importer.ts`: heading-aware Orca outline creation.
- `/Users/samdagreat/Documents/vibe coding/orca-epub/src/libs/orca-helpers.ts`: root book/chapter pages, aliases, references, and navigation.
- `/Users/samdagreat/Documents/vibe coding/orca-epub/src/ui/import-wizard.ts`: current imperative title and chapter selectors.

The source package has about 1,600 lines in these modules, depends on `jszip`, and has no discovered automated test suite. Treat it as behavior evidence, not code that can be trusted without tests.

## Current SRS Book IR

- `src/srs/bookIRCreator.ts`: reference-based chapter discovery, distributed due dates, Topic initialization, `ir.sourceBookId`, temporary `batchId`.
- `src/components/IRBookDialogMount.tsx` and `IRBookSetupDialog.tsx`: overlapping Book IR setup UI; consolidation is needed.
- `src/srs/registry/contextMenuRegistry.tsx`: current book right-click entry.
- `src/srs/irSessionActions.ts`: `completeIRCard` removes card tag, SRS/IR properties, and IR index.
- `src/srs/incrementalReadingStorage.ts`: full IR deletion and scheduling-only deletion.
- `src/components/incremental-reading/workspace/useIRWorkspaceLibrary.ts`: multi-select removal via `Promise.allSettled`.
- `src/components/incremental-reading/workspace/IRBulkActionBar.tsx`: existing content-preserving removal confirmation and same-batch selection.

## Important Gaps

- Chapter discovery only checks the book and direct children while source references can be under a chapters heading.
- `batchId` represents one initialization operation, not stable book membership.
- There is no persisted source fingerprint, import manifest, durable resume, or sequential book plan.
- Existing bulk removal is useful but not exposed as a direct book action.
- Completing a card has no hook for sequentially activating the next book chapter.

