/**
 * AI 提示词库面板
 *
 * 编辑/新增表单使用组件本地 state，避免 Valtio 快照 + 宿主按键捕获导致无法输入。
 */

import type { ToolbarAIPrompt, ToolbarAIPromptItem } from "../srs/ai/aiToolbarPromptStore"
import type { AIPromptManagerMode } from "../srs/ai/aiPromptManagerState"

export interface AIPromptManagerDialogProps {
  visible: boolean
  mode: AIPromptManagerMode
  /** 进入 create/edit 时用于重置本地表单；list 模式可忽略 */
  editIndex: number | null
  items: readonly ToolbarAIPrompt[]
  initialLabel: string
  initialPrompt: string
  initialIncludeBlockContext: boolean
  initialInsertBelowOnComplete: boolean
  /** 覆盖全局 model；空 = 用服务设置 */
  initialModel: string
  /** 服务设置中的默认 model（展示用） */
  defaultServiceModel: string
  /** 来自 /models 缓存或拉取的可选模型 id */
  modelOptions: readonly string[]
  isFetchingModels: boolean
  modelsError: string | null
  errorMessage: string | null
  isSaving: boolean
  isLoadingItems?: boolean
  onClose: () => void
  onCreate: () => void
  onEdit: (index: number) => void
  onDelete: (index: number) => void
  onResetDefaults: () => void
  onSaveDraft: (entry: ToolbarAIPromptItem) => void
  onCancelDraft: () => void
  onRefreshModels: () => void
}

function stopEditorKeyCapture(
  e: { stopPropagation: () => void; nativeEvent?: { stopImmediatePropagation?: () => void } }
): void {
  e.stopPropagation()
  e.nativeEvent?.stopImmediatePropagation?.()
}

function stopBubble(e: { stopPropagation: () => void }): void {
  e.stopPropagation()
}

/**
 * 独立表单：key 随 mode/editIndex 变化时由父级 remount，保证初始值正确。
 */
