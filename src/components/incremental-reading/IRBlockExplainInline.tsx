/**
 * 块下内联：解释 + 写入子块 + 举例/反驳 + 追问
 */

import type { BlockExplanation } from "../../srs/ai/aiBlockExplain"
import { formatTermChildText } from "../../srs/ai/aiBlockExplainWrite"

const { useState, createElement: h } = window.React

export type BlockExplainFollowUpMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

export type SideSectionState = {
  status: "idle" | "loading" | "ready" | "error"
  text: string | null
  errorMessage: string | null
}

export type IRBlockExplainInlineProps = {
  status: "loading" | "ready" | "error"
  explanation: BlockExplanation | null
  errorMessage: string | null
  focusPreview: string | null
  example: SideSectionState
  rebuttal: SideSectionState
  followUps: BlockExplainFollowUpMessage[]
  followUpBusy: boolean
  followUpError: string | null
  /** normalized child texts already written (or known duplicates) */
  writtenNormalized: string[]
  writingKey: string | null
  onClose: () => void
  onCancel: () => void
  onRetry: () => void
  onWriteText: (text: string) => void
  onExample: () => void
  onRebuttal: () => void
  onFollowUp: (question: string) => void
}

function PlusButton(props: {
  label: string
  disabled: boolean
  written: boolean
  onClick: () => void
}) {
  const { label, disabled, written, onClick } = props
  return h(
    "button",
    {
      type: "button",
      className: written
        ? "ir-block-explain__plus ir-block-explain__plus--done"
        : "ir-block-explain__plus",
      title: written ? "已添加" : label,
      "aria-label": written ? "已添加" : label,
      disabled: disabled || written,
      onClick: (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!written) onClick()
      }
    },
    written ? "✓" : "+"
  )
}

function isWritten(writtenNormalized: string[], text: string): boolean {
  const n = text.replace(/\s+/g, " ").trim()
  return writtenNormalized.includes(n)
}

