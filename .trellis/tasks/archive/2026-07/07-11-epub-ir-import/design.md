# EPUB 导入与渐进阅读建书技术设计

## 1. Scope And Trigger

本设计覆盖跨层基础设施接线：新增 `jszip`、解析不可信 EPUB、上传二进制资源、写入 Orca block/property、建立版本化 manifest，并让 Book IR 的创建、顺序解锁和批量退出消费同一契约。

迁移以 `/Users/samdagreat/Documents/vibe coding/orca-epub/src/` 为行为基线，但代码按 SRS 仓库职责重新落位，禁止整目录机械复制或把编排塞入 `src/main.ts`。

## 2. Module Boundaries

```text
src/importers/epub/
├── types.ts                 parser/import/manifest contracts
├── epubParser.ts            ZIP, container.xml, OPF, nav/NCX
├── epubAssets.ts            image/source EPUB asset upload
├── epubHtml.ts              HTML parsing and asset URL rewrite
├── htmlOutline.ts           heading-aware outline conversion
├── orcaOutlineImporter.ts   HTML outline -> Orca child blocks
├── epubBookRepository.ts    book/chapter blocks + manifest persistence
└── epubImportService.ts     parse, dedupe, import, resume orchestration

src/components/epub-import/
├── EpubImportDialogMount.tsx
├── EpubImportWizard.tsx
├── EpubChapterSelector.tsx
├── EpubImportProgress.tsx
└── EpubImportResult.tsx

src/srs/book-ir/
├── bookIRPlanTypes.ts       versioned reading-plan schema
├── bookIRPlanRepository.ts  plan parse/write/validation
├── bookIRService.ts         distributed/sequential initialization
├── bookIRProgression.ts     complete/skip/unlock state machine
└── bookIRRemovalService.ts  chapter/book removal with partial results
```

Registration remains in `src/srs/registry/commands.ts`, `uiComponents.tsx`, and
`contextMenuRegistry.tsx`. Existing `src/srs/bookIRCreator.ts` becomes a thin
compatibility facade or is replaced after all callers migrate. UI calls services;
services own Orca writes; parser modules do not import React.

## 3. Signatures

```ts
type EpubImportStatus = "importing" | "partial" | "complete"
type EpubChapterImportStatus = "pending" | "imported" | "failed"
type BookIRMode = "distributed" | "sequential"
type BookIRChapterOutcome = "pending" | "active" | "completed" | "skipped" | "removed"

interface EpubChapterManifestEntry {
  key: string
  spineIndex: number
  href: string
  title: string
  blockId: DbId | null
  status: EpubChapterImportStatus
  error: string | null
}

interface EpubBookManifestV1 {
  version: 1
  fingerprint: string
  sourceFileName: string
  sourceAssetPath: string
  status: EpubImportStatus
  bookBlockId: DbId
  chapters: EpubChapterManifestEntry[]
}

interface BookIRPlanV1 {
  version: 1
  bookBlockId: DbId
  mode: BookIRMode
  priority: number
  totalDays: number
  selectedChapterIds: DbId[]
  activeChapterId: DbId | null
  outcomes: Record<string, BookIRChapterOutcome>
}

parseEpub(buffer: ArrayBuffer): Promise<ParsedEpub>
importEpub(request: ImportEpubRequest): Promise<ImportEpubResult>
resumeEpubImport(bookBlockId: DbId): Promise<ImportEpubResult>
initializeBookIR(request: InitializeBookIRRequest): Promise<BookIRMutationResult>
advanceSequentialBook(request: AdvanceSequentialBookRequest): Promise<BookIRMutationResult>
removeBookFromIR(bookBlockId: DbId): Promise<BookIRMutationResult>
removeChaptersFromIR(bookBlockId: DbId, chapterIds: DbId[]): Promise<BookIRMutationResult>
```

## 4. Persisted Contracts

### 4.1 Book Properties

| Property | Type | Contract |
| --- | --- | --- |
| `epub.fingerprint` | string | SHA-256 of original EPUB bytes; exact dedupe key |
| `epub.sourceAssetPath` | string | uploaded original EPUB asset used for durable resume |
| `epub.importStatus` | string | `importing`, `partial`, or `complete` |
| `epub.manifest` | JSON string | validated `EpubBookManifestV1` |
| `ir.bookPlan` | JSON string | validated `BookIRPlanV1`, present only while a book plan exists |

The source EPUB is uploaded before the first book block is created. Durable resume
loads it through `orca.utils.getAssetPath()` plus `fetch`; if source upload fails,
the import stops before creating note content.

Use `JSON.stringify` and a strict parser returning explicit validation errors. Never
build or patch manifest strings manually. Writes replace the full versioned document.

### 4.2 Chapter Properties

| Property | Type | Contract |
| --- | --- | --- |
| `epub.bookId` | number | owning book block ID |
| `epub.chapterKey` | string | stable key within source EPUB |
| `epub.spineIndex` | number | reading order |
| `epub.href` | string | normalized source href |

`chapterKey` derives from normalized href plus spine index, with deterministic
collision handling. `epub.*` provenance survives IR removal. Existing `ir.sourceBookId`
and `ir.sourceBookTitle` remain the runtime linkage for active IR cards.

## 5. Data Flows

### 5.1 Plain Import

