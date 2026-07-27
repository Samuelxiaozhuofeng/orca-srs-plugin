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
  /**
   * mixed 当前为普通复习卡：收起「渐进阅读」品牌 / 模式切换 / 状态文案，
   * 只保留队列与关闭等必要动作，降低阅读 chrome 干扰。
   */
  reviewFocus?: boolean
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
  showQueue = false,
  reviewFocus = false
}: Props) {
  return (
    <header
      className={
        reviewFocus
          ? "ir-workspace-header ir-workspace-header--review-focus"
          : "ir-workspace-header"
      }
    >
      {!reviewFocus ? (
        <>
          <div className="ir-workspace-header__brand">
            <i className="ti ti-book-2 ir-workspace-header__brand-icon" aria-hidden="true" />
            <span>渐进阅读</span>
          </div>
          <IRModeSwitcher workspaceId={workspaceId} mode={mode} onChange={onModeChange} />
          <div className="ir-workspace-header__status" aria-live="polite">
            {statusLabel}
          </div>
        </>
      ) : (
        <div className="ir-workspace-header__brand ir-workspace-header__brand--review">
          <i className="ti ti-cards ir-workspace-header__brand-icon" aria-hidden="true" />
          <span>记忆复习</span>
        </div>
      )}
      <div className="ir-workspace-header__spacer" />
      <div className="ir-workspace-header__actions">
        {showQueue && onOpenQueue ? (
          <button
            type="button"
            className="ir-icon-btn"
            title="学习队列"
            aria-label="打开学习队列"
            onClick={onOpenQueue}
          >
            <i className="ti ti-list" aria-hidden="true" />
          </button>
        ) : null}
        {!reviewFocus ? (
          <>
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
          </>
        ) : null}
        <button
          type="button"
          className="ir-icon-btn ir-close-btn"
          onClick={onClose}
          title={reviewFocus ? "关闭学习面板" : "关闭渐进阅读面板"}
          aria-label={reviewFocus ? "关闭学习面板" : "关闭渐进阅读"}
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
