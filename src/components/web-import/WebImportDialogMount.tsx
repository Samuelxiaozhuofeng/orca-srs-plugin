/**
 * Headbar-mounted web article import dialog (Firecrawl MVP).
 * Step 1: URL → scrape preview (no Orca write).
 * Step 2: Import options → create page + optional IR.
 */

import type { ScrapedArticle } from "../../importers/web/webImport"
import {
  importScrapedArticle,
  scrapeWebArticle,
  WebImportError
} from "../../importers/web/webImport"
import { createRequestTokenGuard } from "../../srs/ai/aiRequestToken"

const { useState, useCallback, useRef, useEffect } = window.React
// Mount open-state uses Valtio from host window (same pattern as IRBookDialogMount)
const { Valtio } = window as typeof window & {
  Valtio: { proxy: <T extends object>(o: T) => T; useSnapshot: (o: object) => any }
}
const { useSnapshot } = Valtio

type WebImportDialogState = {
  isOpen: boolean
  pluginName: string
}

const webImportDialogState = Valtio.proxy({
  isOpen: false,
  pluginName: "orca-srs"
} as WebImportDialogState)

export function showWebImportDialog(pluginName: string): void {
  webImportDialogState.pluginName = pluginName || "orca-srs"
  webImportDialogState.isOpen = true
}

function closeWebImportDialog(): void {
  webImportDialogState.isOpen = false
}

interface WebImportDialogMountProps {
  pluginName: string
}

export function WebImportDialogMount({ pluginName }: WebImportDialogMountProps) {
  const snap = useSnapshot(webImportDialogState)
  const { ModalOverlay } = orca.components
  const [isWorking, setIsWorking] = useState(false)

  const handleClose = useCallback(() => {
    if (isWorking) return
    closeWebImportDialog()
  }, [isWorking])

  if (!snap.isOpen) return null

  return (
    <ModalOverlay
      visible={snap.isOpen}
      canClose={!isWorking}
      onClose={handleClose}
    >
      <WebImportDialog
        pluginName={snap.pluginName || pluginName}
        onClose={closeWebImportDialog}
        onWorkingChange={setIsWorking}
      />
    </ModalOverlay>
  )
}

// ---------------------------------------------------------------------------
// Dialog UI
// ---------------------------------------------------------------------------

type DialogStep = "url" | "preview"

export type WebImportDialogProps = {
  pluginName: string
  onClose: () => void
  onWorkingChange?: (working: boolean) => void
}