1. Read bytes and compute SHA-256 before any Orca writes.
2. Query for exact `epub.fingerprint`; on hit navigate to its book and stop.
3. Parse metadata and chapter list; collect title and chapter selection.
4. Upload original EPUB as `application/epub+zip` for durable resume.
5. Create book page, initial manifest, and visible metadata/chapters heading.
6. Import selected chapters in spine order. After each chapter, persist its block ID/status and refresh the ordered reference list.
7. On full success mark `complete`; on failure mark `partial`, retain successes, and show failed/pending entries.
8. Result screen offers `完成` or `继续创建渐进阅读书籍`.

Resume reloads the stored source asset, verifies its fingerprint, reparses it, and
processes only manifest entries not marked `imported`.

### 5.2 Distributed IR

Create a plan containing the second-stage selection. Initialize every selected
chapter through the existing Topic card and `ir.*` path. Reuse
`calculateChapterDueDates`, with chapter 1 due today and remaining due dates ordered
across `totalDays`. Persist per-chapter successes; partial failure is retryable.

### 5.3 Sequential IR

Persist all selected IDs in `ir.bookPlan`, but initialize only the first pending
chapter as an active Topic. Locked chapters have EPUB provenance and plan status but
no `#card` or IR scheduling properties, so collectors cannot enqueue them.

`完成本章` and `跳过本章并继续` call one progression service:

1. Validate current active chapter against the plan.
2. Remove its card/SRS/IR scheduling state while retaining `epub.*`.
3. Record `completed` or `skipped` in the plan.
4. Find the next `pending` chapter and initialize it due today.
5. Persist the new active ID; if none remains, mark the plan with no active chapter.

Read, postpone, and priority actions never call this service.

### 5.4 Removal

Both book-page and library actions resolve the same book ID and call the same service.
The confirmation shows selected/active/locked counts and states that notes remain.

- Chapter removal clears active card/SRS/IR state when present and marks the plan entry `removed`.
- If the active sequential chapter is removed through “跳过并继续”, activate next; ordinary batch removal does not silently advance and must tell the user the sequence is paused.
- Whole-book removal processes every selected/active chapter with `Promise.allSettled`, clears the book plan only after all targets succeed, and preserves it with failure details when cleanup is partial.
- Never delete `epub.*`, book/chapter blocks, assets, references, or content.

## 6. Validation And Error Matrix

| Condition | Required result |
| --- | --- |
| ZIP/container/OPF invalid | No book created; parsing error shown |
| Source EPUB asset upload fails | No book created; durable-resume requirement preserved |
| Exact fingerprint exists | Open existing book; no writes |
| Same title, different fingerprint | Warn as suspected duplicate; do not auto-link |
| One chapter fails | Keep successes, set `partial`, persist error and offer resume |
| Resume source fingerprint mismatches | Stop; do not mutate manifest or chapters |
| IR subset is empty | Keep plain import; do not create a plan |
| Distributed chapter init partially fails | Persist successes/failures and allow retry |
| Sequential active chapter is postponed | Keep same active ID; next remains locked |
| Complete/skip succeeds but next init fails | Persist outcome plus explicit plan error; retry next activation |
| Whole-book removal partially fails | Keep plan/failure targets; report counts; retry only failures |
| Manifest/plan JSON malformed or unsupported | Fail visibly with book ID and recovery guidance; never guess |

## 7. Good, Base And Bad Cases

- **Good**: 15 chapters import, user selects 8 for sequential IR, completes 2, then removes the whole book. All 15 notes remain; no selected chapter remains in IR.
- **Base**: user imports all chapters as notes and chooses `完成`. No `#card`, `ir.*`, or book plan is written.
- **Partial**: chapter 13 fails; chapters 1-12 remain, manifest is `partial`, resume imports 13-15 without duplicates.
- **Bad input**: file shares title/author with an existing book but has a different fingerprint. It is never silently opened as the same book.
- **Forbidden**: discover book membership from `batchId`, infer new-book chapters by recursively scanning arbitrary refs, or delete note blocks during IR removal.

## 8. Tests Required

- Parser fixtures for EPUB 2 NCX, EPUB 3 nav, missing metadata, invalid container/OPF, duplicate/fragment hrefs, images, and headings.
- Manifest parser/serializer tests, fingerprint dedupe, source-asset resume, per-chapter checkpointing, and mismatch refusal.
- Plain import Orca mock tests proving block shape/order and absence of SRS/IR writes.
- Distributed scheduling tests with deterministic time/random injection.
- Sequential state-machine tests for complete, skip, postpone/no-unlock, last chapter, failed next activation, and removed pending chapter.
- Book/chapter removal tests for content preservation, index cleanup, partial failure, retry, and both UI entry points calling the same service.
- UI tests for independent chapter selections, mode preview, progress, partial result, and confirmations where the existing test environment supports React rendering; otherwise extract and unit-test view models.

## 9. Compatibility, Rollout And Rollback

- No legacy book migration. New metadata is required for the new book actions.
- Keep source `orca-epub` repository unchanged as a reference during implementation.
- Land in stages with the new command disabled or unregistered until parser and plain-import parity pass.
- Do not remove the old plugin installation until an actual Orca smoke test confirms text, headings, images, resume, both schedule modes, and removal.
- Rollback is removing the new registrations/dependency while leaving imported ordinary notes intact; versioned manifests remain harmless data.

