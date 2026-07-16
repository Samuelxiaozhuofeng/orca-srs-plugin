/**
 * AI 生成闪卡对话框（Plan B）
 *
 * 配置 → 单次生成 → 预览/编辑/选择 → 确认写入
 */

import type {
  AICardDraft,
  AICardType,
  MaxCardsOption
} from "../srs/ai/aiDraftTypes"
import { validateEditableDraft } from "../srs/ai/aiDraftParseValidate"
import { AICardDraftCard } from "./AICardDraftCard"

const { useMemo } = window.React

export interface AICardGenerationDialogProps {
  visible: boolean
  phase: "config" | "review"
  sourceText: string
  cardType: AICardType
  maxCards: MaxCardsOption
  drafts: AICardDraft[]
  selectedIds: string[]
  errorMessage: string | null
  infoMessage: string | null
  isGenerating: boolean
  isSaving: boolean
  onClose: () => void
  onCardTypeChange: (type: AICardType) => void
  onMaxCardsChange: (n: MaxCardsOption) => void
  onGenerate: () => void
  onCancelGenerate: () => void
  onBack: () => void
  onToggleSelect: (id: string, selected: boolean) => void
  onUpdateDraft: (id: string, patch: Partial<AICardDraft>) => void
  onRemoveDraft: (id: string) => void
  onSave: () => void
}

const MAX_OPTIONS: MaxCardsOption[] = [1, 3, 5]

export function AICardGenerationDialog(props: AICardGenerationDialogProps) {
  const {
    visible,
    phase,
    sourceText,
    cardType,
    maxCards,
    drafts,
    selectedIds,
    errorMessage,
    infoMessage,
    isGenerating,
    isSaving,
    onClose,
    onCardTypeChange,
    onMaxCardsChange,
    onGenerate,
    onCancelGenerate,
    onBack,
    onToggleSelect,
    onUpdateDraft,
    onRemoveDraft,
    onSave
  } = props

  const { ModalOverlay } = orca.components
  const busy = isGenerating || isSaving
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
            {errorMessage}
          </div>
        )}
        {infoMessage && !errorMessage && (
          <div className="ai-card-dialog__banner ai-card-dialog__banner--info">
            {infoMessage}
          </div>
        )}

        {phase === "config" ? (
          <ConfigPhase
            cardType={cardType}
            maxCards={maxCards}
            isGenerating={isGenerating}
            onCardTypeChange={onCardTypeChange}
            onMaxCardsChange={onMaxCardsChange}
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
  cardType: AICardType
  maxCards: MaxCardsOption
  isGenerating: boolean
  onCardTypeChange: (type: AICardType) => void
  onMaxCardsChange: (n: MaxCardsOption) => void
  onGenerate: () => void
  onCancelGenerate: () => void
  onClose: () => void
}) {
  const { Button } = orca.components
  const {
    cardType,
    maxCards,
    isGenerating,
    onCardTypeChange,
    onMaxCardsChange,
    onGenerate,
    onCancelGenerate,
    onClose
  } = props

  const lockStyle = isGenerating
    ? { opacity: 0.5, pointerEvents: "none" as const }
    : undefined

  const guardType = (type: AICardType) => {
    if (!isGenerating) onCardTypeChange(type)
  }
  const guardMax = (n: MaxCardsOption) => {
    if (!isGenerating) onMaxCardsChange(n)
  }

  return (
    <>
      <section className="ai-card-dialog__controls">
        <div className="ai-card-dialog__field">
          <div className="ai-card-dialog__section-label" id="ai-card-type-label">
            卡片类型
          </div>
          <div
            className="ai-card-dialog__segmented"
            style={lockStyle}
            role="radiogroup"
            aria-labelledby="ai-card-type-label"
          >
            <Button
              variant={cardType === "basic" ? "solid" : "outline"}
              onClick={() => guardType("basic")}
              aria-pressed={cardType === "basic"}
              tabIndex={isGenerating ? -1 : 0}
            >
              Basic
            </Button>
            <Button
              variant={cardType === "cloze" ? "solid" : "outline"}
              onClick={() => guardType("cloze")}
              aria-pressed={cardType === "cloze"}
              tabIndex={isGenerating ? -1 : 0}
            >
              Cloze
            </Button>
          </div>
        </div>

        <div className="ai-card-dialog__field">
          <div className="ai-card-dialog__section-label" id="ai-max-cards-label">
            最多生成
          </div>
          <div
            className="ai-card-dialog__segmented"
            style={lockStyle}
            role="radiogroup"
            aria-labelledby="ai-max-cards-label"
          >
            {MAX_OPTIONS.map(n => (
              <Button
                key={n}
                variant={maxCards === n ? "solid" : "outline"}
                onClick={() => guardMax(n)}
                aria-pressed={maxCards === n}
                tabIndex={isGenerating ? -1 : 0}
              >
                {n}
              </Button>
            ))}
          </div>
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
  onToggleSelect: (id: string, selected: boolean) => void
  onUpdateDraft: (id: string, patch: Partial<AICardDraft>) => void
  onRemoveDraft: (id: string) => void
  onBack: () => void
  onGenerate: () => void
  onCancelGenerate: () => void
  onSave: () => void
  onClose: () => void
}) {
  const { Button } = orca.components
  const {
    drafts,
    selectedIds,
    draftErrors,
    selectedCount,
    canSave,
    isSaving,
    isGenerating,
    onToggleSelect,
    onUpdateDraft,
    onRemoveDraft,
    onBack,
    onGenerate,
    onCancelGenerate,
    onSave,
    onClose
  } = props

  const busy = isSaving || isGenerating

  return (
    <>
      <section className="ai-card-dialog__review">
        <div className="ai-card-dialog__section-label">
          草稿预览（已选 {selectedCount}/{drafts.length}）
        </div>
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
        {isGenerating ? (
          <>
            <span className="ai-card-dialog__status">
              <i
                className="ti ti-loader-2 ai-card-dialog__spin"
                aria-hidden="true"
              />
              重新生成中…
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
            <Button
              variant="solid"
              onClick={() => {
                if (canSave) onSave()
              }}
              aria-disabled={!canSave}
              tabIndex={canSave ? 0 : -1}
              style={
                !canSave
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
            >
              保存 {selectedCount} 张
            </Button>
          </>
        )}
      </footer>
    </>
  )
}
