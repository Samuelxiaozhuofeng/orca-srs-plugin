type StatCardProps = {
  label: string
  value: number
  color?: string
  onClick?: () => void
  title?: string
  disabled?: boolean
}

export default function StatCard({
  label,
  value,
  color,
  onClick,
  title,
  disabled
}: StatCardProps) {
  const clickable = Boolean(onClick) && !disabled
  const valueStyle = color ? { color } : undefined

  if (clickable) {
    return (
      <button
        type="button"
        className="srs-stat-card srs-stat-card--clickable"
        onClick={onClick}
        title={title}
      >
        <div className="srs-stat-card__value" style={valueStyle}>
          {value}
        </div>
        <div className="srs-stat-card__label">{label}</div>
      </button>
    )
  }

  return (
    <div
      className={`srs-stat-card${disabled ? " srs-stat-card--disabled" : ""}`}
      title={title}
    >
      <div className="srs-stat-card__value" style={valueStyle}>
        {value}
      </div>
      <div className="srs-stat-card__label">{label}</div>
    </div>
  )
}
