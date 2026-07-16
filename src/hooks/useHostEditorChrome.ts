/**
 * 控制复习会话所在 Orca 编辑器的宿主 chrome。
 *
 * 只有调用方明确确认当前会话是 panel 主 block 视图时才允许启用；
 * Journal、查询结果与引用预览中的嵌入会话必须保持关闭。
 */

const { useEffect } = window.React

const CHROME_SELECTORS = [
  ".orca-block-editor-none-editable",
  ".orca-block-editor-go-btns",
  ".orca-block-editor-sidetools",
  ".orca-repr-main-none-editable",
  ".orca-breadcrumb"
]

const BLOCK_UI_SELECTOR = [
  ".orca-block-handle",
  ".orca-repr-handle",
  ".orca-block-bullet",
  '[data-role="bullet"]',
  ".orca-block-drag-handle",
  ".orca-repr-collapse",
  '[class*="collapse"]'
].join(", ")

export function useHostEditorChrome(
  containerRef: React.RefObject<HTMLElement>,
  enabled: boolean,
  maximized: boolean
): void {
  useEffect(() => {
    if (!enabled) return

    const blockEditor = containerRef.current?.closest<HTMLElement>(
      ".orca-block-editor"
    )
    if (!blockEditor) return

    const chromeElements = CHROME_SELECTORS
      .map((selector) => blockEditor.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => element != null)
    const blockUiElements = Array.from(
      blockEditor.querySelectorAll<HTMLElement>(BLOCK_UI_SELECTOR)
    )
    const elements = [...new Set([...chromeElements, ...blockUiElements])]

    // 精确保存宿主原有的 inline 样式，避免 cleanup 把宿主自己的 display 覆盖为空。
    const previousDisplay = new Map(
      elements.map((element) => [element, element.style.display] as const)
    )
    const previousMaximize = blockEditor.getAttribute("maximize")

    if (maximized) {
      blockEditor.setAttribute("maximize", "1")
      elements.forEach((element) => {
        element.style.display = "none"
      })
    } else {
      blockEditor.removeAttribute("maximize")
      elements.forEach((element) => {
        element.style.display = previousDisplay.get(element) ?? ""
      })
    }

    return () => {
      if (previousMaximize == null) {
        blockEditor.removeAttribute("maximize")
      } else {
        blockEditor.setAttribute("maximize", previousMaximize)
      }
      previousDisplay.forEach((display, element) => {
        element.style.display = display
      })
    }
  }, [containerRef, enabled, maximized])
}
