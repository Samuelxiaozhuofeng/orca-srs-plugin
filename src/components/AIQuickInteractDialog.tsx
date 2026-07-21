/**
 * AI 快捷交互弹窗（纯展示）
 */

export type AIQuickInteractDialogPhase =
  | "edit-prompt"
  | "loading"
  | "result"
  | "error"

export interface AIQuickInteractDialogProps {
  visible: boolean
  phase: AIQuickInteractDialogPhase
  selectedText: string
  promptLabel: string
  promptText: string
  includeBlockContext: boolean
  resultText: string
  errorMessage: string | null
  isGenerating: boolean
  promptEditable: boolean
  onClose: () => void
  onPromptTextChange: (text: string) => void
  onIncludeBlockContextChange: (value: boolean) => void
  onGenerate: () => void
  onCancelGenerate: () => void
  onCopy: () => void
  onInsertChild: () => void
}

export function AIQuickInteractDialog(props: AIQuickInteractDialogProps) {
  const {
    visible,
    phase,
    selectedText,
    promptLabel,
    promptText,
    includeBlockContext,
    resultText,
    errorMessage,
    isGenerating,
    promptEditable,
    onClose,
    onPromptTextChange,
    onIncludeBlockContextChange,
    onGenerate,
    onCancelGenerate,
    onCopy,
    onInsertChild
  } = props

  const { ModalOverlay } = orca.components
  const busy = isGenerating
  const canGenerate = !busy && promptText.trim().length > 0
  const hasResult = resultText.trim().length > 0
  const showResult = phase === "result" || (hasResult && phase !== "loading")

  if (!visible) return null

  return (
    <ModalOverlay visible={visible} canClose={!busy} onClose={onClose}>
      <div className="ai-quick-dialog" role="dialog" aria-labelledby="ai-quick-dialog-title">
        <header className="ai-quick-dialog__header">
          <h2 id="ai-quick-dialog-title" className="ai-quick-dialog__title">
            <i className="ti ti-sparkles" aria-hidden="true" />
            <span>AI 快捷交互</span>
          </h2>
          <button
            type="button"
            className="ai-quick-dialog__close"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            title="关闭"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </header>

        <section className="ai-quick-dialog__source">
          <div className="ai-quick-dialog__section-label">选中文本</div>
          <div className="ai-quick-dialog__source-body">{selectedText}</div>
        </section>

        <section className="ai-quick-dialog__prompt">
          <div className="ai-quick-dialog__section-label">
            提示词
            {promptLabel ? (
              <span className="ai-quick-dialog__prompt-label"> · {promptLabel}</span>
            ) : null}
          </div>
          {promptEditable ? (
            <textarea
              className="ai-quick-dialog__textarea"
              value={promptText}
              onChange={(e) => onPromptTextChange(e.target.value)}
              placeholder="输入要对选中文本执行的指令…"
              rows={4}
              disabled={busy}
            />
          ) : (
            <div className="ai-quick-dialog__prompt-readonly">{promptText}</div>
          )}
          <label className="ai-quick-dialog__checkbox">
            <input
              type="checkbox"
              checked={includeBlockContext}
              onChange={(e) => onIncludeBlockContextChange(e.target.checked)}
              disabled={busy}
            />
            <span>
              包含块内容作上下文
              <span className="ai-quick-dialog__checkbox-hint">
                （选区较模糊时，用整块帮助理解）
              </span>
            </span>
          </label>
        </section>

        {errorMessage && (
          <div
            className="ai-quick-dialog__banner ai-quick-dialog__banner--error"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {phase === "loading" || isGenerating ? (
          <div className="ai-quick-dialog__status" aria-live="polite">
            <i className="ti ti-loader-2 ai-quick-dialog__spin" aria-hidden="true" />
            <span>正在生成…</span>
          </div>
        ) : null}

        {showResult && !isGenerating ? (
          <section className="ai-quick-dialog__result">
            <div className="ai-quick-dialog__section-label">结果</div>
            <div className="ai-quick-dialog__result-body">{resultText}</div>
          </section>
        ) : null}

        {phase === "edit-prompt" && !isGenerating && !hasResult && !errorMessage ? (
          <p className="ai-quick-dialog__hint">编辑提示词后点击「生成」</p>
        ) : null}

        <footer className="ai-quick-dialog__footer">
          {isGenerating ? (
            <button
              type="button"
              className="ai-quick-dialog__btn ai-quick-dialog__btn--secondary"
              onClick={onCancelGenerate}
            >
              取消生成
            </button>
          ) : (
            <button
              type="button"
              className="ai-quick-dialog__btn ai-quick-dialog__btn--primary"
              onClick={onGenerate}
              disabled={!canGenerate}
            >
              {hasResult || errorMessage ? "再生成" : "生成"}
            </button>
          )}

          {hasResult && !isGenerating ? (
            <>
              <button
                type="button"
                className="ai-quick-dialog__btn ai-quick-dialog__btn--secondary"
                onClick={onCopy}
              >
                复制结果
              </button>
              <button
                type="button"
                className="ai-quick-dialog__btn ai-quick-dialog__btn--secondary"
                onClick={onInsertChild}
              >
                插入为子块
              </button>
            </>
          ) : null}

          <button
            type="button"
            className="ai-quick-dialog__btn ai-quick-dialog__btn--ghost"
            onClick={onClose}
            disabled={busy}
          >
            关闭
          </button>
        </footer>
      </div>
    </ModalOverlay>
  )
}
