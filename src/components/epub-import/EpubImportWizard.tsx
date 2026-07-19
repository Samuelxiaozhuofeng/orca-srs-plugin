/**
 * Multi-step EPUB import wizard: file → title → chapters → progress → result → optional IR setup.
 */

import type { DbId } from "../../orca.d.ts"
import type {
  EpubChapter,
  ImportEpubProgress,
  ImportEpubResult,
  ParsedEpub
} from "../../importers/epub/types"
import { parseEpub, importEpub, resumeEpubImport } from "../../importers/epub/epubImportService"
import { assertFileSizeBeforeRead } from "../../importers/epub/epubLimits"
import { initializeBookIR, retryFailedBookIRInit } from "../../srs/book-ir/bookIRService"
import type { BookIRPlanV1 } from "../../importers/epub/types"
import {
  accessibilityLabels,
  canProceedFromChapters,
  canProceedFromTitle,
  defaultBookTitle,
  selectAllChapterKeys,
  type WizardStep
} from "./epubImportViewModel"
import EpubChapterSelector from "./EpubChapterSelector"
import EpubImportProgress from "./EpubImportProgress"
import EpubImportResultView from "./EpubImportResult"
import EpubIRSetupStep from "./EpubIRSetupStep"
import { DEFAULT_IR_PRIORITY } from "../../srs/incremental-reading/irImportance"

const { useState, useCallback, useMemo, useRef, useEffect } = window.React
const { Button } = orca.components

export type EpubImportWizardProps = {
  pluginName: string
  onClose: () => void
  /** Report busy state so host ModalOverlay can block Escape/mask close. */
  onWorkingChange?: (working: boolean) => void
}

