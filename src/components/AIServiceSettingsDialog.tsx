/**
 * AI + Firecrawl 服务设置面板（本地表单 state，避免无法输入）
 */

import type {
  AIReasoningEffort,
  AISettings
} from "../srs/ai/aiSettingsSchema"
import type { QuickCardPrefs } from "../srs/ai/aiQuickCardPrefs"
import {
  AI_CARD_LANGUAGE_LABELS,
  AI_CARD_LANGUAGES,
  AI_CUSTOM_INSTRUCTION_MAX,
  type AICardLanguage
} from "../srs/ai/aiDraftTypes"
import {
  AI_REASONING_EFFORTS,
  AI_WEB_SEARCH_TOOL_TYPES,
  MAX_AI_MAX_OUTPUT_TOKENS,
  MIN_AI_MAX_OUTPUT_TOKENS,
  type AIWebSearchToolType
} from "../srs/ai/aiSettingsSchema"
import { AiRequestLogSection } from "./AIRequestLogSection"
import type { WebImportSettings } from "../srs/settings/webImportSettingsSchema"

export type ServiceSettingsDraft = {
  ai: AISettings
  firecrawl: WebImportSettings
  quickCard: QuickCardPrefs
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
  initialQuickCard: QuickCardPrefs
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
  initialQuickCard: QuickCardPrefs
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
  const [enableNativeWebSearch, setEnableNativeWebSearch] = useState(
    props.initialAI.enableNativeWebSearch
  )
  const [reasoningEffort, setReasoningEffort] = useState<AIReasoningEffort>(
    props.initialAI.reasoningEffort
  )
  const [webSearchToolType, setWebSearchToolType] =
    useState<AIWebSearchToolType>(props.initialAI.webSearchToolType)
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    String(props.initialAI.maxOutputTokens)
  )
  const [quickCardLanguage, setQuickCardLanguage] = useState<AICardLanguage>(
    props.initialQuickCard.cardLanguage
  )
  const [quickCardInstruction, setQuickCardInstruction] = useState(
    props.initialQuickCard.customInstruction
  )
  const [quickCardModel, setQuickCardModel] = useState(
    props.initialQuickCard.model
  )
  const [firecrawlApiKey, setFirecrawlApiKey] = useState(
    props.initialFirecrawl.firecrawlApiKey
  )
  const [firecrawlApiUrl, setFirecrawlApiUrl] = useState(
    props.initialFirecrawl.firecrawlApiUrl
  )

  const busy = props.busy
  const draft = (): ServiceSettingsDraft => ({
    ai: {
      apiKey,
      apiUrl,
      model,
      enableNativeWebSearch,
      reasoningEffort,
      webSearchToolType,
      // 非法输入交给 normalizeAISettings 兜底钳制，这里不静默改用户的字
      maxOutputTokens: Number(maxOutputTokens)
    },
    firecrawl: { firecrawlApiKey, firecrawlApiUrl },
    quickCard: {
      cardLanguage: quickCardLanguage,
      customInstruction: quickCardInstruction,
      model: quickCardModel
    }
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

        <label className="ai-service-settings__field ai-service-settings__field--toggle">
          <span className="ai-service-settings__label">模型原生联网</span>
          <label className="ai-service-settings__checkbox-row">
            <input
              type="checkbox"
              className="ai-service-settings__checkbox"
              checked={enableNativeWebSearch}
              onChange={(e) => setEnableNativeWebSearch(e.target.checked)}
              onKeyDown={stopKeys}
              onMouseDown={stopBubble}
              disabled={busy}
            />
            <span>
              开启后按下方形态附带{" "}
              <code className="ai-service-settings__code">tools</code>
            </span>
          </label>
          <p className="ai-service-settings__hint">
            制卡仍做源文本接地校验：开启联网后若答案依赖源外内容，校验可能失败。
          </p>
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">联网 tool 形态</span>
          <select
            className="ai-service-settings__input ai-service-settings__select"
            value={webSearchToolType}
            onChange={(e) =>
              setWebSearchToolType(e.target.value as AIWebSearchToolType)
            }
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy || !enableNativeWebSearch}
          >
            {AI_WEB_SEARCH_TOOL_TYPES.map((toolType) => (
              <option key={toolType} value={toolType}>
                {toolType === "auto"
                  ? "自动（仅 grok-4.5 附带 web_search）"
                  : toolType === "web_search"
                    ? "web_search（Grok 扁平）"
                    : toolType === "google_search"
                      ? "google_search（Gemini grounding）"
                      : toolType}
              </option>
            ))}
          </select>
          <p className="ai-service-settings__hint">
            「自动」只认 model id 含 grok-4.5 并挂扁平{" "}
            <code className="ai-service-settings__code">web_search</code>
            。Gemini 请显式选{" "}
            <code className="ai-service-settings__code">google_search</code>
            （写入{" "}
            <code className="ai-service-settings__code">
              {'{ type: "google_search", google_search: {} }'}
            </code>
            ）；Grok 继续用{" "}
            <code className="ai-service-settings__code">web_search</code>
            。上游不支持会返回可见的 HTTP 错误，不静默降级。
          </p>
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">最大输出 token</span>
          <input
            type="number"
            className="ai-service-settings__input"
            value={maxOutputTokens}
            min={MIN_AI_MAX_OUTPUT_TOKENS}
            max={MAX_AI_MAX_OUTPUT_TOKENS}
            step={1024}
            onChange={(e) => setMaxOutputTokens(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          />
          <p className="ai-service-settings__hint">
            这是<strong>输出</strong>上限，与模型的上下文窗口无关——百万上下文的模型
            输出上限通常仍是 8k~64k，填超过会被网关按 400 拒绝。
            推理模型（deepseek-v4 / gemini thinking 等）会把思考 token
            一并计入，预算不足时正文会被截断成半个 JSON；真撞上了会明确提示
            「被最大输出 token 截断」并告诉你花了多少 token 在推理上。
          </p>
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">思考强度</span>
          <select
            className="ai-service-settings__input ai-service-settings__select"
            value={reasoningEffort}
            onChange={(e) =>
              setReasoningEffort(e.target.value as AIReasoningEffort)
            }
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          >
            {AI_REASONING_EFFORTS.map((level) => (
              <option key={level} value={level}>
                {level === "default"
                  ? "默认（不传 reasoning_effort）"
                  : level}
              </option>
            ))}
          </select>
          <p className="ai-service-settings__hint">
            选择 low / medium / high 时写入{" "}
            <code className="ai-service-settings__code">reasoning_effort</code>
            。仅部分推理模型支持；不支持时上游可能返回 400。
          </p>
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
          <i className="ti ti-bolt" aria-hidden="true" />
          快捷制卡
        </h3>
        <p className="ai-service-settings__section-desc">
          用于「快捷问答卡 / 快捷填空卡 / 快捷选择题」三个命令：选中即生成，
          结果作为待激活卡片插到块下方等你确认。
          <strong>卡型由命令决定</strong>，详细程度固定为概要档（1~2 张）——
          块下面挂十几张预览卡没法看也没法选；要成批生成请用「AI 生成闪卡」弹窗。
        </p>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">卡片语言</span>
          <select
            className="ai-service-settings__input ai-service-settings__select"
            value={quickCardLanguage}
            onChange={(e) =>
              setQuickCardLanguage(e.target.value as AICardLanguage)
            }
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          >
            {AI_CARD_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {AI_CARD_LANGUAGE_LABELS[language]}
              </option>
            ))}
          </select>
          <p className="ai-service-settings__hint">
            只改题干措辞；答案与原文摘录始终保持源文本原样（接地校验的前提）。
          </p>
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">自定义指令（可选）</span>
          <textarea
            className="ai-service-settings__input"
            rows={2}
            value={quickCardInstruction}
            maxLength={AI_CUSTOM_INSTRUCTION_MAX}
            placeholder="例：只做定义类；答案尽量短"
            onChange={(e) => setQuickCardInstruction(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          />
          <p className="ai-service-settings__hint">
            {quickCardInstruction.length}/{AI_CUSTOM_INSTRUCTION_MAX}
          </p>
        </label>

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">专用模型（可选）</span>
          <select
            className="ai-service-settings__input ai-service-settings__select"
            value={modelList.includes(quickCardModel) ? quickCardModel : ""}
            onChange={(e) => setQuickCardModel(e.target.value)}
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          >
            <option value="">默认（用上方全局模型）</option>
            {modelList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="ai-service-settings__hint">
            快捷路径适合用更快更便宜的模型；留空则跟随全局设置。
          </p>
        </label>
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

      <AiRequestLogSection />

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
    initialQuickCard,
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
            initialQuickCard={initialQuickCard}
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
