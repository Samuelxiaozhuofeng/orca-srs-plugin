/**
 * AI 提示词库面板（纯展示）
 */

import type { ToolbarAIPrompt } from "../srs/ai/aiToolbarPromptStore"
import type { AIPromptManagerMode } from "../srs/ai/aiPromptManagerState"

export interface AIPromptManagerDialogProps {
  visible: boolean
  mode: AIPromptManagerMode
  items: readonly ToolbarAIPrompt[]
  draftLabel: string
  draftPrompt: string
  draftIncludeBlockContext: boolean
  errorMessage: string | null
  isSaving: boolean
  onClose: () => void
  onCreate: () => void
  onEdit: (index: number) => void
  onDelete: (index: number) => void
  onResetDefaults: () => void
  onDraftLabelChange: (value: string) => void
  onDraftPromptChange: (value: string) => void
  onDraftIncludeBlockContextChange: (value: boolean) => void
  onSaveDraft: () => void
  onCancelDraft: () => void
}

export function AIPromptManagerDialog(props: AIPromptManagerDialogProps) {
  const {
    visible,
    mode,
    items,
    draftLabel,
    draftPrompt,
    draftIncludeBlockContext,
    errorMessage,
    isSaving,
    onClose,
    onCreate,
    onEdit,
    onDelete,
    onResetDefaults,
    onDraftLabelChange,
    onDraftPromptChange,
    onDraftIncludeBlockContextChange,
    onSaveDraft,
    onCancelDraft
  } = props

  const { ModalOverlay } = orca.components
  const busy = isSaving
  const isForm = mode === "edit" || mode === "create"
  const formTitle = mode === "create" ? "新增提示词" : "编辑提示词"
  const canSave =
    !busy && draftLabel.trim().length > 0 && draftPrompt.trim().length > 0

  if (!visible) return null

  return (
    <ModalOverlay visible={visible} canClose={!busy} onClose={onClose}>
      <div
        className="ai-prompt-manager"
        role="dialog"
        aria-labelledby="ai-prompt-manager-title"
        aria-describedby="ai-prompt-manager-desc"
      >
        <header className="ai-prompt-manager__header">
          <div className="ai-prompt-manager__header-text">
            <h2 id="ai-prompt-manager-title" className="ai-prompt-manager__title">
              <i className="ti ti-books" aria-hidden="true" />
              <span>{isForm ? formTitle : "AI 提示词库"}</span>
            </h2>
            {!isForm ? (
              <p id="ai-prompt-manager-desc" className="ai-prompt-manager__subtitle">
                独立管理工具栏 AI 指令，不占用插件设置页。当前 {items.length} 条。
              </p>
            ) : (
              <p id="ai-prompt-manager-desc" className="ai-prompt-manager__subtitle">
                名称会出现在选中文本后的工具栏菜单中。可选是否附带整块作为上下文。
              </p>
            )}
          </div>
          <button
            type="button"
            className="ai-prompt-manager__close"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            title="关闭"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </header>

        {errorMessage ? (
          <div
            className="ai-prompt-manager__banner ai-prompt-manager__banner--error"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {isForm ? (
          <>
            <section className="ai-prompt-manager__field">
              <label className="ai-prompt-manager__section-label" htmlFor="ai-pm-label">
                名称
              </label>
              <input
                id="ai-pm-label"
                type="text"
                className="ai-prompt-manager__input"
                value={draftLabel}
                onChange={(e) => onDraftLabelChange(e.target.value)}
                placeholder="显示在工具栏菜单中的名称"
                disabled={busy}
                autoFocus
              />
            </section>
            <section className="ai-prompt-manager__field">
              <label className="ai-prompt-manager__section-label" htmlFor="ai-pm-prompt">
                提示词
              </label>
              <textarea
                id="ai-pm-prompt"
                className="ai-prompt-manager__textarea"
                value={draftPrompt}
                onChange={(e) => onDraftPromptChange(e.target.value)}
                placeholder="对选中文本执行的指令正文"
                rows={6}
                disabled={busy}
              />
            </section>
            <section className="ai-prompt-manager__field">
              <label className="ai-prompt-manager__checkbox">
                <input
                  type="checkbox"
                  checked={draftIncludeBlockContext}
                  onChange={(e) =>
                    onDraftIncludeBlockContextChange(e.target.checked)
                  }
                  disabled={busy}
                />
                <span>
                  包含块内容作上下文
                  <span className="ai-prompt-manager__checkbox-hint">
                    选区只是词/短语时，把整块发给 AI 作背景，避免脱离语境
                  </span>
                </span>
              </label>
            </section>
            <footer className="ai-prompt-manager__footer">
              <button
                type="button"
                className="ai-prompt-manager__btn ai-prompt-manager__btn--secondary"
                onClick={onCancelDraft}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className="ai-prompt-manager__btn ai-prompt-manager__btn--primary"
                onClick={onSaveDraft}
                disabled={!canSave}
              >
                {busy ? "保存中…" : "保存到提示词库"}
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="ai-prompt-manager__toolbar">
              <button
                type="button"
                className="ai-prompt-manager__btn ai-prompt-manager__btn--primary"
                onClick={onCreate}
                disabled={busy}
              >
                新增提示词
              </button>
              <button
                type="button"
                className="ai-prompt-manager__btn ai-prompt-manager__btn--secondary"
                onClick={onResetDefaults}
                disabled={busy}
                title="写回内置默认三项"
              >
                恢复默认
              </button>
            </div>

            {items.length === 0 ? (
              <p className="ai-prompt-manager__empty">
                提示词库为空。可新增，或恢复默认三项。
              </p>
            ) : (
              <ul className="ai-prompt-manager__list">
                {items.map((item, index) => (
                  <li key={item.id} className="ai-prompt-manager__item">
                    <div className="ai-prompt-manager__item-main">
                      <div className="ai-prompt-manager__item-label-row">
                        <div className="ai-prompt-manager__item-label">{item.label}</div>
                        {item.includeBlockContext ? (
                          <span
                            className="ai-prompt-manager__badge"
                            title="调用时附带整块作为上下文"
                          >
                            含块上下文
                          </span>
                        ) : (
                          <span
                            className="ai-prompt-manager__badge ai-prompt-manager__badge--muted"
                            title="仅发送选中文本"
                          >
                            仅选区
                          </span>
                        )}
                      </div>
                      <div className="ai-prompt-manager__item-preview">{item.prompt}</div>
                    </div>
                    <div className="ai-prompt-manager__item-actions">
                      <button
                        type="button"
                        className="ai-prompt-manager__btn ai-prompt-manager__btn--ghost"
                        onClick={() => onEdit(index)}
                        disabled={busy}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="ai-prompt-manager__btn ai-prompt-manager__btn--danger"
                        onClick={() => onDelete(index)}
                        disabled={busy}
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <footer className="ai-prompt-manager__footer ai-prompt-manager__footer--split">
              <span className="ai-prompt-manager__storage-hint">
                数据保存在插件私有库，不出现在原生设置列表
              </span>
              <button
                type="button"
                className="ai-prompt-manager__btn ai-prompt-manager__btn--ghost"
                onClick={onClose}
                disabled={busy}
              >
                关闭
              </button>
            </footer>
          </>
        )}
      </div>
    </ModalOverlay>
  )
}
