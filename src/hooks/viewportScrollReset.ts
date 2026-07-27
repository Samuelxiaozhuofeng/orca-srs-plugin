/**
 * 视图切换归零：把「真实纵向滚动 owner」滚回顶部。
 *
 * 运行时常见形态是插件内部滚动节点随内容撑开（本地无滚动范围），
 * 而 host `.orca-block-editor` 祖先才是实际滚动容器。视图整体替换
 * （完成页 / 切换到下一张卡）时该祖先的 scrollTop 不会自己回到顶部，
 * 用户就会停在上一张长卡片的阅读位置，需要手动上滚才能看到新视图。
 *
 * 与断点恢复复用同一个 owner 解析（`resolveVerticalScrollOwner`），
 * 不硬编码宿主类名。
 */

import { resolveVerticalScrollOwner } from "./irBreakpointViewport"

export type ViewportScrollResetOptions = {
  /**
   * 是否允许归零 `start` 之外的祖先 owner（通常是 host `.orca-block-editor`）。
   * 嵌入 Journal「当日创建的」/ 查询结果 / 引用预览时必须显式传 false：
   * 那些场景滚动的是外层宿主内容，插件不得替用户滚动它。
   * 默认 true：与断点恢复的切卡归零一致（会话即 panel 主视图）。
   */
  allowAncestorOwner?: boolean
}

/**
 * 从 `start` 起解析真实纵向滚动 owner 并归零，返回被归零的 owner
 * （无节点或祖先 owner 被禁用时返回 null）。
 *
 * owner 为祖先时同时把 `start` 自身归零（内部节点可能有残留滚动）。
 * 已在顶部时不写入，避免触发无意义的 scroll 事件。
 */
export function resetViewportScrollTop(
  start: HTMLElement | null | undefined,
  options?: ViewportScrollResetOptions
): HTMLElement | null {
  if (!start) return null

  const owner = resolveVerticalScrollOwner(start)
  if (start.scrollTop !== 0) start.scrollTop = 0
  if (!owner || owner === start) return start

  if (options?.allowAncestorOwner === false) return null
  if (owner.scrollTop !== 0) owner.scrollTop = 0
  return owner
}
