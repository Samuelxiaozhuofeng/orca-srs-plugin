/**
 * AI 快捷交互弹窗状态（Valtio）
 */

const { proxy } = window.Valtio

export type AIQuickInteractPhase =
  | "edit-prompt"
  | "loading"
  | "result"
  | "error"

export interface AIQuickInteractState {
  isOpen: boolean
  pluginName: string | null
  blockId: number | null
  selectedText: string
  blockText: string
  promptLabel: string
  promptText: string
  /** 是否把整块作为 context 与选区一起发给 AI */
  includeBlockContext: boolean
  /** 本条提示词覆盖模型；空 = 全局默认 */
  model: string
  /** 插入结果时自动打标 */
  resultTags: string[]
  /** 插入时合并到同一结果根 */
  reuseSameResultBlock: boolean
  phase: AIQuickInteractPhase
  resultText: string
  errorMessage: string | null
  /** 当前错误是否允许显式切换到连接设置。 */
  canOpenConnectionSettings: boolean
  isGenerating: boolean
  /** custom 模式允许编辑提示词；preset 也可再生成前微调 */
  promptEditable: boolean
}

export const aiQuickInteractState = proxy({
  isOpen: false,
  pluginName: null as string | null,
  blockId: null as number | null,
  selectedText: "",
  blockText: "",
  promptLabel: "",
  promptText: "",
  includeBlockContext: false,
  model: "",
  resultTags: [] as string[],
  reuseSameResultBlock: false,
  phase: "edit-prompt" as AIQuickInteractPhase,
  resultText: "",
  errorMessage: null as string | null,
  canOpenConnectionSettings: false,
  isGenerating: false,
  promptEditable: true
}) as AIQuickInteractState

export function isAIQuickInteractOpen(): boolean {
  return aiQuickInteractState.isOpen
}

export type OpenAIQuickInteractOptions = {
  pluginName: string
  blockId: number
  selectedText: string
  blockText: string
  promptLabel: string
  promptText: string
  includeBlockContext?: boolean
  /** 覆盖全局 model；空 / 未传 = 用服务设置 */
  model?: string
  resultTags?: string[]
  reuseSameResultBlock?: boolean
  /** custom：先编辑提示词；preset：可立刻生成 */
  mode: "preset" | "custom"
}

export function openAIQuickInteract(opts: OpenAIQuickInteractOptions): void {
  aiQuickInteractState.pluginName = opts.pluginName
  aiQuickInteractState.blockId = opts.blockId
  aiQuickInteractState.selectedText = opts.selectedText
  aiQuickInteractState.blockText = opts.blockText
  aiQuickInteractState.promptLabel = opts.promptLabel
  aiQuickInteractState.promptText = opts.promptText
  aiQuickInteractState.includeBlockContext = opts.includeBlockContext === true
  aiQuickInteractState.model =
    typeof opts.model === "string" ? opts.model.trim() : ""
  aiQuickInteractState.resultTags = Array.isArray(opts.resultTags)
    ? opts.resultTags.map((t) => t.trim()).filter(Boolean)
    : []
  aiQuickInteractState.reuseSameResultBlock = opts.reuseSameResultBlock === true
  aiQuickInteractState.promptEditable = true
  aiQuickInteractState.resultText = ""
  aiQuickInteractState.errorMessage = null
  aiQuickInteractState.canOpenConnectionSettings = false
  aiQuickInteractState.isGenerating = false
  aiQuickInteractState.phase =
    opts.mode === "custom" ? "edit-prompt" : "loading"
  aiQuickInteractState.isOpen = true
}

export function closeAIQuickInteract(): void {
  aiQuickInteractState.isOpen = false
  aiQuickInteractState.isGenerating = false
  setTimeout(() => {
    if (aiQuickInteractState.isOpen) return
    aiQuickInteractState.pluginName = null
    aiQuickInteractState.blockId = null
    aiQuickInteractState.selectedText = ""
    aiQuickInteractState.blockText = ""
    aiQuickInteractState.promptLabel = ""
    aiQuickInteractState.promptText = ""
    aiQuickInteractState.includeBlockContext = false
    aiQuickInteractState.model = ""
    aiQuickInteractState.resultTags = []
    aiQuickInteractState.reuseSameResultBlock = false
    aiQuickInteractState.phase = "edit-prompt"
    aiQuickInteractState.resultText = ""
    aiQuickInteractState.errorMessage = null
    aiQuickInteractState.canOpenConnectionSettings = false
    aiQuickInteractState.promptEditable = true
  }, 300)
}

export function setQuickPromptText(text: string): void {
  aiQuickInteractState.promptText = text
}

export function setQuickIncludeBlockContext(value: boolean): void {
  aiQuickInteractState.includeBlockContext = value
}

export function setQuickGenerating(value: boolean): void {
  aiQuickInteractState.isGenerating = value
  if (value) {
    aiQuickInteractState.phase = "loading"
    aiQuickInteractState.errorMessage = null
    aiQuickInteractState.canOpenConnectionSettings = false
  }
}

export function setQuickResult(text: string): void {
  aiQuickInteractState.resultText = text
  aiQuickInteractState.phase = "result"
  aiQuickInteractState.errorMessage = null
  aiQuickInteractState.canOpenConnectionSettings = false
  aiQuickInteractState.isGenerating = false
}

export function setQuickError(
  message: string,
  canOpenConnectionSettings = false
): void {
  aiQuickInteractState.errorMessage = message
  aiQuickInteractState.canOpenConnectionSettings = canOpenConnectionSettings
  aiQuickInteractState.phase = "error"
  aiQuickInteractState.isGenerating = false
}

export function clearQuickError(): void {
  aiQuickInteractState.errorMessage = null
  aiQuickInteractState.canOpenConnectionSettings = false
}
