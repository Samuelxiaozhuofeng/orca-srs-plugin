/**
 * 工作区顶栏：品牌、模式、状态、工具入口
 */

import type { IRWorkspaceMode } from "./irWorkspaceTypes"
import IRModeSwitcher from "./IRModeSwitcher"

const { Button } = orca.components

type Props = {
  workspaceId: string
  mode: IRWorkspaceMode
  statusLabel: string
  onModeChange: (mode: IRWorkspaceMode) => void
  onOpenFilters: () => void
  onOpenSettings: () => void
  onOpenQueue?: () => void
  onRefresh: () => void
  onClose: () => void
  filtersActive?: boolean
  showQueue?: boolean
}

export default function IRWorkspaceHeader({
  workspaceId,
  mode,
  statusLabel,
  onModeChange,
  onOpenFilters,
  onOpenSettings,
  onOpenQueue,
  onRefresh,
  onClose,
  filtersActive = false,
  showQueue = false
}: Props) {
  return (
    <header className="ir-workspace-header">
      <div className="ir-workspace-header__brand">渐进阅读</div>
      <IRModeSwitcher workspaceId={workspaceId} mode={mode} onChange={onModeChange} />
      <div className="ir-workspace-header__status" aria-live="polite">
        {statusLabel}
      </div>
      <div className="ir-workspace-header__spacer" />
      <div className="ir-workspace-header__actions">
        {mode === "library" ? (
          <button
            type="button"
            className="ir-icon-btn"
            title="筛选"
            aria-label="打开筛选"
            aria-pressed={filtersActive}
            onClick={onOpenFilters}
          >
            <i className="ti ti-filter" aria-hidden="true" />
          </button>
        ) : null}
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
          title="刷新"
          aria-label="刷新"
          onClick={onRefresh}
        >
          <i className="ti ti-refresh" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ir-icon-btn"
          title="设置"
          aria-label="打开设置"
          onClick={onOpenSettings}
        >
          <i className="ti ti-settings" aria-hidden="true" />
        </button>
        <Button variant="plain" onClick={onClose} title="关闭" aria-label="关闭渐进阅读">
          关闭
        </Button>
      </div>
    </header>
  )
}
