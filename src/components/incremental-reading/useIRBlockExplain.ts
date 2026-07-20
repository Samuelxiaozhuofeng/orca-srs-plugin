/**
 * IR 阅读正文：块下内联解释 — 触发、AI、写入子块、举例/反驳、追问
 */

import type { DbId } from "../../orca.d.ts"
import {
  generateBlockExplanation,
  generateBlockFollowUp,
  generateBlockSideContent,
  type BlockExplanation
} from "../../srs/ai/aiBlockExplain"
import {
  appendPlainChildIfNew,
  normalizeChildText
} from "../../srs/ai/aiBlockExplainWrite"
import { isAIConfigured } from "../../srs/ai/aiSettingsSchema"
import { readBlockText } from "../../srs/ai/aiFlashcardFlow"
import type {
  BlockExplainFollowUpMessage,
  IRBlockExplainInlineProps,
  SideSectionState
} from "./IRBlockExplainInline"

const { useCallback, useEffect, useRef, useState, createElement: h } = window.React
const createRoot = window.createRoot as (el: Element) => {
  render: (node: unknown) => void
  unmount: () => void
}

export const IR_BLOCK_EXPLAIN_TRIGGER_CLASS = "ir-block-explain-trigger"
export const IR_BLOCK_EXPLAIN_HOST_CLASS = "ir-block-explain-host"
export const IR_BLOCK_EXPLAIN_ACTIVE_CLASS = "ir-block-explain-active"

/** 会话正文内快捷键：讲清楚当前块 / 选区（不走 Orca 全局 assign） */
export const IR_BLOCK_EXPLAIN_SHORTCUT_HINT = "Alt+E"

function resolveTargetBlockEl(
  body: HTMLElement,
  eventTarget: EventTarget | null
): HTMLElement | null {
  const fromEvent =
    eventTarget instanceof Element
      ? eventTarget.closest<HTMLElement>(".orca-block[data-id]")
      : null
  if (fromEvent && body.contains(fromEvent)) return fromEvent

  const active = document.activeElement
  const fromFocus =
    active instanceof Element
      ? active.closest<HTMLElement>(".orca-block[data-id]")
      : null
  if (fromFocus && body.contains(fromFocus)) return fromFocus

  const sel = window.getSelection?.()
  const anchor = sel?.anchorNode
  const fromSel =
    anchor instanceof Element
      ? anchor.closest<HTMLElement>(".orca-block[data-id]")
      : anchor?.parentElement?.closest<HTMLElement>(".orca-block[data-id]") ??
        null
  if (fromSel && body.contains(fromSel)) return fromSel

  return null
}

type Status = "idle" | "loading" | "ready" | "error"

const idleSide = (): SideSectionState => ({
  status: "idle",
  text: null,
  errorMessage: null
})

type OpenState = {
  blockId: number
  blockText: string
  status: Status
  explanation: BlockExplanation | null
  errorMessage: string | null
  focusText: string | null
  example: SideSectionState
  rebuttal: SideSectionState
  followUps: BlockExplainFollowUpMessage[]
  followUpBusy: boolean
  followUpError: string | null
  writtenNormalized: string[]
  writingKey: string | null
}

