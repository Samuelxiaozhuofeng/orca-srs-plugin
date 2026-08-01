/**
 * Extract 处理建议（AI 摘录教练）虚拟块。
 *
 * 渲染在摘录正文底部：自动（300ms 防抖）分析摘录及其有界上下文，
 * 展示 1 句核心价值 + 最多 3 条处理建议。只读不写，AI 输出仅会话内缓存。
 *
 * 生命周期：切卡/关闭/禁用立即取消（AbortController + 递增 token 双保险，
 * 旧结果不得覆盖新卡）；「重新生成」绕过缓存；「隐藏」仅影响当前 Extract，
 * 本会话内重新进入仍保持隐藏。
 */

import type { DbId } from "../../orca.d.ts"
import {
  acceptResultIfCurrent,
  EXTRACT_COACH_DEBOUNCE_MS,
  generateExtractCoachSuggestion,
  hideExtractCoach,
  isExtractCoachHidden,
  type ExtractCoachActionKind,
  type ExtractCoachResult
} from "../../srs/ai/aiExtractCoach"
import { createRequestTokenGuard } from "../../srs/ai/aiRequestToken"
import {
  resolveExtractCoachView,
  type ExtractCoachView
} from "./irExtractCoachView"

const { useEffect, useRef, useState, useCallback } = window.React

const ACTION_KIND_LABELS: Record<ExtractCoachActionKind, string> = {
  cloze: "挖空",
  question: "提问",
  example: "举例",
  counterpoint: "反驳",
  connect: "关联",
  done: "完成"
}

export type ExtractCoachProps = {
  cardId: DbId
  pluginName: string
  /** 功能开关（来自渐进阅读设置 enableExtractCoach）；关闭时不渲染也不请求。 */
  enabled: boolean
  sourceTopicId?: DbId
}

type CoachState =
  | { status: "idle"; view: null; errorMessage: null }
  | { status: "loading"; view: null; errorMessage: null }
  | { status: "no-key"; view: null; errorMessage: null }
  | { status: "error"; view: null; errorMessage: string }
  | { status: "done" | "ready"; view: ExtractCoachView; errorMessage: null }

