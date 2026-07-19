/**
 * 阅读模式面板内展开：仅操作传入的正文根 DOM，不写后端属性。
 * 运行证据：折叠把手为 `.orca-block-folding-handle`；`ti-caret-down-filled` 表示已展开。
 */

export const IR_READING_FOLDING_HANDLE_SELECTOR = ".orca-block-folding-handle"
export const IR_READING_EXPANDED_CARET_CLASS = "ti-caret-down-filled"
export const IR_READING_CHILDREN_SELECTOR = [
  ".orca-block-children",
  ".orca-repr-children",
  "[data-role='children']",
  "[data-testid='children']"
].join(", ")

export type ExpandReadingBlocksResult = {
  forcedVisible: number
  clickedCollapsed: number
}

/**
 * 判断折叠把手当前是否已展开。
 * 有 caret-down 明确为展开；无该 class 视为可能折叠（可点击）。
 */
export function isFoldingHandleExpanded(handle: Element): boolean {
  return handle.classList.contains(IR_READING_EXPANDED_CARET_CLASS)
}

/**
 * 在阅读正文范围内强制展开：先解除 children 容器隐藏，再只点击未展开的折叠把手。
 * 不调用 setProperties / 不写 block 属性；仅 DOM / 宿主 UI 交互。
 */
export function expandReadingModeBlocks(root: HTMLElement): ExpandReadingBlocksResult {
  let forcedVisible = 0
  root.querySelectorAll<HTMLElement>(IR_READING_CHILDREN_SELECTOR).forEach((node) => {
    const wasHidden =
      node.hidden ||
      node.style.display === "none" ||
      node.style.visibility === "hidden"
    node.style.display = ""
    node.style.visibility = ""
    node.hidden = false
    if (wasHidden) forcedVisible += 1
  })

  let clickedCollapsed = 0
  root.querySelectorAll<HTMLElement>(IR_READING_FOLDING_HANDLE_SELECTOR).forEach((handle) => {
    if (isFoldingHandleExpanded(handle)) return
    handle.click()
    clickedCollapsed += 1
  })

  return { forcedVisible, clickedCollapsed }
}