function parseBlockId(raw: string | null): number | null {
  if (raw == null || raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return n
}

function selectionWithin(blockEl: HTMLElement): string | null {
  const sel = window.getSelection?.()
  if (!sel || sel.isCollapsed) return null
  const text = sel.toString().replace(/\s+/g, " ").trim()
  if (!text) return null
  const anchor =
    sel.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (sel.anchorNode as Element)
      : sel.anchorNode?.parentElement
  if (!anchor || !blockEl.contains(anchor)) return null
  return text.length > 400 ? `${text.slice(0, 400)}…` : text
}

function focusPreview(text: string | null): string | null {
  if (!text) return null
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

function nextMsgId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function baseOpen(
  blockId: number,
  partial: Partial<OpenState> & Pick<OpenState, "status">
): OpenState {
  return {
    blockId,
    blockText: "",
    explanation: null,
    errorMessage: null,
    focusText: null,
    example: idleSide(),
    rebuttal: idleSide(),
    followUps: [],
    followUpBusy: false,
    followUpError: null,
    writtenNormalized: [],
    writingKey: null,
    ...partial
  }
}

export type UseIRBlockExplainOptions = {
  enabled: boolean
  pluginName: string
  cardId: DbId
  bodyRef: { current: HTMLDivElement | null }
  Panel: (props: IRBlockExplainInlineProps) => unknown
}

export function useIRBlockExplain(options: UseIRBlockExplainOptions): void {
  const { enabled, pluginName, cardId, bodyRef, Panel } = options
  const [open, setOpen] = useState<OpenState | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sideAbortRef = useRef<AbortController | null>(null)
  const followAbortRef = useRef<AbortController | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<{ render: (n: unknown) => void; unmount: () => void } | null>(
    null
  )
  const openRef = useRef<OpenState | null>(null)
  openRef.current = open

  const teardownHost = useCallback(() => {
    try {
      rootRef.current?.unmount()
    } catch {
      // host may already be detached
    }
    rootRef.current = null
    hostRef.current?.remove()
    hostRef.current = null
    const body = bodyRef.current
    if (body) {
      body
        .querySelectorAll(`.orca-block.${IR_BLOCK_EXPLAIN_ACTIVE_CLASS}`)
        .forEach((el) => el.classList.remove(IR_BLOCK_EXPLAIN_ACTIVE_CLASS))
    }
  }, [bodyRef])

  const close = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    sideAbortRef.current?.abort()
    sideAbortRef.current = null
    followAbortRef.current?.abort()
    followAbortRef.current = null
    teardownHost()
    setOpen(null)
  }, [teardownHost])

  const runExplain = useCallback(
    async (blockId: number, focusText: string | null) => {
      if (!isAIConfigured(pluginName)) {
        orca.notify("warn", "请先在插件设置中配置 API Key", { title: "块解释" })
        setOpen(
          baseOpen(blockId, {
            status: "error",
            errorMessage: "请先在插件设置中配置 API Key",
            focusText
          })
        )
        return
      }

      abortRef.current?.abort()
      sideAbortRef.current?.abort()
      followAbortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setOpen(
        baseOpen(blockId, {
          status: "loading",
          focusText
        })
      )

      try {
        const { text } = await readBlockText(blockId)
        if (controller.signal.aborted) return

        if (!text.trim()) {
          setOpen(
            baseOpen(blockId, {
              status: "error",
              errorMessage: "块内容为空，无法解释",
              focusText
            })
          )
          return
        }

        const result = await generateBlockExplanation({
          pluginName,
          blockText: text,
          focusText,
          thinner: false,
          signal: controller.signal
        })

        if (controller.signal.aborted) return

        if (!result.success) {
          if (result.error.code === "CANCELLED") return
          setOpen(
            baseOpen(blockId, {
              status: "error",
              errorMessage: result.error.message,
              focusText,
              blockText: text
            })
          )
          return
        }

        setOpen(
          baseOpen(blockId, {
            status: "ready",
            explanation: result.explanation,
            focusText,
            blockText: text
          })
        )
      } catch (error) {
        if (controller.signal.aborted) return
        console.error("[IR BlockExplain] 失败:", error)
        const message = error instanceof Error ? error.message : "解释失败"
        setOpen(
          baseOpen(blockId, {
            status: "error",
            errorMessage: message,
            focusText
          })
        )
      }
    },
    [pluginName]
  )

  const handleWriteText = useCallback(async (text: string) => {
    const cur = openRef.current
    if (!cur) return
    const body = text.trim()
    const key = normalizeChildText(body)
    if (!key) {
      orca.notify("warn", "写入内容为空", { title: "块解释" })
      return
    }
    if (cur.writtenNormalized.includes(key)) {
      orca.notify("info", "已添加", { title: "块解释" })
      return
    }

    setOpen({ ...cur, writingKey: key })
    const result = await appendPlainChildIfNew(cur.blockId, body)
    const latest = openRef.current
    if (!latest || latest.blockId !== cur.blockId) return

    if (!result.success) {
      setOpen({ ...latest, writingKey: null })
      orca.notify("error", result.error, { title: "块解释" })
      return
    }

    if (result.alreadyExisted) {
      const written = Array.from(new Set([...latest.writtenNormalized, key]))
      setOpen({ ...latest, writingKey: null, writtenNormalized: written })
      orca.notify("info", "已添加", { title: "块解释" })
      return
    }

    const written = Array.from(new Set([...latest.writtenNormalized, key]))
    setOpen({ ...latest, writingKey: null, writtenNormalized: written })
    orca.notify("success", "已写入子块", { title: "块解释" })
  }, [])

  const runSide = useCallback(
    async (mode: "example" | "rebuttal") => {
      const cur = openRef.current
      if (!cur?.explanation || cur.status !== "ready") return
      if (!isAIConfigured(pluginName)) {
        orca.notify("warn", "请先在插件设置中配置 API Key", { title: "块解释" })
        return
      }

      sideAbortRef.current?.abort()
      const controller = new AbortController()
      sideAbortRef.current = controller

      const patchLoading: Partial<OpenState> =
        mode === "example"
          ? {
              example: {
                status: "loading",
                text: null,
                errorMessage: null
              }
            }
          : {
              rebuttal: {
                status: "loading",
                text: null,
                errorMessage: null
              }
            }
      setOpen({ ...cur, ...patchLoading })

      const result = await generateBlockSideContent({
        pluginName,
        blockText: cur.blockText,
        explanation: cur.explanation,
        mode,
        signal: controller.signal
      })

      if (controller.signal.aborted) return
      const latest = openRef.current
      if (!latest || latest.blockId !== cur.blockId) return

      if (!result.success) {
        if (result.error.code === "CANCELLED") return
        const errState: SideSectionState = {
          status: "error",
          text: null,
          errorMessage: result.error.message
        }
        setOpen({
          ...latest,
          ...(mode === "example" ? { example: errState } : { rebuttal: errState })
        })
        return
      }

      const okState: SideSectionState = {
        status: "ready",
        text: result.text,
        errorMessage: null
      }
      setOpen({
        ...latest,
        ...(mode === "example" ? { example: okState } : { rebuttal: okState })
      })
    },
    [pluginName]
  )

  const runFollowUp = useCallback(
    async (question: string) => {
      const cur = openRef.current
      if (!cur?.explanation || cur.status !== "ready") return
      if (!isAIConfigured(pluginName)) {
        orca.notify("warn", "请先在插件设置中配置 API Key", { title: "块解释" })
        return
      }

      const userMsg: BlockExplainFollowUpMessage = {
        id: nextMsgId(),
        role: "user",
        content: question.trim()
      }
      const history = [...cur.followUps, userMsg]

      followAbortRef.current?.abort()
      const controller = new AbortController()
      followAbortRef.current = controller

      setOpen({
        ...cur,
        followUps: history,
        followUpBusy: true,
        followUpError: null
      })

      const result = await generateBlockFollowUp({
        pluginName,
        blockText: cur.blockText,
        explanation: cur.explanation,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        question: userMsg.content,
        signal: controller.signal
      })

      if (controller.signal.aborted) return
      const latest = openRef.current
      if (!latest || latest.blockId !== cur.blockId) return

      if (!result.success) {
        if (result.error.code === "CANCELLED") {
          setOpen({ ...latest, followUpBusy: false })
          return
        }
        setOpen({
          ...latest,
          followUpBusy: false,
          followUpError: result.error.message
        })
        return
      }

      const assistantMsg: BlockExplainFollowUpMessage = {
        id: nextMsgId(),
        role: "assistant",
        content: result.answer
      }
      setOpen({
        ...latest,
        followUps: [...latest.followUps, assistantMsg],
        followUpBusy: false,
        followUpError: null
      })
    },
    [pluginName]
  )

  const openForBlock = useCallback(
    (blockEl: HTMLElement) => {
      const blockId = parseBlockId(blockEl.getAttribute("data-id"))
      if (blockId == null) {
        orca.notify("warn", "无法识别该块 ID", { title: "块解释" })
        return
      }
      const focus = selectionWithin(blockEl)
      void runExplain(blockId, focus)
    },
    [runExplain]
  )

  // Inject / maintain per-block triggers under body
  useEffect(() => {
    if (!enabled) {
      const body = bodyRef.current
      body
        ?.querySelectorAll(`.${IR_BLOCK_EXPLAIN_TRIGGER_CLASS}`)
        .forEach((n) => n.remove())
      return
    }

    const body = bodyRef.current
    if (!body) return

    const ensureTriggers = () => {
      const blocks = body.querySelectorAll<HTMLElement>(".orca-block[data-id]")
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.querySelector(`:scope > .${IR_BLOCK_EXPLAIN_TRIGGER_CLASS}`)) {
          continue
        }
        const btn = document.createElement("button")
        btn.type = "button"
        btn.className = IR_BLOCK_EXPLAIN_TRIGGER_CLASS
        btn.setAttribute(
          "aria-label",
          `讲清楚这块（${IR_BLOCK_EXPLAIN_SHORTCUT_HINT}）`
        )
        btn.title = `讲清楚这块（移到块右侧边缘显示 · ${IR_BLOCK_EXPLAIN_SHORTCUT_HINT}）`
        btn.textContent = "?"
        btn.addEventListener("click", (e) => {
          e.preventDefault()
          e.stopPropagation()
          openForBlock(block)
        })
        block.appendChild(btn)
      }

      const cur = openRef.current
      if (cur && (!hostRef.current || !hostRef.current.isConnected)) {
        const target = body.querySelector(
          `.orca-block[data-id="${cur.blockId}"]`
        )
        if (target) setOpen({ ...cur })
      }
    }

    ensureTriggers()
    let debounceId: number | null = null
    const observer = new MutationObserver(() => {
      if (debounceId != null) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        debounceId = null
        ensureTriggers()
      }, 80)
    })
    observer.observe(body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (debounceId != null) window.clearTimeout(debounceId)
      body
        .querySelectorAll(`.${IR_BLOCK_EXPLAIN_TRIGGER_CLASS}`)
        .forEach((n) => n.remove())
    }
  }, [enabled, bodyRef, cardId, openForBlock])

  // Alt+E：当前焦点/选区所在块打开解释（仅会话正文树内，不全局抢键）
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey) return
      if (event.key !== "e" && event.key !== "E") return
      if (event.isComposing) return

      const body = bodyRef.current
      if (!body) return

      const target = event.target
      if (!(target instanceof Node) || !body.contains(target)) return

      let blockEl = resolveTargetBlockEl(body, target)
      // 焦点在解释面板内时，回落到当前已打开的块
      if (!blockEl && openRef.current) {
        blockEl = body.querySelector<HTMLElement>(
          `.orca-block[data-id="${openRef.current.blockId}"]`
        )
      }
      if (!blockEl) {
        orca.notify("warn", "请先将光标放在要解释的块内", { title: "块解释" })
        return
      }

      event.preventDefault()
      event.stopPropagation()
      openForBlock(blockEl)
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [enabled, bodyRef, openForBlock])

  // Mount / update panel host when open state changes
  useEffect(() => {
    if (!enabled || !open || open.status === "idle") {
      teardownHost()
      return
    }

    const body = bodyRef.current
    if (!body) return

    const blockEl = body.querySelector<HTMLElement>(
      `.orca-block[data-id="${open.blockId}"]`
    )
    if (!blockEl) return

    body
      .querySelectorAll(`.orca-block.${IR_BLOCK_EXPLAIN_ACTIVE_CLASS}`)
      .forEach((el) => el.classList.remove(IR_BLOCK_EXPLAIN_ACTIVE_CLASS))
    blockEl.classList.add(IR_BLOCK_EXPLAIN_ACTIVE_CLASS)

    let host = hostRef.current
    if (
      !host ||
      !host.isConnected ||
      host.dataset.blockId !== String(open.blockId)
    ) {
      teardownHost()
      host = document.createElement("div")
      host.className = IR_BLOCK_EXPLAIN_HOST_CLASS
      host.dataset.blockId = String(open.blockId)
      blockEl.after(host)
      hostRef.current = host
      rootRef.current = createRoot(host)
    }

    const panelStatus =
      open.status === "loading" ||
      open.status === "ready" ||
      open.status === "error"
        ? open.status
        : "loading"

    rootRef.current?.render(
      h(Panel, {
        status: panelStatus,
        explanation: open.explanation,
        errorMessage: open.errorMessage,
        focusPreview: focusPreview(open.focusText),
        example: open.example,
        rebuttal: open.rebuttal,
        followUps: open.followUps,
        followUpBusy: open.followUpBusy,
        followUpError: open.followUpError,
        writtenNormalized: open.writtenNormalized,
        writingKey: open.writingKey,
        onClose: close,
        onCancel: () => {
          abortRef.current?.abort()
          abortRef.current = null
          close()
        },
        onRetry: () => {
          const cur = openRef.current
          if (!cur) return
          void runExplain(cur.blockId, cur.focusText)
        },
        onWriteText: (text: string) => {
          void handleWriteText(text)
        },
        onExample: () => {
          void runSide("example")
        },
        onRebuttal: () => {
          void runSide("rebuttal")
        },
        onFollowUp: (question: string) => {
          void runFollowUp(question)
        }
      })
    )
  }, [
    enabled,
    open,
    bodyRef,
    Panel,
    close,
    runExplain,
    handleWriteText,
    runSide,
    runFollowUp,
    teardownHost
  ])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      sideAbortRef.current?.abort()
      sideAbortRef.current = null
      followAbortRef.current?.abort()
      followAbortRef.current = null
      teardownHost()
    }
  }, [cardId, enabled, teardownHost])

  useEffect(() => {
    if (!enabled) close()
  }, [enabled, close])
}