function renderExtractCoachReady(
  view: ExtractCoachView,
  onRegenerate: () => void,
  onHide: () => void
) {
  if (view.status !== "ready") return null
  return (
    <div className="ir-extract-coach__body">
      <div className="ir-extract-coach__insight">
        <i className="ti ti-sparkles" aria-hidden="true" />
        <span>{view.insight}</span>
      </div>
      <ul className="ir-extract-coach__actions">
        {view.actions.map((action, index) => (
          <li
            key={index}
            className={`ir-extract-coach__action ir-extract-coach__action--${action.kind}`}
          >
            {action.kind === "done" ? (
              <span className="ir-extract-coach__done-note">
                {action.title}
                {action.detail ? ` — ${action.detail}` : ""}
              </span>
            ) : (
              <>
                <div className="ir-extract-coach__action-head">
                  <span className="ir-extract-coach__kind">
                    {ACTION_KIND_LABELS[action.kind]}
                  </span>
                  <span className="ir-extract-coach__action-title">
                    {action.title}
                  </span>
                </div>
                <div className="ir-extract-coach__action-detail">
                  {action.detail}
                </div>
                {action.quote ? (
                  <div className="ir-extract-coach__quote">
                    可挖空：{action.quote}
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="ir-extract-coach__foot">
        <button
          type="button"
          className="ir-extract-coach__btn"
          onClick={onRegenerate}
        >
          <i className="ti ti-refresh" aria-hidden="true" />
          重新生成
        </button>
        <button
          type="button"
          className="ir-extract-coach__icon-btn"
          onClick={onHide}
          aria-label="隐藏摘录处理建议"
          title="隐藏"
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default function IRExtractCoach({
  cardId,
  pluginName,
  enabled,
  sourceTopicId
}: ExtractCoachProps) {
  const [hidden, setHidden] = useState<boolean>(() => isExtractCoachHidden(cardId))
  const [state, setState] = useState<CoachState>({
    status: "idle",
    view: null,
    errorMessage: null
  })
  const guardRef = useRef(createRequestTokenGuard())
  const controllerRef = useRef<AbortController | null>(null)

  // 切卡时重置展示状态；重新进入同一 Extract 时保持本会话内的隐藏状态
  useEffect(() => {
    setHidden(isExtractCoachHidden(cardId))
    setState({ status: "idle", view: null, errorMessage: null })
  }, [cardId])

  const run = useCallback(
    (force: boolean) => {
      const controller = new AbortController()
      controllerRef.current = controller
      const token = guardRef.current.next()
      setState({ status: "loading", view: null, errorMessage: null })
      void generateExtractCoachSuggestion({
        pluginName,
        cardId,
        sourceTopicId,
        force,
        signal: controller.signal
      })
        .then((result: ExtractCoachResult) => {
          const applied = acceptResultIfCurrent(guardRef.current, token, result)
          if (!applied.applied) return
          const value = applied.value
          if (value.ok) {
            const view = resolveExtractCoachView(value.suggestion)
            setState({ status: view.status, view, errorMessage: null })
          } else if (value.error.code === "NO_API_KEY") {
            setState({ status: "no-key", view: null, errorMessage: null })
          } else if (value.error.code === "CANCELLED") {
            setState({ status: "idle", view: null, errorMessage: null })
          } else {
            setState({
              status: "error",
              view: null,
              errorMessage: value.error.message
            })
          }
        })
        .catch(() => {
          if (!guardRef.current.isCurrent(token)) return
          setState({
            status: "error",
            view: null,
            errorMessage: "摘录分析失败"
          })
        })
    },
    [pluginName, cardId, sourceTopicId]
  )

  // 自动触发：入场约 300ms 后请求；切卡/关闭/禁用立即取消。
  // 注意：不依赖 state，避免加载态变化触发 cleanup 误杀在途请求。
  useEffect(() => {
    if (!enabled || hidden) {
      guardRef.current.invalidate()
      controllerRef.current?.abort()
      controllerRef.current = null
      return
    }

    const timer = window.setTimeout(() => {
      run(false)
    }, EXTRACT_COACH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      guardRef.current.invalidate()
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [cardId, sourceTopicId, enabled, hidden, run])

  const handleRegenerate = () => run(true)
  const handleRetry = () => run(false)
  const handleHide = () => {
    hideExtractCoach(cardId)
    setHidden(true)
  }

  if (!enabled || hidden) return null

  return (
    <div
      className="ir-extract-coach"
      data-status={state.status}
      role="region"
      aria-label="摘录处理建议"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {state.status === "loading" ? (
        <div className="ir-extract-coach__status">
          <i className="ti ti-loader-2 ir-extract-coach__spinner" aria-hidden="true" />
          <span>AI 正在分析摘录…</span>
        </div>
      ) : null}

      {state.status === "no-key" ? (
        <div className="ir-extract-coach__hint">
          <i className="ti ti-sparkles" aria-hidden="true" />
          <span>未配置 AI，请在「AI 服务设置」中配置后使用</span>
          <button
            type="button"
            className="ir-extract-coach__icon-btn"
            onClick={handleHide}
            aria-label="隐藏摘录处理建议"
            title="隐藏"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="ir-extract-coach__error" role="alert">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <span>{state.errorMessage || "摘录分析失败"}</span>
          <div className="ir-extract-coach__actions">
            <button
              type="button"
              className="ir-extract-coach__btn ir-extract-coach__btn--primary"
              onClick={handleRetry}
            >
              <i className="ti ti-refresh" aria-hidden="true" />
              重试
            </button>
            <button
              type="button"
              className="ir-extract-coach__icon-btn"
              onClick={handleHide}
              aria-label="隐藏摘录处理建议"
              title="隐藏"
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {state.status === "done" && state.view?.status === "done" ? (
        <div className="ir-extract-coach__body">
          <div className="ir-extract-coach__insight">
            <i className="ti ti-check" aria-hidden="true" />
            <span>{state.view.insight}</span>
          </div>
          <div className="ir-extract-coach__foot">
            <span className="ir-extract-coach__done-note">
              无需进一步加工，可继续阅读
            </span>
            <button
              type="button"
              className="ir-extract-coach__icon-btn"
              onClick={handleHide}
              aria-label="隐藏摘录处理建议"
              title="隐藏"
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {state.status === "ready" && state.view
        ? renderExtractCoachReady(state.view, handleRegenerate, handleHide)
        : null}
    </div>
  )
}
