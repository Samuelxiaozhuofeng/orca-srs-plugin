/**
 * 工作区顶栏：品牌、模式、状态、工具入口
 */

import type { IRWorkspaceMode } from "./irWorkspaceTypes"
import IRModeSwitcher from "./IRModeSwitcher"

type Props = {
  workspaceId: string
  mode: IRWorkspaceMode
  statusLabel: string
  onModeChange: (mode: IRWorkspaceMode) => void
  onOpenSettings: () => void
  onOpenQueue?: () => void
  onRefresh: () => void
  onClose: () => void
  showQueue?: boolean
}

export default function IRWorkspaceHeader({
  workspaceId,
  mode,
  statusLabel,
  onModeChange,
  onOpenSettings,
  onOpenQueue,
  onRefresh,
  onClose,
  showQueue = false
}: Props) {
  return (
    <header className="ir-workspace-header">
      <div className="ir-workspace-header__brand">
        <i className="ti ti-book-2 ir-workspace-header__brand-icon" aria-hidden="true" />
        <span>渐进阅读</span>
      </div>
      <IRModeSwitcher workspaceId={workspaceId} mode={mode} onChange={onModeChange} />
      <div className="ir-workspace-header__status" aria-live="polite">
        {statusLabel}
      </div>
      <div className="ir-workspace-header__spacer" />
      <div className="ir-workspace-header__actions">
        {showQueue && onOpenQueue ? (
          <button
            type="button"
            className="ir-icon-btn"
            title="阅读队列"
            aria-label="打开阅读队列"
            onClick={onOpenQueue}
          >
            <i className="ti ti-list" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="ir-icon-btn"
          title="刷新数据"
          aria-label="刷新"
          onClick={onRefresh}
        >
          <i className="ti ti-refresh" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ir-icon-btn"
          title="面板设置"
          aria-label="打开设置"
          onClick={onOpenSettings}
        >
          <i className="ti ti-settings" aria-hidden="true" />
        </button>
        <div className="ir-workspace-header__divider" aria-hidden="true" />
        <button
          type="button"
          className="ir-icon-btn ir-close-btn"
          onClick={onClose}
          title="关闭渐进阅读面板"
          aria-label="关闭渐进阅读"
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
