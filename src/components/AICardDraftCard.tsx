import type {
  AICardDraft,
  ChoiceOptionDraft
} from "../srs/ai/aiDraftTypes"
import {
  AI_CARD_TYPE_LABELS,
  FIELD_LIMITS
} from "../srs/ai/aiDraftTypes"

interface AICardDraftCardProps {
  draft: AICardDraft
  selected: boolean
  validationError: string | null | undefined
  disabled: boolean
  onToggleSelect: (id: string, selected: boolean) => void
  onUpdateDraft: (id: string, patch: Partial<AICardDraft>) => void
  onRemoveDraft: (id: string) => void
}

export function AICardDraftCard(props: AICardDraftCardProps) {
  const { Checkbox, Button } = orca.components
  const {
    draft,
    selected,
    validationError,
    disabled,
    onToggleSelect,
    onUpdateDraft,
    onRemoveDraft
  } = props

  const preview =
    draft.type === "cloze" ? draft.text : draft.question
  const label = `选择${AI_CARD_TYPE_LABELS[draft.type]}：${
    preview.slice(0, 40) || draft.id
  }`

  const patchOption = (index: number, patch: Partial<ChoiceOptionDraft>) => {
    if (draft.type !== "choice") return
    const next = draft.options.map((option, i) =>
      i === index ? { ...option, ...patch } : option
    )
    onUpdateDraft(draft.id, { options: next } as Partial<AICardDraft>)
  }

  return (
    <li
      className={`ai-card-dialog__draft${selected ? " is-selected" : ""}${
        validationError ? " has-error" : ""
      }`}
    >
      <div className="ai-card-dialog__draft-head">
        <span className="ai-card-dialog__checkbox-wrap">
          <Checkbox
            checked={selected}
            disabled={disabled}
            aria-label={label}
            onChange={({ checked }: { checked: boolean }) =>
              onToggleSelect(draft.id, checked)
            }
          />
        </span>
        <span className="ai-card-dialog__draft-type">
          {AI_CARD_TYPE_LABELS[draft.type]}
        </span>
        <Button
          variant="plain"
          className={`ai-card-dialog__draft-remove${
            disabled ? " srs-ui-locked" : ""
          }`}
          onClick={() => {
            if (!disabled) onRemoveDraft(draft.id)
          }}
          title="删除草稿"
          aria-label={`删除草稿 ${draft.id}`}
        >
          <i className="ti ti-trash" aria-hidden="true" />
        </Button>
      </div>

      {draft.type === "basic" ? (
        <>
          <label className="ai-card-dialog__field-label">
            问题
            <textarea
              className="ai-card-dialog__textarea"
              value={draft.question}
              disabled={disabled}
              maxLength={FIELD_LIMITS.question}
              rows={2}
              onChange={e =>
                onUpdateDraft(draft.id, {
                  question: e.target.value
                } as Partial<AICardDraft>)
              }
            />
          </label>
          <label className="ai-card-dialog__field-label">
            答案
            <textarea
              className="ai-card-dialog__textarea"
              value={draft.answer}
              disabled={disabled}
              maxLength={FIELD_LIMITS.answer}
              rows={2}
              onChange={e =>
                onUpdateDraft(draft.id, {
                  answer: e.target.value
                } as Partial<AICardDraft>)
              }
            />
          </label>
        </>
      ) : draft.type === "choice" ? (
        <>
          <label className="ai-card-dialog__field-label">
            题干
            <textarea
              className="ai-card-dialog__textarea"
              value={draft.question}
              disabled={disabled}
              maxLength={FIELD_LIMITS.question}
              rows={2}
              onChange={(e) =>
                onUpdateDraft(draft.id, {
                  question: e.target.value
                } as Partial<AICardDraft>)
              }
            />
          </label>
          <div className="ai-card-dialog__field-label">
            选项（勾选为正确答案）
            <ul className="ai-card-dialog__options">
              {draft.options.map((option, index) => (
                <li
                  key={index}
                  className={`ai-card-dialog__option${
                    option.correct ? " is-correct" : ""
                  }`}
                >
                  <Checkbox
                    checked={option.correct}
                    disabled={disabled}
                    aria-label={`选项 ${index + 1} 为正确答案`}
                    onChange={({ checked }: { checked: boolean }) =>
                      patchOption(index, { correct: checked })
                    }
                  />
                  <input
                    className="ai-card-dialog__input"
                    type="text"
                    value={option.text}
                    disabled={disabled}
                    maxLength={FIELD_LIMITS.optionText}
                    onChange={(e) =>
                      patchOption(index, { text: e.target.value })
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <label className="ai-card-dialog__field-label">
            全文
            <textarea
              className="ai-card-dialog__textarea"
              value={draft.text}
              disabled={disabled}
              maxLength={FIELD_LIMITS.text}
              rows={2}
              onChange={e =>
                onUpdateDraft(draft.id, {
                  text: e.target.value
                } as Partial<AICardDraft>)
              }
            />
          </label>
          <label className="ai-card-dialog__field-label">
            挖空文本
            <input
              className="ai-card-dialog__input"
              type="text"
              value={draft.clozeText}
              disabled={disabled}
              maxLength={FIELD_LIMITS.clozeText}
              onChange={e =>
                onUpdateDraft(draft.id, {
                  clozeText: e.target.value
                } as Partial<AICardDraft>)
              }
            />
          </label>
        </>
      )}

      {validationError && (
        <p className="ai-card-dialog__field-error" role="alert">
          {validationError}
        </p>
      )}

      <div className="ai-card-dialog__quote" title={draft.sourceQuote}>
        <span className="ai-card-dialog__quote-label">依据</span>
        <span className="ai-card-dialog__quote-text">{draft.sourceQuote}</span>
      </div>
    </li>
  )
}
