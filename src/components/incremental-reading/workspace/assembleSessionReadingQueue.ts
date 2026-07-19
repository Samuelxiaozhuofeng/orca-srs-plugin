/**
 * 会话阅读队列装配（纯函数）：focus 插队 + dailyLimit 截断。
 * 不写 block 属性；供时间盒会话加载与确定性回归测试共用。
 */

import type { IRCard } from "../../../srs/incrementalReadingCollector"

export type AssembleSessionReadingQueueOptions = {
  /** policy 选出的纯 IR 阅读队列（通常已受预算与 dailyLimit 约束） */
  policyQueue: IRCard[]
  /** 已解析的 focus 卡；null/undefined 表示无 focus */
  focusCard?: IRCard | null
  /**
   * 单次时间盒队列硬上限；`0` 表示不截断。
   * 仅在插入 focus 后可能使队列变长时再截断，保留 policy 原有截断语义。
   */
  dailyLimit: number
}

/**
 * 将 focus 冻结到最终阅读队列首位（若存在），并按 dailyLimit 截断。
 * focus 不在 policy 队列中时也会进入首位。
 */
export function assembleSessionReadingQueue(
  options: AssembleSessionReadingQueueOptions
): IRCard[] {
  const { policyQueue, focusCard, dailyLimit } = options
  if (!focusCard) {
    return policyQueue
  }

  const without = policyQueue.filter((c) => c.id !== focusCard.id)
  let queue = [focusCard, ...without]
  if (dailyLimit > 0 && queue.length > dailyLimit) {
    queue = queue.slice(0, dailyLimit)
  }
  return queue
}
