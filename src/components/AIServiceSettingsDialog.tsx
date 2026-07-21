/**
 * AI + Firecrawl 服务设置面板（本地表单 state，避免无法输入）
 */

import type { AISettings } from "../srs/ai/aiSettingsSchema"
import type { WebImportSettings } from "../srs/settings/webImportSettingsSchema"

export type ServiceSettingsDraft = {
  ai: AISettings
  firecrawl: WebImportSettings
}

export interface AIServiceSettingsDialogProps {
  visible: boolean
  isLoading: boolean
  isSaving: boolean
  errorMessage: string | null
  /** 用于 remount 表单：hydrate 完成后会变 */
  formKey: string
  initialAI: AISettings
  initialFirecrawl: WebImportSettings
  modelOptions: readonly string[]
  isFetchingModels: boolean
  isTestingAI: boolean
  modelsError: string | null
  statusMessage: string | null
  onClose: () => void
  onSave: (draft: ServiceSettingsDraft) => void
  onTestAI: (draft: ServiceSettingsDraft) => void
  onFetchModels: (draft: ServiceSettingsDraft) => void
}

function stopKeys(e: {
  stopPropagation: () => void
  nativeEvent?: { stopImmediatePropagation?: () => void }
}): void {
  e.stopPropagation()
  e.nativeEvent?.stopImmediatePropagation?.()
}

function stopBubble(e: { stopPropagation: () => void }): void {
  e.stopPropagation()
}

