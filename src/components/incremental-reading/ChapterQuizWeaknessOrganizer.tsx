/**
 * 章末小测 · 整理薄弱点（Custom Panel 内子视图，非第二面板）。
 * 全量弱项列表；默认不勾选；简答预览确定性；填空须 AI 预览确认后才可创建。
 */

import {
  buildBasicCardFromQuestion,
  CHAPTER_QUIZ_COPY,
  type ChapterQuizCardAdds,
  type ChapterQuizQuestion
} from "../../srs/incremental-reading/chapterQuiz"
const { useCallback, useMemo, useState } = window.React
const { Button } = orca.components

export type OrganizerRowKind = "basic" | "cloze"

export type OrganizerRowState = {
  selected: boolean
  kind: OrganizerRowKind
  clozePreview?: { text: string; clozeText: string }
  clozeError?: string | null
  clozeBusy?: boolean
  createError?: string | null
  createStatus?: "idle" | "ok" | "fail"
}

export type ChapterQuizWeaknessOrganizerProps = {
  weakQuestions: ChapterQuizQuestion[]
  repairedIds: ReadonlySet<string>
  cardAdds: Record<string, ChapterQuizCardAdds> | undefined
  cardBusyId: string | null
  onBack: () => void
  onStartClozePreview: (question: ChapterQuizQuestion) => Promise<{
    ok: true
    text: string
    clozeText: string
  } | { ok: false; error: string }>
  onBatchCreate: (
    items: Array<{
      question: ChapterQuizQuestion
      kind: "basic" | "cloze"
      clozePreview?: { text: string; clozeText: string }
    }>,
    onItemResult?: (
      questionId: string,
      result: { ok: true; blockId: number } | { ok: false; error: string }
    ) => void
  ) => Promise<{ succeeded: number; failed: number }>
}

function initialRowState(
  q: ChapterQuizQuestion,
  cardAdds: Record<string, ChapterQuizCardAdds> | undefined
): OrganizerRowState {
  const adds = cardAdds?.[q.id]
  const hasBasic = Boolean(adds?.basicBlockId)
  const hasCloze = Boolean(adds?.clozeBlockId)
  return {
    selected: false,
    kind: hasCloze && !hasBasic ? "cloze" : "basic",
    createStatus: hasBasic || hasCloze ? "ok" : "idle"
  }
}