function PromptDraftForm(props: {
  initialLabel: string
  initialPrompt: string
  initialIncludeBlockContext: boolean
  initialInsertBelowOnComplete: boolean
  initialModel: string
  defaultServiceModel: string
  modelOptions: readonly string[]
  isFetchingModels: boolean
  modelsError: string | null
  busy: boolean
  onSave: (entry: ToolbarAIPromptItem) => void
  onCancel: () => void
  onRefreshModels: () => void
}) {
  const { useState } = window.React
  const [label, setLabel] = useState(props.initialLabel)
  const [prompt, setPrompt] = useState(props.initialPrompt)
  const [includeBlockContext, setIncludeBlockContext] = useState(
    props.initialIncludeBlockContext
  )
  const [insertBelowOnComplete, setInsertBelowOnComplete] = useState(
    props.initialInsertBelowOnComplete
  )
  const [model, setModel] = useState(props.initialModel)

  const busy = props.busy
  const canSave =
    !busy && label.trim().length > 0 && prompt.trim().length > 0

  const defaultLabel = props.defaultServiceModel.trim()
    ? `默认（服务设置：${props.defaultServiceModel.trim()}）`
    : "默认（使用 AI 服务设置中的模型）"

  // 合并：服务列表 + 当前已保存但不在列表中的 model（编辑兼容）
  const selectOptions = (() => {
    const set = new Set(props.modelOptions.map((m) => m.trim()).filter(Boolean))
    const current = model.trim()
    if (current) set.add(current)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })()

  return (
    <>
      <section className="ai-prompt-manager__field">
        <label className="ai-prompt-manager__section-label" htmlFor="ai-pm-label">
          名称
        </label>
        <input
          id="ai-pm-label"
          type="text"
          className="ai-prompt-manager__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={stopEditorKeyCapture}
          onKeyUp={stopEditorKeyCapture}
          onKeyPress={stopEditorKeyCapture}
          onMouseDown={stopBubble}
          onClick={stopBubble}
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
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={stopEditorKeyCapture}
          onKeyUp={stopEditorKeyCapture}
          onKeyPress={stopEditorKeyCapture}
          onMouseDown={stopBubble}
          onClick={stopBubble}
          placeholder="对选中文本执行的指令正文"
          rows={6}
          disabled={busy}
        />
      </section>
      <section className="ai-prompt-manager__field">
        <label className="ai-prompt-manager__section-label" htmlFor="ai-pm-model">
          模型
        </label>
        <div className="ai-prompt-manager__model-row">
          <select
            id="ai-pm-model"
            className="ai-prompt-manager__input ai-prompt-manager__select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onKeyDown={stopEditorKeyCapture}
            onMouseDown={stopBubble}
            disabled={busy || props.isFetchingModels}
          >
            <option value="">{defaultLabel}</option>
            {selectOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ai-prompt-manager__btn ai-prompt-manager__btn--secondary"
            onClick={props.onRefreshModels}
            disabled={busy || props.isFetchingModels}
            title="按 AI 服务设置中的 Key/URL 拉取 /models"
          >
            {props.isFetchingModels ? "拉取中…" : "刷新模型"}
          </button>
        </div>
        {props.modelsError ? (
          <p className="ai-prompt-manager__field-error" role="alert">
            {props.modelsError}
          </p>
        ) : null}
        <p className="ai-prompt-manager__field-hint">
          选项来自「AI / Firecrawl 服务设置」同一连接下的模型列表。选「默认」则使用服务设置中的当前模型。
        </p>
      </section>
      <section className="ai-prompt-manager__field">
        <label className="ai-prompt-manager__checkbox">
          <input
            type="checkbox"
            checked={includeBlockContext}
            onChange={(e) => setIncludeBlockContext(e.target.checked)}
            onMouseDown={stopBubble}
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
      <section className="ai-prompt-manager__field">
        <label className="ai-prompt-manager__checkbox">
          <input
            type="checkbox"
            checked={insertBelowOnComplete}
            onChange={(e) => setInsertBelowOnComplete(e.target.checked)}
            onMouseDown={stopBubble}
            disabled={busy}
          />
          <span>
            后台生成并插入到块下方
            <span className="ai-prompt-manager__checkbox-hint">
              点菜单即发送，不弹窗；结果写入查询块下方，可再选插入为子块或关闭
            </span>
          </span>
        </label>
      </section>
      <footer className="ai-prompt-manager__footer">
        <button
          type="button"
          className="ai-prompt-manager__btn ai-prompt-manager__btn--secondary"
          onClick={props.onCancel}
          disabled={busy}
        >
          取消
        </button>
        <button
          type="button"
          className="ai-prompt-manager__btn ai-prompt-manager__btn--primary"
          onClick={() =>
            props.onSave({
              label: label.trim(),
              prompt: prompt.trim(),
              includeBlockContext,
              insertBelowOnComplete,
              model: model.trim()
            })
          }
          disabled={!canSave}
        >
          {busy ? "保存中…" : "保存到提示词库"}
        </button>
      </footer>
    </>
  )
}

export function AIPromptManagerDialog(props: AIPromptManagerDialogProps) {
  const {
    visible,
    mode,
    editIndex,
    items,
    initialLabel,
    initialPrompt,
    initialIncludeBlockContext,
    initialInsertBelowOnComplete,
    initialModel,
    defaultServiceModel,
    modelOptions,
    isFetchingModels,
    modelsError,
    errorMessage,
    isSaving,
    isLoadingItems = false,
    onClose,
    onCreate,
    onEdit,
    onDelete,
    onResetDefaults,
    onSaveDraft,
    onCancelDraft,
    onRefreshModels
  } = props

  const { ModalOverlay } = orca.components
  const busy = isSaving
  const isForm = mode === "edit" || mode === "create"
  const formTitle = mode === "create" ? "新增提示词" : "编辑提示词"

  if (!visible) return null

  return (
    <ModalOverlay visible={visible} canClose={!busy} onClose={onClose}>
      <div
        className="ai-prompt-manager"
        role="dialog"
        aria-labelledby="ai-prompt-manager-title"
        aria-describedby="ai-prompt-manager-desc"
        onKeyDown={stopEditorKeyCapture}
        onKeyUp={stopEditorKeyCapture}
        onKeyPress={stopEditorKeyCapture}
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
                名称会出现在选中文本后的工具栏菜单中。可配置模型、块上下文与后台插入。
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
          <PromptDraftForm
            key={`${mode}:${editIndex ?? "new"}`}
            initialLabel={initialLabel}
            initialPrompt={initialPrompt}
            initialIncludeBlockContext={initialIncludeBlockContext}
            initialInsertBelowOnComplete={initialInsertBelowOnComplete}
            initialModel={initialModel}
            defaultServiceModel={defaultServiceModel}
            modelOptions={modelOptions}
            isFetchingModels={isFetchingModels}
            modelsError={modelsError}
            busy={busy}
            onSave={onSaveDraft}
            onCancel={onCancelDraft}
            onRefreshModels={onRefreshModels}
          />
        ) : (
          <>
            <div className="ai-prompt-manager__toolbar">
              <button
                type="button"
                className="ai-prompt-manager__btn ai-prompt-manager__btn--primary"
                onClick={onCreate}
                disabled={busy || isLoadingItems}
              >
                新增提示词
              </button>
              <button
                type="button"
                className="ai-prompt-manager__btn ai-prompt-manager__btn--secondary"
                onClick={onResetDefaults}
                disabled={busy || isLoadingItems}
                title="写回内置默认三项"
              >
                恢复默认
              </button>
            </div>

            {isLoadingItems ? (
              <p className="ai-prompt-manager__empty">正在加载提示词库…</p>
            ) : items.length === 0 ? (
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
                        {item.model?.trim() ? (
                          <span
                            className="ai-prompt-manager__badge"
                            title={`使用专用模型：${item.model.trim()}`}
                          >
                            {item.model.trim()}
                          </span>
                        ) : (
                          <span
                            className="ai-prompt-manager__badge ai-prompt-manager__badge--muted"
                            title="使用 AI 服务设置中的默认模型"
                          >
                            默认模型
                          </span>
                        )}
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
                        {item.insertBelowOnComplete ? (
                          <span
                            className="ai-prompt-manager__badge"
                            title="后台生成，结果插入到查询块下方"
                          >
                            块下方
                          </span>
                        ) : (
                          <span
                            className="ai-prompt-manager__badge ai-prompt-manager__badge--muted"
                            title="打开弹窗确认后再生成"
                          >
                            弹窗
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
                数据保存在插件私有 data，不写入原生设置、不影响 API Key
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
