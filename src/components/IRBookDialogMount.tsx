/**
 * 渐进阅读 Book 批量创建弹窗挂载组件
 *
 * 通过 Headbar 注册。支持分散/顺序模式；部分失败时保留弹窗并可重试。
 */

import type { DbId } from "../orca.d.ts"
import { ensureCardTagProperties } from "../srs/tagPropertyInit"
import { initializeBookIR, retryFailedBookIRInit } from "../srs/book-ir/bookIRService"
import type { BookIRMode, BookIRPlanV1 } from "../importers/epub/types"
import { schedulePreviewText } from "./epub-import/epubImportViewModel"
import EpubChapterSelector from "./epub-import/EpubChapterSelector"

const { React, Valtio } = window as any
const { useSnapshot } = Valtio
const { useMemo, useState, useEffect } = React

type IRBookDialogState = {
  isOpen: boolean
  chapterIds: DbId[]
  bookTitle: string
  bookBlockId: DbId | null
}

const irBookDialogState = Valtio.proxy({
  isOpen: false,
  chapterIds: [],
  bookTitle: "",
  bookBlockId: null
} as IRBookDialogState)

export function showIRBookDialog(chapterIds: DbId[], bookTitle: string, bookBlockId?: DbId): void {
  irBookDialogState.isOpen = true
  irBookDialogState.chapterIds = Array.isArray(chapterIds) ? chapterIds : []
  irBookDialogState.bookTitle = String(bookTitle ?? "")
  irBookDialogState.bookBlockId = typeof bookBlockId === "number" ? bookBlockId : null
}

function closeIRBookDialog(): void {
  irBookDialogState.isOpen = false
}

interface IRBookDialogMountProps {
  pluginName: string
}

