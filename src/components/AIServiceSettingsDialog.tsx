/**
 * AI + Firecrawl 服务设置面板（本地表单 state，避免无法输入）
 *
 * 布局：分段 Tab（连接 / 行为 / 快捷制卡 / 网页导入 / 诊断），
 * 默认落地「连接」；长说明二级展开；模型列表默认折叠。
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
  DEFAULT_AI_WEB_SEARCH_TOOL_TYPE,
  MAX_AI_MAX_OUTPUT_TOKENS,
  MIN_AI_MAX_OUTPUT_TOKENS
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

type SettingsTabId =
  | "connection"
  | "behavior"
  | "quickCard"
  | "webImport"
  | "diagnostics"

const SETTINGS_TABS: ReadonlyArray<{
  id: SettingsTabId
  label: string
  icon: string
}> = [
  { id: "connection", label: "连接", icon: "ti-plug-connected" },
  { id: "behavior", label: "行为", icon: "ti-adjustments" },
  { id: "quickCard", label: "快捷制卡", icon: "ti-bolt" },
  { id: "webImport", label: "网页导入", icon: "ti-world-www" },
  { id: "diagnostics", label: "诊断", icon: "ti-activity" }
]

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

/** 短说明 + 可选「了解更多」展开技术细节 */
function FieldHint(props: {
  summary: string
  details?: string
}) {
  const { useState } = window.React
  const [open, setOpen] = useState(false)
  return (
    <div className="ai-service-settings__hint-block">
      <p className="ai-service-settings__hint">{props.summary}</p>
      {props.details ? (
        <>
          <button
            type="button"
            className="ai-service-settings__more-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v: boolean) => !v)}
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
          >
            {open ? "收起说明" : "了解更多"}
          </button>
          {open ? (
            <p className="ai-service-settings__hint ai-service-settings__hint--details">
              {props.details}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
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
  const [activeTab, setActiveTab] = useState<SettingsTabId>("connection")
  const [modelsExpanded, setModelsExpanded] = useState(false)
  const [apiKey, setApiKey] = useState(props.initialAI.apiKey)
  const [apiUrl, setApiUrl] = useState(props.initialAI.apiUrl)
  const [model, setModel] = useState(props.initialAI.model)
  const [enableNativeWebSearch, setEnableNativeWebSearch] = useState(
    props.initialAI.enableNativeWebSearch
  )
  const [reasoningEffort, setReasoningEffort] = useState<AIReasoningEffort>(
    props.initialAI.reasoningEffort
  )
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
      // 形态改由 model 自动决定；持久化固定 auto，避免旧下拉值残留影响心智
      webSearchToolType: DEFAULT_AI_WEB_SEARCH_TOOL_TYPE,
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
  const modelChipLimit = modelsExpanded ? 40 : 8
  const visibleModels = modelList.slice(0, modelChipLimit)
  const hiddenModelCount = Math.max(0, modelList.length - modelChipLimit)

  return (
    <div className="ai-service-settings__body">
      <div
        className="ai-service-settings__tabs"
        role="tablist"
        aria-label="设置分区"
      >
        {SETTINGS_TABS.map((tab) => {
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ai-service-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`ai-service-panel-${tab.id}`}
              className={`ai-service-settings__tab${
                selected ? " is-active" : ""
              }`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={stopKeys}
              onMouseDown={stopBubble}
              disabled={busy}
            >
              <i className={`ti ${tab.icon}`} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="ai-service-settings__panels">
        {activeTab === "connection" ? (
          <section
            className="ai-service-settings__section"
            role="tabpanel"
            id="ai-service-panel-connection"
            aria-labelledby="ai-service-tab-connection"
          >
            <h3 className="ai-service-settings__section-title">
              <i className="ti ti-robot" aria-hidden="true" />
              连接 AI
            </h3>
            <p className="ai-service-settings__section-desc">
              用于智能制卡、快捷交互、块解释等。填 Key 与 chat/completions
              地址，选好模型后可测连。
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
              <FieldHint summary="须为 OpenAI 兼容的 chat/completions 完整地址。" />
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
                  placeholder="gpt-4o-mini / cpa/gemini-3.6-flash …"
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
                <div className="ai-service-settings__model-browser">
                  <div className="ai-service-settings__model-chips" role="list">
                    {visibleModels.map((id) => (
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
                  </div>
                  {modelList.length > 8 ? (
                    <button
                      type="button"
                      className="ai-service-settings__more-toggle"
                      onClick={() => setModelsExpanded((v: boolean) => !v)}
                      onKeyDown={stopKeys}
                      onMouseDown={stopBubble}
                      disabled={busy}
                    >
                      {modelsExpanded
                        ? "收起模型列表"
                        : `浏览全部（共 ${modelList.length}，另显示 ${hiddenModelCount}）`}
                    </button>
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
        ) : null}

        {activeTab === "behavior" ? (
          <section
            className="ai-service-settings__section"
            role="tabpanel"
            id="ai-service-panel-behavior"
            aria-labelledby="ai-service-tab-behavior"
          >
            <h3 className="ai-service-settings__section-title">
              <i className="ti ti-adjustments" aria-hidden="true" />
              请求行为
            </h3>
            <p className="ai-service-settings__section-desc">
              影响制卡 / 解释等请求怎么发。多数情况保持默认即可。
            </p>

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
                  开启后按当前 model 自动附带联网能力
                </span>
              </label>
              <FieldHint
                summary="Grok 4.5 与 Gemini Flash 会自动选对路线；其它模型即使勾选也不联网。"
                details="Grok 4.5 使用扁平 web_search；Gemini Flash 使用 google_search grounding。制卡仍做源文本接地校验；上游不支持会返回可见 HTTP 错误，不静默降级。"
              />
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
              <FieldHint
                summary="仅部分推理模型支持；不支持时可能返回 400。"
                details="选择 low / medium / high 时写入请求体 reasoning_effort；默认档不传该字段，兼容面最广。"
              />
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
              <FieldHint
                summary="限制单次回复长度（输出上限，不是上下文窗口）。推理模型建议 ≥ 8k。"
                details="百万上下文的模型输出上限通常仍是 8k~64k，填超会被网关 400。推理模型会把思考 token 计入 completion；预算不足时正文可能被截断，此时会明确提示「被最大输出 token 截断」。"
              />
            </label>
          </section>
        ) : null}

        {activeTab === "quickCard" ? (
          <section
            className="ai-service-settings__section"
            role="tabpanel"
            id="ai-service-panel-quickCard"
            aria-labelledby="ai-service-tab-quickCard"
          >
            <h3 className="ai-service-settings__section-title">
              <i className="ti ti-bolt" aria-hidden="true" />
              快捷制卡
            </h3>
            <p className="ai-service-settings__section-desc">
              三个快捷命令（问答 / 填空 / 选择题）的默认偏好。批量制卡请用「AI
              生成闪卡」弹窗。
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
              <FieldHint summary="只改题干措辞；答案与原文摘录保持源文本原样。" />
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
                <option value="">默认（用「连接」页的全局模型）</option>
                {modelList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <FieldHint summary="可指定更快更便宜的模型；留空则跟随全局设置。" />
            </label>
          </section>
        ) : null}

        {activeTab === "webImport" ? (
          <section
            className="ai-service-settings__section"
            role="tabpanel"
            id="ai-service-panel-webImport"
            aria-labelledby="ai-service-tab-webImport"
          >
            <h3 className="ai-service-settings__section-title">
              <i className="ti ti-world-www" aria-hidden="true" />
              网页导入（Firecrawl）
            </h3>
            <p className="ai-service-settings__section-desc">
              仅用于「导入网页」。Key 只保存在本机插件 data。
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
        ) : null}

        {activeTab === "diagnostics" ? (
          <div
            role="tabpanel"
            id="ai-service-panel-diagnostics"
            aria-labelledby="ai-service-tab-diagnostics"
          >
            <AiRequestLogSection />
          </div>
        ) : null}
      </div>

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
            <h2
              id="ai-service-settings-title"
              className="ai-service-settings__title"
            >
              <i className="ti ti-plug-connected" aria-hidden="true" />
              <span>AI 与导入服务</span>
            </h2>
            <p className="ai-service-settings__subtitle">
              连接 AI、调请求行为、快捷制卡与网页导入；数据保存在插件私有
              data，不冲掉其它配置。
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