function ServiceSettingsForm(props: {
  initialAI: AISettings
  initialFirecrawl: WebImportSettings
  busy: boolean
  modelOptions: readonly string[]
  isFetchingModels: boolean
  isTestingAI: boolean
  modelsError: string | null
  statusMessage: string | null
  onSave: (draft: ServiceSettingsDraft) => void
  onTestAI: (draft: ServiceSettingsDraft) => void
  onFetchModels: (draft: ServiceSettingsDraft) => void
  onCancel: () => void
}) {
  const { useState } = window.React
  const [apiKey, setApiKey] = useState(props.initialAI.apiKey)
  const [apiUrl, setApiUrl] = useState(props.initialAI.apiUrl)
  const [model, setModel] = useState(props.initialAI.model)
  const [firecrawlApiKey, setFirecrawlApiKey] = useState(
    props.initialFirecrawl.firecrawlApiKey
  )
  const [firecrawlApiUrl, setFirecrawlApiUrl] = useState(
    props.initialFirecrawl.firecrawlApiUrl
  )

  const busy = props.busy
  const draft = (): ServiceSettingsDraft => ({
    ai: { apiKey, apiUrl, model },
    firecrawl: { firecrawlApiKey, firecrawlApiUrl }
  })

  const modelList = props.modelOptions
  const modelInList = modelList.includes(model)

  return (
    <div className="ai-service-settings__body">
      <section className="ai-service-settings__section">
        <h3 className="ai-service-settings__section-title">
          <i className="ti ti-robot" aria-hidden="true" />
          AI（OpenAI 兼容）
        </h3>
        <p className="ai-service-settings__section-desc">
          用于智能制卡、快捷交互、块解释等。API URL 请填 chat/completions 完整地址。
        </p>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">API Key</span>
          <input
            type="password"
            className="ai-service-settings__input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            placeholder="sk-… 或第三方 Key"
            disabled={busy}
            autoComplete="off"
          />
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">API URL</span>
          <input
            type="url"
            className="ai-service-settings__input"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            placeholder="https://api.openai.com/v1/chat/completions"
            disabled={busy}
          />
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">模型</span>
          <div className="ai-service-settings__model-row">
            <input
              type="text"
              className="ai-service-settings__input"
              list="ai-service-models-list"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onKeyDown={stopKeys}
              onKeyUp={stopKeys}
              onMouseDown={stopBubble}
              placeholder="gpt-4o-mini / deepseek-chat …"
              disabled={busy}
            />
            <button
              type="button"
              className="ai-service-settings__btn ai-service-settings__btn--secondary"
              onClick={() => props.onFetchModels(draft())}
              disabled={busy || props.isFetchingModels}
              title="根据 Key/URL 请求 /models"
            >
              {props.isFetchingModels ? "拉取中…" : "拉取模型"}
            </button>
          </div>
          {modelList.length > 0 ? (
            <datalist id="ai-service-models-list">
              {modelList.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          ) : null}
          {modelList.length > 0 ? (
            <div className="ai-service-settings__model-chips" role="list">
              {modelList.slice(0, 40).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="listitem"
                  className={`ai-service-settings__chip${
                    id === model ? " is-active" : ""
                  }`}
                  onClick={() => setModel(id)}
                  disabled={busy}
                  title={id}
                >
                  {id}
                </button>
              ))}
              {modelList.length > 40 ? (
                <span className="ai-service-settings__hint">
                  另有 {modelList.length - 40} 个模型，可输入或下拉选择
                </span>
              ) : null}
            </div>
          ) : null}
          {props.modelsError ? (
            <p className="ai-service-settings__inline-error" role="alert">
              {props.modelsError}
            </p>
          ) : null}
          {modelList.length > 0 && !modelInList && model.trim() ? (
            <p className="ai-service-settings__hint">
              当前模型不在列表中，仍可手动使用
            </p>
          ) : null}
        </label>

        <div className="ai-service-settings__row-actions">
          <button
            type="button"
            className="ai-service-settings__btn ai-service-settings__btn--secondary"
            onClick={() => props.onTestAI(draft())}
            disabled={busy || props.isTestingAI}
          >
            {props.isTestingAI ? "测试中…" : "测试 AI 连接"}
          </button>
        </div>
      </section>

      <section className="ai-service-settings__section">
        <h3 className="ai-service-settings__section-title">
          <i className="ti ti-world-www" aria-hidden="true" />
          Firecrawl（网页导入）
        </h3>
        <p className="ai-service-settings__section-desc">
          仅用于「导入网页」。Key 只保存在本机插件 data，不出现在原生设置页。
        </p>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">Firecrawl API Key</span>
          <input
            type="password"
            className="ai-service-settings__input"
            value={firecrawlApiKey}
            onChange={(e) => setFirecrawlApiKey(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            placeholder="fc-…"
            disabled={busy}
            autoComplete="off"
          />
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">Firecrawl API URL</span>
          <input
            type="url"
            className="ai-service-settings__input"
            value={firecrawlApiUrl}
            onChange={(e) => setFirecrawlApiUrl(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            placeholder="https://api.firecrawl.dev/v2/scrape"
            disabled={busy}
          />
        </label>
      </section>

      {props.statusMessage ? (
        <p className="ai-service-settings__status" role="status">
          {props.statusMessage}
        </p>
      ) : null}

      <footer className="ai-service-settings__footer">
        <button
          type="button"
          className="ai-service-settings__btn ai-service-settings__btn--ghost"
          onClick={props.onCancel}
          disabled={busy}
        >
          取消
        </button>
        <button
          type="button"
          className="ai-service-settings__btn ai-service-settings__btn--primary"
          onClick={() => props.onSave(draft())}
          disabled={busy}
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </footer>
    </div>
  )
}

export function AIServiceSettingsDialog(props: AIServiceSettingsDialogProps) {
  const {
    visible,
    isLoading,
    isSaving,
    errorMessage,
    formKey,
    initialAI,
    initialFirecrawl,
    modelOptions,
    isFetchingModels,
    isTestingAI,
    modelsError,
    statusMessage,
    onClose,
    onSave,
    onTestAI,
    onFetchModels
  } = props

  const { ModalOverlay } = orca.components
  const busy = isSaving

  if (!visible) return null

  return (
    <ModalOverlay visible={visible} canClose={!busy} onClose={onClose}>
      <div
        className="ai-service-settings"
        role="dialog"
        aria-labelledby="ai-service-settings-title"
        onKeyDown={stopKeys}
        onKeyUp={stopKeys}
      >
        <header className="ai-service-settings__header">
          <div className="ai-service-settings__header-text">
            <h2 id="ai-service-settings-title" className="ai-service-settings__title">
              <i className="ti ti-plug-connected" aria-hidden="true" />
              <span>AI / Firecrawl 服务设置</span>
            </h2>
            <p className="ai-service-settings__subtitle">
              独立于原生设置页；数据保存在插件私有 data，不会冲掉其它插件配置。
            </p>
          </div>
          <button
            type="button"
            className="ai-service-settings__close"
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
            className="ai-service-settings__banner ai-service-settings__banner--error"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <p className="ai-service-settings__loading">正在加载已保存的配置…</p>
        ) : (
          <ServiceSettingsForm
            key={formKey}
            initialAI={initialAI}
            initialFirecrawl={initialFirecrawl}
            busy={busy}
            modelOptions={modelOptions}
            isFetchingModels={isFetchingModels}
            isTestingAI={isTestingAI}
            modelsError={modelsError}
            statusMessage={statusMessage}
            onSave={onSave}
            onTestAI={onTestAI}
            onFetchModels={onFetchModels}
            onCancel={onClose}
          />
        )}
      </div>
    </ModalOverlay>
  )
}
