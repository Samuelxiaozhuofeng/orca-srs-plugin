/**
 * AI 生成闪卡对话框（Plan B）
 *
 * 配置 → 单次生成 → 预览/编辑/选择 → 确认写入
 */

import {
  AI_CARD_TYPE_LABELS,
  AI_CARD_TYPES,
  AI_CARD_LANGUAGE_LABELS,
  AI_CARD_LANGUAGES,
  AI_CUSTOM_INSTRUCTION_MAX,
  AI_DETAIL_LEVEL_HINTS,
  AI_DETAIL_LEVEL_LABELS,
  AI_DETAIL_LEVELS,
  type AICardDraft,
  type AICardLanguage,
  type AICardType,
  type AIDetailLevel
} from "../srs/ai/aiDraftTypes"
import { validateEditableDraft } from "../srs/ai/aiDraftParseValidate"
import { AICardDraftCard } from "./AICardDraftCard"

const { useMemo } = window.React

export interface AICardGenerationDialogProps {
  visible: boolean
  phase: "config" | "review"
  sourceText: string
  cardTypes: AICardType[]
  detailLevel: AIDetailLevel
  cardLanguage: AICardLanguage
  customInstruction: string
  startPending: boolean
  drafts: AICardDraft[]
  selectedIds: string[]
  errorMessage: string | null
  canOpenConnectionSettings: boolean
  infoMessage: string | null
  isGenerating: boolean
  isGeneratingMore: boolean
  isSaving: boolean
  onClose: () => void
  onOpenConnectionSettings: () => void
  onToggleCardType: (type: AICardType) => void
  onDetailLevelChange: (level: AIDetailLevel) => void
  onCardLanguageChange: (language: AICardLanguage) => void
  onCustomInstructionChange: (text: string) => void
  onStartPendingChange: (value: boolean) => void
  onGenerate: () => void
  onGenerateMore: () => void
  onCancelGenerate: () => void
  onBack: () => void
  onToggleSelect: (id: string, selected: boolean) => void
  onUpdateDraft: (id: string, patch: Partial<AICardDraft>) => void
  onRemoveDraft: (id: string) => void
  onSave: () => void
}

/** 编辑器会抢键：表单内的键盘事件一律不冒泡出去。 */
function stopKeys(e: { stopPropagation: () => void }) {
  e.stopPropagation()
}