export default function IRBlockExplainInline({
  status,
  explanation,
  errorMessage,
  focusPreview,
  example,
  rebuttal,
  followUps,
  followUpBusy,
  followUpError,
  writtenNormalized,
  writingKey,
  onClose,
  onCancel,
  onRetry,
  onWriteText,
  onExample,
  onRebuttal,
  onFollowUp
}: IRBlockExplainInlineProps) {
  const [draft, setDraft] = useState("")

  const busyWrite = writingKey != null

  return h(
    "div",
    {
      className: "ir-block-explain",
      role: "region",
      "aria-label": "块解释",
      onMouseDown: (e: MouseEvent) => e.stopPropagation(),
      onClick: (e: MouseEvent) => e.stopPropagation()
    },
    h(
      "div",
      { className: "ir-block-explain__head" },
      h(
        "div",
        { className: "ir-block-explain__title" },
        focusPreview ? "讲清楚选区" : "讲清楚这块",
        h(
          "span",
          { className: "ir-block-explain__meta" },
          "「+」写入子块"
        )
      ),
      h(
        "button",
        {
          type: "button",
          className: "ir-block-explain__icon-btn",
          onClick: onClose,
          "aria-label": "关闭解释"
        },
        "×"
      )
    ),
    focusPreview
      ? h("div", { className: "ir-block-explain__quote" }, focusPreview)
      : null,
    status === "loading"
      ? h(
          "div",
          { className: "ir-block-explain__loading" },
          "正在生成解释…",
          h(
            "button",
            {
              type: "button",
              className: "ir-block-explain__btn",
              onClick: onCancel
            },
            "取消"
          )
        )
      : null,
    status === "error"
      ? h(
          "div",
          { className: "ir-block-explain__error", role: "alert" },
          errorMessage || "解释失败",
          h(
            "div",
            { className: "ir-block-explain__actions" },
            h(
              "button",
              {
                type: "button",
                className: "ir-block-explain__btn ir-block-explain__btn--primary",
                onClick: onRetry
              },
              "重试"
            ),
            h(
              "button",
              {
                type: "button",
                className: "ir-block-explain__btn",
                onClick: onClose
              },
              "关闭"
            )
          )
        )
      : null,
    status === "ready" && explanation
      ? h(
          "div",
          { className: "ir-block-explain__body" },
          // 白话
          h(
            "div",
            { className: "ir-block-explain__card" },
            h(
              "div",
              { className: "ir-block-explain__label-row" },
              h("div", { className: "ir-block-explain__label" }, "白话"),
              h(PlusButton, {
                label: "把白话写入子块",
                disabled: busyWrite,
                written: isWritten(writtenNormalized, explanation.paraphrase),
                onClick: () => onWriteText(explanation.paraphrase)
              })
            ),
            h("div", null, explanation.paraphrase)
          ),
          // 名词
          explanation.terms.length > 0
            ? h(
                "div",
                { className: "ir-block-explain__card" },
                h("div", { className: "ir-block-explain__label" }, "名词"),
                h(
                  "ul",
                  { className: "ir-block-explain__terms" },
                  explanation.terms.map((t) => {
                    const line = formatTermChildText(t.term, t.gloss)
                    return h(
                      "li",
                      { key: t.term, className: "ir-block-explain__term-row" },
                      h(
                        "span",
                        { className: "ir-block-explain__term-text" },
                        h("strong", null, t.term),
                        " — ",
                        t.gloss
                      ),
                      h(PlusButton, {
                        label: `写入「${t.term}」`,
                        disabled: busyWrite,
                        written: isWritten(writtenNormalized, line),
                        onClick: () => onWriteText(line)
                      })
                    )
                  })
                )
              )
            : null,
          // 举例 / 反驳
          h(
            "div",
            { className: "ir-block-explain__actions" },
            h(
              "button",
              {
                type: "button",
                className: "ir-block-explain__btn",
                disabled: example.status === "loading" || followUpBusy,
                onClick: onExample
              },
              example.status === "loading" ? "举例生成中…" : "举例说明"
            ),
            h(
              "button",
              {
                type: "button",
                className: "ir-block-explain__btn",
                disabled: rebuttal.status === "loading" || followUpBusy,
                onClick: onRebuttal
              },
              rebuttal.status === "loading" ? "反驳生成中…" : "反驳"
            )
          ),
          example.status === "error"
            ? h(
                "div",
                { className: "ir-block-explain__error" },
                example.errorMessage || "举例失败"
              )
            : null,
          example.status === "ready" && example.text
            ? h(
                "div",
                { className: "ir-block-explain__card" },
                h(
                  "div",
                  { className: "ir-block-explain__label-row" },
                  h("div", { className: "ir-block-explain__label" }, "举例"),
                  h(PlusButton, {
                    label: "把举例写入子块",
                    disabled: busyWrite,
                    written: isWritten(writtenNormalized, example.text),
                    onClick: () => onWriteText(example.text!)
                  })
                ),
                h("div", null, example.text)
              )
            : null,
          rebuttal.status === "error"
            ? h(
                "div",
                { className: "ir-block-explain__error" },
                rebuttal.errorMessage || "反驳失败"
              )
            : null,
          rebuttal.status === "ready" && rebuttal.text
            ? h(
                "div",
                { className: "ir-block-explain__card" },
                h(
                  "div",
                  { className: "ir-block-explain__label-row" },
                  h("div", { className: "ir-block-explain__label" }, "反驳"),
                  h(PlusButton, {
                    label: "把反驳写入子块",
                    disabled: busyWrite,
                    written: isWritten(writtenNormalized, rebuttal.text),
                    onClick: () => onWriteText(rebuttal.text!)
                  })
                ),
                h("div", null, rebuttal.text)
              )
            : null,
          // 追问
          h(
            "div",
            { className: "ir-block-explain__card ir-block-explain__follow" },
            h("div", { className: "ir-block-explain__label" }, "追问"),
            followUps.length > 0
              ? h(
                  "div",
                  { className: "ir-block-explain__chat" },
                  followUps.map((m) =>
                    h(
                      "div",
                      {
                        key: m.id,
                        className:
                          m.role === "user"
                            ? "ir-block-explain__msg ir-block-explain__msg--user"
                            : "ir-block-explain__msg ir-block-explain__msg--assistant"
                      },
                      h(
                        "div",
                        { className: "ir-block-explain__msg-role" },
                        m.role === "user" ? "你" : "助教"
                      ),
                      h("div", null, m.content),
                      m.role === "assistant"
                        ? h(
                            "div",
                            { className: "ir-block-explain__msg-actions" },
                            h(
                              "button",
                              {
                                type: "button",
                                className: "ir-block-explain__btn ir-block-explain__btn--small",
                                disabled:
                                  busyWrite ||
                                  isWritten(writtenNormalized, m.content),
                                onClick: () => onWriteText(m.content)
                              },
                              isWritten(writtenNormalized, m.content)
                                ? "已写入"
                                : "把这句回答写入"
                            )
                          )
                        : null
                    )
                  )
                )
              : h(
                  "div",
                  { className: "ir-block-explain__hint" },
                  "可针对本块与上方解释继续提问"
                ),
            followUpError
              ? h(
                  "div",
                  { className: "ir-block-explain__error" },
                  followUpError
                )
              : null,
            h(
              "div",
              { className: "ir-block-explain__composer" },
              h("textarea", {
                className: "ir-block-explain__input",
                rows: 2,
                placeholder: "输入追问…",
                value: draft,
                disabled: followUpBusy,
                onChange: (e: { target: { value: string } }) =>
                  setDraft(e.target.value),
                onKeyDown: (e: KeyboardEvent) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    const q = draft.trim()
                    if (!q || followUpBusy) return
                    setDraft("")
                    onFollowUp(q)
                  }
                }
              }),
              h(
                "button",
                {
                  type: "button",
                  className: "ir-block-explain__btn ir-block-explain__btn--primary",
                  disabled: followUpBusy || !draft.trim(),
                  onClick: () => {
                    const q = draft.trim()
                    if (!q || followUpBusy) return
                    setDraft("")
                    onFollowUp(q)
                  }
                },
                followUpBusy ? "回答中…" : "发送"
              )
            )
          )
        )
      : null
  )
}
