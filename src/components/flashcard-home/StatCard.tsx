export default function StatCard({
  label,
  value,
  color
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "12px 16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      minWidth: "80px"
    }}>
      <div style={{
        fontSize: "24px",
        fontWeight: 600,
        color: color || "var(--orca-color-text-1)"
      }}>
        {value}
      </div>
      <div style={{
        fontSize: "12px",
        color: "var(--orca-color-text-3)",
        marginTop: "4px"
      }}>
        {label}
      </div>
    </div>
  )
}
