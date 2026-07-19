/**
 * Pure due-status helpers for Flash Home card list frames.
 * No React; safe for unit tests and presentational wiring.
 */

export type CardDueStatus = "new" | "today" | "backlog" | "future"

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Classify a card's due bucket relative to local calendar days.
 * - new: never learned (`isNew`)
 * - backlog: due before start of today
 * - today: due before start of tomorrow
 * - future: otherwise
 */
export function getCardDueStatus(
  card: { isNew: boolean; srs: { due: Date } },
  now: Date = new Date()
): CardDueStatus {
  if (card.isNew) return "new"

  const today = startOfLocalDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const due = card.srs.due
  if (due < today) return "backlog"
  if (due < tomorrow) return "today"
  return "future"
}

/** CSS modifier class for `.srs-card-frame__accent`. */
export function getAccentClass(status: CardDueStatus): string {
  return `srs-card-frame__accent--${status}`
}

/**
 * Relative due description (matches prior CardListItem wording).
 * e.g. "已到期 3 天" / "今天到期" / "5 天后到期"
 */
export function formatDueDate(date: Date, now: Date = new Date()): string {
  const today = startOfLocalDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date < today) {
    const days = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    return `已到期 ${days} 天`
  }
  if (date < tomorrow) {
    return "今天到期"
  }
  const days = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return `${days} 天后到期`
}

/** Concrete next-review calendar label, e.g. "3月15日". */
export function formatNextReviewDate(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

/**
 * Human interval from day count (FSRS-style day units).
 * e.g. "< 1天" / "12天" / "3月" / "1.5年"
 */
export function formatInterval(interval: number): string {
  if (interval < 1) return "< 1天"
  if (interval < 30) return `${Math.round(interval)}天`
  if (interval < 365) return `${Math.round(interval / 30)}月`
  return `${(interval / 365).toFixed(1)}年`
}
