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
    setIsWorking(true)
    importCancelledRef.current = false
    const token = tokenGuardRef.current.next()
    try {
      const result = await importScrapedArticle({
        article,
        pluginName,
        joinIncrementalReading: joinIR,
        scheduleToday: joinIR && scheduleToday
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
        orca.notify(
          "success",
          `已导入「${result.title}」${irPart}`,
          { title: "网页导入" }
        )
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
      if (tokenGuardRef.current.isCurrent(token)) {
        setIsWorking(false)
      }
    }
  }, [article, pluginName, joinIR, scheduleToday, isWorking, finishAndClose])

  return (
    <div
      style={{
        width: "min(520px, 92vw)",
        maxHeight: "90vh",
        overflowY: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        backgroundColor: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "12px",
        color: "var(--orca-color-text-1)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--orca-color-text-1)" }}>导入网页</div>
        <Button
          variant="plain"
          onClick={isWorking ? undefined : handleClose}
          aria-label="关闭"
          aria-disabled={isWorking}
          style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        >
          关闭
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            color: "var(--orca-color-danger-6, #c00)",
            fontSize: 13,
            lineHeight: 1.45
          }}
        >
          {error}
        </div>
      ) : null}

      {step === "url" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6, color: "var(--orca-color-text-1)" }}>
            网页地址
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
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--orca-color-border-1)",
                backgroundColor: "var(--orca-color-bg-2)",
                color: "var(--orca-color-text-1)",
                outline: "none"
              }}
            />
          </label>
          <div style={{ fontSize: 12, color: "var(--orca-color-text-2)" }}>
            使用 Firecrawl 抓取正文。请先在插件设置中配置 API Key。
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              variant="solid"
              onClick={() => {
                if (isWorking) return
                void handleScrape()
              }}
              aria-label="解析网页"
              aria-disabled={isWorking || !url.trim()}
              style={
                isWorking || !url.trim()
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
            >
              {isWorking ? "解析中…" : "解析网页"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "preview" && article ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--orca-color-border-1)",
              backgroundColor: "var(--orca-color-bg-2)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 13
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--orca-color-text-1)" }}>{article.title}</div>
            <div style={{ color: "var(--orca-color-text-2)" }}>
              来源：{article.hostname}
            </div>
            {article.author || article.siteName ? (
              <div style={{ color: "var(--orca-color-text-2)" }}>
                {[article.author, article.siteName].filter(Boolean).join(" · ")}
              </div>
            ) : null}
            <div style={{ color: "var(--orca-color-text-2)" }}>
              正文字符约 {article.textLength}
            </div>
            {article.excerpt ? (
              <div
                style={{
                  color: "var(--orca-color-text-2)",
                  lineHeight: 1.45,
                  marginTop: 2,
                  maxHeight: 72,
                  overflow: "hidden"
                }}
              >
                {article.excerpt}
              </div>
            ) : null}
            {article.warnings && article.warnings.length > 0 ? (
              <div
                role="status"
                style={{
                  marginTop: 2,
                  color: "var(--orca-color-text-2)",
                  fontSize: 12,
                  lineHeight: 1.4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2
                }}
              >
                {article.warnings.slice(0, 4).map(
                  (w: { code: string; message: string }, i: number) => (
                    <div key={`${w.code}-${i}`}>⚠ {w.message}</div>
                  )
                )}
              </div>
            ) : null}
          </div>

          <label
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: isWorking ? "default" : "pointer",
              color: "var(--orca-color-text-1)"
            }}
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
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: joinIR ? 1 : 0.5,
              cursor: joinIR && !isWorking ? "pointer" : "default",
              color: "var(--orca-color-text-1)"
            }}
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
          <div style={{ fontSize: 12, color: "var(--orca-color-text-2)" }}>
            「今天阅读」仅在加入渐进阅读时可用；默认不安排到今天。
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
              style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              上一步
            </Button>
            <Button
              variant="solid"
              onClick={() => {
                if (isWorking) return
                void handleImport()
              }}
              aria-label="导入"
              aria-disabled={isWorking}
              style={isWorking ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              {isWorking ? "导入中…" : "导入"}
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
