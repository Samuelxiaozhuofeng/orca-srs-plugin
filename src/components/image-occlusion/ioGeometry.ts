/**
 * 图片遮罩几何：坐标一律相对「图片内容框」自身（0–1），
 * 不得相对外层可滚动容器（否则滚动/留白会导致复习错位）。
 */

/** 将指针位置映射为相对 el 内容框的 0–1 坐标（含滚动偏移） */
export function clientToRelOnElement(
  clientX: number,
  clientY: number,
  el: HTMLElement
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  // 与指针同一坐标系：优先 getBoundingClientRect（含分数尺寸 / transform）
  const width = rect.width || el.offsetWidth
  const height = rect.height || el.offsetHeight
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0 }
  }
  const x = (clientX - rect.left + el.scrollLeft) / width
  const y = (clientY - rect.top + el.scrollTop) / height
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y))
  }
}

/** region 样式百分比（相对包裹图片的 frame） */
export function regionStylePercent(r: {
  x: number
  y: number
  w: number
  h: number
}): { left: string; top: string; width: string; height: string } {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`
  }
}