export function IRBookDialogMount({ pluginName }: IRBookDialogMountProps) {
  const snap = useSnapshot(irBookDialogState)
  const { ModalOverlay, Button } = orca.components

  const chapterCount = snap.chapterIds?.length ?? 0
  const [priority, setPriority] = useState(50)
  const [totalDays, setTotalDays] = useState(30)
  const [mode, setMode] = useState("distributed" as BookIRMode)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastPlan, setLastPlan] = useState(null as BookIRPlanV1 | null)
  const [failedCount, setFailedCount] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [selectedChapterIds, setSelectedChapterIds] = useState([] as DbId[])

  useEffect(() => {
    if (snap.isOpen) {
      setLastPlan(null)
      setFailedCount(0)
      setSuccessCount(0)
      setMode("distributed")
      setPriority(50)
      setTotalDays(Math.max(30, chapterCount * 2))
      setSelectedChapterIds([...snap.chapterIds] as DbId[])
    }
  }, [snap.isOpen, chapterCount])

  const title = useMemo(() => {
    const name = (snap.bookTitle || "未命名书籍").trim() || "未命名书籍"
    return `${name}（${chapterCount} 章）`
  }, [snap.bookTitle, chapterCount])

  const chapterOptions = useMemo(() => snap.chapterIds.map((id: DbId, index: number) => ({
    key: String(id),
    title: (orca.state.blocks?.[id]?.text ?? "").trim() || `章节 #${id}`,
    spineIndex: index
  })), [snap.chapterIds])

  const handleSubmit = async () => {
    if (selectedChapterIds.length === 0) {
      orca.notify("warn", "请至少选择一章", { title: "渐进阅读" })
      return
    }
    if (snap.bookBlockId == null) {
      orca.notify("warn", "缺少书籍 ID，无法写入阅读计划", { title: "渐进阅读" })
      return
    }

    setIsSubmitting(true)
    try {
      await ensureCardTagProperties(pluginName)
      const result = await initializeBookIR({
        bookBlockId: snap.bookBlockId,
        bookTitle: snap.bookTitle,
        chapterIds: selectedChapterIds,
        mode,
        priority,
        totalDays,
        pluginName
      })
      setLastPlan(result.plan)
      setSuccessCount(result.success.length)
      setFailedCount(result.failed.length)

      if (result.failed.length === 0) {
        orca.notify("success", result.message || `已初始化 ${result.success.length} 个章节`, {
          title: "渐进阅读"
        })
        closeIRBookDialog()
      } else {
        orca.notify(
          "warn",
          `成功 ${result.success.length}，失败 ${result.failed.length}。可点击「重试失败项」`,
          { title: "渐进阅读" }
        )
      }
    } catch (error) {
      console.error("[IR Book Dialog] 批量初始化失败:", error)
      orca.notify("error", "批量初始化失败，请重试", { title: "渐进阅读" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetry = async () => {
    if (snap.bookBlockId == null || !lastPlan) return
    setIsSubmitting(true)
    try {
      const result = await retryFailedBookIRInit(
        snap.bookBlockId,
        snap.bookTitle,
        lastPlan,
        pluginName
      )
      setLastPlan(result.plan)
      setSuccessCount((prev: number) => prev + result.success.length)
      setFailedCount(result.failed.length)
      if (result.failed.length === 0) {
        orca.notify("success", result.message || "重试完成", { title: "渐进阅读" })
        closeIRBookDialog()
      } else {
        orca.notify(
          "warn",
          result.message || `仍有 ${result.failed.length} 章失败`,
          { title: "渐进阅读" }
        )
      }
    } catch (error) {
      console.error("[IR Book Dialog] 重试失败:", error)
      orca.notify("error", "重试失败", { title: "渐进阅读" })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!snap.isOpen) return null

  const busyStyle = isSubmitting ? { opacity: 0.5, pointerEvents: "none" as const } : undefined

  return (
    <ModalOverlay visible={snap.isOpen} canClose={!isSubmitting} onClose={closeIRBookDialog}>
      <div
        style={{
          background: "var(--orca-bg-primary, #ffffff)",
          borderRadius: "8px",
          padding: "20px",
          width: "min(520px, 92vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          border: "1px solid var(--orca-border, #e0e0e0)",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--orca-text-primary, #333)" }}>
              创建渐进阅读书籍
            </div>
            <div style={{ fontSize: "13px", color: "var(--orca-text-secondary, #666)", marginTop: "4px" }}>
              {title}
            </div>
          </div>
          <Button
            variant="plain"
            aria-disabled={isSubmitting}
            onClick={() => {
              if (isSubmitting) return
              closeIRBookDialog()
            }}
            title="关闭"
          >
            <i className="ti ti-x" />
          </Button>
        </div>

        <EpubChapterSelector
          chapters={chapterOptions}
          selectedKeys={selectedChapterIds.map(String)}
          onChange={(keys) => setSelectedChapterIds(keys.map(Number))}
          disabled={isSubmitting || failedCount > 0}
          label="选择加入渐进阅读的章节"
        />

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            <input
              type="radio"
              name="ir-book-mode"
              checked={mode === "distributed"}
              disabled={isSubmitting || failedCount > 0}
              onChange={() => setMode("distributed")}
            />{" "}
            分散排期
          </label>
          <label style={{ fontSize: 13 }}>
            <input
              type="radio"
              name="ir-book-mode"
              checked={mode === "sequential"}
              disabled={isSubmitting || failedCount > 0}
              onChange={() => setMode("sequential")}
            />{" "}
            顺序解锁
          </label>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "13px" }}>优先级（0-100）</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={priority}
            disabled={isSubmitting || failedCount > 0}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPriority(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
            }
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid var(--orca-border, #d0d0d0)"
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "13px" }}>分散到期跨度（天）</span>
          <input
            type="number"
            min={0}
            step={1}
            value={totalDays}
            disabled={isSubmitting || mode === "sequential" || failedCount > 0}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setTotalDays(Math.max(0, Number(e.target.value) || 0))
            }
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid var(--orca-border, #d0d0d0)"
            }}
          />
        </label>

        <div style={{ fontSize: 13, color: "var(--orca-text-secondary, #666)" }}>
          {schedulePreviewText(mode, selectedChapterIds.length, totalDays)}
        </div>

        {failedCount > 0 ? (
          <div role="status" style={{ fontSize: 13, color: "var(--orca-color-warning-6, #a60)" }}>
            上次：成功 {successCount}，失败 {failedCount}。成功章节已保留在计划中。
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
          <Button
            variant="plain"
            aria-disabled={isSubmitting}
            style={busyStyle}
            onClick={() => {
              if (isSubmitting) return
              closeIRBookDialog()
            }}
          >
            {failedCount > 0 ? "稍后" : "取消"}
          </Button>
          {failedCount > 0 ? (
            <Button
              variant="solid"
              aria-disabled={isSubmitting}
              style={busyStyle}
              onClick={() => {
                if (isSubmitting) return
                void handleRetry()
              }}
            >
              {isSubmitting ? "重试中..." : "重试失败项"}
            </Button>
          ) : (
            <Button
              variant="solid"
              aria-disabled={isSubmitting || selectedChapterIds.length === 0}
              style={busyStyle}
              onClick={() => {
                if (isSubmitting || selectedChapterIds.length === 0) return
                void handleSubmit()
              }}
            >
              {isSubmitting ? "处理中..." : "开始初始化"}
            </Button>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}
