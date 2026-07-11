/**
 * 资料库顶部时间导航带（支持各区段实时统计徽章与互斥单选切换）
 */

import type { IRTimeNavKey } from "./irSourceTreeBuilder"

const React = (window as any).React || (globalThis as any).React

type Props = {
  timeNavKey: IRTimeNavKey
  counts: Record<IRTimeNavKey, number>
  onChange: (key: IRTimeNavKey) => void
}

type NavItemConfig = {
  key: IRTimeNavKey
  label: string
  icon: string
  tone?: "overdue" | "today" | "new"
}

const NAV_ITEMS: NavItemConfig[] = [
  { key: "all", label: "全部资料", icon: "ti-folders" },
  { key: "overdue", label: "已逾期", icon: "ti-alert-circle", tone: "overdue" },
  { key: "today", label: "今天到期", icon: "ti-calendar-event", tone: "today" },
  { key: "tomorrow", label: "明天", icon: "ti-calendar-stats" },
  { key: "upcoming7", label: "未来 7 天", icon: "ti-calendar" },
  { key: "later", label: "7 天后", icon: "ti-clock" },
  { key: "new", label: "新卡 (待读)", icon: "ti-sparkles", tone: "new" }
]

export default function IRTimeNavigationBar({
  timeNavKey,
  counts,
  onChange
}: Props) {
  return (
    <nav className="ir-time-nav-bar" aria-label="到期时间导航">
      <div className="ir-time-nav-bar__list" role="tablist">
        {NAV_ITEMS.map((item) => {
          const count = counts[item.key] ?? 0
          const isActive = timeNavKey === item.key
          const isZero = count === 0 && item.key !== "all"

          let toneClass = ""
          if (item.tone === "overdue" && count > 0) toneClass = " ir-time-nav-bar__tab--overdue"
          else if (item.tone === "today" && count > 0) toneClass = " ir-time-nav-bar__tab--today"
          else if (item.tone === "new" && count > 0) toneClass = " ir-time-nav-bar__tab--new"

          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ir-time-nav-bar__tab${isActive ? " ir-time-nav-bar__tab--active" : ""}${toneClass}${isZero ? " ir-time-nav-bar__tab--dimmed" : ""}`}
              onClick={() => onChange(item.key)}
            >
              <i className={`ti ${item.icon} ir-time-nav-bar__icon`} aria-hidden="true" />
              <span className="ir-time-nav-bar__label">{item.label}</span>
              <span className={`ir-time-nav-bar__badge${isActive ? " ir-time-nav-bar__badge--active" : ""}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
