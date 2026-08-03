/**
 * 服务与算法设置面板（本地表单 state，避免无法输入）
 *
 * 布局：分段 Tab（连接 / 行为 / 快捷制卡 / 复习 / 网页导入 / 诊断 等），
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
import {
  CHAPTER_QUIZ_COUNT_MAX,
  CHAPTER_QUIZ_COUNT_MIN,
  type ChapterQuizPrefs
} from "../srs/settings/chapterQuizSettingsSchema"
import {
  DEFAULT_TTS_OUTPUT_FORMAT,
  DEFAULT_TTS_VOICE,
  TTS_RECOMMENDED_VOICES,
  type TtsSettings
} from "../srs/tts/ttsSettingsSchema"
import {
  FSRS_REQUEST_RETENTION_MAX,
  FSRS_REQUEST_RETENTION_MIN
} from "../srs/settings/reviewSettingsSchema"
import { MAX_DAILY_CARD_LIMIT } from "../srs/reviewSessionBudget"
import {
  getDefaultReviewServiceSettingsDraft,
  type ReviewServiceSettingsDraft
} from "../srs/settings/reviewServiceSettings"

export type ServiceSettingsDraft = {
  ai: AISettings
  firecrawl: WebImportSettings
  quickCard: QuickCardPrefs
  chapterQuiz: ChapterQuizPrefs
  tts: TtsSettings
  review: ReviewServiceSettingsDraft
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
  /** 章末小测偏好（出题数量 / 语言 / 自定义提示词 / 专用模型） */
  initialChapterQuiz: ChapterQuizPrefs
  initialTts: TtsSettings
  initialReview: ReviewServiceSettingsDraft
  /** 打开时非法可见复习设置的警告（runtime 文案） */
  reviewLoadWarning: string | null
  modelOptions: readonly string[]
  isFetchingModels: boolean
  isTestingAI: boolean
  isTestingTts: boolean
  modelsError: string | null
  statusMessage: string | null
  onClose: () => void
  onSave: (draft: ServiceSettingsDraft) => void
  onTestAI: (draft: ServiceSettingsDraft) => void
  onTestTts: (draft: ServiceSettingsDraft) => void
  onFetchModels: (draft: ServiceSettingsDraft) => void
}