export function AICardGenerationDialog(props: AICardGenerationDialogProps) {
  const {
    visible,
    phase,
    sourceText,
    cardTypes,
    detailLevel,
    cardLanguage,
    customInstruction,
    startPending,
    drafts,
    selectedIds,
    errorMessage,
    canOpenConnectionSettings,
    infoMessage,
    isGenerating,
    isGeneratingMore,
    isSaving,
    onClose,
    onOpenConnectionSettings,
    onToggleCardType,
    onDetailLevelChange,
    onCardLanguageChange,
    onCustomInstructionChange,
    onStartPendingChange,
    onGenerate,
    onGenerateMore,
    onCancelGenerate,
    onBack,
    onToggleSelect,
    onUpdateDraft,
    onRemoveDraft,
    onSave
  } = props

  const { Button, ModalOverlay } = orca.components
  const busy = isGenerating || isGeneratingMore || isSaving
  const selectedCount = useMemo(
    () => drafts.filter(d => selectedIds.includes(d.id)).length,
    [drafts, selectedIds]
  )

  const draftErrors = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const d of drafts) {
      if (selectedIds.includes(d.id)) {
        map[d.id] = validateEditableDraft(d, sourceText)
      } else {
        map[d.id] = null
      }
    }
    return map
  }, [drafts, selectedIds, sourceText])

  const hasInvalidSelected = useMemo(
    () =>
      drafts.some(
        d => selectedIds.includes(d.id) && draftErrors[d.id] != null
      ),
    [drafts, selectedIds, draftErrors]
  )

  const canSave = selectedCount > 0 && !hasInvalidSelected && !busy

  if (!visible) return null

  return (
    <ModalOverlay visible={visible} canClose={!busy} onClose={onClose}>
      <div className="ai-card-dialog">
        <header className="ai-card-dialog__header">
          <h2 className="ai-card-dialog__title">
            <i className="ti ti-cards" aria-hidden="true" />
            <span>AI 生成闪卡</span>
          </h2>
          <p className="ai-card-dialog__hint">
            下方源文本将发送到已配置的 AI 服务
          </p>
        </header>

        <section className="ai-card-dialog__source">
          <div className="ai-card-dialog__section-label">源文本</div>
          <div className="ai-card-dialog__source-body">{sourceText}</div>
        </section>

        {errorMessage && (
          <div
            className="ai-card-dialog__banner ai-card-dialog__banner--error"
            role="alert"
          >
            <div>{errorMessage}</div>
            {canOpenConnectionSettings ? (
              <Button variant="outline" onClick={onOpenConnectionSettings}>
                打开连接设置
              </Button>
            ) : null}
          </div>
        )}
        {infoMessage && !errorMessage && (
          <div className="ai-card-dialog__banner ai-card-dialog__banner--info">
            {infoMessage}
          </div>
        )}

        {phase === "config" ? (
          <ConfigPhase
            cardTypes={cardTypes}
            detailLevel={detailLevel}
            cardLanguage={cardLanguage}
            customInstruction={customInstruction}
            isGenerating={isGenerating}
            onToggleCardType={onToggleCardType}
            onDetailLevelChange={onDetailLevelChange}
            onCardLanguageChange={onCardLanguageChange}
            onCustomInstructionChange={onCustomInstructionChange}
            onGenerate={onGenerate}
            onCancelGenerate={onCancelGenerate}
            onClose={onClose}
          />
        ) : (
          <ReviewPhase
            drafts={drafts}
            selectedIds={selectedIds}
            draftErrors={draftErrors}
            selectedCount={selectedCount}
            canSave={canSave}
            isSaving={isSaving}
            isGenerating={isGenerating}
            isGeneratingMore={isGeneratingMore}
            startPending={startPending}
            onStartPendingChange={onStartPendingChange}
            onGenerateMore={onGenerateMore}
            onToggleSelect={onToggleSelect}
            onUpdateDraft={onUpdateDraft}
            onRemoveDraft={onRemoveDraft}
            onBack={onBack}
            onGenerate={onGenerate}
            onCancelGenerate={onCancelGenerate}
            onSave={onSave}
            onClose={onClose}
          />
        )}
      </div>
    </ModalOverlay>
  )
}