export default function WebImportDialog({
  pluginName,
  onClose,
  onWorkingChange
}: WebImportDialogProps) {
  const { Button } = orca.components
  const [step, setStep] = useState<DialogStep>("url")
  const [url, setUrl] = useState("")
  const [article, setArticle] = useState<ScrapedArticle | null>(null)
  const [joinIR, setJoinIR] = useState(true)
  const [scheduleToday, setScheduleToday] = useState(false)
  /** Optional AI summary via default model in AI / Firecrawl 服务设置 */
  const [enableAiSummary, setEnableAiSummary] = useState(false)
  const [aiSummarySkipped, setAiSummarySkipped] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const tokenGuardRef = useRef(createRequestTokenGuard())
  const importCancelledRef = useRef(false)

  useEffect(() => {
    onWorkingChange?.(isWorking)
  }, [isWorking, onWorkingChange])

  // Abort in-flight scrape when dialog unmounts / closes
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      tokenGuardRef.current.invalidate()
      importCancelledRef.current = true
    }
  }, [])

  const finishAndClose = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    tokenGuardRef.current.invalidate()
    importCancelledRef.current = true
    setIsWorking(false)
    onClose()
  }, [onClose])

  const handleClose = useCallback(() => {
    // Busy: block mask/Escape; do not finish-and-close (import write cancel is evidence-gated).
    if (isWorking) return
    finishAndClose()
  }, [isWorking, finishAndClose])

  const handleScrape = useCallback(async () => {
    if (isWorking) return
    setError(null)
    setIsWorking(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const token = tokenGuardRef.current.next()
    try {
      const scraped = await scrapeWebArticle({
        url,
        pluginName,
        signal: controller.signal
      })
      if (!tokenGuardRef.current.isCurrent(token) || controller.signal.aborted) return
      setArticle(scraped)
      setStep("preview")
    } catch (e) {
      if (!tokenGuardRef.current.isCurrent(token) || controller.signal.aborted) return
      setError(formatError(e))
    } finally {
      if (tokenGuardRef.current.isCurrent(token)) {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setIsWorking(false)
      }
    }
  }, [url, pluginName, isWorking])

  const handleImport = useCallback(async () => {
    if (isWorking || !article) return
    setError(null)
    setAiSummarySkipped(false)
    setIsWorking(true)
    importCancelledRef.current = false
    const token = tokenGuardRef.current.next()
    // Allow aborting the AI request if the dialog unmounts (page write is still fail-soft).
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await importScrapedArticle({
        article,
        pluginName,
        joinIncrementalReading: joinIR,
        scheduleToday: joinIR && scheduleToday,
        enableAiSummary,
        signal: controller.signal
      })

      // Do not update UI / notify after cancel or a newer operation started.
      if (!tokenGuardRef.current.isCurrent(token) || importCancelledRef.current) {
        return
      }

      if (result.kind === "already_exists") {
        orca.notify(
          "info",
          `该网址已导入过，已打开已有页面（块 #${result.pageBlockId}）`,
          { title: "网页导入" }
        )
      } else {
        const irPart = result.joinedIR
          ? result.scheduledToday
            ? "，已加入渐进阅读并安排今天阅读"
            : "，已加入渐进阅读"
          : ""
        const aiPart =
          result.aiSummary.status === "inserted"
            ? "，已写入 AI 总结"
            : result.aiSummary.status === "failed"
              ? `（AI 总结失败：${result.aiSummary.error}）`
              : enableAiSummary
                ? "，已跳过 AI 总结"
                : ""
        if (result.aiSummary.status === "failed") {
          orca.notify(
            "warn",
            `已导入「${result.title}」${irPart}，但 AI 总结未写入：${result.aiSummary.error}`,
            { title: "网页导入" }
          )
        } else {
          orca.notify(
            "success",
            `已导入「${result.title}」${irPart}${aiPart}`,
            { title: "网页导入" }
          )
        }
      }
      // Success must close even though isWorking is still true (handleClose blocks busy).
      finishAndClose()
    } catch (e) {
      if (!tokenGuardRef.current.isCurrent(token) || importCancelledRef.current) {
        return
      }
      setError(formatError(e))
      console.error("[web-import] import failed:", e)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      if (tokenGuardRef.current.isCurrent(token)) {
        setIsWorking(false)
      }
    }
  }, [
    article,
    pluginName,
    joinIR,
    scheduleToday,
    enableAiSummary,
    isWorking,
    finishAndClose
  ])

  const handleSkipAiSummary = useCallback(() => {
    if (!isWorking || !enableAiSummary || aiSummarySkipped) return
    const controller = abortRef.current
    if (!controller || controller.signal.aborted) return
    setAiSummarySkipped(true)
    controller.abort()
  }, [isWorking, enableAiSummary, aiSummarySkipped])

  return (
    <div className="srs-import-dialog">
      <div className="srs-import-dialog__header">
        <div className="srs-import-dialog__header-text">
          <h2 className="srs-import-dialog__title">导入网页</h2>
        </div>
        <Button
          variant="plain"
          onClick={isWorking ? undefined : handleClose}
          aria-label="关闭"
          aria-disabled={isWorking}
          className={isWorking ? "srs-ui-locked" : undefined}
        >
          关闭
        </Button>
      </div>

      {error ? (
        <div role="alert" className="srs-import-dialog__error">
          {error}
        </div>
      ) : null}

      {step === "url" ? (
        <div className="srs-import-dialog__step">
          <label className="srs-import-dialog__field">
            <span className="srs-import-dialog__label">网页地址</span>
            <input
              type="url"
              value={url}
              placeholder="https://example.com/article"
              aria-label="网页地址"
              disabled={isWorking}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setUrl(e.target.value)
              }
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter" && !isWorking) {
                  e.preventDefault()
                  void handleScrape()
                }
              }}
              className="srs-import-dialog__input"
            />
          </label>
          <div className="srs-import-dialog__hint">
            使用 Firecrawl 抓取正文。请先在插件设置中配置 API Key。
          </div>
          <div className="srs-import-dialog__actions">
            <Button
              variant="solid"
              onClick={() => {
                if (isWorking) return
                void handleScrape()
              }}
              aria-label="解析网页"
              aria-disabled={isWorking || !url.trim()}
              className={
                isWorking || !url.trim() ? "srs-ui-locked" : undefined
              }
            >
              {isWorking ? "解析中…" : "解析网页"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "preview" && article ? (
        <div className="srs-import-dialog__step">
          <div className="srs-import-dialog__tray">
            <div className="srs-web-preview__title">{article.title}</div>
            <div className="srs-web-preview__line">
              来源：{article.hostname}
            </div>
            {article.author || article.siteName ? (
              <div className="srs-web-preview__line">
                {[article.author, article.siteName].filter(Boolean).join(" · ")}
              </div>
            ) : null}
            <div className="srs-web-preview__line">
              正文字符约 {article.textLength}
            </div>
            {article.excerpt ? (
              <div className="srs-web-preview__excerpt">{article.excerpt}</div>
            ) : null}
            {article.warnings && article.warnings.length > 0 ? (
              <div role="status" className="srs-web-preview__warnings">
                {article.warnings.slice(0, 4).map(
                  (w: { code: string; message: string }, i: number) => (
                    <div key={`${w.code}-${i}`}>⚠ {w.message}</div>
                  )
                )}
              </div>
            ) : null}
          </div>

          <label
            className={`srs-import-dialog__checkbox${
              isWorking ? " srs-import-dialog__checkbox--static" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={joinIR}
              disabled={isWorking}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const next = e.target.checked
                setJoinIR(next)
                if (!next) setScheduleToday(false)
              }}
            />
            加入渐进阅读
          </label>

          <label
            className={`srs-import-dialog__checkbox${
              joinIR ? "" : " srs-import-dialog__checkbox--muted"
            }${
              joinIR && !isWorking ? "" : " srs-import-dialog__checkbox--static"
            }`}
          >
            <input
              type="checkbox"
              checked={scheduleToday}
              disabled={!joinIR || isWorking}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setScheduleToday(e.target.checked)
              }
            />
            今天阅读
          </label>
          <div className="srs-import-dialog__hint">
            「今天阅读」仅在加入渐进阅读时可用；默认不安排到今天。
          </div>

          <label
            className={`srs-import-dialog__checkbox${
              isWorking ? " srs-import-dialog__checkbox--static" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={enableAiSummary}
              disabled={isWorking}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEnableAiSummary(e.target.checked)
              }
            />
            AI 总结分析
          </label>
          <div className="srs-import-dialog__hint">
            使用「AI / Firecrawl 服务设置」中的默认模型，在页面首块写入 Markdown
            总结与要点。失败不回滚正文导入。
          </div>

          <div className="srs-import-dialog__actions">
            <Button
              variant="outline"
              onClick={
                isWorking
                  ? undefined
                  : () => {
                      setStep("url")
                      setError(null)
                    }
              }
              aria-disabled={isWorking}
              className={isWorking ? "srs-ui-locked" : undefined}
            >
              上一步
            </Button>
            {isWorking && enableAiSummary && !aiSummarySkipped ? (
              <Button
                variant="outline"
                onClick={handleSkipAiSummary}
                aria-label="跳过 AI 总结并继续导入"
              >
                跳过 AI 总结并继续导入
              </Button>
            ) : null}
            <Button
              variant="solid"
              onClick={() => {
                if (isWorking) return
                void handleImport()
              }}
              aria-label="导入"
              aria-disabled={isWorking}
              className={isWorking ? "srs-ui-locked" : undefined}
            >
              {isWorking
                ? enableAiSummary
                  ? aiSummarySkipped
                    ? "继续导入中…"
                    : "分析并导入中…"
                  : "导入中…"
                : "导入"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function formatError(e: unknown): string {
  if (e instanceof WebImportError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
