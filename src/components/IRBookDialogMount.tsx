/**
 * 渐进阅读 Book 批量创建弹窗挂载组件
 *
 * 设计：通过 Headbar 注册到 Orca 的 React 树中。
 * 平时渲染为 null，调用 showIRBookDialog() 时才显示弹窗。
 */

import type { DbId } from "../orca.d.ts"
import { ensureCardTagProperties } from "../srs/tagPropertyInit"
import { setupBookIR, type IRPriorityChoice } from "../srs/bookIRCreator"

const { React, Valtio } = window as any
const { useSnapshot } = Valtio
const { useMemo, useState } = React

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

  // 默认值：中优先级 + 30 天
  const [priority, setPriority] = useState("中优先级" as IRPriorityChoice)
  const [totalDays, setTotalDays] = useState(30)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const title = useMemo(() => {
    const name = (snap.bookTitle || "未命名书籍").trim() || "未命名书籍"
    return `${name}（${chapterCount} 章）`
  }, [snap.bookTitle, chapterCount])

  const handleSubmit = async () => {
    if (chapterCount === 0) {
      orca.notify("warn", "没有可处理的章节引用", { title: "渐进阅读" })
      return
    }

    setIsSubmitting(true)
    try {
      // 确保 #card 标签属性已初始化（与其它入口保持一致）
      await ensureCardTagProperties(pluginName)

      const result = await setupBookIR(snap.chapterIds, priority, totalDays)
      const ok = result.success.length
      const bad = result.failed.length

      if (bad === 0) {
        orca.notify("success", `已初始化 ${ok} 个章节`, { title: "渐进阅读" })
      } else {
        orca.notify("warn", `已初始化 ${ok} 个章节，失败 ${bad} 个`, { title: "渐进阅读" })
      }
      closeIRBookDialog()
    } catch (error) {
      console.error("[IR Book Dialog] 批量初始化失败:", error)
      orca.notify("error", "批量初始化失败，请重试", { title: "渐进阅读" })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!snap.isOpen) return null

  return (
    <ModalOverlay visible={snap.isOpen} canClose={!isSubmitting} onClose={closeIRBookDialog}>
      <div
        style={{
          background: "var(--orca-bg-primary, #ffffff)",
          borderRadius: "12px",
          padding: "20px",
          width: "min(520px, 92vw)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          border: "1px solid var(--orca-border, #e0e0e0)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
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

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "var(--orca-text-primary, #333)" }}>优先级</span>
            <select
              value={priority}
              disabled={isSubmitting}
              onChange={(e) => setPriority(e.target.value as IRPriorityChoice)}
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid var(--orca-border, #d0d0d0)",
                background: "var(--orca-bg-primary, #fff)",
                color: "var(--orca-text-primary, #333)"
              }}
            >
              <option value="高优先级">高优先级</option>
              <option value="中优先级">中优先级</option>
              <option value="低优先级">低优先级</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "var(--orca-text-primary, #333)" }}>分散到期跨度（天）</span>
            <input
              type="number"
              min={0}
              step={1}
              value={totalDays}
              disabled={isSubmitting}
              onChange={(e) => setTotalDays(Math.max(0, Number(e.target.value) || 0))}
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid var(--orca-border, #d0d0d0)",
                background: "var(--orca-bg-primary, #fff)",
                color: "var(--orca-text-primary, #333)"
              }}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
            <Button
              variant="plain"
              aria-disabled={isSubmitting}
              onClick={() => {
                if (isSubmitting) return
                closeIRBookDialog()
              }}
            >
              取消
            </Button>
            <Button
              variant="solid"
              aria-disabled={isSubmitting || chapterCount === 0}
              onClick={() => {
                if (isSubmitting || chapterCount === 0) return
                handleSubmit()
              }}
            >
              {isSubmitting ? "处理中..." : "开始初始化"}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
