/**
 * 根据真实停留时间校准成本估算（阶段 4）
 *
 * 注意：不从 irQueuePolicy 导入，避免循环依赖。
 */

import type { IRCard } from "../incrementalReadingCollector"

export type DwellSample = {
  cardType: "topic" | "extracts"
  isLong: boolean
  dwellMs: number
}

const samples: DwellSample[] = []
const MAX_SAMPLES = 200

function staticBaselineSeconds(card: IRCard): number {
  if (card.cardType === "extracts") {
    return card.isNew || card.readCount <= 1 ? 30 : 60
  }
  return card.isNew || card.readCount <= 1 ? 90 : 180
}

export function recordDwellSample(sample: DwellSample): void {
  samples.push(sample)
  if (samples.length > MAX_SAMPLES) samples.shift()
}

export function clearDwellSamplesForTests(): void {
  samples.length = 0
}

function average(list: number[]): number | null {
  if (list.length === 0) return null
  return list.reduce((a, b) => a + b, 0) / list.length
}

/**
 * 返回校准后的秒数；样本不足时回退静态估算
 */
export function estimateCardCostSecondsCalibrated(card: IRCard): number {
  const baseline = staticBaselineSeconds(card)
  const isLong = !card.isNew && card.readCount > 1
  const matched = samples
    .filter(s => s.cardType === card.cardType && s.isLong === isLong)
    .map(s => s.dwellMs / 1000)

  const avg = average(matched)
  if (avg == null || matched.length < 3) return baseline

  return Math.round(baseline * 0.4 + avg * 0.6)
}

export function getDwellSampleCount(): number {
  return samples.length
}