export default function ChapterQuizWeaknessOrganizer(
  props: ChapterQuizWeaknessOrganizerProps
) {
  const {
    weakQuestions,
    repairedIds,
    cardAdds,
    cardBusyId,
    onBack,
    onStartClozePreview,
    onBatchCreate
  } = props

  const [rows, setRows] = useState<Record<string, OrganizerRowState>>(() => {
    const init: Record<string, OrganizerRowState> = {}
    for (const q of weakQuestions) {
      init[q.id] = initialRowState(q, cardAdds)
    }
    return init
  })
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchNote, setBatchNote] = useState<string | null>(null)

  const updateRow = useCallback(
    (id: string, patch: Partial<OrganizerRowState>) => {
      setRows((prev: Record<string, OrganizerRowState>) => ({
        ...prev,
        [id]: { ...(prev[id] ?? { selected: false, kind: "basic" }), ...patch }
      }))
    },
    []
  )

  const eligibleCount = useMemo(() => {
    let n = 0
    for (const q of weakQuestions) {
      const row = rows[q.id]
      if (!row?.selected) continue
      const adds = cardAdds?.[q.id]
      if (row.kind === "basic" && adds?.basicBlockId) continue
      if (row.kind === "cloze" && adds?.clozeBlockId) continue
      if (row.kind === "cloze" && !row.clozePreview) continue
      if (typeof q.sourceBlockId !== "number") continue
      n += 1
    }
    return n
  }, [cardAdds, rows, weakQuestions])

  const handleToggleKind = useCallback(
    async (q: ChapterQuizQuestion, kind: OrganizerRowKind) => {
      const adds = cardAdds?.[q.id]
      if (kind === "basic" && adds?.basicBlockId) return
      if (kind === "cloze" && adds?.clozeBlockId) return
      updateRow(q.id, { kind, clozeError: null })
      if (kind === "cloze") {
        const row = rows[q.id]
        if (row?.clozePreview) return
        updateRow(q.id, { clozeBusy: true, clozeError: null })
        const result = await onStartClozePreview(q)
        if (result.ok) {
          updateRow(q.id, {
            clozeBusy: false,
            clozePreview: { text: result.text, clozeText: result.clozeText },
            clozeError: null
          })
        } else {
          updateRow(q.id, {
            clozeBusy: false,
            clozeError: result.error,
            clozePreview: undefined
          })
        }
      }
    },
    [cardAdds, onStartClozePreview, rows, updateRow]
  )

  const handleRetryCloze = useCallback(
    async (q: ChapterQuizQuestion) => {
      updateRow(q.id, { clozeBusy: true, clozeError: null })
      const result = await onStartClozePreview(q)
      if (result.ok) {
        updateRow(q.id, {
          clozeBusy: false,
          clozePreview: { text: result.text, clozeText: result.clozeText },
          clozeError: null
        })
      } else {
        updateRow(q.id, {
          clozeBusy: false,
          clozeError: result.error
        })
      }
    },
    [onStartClozePreview, updateRow]
  )

  const handleCreate = useCallback(async () => {
    if (batchBusy) return
    const items: Array<{
      question: ChapterQuizQuestion
      kind: "basic" | "cloze"
      clozePreview?: { text: string; clozeText: string }
    }> = []
    for (const q of weakQuestions) {
      const row = rows[q.id]
      if (!row?.selected) continue
      const adds = cardAdds?.[q.id]
      if (row.kind === "basic") {
        if (adds?.basicBlockId) continue
        if (typeof q.sourceBlockId !== "number") continue
        items.push({ question: q, kind: "basic" })
      } else {
        if (adds?.clozeBlockId) continue
        if (!row.clozePreview) continue
        if (typeof q.sourceBlockId !== "number") continue
        items.push({
          question: q,
          kind: "cloze",
          clozePreview: row.clozePreview
        })
      }
    }
    if (items.length === 0) {
      setBatchNote(CHAPTER_QUIZ_COPY.organizerSelectNone)
      return
    }
    setBatchBusy(true)
    setBatchNote(null)
    try {
      const result = await onBatchCreate(items, (qid, res) => {
        if (res.ok) {
          updateRow(qid, {
            createStatus: "ok",
            createError: null,
            selected: false
          })
        } else {
          updateRow(qid, {
            createStatus: "fail",
            createError: res.error
          })
        }
      })
      setBatchNote(
        `完成：成功 ${result.succeeded}，失败 ${result.failed}`
      )
      if (result.failed > 0) {
        orca.notify(
          "warn",
          `部分制卡失败（${result.failed}），可重试未成功项`,
          { title: "章末小测" }
        )
      } else if (result.succeeded > 0) {
        orca.notify("success", CHAPTER_QUIZ_COPY.basicAdded, {
          title: "章末小测"
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[章末小测] 整理薄弱点批量制卡失败:", error)
      setBatchNote(message)
      orca.notify("error", message, { title: "章末小测" })
    } finally {
      setBatchBusy(false)
    }
  }, [
    batchBusy,
    cardAdds,
    onBatchCreate,
    rows,
    updateRow,
    weakQuestions
  ])

  return (
    <section
      className="chapter-quiz-panel__section chapter-quiz-organizer"
      aria-label={CHAPTER_QUIZ_COPY.organizerTitle}
    >
      <div className="chapter-quiz-organizer__header">
        <Button variant="outline" onClick={onBack}>
          {CHAPTER_QUIZ_COPY.backToActionSummary}
        </Button>
        <h2 className="chapter-quiz-organizer__title">
          {CHAPTER_QUIZ_COPY.organizerTitle}
        </h2>
      </div>
      <p className="chapter-quiz__hint">{CHAPTER_QUIZ_COPY.organizerHint}</p>

      <ul className="chapter-quiz-organizer__list">
        {weakQuestions.map((q) => {
          const row = rows[q.id] ?? initialRowState(q, cardAdds)
          const adds = cardAdds?.[q.id]
          const basicDone = Boolean(adds?.basicBlockId)
          const clozeDone = Boolean(adds?.clozeBlockId)
          const canCard = typeof q.sourceBlockId === "number"
          const preview = buildBasicCardFromQuestion(q)
          const isRepaired = repairedIds.has(q.id)
          const busyThis = cardBusyId === q.id || row.clozeBusy === true

          return (
            <li key={q.id} className="chapter-quiz-organizer__row">
              <div className="chapter-quiz-organizer__row-top">
                <label className="chapter-quiz-organizer__check">
                  <input
                    type="checkbox"
                    checked={row.selected === true}
                    disabled={
                      !canCard ||
                      (row.kind === "basic" && basicDone) ||
                      (row.kind === "cloze" && clozeDone) ||
                      batchBusy
                    }
                    onChange={(e) =>
                      updateRow(q.id, {
                        selected: e.currentTarget.checked
                      })
                    }
                    aria-label={`选择：${q.text.slice(0, 40)}`}
                  />
                  <span className="chapter-quiz-organizer__stem">{q.text}</span>
                </label>
                <span
                  className={
                    isRepaired
                      ? "chapter-quiz-organizer__badge is-repaired"
                      : "chapter-quiz-organizer__badge is-unresolved"
                  }
                >
                  {isRepaired
                    ? CHAPTER_QUIZ_COPY.repairedBadge
                    : CHAPTER_QUIZ_COPY.unresolvedBadge}
                </span>
              </div>

              <div className="chapter-quiz-organizer__preview">
                <div className="chapter-quiz-organizer__preview-q">
                  {preview.question}
                </div>
                <div className="chapter-quiz-organizer__preview-a">
                  {preview.answer}
                </div>
              </div>

              {!canCard ? (
                <div className="chapter-quiz__hint">
                  {CHAPTER_QUIZ_COPY.organizerNoSource}
                </div>
              ) : (
                <div
                  className="chapter-quiz-organizer__kinds"
                  role="group"
                  aria-label="卡片类型"
                >
                  <button
                    type="button"
                    className={
                      "chapter-quiz-organizer__kind" +
                      (row.kind === "basic" ? " is-active" : "") +
                      (basicDone ? " is-done" : "")
                    }
                    disabled={basicDone || batchBusy}
                    onClick={() => {
                      void handleToggleKind(q, "basic")
                    }}
                  >
                    {basicDone
                      ? CHAPTER_QUIZ_COPY.organizerAlreadyAdded
                      : CHAPTER_QUIZ_COPY.organizerCardTypeBasic}
                  </button>
                  <button
                    type="button"
                    className={
                      "chapter-quiz-organizer__kind" +
                      (row.kind === "cloze" ? " is-active" : "") +
                      (clozeDone ? " is-done" : "")
                    }
                    disabled={clozeDone || batchBusy || busyThis}
                    onClick={() => {
                      void handleToggleKind(q, "cloze")
                    }}
                  >
                    {clozeDone
                      ? CHAPTER_QUIZ_COPY.organizerAlreadyAdded
                      : row.clozeBusy
                        ? CHAPTER_QUIZ_COPY.clozeGenerating
                        : CHAPTER_QUIZ_COPY.organizerCardTypeCloze}
                  </button>
                </div>
              )}

              {row.kind === "cloze" && row.clozePreview ? (
                <div className="chapter-quiz__cloze-preview">
                  <div className="chapter-quiz__remember-label">
                    {CHAPTER_QUIZ_COPY.clozePreviewTitle}
                  </div>
                  <label className="chapter-quiz__field">
                    全文
                    <textarea
                      className="chapter-quiz__textarea"
                      value={row.clozePreview.text}
                      rows={3}
                      onChange={(e) =>
                        updateRow(q.id, {
                          clozePreview: {
                            ...row.clozePreview!,
                            text: e.currentTarget.value
                          }
                        })
                      }
                    />
                  </label>
                  <label className="chapter-quiz__field">
                    挖空
                    <input
                      className="chapter-quiz__input"
                      value={row.clozePreview.clozeText}
                      onChange={(e) =>
                        updateRow(q.id, {
                          clozePreview: {
                            ...row.clozePreview!,
                            clozeText: e.currentTarget.value
                          }
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}

              {row.kind === "cloze" && row.clozeError ? (
                <div className="chapter-quiz__status chapter-quiz__status--error">
                  {row.clozeError}{" "}
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleRetryCloze(q)
                    }}
                  >
                    {CHAPTER_QUIZ_COPY.retry}
                  </Button>
                </div>
              ) : null}

              {row.createError ? (
                <div className="chapter-quiz__status chapter-quiz__status--error">
                  {row.createError}
                </div>
              ) : null}
              {row.createStatus === "ok" &&
              (basicDone || clozeDone) ? (
                <div className="chapter-quiz__hint">
                  {CHAPTER_QUIZ_COPY.organizerAlreadyAdded}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {weakQuestions.length === 0 ? (
        <div className="chapter-quiz__hint">本轮无薄弱点可整理。</div>
      ) : null}

      <div className="chapter-quiz-panel__primary">
        <Button
          variant="solid"
          className={
            batchBusy || eligibleCount === 0
              ? "ir-button--blocked chapter-quiz-panel__cta"
              : "chapter-quiz-panel__cta"
          }
          onClick={() => {
            if (batchBusy || eligibleCount === 0) return
            void handleCreate()
          }}
        >
          {batchBusy
            ? CHAPTER_QUIZ_COPY.organizerCreating
            : `${CHAPTER_QUIZ_COPY.organizerCreate} (${eligibleCount})`}
        </Button>
      </div>
      {batchNote ? (
        <div className="chapter-quiz__hint" role="status" aria-live="polite">
          {batchNote}
        </div>
      ) : null}
    </section>
  )
}
