/**
 * 服务设置表单共用：按键冒泡拦截 + 短说明。
 */

export function stopKeys(e: {
  stopPropagation: () => void
  nativeEvent?: { stopImmediatePropagation?: () => void }
}): void {
  e.stopPropagation()
  e.nativeEvent?.stopImmediatePropagation?.()
}

export function stopBubble(e: { stopPropagation: () => void }): void {
  e.stopPropagation()
}

/** 短说明 + 可选「了解更多」展开技术细节 */
export function FieldHint(props: {
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
