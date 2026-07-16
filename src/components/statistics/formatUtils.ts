/**
 * 统计视图格式化工具
 */

/**
 * 格式化时间（毫秒转分钟/小时）
 */
export function formatTime(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}秒`
  }
  if (ms < 3600000) {
    return `${Math.round(ms / 60000)}分钟`
  }
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.round((ms % 3600000) / 60000)
  return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
}

/**
 * 格式化日期为短格式
 */
export function formatDateShort(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}