export default function EpubImportWizard({
  pluginName,
  onClose,
  onWorkingChange
}: EpubImportWizardProps) {
  const labels = accessibilityLabels()
  const [step, setStep] = useState<WizardStep>("file")
  const [fileName, setFileName] = useState("")
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [parsed, setParsed] = useState<ParsedEpub | null>(null)
  const [bookTitle, setBookTitle] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [progress, setProgress] = useState<ImportEpubProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportEpubResult | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  /** Parse-only cancel (pure epubParser); not wired to Orca write paths (evidence-gated). */
  const parseAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    onWorkingChange?.(isWorking)
  }, [isWorking, onWorkingChange])

  useEffect(() => {
    return () => {
      parseAbortRef.current?.abort()
      parseAbortRef.current = null
    }
  }, [])

  // IR setup state (independent second selection)
  const [irSelectedIds, setIrSelectedIds] = useState<DbId[]>([])
  const [irMode, setIrMode] = useState<"distributed" | "sequential">("distributed")
  const [irPriority, setIrPriority] = useState(DEFAULT_IR_PRIORITY)
  const [irTotalDays, setIrTotalDays] = useState(30)
  const [irPlan, setIrPlan] = useState<BookIRPlanV1 | null>(null)
  const [irFailedCount, setIrFailedCount] = useState(0)
  const [irSuccessCount, setIrSuccessCount] = useState(0)

  const chapters: EpubChapter[] = parsed?.chapters ?? []

  const importedChapterOptions = useMemo(() => {
    if (!result) return []
    return result.manifest.chapters
      .filter((c: { status: string; blockId: DbId | null }) =>
        c.status === "imported" && typeof c.blockId === "number"
      )
      .map((c: { blockId: DbId | null; title: string; spineIndex: number }) => ({
        key: String(c.blockId),
        title: c.title,
        spineIndex: c.spineIndex
      }))
  }, [result])

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    setError(null)
    parseAbortRef.current?.abort()
    const controller = new AbortController()
    parseAbortRef.current = controller
    setIsWorking(true)
    try {
      assertFileSizeBeforeRead(file)
      const ab = await file.arrayBuffer()
      if (controller.signal.aborted) return
      // Pure parse layer supports AbortSignal; import/write path does not yet (evidence-gated).
      const p = await parseEpub(ab, { signal: controller.signal })
      if (controller.signal.aborted) return
      setBuffer(ab)
      setParsed(p)
      setFileName(file.name)
      setBookTitle(defaultBookTitle(p.metadata.title, file.name))
      setSelectedKeys(selectAllChapterKeys(p.chapters))
      setStep("title")
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      setStep("file")
    } finally {
      if (parseAbortRef.current === controller) parseAbortRef.current = null
      setIsWorking(false)
    }
  }, [])

  const runImport = useCallback(async () => {
    if (!buffer || !parsed) return
    if (!canProceedFromTitle(bookTitle) || !canProceedFromChapters(selectedKeys)) {
      setError("请填写书名并至少选择一章")
      return
    }
    // UI busy gate only — do not claim Orca write cancel (WP-08 evidence-gated).
    setIsWorking(true)
    setError(null)
    setStep("progress")
    try {
      const res = await importEpub({
        buffer,
        sourceFileName: fileName,
        bookTitle: bookTitle.trim(),
        selectedChapterKeys: selectedKeys,
        pluginName,
        onProgress: setProgress
      })
      setResult(res)
      setStep("result")
      if (res.suspectedDuplicates?.length) {
        orca.notify(
          "warn",
          `检测到同名但不同文件的书籍，不会自动合并`,
          { title: "EPUB 导入" }
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep("chapters")
    } finally {
      setIsWorking(false)
    }
  }, [buffer, parsed, bookTitle, selectedKeys, fileName, pluginName])

  const handleResume = useCallback(async () => {
    if (!result) return
    // Resume write path has no AbortSignal yet (evidence-gated); busy UI only.
    setIsWorking(true)
    setError(null)
    setStep("progress")
    try {
      const res = await resumeEpubImport(result.bookBlockId)
      setResult(res)
      setStep("result")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep("result")
    } finally {
      setIsWorking(false)
    }
  }, [result])

  const handleClose = useCallback(() => {
    if (isWorking) {
      // Can cancel in-flight pure parse; cannot cancel mid-import Orca writes yet.
      parseAbortRef.current?.abort()
      parseAbortRef.current = null
      return
    }
    onClose()
  }, [isWorking, onClose])

  const openIRSetup = useCallback(() => {
    if (!result) return
    const ids = result.importedChapterIds
    setIrSelectedIds([...ids])
    setIrTotalDays(Math.max(ids.length * 2, 7))
    setIrPlan(null)
    setIrFailedCount(0)
    setIrSuccessCount(0)
    setStep("ir_setup")
  }, [result])

  const runIRInit = useCallback(async () => {
    if (!result || irSelectedIds.length === 0) {
      setError("请至少选择一章进入渐进阅读")
      return
    }
    setIsWorking(true)
    setError(null)
    try {
      const res = await initializeBookIR({
        bookBlockId: result.bookBlockId,
        bookTitle: bookTitle || result.bookTitle,
        chapterIds: irSelectedIds,
        mode: irMode,
        priority: irPriority,
        totalDays: irTotalDays,
        pluginName
      })
      setIrPlan(res.plan)
      setIrSuccessCount(res.success.length)
      setIrFailedCount(res.failed.length)
      if (res.failed.length === 0) {
        orca.notify("success", res.message || "已创建渐进阅读计划", { title: "渐进阅读" })
        onClose()
      } else {
        orca.notify(
          "warn",
          `成功 ${res.success.length}，失败 ${res.failed.length}。可重试失败项（成功章节已保留）`,
          { title: "渐进阅读" }
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsWorking(false)
    }
  }, [result, irSelectedIds, bookTitle, irMode, irPriority, irTotalDays, pluginName, onClose])

  const retryIRInit = useCallback(async () => {
    if (!result || !irPlan) return
    setIsWorking(true)
    setError(null)
    try {
      const res = await retryFailedBookIRInit(
        result.bookBlockId,
        bookTitle || result.bookTitle,
        irPlan,
        pluginName
      )
      setIrPlan(res.plan)
      setIrSuccessCount((n: number) => n + res.success.length)
      setIrFailedCount(res.failed.length)
      if (res.failed.length === 0) {
        orca.notify("success", res.message || "重试完成", { title: "渐进阅读" })
        onClose()
      } else {
        orca.notify("warn", res.message || `仍有 ${res.failed.length} 章失败`, {
          title: "渐进阅读"
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsWorking(false)
    }
  }, [result, irPlan, bookTitle, pluginName, onClose])

  const shellStyle: React.CSSProperties = {
    width: "min(640px, calc(100vw - 32px))",
    maxHeight: "min(86vh, 800px)",
    overflowY: "auto",
    backgroundColor: "var(--orca-color-bg-1, #fff)",
    border: "1px solid var(--orca-color-border-1, #ddd)",
    borderRadius: 12,
    padding: 20,
    color: "var(--orca-color-text-1, #222)",
    display: "flex",
    flexDirection: "column",
    gap: 16
  }

  return (
    <div style={shellStyle} role="dialog" aria-modal="true" aria-label="导入 EPUB">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>导入 EPUB</h2>
          <div style={{ fontSize: 12, color: "var(--orca-color-text-2)", marginTop: 4 }}>
            普通笔记导入独立完成；可选继续创建渐进阅读
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            if (!isWorking) handleClose()
          }}
          aria-label={labels.cancel}
          aria-disabled={isWorking}
          style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        >
          关闭
        </Button>
      </div>

      {error ? (
        <div role="alert" style={{ color: "var(--orca-color-danger-6, #c00)", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      {step === "file" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13 }}>
            {labels.fileInput}
            <input
              type="file"
              accept=".epub,application/epub+zip"
              aria-label={labels.fileInput}
              disabled={isWorking}
              style={{ display: "block", marginTop: 8 }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                void handleFile(e.target.files?.[0] ?? null)
              }}
            />
          </label>
        </div>
      ) : null}

      {step === "title" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            {labels.titleInput}
            <input
              type="text"
              value={bookTitle}
              aria-label={labels.titleInput}
              disabled={isWorking}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBookTitle(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--orca-color-border-1)"
              }}
            />
          </label>
          {parsed ? (
            <div style={{ fontSize: 12, color: "var(--orca-color-text-2)" }}>
              作者：{parsed.metadata.author} · 章节 {parsed.chapters.length}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              variant="outline"
              onClick={isWorking ? undefined : () => setStep("file")}
              aria-disabled={isWorking}
              style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              上一步
            </Button>
            <Button
              variant="solid"
              aria-disabled={!canProceedFromTitle(bookTitle) || isWorking}
              style={
                !canProceedFromTitle(bookTitle) || isWorking
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
              onClick={() => {
                if (!canProceedFromTitle(bookTitle) || isWorking) return
                setStep("chapters")
              }}
            >
              下一步
            </Button>
          </div>
        </div>
      ) : null}

      {step === "chapters" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <EpubChapterSelector
            chapters={chapters}
            selectedKeys={selectedKeys}
            onChange={setSelectedKeys}
            disabled={isWorking}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              variant="outline"
              onClick={isWorking ? undefined : () => setStep("title")}
              aria-disabled={isWorking}
              style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              上一步
            </Button>
            <Button
              variant="solid"
              onClick={() => {
                if (!canProceedFromChapters(selectedKeys) || isWorking) return
                void runImport()
              }}
              aria-label={labels.startImport}
              aria-disabled={!canProceedFromChapters(selectedKeys) || isWorking}
              style={
                !canProceedFromChapters(selectedKeys) || isWorking
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
            >
              {labels.startImport}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "progress" ? <EpubImportProgress progress={progress} error={error} /> : null}

      {step === "result" && result ? (
        <EpubImportResultView
          result={result}
          isWorking={isWorking}
          onDone={onClose}
          onContinueIR={openIRSetup}
          onResume={() => void handleResume()}
        />
      ) : null}

      {step === "ir_setup" && result ? (
        <EpubIRSetupStep
          chapterOptions={importedChapterOptions}
          selectedChapterIds={irSelectedIds}
          onSelectedChapterIdsChange={setIrSelectedIds}
          mode={irMode}
          onModeChange={setIrMode}
          priority={irPriority}
          onPriorityChange={setIrPriority}
          totalDays={irTotalDays}
          onTotalDaysChange={setIrTotalDays}
          isWorking={isWorking}
          failedCount={irFailedCount}
          successCount={irSuccessCount}
          onBack={() => setStep("result")}
          onConfirm={() => void runIRInit()}
          onRetry={() => void retryIRInit()}
          onDeferFailures={onClose}
        />
      ) : null}
    </div>
  )
}
