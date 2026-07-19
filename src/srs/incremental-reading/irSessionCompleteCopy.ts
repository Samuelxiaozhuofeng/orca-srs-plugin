/**
 * User-facing success / validation copy for IR session complete actions.
 * Keep product strings centralized for shell import; pure, no side effects.
 */

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
