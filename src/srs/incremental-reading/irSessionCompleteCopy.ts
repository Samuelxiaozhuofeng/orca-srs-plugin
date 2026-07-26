/**
 * User-facing success / validation copy for IR session complete actions.
 * Keep product strings centralized for shell import; pure, no side effects.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function formatNonSequentialCompleteSuccess(): string {
  return "已完成"
}

export function formatItemizeStaySuccess(): string {
  return "已创建填空卡"
}

export function formatItemizeNeedSelection(): string {
  return "请先选择要挖空的文本"
}

export function formatItemizeNeedInExtract(): string {
  return "请在当前摘录正文中选择要挖空的文本"
}

export function formatQAStaySuccess(): string {
  return "已创建问答卡"
}

export function formatQANeedAnswerChild(): string {
  return "问答卡需要答案子块：请先在摘录下添加答案"
}

export function formatDirectionStaySuccess(): string {
  return "已创建方向卡"
}

export function formatDirectionNeedCursor(): string {
  return "请在当前摘录正文中放置光标（左侧为问、右侧为答）"
}

export function formatDirectionNeedInExtract(): string {
  return "请在当前摘录正文中放置光标以分隔问答"
}

/**
 * 新摘录排期信任反馈：告诉用户大约几天后回来（区间），并提示已错峰。
 * due 无效或已到期 → 保守文案，不假装精确。
 */
export function formatExtractCreatedScheduleMessage(
  due: Date | null | undefined,
  now: Date = new Date()
): string {
  if (!(due instanceof Date) || !Number.isFinite(due.getTime())) {
    return "已摘录，将按阅读节奏安排再次出现"
  }
  const offsetDays = (due.getTime() - now.getTime()) / DAY_MS
  if (offsetDays < 0.25) {
    return "已摘录，将很快进入今日或近期队列（已与本章其他摘录错开）"
  }
  const lo = Math.max(1, Math.floor(offsetDays))
  const hi = Math.max(lo, Math.ceil(offsetDays))
  if (lo === hi) {
    return `已摘录，大约 ${lo} 天后会再出现（已与本章其他摘录错开）`
  }
  return `已摘录，大约 ${lo}–${hi} 天后会再出现（已与本章其他摘录错开）`
}