function ConfigPhase(props: {
  cardTypes: AICardType[]
  detailLevel: AIDetailLevel
  cardLanguage: AICardLanguage
  customInstruction: string
  isGenerating: boolean
  onToggleCardType: (type: AICardType) => void
  onDetailLevelChange: (level: AIDetailLevel) => void
  onCardLanguageChange: (language: AICardLanguage) => void
  onCustomInstructionChange: (text: string) => void
  onGenerate: () => void
  onCancelGenerate: () => void
  onClose: () => void
}) {
  const { Button } = orca.components
  const {
    cardTypes,
    detailLevel,
    cardLanguage,
    customInstruction,
    isGenerating,
    onToggleCardType,
    onDetailLevelChange,
    onCardLanguageChange,
    onCustomInstructionChange,
    onGenerate,
    onCancelGenerate,
    onClose
  } = props

  const lockClass = isGenerating ? "srs-ui-locked" : undefined

  const guardType = (type: AICardType) => {
    if (!isGenerating) onToggleCardType(type)
  }
  const guardLevel = (level: AIDetailLevel) => {
    if (!isGenerating) onDetailLevelChange(level)
  }

  return (
    <>
      <section className="ai-card-dialog__controls">
        <div className="ai-card-dialog__field">
          <div className="ai-card-dialog__section-label" id="ai-card-type-label">
            卡片类型（可多选）
          </div>
          <div
            className={`ai-card-dialog__segmented${
              lockClass ? ` ${lockClass}` : ""
            }`}
            role="group"
            aria-labelledby="ai-card-type-label"
          >
            {AI_CARD_TYPES.map((type) => {
              const on = cardTypes.includes(type)
              return (
                <Button
                  key={type}
                  variant={on ? "solid" : "outline"}
                  onClick={() => guardType(type)}
                  aria-pressed={on}
                  tabIndex={isGenerating ? -1 : 0}
                >
                  {AI_CARD_TYPE_LABELS[type]}
                </Button>
              )
            })}
          </div>
          <p className="ai-card-dialog__field-hint">
            选多种时由 AI 按内容特点分配：定义类走问答、术语密集段走填空、
            有明确易混选项的走选择题。至少保留一种。
          </p>
        </div>

        <div className="ai-card-dialog__field">
          <div className="ai-card-dialog__section-label" id="ai-detail-label">
            详细程度
          </div>
          <div
            className={`ai-card-dialog__segmented${
              lockClass ? ` ${lockClass}` : ""
            }`}
            role="radiogroup"
            aria-labelledby="ai-detail-label"
          >
            {AI_DETAIL_LEVELS.map((level) => (
              <Button
                key={level}
                variant={detailLevel === level ? "solid" : "outline"}
                onClick={() => guardLevel(level)}
                aria-pressed={detailLevel === level}
                tabIndex={isGenerating ? -1 : 0}
              >
                {AI_DETAIL_LEVEL_LABELS[level]}
              </Button>
            ))}
          </div>
          <p className="ai-card-dialog__field-hint">
            {AI_DETAIL_LEVEL_HINTS[detailLevel]}。张数由 AI 按材料密度决定，档位只设上限。
          </p>
        </div>

        <div className="ai-card-dialog__field">
          <label
            className="ai-card-dialog__section-label"
            htmlFor="ai-card-language"
          >
            卡片语言
          </label>
          <select
            id="ai-card-language"
            className="ai-card-dialog__select"
            value={cardLanguage}
            disabled={isGenerating}
            onChange={(e) => onCardLanguageChange(e.target.value as AICardLanguage)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
          >
            {AI_CARD_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {AI_CARD_LANGUAGE_LABELS[language]}
              </option>
            ))}
          </select>
          <p className="ai-card-dialog__field-hint">
            只改题干措辞。答案与原文摘录必须逐字取自源文本（接地校验的前提），不会被翻译。
          </p>
        </div>

        <div className="ai-card-dialog__field">
          <label
            className="ai-card-dialog__section-label"
            htmlFor="ai-custom-instruction"
          >
            自定义指令（可选）
          </label>
          <textarea
            id="ai-custom-instruction"
            className="ai-card-dialog__textarea"
            value={customInstruction}
            disabled={isGenerating}
            rows={2}
            maxLength={AI_CUSTOM_INSTRUCTION_MAX}
            placeholder="例：只做定义类；聚焦第三段；答案尽量短"
            onChange={(e) => onCustomInstructionChange(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
          />
          <p className="ai-card-dialog__field-hint">
            {customInstruction.length}/{AI_CUSTOM_INSTRUCTION_MAX}
            　指令不会覆盖接地要求：卡片仍必须能在源文本中找到依据。
          </p>
        </div>
      </section>

      <footer className="ai-card-dialog__footer">
        {isGenerating ? (
          <>
            <span className="ai-card-dialog__status">
              <i
                className="ti ti-loader-2 ai-card-dialog__spin"
                aria-hidden="true"
              />
              生成中…
            </span>
            <Button variant="outline" onClick={onCancelGenerate}>
              取消生成
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
            <Button variant="solid" onClick={onGenerate}>
              生成草稿
            </Button>
          </>
        )}
      </footer>
    </>
  )
}

function ReviewPhase(props: {
  drafts: AICardDraft[]
  selectedIds: string[]
  draftErrors: Record<string, string | null>
  selectedCount: number
  canSave: boolean
  isSaving: boolean
  isGenerating: boolean
  isGeneratingMore: boolean
  startPending: boolean
  onStartPendingChange: (value: boolean) => void
  onGenerateMore: () => void
  onToggleSelect: (id: string, selected: boolean) => void
  onUpdateDraft: (id: string, patch: Partial<AICardDraft>) => void
  onRemoveDraft: (id: string) => void
  onBack: () => void
  onGenerate: () => void
  onCancelGenerate: () => void
  onSave: () => void
  onClose: () => void
}) {
  const { Button, Checkbox } = orca.components
  const {
    drafts,
    selectedIds,
    draftErrors,
    selectedCount,
    canSave,
    isSaving,
    isGenerating,
    isGeneratingMore,
    startPending,
    onStartPendingChange,
    onGenerateMore,
    onToggleSelect,
    onUpdateDraft,
    onRemoveDraft,
    onBack,
    onGenerate,
    onCancelGenerate,
    onSave,
    onClose
  } = props

  const busy = isSaving || isGenerating || isGeneratingMore

  return (
    <>
      <section className="ai-card-dialog__review">
        <div className="ai-card-dialog__section-label">
          草稿预览（已选 {selectedCount}/{drafts.length}）
        </div>
        <label className="ai-card-dialog__pending-toggle">
          <Checkbox
            checked={startPending}
            disabled={busy}
            aria-label="保存为待激活"
            onChange={({ checked }: { checked: boolean }) =>
              onStartPendingChange(checked)
            }
          />
          <span>
            保存为待激活（不立即排期）
            <span className="ai-card-dialog__field-hint">
              一次写入多张会瞬间打爆当日新卡额度并打乱新卡节奏；待激活的卡可在
              闪卡主页批量放行。
            </span>
          </span>
        </label>

        {drafts.length === 0 ? (
          <p className="ai-card-dialog__empty">暂无草稿，请返回重新生成</p>
        ) : (
          <ul className="ai-card-dialog__draft-list">
            {drafts.map(draft => (
              <AICardDraftCard
                key={draft.id}
                draft={draft}
                selected={selectedIds.includes(draft.id)}
                validationError={
                  selectedIds.includes(draft.id)
                    ? draftErrors[draft.id]
                    : null
                }
                disabled={busy}
                onToggleSelect={onToggleSelect}
                onUpdateDraft={onUpdateDraft}
                onRemoveDraft={onRemoveDraft}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="ai-card-dialog__footer">
        {isGenerating || isGeneratingMore ? (
          <>
            <span className="ai-card-dialog__status">
              <i
                className="ti ti-loader-2 ai-card-dialog__spin"
                aria-hidden="true"
              />
              {isGeneratingMore ? "补充生成中…" : "重新生成中…"}
            </span>
            <Button variant="outline" onClick={onCancelGenerate}>
              取消生成
            </Button>
          </>
        ) : isSaving ? (
          <span className="ai-card-dialog__status">
            <i
              className="ti ti-loader-2 ai-card-dialog__spin"
              aria-hidden="true"
            />
            保存中…
          </span>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
            <Button variant="outline" onClick={onBack}>
              返回设置
            </Button>
            <Button variant="outline" onClick={onGenerate}>
              重新生成
            </Button>
            <Button variant="outline" onClick={onGenerateMore}>
              再来一批
            </Button>
            <Button
              variant="solid"
              onClick={() => {
                if (canSave) onSave()
              }}
              aria-disabled={!canSave}
              tabIndex={canSave ? 0 : -1}
              className={!canSave ? "srs-ui-locked" : undefined}
            >
              保存 {selectedCount} 张
            </Button>
          </>
        )}
      </footer>
    </>
  )
}
