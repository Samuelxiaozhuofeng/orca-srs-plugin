/**
 * 渐进阅读断点：交互捕获（mouseup/keyup debounce → captureNow）守卫。
 *
 * 背景（切卡竞态）：keydown 触发「下一篇」会先 flush 正确断点，但随后的 keyup
 * 仍会 scheduleCapture 重新武装 debounce 定时器，闭包携带旧 cardId；定时器到期时
 * DOM 可能已切到新卡，若不校验就会把新卡可见块持久化为旧卡 resumeBlockId，
 * 覆盖 flush 刚写入的正确断点。
 *
 * 语义与 scroll 路径的 shouldAllowScrollVisibleCapture（irBreakpointRestore.ts）
 * 对齐：闭包 cardId 与当前活动 cardId 任一为空或不一致时，丢弃本次捕获。
 * 交互路径没有 scroll suppression 维度，故固定传 suppressActive: false。
 */

import type { DbId } from "../orca.d.ts"
import { shouldAllowScrollVisibleCapture } from "./irBreakpointRestore"

/** 交互捕获 debounce 时长（mouseup/keyup → captureNow） */
export const INTERACTIVE_CAPTURE_DEBOUNCE_MS = 180

export function shouldAllowInteractiveCapture(options: {
  /** 捕获闭包创建时的 cardId */
  closureCardId: DbId | null
  /** 当前活动卡（hook 内为 activeCardIdRef.current） */
  activeCardId: DbId | null
}): boolean {
  return shouldAllowScrollVisibleCapture({
    suppressActive: false,
    listeningForCardId: options.closureCardId,
    activeCardId: options.activeCardId
  })
}
