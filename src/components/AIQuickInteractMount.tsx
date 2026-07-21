/**
 * AI 快捷交互挂载：Headbar 木马 + 请求编排
 *
 * Generation uses a request-token guard so cancelled/stale responses
 * cannot overwrite a newer request's state.
 */

import {
  aiQuickInteractState,
  closeAIQuickInteract,
  setQuickError,
  setQuickGenerating,
  setQuickIncludeBlockContext,
  setQuickPromptText,
  setQuickResult
} from "../srs/ai/aiQuickInteractState"
import {
  insertQuickResultAsChild,
  runToolbarAIPrompt
} from "../srs/ai/aiQuickInteract"
import { createRequestTokenGuard } from "../srs/ai/aiRequestToken"
import { sanitizePublicError } from "../srs/http/redactSecrets"
import { AIQuickInteractDialog } from "./AIQuickInteractDialog"
import { AIQuickJobsPanel } from "./AIQuickJobsPanel"

const { Valtio } = window
const { useSnapshot } = Valtio
const { useEffect, useRef } = window.React

interface AIQuickInteractMountProps {
  pluginName: string
}

export function AIQuickInteractMount({ pluginName }: AIQuickInteractMountProps) {
  const snap = useSnapshot(aiQuickInteractState)
  const abortRef = useRef<AbortController | null>(null)
  const tokenGuardRef = useRef(createRequestTokenGuard())
  /** 避免 preset 打开时重复自动生成 */
  const autoStartedRef = useRef(false)

  useEffect(() => {
    return () => {
      tokenGuardRef.current.invalidate()
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!snap.isOpen) {
      autoStartedRef.current = false
      return
    }
    // preset：打开即 loading，自动发起一次
    if (
      snap.phase === "loading" &&
      snap.promptText.trim() &&
      !autoStartedRef.current &&
      !snap.isGenerating
    ) {
      autoStartedRef.current = true
      void runGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 isOpen/phase 触发自动生成
  }, [snap.isOpen, snap.phase, snap.promptText])

  const runGenerate = async () => {
    const instruction = aiQuickInteractState.promptText.trim()
    if (!instruction) {
      setQuickError("请先填写提示词")
      return
    }
    if (!aiQuickInteractState.selectedText.trim()) {
      setQuickError("选中文本为空")
      return
    }

    const activePlugin = aiQuickInteractState.pluginName || pluginName

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const token = tokenGuardRef.current.next()

    setQuickGenerating(true)

    try {
      const result = await runToolbarAIPrompt({
        pluginName: activePlugin,
        selectedText: aiQuickInteractState.selectedText,
        blockText: aiQuickInteractState.blockText,
        includeBlockContext: aiQuickInteractState.includeBlockContext,
        userInstruction: instruction,
        signal: controller.signal
      })

      if (!tokenGuardRef.current.isCurrent(token)) {
        return
      }

      if (controller.signal.aborted) {
        setQuickError("已取消生成")
        return
      }

      if (!result.success) {
        if (result.error.code === "CANCELLED") {
          setQuickError(result.error.message)
          return
        }
        const safe = sanitizePublicError(result.error.message)
        setQuickError(safe)
        orca.notify("error", safe, { title: "AI 快捷交互" })
        return
      }

      setQuickResult(result.text)
    } catch (error) {
      if (!tokenGuardRef.current.isCurrent(token)) {
        return
      }
      const message = sanitizePublicError(
        error instanceof Error ? error.message : "生成失败，请重试"
      )
      setQuickError(message)
      orca.notify("error", message, { title: "AI 快捷交互" })
    } finally {
      if (tokenGuardRef.current.isCurrent(token)) {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        // setQuickResult / setQuickError 已清 isGenerating；取消路径也要清
        if (aiQuickInteractState.isGenerating) {
          aiQuickInteractState.isGenerating = false
          if (aiQuickInteractState.phase === "loading") {
            aiQuickInteractState.phase = "error"
            if (!aiQuickInteractState.errorMessage) {
              aiQuickInteractState.errorMessage = "已取消生成"
            }
          }
        }
      }
    }
  }

  const handleCancelGenerate = () => {
    tokenGuardRef.current.invalidate()
    abortRef.current?.abort()
    abortRef.current = null
    aiQuickInteractState.isGenerating = false
    if (aiQuickInteractState.resultText.trim()) {
      aiQuickInteractState.phase = "result"
      aiQuickInteractState.errorMessage = "已取消生成"
    } else {
      setQuickError("已取消生成")
    }
  }

  const handleCopy = async () => {
    const text = aiQuickInteractState.resultText
    if (!text.trim()) {
      orca.notify("warn", "没有可复制的结果", { title: "AI 快捷交互" })
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      orca.notify("success", "已复制结果", { title: "AI 快捷交互" })
    } catch (error) {
      console.error("[AI QuickInteract] 复制失败:", error)
      orca.notify(
        "error",
        error instanceof Error ? error.message : "复制失败",
        { title: "AI 快捷交互" }
      )
    }
  }

  const handleInsertChild = async () => {
    const blockId = aiQuickInteractState.blockId
    const text = aiQuickInteractState.resultText
    if (blockId == null) {
      orca.notify("error", "源块丢失，无法插入", { title: "AI 快捷交互" })
      return
    }
    if (!text.trim()) {
      orca.notify("warn", "结果为空，无法插入", { title: "AI 快捷交互" })
      return
    }
    try {
      const result = await insertQuickResultAsChild(
        blockId,
        text,
        aiQuickInteractState.promptLabel
      )
      if (!result.success) {
        orca.notify("error", result.error, { title: "AI 快捷交互" })
        return
      }
      orca.notify("success", "已插入为当前块子块", { title: "AI 快捷交互" })
    } catch (error) {
      console.error("[AI QuickInteract] 插入失败:", error)
      orca.notify(
        "error",
        error instanceof Error ? error.message : "插入失败",
        { title: "AI 快捷交互" }
      )
    }
  }

  return (
    <>
      <AIQuickJobsPanel />
      {snap.isOpen ? (
        <AIQuickInteractDialog
          visible={snap.isOpen}
          phase={snap.phase}
          selectedText={snap.selectedText}
          promptLabel={snap.promptLabel}
          promptText={snap.promptText}
          includeBlockContext={snap.includeBlockContext}
          resultText={snap.resultText}
          errorMessage={snap.errorMessage}
          isGenerating={snap.isGenerating}
          promptEditable={snap.promptEditable}
          onClose={() => {
            if (snap.isGenerating) {
              handleCancelGenerate()
            }
            closeAIQuickInteract()
          }}
          onPromptTextChange={setQuickPromptText}
          onIncludeBlockContextChange={setQuickIncludeBlockContext}
          onGenerate={() => {
            void runGenerate()
          }}
          onCancelGenerate={handleCancelGenerate}
          onCopy={() => {
            void handleCopy()
          }}
          onInsertChild={() => {
            void handleInsertChild()
          }}
        />
      ) : null}
    </>
  )
}