type SettingsTabId =
  | "connection"
  | "behavior"
  | "quickCard"
  | "chapterQuiz"
  | "review"
  | "tts"
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
  { id: "chapterQuiz", label: "章末小测", icon: "ti-clipboard-list" },
  { id: "review", label: "复习", icon: "ti-cards" },
  { id: "tts", label: "语音 TTS", icon: "ti-volume" },
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
  initialChapterQuiz: ChapterQuizPrefs
  initialTts: TtsSettings
  initialReview: ReviewServiceSettingsDraft
  busy: boolean
  modelOptions: readonly string[]
  isFetchingModels: boolean
  isTestingAI: boolean
  isTestingTts: boolean
  modelsError: string | null
  statusMessage: string | null
  onSave: (draft: ServiceSettingsDraft) => void
  onTestAI: (draft: ServiceSettingsDraft) => void
  onTestTts: (draft: ServiceSettingsDraft) => void
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
  const [quizQuestionCount, setQuizQuestionCount] = useState(
    String(props.initialChapterQuiz.questionCount)
  )
  const [quizLanguage, setQuizLanguage] = useState<AICardLanguage>(
    props.initialChapterQuiz.language
  )
  const [quizCustomPrompt, setQuizCustomPrompt] = useState(
    props.initialChapterQuiz.customPrompt
  )
  const [quizModel, setQuizModel] = useState(props.initialChapterQuiz.model)
  const [ttsApiKey, setTtsApiKey] = useState(props.initialTts.apiKey)
  const [ttsShowKey, setTtsShowKey] = useState(false)
  const [ttsRegion, setTtsRegion] = useState(props.initialTts.region)
  const [ttsEndpoint, setTtsEndpoint] = useState(props.initialTts.endpoint)
  const [ttsVoice, setTtsVoice] = useState(props.initialTts.voice)
  const [ttsRate, setTtsRate] = useState(props.initialTts.rate)
  const [ttsPitch, setTtsPitch] = useState(props.initialTts.pitch)
  const [newCardsPerDay, setNewCardsPerDay] = useState(
    props.initialReview.newCardsPerDay
  )
  const [reviewCardsPerDay, setReviewCardsPerDay] = useState(
    props.initialReview.reviewCardsPerDay
  )
  const [requestRetention, setRequestRetention] = useState(
    props.initialReview.requestRetention
  )
  const [passFailButtons, setPassFailButtons] = useState(
    props.initialReview.passFailButtons
  )
  const [showNextReviewTime, setShowNextReviewTime] = useState(
    props.initialReview.showNextReviewTime
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
    },
    chapterQuiz: {
      // 非法输入交给 normalizeChapterQuizPrefs 兜底钳制，这里不静默改用户的字；
      // 空字符串 → NaN → normalize 回退默认题量（而非钳制到最小值）
      questionCount:
        quizQuestionCount.trim() === ""
          ? Number.NaN
          : Number(quizQuestionCount),
      language: quizLanguage,
      customPrompt: quizCustomPrompt,
      model: quizModel
    },
    tts: {
      provider: "azure",
      apiKey: ttsApiKey,
      region: ttsRegion,
      endpoint: ttsEndpoint,
      voice: ttsVoice,
      format: DEFAULT_TTS_OUTPUT_FORMAT,
      rate: ttsRate,
      pitch: ttsPitch
    },
    review: {
      newCardsPerDay,
      reviewCardsPerDay,
      requestRetention,
      passFailButtons,
      showNextReviewTime
    }
  })

  const restoreReviewDefaults = () => {
    const defaults = getDefaultReviewServiceSettingsDraft()
    setNewCardsPerDay(defaults.newCardsPerDay)
    setReviewCardsPerDay(defaults.reviewCardsPerDay)
    setRequestRetention(defaults.requestRetention)
    setPassFailButtons(defaults.passFailButtons)
    setShowNextReviewTime(defaults.showNextReviewTime)
  }

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

        {activeTab === "chapterQuiz" ? (
          <section
            className="ai-service-settings__section"
            role="tabpanel"
            id="ai-service-panel-chapterQuiz"
            aria-labelledby="ai-service-tab-chapterQuiz"
          >
            <h3 className="ai-service-settings__section-title">
              <i className="ti ti-clipboard-list" aria-hidden="true" />
              章末小测
            </h3>
            <p className="ai-service-settings__section-desc">
              渐进阅读读完 Topic 后的章节小测：出题数量、题目语言与自定义提示词。
              设置作为新小测的默认值；单个测验仍可另行生成。
            </p>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">出题数量</span>
              <input
                type="number"
                className="ai-service-settings__input"
                value={quizQuestionCount}
                min={CHAPTER_QUIZ_COUNT_MIN}
                max={CHAPTER_QUIZ_COUNT_MAX}
                step={1}
                onChange={(e) => setQuizQuestionCount(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                disabled={busy}
              />
              <FieldHint
                summary={`每次小测的默认题量（${CHAPTER_QUIZ_COUNT_MIN}–${CHAPTER_QUIZ_COUNT_MAX} 道）。`}
                details="范围外或非数字会在保存时钳制回合法区间；仍可针对单次测验传不同题量。"
              />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">题目语言</span>
              <select
                className="ai-service-settings__input ai-service-settings__select"
                value={quizLanguage}
                onChange={(e) =>
                  setQuizLanguage(e.target.value as AICardLanguage)
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
              <FieldHint summary="auto 跟随源文本语言；指定语言时题干/选项/讲解用该语言，事实与关键术语仍忠实于原文。" />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">自定义提示词（可选）</span>
              <textarea
                className="ai-service-settings__input"
                rows={2}
                value={quizCustomPrompt}
                maxLength={AI_CUSTOM_INSTRUCTION_MAX}
                placeholder="例：只出概念辨析题；避免记忆性细节"
                onChange={(e) => setQuizCustomPrompt(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                disabled={busy}
              />
              <p className="ai-service-settings__hint">
                {quizCustomPrompt.length}/{AI_CUSTOM_INSTRUCTION_MAX}
              </p>
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">专用模型（可选）</span>
              <select
                className="ai-service-settings__input ai-service-settings__select"
                value={quizModel}
                onChange={(e) => setQuizModel(e.target.value)}
                onKeyDown={stopKeys}
                onMouseDown={stopBubble}
                disabled={busy}
              >
                <option value="">默认（用「连接」页的全局模型）</option>
                {quizModel && !modelList.includes(quizModel) ? (
                  <option value={quizModel}>
                    {quizModel}（已保存，不在当前列表）
                  </option>
                ) : null}
                {modelList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <FieldHint summary="可指定更快更便宜的模型；留空则跟随全局设置。已保存但不在当前模型列表时会单独显示，选「默认」即可清除。" />
            </label>
          </section>
        ) : null}

        {activeTab === "review" ? (
          <section
            className="ai-service-settings__section"
            role="tabpanel"
            id="ai-service-panel-review"
            aria-labelledby="ai-service-tab-review"
          >
            <h3 className="ai-service-settings__section-title">
              <i className="ti ti-cards" aria-hidden="true" />
              复习
            </h3>
            <p className="ai-service-settings__section-desc">
              控制每天进入队列的新卡与复习卡数量、目标记忆保留率，以及复习界面按钮显示。
            </p>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">每日新卡上限</span>
              <input
                type="number"
                className="ai-service-settings__input"
                value={newCardsPerDay}
                min={0}
                max={MAX_DAILY_CARD_LIMIT}
                step={1}
                onChange={(e) => setNewCardsPerDay(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                disabled={busy}
              />
              <FieldHint
                summary={`0–${MAX_DAILY_CARD_LIMIT} 的整数。0 表示当天不安排新卡。`}
              />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">每日复习上限</span>
              <input
                type="number"
                className="ai-service-settings__input"
                value={reviewCardsPerDay}
                min={0}
                max={MAX_DAILY_CARD_LIMIT}
                step={1}
                onChange={(e) => setReviewCardsPerDay(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                disabled={busy}
              />
              <FieldHint
                summary={`0–${MAX_DAILY_CARD_LIMIT} 的整数。0 表示当天不安排复习卡。`}
              />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">目标记忆保留率</span>
              <input
                type="number"
                className="ai-service-settings__input"
                value={requestRetention}
                min={FSRS_REQUEST_RETENTION_MIN}
                max={FSRS_REQUEST_RETENTION_MAX}
                step={0.01}
                onChange={(e) => setRequestRetention(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                disabled={busy}
              />
              <FieldHint
                summary={`范围 ${FSRS_REQUEST_RETENTION_MIN}–${FSRS_REQUEST_RETENTION_MAX}，推荐 0.9。越高复习越勤。`}
              />
            </label>

            <label className="ai-service-settings__field ai-service-settings__field--toggle">
              <span className="ai-service-settings__label">仅失败 / 通过按钮</span>
              <label className="ai-service-settings__checkbox-row">
                <input
                  type="checkbox"
                  className="ai-service-settings__checkbox"
                  checked={passFailButtons}
                  onChange={(e) => setPassFailButtons(e.target.checked)}
                  onKeyDown={stopKeys}
                  onMouseDown={stopBubble}
                  disabled={busy}
                />
                <span>复习界面只显示失败与通过（映射为 Again / Good）</span>
              </label>
              <FieldHint
                summary="默认关闭，显示四级评分（忘记 / 困难 / 良好 / 简单）。开启后隐藏困难与简单。"
                details="失败写入 again、通过写入 good；不改变 FSRS 算法本身。快捷键：1=失败，3 或空格=通过；2/4 无效。选择题始终保持四级（含「困难」建议），不受此开关影响。"
              />
            </label>

            <label className="ai-service-settings__field ai-service-settings__field--toggle">
              <span className="ai-service-settings__label">
                按钮上方显示下次复习时间
              </span>
              <label className="ai-service-settings__checkbox-row">
                <input
                  type="checkbox"
                  className="ai-service-settings__checkbox"
                  checked={showNextReviewTime}
                  onChange={(e) => setShowNextReviewTime(e.target.checked)}
                  onKeyDown={stopKeys}
                  onMouseDown={stopBubble}
                  disabled={busy}
                />
                <span>Show next review time over buttons</span>
              </label>
              <FieldHint
                summary="默认关闭（隐藏时间，便于专注答题）。开启后在评分按钮上方显示预估间隔与到期日。"
              />
            </label>

            <div className="ai-service-settings__row-actions">
              <button
                type="button"
                className="ai-service-settings__btn ai-service-settings__btn--secondary"
                onClick={restoreReviewDefaults}
                disabled={busy}
                title="仅更新本页草稿，需点底部「保存」才生效"
              >
                恢复默认值
              </button>
            </div>
            <FieldHint summary="「恢复默认值」只改当前草稿（30 / 200 / 0.9，两项界面开关关闭），仍须底部保存才会生效。" />
          </section>
        ) : null}

        {activeTab === "tts" ? (
          <section
            className="ai-service-settings__section"
            role="tabpanel"
            id="ai-service-panel-tts"
            aria-labelledby="ai-service-tab-tts"
          >
            <h3 className="ai-service-settings__section-title">
              <i className="ti ti-volume" aria-hidden="true" />
              Azure Speech TTS
            </h3>
            <p className="ai-service-settings__section-desc">
              独立于 AI 的语音合成配置。Key 仅存本机插件 data，不会写入卡片
              manifest 或日志。中英混卡请优先选名称含 Multilingual
              的音色（可自动识别语种发音）；单语音色如晓晓不会自动切英文。
            </p>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">服务商</span>
              <input
                type="text"
                className="ai-service-settings__input"
                value="Azure Speech"
                disabled
                readOnly
              />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">区域 (region)</span>
              <input
                type="text"
                className="ai-service-settings__input"
                value={ttsRegion}
                onChange={(e) => setTtsRegion(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                placeholder="eastasia / japaneast / westus …"
                disabled={busy}
                autoComplete="off"
              />
              <FieldHint summary="常用区域：eastasia、japaneast、southeastasia、westus2。须与 Azure 资源区域一致。" />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">
                自定义 Endpoint（可选）
              </span>
              <input
                type="url"
                className="ai-service-settings__input"
                value={ttsEndpoint}
                onChange={(e) => setTtsEndpoint(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                placeholder="https://{region}.tts.speech.microsoft.com"
                disabled={busy}
                autoComplete="off"
              />
              <FieldHint
                summary="仅允许 HTTPS。填写后优先于 region。"
                details="路径会自动追加 /cognitiveservices/v1。留空则使用 https://{region}.tts.speech.microsoft.com。"
              />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">API Key</span>
              <div className="ai-service-settings__model-row">
                <input
                  type={ttsShowKey ? "text" : "password"}
                  className="ai-service-settings__input"
                  value={ttsApiKey}
                  onChange={(e) => setTtsApiKey(e.target.value)}
                  onKeyDown={stopKeys}
                  onKeyUp={stopKeys}
                  onMouseDown={stopBubble}
                  placeholder="Azure Speech 订阅密钥"
                  disabled={busy}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="ai-service-settings__btn ai-service-settings__btn--ghost"
                  onClick={() => setTtsShowKey((v: boolean) => !v)}
                  disabled={busy}
                  title={ttsShowKey ? "隐藏密钥" : "显示密钥"}
                >
                  {ttsShowKey ? "隐藏" : "显示"}
                </button>
              </div>
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">语音 (voice)</span>
              <input
                type="text"
                className="ai-service-settings__input"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                onKeyDown={stopKeys}
                onKeyUp={stopKeys}
                onMouseDown={stopBubble}
                placeholder={DEFAULT_TTS_VOICE}
                disabled={busy}
                autoComplete="off"
              />
              <div
                className="ai-service-settings__tts-voice-presets"
                role="group"
                aria-label="推荐音色"
              >
                {TTS_RECOMMENDED_VOICES.map((preset) => {
                  const active = ttsVoice.trim() === preset.voice
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={
                        "ai-service-settings__btn ai-service-settings__btn--ghost" +
                        (active
                          ? " ai-service-settings__tts-voice-presets__btn--active"
                          : "")
                      }
                      title={preset.hint}
                      disabled={busy}
                      aria-pressed={active}
                      onClick={() => setTtsVoice(preset.voice)}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
              <FieldHint
                summary="推荐 Multilingual 音色做中英混排；也可手填任意 Azure voice 名称。"
                details={`默认 ${DEFAULT_TTS_VOICE}。名称含 Multilingual 时 Azure 会按文本自动识别语种。单语如 zh-CN-XiaoxiaoNeural 仅适合纯中文。已保存的旧 voice 不会被强制覆盖。`}
              />
            </label>

            <label className="ai-service-settings__field">
              <span className="ai-service-settings__label">输出格式</span>
              <input
                type="text"
                className="ai-service-settings__input"
                value={DEFAULT_TTS_OUTPUT_FORMAT}
                disabled
                readOnly
              />
              <FieldHint summary="MVP 固定 MP3 格式，便于原生 audio 块与播放。" />
            </label>

            <div className="ai-service-settings__model-row">
              <label className="ai-service-settings__field ai-service-settings__field--flex">
                <span className="ai-service-settings__label">语速 rate</span>
                <input
                  type="text"
                  className="ai-service-settings__input"
                  value={ttsRate}
                  onChange={(e) => setTtsRate(e.target.value)}
                  onKeyDown={stopKeys}
                  onKeyUp={stopKeys}
                  onMouseDown={stopBubble}
                  placeholder="0% / +10% / -5%"
                  disabled={busy}
                />
              </label>
              <label className="ai-service-settings__field ai-service-settings__field--flex">
                <span className="ai-service-settings__label">音调 pitch</span>
                <input
                  type="text"
                  className="ai-service-settings__input"
                  value={ttsPitch}
                  onChange={(e) => setTtsPitch(e.target.value)}
                  onKeyDown={stopKeys}
                  onKeyUp={stopKeys}
                  onMouseDown={stopBubble}
                  placeholder="0% / +2st"
                  disabled={busy}
                />
              </label>
            </div>

            <div className="ai-service-settings__actions-row">
              <button
                type="button"
                className="ai-service-settings__btn ai-service-settings__btn--primary"
                onClick={() => props.onTestTts(draft())}
                disabled={busy || props.isTestingTts}
              >
                {props.isTestingTts ? "试听中…" : "测试连接 / 试听"}
              </button>
            </div>
            <FieldHint summary="试听会合成一段中英混合短句并尝试播放，便于验证 Multilingual 自动语种；失败会显示明确错误。" />
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
    initialChapterQuiz,
    initialTts,
    initialReview,
    reviewLoadWarning,
    modelOptions,
    isFetchingModels,
    isTestingAI,
    isTestingTts,
    modelsError,
    statusMessage,
    onClose,
    onSave,
    onTestAI,
    onTestTts,
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
              <span>服务与算法设置</span>
            </h2>
            <p className="ai-service-settings__subtitle">
              连接 AI、语音 TTS、网页导入与每日复习额度。
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

        {!errorMessage && reviewLoadWarning ? (
          <div
            className="ai-service-settings__banner ai-service-settings__banner--warning"
            role="alert"
          >
            {reviewLoadWarning}
            <p className="ai-service-settings__hint ai-service-settings__hint--after-banner">
              「复习」页已填入当前可用值，请确认后保存，或恢复默认值。
            </p>
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
            initialChapterQuiz={initialChapterQuiz}
            initialTts={initialTts}
            initialReview={initialReview}
            busy={busy}
            modelOptions={modelOptions}
            isFetchingModels={isFetchingModels}
            isTestingAI={isTestingAI}
            isTestingTts={isTestingTts}
            modelsError={modelsError}
            statusMessage={statusMessage}
            onSave={onSave}
            onTestAI={onTestAI}
            onTestTts={onTestTts}
            onFetchModels={onFetchModels}
            onCancel={onClose}
          />
        )}
      </div>
    </ModalOverlay>
  )
}
