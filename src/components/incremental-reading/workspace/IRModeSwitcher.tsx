/**
 * 资料库 / 专注阅读 分段切换
 */

import type { IRWorkspaceMode } from "./irWorkspaceTypes"

type Props = {
  workspaceId: string
  mode: IRWorkspaceMode
  onChange: (mode: IRWorkspaceMode) => void
  readingEnabled?: boolean
}

export default function IRModeSwitcher({ workspaceId, mode, onChange, readingEnabled = true }: Props) {
  const handleKeyDown = (event: React.KeyboardEvent, nextMode: IRWorkspaceMode) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    onChange(nextMode)
    event.currentTarget.parentElement
      ?.querySelector<HTMLElement>(`[data-ir-mode="${nextMode}"]`)
      ?.focus()
  }

  return (
    <div className="ir-mode-switcher" role="tablist" aria-label="渐进阅读模式">
      <button
        type="button"
        role="tab"
        className="ir-mode-switcher__btn"
        aria-selected={mode === "library"}
        aria-controls={`${workspaceId}-library-panel`}
        tabIndex={mode === "library" ? 0 : -1}
        id={`${workspaceId}-mode-library`}
        data-ir-mode="library"
        onClick={() => onChange("library")}
        onKeyDown={(event) => handleKeyDown(event, "reading")}
      >
        资料库
      </button>
      <button
        type="button"
        role="tab"
        className="ir-mode-switcher__btn"
        aria-selected={mode === "reading"}
        aria-controls={`${workspaceId}-reading-panel`}
        tabIndex={mode === "reading" ? 0 : -1}
        id={`${workspaceId}-mode-reading`}
        data-ir-mode="reading"
        disabled={!readingEnabled}
        onClick={() => onChange("reading")}
        onKeyDown={(event) => handleKeyDown(event, "library")}
      >
        专注阅读
      </button>
    </div>
  )
}
